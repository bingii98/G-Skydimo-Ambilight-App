const { SerialPort } = require("serialport");
const {
  SCAN_INTERVAL_MS,
  STREAM_INTERVAL_MS,
  DEFAULT_LED_COUNT,
  SKYDIMO_VID,
  SKYDIMO_PID,
  buildFrame,
  buildFrameFromPixels,
  clampLedCount,
  rankPorts,
  probePortFast,
  openPort,
  openPortWithDeviceId,
  closePort,
  isSkydimoUsbId,
  resolveLedCountForDevice,
  formatConnectError,
  guessKnownDeviceId,
  sleep,
  isPortBusyError,
  isSkydimoDeviceId,
  filterLedPorts,
} = require("./skydimo");
const SCAN_INTERVAL_CONNECTED_MS = 10000;
const SCAN_WAIT_TIMEOUT_MS = 2500;

class ConnectionManager {
  constructor({ isSkydimoAppRunning, onStateChange }) {
    this.isSkydimoAppRunning = isSkydimoAppRunning;
    this.onStateChange = onStateChange;

    this.serialPort = null;
    this.connectedPort = null;
    this.deviceId = null;
    this.ledCount = DEFAULT_LED_COUNT;
    this.autoScan = true;
    this.autoConnect = true;
    this.manualDisconnect = false;
    this.scanning = false;
    this.scanTimer = null;
    this.connecting = false;
    this.lastState = null;
    this.lastScanAt = null;
    this.ports = [];
    this.streamTimer = null;
    this.streamWriting = false;
    this.streamColor = null;
  }

  start() {
    this.stop();
    this.scheduleNextScan(false);
    this.tick(false);
  }

  stop() {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  scheduleNextScan(forceProbe = false) {
    if (!this.autoScan) {
      return;
    }

    const delay = this.isConnected() ? SCAN_INTERVAL_CONNECTED_MS : SCAN_INTERVAL_MS;
    this.scanTimer = setTimeout(() => {
      this.tick(forceProbe).finally(() => this.scheduleNextScan(false));
    }, delay);
  }

  setOptions({ autoScan, autoConnect, ledCount } = {}) {
    if (typeof autoScan === "boolean") {
      this.autoScan = autoScan;
      if (this.autoScan) {
        this.start();
      } else {
        this.stop();
      }
    }

    if (typeof autoConnect === "boolean") {
      this.autoConnect = autoConnect;
      if (this.autoConnect) {
        this.manualDisconnect = false;
      }
    }

    if (ledCount !== undefined) {
      this.ledCount = clampLedCount(ledCount);
    }

    this.emitState("Connection settings updated");
  }

  getState() {
    return this.lastState;
  }

  async scanNow() {
    await this.tick(true);
    return this.lastState;
  }

  async tick(forceProbe = false) {
    if (this.scanning) {
      return;
    }

    this.scanning = true;
    try {
      const skydimoRunning = this.isSkydimoAppRunning();
      const rawPorts = await SerialPort.list();
      let ranked = rankPorts(rawPorts);

      const shouldProbe =
        ranked.length > 0 &&
        (forceProbe || this.autoConnect || !this.isConnected()) &&
        !this.connecting;

      if (shouldProbe && !this.isConnected()) {
        for (const port of ranked) {
          if (port.status === "busy" && !forceProbe) {
            continue;
          }
          const probe = await probePortFast(port.path);
          port.status = probe.status;
          port.deviceId = probe.deviceId;
          port.error = probe.error;
          port.score += probe.scoreBoost;
        }
      }

      ranked = filterLedPorts(ranked, this.connectedPort);

      if (this.isConnected() && this.connectedPort) {
        const inList = ranked.some((port) => port.path === this.connectedPort);
        if (!inList) {
          ranked.unshift({
            path: this.connectedPort,
            label: this.connectedPort,
            vendorId: SKYDIMO_VID,
            productId: SKYDIMO_PID,
            type: "skydimo",
            score: 200,
            kindLabel: "Skydimo CH340",
            status: "connected",
            deviceId: this.deviceId,
            error: null,
          });
        }
      }

      ranked.sort((a, b) => b.score - a.score);
      this.ports = ranked;
      this.lastScanAt = new Date().toISOString();

      const recommended = this.pickRecommendedPort(ranked, skydimoRunning);
      const message = this.buildScanMessage(ranked, skydimoRunning, recommended);

      this.emitState(message, { recommendedPort: recommended });

      if (
        this.autoConnect &&
        !this.manualDisconnect &&
        !this.isConnected() &&
        !this.connecting &&
        !skydimoRunning &&
        recommended &&
        recommended.status !== "busy" &&
        recommended.status !== "error" &&
        recommended.status !== "connected"
      ) {
        await this.connect(recommended.path, { auto: true });
      }

      if (this.isConnected()) {
        const stillPresent = rawPorts.some(
          (port) => port.path === this.connectedPort && isSkydimoUsbId(port)
        );
        if (!stillPresent) {
          this.stopColorStream();
          await this.disconnect({ manual: false, reason: "Device unplugged" });
        }
      }
    } finally {
      this.scanning = false;
    }
  }

  pickRecommendedPort(ports, skydimoRunning) {
    if (skydimoRunning) {
      return null;
    }

    return (
      ports.find((port) => port.status === "available" && isSkydimoDeviceId(port.deviceId)) ||
      ports.find(
        (port) =>
          port.type === "skydimo" &&
          port.status !== "busy" &&
          port.status !== "error" &&
          port.status !== "connected"
      ) ||
      null
    );
  }

  buildScanMessage(ports, skydimoRunning, recommended) {
    if (this.isConnected()) {
      return `Connected to ${this.connectedPort}${this.deviceId ? ` (${this.deviceId})` : ""}`;
    }

    if (skydimoRunning) {
      return "SkyDimo.exe is using the COM port — close the official app to auto-connect";
    }

    if (this.connecting) {
      return "Connecting...";
    }

    const skydimoPorts = ports.filter((port) => port.type === "skydimo");
    if (!skydimoPorts.length) {
      return "Scanning... no Skydimo LED found";
    }

    const busy = skydimoPorts.find((port) => port.status === "busy");
    if (busy) {
      return `${busy.path} is busy — may be held by another app`;
    }

    if (recommended?.status === "available") {
      return `Found ${recommended.path}${recommended.deviceId ? ` (${recommended.deviceId})` : ""}`;
    }

    return `Scanning... found ${skydimoPorts.length} Skydimo LED port(s)`;
  }

  isConnected() {
    return Boolean(this.serialPort?.isOpen);
  }

  async waitForScanIdle() {
    const started = Date.now();
    while (this.scanning) {
      if (Date.now() - started > SCAN_WAIT_TIMEOUT_MS) {
        break;
      }
      await sleep(50);
    }
  }

  async connect(portPath, { auto = false } = {}) {
    if (this.isSkydimoAppRunning()) {
      throw new Error("SkyDimo.exe is running. Close the official app first.");
    }

    if (!portPath) {
      const recommended = this.pickRecommendedPort(this.ports, false);
      if (!recommended?.path) {
        throw new Error("No suitable port found to connect");
      }
      portPath = recommended.path;
    }

    if (this.isConnected() && this.connectedPort === portPath) {
      return this.getState();
    }

    this.connecting = true;
    this.emitState(`Connecting to ${portPath}...`);

    try {
      await this.waitForScanIdle();
      await this.disconnect({ manual: false, silent: true });

      const cached = this.ports.find((entry) => entry.path === portPath);
      let isSkydimoPort =
        cached?.type === "skydimo" ||
        isSkydimoUsbId({
          vendorId: cached?.vendorId,
          productId: cached?.productId,
        });

      if (!isSkydimoPort) {
        const rawPorts = await SerialPort.list();
        const rawPort = rawPorts.find((entry) => entry.path === portPath);
        isSkydimoPort = Boolean(rawPort && isSkydimoUsbId(rawPort));
      }

      let port;
      let rawDeviceId = null;

      if (isSkydimoPort) {
        port = await openPort(portPath);
        rawDeviceId = cached?.deviceId || guessKnownDeviceId();
      } else {
        const opened = await openPortWithDeviceId(portPath);
        port = opened.port;
        rawDeviceId = opened.deviceId;
      }

      let deviceId = rawDeviceId || cached?.deviceId || null;

      if (!isSkydimoDeviceId(deviceId)) {
        if (!isSkydimoPort) {
          await closePort(port);
          throw new Error(`${portPath} is not connected to a Skydimo LED`);
        }
        deviceId = guessKnownDeviceId();
      }

      this.serialPort = port;
      this.connectedPort = portPath;
      this.deviceId = deviceId;
      this.ledCount = resolveLedCountForDevice(deviceId);
      this.manualDisconnect = false;

      if (cached) {
        cached.status = "connected";
        cached.deviceId = deviceId;
        cached.error = null;
      }

      this.emitState(
        auto
          ? `Auto-connected to ${portPath}${deviceId ? ` (${deviceId})` : ""}`
          : `Connected to ${portPath}${deviceId ? ` (${deviceId})` : ""}`
      );

      return this.getState();
    } catch (error) {
      const message = formatConnectError(portPath, error);
      const cached = this.ports.find((entry) => entry.path === portPath);
      if (cached && isPortBusyError(error)) {
        cached.status = "busy";
        cached.error = message;
      }
      this.emitState(`Failed to connect to ${portPath}`);
      throw new Error(message);
    } finally {
      this.connecting = false;
    }
  }

  async connectBest() {
    if (this.isSkydimoAppRunning()) {
      throw new Error("SkyDimo.exe is running. Close the official app first.");
    }

    await this.waitForScanIdle();

    const hasSkydimoPort = this.ports.some((port) => port.type === "skydimo");
    if (!hasSkydimoPort) {
      await this.tick(true);
      await this.waitForScanIdle();
    }

    const candidates = [...this.ports]
      .filter((port) => port.type === "skydimo" && port.status !== "busy")
      .sort((a, b) => {
        const aConfirmed = isSkydimoDeviceId(a.deviceId) ? 1 : 0;
        const bConfirmed = isSkydimoDeviceId(b.deviceId) ? 1 : 0;
        if (aConfirmed !== bConfirmed) {
          return bConfirmed - aConfirmed;
        }
        return b.score - a.score;
      });

    const errors = [];
    for (const port of candidates) {
      try {
        return await this.connect(port.path, { auto: false });
      } catch (error) {
        port.status = "error";
        port.error = error?.message || String(error);
        errors.push(`${port.path}: ${port.error}`);
      }
    }

    if (!candidates.length) {
      throw new Error("No Skydimo port found. Check the USB cable and scan again.");
    }

    throw new Error(errors[0] || "Could not connect to any port. Try scanning again.");
  }

  async disconnect({ manual = true, reason, silent = false } = {}) {
    if (manual) {
      this.manualDisconnect = true;
    }

    this.stopColorStream();

    if (this.serialPort) {
      await closePort(this.serialPort);
      this.serialPort = null;
    }

    const previousPort = this.connectedPort;
    this.connectedPort = null;
    this.deviceId = null;

    if (!silent) {
      this.emitState(reason || (manual ? "Disconnected" : `Lost connection ${previousPort || ""}`));
    }

    return this.getState();
  }

  stopColorStream() {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
    this.streamColor = null;
    this.streamWriting = false;
  }

  startColorStream(red, green, blue, count) {
    const nextCount = clampLedCount(count ?? this.ledCount);
    const pixels = Buffer.alloc(nextCount * 3);
    const r = Math.round(red);
    const g = Math.round(green);
    const b = Math.round(blue);

    for (let i = 0; i < nextCount; i += 1) {
      pixels[i * 3] = r;
      pixels[i * 3 + 1] = g;
      pixels[i * 3 + 2] = b;
    }

    this.startColorStreamPixels(pixels, nextCount);
  }

  startColorStreamPixels(pixels, count) {
    const nextCount = clampLedCount(count ?? this.ledCount);
    const body = Buffer.isBuffer(pixels) ? pixels : Buffer.from(pixels);
    const normalized = Buffer.alloc(nextCount * 3);

    for (let i = 0; i < nextCount * 3; i += 1) {
      normalized[i] = body[i] ?? 0;
    }

    const unchanged =
      this.streamColor &&
      this.streamColor.mode === "pixels" &&
      this.streamColor.count === nextCount &&
      this.streamColor.pixels.equals(normalized) &&
      this.streamTimer;

    this.streamColor = {
      mode: "pixels",
      pixels: normalized,
      count: nextCount,
    };
    this.ledCount = nextCount;

    if (unchanged) {
      return;
    }

    if (this.streamTimer) {
      return;
    }

    this.streamTimer = setInterval(() => this.streamTick(), STREAM_INTERVAL_MS);
    this.streamTick();
  }

  streamTick() {
    if (!this.isConnected() || !this.streamColor || this.streamWriting) {
      return;
    }

    const frame =
      this.streamColor.mode === "pixels"
        ? buildFrameFromPixels(this.streamColor.pixels, this.streamColor.count)
        : buildFrame(
            this.streamColor.r,
            this.streamColor.g,
            this.streamColor.b,
            this.streamColor.count
          );
    this.streamWriting = true;

    this.serialPort.write(frame, (error) => {
      this.streamWriting = false;
      if (error && this.isConnected()) {
        this.stopColorStream();
        this.emitState(`Lost connection while sending color: ${error.message}`);
      }
    });
  }

  async setColor(red, green, blue, count) {
    if (!this.isConnected()) {
      throw new Error("COM port not connected");
    }

    this.startColorStream(red, green, blue, count);
    return { ok: true };
  }

  async setPixels(pixels, count) {
    if (!this.isConnected()) {
      throw new Error("COM port not connected");
    }

    this.startColorStreamPixels(pixels, count);
    return { ok: true };
  }

  emitState(message, extra = {}) {
    const recommended = extra.recommendedPort || this.pickRecommendedPort(this.ports, this.isSkydimoAppRunning());

    this.lastState = {
      connected: this.isConnected(),
      connecting: this.connecting,
      scanning: this.scanning,
      port: this.connectedPort,
      deviceId: this.deviceId,
      autoScan: this.autoScan,
      autoConnect: this.autoConnect,
      skydimoRunning: this.isSkydimoAppRunning(),
      lastScanAt: this.lastScanAt,
      recommendedPort: recommended,
      ports: this.ports.map((port) => ({
        path: port.path,
        label: port.label,
        type: port.type,
        kindLabel: port.kindLabel,
        status: port.path === this.connectedPort ? "connected" : port.status,
        score: port.score,
        deviceId: port.deviceId,
        error: port.error,
      })),
      message,
    };

    this.onStateChange?.(this.lastState);
  }

  async destroy() {
    this.stop();
    this.stopColorStream();
    await this.disconnect({ manual: false, silent: true });
  }
}

module.exports = { ConnectionManager };
