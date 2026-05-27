import { describe, expect, it } from "vitest";
import {
  analyzeColorPrompt,
  parseAnimationFreshPaletteSuggestion,
  paletteMatchesConstraints,
  synthesizePaletteFromConstraints,
  synthesizeRainbowPalette,
} from "./animationPalettePrompt";

describe("animationPalettePrompt", () => {
  it("detects white and yellow from Vietnamese prompt", () => {
    const constraints = analyzeColorPrompt("tông màu trắng vàng");

    expect(constraints.families).toEqual(expect.arrayContaining(["white", "yellow"]));
    expect(constraints.strictPalette).toBe(true);
    expect(constraints.maxStops).toBeLessThanOrEqual(3);
  });

  it("synthesizes a soft white-yellow palette", () => {
    const constraints = analyzeColorPrompt("tông màu trắng vàng");
    const stops = synthesizePaletteFromConstraints(constraints);

    expect(stops.length).toBeGreaterThanOrEqual(2);
    expect(stops.length).toBeLessThanOrEqual(3);
    expect(paletteMatchesConstraints(stops, constraints)).toBe(true);
  });

  it("replaces unrelated rainbow AI colors for strict white-yellow requests", () => {
    const mood = "tông màu trắng vàng";
    const stops = parseAnimationFreshPaletteSuggestion(
      {
        stops: [
          { color: "#FF0000", position: 0 },
          { color: "#00FF00", position: 0.33 },
          { color: "#0000FF", position: 0.66 },
          { color: "#8800FF", position: 1 },
        ],
      },
      "#FFD700",
      mood
    );

    expect(stops.length).toBeLessThanOrEqual(3);
    expect(paletteMatchesConstraints(stops, analyzeColorPrompt(mood))).toBe(true);
  });

  it("keeps valid AI white-yellow stops", () => {
    const mood = "white and yellow";
    const stops = parseAnimationFreshPaletteSuggestion(
      {
        stops: [
          { color: "#FFFEF8", position: 0 },
          { color: "#FFF6D6", position: 0.5 },
          { color: "#FFE08A", position: 1 },
        ],
      },
      "#FFD700",
      mood
    );

    expect(stops.map((stop) => stop.color)).toEqual(
      expect.arrayContaining(["#FFFEF8", "#FFF6D6", "#FFE08A"])
    );
  });

  it("requests seven vivid rainbow colors from Vietnamese prompt", () => {
    const constraints = analyzeColorPrompt("7 màu sặc sỡ rainbow");

    expect(constraints.stopCount).toBe(7);
    expect(constraints.wantsRainbow).toBe(true);
    expect(constraints.vivid).toBe(true);
    expect(constraints.strictPalette).toBe(false);
    expect(constraints.ignoreExistingPalette).toBe(true);
  });

  it("builds seven-stop vivid rainbow palette when AI response is off-brief", () => {
    const mood = "7 màu sặc sỡ rainbow";
    const stops = parseAnimationFreshPaletteSuggestion(
      {
        stops: [
          { color: "#FFFEF8", position: 0 },
          { color: "#FFE08A", position: 1 },
        ],
      },
      "#FFD700",
      mood
    );

    expect(stops).toHaveLength(7);
    expect(new Set(stops.map((stop) => stop.color)).size).toBe(7);
  });

  it("keeps valid seven-color rainbow AI response", () => {
    const mood = "7 màu sặc sỡ rainbow";
    const aiColors = synthesizeRainbowPalette(7, true).map((stop) => stop.color);
    const stops = parseAnimationFreshPaletteSuggestion(
      {
        stops: aiColors.map((color, index) => ({
          color,
          position: index / 6,
        })),
      },
      "#FFD700",
      mood
    );

    expect(stops).toHaveLength(7);
    expect(stops.map((stop) => stop.color)).toEqual(expect.arrayContaining(aiColors));
  });
});
