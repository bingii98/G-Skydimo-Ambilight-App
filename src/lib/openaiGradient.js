import { parseAnimationFreshPaletteSuggestion } from "./animationPalettePrompt";
import { ensureHex, hslToHex, interpolateHex, normalizeHex } from "./colorUtils";
import {
  createGradientStopId,
  GRADIENT_STOP_MIN_GAP,
  normalizeGradientStops,
} from "./gradientStops";

export const AI_GRADIENT_MODES = {
  BLEND: "blend",
  FRESH: "fresh",
};

/** Top and bottom keyframe colors from the current gradient (by position). */
export function getGradientAnchorPair(stops, fallbackHex = "#FFD700") {
  const normalized = normalizeGradientStops(stops, fallbackHex);
  const top = normalized[0];
  const bottom = normalized[normalized.length - 1];
  return {
    colorFrom: top.color,
    colorTo: bottom.color,
    topPosition: top.position,
    bottomPosition: bottom.position,
  };
}

/** Color on the blend line between anchors at a given track position. */
function colorBetweenAnchors(colorFrom, colorTo, topPosition, bottomPosition, position) {
  const span = bottomPosition - topPosition;
  const t = span <= 0 ? 0.5 : (position - topPosition) / span;
  return interpolateHex(colorFrom, colorTo, Math.max(0, Math.min(1, t)));
}

function parsePosition(value, index, count) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1 && value <= 100) return value / 100;
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace("%", "");
    const num = Number(trimmed);
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

function stopsNeedRandomFallback(mapped) {
  if (mapped.length < 3) return true;

  const positions = mapped.map((stop) => stop.position).sort((a, b) => a - b);
  const span = positions[positions.length - 1] - positions[0];
  if (span < 0.12) return true;

  const uniquePositions = new Set(positions.map((p) => Math.round(p * 50)));
  if (uniquePositions.size < 2) return true;

  const uniqueColors = new Set(mapped.map((stop) => stop.color));
  return uniqueColors.size < 2;
}

/** Random LED-friendly gradient (3–5 stops, spread 0→1). */
export function buildRandomFreshGradient(stopCount) {
  const count = Math.max(
    3,
    Math.min(5, stopCount || 3 + Math.floor(Math.random() * 3))
  );
  const baseHue = Math.random() * 360;
  const stops = [];

  for (let index = 0; index < count; index += 1) {
    const position = count === 1 ? 0 : index / (count - 1);
    const hue =
      (baseHue + index * (38 + Math.random() * 40) + Math.random() * 18) % 360;
    stops.push({
      id: createGradientStopId(),
      position,
      color: hslToHex(
        hue,
        0.72 + Math.random() * 0.22,
        0.38 + Math.random() * 0.22
      ),
    });
  }

  return normalizeGradientStops(stops);
}

function layoutFreshStopsFromColors(colors, fallbackHex) {
  const safeFallback = ensureHex(fallbackHex);
  const pool = colors
    .map((color) => normalizeHex(color))
    .filter(Boolean);

  const targetCount = Math.max(3, Math.min(5, pool.length || 4));
  const unique = [...new Set(pool)];

  while (unique.length < targetCount) {
    const hue = Math.random() * 360;
    unique.push(hslToHex(hue, 0.8, 0.5));
  }

  const picks = unique.slice(0, targetCount);
  const stops = picks.map((color, index) => ({
    id: createGradientStopId(),
    color,
    position: index / (targetCount - 1),
  }));

  return normalizeGradientStops(stops, safeFallback);
}

function spaceParsedStops(sorted, fallbackHex) {
  const spaced = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const stop = sorted[index];
    if (index === 0) {
      spaced.push({
        ...stop,
        position: Math.max(0, Math.min(1, stop.position)),
      });
      continue;
    }
    const prev = spaced[index - 1];
    const minPos = prev.position + GRADIENT_STOP_MIN_GAP;
    spaced.push({
      ...stop,
      position: Math.max(minPos, Math.min(1, stop.position)),
    });
  }

  return normalizeGradientStops(spaced, fallbackHex);
}

/**
 * @param {{ stops?: Array<{ color?: string, hex?: string, position?: number | string }> }} payload
 * @param {string} fallbackHex
 */
export function parseFreshGradientSuggestion(payload, fallbackHex = "#FFD700", mood = "") {
  return parseAnimationFreshPaletteSuggestion(payload, fallbackHex, mood);
}

/**
 * @param {{ stops?: Array<{ color?: string, hex?: string, position?: number | string }> }} payload
 * @param {string} fallbackHex
 * @param {{ colorFrom: string, colorTo: string, topPosition: number, bottomPosition: number }} anchors
 */
export function parseBlendGradientSuggestion(payload, fallbackHex = "#FFD700", anchors = null) {
  const safeFallback = ensureHex(fallbackHex);
  const anchorFrom = normalizeHex(anchors?.colorFrom) || safeFallback;
  const anchorTo = normalizeHex(anchors?.colorTo) || safeFallback;
  const anchorTopPos =
    typeof anchors?.topPosition === "number" ? anchors.topPosition : 0;
  const anchorBottomPos =
    typeof anchors?.bottomPosition === "number" ? anchors.bottomPosition : 1;
  const raw = Array.isArray(payload?.stops) ? payload.stops : [];

  const mapped = raw
    .map((stop, index) => ({
      id: createGradientStopId(),
      color: normalizeHex(stop?.color || stop?.hex) || safeFallback,
      position: parsePosition(stop?.position, index, raw.length),
    }))
    .filter((stop) => stop.color);

  if (mapped.length < 2) {
    throw new Error("AI returned fewer than 2 gradient colors");
  }

  const sorted = [...mapped].sort((a, b) => a.position - b.position);
  const spaced = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const stop = sorted[index];
    if (index === 0) {
      spaced.push({
        ...stop,
        color: anchorFrom,
        position: Math.max(0, Math.min(1, anchorTopPos)),
      });
      continue;
    }
    const prev = spaced[index - 1];
    const minPos = prev.position + GRADIENT_STOP_MIN_GAP;
    const isLast = index === sorted.length - 1;
    const position = isLast
      ? Math.max(minPos, Math.min(1, anchorBottomPos))
      : Math.max(minPos, Math.min(1, stop.position));
    const color = isLast
      ? anchorTo
      : colorBetweenAnchors(anchorFrom, anchorTo, anchorTopPos, anchorBottomPos, position);
    spaced.push({
      ...stop,
      color,
      position,
    });
  }

  if (spaced.length === 1) {
    spaced.push({
      id: createGradientStopId(),
      color: anchorTo,
      position: Math.max(anchorTopPos + GRADIENT_STOP_MIN_GAP, anchorBottomPos),
    });
  }

  return normalizeGradientStops(spaced, safeFallback);
}
