const STRIP_SIDES = ["top", "right", "bottom", "left"];

/** Base edge ring for Skydimo 16:9 mapping (step 3 in calibration algorithm). */
export const SKYDIMO_CYCLE_EDGE = {
  cw: ["top", "right", "bottom", "left"],
  ccw: ["top", "left", "bottom", "right"],
};

/** Step 1: long/short tiers from total LED count (default 16:9 ratio 0.32). */
export function computeSkydimoLedTiers(totalLed) {
  const total = Math.max(4, Math.round(Number(totalLed) || 0));
  const ledLong = Math.round(total * 0.32);
  const paired = total - 2 * ledLong;
  const ledShort = Math.max(1, Math.floor(paired / 2));
  const spare = paired - 2 * ledShort;

  return { ledLong, ledShort, spare, total };
}

function buildSeqLed(startType, ledLong, ledShort) {
  return startType === "long"
    ? [ledLong, ledShort, ledLong, ledShort]
    : [ledShort, ledLong, ledShort, ledLong];
}

/**
 * Steps 2–4: map wire start edge + direction + N/D start onto per-side counts.
 * @param {{ totalLed: number, direction: "cw"|"ccw", startEdge: string, startType: "short"|"long" }} params
 */
export function computeStripCountsFromCalibration({
  totalLed,
  direction,
  startEdge,
  startType,
}) {
  const { ledLong, ledShort, spare } = computeSkydimoLedTiers(totalLed);
  const seqLed = buildSeqLed(startType === "long" ? "long" : "short", ledLong, ledShort);
  const safeDirection = direction === "ccw" ? "ccw" : "cw";
  const cycleEdge = SKYDIMO_CYCLE_EDGE[safeDirection];
  const indexStart = cycleEdge.indexOf(startEdge);
  if (indexStart < 0) return null;

  const counts = Object.fromEntries(STRIP_SIDES.map((side) => [side, 0]));
  for (let i = 0; i < 4; i += 1) {
    const edge = cycleEdge[(indexStart + i) % 4];
    counts[edge] = seqLed[i];
  }

  if (spare > 0) {
    const longIndex = seqLed.findIndex((value) => value === ledLong);
    if (longIndex >= 0) {
      const edge = cycleEdge[(indexStart + longIndex) % 4];
      counts[edge] += spare;
    }
  }

  return counts;
}

export function edgeLengthToStartType(edgeLength) {
  return edgeLength === "long" ? "long" : "short";
}
