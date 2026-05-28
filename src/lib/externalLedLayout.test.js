import { describe, expect, it } from "vitest";
import {
  buildExternalLayoutPatch,
  buildStripPreviewNodes,
  buildTriangleChainPreview,
  EXTERNAL_LAYOUT_KINDS,
  LEDS_PER_TRIANGLE,
  resolveExternalLayout,
} from "./externalLedLayout";

describe("externalLedLayout", () => {
  it("resolves strip layout from led count", () => {
    const layout = resolveExternalLayout({ layoutKind: "strip", ledCount: 30 });
    expect(layout.layoutKind).toBe(EXTERNAL_LAYOUT_KINDS.STRIP);
    expect(layout.ledCount).toBe(30);
    expect(layout.triangleCount).toBeNull();
  });

  it("derives led count from triangle count", () => {
    const layout = resolveExternalLayout({ layoutKind: "triangle", triangleCount: 6 });
    expect(layout.layoutKind).toBe(EXTERNAL_LAYOUT_KINDS.TRIANGLE);
    expect(layout.triangleCount).toBe(6);
    expect(layout.ledCount).toBe(6 * LEDS_PER_TRIANGLE);
  });

  it("builds layout patch for triangle chain", () => {
    const patch = buildExternalLayoutPatch(EXTERNAL_LAYOUT_KINDS.TRIANGLE, { triangleCount: 4 });
    expect(patch.layoutKind).toBe(EXTERNAL_LAYOUT_KINDS.TRIANGLE);
    expect(patch.triangleCount).toBe(4);
    expect(patch.ledCount).toBe(12);
    expect(patch.ledCountSource).toBe("manual");
  });

  it("builds preview nodes for strip and triangle layouts", () => {
    expect(buildStripPreviewNodes(12)).toHaveLength(12);
    expect(buildTriangleChainPreview(5)).toHaveLength(5);
    expect(buildTriangleChainPreview(5)[0].leds).toHaveLength(3);
  });
});
