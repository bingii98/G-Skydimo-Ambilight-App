import { ensureHex, interpolateHex, normalizeHex } from "./colorUtils";

let gradientStopCounter = 0;

const DEFAULT_GRADIENT_STOP_IDS = {
  start: "gs-start",
  end: "gs-end",
};

/** Minimum spacing between adjacent keyframes on the gradient track. */
export const GRADIENT_STOP_MIN_GAP = 0.04;

export function createGradientStopId() {
  gradientStopCounter += 1;
  return `gs-${gradientStopCounter}`;
}

export function defaultGradientStops(hex = "#FFD700") {
  const safeHex = ensureHex(hex);
  return [
    { id: DEFAULT_GRADIENT_STOP_IDS.start, position: 0, color: safeHex },
    { id: DEFAULT_GRADIENT_STOP_IDS.end, position: 1, color: "#FF0066" },
  ];
}

export function normalizeGradientStops(stops, fallbackHex = "#FFD700") {
  const safeFallback = ensureHex(fallbackHex);
  const normalized = (Array.isArray(stops) ? stops : [])
    .filter((stop) => stop && typeof stop === "object")
    .map((stop) => ({
      id: typeof stop.id === "string" && stop.id ? stop.id : createGradientStopId(),
      position: Math.max(0, Math.min(1, Number(stop.position) || 0)),
      color: normalizeHex(stop.color) || safeFallback,
    }))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  if (normalized.length === 0) {
    return defaultGradientStops(safeFallback);
  }

  if (normalized.length === 1) {
    normalized.push({
      id: createGradientStopId(),
      position: 1,
      color: safeFallback,
    });
  }

  return normalized;
}

export function clampGradientStopPosition(stops, stopId, position) {
  const normalized = normalizeGradientStops(stops);
  const index = normalized.findIndex((stop) => stop.id === stopId);
  if (index < 0) {
    return Math.max(0, Math.min(1, position));
  }

  const clamped = Math.max(0, Math.min(1, position));
  let minPos = 0;
  let maxPos = 1;

  if (index > 0) {
    minPos = normalized[index - 1].position + GRADIENT_STOP_MIN_GAP;
  }
  if (index < normalized.length - 1) {
    maxPos = normalized[index + 1].position - GRADIENT_STOP_MIN_GAP;
  }

  if (minPos > maxPos) {
    return normalized[index].position;
  }

  return Math.max(minPos, Math.min(maxPos, clamped));
}

export function resolveGradientStops(settings, fallbackHex = "#FFD700") {
  const safeFallback = ensureHex(fallbackHex);
  if (Array.isArray(settings?.gradientStops) && settings.gradientStops.length >= 2) {
    return normalizeGradientStops(settings.gradientStops, safeFallback);
  }

  const from = settings?.gradientFrom || safeFallback;
  const to = settings?.gradientTo || "#FF0066";
  return normalizeGradientStops(
    [
      { id: DEFAULT_GRADIENT_STOP_IDS.start, position: 0, color: from },
      { id: DEFAULT_GRADIENT_STOP_IDS.end, position: 1, color: to },
    ],
    safeFallback
  );
}

export function sampleGradientAt(stops, t) {
  const normalized = normalizeGradientStops(stops);
  const clamped = Math.max(0, Math.min(1, t));

  if (clamped <= normalized[0].position) {
    return normalized[0].color;
  }

  const last = normalized[normalized.length - 1];
  if (clamped >= last.position) {
    return last.color;
  }

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const start = normalized[index];
    const end = normalized[index + 1];
    if (clamped >= start.position && clamped <= end.position) {
      const range = end.position - start.position;
      const localT = range === 0 ? 0 : (clamped - start.position) / range;
      return interpolateHex(start.color, end.color, localT);
    }
  }

  return last.color;
}

function formatGradientStopPercent(position) {
  const pct = position * 100;
  if (pct <= 0) return "0%";
  if (pct >= 100) return "100%";
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/** Checkerboard underlay so dark / saturated stops read clearly on the track. */
export const GRADIENT_TRACK_CHECKERBOARD =
  "repeating-conic-gradient(from 45deg, #e4ebe7 0% 25%, #f3f7f5 0% 50%) 0 0 / 10px 10px";

export function buildGradientCss(stops, direction = "180deg") {
  const normalized = normalizeGradientStops(stops);
  const parts = normalized.map(
    (stop) => `${stop.color} ${formatGradientStopPercent(stop.position)}`
  );
  return `linear-gradient(${direction}, ${parts.join(", ")})`;
}

export function buildGradientTrackBackground(stops, direction = "180deg") {
  return `${buildGradientCss(stops, direction)}, ${GRADIENT_TRACK_CHECKERBOARD}`;
}

export function getActiveGradientStop(settings, fallbackHex = "#FFD700") {
  const stops = resolveGradientStops(settings, fallbackHex);
  const activeId = settings?.gradientActiveStopId;
  return stops.find((stop) => stop.id === activeId) || stops[0];
}

export function updateGradientStopColor(stops, stopId, color) {
  const normalized = normalizeHex(color);
  if (!normalized) {
    return normalizeGradientStops(stops);
  }

  return normalizeGradientStops(
    stops.map((stop) => (stop.id === stopId ? { ...stop, color: normalized } : stop))
  );
}

export function updateGradientStopPosition(stops, stopId, position) {
  const normalized = normalizeGradientStops(stops);
  const index = normalized.findIndex((stop) => stop.id === stopId);
  if (index < 0) {
    return normalized;
  }

  const nextPosition = clampGradientStopPosition(normalized, stopId, position);
  const next = normalized.map((stop) =>
    stop.id === stopId ? { ...stop, position: nextPosition } : stop
  );

  return normalizeGradientStops(next);
}

export function insertGradientStop(stops, position, color) {
  const normalized = normalizeGradientStops(stops);
  const clamped = Math.max(0, Math.min(1, position));
  const nextColor = normalizeHex(color) || sampleGradientAt(normalized, clamped);
  return normalizeGradientStops([
    ...normalized,
    { id: createGradientStopId(), position: clamped, color: nextColor },
  ]);
}

export function removeGradientStop(stops, stopId) {
  const normalized = normalizeGradientStops(stops);
  if (normalized.length <= 2) {
    return normalized;
  }

  const index = normalized.findIndex((stop) => stop.id === stopId);
  if (index < 0) {
    return normalized;
  }

  return normalizeGradientStops(normalized.filter((stop) => stop.id !== stopId));
}
