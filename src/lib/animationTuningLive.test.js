import { describe, expect, it } from "vitest";
import {
  applyAnimationTuningLive,
  patchAnimationTuningLive,
  resolveAnimationSettings,
} from "./animationTuningLive";

describe("animationTuningLive", () => {
  it("applies saved tuning values", () => {
    applyAnimationTuningLive({ animationSpeed: 20, animationIntensity: 80 });
    expect(resolveAnimationSettings({ animationSpeed: 99, animationIntensity: 99 })).toEqual({
      animationSpeed: 20,
      animationIntensity: 80,
    });
  });

  it("patches live tuning without persisting settings", () => {
    applyAnimationTuningLive({ animationSpeed: 50, animationIntensity: 50 });
    patchAnimationTuningLive({ speed: 72 });
    expect(resolveAnimationSettings({ animationSpeed: 10, animationIntensity: 10 })).toEqual({
      animationSpeed: 72,
      animationIntensity: 50,
    });
  });
});
