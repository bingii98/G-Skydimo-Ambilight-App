import { SK0L27_ZONES } from "./ledMaps/SK0L27";
import {
  computeStripCountsFromCalibration,
  edgeLengthToStartType,
} from "./skydimoStripCounts.js";

export const STRIP_SIDES = ["top", "right", "bottom", "left"];

const ZONE_IDS = ["top", "right", "bottom", "left"];

const ZONE_LABELS = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

function normalizeZoneRotation(degrees) {
  const steps = Math.round(Number(degrees || 0) / 90) % 4;
  return ((steps % 4) + 4) % 4 * 90;
}

export const STRIP_ORIGINS = [
  { value: "bottom-left", label: "Bottom-left" },
  { value: "bottom-right", label: "Bottom-right" },
  { value: "top-left", label: "Top-left" },
  { value: "top-right", label: "Top-right" },
];

export const STRIP_DIRECTIONS = [
  { value: "cw", label: "Clockwise" },
  { value: "ccw", label: "Counter-clockwise" },
];

/** Side order when walking the frame from a corner (8 install corners × CW/CCW). */
export const CALIBRATION_TRAVERSAL_ORDERS = {
  "bottom-left": { cw: ["left", "top", "right", "bottom"], ccw: ["bottom", "right", "top", "left"] },
  "bottom-right": { cw: ["bottom", "left", "top", "right"], ccw: ["right", "top", "left", "bottom"] },
  "top-left": { cw: ["left", "bottom", "right", "top"], ccw: ["top", "right", "bottom", "left"] },
  "top-right": { cw: ["top", "left", "bottom", "right"], ccw: ["right", "bottom", "left", "top"] },
};

const TRAVERSAL_ORDERS = CALIBRATION_TRAVERSAL_ORDERS;

/** Perimeter ratio for a 16:9 frame — vertical strips longer than horizontal. */
const HORIZ_UNITS = 9;
const VERT_UNITS = 16;
const PERIMETER_UNITS = HORIZ_UNITS * 2 + VERT_UNITS * 2;

export function proportionalStripCounts(ledCount) {
  const total = Math.max(4, Math.round(Number(ledCount) || 0));
  const counts = {
    top: Math.max(1, Math.round((total * HORIZ_UNITS) / PERIMETER_UNITS)),
    bottom: Math.max(1, Math.round((total * HORIZ_UNITS) / PERIMETER_UNITS)),
    left: Math.max(1, Math.round((total * VERT_UNITS) / PERIMETER_UNITS)),
    right: Math.max(1, Math.round((total * VERT_UNITS) / PERIMETER_UNITS)),
  };

  let delta = total - stripCountsTotal(counts);
  const adjustOrder = ["right", "left", "top", "bottom"];
  let i = 0;
  while (delta !== 0 && i < 200) {
    const side = adjustOrder[i % adjustOrder.length];
    if (delta > 0) {
      counts[side] += 1;
      delta -= 1;
    } else if (counts[side] > 1) {
      counts[side] -= 1;
      delta += 1;
    }
    i += 1;
  }

  return counts;
}

/** Profile zone index totals (physical map only — not used for layout counts after calibrate). */
export function getProfileZoneIndexCounts(deviceModel, ledCount) {
  if (deviceModel === "SK0L27" && ledCount === 96) {
    return stripCountsFromZones(SK0L27_ZONES);
  }
  return null;
}

/** Skydimo formula counts for a known profile wire path (short start on first edge). */
export function getProfileStripCounts(deviceModel, ledCount) {
  const wirePath = getProfileWirePath(deviceModel, ledCount);
  if (!wirePath) return null;
  const startEdge = getZoneForWirePath(wirePath.origin, wirePath.direction);
  return computeStripCountsFromCalibration({
    totalLed: ledCount,
    direction: wirePath.direction,
    startEdge,
    startType: "short",
  });
}

/** Known wire path for a device profile (index 0 corner + traversal). */
export function getProfileWirePath(deviceModel, ledCount) {
  if (deviceModel === "SK0L27" && ledCount === 96) {
    return { origin: "bottom-left", direction: "cw" };
  }
  return null;
}

/** Landscape 16:9 frame: shorter physical edges (vertical left/right). */
export function isLandscapeShortSide(side) {
  return side === "left" || side === "right";
}

/** Landscape 16:9 frame: longer physical edges (horizontal top/bottom). */
export function isLandscapeLongSide(side) {
  return side === "top" || side === "bottom";
}

/**
 * Filter (stripOrigin, stripDirection) where wire starts on startEdge and frame N/D matches.
 * @param {boolean} wantShortStart - true when wizard picked Shorter side (left/right on 16:9)
 */
export function getCalibrationWireCandidates(startEdge, wantShortStart, counts) {
  if (!startEdge || !counts) return [];

  const candidates = [];

  for (const { value: origin } of STRIP_ORIGINS) {
    for (const dir of ["cw", "ccw"]) {
      const wireStart = getZoneForWirePath(origin, dir);
      if (wireStart !== startEdge) continue;

      const startIsShortFrame = isLandscapeShortSide(startEdge);
      if (startIsShortFrame !== wantShortStart) continue;

      candidates.push({
        stripOrigin: origin,
        stripDirection: dir,
        sides: getWireTraversalSides(origin, dir),
      });
    }
  }

  return candidates;
}

/** Side order when walking the frame from origin + direction. */
export function getWireTraversalSides(origin, direction) {
  const safeOrigin = normalizeStripOrigin(origin);
  const safeDirection = normalizeStripDirection(direction);
  return TRAVERSAL_ORDERS[safeOrigin]?.[safeDirection] || TRAVERSAL_ORDERS["bottom-left"].cw;
}

/** Logical zone (top/right/bottom/left) that contains LED 0 for a given wire path. */
export function getZoneForWirePath(origin, direction) {
  const sides = getWireTraversalSides(origin, direction);
  return sides[0] || "bottom";
}

/** Expected physical zone of LED 1 when using the bundled device profile. */
export function getProfileExpectedZeroZone(deviceModel, ledCount) {
  const wirePath = getProfileWirePath(deviceModel, ledCount);
  if (!wirePath) return null;
  return getZoneForWirePath(wirePath.origin, wirePath.direction);
}

/** Settings patch to apply on connect — layout counts and profile wire path when unset. */
export function getSmartOrientationPatch(settings, deviceModel, ledCount) {
  const patch = {};
  const count = Math.max(0, Number(ledCount) || 0);
  if (!count) return patch;

  const profileCounts = getProfileStripCounts(deviceModel, count);
  const wirePath = getProfileWirePath(deviceModel, count);

  if (!isValidStripCounts(settings?.stripCounts, count)) {
    patch.stripCounts = getSmartStripCounts(deviceModel, count);
  }

  if (wirePath && !settings?.orientationConfirmed) {
    if (settings?.stripOrigin !== wirePath.origin) {
      patch.stripOrigin = wirePath.origin;
    }
    if (settings?.stripDirection !== wirePath.direction) {
      patch.stripDirection = wirePath.direction;
    }
  }

  return patch;
}

export function getSmartStripCounts(deviceModel, ledCount) {
  const count = Math.max(0, Number(ledCount) || 0);
  const wirePath = getProfileWirePath(deviceModel, count);
  if (wirePath) {
    const startEdge = getZoneForWirePath(wirePath.origin, wirePath.direction);
    return (
      computeStripCountsFromCalibration({
        totalLed: count,
        direction: wirePath.direction,
        startEdge,
        startType: "short",
      }) ?? proportionalStripCounts(count)
    );
  }
  return (
    computeStripCountsFromCalibration({
      totalLed: count,
      direction: "cw",
      startEdge: "top",
      startType: "long",
    }) ?? proportionalStripCounts(count)
  );
}

/** Counts from completed calibration answers (Skydimo 16:9 algorithm). */
export function getCalibratedStripCounts(ledCount, answers) {
  const { direction, startEdge, edgeLength } = answers ?? {};
  if (!direction || !startEdge || !edgeLength) return null;
  return computeStripCountsFromCalibration({
    totalLed: ledCount,
    direction,
    startEdge,
    startType: edgeLengthToStartType(edgeLength),
  });
}

export function getLayoutSource(settings, deviceModel, ledCount) {
  if (isValidStripCounts(settings?.stripCounts, ledCount)) {
    return "custom";
  }
  if (getProfileWirePath(deviceModel, ledCount)) {
    return "skydimo";
  }
  return "auto";
}

/** User saw logical zone flash on a physical monitor edge → rotation (0/90/180/270). */
export function inferZoneRotation(logicalSide, physicalSide) {
  const logicalIndex = ZONE_IDS.indexOf(logicalSide);
  const physicalIndex = ZONE_IDS.indexOf(physicalSide);
  if (logicalIndex < 0 || physicalIndex < 0) {
    return 0;
  }
  const shift = (physicalIndex - logicalIndex + 4) % 4;
  return shift * 90;
}

const SIDE_COUNT_PREFIX = { top: "T", right: "R", bottom: "B", left: "L" };

export function formatStripCountsSummary(counts) {
  if (!counts) return "";
  return `T${counts.top} · R${counts.right} · B${counts.bottom} · L${counts.left}`;
}

/** Segments along the configured wire path (origin + direction). */
export function getWireTraversalSegments(layout) {
  if (!layout?.counts) return [];
  const sides = getWireTraversalSides(layout.origin, layout.direction);
  return sides.map((side, index) => ({
    side,
    prefix: SIDE_COUNT_PREFIX[side] ?? side[0]?.toUpperCase(),
    count: Math.max(0, Number(layout.counts[side]) || 0),
    label: ZONE_LABELS[side] || side,
    isStart: index === 0,
  }));
}

/** LED counts along the configured wire path (origin + direction). */
export function formatWireTraversalSummary(layout) {
  return getWireTraversalSegments(layout)
    .map((segment) => `${segment.prefix}${segment.count}`)
    .join(" → ");
}

export function defaultStripCounts(ledCount) {
  const count = Math.max(0, Number(ledCount) || 0);
  const base = Math.floor(count / 4);
  const extra = count % 4;
  return {
    top: base + (extra > 0 ? 1 : 0),
    right: base + (extra > 1 ? 1 : 0),
    bottom: base + (extra > 2 ? 1 : 0),
    left: base,
  };
}

export function stripCountsFromZones(zones) {
  const byId = Object.fromEntries(zones.map((zone) => [zone.id, zone.indices.length]));
  return {
    top: byId.top ?? 0,
    right: byId.right ?? 0,
    bottom: byId.bottom ?? 0,
    left: byId.left ?? 0,
  };
}

export function stripCountsTotal(counts) {
  if (!counts) return 0;
  return STRIP_SIDES.reduce((sum, side) => sum + Math.max(0, Number(counts[side]) || 0), 0);
}

export function isValidStripCounts(counts, ledCount) {
  if (!counts || typeof counts !== "object") return false;
  for (const side of STRIP_SIDES) {
    const value = Number(counts[side]);
    if (!Number.isFinite(value) || value < 0) return false;
  }
  return stripCountsTotal(counts) === Math.max(0, Number(ledCount) || 0);
}

export function normalizeStripCounts(counts, ledCount) {
  const fallback = defaultStripCounts(ledCount);
  const next = { ...fallback };
  if (counts && typeof counts === "object") {
    for (const side of STRIP_SIDES) {
      const value = Math.round(Number(counts[side]));
      if (Number.isFinite(value) && value >= 0) {
        next[side] = value;
      }
    }
  }
  if (!isValidStripCounts(next, ledCount)) {
    return fallback;
  }
  return next;
}

export function normalizeStripOrigin(origin) {
  return STRIP_ORIGINS.some((item) => item.value === origin) ? origin : "bottom-left";
}

export function normalizeStripDirection(direction) {
  return direction === "ccw" ? "ccw" : "cw";
}

export function resolveStripLayout(settings, deviceModel, ledCount) {
  const count = Math.max(0, Number(ledCount) || 0);
  if (!count) {
    return null;
  }

  const origin = normalizeStripOrigin(settings?.stripOrigin);
  const direction = normalizeStripDirection(settings?.stripDirection);
  let counts = settings?.stripCounts;

  if (!isValidStripCounts(counts, count)) {
    counts = getSmartStripCounts(deviceModel, count);
  }

  return { counts, origin, direction };
}

export function buildZonesFromStripLayout(layout) {
  const { counts, origin, direction } = layout;
  const order =
    TRAVERSAL_ORDERS[origin]?.[direction] || TRAVERSAL_ORDERS["bottom-left"].cw;

  let cursor = 0;
  const zonesBySide = {};

  for (const side of order) {
    const size = Math.max(0, Number(counts[side]) || 0);
    const indices = Array.from({ length: size }, (_, offset) => cursor + offset);
    cursor += size;
    zonesBySide[side] = {
      id: side,
      label: ZONE_LABELS[side] || side,
      indices,
    };
  }

  return ZONE_IDS.map((id) => zonesBySide[id]).filter(Boolean);
}

/** Apply zoneRotation label remap to a zone list (indices stay; ids swap). */
export function applyZoneRotationLabels(baseZones, zoneRotation) {
  const rotation = normalizeZoneRotation(zoneRotation);
  if (rotation === 0) return baseZones;
  const steps = rotation / 90;
  const byId = Object.fromEntries(baseZones.map((zone) => [zone.id, zone]));
  return ZONE_IDS.map((logicalId) => {
    const baseIndex = ZONE_IDS.indexOf(logicalId);
    const physicalId = ZONE_IDS[(baseIndex + steps) % ZONE_IDS.length];
    const physical = byId[physicalId];
    if (!physical) return null;
    return {
      id: logicalId,
      label: ZONE_LABELS[logicalId] || physical.label,
      indices: [...physical.indices],
    };
  }).filter(Boolean);
}

/** Flex direction within each edge strip (index 0 at wire-entry corner). */
const EDGE_DOT_FLOW = {
  left: "column-reverse",
  top: "row",
  right: "column",
  bottom: "row-reverse",
};

function buildDiagramEdgeStrips(rotatedZones) {
  const byId = Object.fromEntries(rotatedZones.map((zone) => [zone.id, zone]));
  return ZONE_IDS.map((edgeId) => {
    const zone = byId[edgeId];
    if (!zone?.indices?.length) return null;
    return {
      id: edgeId,
      label: ZONE_LABELS[edgeId] || edgeId,
      indices: [...zone.indices],
      dotFlow: EDGE_DOT_FLOW[edgeId] || "row",
    };
  }).filter(Boolean);
}

/** One monitor wrapper per physical edge — indices reflect what the user sees after rotation. */
export function getDiagramEdgeStrips(settings, deviceModel, ledCount, zoneRotation = 0) {
  const layout = resolveStripLayout(settings, deviceModel, ledCount);
  if (!layout) return [];
  const wireZones = buildZonesFromStripLayout(layout);
  const rotated = applyZoneRotationLabels(wireZones, zoneRotation);
  return buildDiagramEdgeStrips(rotated);
}

/** Diagram-friendly layout: edge strips reflect user's perceived monitor orientation. */
export function getDiagramLayout(settings, deviceModel, ledCount, zoneRotation = 0) {
  const layout = resolveStripLayout(settings, deviceModel, ledCount);
  if (!layout) return null;
  const wireZones = buildZonesFromStripLayout(layout);
  const zones = applyZoneRotationLabels(wireZones, zoneRotation);
  const edgeStrips = buildDiagramEdgeStrips(zones);
  const ledMap = buildLedMapFromStripLayout(layout, ledCount, 0);
  return { layout, wireZones, zones, edgeStrips, ledMap };
}

/** Diagram zone id that owns the most indices in `indices` (matches on-screen layout). */
export function getDiagramZoneIdForIndices(
  settings,
  deviceModel,
  ledCount,
  indices,
  zoneRotation = settings?.zoneRotation ?? 0
) {
  const diagram = getDiagramLayout(settings, deviceModel, ledCount, zoneRotation);
  if (!diagram?.zones?.length || !indices?.length) return null;

  const indexSet = new Set(indices);
  let bestId = null;
  let bestCount = -1;

  for (const zone of diagram.zones) {
    const count = zone.indices.reduce(
      (sum, index) => sum + (indexSet.has(index) ? 1 : 0),
      0
    );
    if (count > bestCount) {
      bestCount = count;
      bestId = zone.id;
    }
  }

  return bestId;
}

/** Smallest LED count among the four edges (short side length for this strip). */
export function getShortEdgeLedCount(counts) {
  const sides = STRIP_SIDES.map((side) => Math.max(0, Number(counts?.[side]) || 0)).filter(
    (count) => count > 0
  );
  return sides.length ? Math.min(...sides) : 1;
}

/** Largest LED count among the four edges (long side length for this strip). */
export function getLongEdgeLedCount(counts) {
  const sides = STRIP_SIDES.map((side) => Math.max(0, Number(counts?.[side]) || 0)).filter(
    (count) => count > 0
  );
  return sides.length ? Math.max(...sides) : 1;
}

/** Whether an edge uses the lower LED tier (N in N-D-N-D), not the long tier (D). */
export function isShortEdgeLedCount(ledCount, counts) {
  const shortCount = getShortEdgeLedCount(counts);
  const longCount = getLongEdgeLedCount(counts);
  if (shortCount === longCount) return true;
  return ledCount < longCount;
}

/** Consecutive indices from LED 0 through the short-edge span (e.g. 96 LEDs → 0..16). */
export function getStartEdgeFlashIndices(settings, deviceModel, ledCount) {
  const layout = resolveStripLayout(settings, deviceModel, ledCount);
  if (!layout) return [0];

  const shortCount = getShortEdgeLedCount(layout.counts);
  const lastIndex = Math.min(Math.max(0, Number(ledCount) || 0) - 1, shortCount);
  return Array.from({ length: lastIndex + 1 }, (_, index) => index);
}

export function rotateMapPoint([x, y], width, height, rotationDegrees) {
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

/** Map t∈[0,1] along an edge so index 0 sits at the wire-entry corner for origin+direction. */
function placeEdgePoint(side, t, origin, direction, width, height) {
  const invertT = (value) => 1 - value;
  const xMin = 1;
  const xMax = width - 2;
  const yMin = 1;
  const yMax = height - 2;

  const originIsBottom = origin.includes("bottom");
  const originIsLeft = origin.includes("left");
  const cw = normalizeStripDirection(direction) === "cw";

  let x = 0;
  let y = 0;

  switch (side) {
    case "left": {
      x = 0;
      const up = cw ? originIsBottom : !originIsBottom;
      const leftT = up ? invertT(t) : t;
      y = Math.round(yMin + leftT * (yMax - yMin));
      break;
    }
    case "top": {
      y = 0;
      const right = cw ? originIsLeft : !originIsLeft;
      const topT = right ? t : invertT(t);
      x = Math.round(xMin + topT * (xMax - xMin));
      break;
    }
    case "right": {
      x = width - 1;
      const down = cw ? originIsBottom : !originIsBottom;
      const rightT = down ? t : invertT(t);
      y = Math.round(yMin + rightT * (yMax - yMin));
      break;
    }
    case "bottom": {
      y = height - 1;
      const left = cw ? !originIsLeft : originIsLeft;
      const bottomT = left ? invertT(t) : t;
      x = Math.round(xMin + bottomT * (xMax - xMin));
      break;
    }
    default:
      break;
  }

  return [x, y];
}

/** Inverse of placeEdgePoint — wire parameter t∈[0,1] along `side` for origin + direction. */
export function wireEdgeT(side, x, y, origin, direction, width, height) {
  const xMin = 1;
  const xMax = width - 2;
  const yMin = 1;
  const yMax = height - 2;
  const originIsBottom = origin.includes("bottom");
  const originIsLeft = origin.includes("left");
  const cw = normalizeStripDirection(direction) === "cw";

  switch (side) {
    case "left": {
      const up = cw ? originIsBottom : !originIsBottom;
      const raw = (y - yMin) / Math.max(1, yMax - yMin);
      return up ? 1 - raw : raw;
    }
    case "top": {
      const right = cw ? originIsLeft : !originIsLeft;
      const raw = (x - xMin) / Math.max(1, xMax - xMin);
      return right ? raw : 1 - raw;
    }
    case "right": {
      const down = cw ? originIsBottom : !originIsBottom;
      const raw = (y - yMin) / Math.max(1, yMax - yMin);
      return down ? raw : 1 - raw;
    }
    case "bottom": {
      const left = cw ? !originIsLeft : originIsLeft;
      const raw = (x - xMin) / Math.max(1, xMax - xMin);
      return left ? 1 - raw : raw;
    }
    default:
      return 0;
  }
}

export function buildLedMapFromStripLayout(layout, ledCount, zoneRotation = 0) {
  const zones = buildZonesFromStripLayout(layout);
  const counts = layout.counts;
  const { origin, direction } = layout;
  const width = Math.max(counts.top, counts.bottom, 4) + 2;
  const height = Math.max(counts.left, counts.right, 4) + 2;
  const points = Array.from({ length: ledCount }, () => [0, 0]);

  for (const zone of zones) {
    const n = zone.indices.length;
    zone.indices.forEach((index, i) => {
      const t = n <= 1 ? 0.5 : i / (n - 1);
      const [x, y] = placeEdgePoint(zone.id, t, origin, direction, width, height);

      if (index >= 0 && index < ledCount) {
        points[index] = [x, y];
      }
    });
  }

  const rotation = normalizeZoneRotation(zoneRotation);
  if (rotation === 0) {
    return { width, height, points };
  }

  const swapDimensions = rotation === 90 || rotation === 270;
  return {
    width: swapDimensions ? height : width,
    height: swapDimensions ? width : height,
    points: points.map((point) => rotateMapPoint(point, width, height, rotation)),
  };
}
