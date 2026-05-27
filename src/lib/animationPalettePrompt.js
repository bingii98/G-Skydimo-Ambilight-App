import { createAnimationColorStopId, normalizeAnimationColorStops } from "./animationColors";
import { ensureHex, hexToRgb, normalizeHex } from "./colorUtils";

const COLOR_FAMILY_PATTERNS = [
  { family: "white", pattern: /\b(trắng|trang|white|ivory|snow|cream|kem|ngà|nga)\b/i },
  { family: "yellow", pattern: /\b(vàng|vang|yellow|gold|amber)\b/i },
  { family: "red", pattern: /\b(đỏ|do|red|crimson|scarlet)\b/i },
  { family: "blue", pattern: /\b(xanh dương|xanh duong|blue|navy|cobalt|cyan|teal)\b/i },
  { family: "green", pattern: /\b(xanh lá|xanh la|green|lime|emerald)\b/i },
  { family: "purple", pattern: /\b(tím|tim|purple|violet|magenta|pink|hồng|hong)\b/i },
  { family: "orange", pattern: /\b(cam|orange|peach|đào|dao)\b/i },
];

const FAMILY_PRESETS = {
  white: { muted: "#FFFEF8", vivid: "#FFFFFF" },
  yellow: { muted: "#FFE08A", vivid: "#FFD700" },
  cream: { muted: "#FFF6D6", vivid: "#FFF2CC" },
  red: { muted: "#E85D5D", vivid: "#FF2244" },
  blue: { muted: "#5B9BD5", vivid: "#0088FF" },
  green: { muted: "#6BCB77", vivid: "#00CC66" },
  purple: { muted: "#9B7EDE", vivid: "#8800FF" },
  orange: { muted: "#F4A261", vivid: "#FF8800" },
};

const VIVID_RAINBOW = [
  "#FF1744",
  "#FF9100",
  "#FFEA00",
  "#00E676",
  "#00B0FF",
  "#651FFF",
  "#D500F9",
];

const SOFT_RAINBOW = [
  "#FF8A80",
  "#FFB74D",
  "#FFF176",
  "#81C784",
  "#64B5F6",
  "#9575CD",
  "#F06292",
];

function normalizePromptText(mood = "") {
  return String(mood || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clampStopCount(value, min = 2, max = 7) {
  const count = Math.round(Number(value));
  if (!Number.isFinite(count)) {
    return min;
  }
  return Math.max(min, Math.min(max, count));
}

function parseExplicitStopCount(text) {
  const match = text.match(/\b(\d+)\s*(mau|colors?|stops?|stop|sac)\b/);
  if (!match) {
    return null;
  }
  return clampStopCount(match[1]);
}

/** Infer palette constraints from a natural-language color request. */
export function analyzeColorPrompt(mood = "") {
  const text = normalizePromptText(mood);
  const families = [];

  for (const { family, pattern } of COLOR_FAMILY_PATTERNS) {
    if (pattern.test(text) && !families.includes(family)) {
      families.push(family);
    }
  }

  const wantsRainbow =
    /\b(rainbow|cau vong|spectrum|full spectrum|7 mau|cau vong)\b/i.test(text) ||
    /\brainbow\b/i.test(text);

  const vivid =
    /\b(sac so|sac sac|sac|vivid|bright|neon|dam|noi bat|bold|colorful|nhieu mau)\b/i.test(text) &&
    !/\b(tong mau|pastel|muted|soft|nhe|diu|monochrome|don sac)\b/i.test(text);

  const explicitStopCount = parseExplicitStopCount(text);

  const muted =
    !vivid &&
    !wantsRainbow &&
    (/\b(tong mau|pastel|muted|soft|subtle|nhe|diu|warm|neutral|don sac|monochrome)\b/i.test(
      text
    ) ||
      (families.length >= 2 && !explicitStopCount));

  const strictPalette =
    !wantsRainbow &&
    !vivid &&
    ((families.length >= 2 && !explicitStopCount) ||
      /\b(chi|only|just|monochrome|don sac|it mau|two color|2 mau|hai mau)\b/i.test(text));

  let stopCount = explicitStopCount;
  if (!stopCount) {
    if (wantsRainbow && vivid) stopCount = 7;
    else if (wantsRainbow) stopCount = 6;
    else if (families.length >= 2) stopCount = 3;
    else stopCount = 4;
  }
  stopCount = clampStopCount(stopCount);

  let instruction = "";
  if (wantsRainbow) {
    instruction = `Create exactly ${stopCount} saturated rainbow spectrum colors across the hue wheel.`;
  } else if (families.length >= 2) {
    instruction = `Use ONLY these color families: ${families.join(", ")}.`;
  } else if (families.length === 1) {
    instruction = `Stay within the ${families[0]} family and close neutrals only.`;
  }

  if (muted) {
    instruction += " Prefer soft, muted, low-saturation LED tones.";
  } else if (vivid) {
    instruction += " Use bold, saturated LED-friendly colors.";
  }

  if (mood.trim()) {
    instruction += " Ignore any existing palette or keyframe colors.";
  }

  return {
    stopCount,
    minStops: stopCount,
    maxStops: stopCount,
    muted,
    vivid,
    wantsRainbow,
    strictPalette,
    families,
    ignoreExistingPalette: Boolean(mood.trim()),
    instruction: instruction.trim(),
  };
}

function layoutEvenStops(colors, fallbackHex = "#FFD700") {
  const unique = [...new Set(colors.map((color) => normalizeHex(color)).filter(Boolean))];
  if (unique.length === 0) {
    return normalizeAnimationColorStops(
      [
        { id: createAnimationColorStopId(), position: 0, color: fallbackHex },
        { id: createAnimationColorStopId(), position: 1, color: fallbackHex },
      ],
      fallbackHex
    );
  }

  if (unique.length === 1) {
    return normalizeAnimationColorStops(
      [
        { id: createAnimationColorStopId(), position: 0, color: unique[0] },
        { id: createAnimationColorStopId(), position: 1, color: unique[0] },
      ],
      unique[0]
    );
  }

  return normalizeAnimationColorStops(
    unique.map((color, index) => ({
      id: createAnimationColorStopId(),
      position: index / (unique.length - 1),
      color,
    })),
    unique[0]
  );
}

function layoutMappedStops(mapped, targetCount, fallbackHex) {
  const sorted = [...mapped].sort((a, b) => a.position - b.position);
  const picked = [];
  for (const stop of sorted) {
    if (!picked.some((entry) => entry.color === stop.color)) {
      picked.push(stop);
    }
    if (picked.length >= targetCount) {
      break;
    }
  }

  if (picked.length < 2) {
    return layoutEvenStops(
      picked.map((stop) => stop.color),
      fallbackHex
    );
  }

  return normalizeAnimationColorStops(
    picked.map((stop, index) => ({
      id: createAnimationColorStopId(),
      position: picked.length === 1 ? 0 : index / (picked.length - 1),
      color: stop.color,
    })),
    picked[0].color
  );
}

export function synthesizeRainbowPalette(stopCount = 7, vivid = true) {
  const source = vivid ? VIVID_RAINBOW : SOFT_RAINBOW;
  const count = clampStopCount(stopCount);
  const colors =
    count >= source.length
      ? source
      : Array.from({ length: count }, (_, index) =>
          source[Math.round((index / Math.max(1, count - 1)) * (source.length - 1))]
        );
  return layoutEvenStops(colors);
}

export function synthesizePaletteFromConstraints(constraints, fallbackHex = "#FFD700") {
  const { families, muted, stopCount, wantsRainbow, vivid } = constraints;

  if (wantsRainbow) {
    return synthesizeRainbowPalette(stopCount, vivid || !muted);
  }

  const tone = muted ? "muted" : "vivid";
  const colors = [];

  if (families.includes("white") && families.includes("yellow")) {
    colors.push(FAMILY_PRESETS.white[tone], FAMILY_PRESETS.cream[tone], FAMILY_PRESETS.yellow[tone]);
  } else {
    for (const family of families) {
      const preset = FAMILY_PRESETS[family];
      if (preset) {
        colors.push(preset[tone]);
      }
    }
  }

  if (colors.length === 0) {
    return synthesizeRainbowPalette(stopCount, !muted);
  }

  return layoutEvenStops(colors.slice(0, stopCount), fallbackHex);
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));

  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { h: hue, s: sat, l: light };
}

function matchesFamily(hex, family) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  switch (family) {
    case "white":
      return l >= 0.82 && s <= 0.2;
    case "yellow":
      return h >= 35 && h <= 70 && s >= 0.12 && l >= 0.45;
    case "red":
      return (h <= 20 || h >= 330) && s >= 0.25;
    case "blue":
      return h >= 190 && h <= 250 && s >= 0.2;
    case "green":
      return h >= 80 && h <= 160 && s >= 0.2;
    case "purple":
      return h >= 250 && h <= 330 && s >= 0.2;
    case "orange":
      return h >= 15 && h <= 45 && s >= 0.25;
    default:
      return true;
  }
}

export function paletteMatchesConstraints(stops, constraints) {
  if (!constraints?.strictPalette || constraints.families.length === 0) {
    return true;
  }

  const colors = stops.map((stop) => normalizeHex(stop.color)).filter(Boolean);
  if (colors.length === 0) {
    return false;
  }

  return colors.every((color) =>
    constraints.families.some((family) => matchesFamily(color, family))
  );
}

function countDistinctHues(colors) {
  const buckets = new Set();
  for (const color of colors) {
    const { r, g, b } = hexToRgb(color);
    const { h, s } = rgbToHsl(r, g, b);
    if (s < 0.12) continue;
    buckets.add(Math.round(h / 25));
  }
  return buckets.size;
}

function paletteMatchesUserRequest(stops, constraints) {
  const colors = [...new Set(stops.map((stop) => normalizeHex(stop.color)).filter(Boolean))];

  if (colors.length < Math.min(2, constraints.stopCount)) {
    return false;
  }

  if (constraints.wantsRainbow) {
    const hueCount = countDistinctHues(colors);
    return colors.length >= Math.min(constraints.stopCount, 5) && hueCount >= Math.min(4, constraints.stopCount - 1);
  }

  if (constraints.strictPalette) {
    return paletteMatchesConstraints(stops, constraints);
  }

  return colors.length >= 2;
}

function parsePosition(value, index, count) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1 && value <= 100) return value / 100;
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string") {
    const num = Number(value.trim().replace("%", ""));
    if (Number.isFinite(num)) {
      if (num > 1 && num <= 100) return num / 100;
      return Math.max(0, Math.min(1, num));
    }
  }
  if (count <= 1) return 0;
  return index / (count - 1);
}

function extractRawStops(payload) {
  if (Array.isArray(payload?.stops)) return payload.stops;
  if (Array.isArray(payload?.gradient)) return payload.gradient;
  if (Array.isArray(payload?.keyframes)) return payload.keyframes;
  return [];
}

export function parseAnimationFreshPaletteSuggestion(payload, fallbackHex = "#FFD700", mood = "") {
  const constraints = analyzeColorPrompt(mood);
  const safeFallback = ensureHex(fallbackHex);
  const raw = extractRawStops(payload);

  const mapped = raw
    .map((stop, index) => ({
      id: createAnimationColorStopId(),
      color: normalizeHex(stop?.color || stop?.hex) || safeFallback,
      position: parsePosition(stop?.position, index, raw.length),
    }))
    .filter((stop) => stop.color)
    .sort((a, b) => a.position - b.position);

  if (mapped.length < 2) {
    return synthesizePaletteFromConstraints(constraints, safeFallback);
  }

  if (!paletteMatchesUserRequest(mapped, constraints)) {
    return synthesizePaletteFromConstraints(constraints, safeFallback);
  }

  return layoutMappedStops(mapped, constraints.stopCount, safeFallback);
}

export function buildPromptConstraintsSummary(constraints) {
  if (!constraints) return "";
  const parts = [];
  if (constraints.families?.length) {
    parts.push(`Allowed families: ${constraints.families.join(", ")}.`);
  }
  parts.push(`Return exactly ${constraints.stopCount} stops.`);
  if (constraints.instruction) {
    parts.push(constraints.instruction);
  }
  return parts.join(" ");
}
