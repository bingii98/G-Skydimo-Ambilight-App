import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "./settingsSanitize";

describe("sanitizeSettings", () => {
  it("restores single hex from modeColors during sanitize", () => {
    const result = sanitizeSettings({
      hex: "#00CCAA",
      colorMode: "single",
      modeColors: {
        single: { hex: "#FF0000" },
      },
      animationId: "breathe",
    });

    expect(result.hex).toBe("#FF0000");
    expect(result.modeColors.single.hex).toBe("#FF0000");
  });

  it("preserves hex changes in single color mode when animation palette is stored", () => {
    const result = sanitizeSettings({
      hex: "#FF0000",
      colorMode: "single",
      animationId: "breathe",
      animationColorsById: {
        breathe: {
          animationColorStops: [
            { id: "anim-single", position: 0, color: "#00CCAA" },
            { id: "anim-single-end", position: 1, color: "#00CCAA" },
          ],
          animationActiveColorStopId: "anim-single",
        },
      },
    });

    expect(result.hex).toBe("#FF0000");
  });

  it("preserves valid activeNav and falls back for invalid values", () => {
    expect(sanitizeSettings({ activeNav: "external" }).activeNav).toBe("external");
    expect(sanitizeSettings({ activeNav: "studio" }).activeNav).toBe("studio");
    expect(sanitizeSettings({ activeNav: "invalid" }).activeNav).toBe("devices");
  });

  it("syncs animation palette colors when in animation mode", () => {
    const result = sanitizeSettings({
      hex: "#FF0000",
      colorMode: "animation",
      animationId: "breathe",
      animationColorsById: {
        breathe: {
          animationColorStops: [
            { id: "anim-single", position: 0, color: "#00CCAA" },
            { id: "anim-single-end", position: 1, color: "#00CCAA" },
          ],
          animationActiveColorStopId: "anim-single",
        },
      },
    });

    expect(result.hex).toBe("#00CCAA");
  });

  it("infers orientationConfirmed from saved strip layout", () => {
    const result = sanitizeSettings({
      orientationConfirmed: false,
      stripCounts: { top: 24, right: 12, bottom: 24, left: 12 },
    });

    expect(result.orientationConfirmed).toBe(true);
  });

  it("coerces invalid color scheme preferences to system", () => {
    expect(sanitizeSettings({ colorScheme: "invalid" }).colorScheme).toBe("system");
    expect(sanitizeSettings({ colorScheme: "dark" }).colorScheme).toBe("dark");
    expect(sanitizeSettings({ colorScheme: "light" }).colorScheme).toBe("light");
  });

  it("migrates deprecated animation ids and palettes", () => {
    const result = sanitizeSettings({
      colorMode: "animation",
      animationId: "ocean",
      animationColorsById: {
        ocean: {
          animationColorStops: [
            { id: "a", position: 0, color: "#003366" },
            { id: "b", position: 1, color: "#00AACC" },
          ],
          animationActiveColorStopId: "a",
        },
        blend: {
          animationColorStops: [
            { id: "c", position: 0, color: "#FFD700" },
            { id: "d", position: 1, color: "#FF0066" },
          ],
          animationActiveColorStopId: "c",
        },
      },
    });

    expect(result.animationId).toBe("aurora");
    expect(result.animationColorsById?.ocean).toBeUndefined();
    expect(result.animationColorsById?.blend).toBeUndefined();
    expect(result.animationColorsById?.aurora?.animationColorStops?.[0]?.color).toBe("#003366");
    expect(result.animationColorsById?.rainbow?.animationColorStops?.[0]?.color).toBe("#FFD700");
  });
});
