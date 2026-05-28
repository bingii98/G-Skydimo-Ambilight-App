const {
  percentToProtocol,
  clampByte,
  buildHoneycombPixelCommands,
  buildStripEffectCommand,
  buildSpeedCommand,
} = require("./lotusLampProtocol");

function cmd(bytes) {
  return Buffer.from(bytes);
}

const stripEffectHooks = {
  buildEffect: (mode) => buildStripEffectCommand(mode),
  buildEffectSpeed: (percent) => buildSpeedCommand(percent),
};

const LOTUS_OA10 = {
  id: "LOTUS_OA10",
  match: /MELK-OA10|LOTUS/i,
  serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
  writeUuid: "0000fff3-0000-1000-8000-00805f9b34fb",
  scaleRgbWithBrightness: false,
  ...stripEffectHooks,
  buildTurnOn: () => cmd([0x7e, 0x07, 0x04, 0xff, 0x00, 0x01, 0x02, 0x01, 0xef]),
  buildTurnOff: () => cmd([0x7e, 0x07, 0x04, 0x00, 0x00, 0x00, 0x02, 0x00, 0xef]),
  buildColor: (red, green, blue) => cmd([0x7e, 0x07, 0x05, 0x03, red, green, blue, 0x10, 0xef]),
  buildBrightness: (percent) => cmd([0x7e, 0x07, 0x01, percentToProtocol(percent), 0xff, 0xff, 0xff, 0x00, 0xef]),
};

const MELK_OA21 = {
  id: "MELK_OA21",
  match: /MELK-OA21/i,
  serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
  writeUuid: "0000fff3-0000-1000-8000-00805f9b34fb",
  scaleRgbWithBrightness: true,
  ...stripEffectHooks,
  buildTurnOn: () => cmd([0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]),
  buildTurnOff: () => cmd([0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]),
  buildColor: (red, green, blue) => cmd([0x7e, 0x00, 0x05, 0x03, red, green, blue, 0x00, 0xef]),
  buildBrightness: (percent) => cmd([0x7e, 0x04, 0x01, percentToProtocol(percent), 0x01, 0xff, 0xff, 0x00, 0xef]),
};

const MELK_OC21 = {
  id: "MELK_OC21",
  match: /MELK-OC21/i,
  serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
  writeUuid: "0000fff3-0000-1000-8000-00805f9b34fb",
  scaleRgbWithBrightness: true,
  ...stripEffectHooks,
  buildTurnOn: () => cmd([0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]),
  buildTurnOff: () => cmd([0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]),
  buildColor: (red, green, blue) => cmd([0x7e, 0x00, 0x05, 0x03, red, green, blue, 0x00, 0xef]),
  buildBrightness: (percent) => cmd([0x7e, 0x04, 0x01, percentToProtocol(percent), 0x01, 0xff, 0xff, 0x00, 0xef]),
};

const HONEYCOMB_TRI = {
  id: "HONEYCOMB_TRI",
  match: /HONEYCOMB|TRIANGULAR.*PANEL|HEX.*PANEL|NANOLEAF|LOTUS.*TRI/i,
  serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
  writeUuid: "0000fff3-0000-1000-8000-00805f9b34fb",
  scaleRgbWithBrightness: true,
  supportsMultiPixel: true,
  /** Set true only after sniff confirms per-LED frames on hardware. */
  multiPixelVerified: false,
  ...stripEffectHooks,
  buildTurnOn: () => cmd([0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]),
  buildTurnOff: () => cmd([0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]),
  buildColor: (red, green, blue) => cmd([0x7e, 0x00, 0x05, 0x03, red, green, blue, 0x00, 0xef]),
  buildBrightness: (percent) => cmd([0x7e, 0x04, 0x01, percentToProtocol(percent), 0x01, 0xff, 0xff, 0x00, 0xef]),
  buildPixelCommands: (pixels, brightness, options = {}) =>
    buildHoneycombPixelCommands(pixels, options.ledCount, options),
};

const MELK_GENERIC = {
  id: "MELK_GENERIC",
  match: /MELK|ELK-BLE|ELK-BLEDOM|LEDBLE|MAGIC|LOTUS|TRIONES/i,
  serviceUuid: "0000fff0-0000-1000-8000-00805f9b34fb",
  writeUuid: "0000fff3-0000-1000-8000-00805f9b34fb",
  scaleRgbWithBrightness: true,
  ...stripEffectHooks,
  buildTurnOn: () => cmd([0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef]),
  buildTurnOff: () => cmd([0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]),
  buildColor: (red, green, blue) => cmd([0x7e, 0x00, 0x05, 0x03, red, green, blue, 0x00, 0xef]),
  buildBrightness: (percent) => cmd([0x7e, 0x04, 0x01, percentToProtocol(percent), 0x01, 0xff, 0xff, 0x00, 0xef]),
};

const BLE_PROFILES = [HONEYCOMB_TRI, MELK_OA21, MELK_OC21, LOTUS_OA10, MELK_GENERIC];

function resolveBleProfile(name) {
  const text = String(name || "");
  for (const profile of BLE_PROFILES) {
    if (profile.match.test(text)) {
      return profile;
    }
  }
  return MELK_GENERIC;
}

function normalizeUuid(value) {
  return String(value || "")
    .replace(/-/g, "")
    .toLowerCase();
}

function uuidMatches(candidate, expected) {
  const left = normalizeUuid(candidate);
  const right = normalizeUuid(expected);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return left.includes(right.slice(-4)) || right.includes(left.slice(-4));
}

module.exports = {
  BLE_PROFILES,
  resolveBleProfile,
  uuidMatches,
  MELK_OA21,
  MELK_OC21,
  LOTUS_OA10,
  HONEYCOMB_TRI,
};
