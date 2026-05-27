import { getLedMap, getLogicalZoneForLedIndex } from "./ledLayout";
import {
  getCalibratedStripCounts,
  getZoneForWirePath,
  isValidStripCounts,
  resolveStripLayout,
  STRIP_ORIGINS,
} from "./zoneLayout";

/** How index 0..n travels around the diagram (screen-space). */
export function computeMotionDirection(deviceModel, ledCount, settings) {
  const zoneRotation = settings?.zoneRotation ?? 0;
  const ledMap = getLedMap(deviceModel, ledCount, zoneRotation, settings);
  if (!ledMap?.points?.length) return null;

  const cx = (ledMap.width - 1) / 2;
  const cy = (ledMap.height - 1) / 2;
  const steps = Math.min(Math.max(8, Math.round(ledCount / 8)), ledCount - 1);

  let deltaSum = 0;
  let prevAngle = null;

  for (let index = 0; index <= steps; index += 1) {
    const [x, y] = ledMap.points[index] || ledMap.points[0];
    const angle = Math.atan2(y - cy, x - cx);

    if (prevAngle != null) {
      let delta = angle - prevAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      deltaSum += delta;
    }

    prevAngle = angle;
  }

  return deltaSum >= 0 ? "cw" : "ccw";
}

function scoreCandidate(stripOrigin, stripDirection, zoneRotation) {
  let score = 0;
  if (zoneRotation === 0) score += 100;
  if (stripOrigin === "bottom-left") score += 2;
  if (stripDirection === "cw") score += 1;
  return score;
}

/**
 * Resolve stripOrigin, stripDirection, zoneRotation from wizard answers.
 * @param {{ direction: "cw"|"ccw", startEdge: string, edgeLength: "short"|"long" }} answers — short/long = physical frame edge (left/right vs top/bottom), not LED count tier
 * @returns {{ stripOrigin, stripDirection, zoneRotation, orientationConfirmed, stripCounts } | null}
 */
export function inferOrientationFromCalibration(answers, deviceModel, ledCount, fallbackSettings = {}) {
  const { direction, startEdge, edgeLength } = answers;
  if (!direction || !startEdge || !edgeLength) return null;

  const origins = STRIP_ORIGINS.map((item) => item.value);
  const directions = ["cw", "ccw"];
  const rotations = [0, 90, 180, 270];

  const stripCounts = getCalibratedStripCounts(ledCount, {
    direction,
    startEdge,
    edgeLength,
  });
  if (!stripCounts || !isValidStripCounts(stripCounts, ledCount)) {
    return null;
  }

  let best = null;
  let bestScore = -1;

  for (const stripOrigin of origins) {
    for (const stripDirection of directions) {
      if (stripDirection !== direction) continue;

      const wireStart = getZoneForWirePath(stripOrigin, stripDirection);
      if (wireStart !== startEdge) continue;

      const draft = { stripOrigin, stripDirection, stripCounts };
      const layout = resolveStripLayout(draft, deviceModel, ledCount);
      if (!layout) continue;

      for (const zoneRotation of rotations) {
        const motionSettings = { ...draft, zoneRotation };
        const motionDir = computeMotionDirection(deviceModel, ledCount, motionSettings);
        if (motionDir !== direction) continue;

        const ledZeroZone = getLogicalZoneForLedIndex(
          deviceModel,
          ledCount,
          0,
          draft,
          zoneRotation
        );

        if (ledZeroZone !== startEdge) continue;

        const score = scoreCandidate(stripOrigin, stripDirection, zoneRotation);
        if (score > bestScore) {
          bestScore = score;
          best = {
            stripOrigin,
            stripDirection,
            zoneRotation,
            orientationConfirmed: true,
            stripCounts,
          };
        }
      }
    }
  }

  return best;
}

export function getWirePathSummary(origin, direction) {
  const first = getZoneForWirePath(origin, direction);
  return `LED 1 starts on ${first} · ${direction === "cw" ? "clockwise" : "counter-clockwise"}`;
}
