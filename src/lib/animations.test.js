import { describe, expect, it } from "vitest";
import {
  ANIMATION_IDS,
  ANIMATIONS,
  ANIMATION_PALETTE,
  animationIntensityFactor,
  animationSpeedFactor,
  buildAnimationPixels,
  getAnimationColorControls,
  getAnimationConfig,
  isValidAnimationId,
  pixelsToLedHexes,
} from "./animations";
import { buildAnimationPerimeterPhases } from "./animationSpatial";

describe("animations", () => {
  it("includes expanded effect catalog", () => {
    expect(ANIMATIONS.length).toBeGreaterThanOrEqual(20);
    expect(isValidAnimationId(ANIMATION_IDS.AURORA)).toBe(true);
    expect(isValidAnimationId(ANIMATION_IDS.HEARTBEAT)).toBe(true);
    expect(isValidAnimationId(ANIMATION_IDS.METEOR)).toBe(true);
    expect(isValidAnimationId(ANIMATION_IDS.CANDLE)).toBe(true);
    expect(isValidAnimationId("unknown")).toBe(false);
  });

  it("maps speed and intensity sliders", () => {
    expect(animationSpeedFactor(1)).toBeCloseTo(0.01, 3);
    expect(animationSpeedFactor(50)).toBeCloseTo(0.321, 2);
    expect(animationSpeedFactor(100)).toBeCloseTo(2.5, 3);
    expect(animationIntensityFactor(1)).toBeCloseTo(0.109, 3);
    expect(animationIntensityFactor(100)).toBeCloseTo(1, 3);
  });

  it("builds pixels for every animation", () => {
    const settings = {
      hex: "#FFD700",
      animationSecondaryHex: "#FF0066",
      animationColorStops: [
        { id: "a", position: 0, color: "#FFD700" },
        { id: "b", position: 1, color: "#FF0066" },
      ],
      brightness: 80,
      animationSpeed: 50,
      animationIntensity: 60,
      animationReverse: false,
    };

    for (const { id } of ANIMATIONS) {
      const pixels = buildAnimationPixels({
        animationId: id,
        ledCount: 16,
        settings,
        timeMs: 500,
      });
      expect(pixels.length).toBe(16 * 3);
      const hexes = pixelsToLedHexes(pixels, 16);
      expect(hexes).toHaveLength(16);
      expect(hexes.every((hex) => /^#[0-9A-F]{6}$/.test(hex))).toBe(true);
    }
  });

  it("respects reverse direction for blend", () => {
    const baseSettings = {
      hex: "#FF0000",
      animationSecondaryHex: "#0000FF",
      brightness: 100,
      animationSpeed: 50,
      animationIntensity: 50,
    };

    const forward = pixelsToLedHexes(
      buildAnimationPixels({
        animationId: ANIMATION_IDS.BLEND,
        ledCount: 8,
        settings: { ...baseSettings, animationReverse: false },
        timeMs: 0,
      }),
      8
    );

    const reverse = pixelsToLedHexes(
      buildAnimationPixels({
        animationId: ANIMATION_IDS.BLEND,
        ledCount: 8,
        settings: { ...baseSettings, animationReverse: true },
        timeMs: 0,
      }),
      8
    );

    expect(forward).not.toEqual(reverse);
  });

  it("exposes palette metadata", () => {
    expect(getAnimationConfig(ANIMATION_IDS.BLEND)?.colorPalette).toBe(ANIMATION_PALETTE.MULTI);
    expect(getAnimationConfig(ANIMATION_IDS.BREATHE)?.colorPalette).toBe(ANIMATION_PALETTE.SINGLE);
    expect(getAnimationColorControls(getAnimationConfig(ANIMATION_IDS.WAVE))?.showPalette).toBe(true);
  });

  it("uses custom palette in rainbow sweep", () => {
    const settings = {
      hex: "#FF0000",
      animationSecondaryHex: "#0000FF",
      animationColorStops: [
        { id: "a", position: 0, color: "#FF0000" },
        { id: "b", position: 1, color: "#0000FF" },
      ],
      brightness: 100,
      animationSpeed: 50,
      animationIntensity: 50,
    };
    const phases = buildAnimationPerimeterPhases(settings, "SK0L27", 96);
    let minIndex = 0;
    let maxIndex = 0;
    for (let index = 1; index < 96; index += 1) {
      if (phases[index] < phases[minIndex]) minIndex = index;
      if (phases[index] > phases[maxIndex]) maxIndex = index;
    }

    const hexes = pixelsToLedHexes(
      buildAnimationPixels({
        animationId: ANIMATION_IDS.RAINBOW,
        ledCount: 96,
        deviceModel: "SK0L27",
        settings,
        timeMs: 0,
      }),
      96
    );

    expect(hexes[minIndex]).toBe("#FF0000");
    expect(Number.parseInt(hexes[maxIndex].slice(5, 7), 16)).toBeGreaterThan(240);
    expect(phases[maxIndex] - phases[minIndex]).toBeGreaterThan(0.5);
  });

  it("advances police frames over time", () => {
    const settings = {
      hex: "#FF0000",
      animationSecondaryHex: "#0000FF",
      animationColorStops: [
        { id: "a", position: 0, color: "#FF0000" },
        { id: "b", position: 1, color: "#0000FF" },
      ],
      brightness: 100,
      animationSpeed: 50,
      animationIntensity: 50,
      animationReverse: false,
      stripOrigin: "bottom-left",
      stripDirection: "cw",
    };

    const at0 = buildAnimationPixels({
      animationId: ANIMATION_IDS.POLICE,
      ledCount: 96,
      settings,
      timeMs: 0,
      deviceModel: "SK0L27",
    });
    const at500 = buildAnimationPixels({
      animationId: ANIMATION_IDS.POLICE,
      ledCount: 96,
      settings,
      timeMs: 500,
      deviceModel: "SK0L27",
    });

    expect(Array.from(at0)).not.toEqual(Array.from(at500));
  });
});
