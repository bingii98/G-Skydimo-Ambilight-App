import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "./settingsSanitize";

describe("sanitizeSettings", () => {
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
});
