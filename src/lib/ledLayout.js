import { SK0L27_MAP, SK0L27_ZONES } from "./ledMaps/SK0L27";
import {
  buildLedMapFromStripLayout,
  buildZonesFromStripLayout,
  getWireTraversalSides,
  isValidStripCounts,
  resolveStripLayout,
} from "./zoneLayout";
import { ensureHex, normalizeHex, scaledRgb } from "./colorUtils";
import { attachModeColorsSnapshot } from "./modeColors";
import {
  buildGradientCss,
  buildGradientTrackBackground,
  clampGradientStopPosition,
  createGradientStopId,
  GRADIENT_STOP_MIN_GAP,
  defaultGradientStops,
  getActiveGradientStop,
  insertGradientStop,
  normalizeGradientStops,
  removeGradientStop,
  resolveGradientStops,
  sampleGradientAt,
  updateGradientStopColor,
  updateGradientStopPosition,
} from "./gradientStops";

export {
  buildGradientCss,
  buildGradientTrackBackground,
  clampGradientStopPosition,
  createGradientStopId,
  GRADIENT_STOP_MIN_GAP,
  defaultGradientStops,
  getActiveGradientStop,
  insertGradientStop,
  normalizeGradientStops,
  removeGradientStop,
  resolveGradientStops,
  sampleGradientAt,
  updateGradientStopColor,
  updateGradientStopPosition,
} from "./gradientStops";
import { COLOR_MODES } from "./colorModes";

export { COLOR_MODES } from "./colorModes";

export function isPerLedPreview(colorMode) {
  return colorMode === COLOR_MODES.LEDS;
}

export const LED_PAINT_MODES = {
  SOLID: "solid",
  GRADIENT: "gradient",
};

export const ZONE_IDS = ["top", "right", "bottom", "left"];

export const ZONE_ROTATION_OPTIONS = [
  { value: 0, label: "0°" },
  { value: 90, label: "90°" },
  { value: 180, label: "180°" },
  { value: 270, label: "270°" },
];

const ZONE_LABELS = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

export function normalizeZoneRotation(degrees) {
  const steps = Math.round(Number(degrees || 0) / 90) % 4;
  return ((steps % 4) + 4) % 4 * 90;
}

function physicalZoneId(logicalZoneId, rotationDegrees) {
  const logicalIndex = ZONE_IDS.indexOf(logicalZoneId);
  if (logicalIndex < 0) return logicalZoneId;
  const shift = normalizeZoneRotation(rotationDegrees) / 90;
  return ZONE_IDS[(logicalIndex + shift) % ZONE_IDS.length];
}

function rotateMapPoint([x, y], width, height, rotationDegrees) {
  const maxX = width - 1;
  const maxY = height - 1;
  switch (normalizeZoneRotation(rotationDegrees)) {
    case 90:
      return [y, maxX - x];
    case 180:
      return [maxX - x, maxY - y];
    case 270:
      return [maxY - y, x];
    default:
      return [x, y];
  }
}

export function getDefaultZoneColors(hex = "#FFD700") {
  return {
    top: hex,
    right: hex,
    bottom: hex,
    left: hex,
  };
}

export function getProfileZones(deviceModel, ledCount) {
  if (deviceModel === "SK0L27" && ledCount === SK0L27_MAP.points.length) {
    return SK0L27_ZONES.map((zone) => ({
      ...zone,
      indices: [...zone.indices],
    }));
  }
  return null;
}

function getBaseZones(deviceModel, ledCount, settings = null) {
  const layout = resolveStripLayout(settings, deviceModel, ledCount);
  if (layout) {
    return buildZonesFromStripLayout(layout);
  }

  const profileZones = getProfileZones(deviceModel, ledCount);
  if (profileZones) {
    return profileZones;
  }

  if (deviceModel === "SK0L27" && ledCount === 96) {
    return SK0L27_ZONES;
  }

  return [];
}

/**
 * Zones in wire traversal order (stripOrigin + stripDirection).
 * - wireSide / label / indices: physical strip along the wire (use for Test all UI + setPixels).
 * - id: diagram display id after zoneRotation (use for zone colors keyed to calibrated labels).
 */
export function getWireOrderedZones(deviceModel, ledCount, settings = null) {
  const layout = resolveStripLayout(settings, deviceModel, ledCount);
  if (!layout) return [];

  const sides = getWireTraversalSides(layout.origin, layout.direction);
  const baseZones = getBaseZones(deviceModel, ledCount, settings);
  const zonesById = Object.fromEntries(baseZones.map((zone) => [zone.id, zone]));
  const shift = normalizeZoneRotation(settings?.zoneRotation) / 90;

  return sides
    .map((wireSide) => {
      const zone = zonesById[wireSide];
      if (!zone?.indices?.length) return null;

      const wireIndex = ZONE_IDS.indexOf(wireSide);
      const displayId = ZONE_IDS[(wireIndex - shift + 4) % ZONE_IDS.length];

      return {
        wireSide,
        id: displayId, // calibrated diagram edge; not the physical monitor edge when zoneRotation !== 0
        label: ZONE_LABELS[wireSide] || zone.label,
        indices: zone.indices,
      };
    })
    .filter(Boolean);
}

/** How many LEDs to light during orientation (from index 0). */
export const CALIBRATION_FLASH_LED_COUNT = 16;

/** Consecutive indices starting at LED 0 (firmware order). */
export function getCalibrationFlashIndices(ledCount, maxCount = CALIBRATION_FLASH_LED_COUNT) {
  const total = Math.max(0, Number(ledCount) || 0);
  if (!total) return [0];
  const count = Math.max(1, Math.min(total, maxCount));
  return Array.from({ length: count }, (_, index) => index);
}

/** Logical zone on the diagram that contains a given LED index (before rotation). */
export function getLogicalZoneForLedIndex(
  deviceModel,
  ledCount,
  ledIndex,
  settings = null,
  zoneRotation = 0
) {
  const zones = getZones(deviceModel, ledCount, zoneRotation, settings);
  for (const zone of zones) {
    if (zone.indices.includes(ledIndex)) {
      return zone.id;
    }
  }
  return ZONE_IDS[0];
}

/** Zones in wire-traversal order; ids match the calibrated diagram labels. */
export function getZonesInWireOrder(deviceModel, ledCount, zoneRotation, settings) {
  return getWireOrderedZones(deviceModel, ledCount, {
    ...settings,
    zoneRotation: zoneRotation ?? settings?.zoneRotation ?? 0,
  });
}

export function getZones(deviceModel, ledCount, zoneRotation = 0, settings = null) {
  const baseZones = getBaseZones(deviceModel, ledCount, settings);
  const rotation = normalizeZoneRotation(zoneRotation);
  if (rotation === 0) {
    return baseZones;
  }

  const byId = Object.fromEntries(baseZones.map((zone) => [zone.id, zone]));
  return ZONE_IDS.map((logicalId) => {
    const physicalId = physicalZoneId(logicalId, rotation);
    const physical = byId[physicalId];
    return {
      id: logicalId,
      label: ZONE_LABELS[logicalId] || physical.label,
      indices: [...physical.indices],
    };
  });
}

export function getLedMap(deviceModel, ledCount, zoneRotation = 0, settings = null) {
  if (deviceModel === "SK0L27" && ledCount === SK0L27_MAP.points.length) {
    const rotation = normalizeZoneRotation(zoneRotation);
    if (rotation === 0) {
      return SK0L27_MAP;
    }

    const swapDimensions = rotation === 90 || rotation === 270;
    const points = SK0L27_MAP.points.map((point) =>
      rotateMapPoint(point, SK0L27_MAP.width, SK0L27_MAP.height, rotation)
    );

    return {
      width: swapDimensions ? SK0L27_MAP.height : SK0L27_MAP.width,
      height: swapDimensions ? SK0L27_MAP.width : SK0L27_MAP.height,
      points,
    };
  }

  const layout = resolveStripLayout(settings, deviceModel, ledCount);
  if (!layout) {
    return null;
  }

  return buildLedMapFromStripLayout(layout, ledCount, zoneRotation);
}

export function ensureLedColors(settings, ledCount) {
  if (Array.isArray(settings.ledColors) && settings.ledColors.length === ledCount) {
    return settings.ledColors;
  }
  return Array.from({ length: ledCount }, () => settings.hex);
}

export function getZoneRepresentativeColor(ledColors, zone, fallbackHex) {
  if (!zone) return fallbackHex;
  for (const index of zone.indices) {
    if (ledColors[index]) return ledColors[index];
  }
  return fallbackHex;
}

export function getSelectedLeds(settings, ledCount) {
  if (settings.selectedLed == null) {
    return [];
  }

  if (Array.isArray(settings.selectedLeds) && settings.selectedLeds.length > 0) {
    return [...new Set(settings.selectedLeds)]
      .filter((index) => index >= 0 && index < ledCount)
      .sort((a, b) => a - b);
  }

  const selectedLed = Math.max(0, Math.min(ledCount - 1, settings.selectedLed ?? 0));
  return [selectedLed];
}

export function getSelectionLabel(settings, ledCount) {
  const selected = getSelectedLeds(settings, ledCount);
  if (selected.length === 0) {
    return "No LEDs selected";
  }
  if (selected.length > 1) {
    return `${selected.length} LEDs selected`;
  }
  return `LED ${selected[0] + 1} of ${ledCount}`;
}

export function isLedActive(index, settings, ledCount) {
  return getSelectedLeds(settings, ledCount).includes(index);
}

export function buildLedSelectionPatch(settings, ledCount, index) {
  const ledColors = ensureLedColors(settings, ledCount);
  return {
    selectedLed: index,
    selectedLeds: [index],
    hex: ledColors[index] || settings.hex,
  };
}

export function buildLedClearSelectionPatch() {
  return {
    selectedLed: null,
    selectedLeds: null,
  };
}

export function buildLedsSelectionPatch(settings, ledCount, indices, deviceModel) {
  const selectedLeds = [...new Set(indices)]
    .filter((index) => index >= 0 && index < ledCount)
    .sort((a, b) => a - b);

  if (selectedLeds.length === 0) {
    return null;
  }

  const ledColors = ensureLedColors(settings, ledCount);
  const patch = {
    selectedLed: selectedLeds[0],
    selectedLeds,
    hex: ledColors[selectedLeds[0]] || settings.hex,
  };

  if (selectedLeds.length > 1 && settings.ledPaintMode === LED_PAINT_MODES.GRADIENT) {
    const gradientStops = resolveGradientStops(settings, patch.hex);
    patch.gradientStops = gradientStops;
    patch.gradientActiveStopId = settings.gradientActiveStopId || gradientStops[0]?.id;
    patch.ledColors = applyGradientToIndices(
      ledColors,
      selectedLeds,
      gradientStops,
      deviceModel,
      ledCount,
      settings.zoneRotation ?? 0,
      settings
    );
  }

  return patch;
}

const STRIP_GRID_COLS = 8;

function getGradientPosition(index, ledMap) {
  if (ledMap?.points?.[index]) {
    const [x, y] = ledMap.points[index];
    return { x, y };
  }

  return {
    x: index % STRIP_GRID_COLS,
    y: Math.floor(index / STRIP_GRID_COLS),
  };
}

/** Apply multi-stop gradient top → bottom using map coordinates. */
export function applyGradientToIndices(
  ledColors,
  indices,
  gradientStops,
  deviceModel,
  ledCount,
  zoneRotation = 0,
  settings = null
) {
  const next = [...ledColors];
  const stops = normalizeGradientStops(gradientStops);
  const unique = [...new Set(indices)].filter((index) => index >= 0 && index < ledCount);
  if (unique.length === 0) {
    return next;
  }

  const ledMap = getLedMap(deviceModel, ledCount, zoneRotation, settings);
  const positioned = unique.map((index) => ({
    index,
    ...getGradientPosition(index, ledMap),
  }));

  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;

  for (const { x, y } of positioned) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  const yRange = maxY - minY;
  const xRange = maxX - minX;

  for (const { index, x, y } of positioned) {
    let t = 0;
    if (yRange > 0) {
      t = (y - minY) / yRange;
    } else if (xRange > 0) {
      t = (x - minX) / xRange;
    }
    next[index] = sampleGradientAt(stops, t);
  }

  return next;
}

export function buildGradientPaintPatch(settings, ledCount, deviceModel, partial = {}) {
  const selected = getSelectedLeds(settings, ledCount);
  if (selected.length < 2) {
    return null;
  }

  const ledColors = ensureLedColors(settings, ledCount);
  const gradientStops = normalizeGradientStops(
    partial.gradientStops ?? resolveGradientStops(settings, settings.hex),
    settings.hex
  );
  const gradientActiveStopId =
    partial.gradientActiveStopId ?? settings.gradientActiveStopId ?? gradientStops[0]?.id;
  const activeStop =
    gradientStops.find((stop) => stop.id === gradientActiveStopId) || gradientStops[0];

  return {
    ledPaintMode: LED_PAINT_MODES.GRADIENT,
    gradientStops,
    gradientActiveStopId,
    ledColors: applyGradientToIndices(
      ledColors,
      selected,
      gradientStops,
      deviceModel,
      ledCount,
      settings.zoneRotation ?? 0,
      settings
    ),
    hex: activeStop?.color || settings.hex,
  };
}

export function isGradientPaintActive(settings, ledCount) {
  return (
    settings.colorMode === COLOR_MODES.LEDS &&
    getSelectedLeds(settings, ledCount).length > 1 &&
    settings.ledPaintMode === LED_PAINT_MODES.GRADIENT
  );
}

export function migrateLegacyZoneColors(settings, ledCount, deviceModel) {
  if (!settings.zoneColors) return null;

  const hasValidLedColors =
    Array.isArray(settings.ledColors) && settings.ledColors.length === ledCount;
  if (hasValidLedColors) {
    return { zoneColors: undefined };
  }

  const zones = getZones(deviceModel, ledCount, settings.zoneRotation ?? 0, settings);
  const zoneColors = { ...getDefaultZoneColors(settings.hex), ...settings.zoneColors };
  const ledColors = ensureLedColors(settings, ledCount);

  for (const zone of zones) {
    const color = zoneColors[zone.id] || settings.hex;
    for (const index of zone.indices) {
      if (index >= 0 && index < ledCount) {
        ledColors[index] = color;
      }
    }
  }

  return { ledColors, zoneColors: undefined };
}

export function buildPixelBuffer(settings, ledCount, deviceModel) {
  const brightness = settings.brightness ?? 100;
  const pixels = new Uint8Array(ledCount * 3);

  if (settings.colorMode === COLOR_MODES.LEDS) {
    const ledColors = ensureLedColors(settings, ledCount);
    for (let index = 0; index < ledCount; index += 1) {
      const { r, g, b } = scaledRgb(ledColors[index] || settings.hex, brightness);
      const offset = index * 3;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
    }
    return pixels;
  }

  const { r, g, b } = scaledRgb(settings.hex, brightness);
  for (let index = 0; index < ledCount; index += 1) {
    const offset = index * 3;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
  }
  return pixels;
}

export function buildFlashBuffer(ledCount, litIndices, hex, brightness = 100) {
  const pixels = new Uint8Array(ledCount * 3);
  const { r, g, b } = scaledRgb(hex, brightness);
  for (const index of litIndices) {
    if (index >= 0 && index < ledCount) {
      const offset = index * 3;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
    }
  }
  return pixels;
}

/** Zone colors shared by diagram dots/edges and physical LED zone flash (Test all, inspect). */
export const ZONE_DIAGRAM_COLORS = {
  top: "#C8860A",
  right: "#E57373",
  bottom: "#5CB88A",
  left: "#6B9FD4",
};

/** @deprecated Use ZONE_DIAGRAM_COLORS — kept as alias for existing imports. */
export const ZONE_TEST_COLORS = ZONE_DIAGRAM_COLORS;

export function getZoneColor(zoneId, fallback = "#8b949e") {
  return ZONE_DIAGRAM_COLORS[zoneId] || fallback;
}

export function pixelBufferKey(pixels) {
  let hash = 2166136261;
  for (let i = 0; i < pixels.length; i += 1) {
    hash ^= pixels[i];
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}:${pixels.length}`;
}

export function applyHexToSettings(settings, hex, ledCount, deviceModel) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  if (settings.colorMode === COLOR_MODES.SINGLE) {
    return attachModeColorsSnapshot(settings, { hex: normalized });
  }

  const selected = getSelectedLeds(settings, ledCount);
  const ledColors = ensureLedColors(settings, ledCount);

  if (selected.length > 1 && settings.ledPaintMode === LED_PAINT_MODES.GRADIENT) {
    const gradientStops = resolveGradientStops(settings, normalized);
    const activeId = settings.gradientActiveStopId || gradientStops[0]?.id;
    const nextStops = updateGradientStopColor(gradientStops, activeId, normalized);

    return attachModeColorsSnapshot(settings, {
      hex: normalized,
      gradientStops: nextStops,
      gradientActiveStopId: activeId,
      ledColors: applyGradientToIndices(
        ledColors,
        selected,
        nextStops,
        deviceModel,
        ledCount,
        settings.zoneRotation ?? 0,
        settings
      ),
    });
  }

  const next = [...ledColors];
  for (const index of selected) {
    next[index] = normalized;
  }

  return attachModeColorsSnapshot(settings, { hex: normalized, ledColors: next });
}
