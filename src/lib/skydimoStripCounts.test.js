import { describe, it, expect } from "vitest";
import {
  computeSkydimoLedTiers,
  computeStripCountsFromCalibration,
  SKYDIMO_CYCLE_EDGE,
} from "./skydimoStripCounts.js";

describe("computeSkydimoLedTiers", () => {
  it("96 LEDs → long=31, short=17", () => {
    expect(computeSkydimoLedTiers(96)).toEqual({
      ledLong: 31,
      ledShort: 17,
      spare: 0,
      total: 96,
    });
  });
});

describe("computeStripCountsFromCalibration", () => {
  it("CW cycle order is Top→Right→Bottom→Left", () => {
    expect(SKYDIMO_CYCLE_EDGE.cw).toEqual(["top", "right", "bottom", "left"]);
  });

  it("CW + Left + Short → L17 T31 R17 B31 for 96 LEDs", () => {
    expect(
      computeStripCountsFromCalibration({
        totalLed: 96,
        direction: "cw",
        startEdge: "left",
        startType: "short",
      })
    ).toEqual({ top: 31, right: 17, bottom: 31, left: 17 });
  });

  it("CCW + Right + Short → R17 T31 L31 B17 for 96 LEDs", () => {
    expect(
      computeStripCountsFromCalibration({
        totalLed: 96,
        direction: "ccw",
        startEdge: "right",
        startType: "short",
      })
    ).toEqual({ top: 31, right: 17, bottom: 31, left: 17 });
  });
});
