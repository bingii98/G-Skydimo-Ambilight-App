const { withBindings } = require("@stoprocent/noble");
const {
  aggregatePixelsToRgb,
  isLotusServiceUuid,
  hasLotusServiceData,
  shouldIncludeBleDevice,
  MIN_COMMAND_GAP_MS,
  sleep,
  clampByte,
  scaleRgbByBrightness,
} = require("./services/lotusLampProtocol");
const { resolveBleProfile, uuidMatches } = require("./services/elkBleProfiles");

const SCAN_DURATION_MS = 20000;

function createNoble() {
  if (process.platform === "win32") {
    return withBindings("win");
  }
  if (process.platform === "darwin") {
    return withBindings("mac");
  }
  return withBindings("default");
}

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

class ExternalLedConnection {
  constructor({ id, manager }) {
    this.id = id;
    this.manager = manager;
    this.peripheral = null;
    this.writeChar = null;
    this.profile = null;
    this.deviceName = "";
    this.connected = false;
    this.connecting = false;
    this.poweredOn = true;
    this.lastCommandAt = 0;
    this.commandQueue = Promise.resolve();
    this.lastRgbKey = "";
    this.lastBrightness = null;
    this.lastPixelBuffer = null;
  }

  attachPeripheral(peripheral) {
    this.peripheral = peripheral;
    this.deviceName = peripheral?.advertisement?.localName || this.deviceName || "";
    this.profile = resolveBleProfile(this.deviceName);
  }

  async connect() {
    if (this.connected || this.connecting || !this.peripheral) {
      return this.connected;
    }

    this.connecting = true;
    this.manager.emitState();

    try {
      if (this.peripheral.state !== "connected") {
        await this.peripheral.connectAsync();
      }

      this.profile = resolveBleProfile(this.deviceName || this.peripheral.advertisement?.localName);
      const services = await this.peripheral.discoverServicesAsync([]);
      let writeChar = null;

      for (const service of services) {
        const characteristics = await service.discoverCharacteristicsAsync([]);
        for (const characteristic of characteristics) {
          const props = characteristic.properties || [];
          const canWrite =
            props.includes("write") ||
            props.includes("writeWithoutResponse") ||
            props.includes("notify");
          if (!canWrite) {
            continue;
          }
          if (uuidMatches(characteristic.uuid, this.profile.writeUuid)) {
            writeChar = characteristic;
            break;
          }
        }
        if (writeChar) {
          break;
        }
      }

      if (!writeChar) {
        for (const service of services) {
          const characteristics = await service.discoverCharacteristicsAsync([]);
          const fallback = characteristics.find((item) => {
            const props = item.properties || [];
            return props.includes("writeWithoutResponse") || props.includes("write");
          });
          if (fallback) {
            writeChar = fallback;
            break;
          }
        }
      }

      if (!writeChar) {
        throw new Error("BLE write characteristic not found on device");
      }

      this.writeChar = writeChar;
      this.connected = true;
      this.lastRgbKey = "";
      this.lastBrightness = null;
      this.lastPixelBuffer = null;
      this.poweredOn = true;

      await this.enqueueWrite(this.profile.buildTurnOn(), { force: true });
      await sleep(150);
      return true;
    } catch (error) {
      this.connected = false;
      this.writeChar = null;
      throw error;
    } finally {
      this.connecting = false;
      this.manager.emitState();
    }
  }

  async disconnect() {
    this.connecting = false;
    this.lastRgbKey = "";
    this.lastBrightness = null;
    this.poweredOn = false;

    if (!this.peripheral) {
      this.connected = false;
      this.writeChar = null;
      return;
    }

    try {
      if (this.peripheral.state === "connected") {
        await this.peripheral.disconnectAsync();
      }
    } catch {
      // Best effort disconnect.
    } finally {
      this.connected = false;
      this.writeChar = null;
      this.manager.emitState();
    }
  }

  enqueueWrite(buffer, options = {}) {
    this.commandQueue = this.commandQueue
      .catch(() => {})
      .then(async () => {
        if (!this.connected || !this.writeChar) {
          return;
        }

        const elapsed = Date.now() - this.lastCommandAt;
        if (!options.force && elapsed < MIN_COMMAND_GAP_MS) {
          await sleep(MIN_COMMAND_GAP_MS - elapsed);
        }

        const withoutResponse = !(this.writeChar.properties || []).includes("write");
        await this.writeChar.writeAsync(buffer, withoutResponse);
        this.lastCommandAt = Date.now();
      });

    return this.commandQueue;
  }

  async setPower(on) {
    if (!this.profile) {
      this.profile = resolveBleProfile(this.deviceName);
    }
    const next = Boolean(on);
    if (next === this.poweredOn) {
      return;
    }

    await this.enqueueWrite(next ? this.profile.buildTurnOn() : this.profile.buildTurnOff(), {
      force: true,
    });
    this.poweredOn = next;
    this.lastRgbKey = "";
    if (next) {
      this.lastBrightness = null;
    }
  }

  async setBrightness(percent) {
    if (!this.profile) {
      this.profile = resolveBleProfile(this.deviceName);
    }
    const next = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (this.lastBrightness === next) {
      return;
    }
    this.lastBrightness = next;
    await this.enqueueWrite(this.profile.buildBrightness(next));
  }

  async setRgb(red, green, blue, brightness = 100) {
    if (!this.profile) {
      this.profile = resolveBleProfile(this.deviceName);
    }

    const raw = {
      red: clampByte(red),
      green: clampByte(green),
      blue: clampByte(blue),
    };
    const isBlack = raw.red === 0 && raw.green === 0 && raw.blue === 0;

    if (!this.poweredOn) {
      if (isBlack) {
        return;
      }
      await this.setPower(true);
    }

    const rgb = this.profile.scaleRgbWithBrightness
      ? raw
      : scaleRgbByBrightness(raw.red, raw.green, raw.blue, brightness);

    const key = `${rgb.red}:${rgb.green}:${rgb.blue}:${brightness}:${this.profile.id}`;
    if (key === this.lastRgbKey) {
      return;
    }
    this.lastRgbKey = key;

    if (this.lastBrightness !== brightness) {
      await this.setBrightness(brightness);
    }

    await this.enqueueWrite(this.profile.buildColor(rgb.red, rgb.green, rgb.blue));
  }

  async setPixels(pixels, brightness = 100) {
    const canSendMultiPixel =
      typeof this.profile?.buildPixelCommands === "function" &&
      this.profile.multiPixelVerified === true;

    if (canSendMultiPixel) {
      const ledCount = Math.floor((pixels?.length || 0) / 3);
      if (!ledCount) {
        return;
      }

      const nextBuffer = Uint8Array.from(pixels);
      let changedIndices = null;
      if (
        this.lastPixelBuffer &&
        this.lastPixelBuffer.length === nextBuffer.length
      ) {
        changedIndices = [];
        for (let index = 0; index < ledCount; index += 1) {
          const base = index * 3;
          if (
            nextBuffer[base] !== this.lastPixelBuffer[base] ||
            nextBuffer[base + 1] !== this.lastPixelBuffer[base + 1] ||
            nextBuffer[base + 2] !== this.lastPixelBuffer[base + 2]
          ) {
            changedIndices.push(index);
          }
        }
        if (!changedIndices.length) {
          return;
        }
      }

      const commands = this.profile.buildPixelCommands(pixels, brightness, {
        ledCount,
        changedIndices,
      });
      for (const command of commands) {
        await this.enqueueWrite(command);
      }
      this.lastPixelBuffer = nextBuffer;
      return;
    }

    const { red, green, blue } = aggregatePixelsToRgb(pixels);
    await this.setRgb(red, green, blue, brightness);
  }

  async setAnimation(mode, speed = 50) {
    this.lastRgbKey = "";
    if (!this.profile) {
      this.profile = resolveBleProfile(this.deviceName);
    }
    if (typeof this.profile.buildEffectSpeed === "function") {
      await this.enqueueWrite(this.profile.buildEffectSpeed(speed));
    }
    if (typeof this.profile.buildEffect === "function") {
      await this.enqueueWrite(this.profile.buildEffect(mode));
    }
  }
}

class ExternalLedManager {
  constructor({ onStateChange } = {}) {
    this.onStateChange = onStateChange;
    this.noble = null;
    this.bleAvailable = false;
    this.bleError = null;
    this.poweredOn = false;
    this.scanning = false;
    this.scanTimer = null;
    this.discovered = new Map();
    this.connections = new Map();
    this.peripheralCache = new Map();
    this.savedIds = new Set();
    this.lastState = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      this.noble = createNoble();
      this.noble.on("stateChange", (state) => {
        this.poweredOn = state === "poweredOn";
        if (state === "unauthorized") {
          this.bleError = "Bluetooth permission denied. Allow Bluetooth access for this app.";
        } else if (state === "unsupported") {
          this.bleError = "Bluetooth LE is not supported on this PC.";
        } else if (state === "poweredOff") {
          this.bleError = "Bluetooth is turned off. Enable it in Windows Settings.";
        } else if (state === "poweredOn") {
          this.bleError = null;
        }
        if (!this.poweredOn) {
          this.stopScan();
        }
        this.emitState();
      });

      this.noble.on("discover", (peripheral) => {
        this.handleDiscover(peripheral);
      });

      if (typeof this.noble.waitForPoweredOnAsync === "function") {
        await this.noble.waitForPoweredOnAsync(15000);
      } else {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Bluetooth timeout")), 15000);
          const check = () => {
            if (this.noble.state === "poweredOn") {
              clearTimeout(timeout);
              resolve();
              return;
            }
            this.noble.once("stateChange", check);
          };
          check();
        });
      }

      this.bleAvailable = true;
      this.poweredOn = this.noble.state === "poweredOn";
    } catch (error) {
      this.bleAvailable = false;
      this.bleError = error?.message || "Bluetooth unavailable";
    }

    this.emitState();
  }

  handleDiscover(peripheral) {
    const advertisement = peripheral.advertisement || {};
    const serviceUuids = Array.isArray(advertisement.serviceUuids)
      ? advertisement.serviceUuids
      : [];
    const localName = advertisement.localName || "";
    const deviceId = normalizeId(peripheral.id);
    const hasLotusService = serviceUuids.some(isLotusServiceUuid);
    const hasLotusData = hasLotusServiceData(advertisement);
    const saved = this.savedIds.has(deviceId);

    if (!shouldIncludeBleDevice(advertisement, saved)) {
      return;
    }

    const existing = this.discovered.get(deviceId);
    this.discovered.set(deviceId, {
      id: deviceId,
      address: peripheral.address || existing?.address || null,
      name: localName || existing?.name || "Unknown LED",
      rssi: peripheral.rssi ?? existing?.rssi ?? null,
      lastSeenAt: Date.now(),
      hasLotusService: hasLotusService || hasLotusData,
      likelyName: Boolean(localName),
      saved,
      profileId: resolveBleProfile(localName || existing?.name).id,
    });

    const connection = this.connections.get(deviceId);
    if (connection) {
      connection.attachPeripheral(peripheral);
    } else {
      this.peripheralCache.set(deviceId, peripheral);
    }

    this.emitState();
  }

  getConnection(id) {
    const normalized = normalizeId(id);
    if (!normalized) {
      return null;
    }

    let connection = this.connections.get(normalized);
    if (!connection) {
      connection = new ExternalLedConnection({ id: normalized, manager: this });
      this.connections.set(normalized, connection);
    }
    return connection;
  }

  registerSavedDevices(ids = []) {
    this.savedIds = new Set(ids.map(normalizeId).filter(Boolean));
    for (const id of this.savedIds) {
      if (!this.discovered.has(id)) {
        this.discovered.set(id, {
          id,
          address: null,
          name: "Saved device",
          rssi: null,
          lastSeenAt: null,
          hasLotusService: true,
          likelyName: false,
          saved: true,
        });
      } else {
        const entry = this.discovered.get(id);
        entry.saved = true;
      }
    }
    this.emitState();
  }

  async startScan() {
    await this.init();
    if (!this.bleAvailable || !this.poweredOn) {
      throw new Error(this.bleError || "Bluetooth is not available");
    }

    if (this.scanning) {
      return this.getState();
    }

    this.scanning = true;
    this.emitState();

    // Broad scan: Lotus/Magic Lantern devices often advertise name only (no FFF0 in adv packet).
    await this.noble.startScanningAsync([], true);

    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      this.stopScan().catch(() => {});
    }, SCAN_DURATION_MS);

    return this.getState();
  }

  async stopScan() {
    if (!this.noble || !this.scanning) {
      return this.getState();
    }

    clearTimeout(this.scanTimer);
    this.scanTimer = null;
    this.scanning = false;

    try {
      await this.noble.stopScanningAsync();
    } catch {
      try {
        this.noble.stopScanning();
      } catch {
        // Ignore stop errors.
      }
    }

    this.emitState();
    return this.getState();
  }

  async connect(id) {
    await this.init();
    const normalized = normalizeId(id);
    if (!normalized) {
      throw new Error("Device id is required");
    }

    await this.stopScan();

    let peripheral = this.peripheralCache.get(normalized) || null;
    const discovered = this.discovered.get(normalized);

    if (!peripheral && this.noble?._peripherals) {
      peripheral =
        this.noble._peripherals[normalized] ||
        Object.values(this.noble._peripherals).find(
          (item) => normalizeId(item.id) === normalized
        ) ||
        null;
    }

    if (!peripheral && discovered?.address && typeof this.noble?.connectAsync === "function") {
      try {
        peripheral = await this.noble.connectAsync(discovered.address);
      } catch {
        peripheral = null;
      }
    }

    if (!peripheral) {
      await this.startScan();
      const deadline = Date.now() + 8000;
      while (!peripheral && Date.now() < deadline) {
        peripheral =
          this.peripheralCache.get(normalized) ||
          this.noble?._peripherals?.[normalized] ||
          Object.values(this.noble?._peripherals || {}).find(
            (item) => normalizeId(item.id) === normalized
          ) ||
          null;
        if (!peripheral) {
          await sleep(250);
        }
      }
      await this.stopScan();
    }

    if (!peripheral) {
      throw new Error("Device not found. Move it closer and scan again.");
    }

    const connection = this.getConnection(normalized);
    connection.attachPeripheral(peripheral);
    connection.deviceName = discovered?.name || peripheral.advertisement?.localName || connection.deviceName;
    await connection.connect();
    this.emitState();
    return this.getState();
  }

  async disconnect(id) {
    const normalized = normalizeId(id);
    const connection = this.connections.get(normalized);
    if (connection) {
      await connection.disconnect();
    }
    this.emitState();
    return this.getState();
  }

  async disconnectAll() {
    const tasks = [...this.connections.values()].map((connection) =>
      connection.disconnect().catch(() => {})
    );
    await Promise.all(tasks);
    this.emitState();
    return this.getState();
  }

  async setColor(id, red, green, blue, brightness = 100) {
    const connection = this.connections.get(normalizeId(id));
    if (!connection?.connected) {
      throw new Error("Device not connected");
    }
    await connection.setRgb(red, green, blue, brightness);
    return { ok: true };
  }

  async setPixels(id, pixels, brightness = 100) {
    const connection = this.connections.get(normalizeId(id));
    if (!connection?.connected) {
      throw new Error("Device not connected");
    }
    await connection.setPixels(pixels, brightness);
    return { ok: true };
  }

  async writeRaw(id, buffer, options = {}) {
    const connection = this.connections.get(normalizeId(id));
    if (!connection?.connected) {
      throw new Error("Device not connected");
    }
    await connection.enqueueWrite(Buffer.from(buffer), options);
    return { ok: true };
  }

  async setPower(id, poweredOn) {
    const connection = this.connections.get(normalizeId(id));
    if (!connection?.connected) {
      throw new Error("Device not connected");
    }
    await connection.setPower(poweredOn);
    return { ok: true };
  }

  async setAnimation(id, mode, speed = 50) {
    const connection = this.connections.get(normalizeId(id));
    if (!connection?.connected) {
      throw new Error("Device not connected");
    }
    await connection.setAnimation(mode, speed);
    return { ok: true };
  }

  async setBrightness(id, brightness = 100) {
    const connection = this.connections.get(normalizeId(id));
    if (!connection?.connected) {
      throw new Error("Device not connected");
    }
    await connection.setBrightness(brightness);
    return { ok: true };
  }

  isDeviceConnected(id) {
    const connection = this.connections.get(normalizeId(id));
    return Boolean(connection?.connected);
  }

  getState() {
    const devices = [...this.discovered.values()]
      .sort((left, right) => {
        if (left.saved !== right.saved) {
          return left.saved ? -1 : 1;
        }
        return (right.rssi ?? -999) - (left.rssi ?? -999);
      })
      .map((device) => ({
        ...device,
        connected: this.isDeviceConnected(device.id),
        connecting: Boolean(this.connections.get(device.id)?.connecting),
      }));

    const state = {
      bleAvailable: this.bleAvailable,
      bleError: this.bleError,
      poweredOn: this.poweredOn,
      scanning: this.scanning,
      devices,
      message: this.bleAvailable
        ? this.scanning
          ? "Scanning nearby BLE LED devices (about 20s)…"
          : devices.length
            ? `${devices.length} compatible device(s) found`
            : "No compatible devices found. Power on the lamp and scan again."
        : this.bleError || "Bluetooth unavailable",
    };

    this.lastState = state;
    return state;
  }

  emitState() {
    const state = this.getState();
    if (this.onStateChange) {
      this.onStateChange(state);
    }
    return state;
  }

  async destroy() {
    clearTimeout(this.scanTimer);
    await this.disconnectAll();
    if (this.noble && this.scanning) {
      try {
        await this.noble.stopScanningAsync();
      } catch {
        // Ignore shutdown scan errors.
      }
    }
    this.scanning = false;
  }
}

module.exports = { ExternalLedManager };
