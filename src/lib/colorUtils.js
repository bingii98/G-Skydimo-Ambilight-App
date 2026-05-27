import { DEFAULT_LED_COUNT, LED_BY_MODEL } from "./constants";

export function normalizeHex(value) {
  if (value == null || typeof value !== "string") {
    return null;
  }

  let hex = value.trim().toUpperCase();
  if (!hex) {
    return null;
  }
  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }
  return /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
}

export function ensureHex(value, fallback = "#FFD700") {
  return normalizeHex(value) || fallback;
}

export function hexToRgb(hex) {
  const value = ensureHex(hex).replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function scaledRgb(hex, brightness) {
  const { r, g, b } = hexToRgb(hex);
  const scale = brightness / 100;
  return {
    r: Math.round(r * scale),
    g: Math.round(g * scale),
    b: Math.round(b * scale),
  };
}

export function rgbToHex(r, g, b) {
  const byte = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0").toUpperCase();
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** @param {number} h 0–360 @param {number} s 0–1 @param {number} l 0–1 */
export function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const lit = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lit - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return rgbToHex(
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  );
}

export function interpolateHex(fromHex, toHex, t) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const ratio = Math.max(0, Math.min(1, t));
  return rgbToHex(
    Math.round(from.r + (to.r - from.r) * ratio),
    Math.round(from.g + (to.g - from.g) * ratio),
    Math.round(from.b + (to.b - from.b) * ratio)
  );
}

/** Extract hue 0–360 from hex (achromatic colors resolve to 0). */
export function hexToHue(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }

  let hue;
  if (max === rn) {
    hue = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    hue = (bn - rn) / delta + 2;
  } else {
    hue = (rn - gn) / delta + 4;
  }

  return ((hue * 60) + 360) % 360;
}

/** Clamp each RGB channel to the min/max span of two anchor colors. */
export function clampHexBetween(fromHex, toHex, hex) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const value = hexToRgb(hex);
  const clamp = (a, b, channel) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return Math.max(lo, Math.min(hi, channel));
  };
  return rgbToHex(
    clamp(from.r, to.r, value.r),
    clamp(from.g, to.g, value.g),
    clamp(from.b, to.b, value.b)
  );
}

/** 0 = dark, 1 = light — for adaptive UI rings on the LED map */
export function getHexLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function isLightHex(hex, threshold = 0.68) {
  try {
    return getHexLuminance(hex) >= threshold;
  } catch {
    return false;
  }
}

export function parseModel(deviceId) {
  if (!deviceId) return null;
  const match = deviceId.match(/SK[0-9A-Z]+/i);
  return match ? match[0].toUpperCase() : null;
}

/** Tự nhận số LED từ device ID — không cho user cấu hình */
export function resolveLedCount(deviceId) {
  const model = parseModel(deviceId);
  if (model && LED_BY_MODEL[model]) {
    return LED_BY_MODEL[model];
  }
  return DEFAULT_LED_COUNT;
}

export function resolveLedSource(deviceId) {
  const model = parseModel(deviceId);
  if (model && LED_BY_MODEL[model]) {
    return {
      matched: true,
      model,
      ledCount: LED_BY_MODEL[model],
      title: "Device profile",
      detail: `Matched ${model} · ${LED_BY_MODEL[model]} LEDs`,
    };
  }

  return {
    matched: false,
    model,
    ledCount: DEFAULT_LED_COUNT,
    title: "Default profile",
    detail: model
      ? `No profile for ${model} · using ${DEFAULT_LED_COUNT} LEDs`
      : `Unknown device ID · using ${DEFAULT_LED_COUNT} LEDs`,
  };
}
