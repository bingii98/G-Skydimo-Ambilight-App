import { resolveStripLayout } from "./zoneLayout";

/**
 * Per-LED phase (0..1) along the firmware wire (index 0 → count-1).
 * LED indices follow the physical strip in order; zone labels may split an edge
 * (e.g. SK0L27 bottom 65–95 vs left zone 81–95) so map/zone walks break continuity.
 */
export function buildAnimationPerimeterPhases(settings, deviceModel, ledCount) {
  const count = Math.max(0, Number(ledCount) || 0);
  const phases = new Float32Array(count);
  if (count === 0) {
    return phases;
  }

  if (count === 1) {
    phases[0] = 0;
    return phases;
  }

  const layout = resolveStripLayout(settings, deviceModel, count);
  if (!layout) {
    for (let index = 0; index < count; index += 1) {
      phases[index] = index / (count - 1);
    }
    return phases;
  }

  for (let index = 0; index < count; index += 1) {
    phases[index] = index / (count - 1);
  }

  return phases;
}
