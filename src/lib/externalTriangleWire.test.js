import { describe, expect, it } from "vitest";
import {
  buildDefaultTriangleChainPanels,
  buildTrianglePanelPreview,
  TRIANGLE_LAYOUT_PRESETS,
} from "./externalTriangleLayout";
import { computeTrianglePanelPoses, createRootPanel, resetPanelIdCounter } from "./externalTrianglePose";
import {
  buildWireSourceOptions,
  computeTriangleWireRoute,
  cornerVisitOrder,
  describeWireOrigin,
  getSharedEdgeBetween,
  resolveEffectiveWireDirection,
  sanitizeTriangleWire,
  toggleTriangleWireDirection,
} from "./externalTriangleWire";

function countHubSpokeSegments(preview) {
  const panelCount = preview.triangles.filter((triangle) => !triangle.slot).length;
  const spokeSegments = preview.wirePointSegments.filter(
    (segment) =>
      segment.length === 2 &&
      segment[0]?.isCenter &&
      segment[1]?.cornerIndex != null
  );
  return { panelCount, spokeSegments: spokeSegments.length };
}

describe("externalTriangleWire", () => {
  it("sanitizes wire origin and direction", () => {
    expect(sanitizeTriangleWire({ origin: { type: "edge", index: 2 }, direction: "ccw" })).toEqual({
      origin: { type: "edge", index: 2 },
      direction: "ccw",
    });
  });

  it("finds shared edges between horizontal neighbors", () => {
    expect(getSharedEdgeBetween({ col: 0, row: 0 }, { col: 1, row: 0 })).toEqual({
      edgeA: 2,
      edgeB: 2,
    });
  });

  it("orders corners clockwise and counter-clockwise", () => {
    expect(cornerVisitOrder(0, "cw")).toEqual([0, 2, 1]);
    expect(cornerVisitOrder(0, "ccw")).toEqual([0, 1, 2]);
  });

  it("routes led indices through a multi-panel chain", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const route = computeTriangleWireRoute(panels, {
      origin: { type: "corner", index: 0 },
      direction: "cw",
    });

    expect(route.ledCount).toBe(6);
    expect(route.panels).toHaveLength(2);
    expect(route.panels[0].globalLedIndices).toEqual([0, 1, 2]);
    expect(route.panels[0].cornerOrder).toEqual([0, 2, 1]);
    expect(route.panels[1].globalLedIndices).toEqual([3, 4, 5]);
  });

  it("starts led numbering at the power entry corner", () => {
    const panels = buildDefaultTriangleChainPanels(1);
    const route = computeTriangleWireRoute(panels, {
      origin: { type: "corner", index: 1 },
      direction: "cw",
    });

    expect(route.panels[0].cornerOrder[0]).toBe(1);
    expect(route.panels[0].globalLedIndices).toEqual([0, 1, 2]);
    expect(route.panels[0].cornerToGlobalLed[1]).toBe(0);
  });

  it("changes led order when wire enters from a different edge", () => {
    const panels = [{ col: 0, row: 0 }];
    const cornerRoute = computeTriangleWireRoute(panels, {
      origin: { type: "corner", index: 0 },
      direction: "cw",
    });
    const edgeRoute = computeTriangleWireRoute(panels, {
      origin: { type: "edge", index: 1 },
      direction: "ccw",
    });

    expect(cornerRoute.panels[0].cornerOrder).toEqual([0, 2, 1]);
    expect(edgeRoute.panels[0].cornerOrder).not.toEqual(cornerRoute.panels[0].cornerOrder);
  });

  it("builds readable wire source options for panel 1", () => {
    const panel = { col: 0, row: 0 };
    const options = buildWireSourceOptions(panel, {
      origin: { type: "edge", index: 1 },
      direction: "cw",
    });

    expect(options.selectedOption.label).toBe("Bottom edge");
    expect(describeWireOrigin({ origin: { type: "edge", index: 1 }, direction: "cw" }, panel)).toBe(
      "Bottom edge"
    );
  });

  it("toggles wire direction", () => {
    expect(toggleTriangleWireDirection({ origin: { type: "corner", index: 0 }, direction: "cw" }).direction).toBe(
      "ccw"
    );
  });

  it("draws hub-and-spoke wire segments from each panel center to its corners", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels);
    const { panelCount, spokeSegments } = countHubSpokeSegments(preview);

    expect(panelCount).toBe(2);
    expect(spokeSegments).toBe(panelCount * 3);
    expect(
      preview.wirePointSegments.every(
        (segment) =>
          segment.length === 2 &&
          (segment[0]?.isCenter || segment[0]?.isInlet) &&
          (segment[1]?.isCenter || segment[1]?.cornerIndex != null)
      )
    ).toBe(true);
  });

  it("draws hub-and-spoke segments for branched layouts without cross-panel wire hops", () => {
    const presetPanels =
      TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3")?.panels || [];
    const preview = buildTrianglePanelPreview(presetPanels);
    const { panelCount, spokeSegments } = countHubSpokeSegments(preview);

    expect(panelCount).toBe(3);
    expect(spokeSegments).toBe(9);
    expect(
      preview.wirePointSegments.some(
        (segment) =>
          segment.length === 2 &&
          segment[0]?.panelId &&
          segment[1]?.panelId &&
          segment[0].panelId !== segment[1].panelId
      )
    ).toBe(false);
  });

  it("adds inlet segment from wire origin to root center when entry is off-center", () => {
    const panels = buildDefaultTriangleChainPanels(1);
    const preview = buildTrianglePanelPreview(panels, {
      wire: { origin: { type: "edge", index: 1 }, direction: "cw" },
    });

    expect(
      preview.wirePointSegments.some(
        (segment) => segment[0]?.isInlet && segment[1]?.isCenter
      )
    ).toBe(true);
  });

  it("routes reversed physical chain with stable hub-and-spoke segments", () => {
    const panels = buildDefaultTriangleChainPanels(4);
    const preview = buildTrianglePanelPreview(panels);
    const { panelCount, spokeSegments } = countHubSpokeSegments(preview);

    expect(panelCount).toBe(4);
    expect(spokeSegments).toBe(12);
  });

  it("inverts wire direction when panel is flipped", () => {
    resetPanelIdCounter();
    const panel = createRootPanel();
    const flipped = {
      ...panel,
      pose: { ...panel.pose, flip: true },
    };
    expect(
      resolveEffectiveWireDirection({ origin: { type: "corner", index: 0 }, direction: "cw" }, panel)
    ).toBe("cw");
    expect(
      resolveEffectiveWireDirection({ origin: { type: "corner", index: 0 }, direction: "cw" }, flipped)
    ).toBe("ccw");
  });
});
