import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  analyzeCapture,
  classifyElkFrame,
  diffFrames,
  frameToHex,
  parseHexFrames,
  suggestBuilderPatch,
} = require("../../services/bleFrameParser.js");

describe("bleFrameParser", () => {
  it("parses ELK frames from log text", () => {
    const frames = parseHexFrames("write 7e 07 05 06 02 00 00 ff ef done");
    expect(frames).toHaveLength(1);
    expect(frameToHex(frames[0])).toBe("7e 07 05 06 02 00 00 ff ef");
  });

  it("classifies single rgb and effect frames", () => {
    expect(classifyElkFrame([0x7e, 0x00, 0x05, 0x03, 255, 0, 0, 0, 0xef]).type).toBe("single_rgb");
    expect(classifyElkFrame([0x7e, 0x05, 0x03, 6, 0xff, 0xff, 0x00, 0xef]).type).toBe("effect");
  });

  it("detects likely index byte from annotated captures", () => {
    const analysis = analyzeCapture([
      { hex: "7e 07 05 06 00 ff 00 00 ef", note: "led 0 red" },
      { hex: "7e 07 05 06 03 00 00 ff ef", note: "led 3 blue" },
    ]);

    expect(analysis.perLedCandidates[0]?.byteIndex).toBe(4);
    const patch = suggestBuilderPatch(analysis);
    expect(patch.indexByte).toBe(4);
    expect(patch.rgbBytes).toEqual([5, 6, 7]);
  });

  it("diffs frames", () => {
    const diffs = diffFrames(
      [0x7e, 0x07, 0x05, 0x06, 0x00, 0xff, 0x00, 0x00, 0xef],
      [0x7e, 0x07, 0x05, 0x06, 0x03, 0x00, 0x00, 0xff, 0xef]
    );
    expect(diffs.map((entry) => entry.index)).toEqual([4, 5, 7]);
  });
});
