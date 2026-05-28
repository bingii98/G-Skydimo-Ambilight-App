import { describe, expect, it } from "vitest";
import {
  computeTrianglePanelPoses,
  createJoinedPanel,
  createRootPanel,
  detectJoinFromAnchors,
  getPanelWorldGeometry,
  panelsShareWorldPoint,
  panelsLayoutHasOverlap,
  resetPanelIdCounter,
  resolveSmartPanelJoin,
  TRIANGLE_JOIN_TYPES,
} from "./externalTrianglePose";
import { buildDefaultTriangleChainPanels } from "./externalTriangleLayout";

describe("externalTrianglePose", () => {
  it("detects join types from anchor pairs", () => {
    expect(
      detectJoinFromAnchors(
        { kind: "corner", index: 0 },
        { kind: "corner", index: 1 }
      ).type
    ).toBe(TRIANGLE_JOIN_TYPES.CORNER_CORNER);

    expect(
      detectJoinFromAnchors(
        { kind: "edge", index: 1, t: 0.5 },
        { kind: "corner", index: 0 }
      ).type
    ).toBe(TRIANGLE_JOIN_TYPES.CORNER_EDGE);
  });

  it("aligns edge-joined chain panels with shared corners", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(3);
    const poses = computeTrianglePanelPoses(panels);
    const geoms = panels.map((panel) => getPanelWorldGeometry(panel, poses[panel.id]));
    expect(panelsShareWorldPoint(geoms[0].worldCorners, geoms[1].worldCorners, 0.05)).toBe(true);
    expect(panelsShareWorldPoint(geoms[1].worldCorners, geoms[2].worldCorners, 0.05)).toBe(true);
  });

  it("creates root and joined panel nodes", () => {
    resetPanelIdCounter();
    const root = createRootPanel();
    const child = createJoinedPanel(root.id, {
      type: TRIANGLE_JOIN_TYPES.CORNER_CORNER,
      parent: { kind: "corner", index: 1 },
      child: { kind: "corner", index: 0 },
      rotationDeg: 180,
    });
    expect(child.parentId).toBe(root.id);
    expect(child.join?.type).toBe(TRIANGLE_JOIN_TYPES.CORNER_CORNER);
  });

  it("prefers outward apex-up joins instead of same-corner attachment", () => {
    resetPanelIdCounter();
    const root = createRootPanel();
    const join = resolveSmartPanelJoin({
      parentPanelId: root.id,
      parentAnchor: { kind: "corner", index: 1 },
      panels: [root],
      desiredDirection: "up",
    });

    expect(join).toBeTruthy();
    expect(join?.child?.index).not.toBe(1);

    const child = createJoinedPanel(root.id, join);
    const poses = computeTrianglePanelPoses([root, child]);
    const childGeom = getPanelWorldGeometry(child, poses[child.id]);
    expect(childGeom.worldCorners[0].y).toBeLessThan(childGeom.cy);
    expect(panelsShareWorldPoint(getPanelWorldGeometry(root, poses[root.id]).worldCorners, childGeom.worldCorners, 0.08)).toBe(true);
  });

  it("resolves edge attachment with apex up", () => {
    resetPanelIdCounter();
    const root = createRootPanel();
    const join = resolveSmartPanelJoin({
      parentPanelId: root.id,
      parentAnchor: { kind: "edge", index: 2, t: 0.5 },
      panels: [root],
      desiredDirection: "up",
    });

    expect(join?.type).toBe(TRIANGLE_JOIN_TYPES.EDGE_EDGE);
    const child = createJoinedPanel(root.id, join);
    const poses = computeTrianglePanelPoses([root, child]);
    const childGeom = getPanelWorldGeometry(child, poses[child.id]);
    expect(childGeom.worldCorners[0].y).toBeLessThanOrEqual(childGeom.cy + 0.05);
  });

  it("detects fully stacked panels", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(2);
    const stackedJoin = {
      type: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
      parent: { kind: "edge", index: 2 },
      child: { kind: "edge", index: 0 },
      rotationDeg: 180,
      flip: false,
    };
    const next = panels.map((entry) =>
      entry.id === panels[1].id
        ? { ...entry, parentId: panels[0].id, join: stackedJoin }
        : entry
    );
    expect(panelsLayoutHasOverlap(next)).toBe(true);
  });

  it("enforces apex down when explicitly requested", () => {
    resetPanelIdCounter();
    const root = createRootPanel();
    const join = resolveSmartPanelJoin({
      parentPanelId: root.id,
      parentAnchor: { kind: "corner", index: 1 },
      panels: [root],
      desiredDirection: "down",
    });

    expect(join).toBeTruthy();
    const child = createJoinedPanel(root.id, join);
    const poses = computeTrianglePanelPoses([root, child]);
    const childGeom = getPanelWorldGeometry(child, poses[child.id]);
    expect(childGeom.worldCorners[0].y).toBeGreaterThanOrEqual(childGeom.cy - 0.05);
  });
});
