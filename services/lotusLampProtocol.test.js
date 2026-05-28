const { describe, expect, it } = require("vitest");
const {
  buildRgbCommand,
  buildBrightnessCommand,
  aggregatePixelsToRgb,
  scaleRgbByBrightness,
  shouldIncludeBleDevice,
  buildHoneycombLedColorCommand,
  buildHoneycombPixelCommands,
} = require("../services/lotusLampProtocol");

describe("lotusLampProtocol", () => {
  it("builds rgb command frame", () => {
    expect(Array.from(buildRgbCommand(255, 0, 128))).toEqual([
      0x7e, 0x07, 0x05, 0x03, 255, 0, 128, 0x10, 0xef,
    ]);
  });

  it("builds brightness command frame", () => {
    expect(Array.from(buildBrightnessCommand(50))).toEqual([
      0x7e, 0x07, 0x01, 0x32, 0xff, 0xff, 0xff, 0x00, 0xef,
    ]);
  });

  it("aggregates pixel buffers to average rgb", () => {
    expect(aggregatePixelsToRgb([255, 0, 0, 0, 255, 0])).toEqual({
      red: 128,
      green: 128,
      blue: 0,
    });
  });

  it("scales rgb by brightness", () => {
    expect(scaleRgbByBrightness(200, 100, 50, 50)).toEqual({
      red: 100,
      green: 50,
      blue: 25,
    });
  });

  it("includes MELK devices without advertised service uuid", () => {
    expect(
      shouldIncludeBleDevice({
        localName: "MELK-OA21   E3",
        serviceUuids: [],
      })
    ).toBe(true);
  });

  it("excludes unrelated ble devices", () => {
    expect(
      shouldIncludeBleDevice({
        localName: "Dungnt98",
        serviceUuids: [],
      })
    ).toBe(false);
  });

  it("builds honeycomb per-led command frames", () => {
    expect(Array.from(buildHoneycombLedColorCommand(0, 255, 128, 0))).toEqual([
      0x7e, 0x07, 0x05, 0x06, 0, 255, 128, 0, 0xef,
    ]);
  });

  it("builds honeycomb pixel command list for changed indices only", () => {
    const pixels = [255, 0, 0, 0, 255, 0, 0, 0, 255];
    const all = buildHoneycombPixelCommands(pixels, 3);
    expect(all).toHaveLength(3);
    const partial = buildHoneycombPixelCommands(pixels, 3, { changedIndices: [1] });
    expect(partial).toHaveLength(1);
    expect(Array.from(partial[0])[4]).toBe(1);
  });
});
