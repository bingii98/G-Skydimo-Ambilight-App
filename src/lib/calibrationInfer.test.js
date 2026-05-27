import { describe, it, expect } from "vitest";
import {
  computeMotionDirection,
  inferOrientationFromCalibration,
} from "./calibrationInfer.js";
import { computeStripCountsFromCalibration } from "./skydimoStripCounts.js";
import {
  formatWireTraversalSummary,
  getCalibrationWireCandidates,
  getCalibratedStripCounts,
  getProfileStripCounts,
  getWireTraversalSegments,
  getWireTraversalSides,
  getZoneForWirePath,
  isValidStripCounts,
  proportionalStripCounts,
  resolveStripLayout,
} from "./zoneLayout.js";
import { getLogicalZoneForLedIndex } from "./ledLayout.js";

const USER_LED_COUNT = 95;

function pathForPatch(patch, deviceModel, ledCount) {
  const layout = resolveStripLayout(patch, deviceModel, ledCount);
  return formatWireTraversalSummary(layout);
}

describe("inferOrientationFromCalibration", () => {
  it("returns computed stripCounts for CW + Left + short on 96 LEDs", () => {
    const expectedCounts = getCalibratedStripCounts(96, {
      direction: "cw",
      startEdge: "left",
      edgeLength: "short",
    });

    const patch = inferOrientationFromCalibration(
      { direction: "cw", startEdge: "left", edgeLength: "short" },
      "SK0L27",
      96,
      {}
    );

    expect(patch).not.toBeNull();
    expect(patch.stripOrigin).toBe("bottom-left");
    expect(patch.stripDirection).toBe("cw");
    expect(patch.zoneRotation).toBe(0);
    expect(patch.stripCounts).toEqual(expectedCounts);
    expect(isValidStripCounts(patch.stripCounts, 96)).toBe(true);
    expect(pathForPatch(patch, "SK0L27", 96)).toBe("L17 → T31 → R17 → B31");
  });

  it("CW + Left + short uses algorithm counts for motion on generic map", () => {
    const stripCounts = getCalibratedStripCounts(96, {
      direction: "cw",
      startEdge: "left",
      edgeLength: "short",
    });
    const draft = {
      stripOrigin: "bottom-left",
      stripDirection: "cw",
      stripCounts,
    };
    expect(computeMotionDirection("generic", 96, draft)).toBe("cw");
    expect(getLogicalZoneForLedIndex("generic", 96, 0, draft, 0)).toBe("left");
  });

  it("does not return ccw path for CW + Left + short", () => {
    const patch = inferOrientationFromCalibration(
      { direction: "cw", startEdge: "left", edgeLength: "short" },
      "generic",
      96,
      {}
    );

    expect(patch?.stripDirection).not.toBe("ccw");
    expect(pathForPatch(patch, "generic", 96)).not.toBe("B31 → R17 → T31 → L17");
  });

  it("SK0L27 profile: CW + Left + short → bottom-left cw with formula counts", () => {
    const patch = inferOrientationFromCalibration(
      { direction: "cw", startEdge: "left", edgeLength: "short" },
      "SK0L27",
      96,
      {}
    );

    expect(patch).not.toBeNull();
    expect(patch.stripCounts?.left).toBe(17);
    expect(patch.stripCounts?.top).toBe(31);
  });

  it("CCW + Right + short → bottom-right ccw", () => {
    const patch = inferOrientationFromCalibration(
      { direction: "ccw", startEdge: "right", edgeLength: "short" },
      "generic",
      96,
      {}
    );

    expect(patch).not.toBeNull();
    expect(patch.stripOrigin).toBe("bottom-right");
    expect(patch.stripDirection).toBe("ccw");
    expect(getWireTraversalSides(patch.stripOrigin, patch.stripDirection)).toEqual([
      "right",
      "top",
      "left",
      "bottom",
    ]);
  });

  it("CW + Bottom + long → wire starts on bottom, motion cw", () => {
    const patch = inferOrientationFromCalibration(
      { direction: "cw", startEdge: "bottom", edgeLength: "long" },
      "generic",
      96,
      {}
    );

    expect(patch).not.toBeNull();
    expect(getZoneForWirePath(patch.stripOrigin, patch.stripDirection)).toBe("bottom");
    expect(computeMotionDirection("generic", 96, patch)).toBe("cw");
  });

  it("95 LEDs: stripCounts sum matches total", () => {
    const counts = getCalibratedStripCounts(USER_LED_COUNT, {
      direction: "cw",
      startEdge: "left",
      edgeLength: "short",
    });
    expect(isValidStripCounts(counts, USER_LED_COUNT)).toBe(true);
  });
});

describe("getWireTraversalSegments", () => {
  it("bottom-left cw uses stored stripCounts along wire", () => {
    const counts = computeStripCountsFromCalibration({
      totalLed: 96,
      direction: "cw",
      startEdge: "left",
      startType: "short",
    });
    const layout = resolveStripLayout(
      { stripOrigin: "bottom-left", stripDirection: "cw", stripCounts: counts },
      "SK0L27",
      96
    );
    const segments = getWireTraversalSegments(layout);
    expect(segments.map((s) => s.count)).toEqual([17, 31, 17, 31]);
    expect(formatWireTraversalSummary(layout)).toBe("L17 → T31 → R17 → B31");
  });

  it("profile helper matches calibration formula for SK0L27", () => {
    expect(getProfileStripCounts("SK0L27", 96)).toEqual(
      computeStripCountsFromCalibration({
        totalLed: 96,
        direction: "cw",
        startEdge: "left",
        startType: "short",
      })
    );
  });
});

describe("getCalibrationWireCandidates", () => {
  it("lists bottom-left cw for left short start", () => {
    const counts = getProfileStripCounts("SK0L27", 96);
    const list = getCalibrationWireCandidates("left", true, counts);
    const match = list.find((c) => c.stripOrigin === "bottom-left" && c.stripDirection === "cw");
    expect(match).toBeDefined();
    expect(match.sides).toEqual(["left", "top", "right", "bottom"]);
  });
});

describe("computeMotionDirection", () => {
  it("SK0L27 bottom-left cw reports cw with formula stripCounts", () => {
    const stripCounts = getProfileStripCounts("SK0L27", 96);
    const dir = computeMotionDirection("SK0L27", 96, {
      stripOrigin: "bottom-left",
      stripDirection: "cw",
      zoneRotation: 0,
      stripCounts,
    });
    expect(dir).toBe("cw");
  });
});
