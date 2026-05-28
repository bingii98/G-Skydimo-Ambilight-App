const LOTUS_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
const LOTUS_WRITE_CHAR_UUID = "0000fff3-0000-1000-8000-00805f9b34fb";
const LOTUS_NOTIFY_CHAR_UUID = "0000fff4-0000-1000-8000-00805f9b34fb";

const MIN_COMMAND_GAP_MS = 100;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function percentToProtocol(value) {
  return clampByte((clampPercent(value) / 100) * 0x64);
}

function buildRgbCommand(red, green, blue) {
  return Buffer.from([
    0x7e,
    0x07,
    0x05,
    0x03,
    clampByte(red),
    clampByte(green),
    clampByte(blue),
    0x10,
    0xef,
  ]);
}

function buildBrightnessCommand(percent) {
  return Buffer.from([
    0x7e,
    0x07,
    0x01,
    percentToProtocol(percent),
    0xff,
    0xff,
    0xff,
    0x00,
    0xef,
  ]);
}

function buildAnimationCommand(mode) {
  return Buffer.from([
    0x7e,
    0x07,
    0x03,
    clampByte(mode),
    0xff,
    0xff,
    0xff,
    0x00,
    0xef,
  ]);
}

function buildSpeedCommand(percent) {
  return Buffer.from([
    0x7e,
    0x04,
    0x02,
    percentToProtocol(percent),
    0xff,
    0xff,
    0xff,
    0x00,
    0xef,
  ]);
}

/** MELK strip / OA21 — elkbledom `7e 05 03 [mode] 06 ff ff 00 ef` */
function buildStripEffectCommand(mode) {
  return Buffer.from([
    0x7e,
    0x05,
    0x03,
    clampByte(mode),
    0x06,
    0xff,
    0xff,
    0x00,
    0xef,
  ]);
}

function scaleRgbByBrightness(red, green, blue, brightnessPercent) {
  const scale = clampPercent(brightnessPercent) / 100;
  return {
    red: clampByte(red * scale),
    green: clampByte(green * scale),
    blue: clampByte(blue * scale),
  };
}

function buildHoneycombLedColorCommand(ledIndex, red, green, blue) {
  return Buffer.from([
    0x7e,
    0x07,
    0x05,
    0x06,
    clampByte(ledIndex),
    clampByte(red),
    clampByte(green),
    clampByte(blue),
    0xef,
  ]);
}

/** Candidate per-LED frames for hardware probing (see scripts/ble-honeycomb-led-probe.js). */
const HONEYCOMB_LED_CANDIDATES = [
  {
    id: "v1_070506_index0",
    label: "7e 07 05 06 [index] R G B ef",
    build: (index, r, g, b) => buildHoneycombLedColorCommand(index, r, g, b),
  },
  {
    id: "v2_000506_index0",
    label: "7e 00 05 06 [index] R G B 00 ef",
    build: (index, r, g, b) =>
      Buffer.from([0x7e, 0x00, 0x05, 0x06, clampByte(index), clampByte(r), clampByte(g), clampByte(b), 0x00, 0xef]),
  },
  {
    id: "v3_070506_index1",
    label: "7e 07 05 06 [index+1] R G B ef (1-based)",
    build: (index, r, g, b) => buildHoneycombLedColorCommand(index + 1, r, g, b),
  },
  {
    id: "v4_070504_panel",
    label: "7e 07 05 04 [panelIndex] R G B ef (panel = floor(index/3))",
    build: (index, r, g, b) =>
      Buffer.from([0x7e, 0x07, 0x05, 0x04, clampByte(Math.floor(index / 3)), clampByte(r), clampByte(g), clampByte(b), 0xef]),
  },
];

function buildHoneycombPixelCommands(pixels, ledCount, options = {}) {
  const count = Math.max(0, Math.min(ledCount || 0, Math.floor(pixels.length / 3)));
  if (!count) {
    return [];
  }

  const changedIndices = Array.isArray(options.changedIndices)
    ? options.changedIndices.filter((index) => index >= 0 && index < count)
    : null;
  const indices =
    changedIndices && changedIndices.length
      ? changedIndices
      : Array.from({ length: count }, (_, index) => index);

  return indices.map((index) => {
    const base = index * 3;
    return buildHoneycombLedColorCommand(
      index,
      pixels[base],
      pixels[base + 1],
      pixels[base + 2]
    );
  });
}

function aggregatePixelsToRgb(pixels) {
  if (!pixels || pixels.length < 3) {
    return { red: 0, green: 0, blue: 0 };
  }

  let red = 0;
  let green = 0;
  let blue = 0;
  const count = Math.floor(pixels.length / 3);

  for (let index = 0; index < count; index += 1) {
    red += pixels[index * 3];
    green += pixels[index * 3 + 1];
    blue += pixels[index * 3 + 2];
  }

  return {
    red: clampByte(red / count),
    green: clampByte(green / count),
    blue: clampByte(blue / count),
  };
}

function normalizeUuid(value) {
  return String(value || "")
    .replace(/-/g, "")
    .toLowerCase();
}

function isLotusServiceUuid(uuid) {
  const normalized = normalizeUuid(uuid);
  return normalized === "fff0" || normalized.endsWith("0000fff000008000805f9b34fb");
}

function isLikelyLotusDeviceName(name) {
  if (!name) {
    return false;
  }
  const upper = String(name).toUpperCase().replace(/\s+/g, " ");
  return (
    upper.includes("LOTUS") ||
    upper.includes("MELK") ||
    upper.includes("MAGIC") ||
    upper.includes("TRIONES") ||
    upper.includes("ZENGGE") ||
    upper.includes("LEDNET") ||
    upper.includes("LEDNETWF") ||
    upper.includes("BRGLED") ||
    upper.includes("OA10") ||
    upper.includes("OA21") ||
    upper.includes("OC21") ||
    upper.includes("LAMP") ||
    upper.includes("RGBW") ||
    /LED[-_\s]?/i.test(name)
  );
}

function hasLotusServiceData(advertisement = {}) {
  const serviceData = Array.isArray(advertisement.serviceData)
    ? advertisement.serviceData
    : [];
  return serviceData.some((entry) => isLotusServiceUuid(entry?.uuid));
}

function shouldIncludeBleDevice(advertisement = {}, saved = false) {
  if (saved) {
    return true;
  }

  const serviceUuids = Array.isArray(advertisement.serviceUuids)
    ? advertisement.serviceUuids
    : [];
  const localName = advertisement.localName || "";

  if (serviceUuids.some(isLotusServiceUuid)) {
    return true;
  }
  if (hasLotusServiceData(advertisement)) {
    return true;
  }
  if (isLikelyLotusDeviceName(localName)) {
    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  LOTUS_SERVICE_UUID,
  LOTUS_WRITE_CHAR_UUID,
  LOTUS_NOTIFY_CHAR_UUID,
  MIN_COMMAND_GAP_MS,
  buildRgbCommand,
  buildBrightnessCommand,
  buildAnimationCommand,
  buildSpeedCommand,
  buildStripEffectCommand,
  scaleRgbByBrightness,
  aggregatePixelsToRgb,
  buildHoneycombLedColorCommand,
  buildHoneycombPixelCommands,
  HONEYCOMB_LED_CANDIDATES,
  isLotusServiceUuid,
  isLikelyLotusDeviceName,
  hasLotusServiceData,
  shouldIncludeBleDevice,
  clampByte,
  percentToProtocol,
  sleep,
};
