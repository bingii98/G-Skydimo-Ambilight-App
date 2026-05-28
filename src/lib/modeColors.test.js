import { describe, expect, it } from "vitest";
import { COLOR_MODES } from "./colorModes";
import {
  buildModeSwitchPatch,
  normalizeModeColors,
  persistCurrentModeColors,
} from "./modeColors";

describe("modeColors", () => {
  it("keeps single color when switching away from animation and back", () => {
    const singleSettings = {
      hex: "#FF0000",
      colorMode: COLOR_MODES.SINGLE,
      modeColors: normalizeModeColors(null, "#FF0000"),
    };

    const toAnimation = buildModeSwitchPatch(singleSettings, COLOR_MODES.ANIMATION, {
      defaultAnimationId: "breathe",
    });

    expect(toAnimation.hex).toBe("#00CCAA");
    expect(toAnimation.modeColors.single.hex).toBe("#FF0000");

    const animationSettings = {
      ...singleSettings,
      ...toAnimation,
      animationColorsById: toAnimation.animationColorsById,
    };

    const backToSingle = buildModeSwitchPatch(animationSettings, COLOR_MODES.SINGLE);

    expect(backToSingle.hex).toBe("#FF0000");
    expect(backToSingle.colorMode).toBe(COLOR_MODES.SINGLE);
  });

  it("restores per-led paint state when returning to leds mode", () => {
    const ledsSettings = {
      hex: "#112233",
      colorMode: COLOR_MODES.LEDS,
      ledPaintMode: "gradient",
      ledColors: ["#112233", "#445566"],
      gradientStops: [
        { id: "a", position: 0, color: "#112233" },
        { id: "b", position: 1, color: "#445566" },
      ],
      gradientActiveStopId: "b",
      selectedLed: 1,
      selectedLeds: [1],
      modeColors: {
        single: { hex: "#FF0000" },
        leds: {
          hex: "#112233",
          ledPaintMode: "gradient",
          ledColors: ["#112233", "#445566"],
          gradientStops: [
            { id: "a", position: 0, color: "#112233" },
            { id: "b", position: 1, color: "#445566" },
          ],
          gradientActiveStopId: "b",
          selectedLed: 1,
          selectedLeds: [1],
        },
      },
    };

    const toSingle = buildModeSwitchPatch(ledsSettings, COLOR_MODES.SINGLE);
    expect(toSingle.hex).toBe("#FF0000");

    const restored = buildModeSwitchPatch(
      { ...ledsSettings, ...toSingle },
      COLOR_MODES.LEDS,
      { ledCount: 2 }
    );

    expect(restored.hex).toBe("#112233");
    expect(restored.ledPaintMode).toBe("gradient");
    expect(restored.ledColors).toEqual(["#112233", "#445566"]);
    expect(restored.gradientActiveStopId).toBe("b");
    expect(restored.selectedLeds).toEqual([1]);
  });

  it("persists single hex snapshot from active settings", () => {
    const snapshot = persistCurrentModeColors({
      hex: "#ABCDEF",
      colorMode: COLOR_MODES.SINGLE,
    });

    expect(snapshot.single.hex).toBe("#ABCDEF");
  });
});
