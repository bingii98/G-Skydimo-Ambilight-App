const fs = require("fs");
const path = require("path");
const { SerialPort } = require("serialport");

const SKYDIMO_VID = "1a86";
const SKYDIMO_PID = "7523";
const DEFAULT_BAUD = 115200;
const DEFAULT_LED_COUNT = 96;
const SCAN_INTERVAL_MS = 3000;
const STREAM_INTERVAL_MS = 40;
const PROBE_TIMEOUT_MS = 350;
const PORT_OPEN_RETRIES = 3;
const PORT_OPEN_RETRY_DELAY_MS = 150;
const PORT_RELEASE_DELAY_MS = 80;

let portOperationChain = Promise.resolve();

const LED_BY_MODEL = {
  SK0L27: 96,
  SK0L24: 80,
  SK0L32: 114,
  SK0L34: 112,
  SK0L21: 76,
  SK0127: 67,
};

function resolveLedCountForDevice(deviceId) {
  const text = String(deviceId || "");
  const match = text.match(/SK[0-9A-Z]+/i);
  const model = match?.[0]?.toUpperCase();
  if (model && LED_BY_MODEL[model]) {
    return LED_BY_MODEL[model];
  }
  return DEFAULT_LED_COUNT;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildFrame(red, green, blue, ledCount = DEFAULT_LED_COUNT) {
  const r = clamp(Math.round(red), 0, 255);
  const g = clamp(Math.round(green), 0, 255);
  const b = clamp(Math.round(blue), 0, 255);
  const count = clampLedCount(ledCount);
  const pixels = Buffer.alloc(count * 3);

  for (let i = 0; i < count; i += 1) {
    pixels[i * 3] = r;
    pixels[i * 3 + 1] = g;
    pixels[i * 3 + 2] = b;
  }

  return buildFrameFromPixels(pixels, count);
}

function buildFrameFromPixels(pixels, ledCount = DEFAULT_LED_COUNT) {
  const count = clampLedCount(ledCount);
  const rgb = Buffer.isBuffer(pixels) ? pixels : Buffer.from(pixels);
  const header = Buffer.from([0x41, 0x64, 0x61, 0x00, 0x00, count]);
  const body = Buffer.alloc(count * 3);

  for (let i = 0; i < count * 3; i += 1) {
    body[i] = rgb[i] ?? 0;
  }

  return Buffer.concat([header, body]);
}

function clampLedCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) {
    return DEFAULT_LED_COUNT;
  }
  return Math.max(1, Math.min(255, Math.round(count)));
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isSkydimoUsbId(port) {
  return (
    normalizeText(port.vendorId) === SKYDIMO_VID &&
    normalizeText(port.productId) === SKYDIMO_PID
  );
}

function isSkydimoDeviceId(deviceId) {
  if (!deviceId) return false;
  return /SK[0-9A-Z]+/i.test(String(deviceId));
}

function isLedPort(port, connectedPath) {
  if (connectedPath && port.path === connectedPath) {
    return true;
  }
  if (port.status === "busy") {
    return true;
  }
  if (port.type === "skydimo") {
    return true;
  }
  return isSkydimoDeviceId(port.deviceId);
}

function filterLedPorts(ports, connectedPath) {
  return ports.filter((port) => isLedPort(port, connectedPath));
}

function classifyPort(port) {
  if (isSkydimoUsbId(port)) {
    return { type: "skydimo", score: 100, label: "Skydimo CH340" };
  }

  return null;
}

function rankPorts(ports) {
  return ports
    .map((port) => {
      const info = classifyPort(port);
      if (!info) {
        return null;
      }
      return {
        path: port.path,
        label: port.friendlyName || port.manufacturer || port.path,
        vendorId: port.vendorId || null,
        productId: port.productId || null,
        type: info.type,
        score: info.score,
        kindLabel: info.label,
        status: "unknown",
        deviceId: null,
        error: null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function parseDeviceId(buffer) {
  if (!buffer?.length) {
    return null;
  }

  const commaIdx = buffer.indexOf(",");
  if (commaIdx >= 0) {
    const prefix = buffer.toString("latin1", 0, commaIdx + 1);
    const modelMatch = prefix.match(/^SK([0-9A-Z]+),/i);
    if (modelMatch) {
      const model = `SK${modelMatch[1].toUpperCase()}`;
      const serialBytes = buffer.slice(commaIdx + 1, commaIdx + 8);
      if (serialBytes.length === 7) {
        const serial = serialBytes.toString("hex").toUpperCase();
        if (/^[0-9A-F]{14}$/.test(serial)) {
          return `${model}:${serial}`;
        }
      }
      return model;
    }
  }

  const text = buffer.toString("utf8", 0, Math.min(buffer.length, 64)).trim();
  const match = text.match(/SK[0-9A-Z]+(?::[0-9A-F]+)?/i);
  if (!match) {
    return null;
  }
  return match[0].replace(/\s+/g, "").toUpperCase();
}

function loadKnownDeviceProfiles() {
  if (process.platform !== "win32") {
    return [];
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const dir = path.join(localAppData, "SkyDimo", "controllers");
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .map((fileName) => {
      const match = fileName.match(/^(SK[0-9A-Z]+)_([0-9A-F]+)\.json$/i);
      if (!match) {
        return null;
      }
      return `${match[1].toUpperCase()}:${match[2].toUpperCase()}`;
    })
    .filter(Boolean);
}

function guessKnownDeviceId() {
  const profiles = loadKnownDeviceProfiles();
  return profiles[0] || null;
}

async function pulseDtr(port) {
  await new Promise((resolve) => port.set({ dtr: false, rts: false }, resolve));
  await sleep(30);
  await new Promise((resolve) => port.set({ dtr: true, rts: true }, resolve));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortBusyError(error) {
  const message = error?.message || String(error);
  return (
    /access denied/i.test(message) ||
    /access is denied/i.test(message) ||
    /permission denied/i.test(message) ||
    /EBUSY/i.test(message) ||
    /resource busy/i.test(message) ||
    /cannot access/i.test(message)
  );
}

function formatConnectError(path, error) {
  if (isPortBusyError(error)) {
    return `${path} is in use. Close SkyDimo.exe (and any serial monitor), wait a moment, then try again.`;
  }
  return error?.message || String(error);
}

function withPortLock(fn) {
  const next = portOperationChain.then(fn, fn);
  portOperationChain = next.catch(() => {});
  return next;
}

function createSerialPort(path) {
  return new SerialPort({
    path,
    baudRate: DEFAULT_BAUD,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    autoOpen: false,
  });
}

function attachDeviceIdReader(port, timeoutMs = PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const chunks = [];

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      port.removeListener("data", onData);
      resolve(value);
    };

    const onData = (chunk) => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      const deviceId = parseDeviceId(combined);
      if (deviceId) {
        finish(deviceId);
      }
    };

    const timer = setTimeout(() => {
      finish(parseDeviceId(Buffer.concat(chunks)));
    }, timeoutMs);

    port.on("data", onData);
  });
}

function openPortOnce(path) {
  return new Promise((resolve, reject) => {
    const port = createSerialPort(path);

    port.open((error) => {
      if (error) {
        port.destroy();
        reject(error);
        return;
      }
      resolve(port);
    });
  });
}

async function openPortWithDeviceIdImpl(path, timeoutMs = PROBE_TIMEOUT_MS) {
  let lastError;
  for (let attempt = 0; attempt < PORT_OPEN_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await sleep(PORT_OPEN_RETRY_DELAY_MS * attempt);
    }

    const port = createSerialPort(path);
    const deviceIdPromise = attachDeviceIdReader(port, timeoutMs);

    try {
      await new Promise((resolve, reject) => {
        port.open((error) => {
          if (error) {
            port.removeAllListeners("data");
            port.destroy();
            reject(error);
            return;
          }
          resolve();
        });
      });

      await pulseDtr(port);

      const deviceId = await deviceIdPromise;
      return { port, deviceId };
    } catch (error) {
      lastError = error;
      if (!isPortBusyError(error) || attempt === PORT_OPEN_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}

function openPortWithDeviceId(path, timeoutMs = PROBE_TIMEOUT_MS) {
  return withPortLock(() => openPortWithDeviceIdImpl(path, timeoutMs));
}

function openPort(path) {
  return withPortLock(async () => {
    let lastError;
    for (let attempt = 0; attempt < PORT_OPEN_RETRIES; attempt += 1) {
      if (attempt > 0) {
        await sleep(PORT_OPEN_RETRY_DELAY_MS * attempt);
      }
      try {
        return await openPortOnce(path);
      } catch (error) {
        lastError = error;
        if (!isPortBusyError(error) || attempt === PORT_OPEN_RETRIES - 1) {
          throw error;
        }
      }
    }
    throw lastError;
  });
}

function closePort(port) {
  return withPortLock(async () => {
    if (!port || port.destroyed) {
      return;
    }

    await new Promise((resolve) => {
      if (!port.isOpen) {
        port.destroy();
        resolve();
        return;
      }

      port.close(() => {
        port.destroy();
        resolve();
      });
    });

    await sleep(PORT_RELEASE_DELAY_MS);
  });
}

function readDeviceId(port, timeoutMs = PROBE_TIMEOUT_MS) {
  const promise = attachDeviceIdReader(port, timeoutMs);
  if (port.isOpen) {
    port.resume();
  }
  return promise;
}

async function probePortFast(path) {
  return withPortLock(async () => {
    try {
      const port = await openPortOnce(path);
      await new Promise((resolve) => {
        port.close(() => {
          port.destroy();
          resolve();
        });
      });
      await sleep(PORT_RELEASE_DELAY_MS);

      const deviceId = guessKnownDeviceId();
      return {
        status: "available",
        deviceId: isSkydimoDeviceId(deviceId) ? deviceId : null,
        error: null,
        scoreBoost: isSkydimoDeviceId(deviceId) ? 30 : 10,
      };
    } catch (error) {
      const message = error?.message || String(error);
      const busy = isPortBusyError(error);

      return {
        status: busy ? "busy" : "error",
        deviceId: null,
        error: busy ? formatConnectError(path, error) : message,
        scoreBoost: 0,
      };
    }
  });
}

async function probePort(path) {
  return withPortLock(async () => {
    try {
      const { port, deviceId } = await openPortWithDeviceIdImpl(path, PROBE_TIMEOUT_MS);
      await new Promise((resolve) => {
        if (!port || port.destroyed) {
          resolve();
          return;
        }
        if (!port.isOpen) {
          port.destroy();
          resolve();
          return;
        }
        port.close(() => {
          port.destroy();
          resolve();
        });
      });
      await sleep(PORT_RELEASE_DELAY_MS);

      const resolvedId = deviceId || guessKnownDeviceId();
      return {
        status: isSkydimoDeviceId(resolvedId) ? "available" : "unknown",
        deviceId: isSkydimoDeviceId(resolvedId) ? resolvedId : null,
        error: isSkydimoDeviceId(resolvedId) ? null : "No Skydimo LED response",
        scoreBoost: isSkydimoDeviceId(resolvedId) ? 30 : 0,
      };
    } catch (error) {
      const message = error?.message || String(error);
      const busy = isPortBusyError(error);

      return {
        status: busy ? "busy" : "error",
        deviceId: null,
        error: busy ? formatConnectError(path, error) : message,
        scoreBoost: 0,
      };
    }
  });
}

module.exports = {
  SKYDIMO_VID,
  SKYDIMO_PID,
  DEFAULT_BAUD,
  DEFAULT_LED_COUNT,
  SCAN_INTERVAL_MS,
  STREAM_INTERVAL_MS,
  buildFrame,
  buildFrameFromPixels,
  clampLedCount,
  rankPorts,
  probePort,
  probePortFast,
  openPort,
  openPortWithDeviceId,
  closePort,
  readDeviceId,
  parseDeviceId,
  isSkydimoUsbId,
  isSkydimoDeviceId,
  isLedPort,
  filterLedPorts,
  resolveLedCountForDevice,
  LED_BY_MODEL,
  isPortBusyError,
  formatConnectError,
  guessKnownDeviceId,
  sleep,
};
