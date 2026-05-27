import { describe, expect, it } from "vitest";
import {
  adjustSaturation,
  buildScreenSamplePoints,
  buildScreenSyncPixels,
  createScreenSyncPlan,
  isNearBlack,
  matchEdgeColorForLed,
  resolveAutoSampleDepthPercent,
  resolveCaptureCanvasSize,
  resolveScreenSyncProfile,
  resolveScreenSyncRegion,
  resolveScreenSyncSmoothing,
  resolveScreenSyncTickMs,
  sampleColorsFromImage,
  sampleFaithfulEdgeColor,
  SCREEN_SYNC_REGIONS,
  SCREEN_SYNC_SMOOTHING,
  smoothRgb,
} from "./screenSync";

describe("screenSync", () => {
  it("uses light smoothing for real-time screen sync", () => {
    expect(SCREEN_SYNC_SMOOTHING).toBe(18);
    expect(resolveScreenSyncProfile(SCREEN_SYNC_REGIONS.EDGE).smoothing).toBe(0);
  });

  it("clamps user smoothness to 0–100", () => {
    expect(resolveScreenSyncSmoothing({ screenSyncSmoothing: 140 })).toBe(100);
    expect(resolveScreenSyncSmoothing({ screenSyncSmoothing: -5 })).toBe(0);
    expect(resolveScreenSyncSmoothing({ screenSyncSmoothing: 42 })).toBe(42);
  });

  it("samples close to the screen edge", () => {
    expect(resolveAutoSampleDepthPercent({ width: 8, height: 6 })).toBeLessThanOrEqual(3);
    expect(resolveAutoSampleDepthPercent({ width: 20, height: 14 })).toBeLessThanOrEqual(2.5);
  });

  it("builds one sample point per LED", () => {
    const ledMap = {
      width: 12,
      height: 8,
      points: [
        [0, 2],
        [6, 0],
        [11, 4],
      ],
    };

    const points = buildScreenSamplePoints(ledMap, 3, { region: SCREEN_SYNC_REGIONS.EDGE });
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 0, y: 2 / 7 });
  });

  it("keeps exact black pixels on the edge instead of nearby vivid colors", () => {
    const imageData = {
      width: 3,
      height: 3,
      data: new Uint8ClampedArray([
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255,
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      ]),
    };

    const colors = sampleColorsFromImage(imageData, [{ x: 0.5, y: 0.5 }], { pickVivid: false });
    expect(colors[0]).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("samples the captured border row for top-edge LEDs", () => {
    const imageData = {
      width: 5,
      height: 5,
      data: new Uint8ClampedArray(5 * 5 * 4),
    };

    for (let x = 0; x < 5; x += 1) {
      const top = (0 * 5 + x) * 4;
      imageData.data[top] = 0;
      imageData.data[top + 1] = 0;
      imageData.data[top + 2] = 0;

      const inner = (1 * 5 + x) * 4;
      imageData.data[inner] = 255;
      imageData.data[inner + 1] = 0;
      imageData.data[inner + 2] = 0;
    }

    const ledMap = { width: 5, height: 5, points: [[2, 0]] };
    const color = sampleFaithfulEdgeColor(imageData, { x: 0.5, y: 0 }, ledMap, 0);
    expect(color).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("does not boost near-black edge samples", () => {
    expect(isNearBlack(0, 0, 0)).toBe(true);
    expect(matchEdgeColorForLed(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("snaps to black immediately at low smoothness", () => {
    const next = smoothRgb({ r: 200, g: 40, b: 40 }, { r: 0, g: 0, b: 0 }, 10);
    expect(next).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("picks the most vivid pixel in a local kernel", () => {
    const imageData = {
      width: 3,
      height: 3,
      data: new Uint8ClampedArray([
        120, 120, 120, 255, 120, 120, 120, 255, 120, 120, 120, 255,
        120, 120, 120, 255, 255, 0, 0, 255, 120, 120, 120, 255,
        120, 120, 120, 255, 120, 120, 120, 255, 120, 120, 120, 255,
      ]),
    };

    const colors = sampleColorsFromImage(imageData, [{ x: 0.5, y: 0.5 }]);
    expect(colors[0]).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("smooths rgb toward previous values", () => {
    const next = smoothRgb({ r: 100, g: 100, b: 100 }, { r: 200, g: 50, b: 50 }, 50);
    expect(next.r).toBeGreaterThan(100);
    expect(next.r).toBeLessThan(200);
  });

  it("boosts pale sampled colors toward vivid edge tones", () => {
    const boosted = matchEdgeColorForLed(140, 150, 160, 0.3);
    expect(boosted.r + boosted.g + boosted.b).toBeGreaterThan(140 + 150 + 160);
  });

  it("passes through saturation when amount is zero", () => {
    expect(adjustSaturation(120, 80, 40, 0)).toEqual({ r: 120, g: 80, b: 40 });
  });

  it("defaults unknown screen sync regions to edge", () => {
    expect(resolveScreenSyncRegion({ screenSyncRegion: "unknown" })).toBe(SCREEN_SYNC_REGIONS.EDGE);
    expect(resolveScreenSyncRegion({ screenSyncRegion: "center" })).toBe(SCREEN_SYNC_REGIONS.CENTER);
  });

  it("preserves the monitor aspect ratio when scaling capture size", () => {
    const ultrawide = resolveCaptureCanvasSize(3440, 1440);
    expect(ultrawide.screenWidth).toBe(3440);
    expect(ultrawide.screenHeight).toBe(1440);
    expect(ultrawide.width).toBe(1920);
    expect(ultrawide.height).toBe(Math.round((1920 * 1440) / 3440));

    const hd = resolveCaptureCanvasSize(1920, 1080);
    expect(hd.width).toBe(1920);
    expect(hd.height).toBe(1080);
  });

  it("uses center sample point for all LEDs in center region", () => {
    const ledMap = {
      width: 12,
      height: 8,
      points: [
        [0, 2],
        [6, 0],
        [11, 4],
      ],
    };

    const points = buildScreenSamplePoints(ledMap, 3, { region: SCREEN_SYNC_REGIONS.CENTER });
    expect(points).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
  });

  it("pulls full-screen samples inward from each LED edge position", () => {
    const ledMap = {
      width: 12,
      height: 8,
      points: [[0, 0]],
    };

    const points = buildScreenSamplePoints(ledMap, 1, { region: SCREEN_SYNC_REGIONS.FULL });
    expect(points[0].x).toBeGreaterThan(0);
    expect(points[0].y).toBeGreaterThan(0);
    expect(points[0].x).toBeLessThan(0.5);
    expect(points[0].y).toBeLessThan(0.5);
  });

  it("builds cached plans with region-specific profiles", () => {
    const plan = createScreenSyncPlan({
      deviceModel: null,
      ledCount: 3,
      settings: { screenSyncRegion: "wide", screenSyncSmoothing: 42, zoneRotation: 0 },
    });

    expect(plan.profile.smoothing).toBe(42);
    expect(resolveScreenSyncProfile(SCREEN_SYNC_REGIONS.EDGE).inwardPercent).toBe(5);
    expect(plan.edgeSides).toHaveLength(3);
    expect(resolveScreenSyncTickMs({ screenSyncRegion: "edge" })).toBe(50);
    expect(resolveScreenSyncTickMs({ screenSyncRegion: "center" })).toBe(90);
  });

  it("fills every LED with one center sample", () => {
    const imageData = {
      width: 5,
      height: 5,
      data: new Uint8ClampedArray(5 * 5 * 4),
    };
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 20;
      imageData.data[i + 1] = 120;
      imageData.data[i + 2] = 200;
    }

    const { hexes } = buildScreenSyncPixels({
      imageData,
      ledCount: 4,
      deviceModel: null,
      settings: { screenSyncRegion: "center", brightness: 100 },
    });

    expect(hexes).toHaveLength(4);
    expect(new Set(hexes).size).toBe(1);
  });
});
