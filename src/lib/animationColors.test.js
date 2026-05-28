import { describe, expect, it } from "vitest";
import {
  buildAnimationColorPatch,
  buildAnimationSwitchPatch,
  defaultAnimationColorStopsForId,
  insertAnimationColorStop,
  removeAnimationColorStop,
  resolveAnimationColorStops,
  sampleAnimationColor,
} from "./animationColors";

describe("animationColors", () => {
  it("resolves legacy hex fields into palette stops", () => {
    const stops = resolveAnimationColorStops({
      hex: "#FF0000",
      animationSecondaryHex: "#0000FF",
    });

    expect(stops).toHaveLength(2);
    expect(stops[0].color).toBe("#FF0000");
    expect(stops[1].color).toBe("#0000FF");
  });

  it("samples between palette stops", () => {
    const stops = resolveAnimationColorStops({
      hex: "#FF0000",
      animationSecondaryHex: "#0000FF",
    });

    expect(sampleAnimationColor(stops, 0)).toBe("#FF0000");
    expect(sampleAnimationColor(stops, 1)).toBe("#0000FF");
  });

  it("supports adding and removing palette colors", () => {
    const base = resolveAnimationColorStops({ hex: "#FF0000", animationSecondaryHex: "#0000FF" });
    const withMiddle = insertAnimationColorStop(base, 0.5, "#00FF00");
    expect(withMiddle.length).toBe(3);

    const removed = removeAnimationColorStop(withMiddle, withMiddle[1].id);
    expect(removed.length).toBe(2);
  });

  it("syncs hex fields when building patch", () => {
    const patch = buildAnimationColorPatch({
      hex: "#ABCDEF",
      animationSecondaryHex: "#112233",
      animationId: "rainbow",
      animationColorStops: [
        { id: "a", position: 0, color: "#ABCDEF" },
        { id: "b", position: 1, color: "#112233" },
      ],
      animationActiveColorStopId: "a",
    });

    expect(patch.animationColorStops?.length).toBeGreaterThanOrEqual(2);
    expect(patch.hex).toBe("#ABCDEF");
    expect(patch.animationSecondaryHex).toBe("#112233");
    expect(patch.animationColorsById?.rainbow?.animationColorStops?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps separate palettes per animation", () => {
    const settings = {
      hex: "#FF0000",
      animationId: "rainbow",
      animationColorStops: [
        { id: "a", position: 0, color: "#FF0000" },
        { id: "b", position: 1, color: "#0000FF" },
      ],
      animationActiveColorStopId: "a",
      animationColorsById: {
        rainbow: {
          animationColorStops: [
            { id: "a", position: 0, color: "#FF0000" },
            { id: "b", position: 1, color: "#0000FF" },
          ],
          animationActiveColorStopId: "a",
        },
        fire: {
          animationColorStops: [
            { id: "f1", position: 0, color: "#FF2200" },
            { id: "f2", position: 1, color: "#FFDD00" },
          ],
          animationActiveColorStopId: "f1",
        },
      },
    };

    const switched = buildAnimationSwitchPatch(settings, "fire");
    expect(switched.animationId).toBe("fire");
    expect(switched.hex).toBe("#FF2200");
    expect(resolveAnimationColorStops(switched, "#FFFFFF", "fire")[0].color).toBe("#FF2200");
    expect(resolveAnimationColorStops(switched, "#FFFFFF", "rainbow")[0].color).toBe("#FF0000");

    const backToRainbow = buildAnimationSwitchPatch(
      { ...settings, ...switched },
      "rainbow"
    );
    expect(backToRainbow.hex).toBe("#FF0000");
  });

  it("seeds defaults when an animation has no saved palette", () => {
    const patch = buildAnimationSwitchPatch({ hex: "#FFFFFF", animationId: "rainbow" }, "ocean");
    const stops = resolveAnimationColorStops(patch, "#FFFFFF", "aurora");
    const defaults = defaultAnimationColorStopsForId("aurora", "#FFFFFF");

    expect(patch.animationId).toBe("aurora");
    expect(stops[0].color).toBe(defaults[0].color);
    expect(patch.animationColorsById?.aurora).toBeTruthy();
  });
});
