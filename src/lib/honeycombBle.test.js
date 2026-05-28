import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { HONEYCOMB_TRI, resolveBleProfile } = require("../../services/elkBleProfiles.js");
const {
  buildHoneycombLedColorCommand,
  buildHoneycombPixelCommands,
} = require("../../services/lotusLampProtocol.js");

describe("honeycombBle", () => {
  it("resolves honeycomb triangle profile before generic MELK", () => {
    expect(resolveBleProfile("MELK HONEYCOMB TRI").id).toBe("HONEYCOMB_TRI");
  });

  it("builds honeycomb per-led color frames", () => {
    expect(
      HONEYCOMB_TRI.buildPixelCommands([255, 0, 0, 0, 255, 0], 100, { ledCount: 2 })
    ).toHaveLength(2);
    expect(Array.from(buildHoneycombLedColorCommand(3, 10, 20, 30))).toEqual([
      0x7e, 0x07, 0x05, 0x06, 3, 10, 20, 30, 0xef,
    ]);
  });

  it("builds honeycomb pixel command list for changed indices only", () => {
    const pixels = [255, 0, 0, 0, 255, 0, 0, 0, 255];
    expect(buildHoneycombPixelCommands(pixels, 3)).toHaveLength(3);
    const partial = buildHoneycombPixelCommands(pixels, 3, { changedIndices: [1] });
    expect(partial).toHaveLength(1);
    expect(Array.from(partial[0])[4]).toBe(1);
  });
});
