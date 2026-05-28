const { describe, expect, it } = require("vitest");
const {
  MELK_OA21,
  LOTUS_OA10,
  HONEYCOMB_TRI,
  resolveBleProfile,
} = require("../services/elkBleProfiles");
const { buildHoneycombLedColorCommand } = require("../services/lotusLampProtocol");

describe("elkBleProfiles", () => {
  it("resolves MELK-OA21 profile", () => {
    expect(resolveBleProfile("MELK-OA21   E3").id).toBe("MELK_OA21");
  });

  it("resolves honeycomb triangle profile before generic MELK", () => {
    expect(resolveBleProfile("MELK HONEYCOMB TRI").id).toBe("HONEYCOMB_TRI");
  });

  it("builds honeycomb per-led color frames", () => {
    expect(Array.from(HONEYCOMB_TRI.buildPixelCommands([255, 0, 0, 0, 255, 0], 100, { ledCount: 2 }))).toHaveLength(2);
    expect(Array.from(buildHoneycombLedColorCommand(3, 10, 20, 30))).toEqual([
      0x7e, 0x07, 0x05, 0x06, 3, 10, 20, 30, 0xef,
    ]);
  });

  it("builds MELK-OA21 color frame", () => {
    expect(Array.from(MELK_OA21.buildColor(255, 0, 0))).toEqual([
      0x7e, 0x00, 0x05, 0x03, 255, 0, 0, 0x00, 0xef,
    ]);
  });

  it("builds MELK-OA21 turn on/off frames", () => {
    expect(Array.from(MELK_OA21.buildTurnOn())).toEqual([
      0x7e, 0x04, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef,
    ]);
    expect(Array.from(MELK_OA21.buildTurnOff())).toEqual([
      0x7e, 0x04, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef,
    ]);
  });

  it("builds MELK-OA21 strip effect frame", () => {
    expect(Array.from(MELK_OA21.buildEffect(3))).toEqual([
      0x7e, 0x05, 0x03, 3, 0x06, 0xff, 0xff, 0x00, 0xef,
    ]);
    expect(Array.from(MELK_OA21.buildEffectSpeed(50))).toEqual([
      0x7e, 0x04, 0x02, 0x32, 0xff, 0xff, 0xff, 0x00, 0xef,
    ]);
  });

  it("builds Lotus OA10 color frame", () => {
    expect(Array.from(LOTUS_OA10.buildColor(0, 255, 0))).toEqual([
      0x7e, 0x07, 0x05, 0x03, 0, 255, 0, 0x10, 0xef,
    ]);
  });
});
