import { describe, expect, it } from "vitest";
import { getProfileZones, getWireOrderedZones } from "./ledLayout";
import { buildAnimationPerimeterPhases } from "./animationSpatial";

describe("animationSpatial", () => {
  it("spans phase 0 to 1 across the configured wire path", () => {
    const phases = buildAnimationPerimeterPhases(
      { stripOrigin: "bottom-left", stripDirection: "cw" },
      "SK0L27",
      96
    );

    expect(Math.min(...phases)).toBe(0);
    expect(Math.max(...phases)).toBe(1);
  });

  it("uses strip-layout bottom indices for wire-ordered zones", () => {
    const settings = { stripOrigin: "bottom-left", stripDirection: "cw", stripCounts: {
      top: 16, right: 32, bottom: 16, left: 32,
    }};
    const bottom = getWireOrderedZones("SK0L27", 96, settings).find(
      (zone) => zone.wireSide === "bottom"
    )?.indices;

    expect(bottom).toEqual(
      Array.from({ length: 16 }, (_, offset) => 80 + offset)
    );
  });

  it("keeps SK0L27 bottom wire indices monotonic in firmware order", () => {
    const phases = buildAnimationPerimeterPhases(
      { stripOrigin: "bottom-left", stripDirection: "cw" },
      "SK0L27",
      96
    );

    for (let index = 65; index < 95; index += 1) {
      expect(phases[index]).toBeLessThan(phases[index + 1]);
    }
  });

  it("does not split SK0L27 bottom row between left and bottom zones", () => {
    const phases = buildAnimationPerimeterPhases(
      { stripOrigin: "bottom-left", stripDirection: "cw" },
      "SK0L27",
      96
    );

    expect(phases[80]).toBeLessThan(phases[81]);
    expect(phases[81]).toBeLessThan(phases[95]);
  });

  it("maps each LED index to a proportional wire phase", () => {
    const phases = buildAnimationPerimeterPhases(
      { stripOrigin: "bottom-left", stripDirection: "cw" },
      "SK0L27",
      96
    );

    expect(phases[0]).toBe(0);
    expect(phases[95]).toBe(1);
    expect(phases[48]).toBeCloseTo(48 / 95, 5);
  });
});

describe("getProfileZones", () => {
  it("returns SK0L27 firmware zones", () => {
    const zones = getProfileZones("SK0L27", 96);
    expect(zones?.find((zone) => zone.id === "bottom")?.indices[0]).toBe(65);
  });
});
