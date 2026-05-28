import { describe, expect, it } from "vitest";
import { ANIMATION_IDS } from "./animations";
import {
  adaptAnimationStopsForEffect,
  buildAnimationAiApplyPatch,
  parseAnimationSetupSuggestion,
} from "./openaiAnimation";

describe("openaiAnimation", () => {
  it("parses AI setup with valid effect and tuning", () => {
    const setup = parseAnimationSetupSuggestion(
      {
        animationId: "ocean",
        speed: 120,
        intensity: 0,
        stops: [
          { color: "#003366", position: 0 },
          { color: "#00AACC", position: 1 },
        ],
      },
      "#FFD700"
    );

    expect(setup.animationId).toBe(ANIMATION_IDS.AURORA);
    expect(setup.speed).toBe(100);
    expect(setup.intensity).toBe(1);
    expect(setup.stops.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid animation ids from AI", () => {
    expect(() =>
      parseAnimationSetupSuggestion({ animationId: "invalid", stops: [{ color: "#FF0000" }] })
    ).toThrow(/invalid animation/i);
  });

  it("collapses fresh palette to one color for single-color effects", () => {
    const stops = adaptAnimationStopsForEffect(
      [
        { id: "a", position: 0, color: "#FF2244" },
        { id: "b", position: 0.5, color: "#00FF00" },
        { id: "c", position: 1, color: "#0000FF" },
      ],
      ANIMATION_IDS.BREATHE
    );

    expect(stops.every((stop) => stop.color === stops[0].color)).toBe(true);
  });

  it("builds apply patch with per-effect colors and tuning", () => {
    const settings = {
      hex: "#FFFFFF",
      animationId: null,
      animationColorsById: {},
    };
    const patch = buildAnimationAiApplyPatch(settings, {
      animationId: ANIMATION_IDS.POLICE,
      speed: 40,
      intensity: 70,
      stops: [
        { id: "r", position: 0, color: "#FF0000" },
        { id: "b", position: 1, color: "#0000FF" },
      ],
    });

    expect(patch.animationId).toBe(ANIMATION_IDS.POLICE);
    expect(patch.animationSpeed).toBe(40);
    expect(patch.animationIntensity).toBe(70);
    expect(patch.animationColorsById?.[ANIMATION_IDS.POLICE]?.animationColorStops).toHaveLength(2);
  });
});
