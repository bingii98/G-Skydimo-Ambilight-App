import { ensureHex, normalizeHex } from "./colorUtils";
import { migrateAnimationId } from "./animationCatalog";
import {
  clampGradientStopPosition,
  createGradientStopId,
  defaultGradientStops,
  GRADIENT_STOP_MIN_GAP,
  insertGradientStop,
  normalizeGradientStops,
  removeGradientStop,
  sampleGradientAt,
  updateGradientStopColor,
  updateGradientStopPosition,
} from "./gradientStops";

export const ANIMATION_PALETTE = {
  SINGLE: "single",
  MULTI: "multi",
};

function paletteStops(...colors) {
  if (colors.length <= 1) {
    const color = ensureHex(colors[0] || "#FFD700");
    return [
      { id: "anim-single", position: 0, color },
      { id: "anim-single-end", position: 1, color },
    ];
  }

  return colors.map((color, index) => ({
    id: `anim-default-${index}`,
    position: index / (colors.length - 1),
    color: ensureHex(color),
  }));
}

const DEFAULT_ANIMATION_COLOR_STOPS = {
  rainbow: paletteStops("#FF0000", "#FF8800", "#FFFF00", "#00FF00", "#0088FF", "#8800FF"),
  chase: paletteStops("#FFD700", "#FF0066"),
  breathe: paletteStops("#00CCAA"),
  wave: paletteStops("#00AAFF", "#8800FF", "#FF0066"),
  sparkle: paletteStops("#FFFFFF", "#FFD700", "#88CCFF"),
  fire: paletteStops("#FF2200", "#FF8800", "#FFDD00"),
  aurora: paletteStops("#00FF88", "#0088FF", "#8800FF"),
  pulse: paletteStops("#FF0066"),
  strobe: paletteStops("#FFFFFF"),
  police: paletteStops("#FF0000", "#0000FF"),
  heartbeat: paletteStops("#FF2244"),
  scanner: paletteStops("#FF0044"),
  meteor: paletteStops("#FFFFFF", "#88CCFF", "#001133"),
  lightning: paletteStops("#AADDFF", "#FFFFFF", "#4488FF"),
  spectrum: paletteStops("#FF0000", "#00FF00", "#0000FF", "#FF00FF"),
  fade: paletteStops("#6600FF", "#FF0066", "#00CCFF"),
};

export function defaultAnimationColorStops(hex = "#FFD700") {
  return defaultGradientStops(hex);
}

export function defaultAnimationColorStopsForId(animationId, fallbackHex = "#FFD700") {
  const preset = DEFAULT_ANIMATION_COLOR_STOPS[animationId];
  if (preset) {
    return normalizeAnimationColorStops(preset, fallbackHex);
  }
  return defaultAnimationColorStops(fallbackHex);
}

export function normalizeAnimationColorStops(stops, fallbackHex = "#FFD700") {
  return normalizeGradientStops(stops, fallbackHex);
}

function readStoredAnimationColors(settings, animationId) {
  if (!animationId || typeof animationId !== "string") {
    return null;
  }

  const stored = settings?.animationColorsById?.[animationId];
  if (!stored || !Array.isArray(stored.animationColorStops) || stored.animationColorStops.length === 0) {
    return null;
  }

  return stored;
}

export function normalizeAnimationColorsById(map, fallbackHex = "#FFD700") {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return {};
  }

  const next = {};
  for (const [animationId, entry] of Object.entries(map)) {
    if (!animationId || !entry || typeof entry !== "object") {
      continue;
    }

    const stops = normalizeAnimationColorStops(entry.animationColorStops, fallbackHex);
    if (stops.length === 0) {
      continue;
    }

    const activeExists = stops.some((stop) => stop.id === entry.animationActiveColorStopId);
    next[animationId] = {
      animationColorStops: stops,
      animationActiveColorStopId: activeExists
        ? entry.animationActiveColorStopId
        : stops[0]?.id ?? null,
    };
  }

  return next;
}

export function resolveAnimationColorStops(
  settings,
  fallbackHex = "#FFD700",
  animationId = settings?.animationId
) {
  const safeFallback = ensureHex(fallbackHex);
  const baseHex = ensureHex(settings?.hex, safeFallback);

  const stored = readStoredAnimationColors(settings, animationId);
  if (stored) {
    return normalizeAnimationColorStops(stored.animationColorStops, baseHex);
  }

  if (
    animationId === settings?.animationId &&
    Array.isArray(settings?.animationColorStops) &&
    settings.animationColorStops.length >= 1
  ) {
    return normalizeAnimationColorStops(settings.animationColorStops, baseHex);
  }

  const secondaryHex = ensureHex(settings?.animationSecondaryHex, "#FF0066");

  if (Array.isArray(settings?.gradientStops) && settings.gradientStops.length >= 2) {
    return normalizeAnimationColorStops(settings.gradientStops, baseHex);
  }

  if (animationId) {
    return defaultAnimationColorStopsForId(animationId, baseHex);
  }

  return normalizeAnimationColorStops(
    [
      { id: "anim-start", position: 0, color: baseHex },
      { id: "anim-end", position: 1, color: secondaryHex },
    ],
    baseHex
  );
}

export function sampleAnimationColor(stops, t) {
  return sampleGradientAt(stops, t);
}

export function getAnimationPrimaryColor(settings, fallbackHex = "#FFD700", animationId = settings?.animationId) {
  const stops = resolveAnimationColorStops(settings, fallbackHex, animationId);
  const stored = readStoredAnimationColors(settings, animationId);
  const activeId =
    stored?.animationActiveColorStopId ??
    (animationId === settings?.animationId ? settings?.animationActiveColorStopId : null);
  const active = stops.find((stop) => stop.id === activeId);
  return active?.color || stops[0]?.color || ensureHex(fallbackHex);
}

export function getAnimationSecondaryColor(settings, fallbackHex = "#FFD700", animationId = settings?.animationId) {
  const stops = resolveAnimationColorStops(settings, fallbackHex, animationId);
  return stops[stops.length - 1]?.color || ensureHex(settings?.animationSecondaryHex, "#FF0066");
}

export function updateAnimationStopColor(stops, stopId, color) {
  return updateGradientStopColor(stops, stopId, color);
}

export function insertAnimationColorStop(stops, position, color) {
  return insertGradientStop(stops, position, color);
}

export function removeAnimationColorStop(stops, stopId) {
  return removeGradientStop(stops, stopId);
}

export function updateAnimationStopPosition(stops, stopId, position) {
  return updateGradientStopPosition(stops, stopId, position);
}

export function clampAnimationStopPosition(stops, stopId, position) {
  return clampGradientStopPosition(stops, stopId, position);
}

export { GRADIENT_STOP_MIN_GAP as ANIMATION_STOP_MIN_GAP };

export function syncAnimationHexFields(stops, activeStopId) {
  const normalized = normalizeAnimationColorStops(stops);
  const active =
    normalized.find((stop) => stop.id === activeStopId) ||
    normalized[0] ||
    null;

  return {
    animationColorStops: normalized,
    animationActiveColorStopId: active?.id || normalized[0]?.id || null,
    hex: active?.color || normalized[0]?.color || "#FFD700",
    animationSecondaryHex: normalized[normalized.length - 1]?.color || "#FF0066",
  };
}

export function buildAnimationColorPatch(settings, partial = {}) {
  const animationId = settings?.animationId;
  const stops = normalizeAnimationColorStops(
    partial.animationColorStops ??
      resolveAnimationColorStops(settings, settings?.hex, animationId),
    settings?.hex
  );
  const activeId =
    partial.animationActiveColorStopId ??
    settings?.animationActiveColorStopId ??
    stops[0]?.id ??
    null;

  const colorPatch = syncAnimationHexFields(stops, activeId);

  if (!animationId || typeof animationId !== "string") {
    return colorPatch;
  }

  return {
    ...colorPatch,
    animationColorsById: {
      ...(settings?.animationColorsById || {}),
      [animationId]: {
        animationColorStops: colorPatch.animationColorStops,
        animationActiveColorStopId: colorPatch.animationActiveColorStopId,
      },
    },
  };
}

export function persistCurrentAnimationColors(settings) {
  const currentId = settings?.animationId;
  if (!currentId || typeof currentId !== "string") {
    return normalizeAnimationColorsById(settings?.animationColorsById, settings?.hex);
  }

  const stops = normalizeAnimationColorStops(
    settings?.animationColorStops ??
      resolveAnimationColorStops(settings, settings?.hex, currentId),
    settings?.hex
  );
  const activeId = settings?.animationActiveColorStopId || stops[0]?.id || null;

  return normalizeAnimationColorsById(
    {
      ...(settings?.animationColorsById || {}),
      [currentId]: {
        animationColorStops: stops,
        animationActiveColorStopId: activeId,
      },
    },
    settings?.hex
  );
}

export function buildAnimationSwitchPatch(settings, nextAnimationId) {
  if (!nextAnimationId || typeof nextAnimationId !== "string") {
    return { animationId: null };
  }

  const animationId = migrateAnimationId(nextAnimationId);
  const map = persistCurrentAnimationColors(settings);
  const stored = map[animationId];
  const stops = stored?.animationColorStops
    ? normalizeAnimationColorStops(stored.animationColorStops, settings?.hex)
    : defaultAnimationColorStopsForId(animationId, settings?.hex);
  const activeId = stored?.animationActiveColorStopId || stops[0]?.id || null;
  const colorPatch = syncAnimationHexFields(stops, activeId);

  return {
    animationId,
    ...colorPatch,
    animationColorsById: {
      ...map,
      [animationId]: {
        animationColorStops: colorPatch.animationColorStops,
        animationActiveColorStopId: colorPatch.animationActiveColorStopId,
      },
    },
  };
}

export function pickAnimationPaletteColor(stops, seed) {
  const normalized = normalizeAnimationColorStops(stops);
  if (normalized.length === 1) {
    return normalized[0].color;
  }

  const rand = Math.abs(Math.sin(seed * 12.9898) * 43758.5453);
  const index = Math.floor((rand % 1) * normalized.length);
  return normalized[Math.min(index, normalized.length - 1)].color;
}

export function orderedAnimationColors(stops) {
  return [...normalizeAnimationColorStops(stops)].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id)
  );
}

export function createAnimationColorStopId() {
  return createGradientStopId();
}

export function normalizeAnimationColorHex(value, fallback = "#FFD700") {
  return normalizeHex(value) || ensureHex(fallback);
}
