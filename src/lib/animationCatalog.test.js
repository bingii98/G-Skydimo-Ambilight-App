import { describe, expect, it } from "vitest";
import { ANIMATION_IDS } from "./animations";
import { migrateAnimationId } from "./animationCatalog";

describe("animationCatalog", () => {
  it("maps deprecated animation ids to canonical effects", () => {
    expect(migrateAnimationId("ocean")).toBe(ANIMATION_IDS.AURORA);
    expect(migrateAnimationId("blend")).toBe(ANIMATION_IDS.RAINBOW);
    expect(migrateAnimationId("lava")).toBe(ANIMATION_IDS.FIRE);
    expect(migrateAnimationId("comet")).toBe(ANIMATION_IDS.CHASE);
    expect(migrateAnimationId("twinkle")).toBe(ANIMATION_IDS.SPARKLE);
    expect(migrateAnimationId("candle")).toBe(ANIMATION_IDS.BREATHE);
    expect(migrateAnimationId("neon")).toBe(ANIMATION_IDS.POLICE);
    expect(migrateAnimationId("rainbow")).toBe(ANIMATION_IDS.RAINBOW);
  });
});
