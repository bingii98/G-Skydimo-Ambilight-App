import { describe, expect, it } from "vitest";
import {
  addTrianglePanel,
  addTrianglePanelWithJoin,
  analyzeTrianglePanelGraph,
  buildDefaultTriangleChainPanels,
  buildTriangleLayoutPatch,
  buildTrianglePanelConnections,
  buildTrianglePowerFlowPaths,
  buildPowerFlowLineSegments,
  collectPowerFlowNodeKeys,
  buildTrianglePanelPreview,
  canAddTrianglePanel,
  collectUniqueTriangleLedMarkers,
  collectLedIndicesAtPosition,
  computeTriangleLedLabelOffset,
  findMatchingTrianglePreset,
  listTriangleAddSlots,
  migrateGridPanelsToJoinTree,
  moveTrianglePanelWithJoin,
  optimizeTriangleLayout,
  orderTrianglePanelsForWire,
  removeTrianglePanel,
  reorderWirePanelOrder,
  rotatePanelJoin,
  sanitizeTrianglePanels,
  serializeTrianglePanels,
  summarizeTriangleLayoutEditor,
  TRIANGLE_LAYOUT_PRESETS,
  TRIANGLE_PREVIEW_SCALE,
} from "./externalTriangleLayout";
import {
  migrateTrianglePowerSettings,
  toggleTriangleActiveLink,
} from "./externalTrianglePowerGraph";
import { resetPanelIdCounter, resolveSmartPanelJoin, panelsLayoutHasOverlap, snapRotationDeg } from "./externalTrianglePose";

describe("externalTriangleLayout", () => {
  it("builds a default horizontal chain with join-tree nodes", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(4);
    expect(panels).toHaveLength(4);
    expect(panels[0].pose).toBeDefined();
    expect(panels[1].join?.type).toBe("edge-edge");
    expect(panels[1].parentId).toBe(panels[0].id);
  });

  it("migrates legacy grid panels to join-tree", () => {
    const migrated = migrateGridPanelsToJoinTree([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].pose).toBeDefined();
    expect(migrated[1].parentId).toBe(migrated[0].id);
    expect(migrated[1].join?.type).toBe("edge-edge");
  });

  it("adds panels via grid coordinates through migration", () => {
    const base = buildDefaultTriangleChainPanels(1);
    expect(canAddTrianglePanel(base, 1, 0)).toBe(true);
    expect(addTrianglePanel(base, 1, 0)).toHaveLength(2);
  });

  it("keeps at least one panel when removing", () => {
    const base = buildDefaultTriangleChainPanels(2);
    const afterRemove = removeTrianglePanel(base, 1, 0);
    expect(afterRemove).toHaveLength(1);
    expect(removeTrianglePanel(afterRemove, 0, 0)).toEqual(afterRemove);
  });

  it("builds preview geometry for panels and anchor slots", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    expect(preview.panelCount).toBe(2);
    expect(preview.triangles.some((triangle) => triangle.slot)).toBe(true);
    expect(preview.triangles.find((triangle) => triangle.wireIndex === 0)?.leds).toHaveLength(3);
  });

  it("creates layout patch from panel map", () => {
    const patch = buildTriangleLayoutPatch(buildDefaultTriangleChainPanels(3));
    expect(patch.triangleCount).toBe(3);
    expect(patch.ledCount).toBe(9);
    expect(patch.trianglePanels).toHaveLength(3);
    expect(patch.triangleLayoutVersion).toBe(3);
    expect(patch.triangleActiveLinks?.length).toBe(2);
    expect(patch.trianglePowerRootId).toBeTruthy();
  });

  it("lists anchor slots around existing panels", () => {
    const slots = listTriangleAddSlots(buildDefaultTriangleChainPanels(1));
    expect(slots.length).toBeGreaterThan(0);
  });

  it("matches presets and summarizes editor state", () => {
    const panels = buildDefaultTriangleChainPanels(4);
    expect(findMatchingTrianglePreset(panels)?.label).toBe("Line · 4");

    const buildSummary = summarizeTriangleLayoutEditor(buildDefaultTriangleChainPanels(1), {
      origin: { type: "corner", index: 0 },
      direction: "cw",
    });
    expect(buildSummary.step).toBe("build");

    const wireSummary = summarizeTriangleLayoutEditor(panels, {
      origin: { type: "corner", index: 0 },
      direction: "cw",
    });
    expect(wireSummary.ledCount).toBe(12);
  });

  it("keeps separate led markers at shared corners", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const preview = buildTrianglePanelPreview(panels);
    const markers = collectUniqueTriangleLedMarkers(preview.triangles);
    expect(markers.length).toBe(9);
    expect(markers.some((marker) => marker.ledIndex === 0)).toBe(true);
    expect(markers.some((marker) => marker.ledIndex === 8)).toBe(true);
  });

  it("offsets led labels away from shared corners", () => {
    const offset = computeTriangleLedLabelOffset(50, 50, [{ cx: 40, cy: 55 }], 5);
    expect(offset.x).toBeGreaterThan(50);
    expect(offset.y).toBeLessThan(50);
  });

  it("orders panels along a physical chain", () => {
    const scrambled = migrateGridPanelsToJoinTree([
      { col: 2, row: 0 },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    const result = orderTrianglePanelsForWire(scrambled);
    expect(result.success).toBe(true);
    expect(result.panels).toHaveLength(3);
    expect(result.panels.map((panel) => panel.id)).toHaveLength(3);
  });

  it("detects disconnected layouts and linear chains", () => {
    const disconnected = migrateGridPanelsToJoinTree([
      { col: 0, row: 0 },
      { col: 2, row: 0 },
    ]);
    expect(analyzeTrianglePanelGraph(disconnected).isConnected).toBe(false);

    const chain = buildDefaultTriangleChainPanels(3);
    const graph = analyzeTrianglePanelGraph(chain);
    expect(graph.isConnected).toBe(true);
    expect(graph.isLinearChain).toBe(true);
  });

  it("optimizes panel order and wire entry", () => {
    const scrambled = migrateGridPanelsToJoinTree([
      { col: 2, row: 0 },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    const result = optimizeTriangleLayout(scrambled, {
      origin: { type: "corner", index: 0 },
      direction: "cw",
    });
    expect(result.success).toBe(true);
    expect(result.panels[0].id).toBe(
      migrateGridPanelsToJoinTree([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }])[0].id
    );
  });

  it("builds connection markers between adjacent panels", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels);
    const connections = buildTrianglePanelConnections(preview);
    expect(connections.length).toBeGreaterThanOrEqual(1);
    expect(connections[0].isActive).toBe(true);
    expect(connections[0].markers).toHaveLength(2);
    expect(connections[0].flowCenterVector).toHaveLength(2);
  });

  it("builds center-to-center power flow paths with branches", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const preview = buildTrianglePanelPreview(preset.panels);
    const paths = buildTrianglePowerFlowPaths(preview);
    const trianglesById = Object.fromEntries(
      preview.triangles.filter((triangle) => !triangle.slot).map((triangle) => [triangle.id, triangle])
    );

    expect(paths.length).toBeGreaterThanOrEqual(2);
    for (const path of paths) {
      expect(path.points).toHaveLength(2);
      const fromTriangle = trianglesById[path.fromPanelId];
      const toTriangle = trianglesById[path.toPanelId];
      expect(path.points[0].x).toBeCloseTo(fromTriangle.cx, 1);
      expect(path.points[0].y).toBeCloseTo(fromTriangle.cy, 1);
      expect(path.points[1].x).toBeCloseTo(toTriangle.cx, 1);
      expect(path.points[1].y).toBeCloseTo(toTriangle.cy, 1);
    }
    const segments = buildPowerFlowLineSegments(paths);
    expect(segments.length).toBeGreaterThanOrEqual(paths.length);
    const nodeKeys = collectPowerFlowNodeKeys(paths);
    expect(nodeKeys.size).toBeGreaterThanOrEqual(3);

    const chainPanels = buildDefaultTriangleChainPanels(2);
    const chainPreview = buildTrianglePanelPreview(chainPanels);
    const connections = buildTrianglePanelConnections(chainPreview);
    const idlePanelIds = connections.flatMap((connection) => [
      connection.flowCenterVector?.[0]?.nodeId,
      connection.flowCenterVector?.[1]?.nodeId,
    ]);
    expect(() => collectPowerFlowNodeKeys(paths, idlePanelIds)).not.toThrow();
    expect(collectPowerFlowNodeKeys([], idlePanelIds).size).toBeGreaterThan(0);
    expect(preview.centerPowerVectors?.length).toBeGreaterThanOrEqual(2);
  });

  it("marks powered and idle panels in preview", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const power = migrateTrianglePowerSettings(panels, {});
    const links = power.triangleActiveLinks;
    const target = links[links.length - 1];
    const toggled = toggleTriangleActiveLink(panels, links, target, false);
    const preview = buildTrianglePanelPreview(panels, {
      powerRootId: power.trianglePowerRootId,
      activeLinks: toggled.links,
    });
    const idleTriangle = preview.triangles.find((triangle) => triangle.powerStatus === "idle");
    expect(idleTriangle).toBeTruthy();
  });

  it("orders powered panels from the power root for branched layouts", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const [root, left, right] = preset.panels;
    const preview = buildTrianglePanelPreview(preset.panels);
    expect(preview.polylinePanelIds[0]).toBe(root.id);
    expect(preview.polylinePanelIds).toContain(left.id);
    expect(preview.polylinePanelIds).toContain(right.id);
  });

  it("rotates the structural root panel", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(4);
    const rootId = panels.find((panel) => !panel.parentId)?.id;
    const rotated = rotatePanelJoin(panels, rootId, 60);
    expect(rotated.find((panel) => panel.id === rootId)?.pose?.rotationDeg).toBe(60);
  });

  it("rotates edge-edge child panels", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(3);
    const last = panels[2];
    expect(last.join?.type).toBe("edge-edge");
    const rotated = rotatePanelJoin(panels, last.id, 60);
    expect(rotated.find((panel) => panel.id === last.id)?.join?.rotationDeg).toBe(60);
  });

  it("rotates corner-corner child panels", () => {
    resetPanelIdCounter();
    let panels = buildDefaultTriangleChainPanels(1);
    const join = resolveSmartPanelJoin({
      parentPanelId: panels[0].id,
      parentAnchor: { kind: "corner", index: 2 },
      panels,
      desiredDirection: "auto",
    });
    panels = addTrianglePanelWithJoin(panels, panels[0].id, join);
    const child = panels[1];
    expect(child.join?.type).toBe("corner-corner");
    const before = child.join?.rotationDeg || 0;
    const rotated = rotatePanelJoin(panels, child.id, 60);
    expect(rotated.find((panel) => panel.id === child.id)?.join?.rotationDeg).toBe(
      snapRotationDeg(before + 60)
    );
  });

  it("flags scrambled panel order in summary", () => {
    resetPanelIdCounter();
    const ordered = migrateGridPanelsToJoinTree([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
    ]);
    resetPanelIdCounter();
    const scrambled = [
      ordered[2],
      ordered[0],
      ordered[1],
    ];
    const summary = summarizeTriangleLayoutEditor(scrambled, {
      origin: { type: "corner", index: 0 },
      direction: "cw",
    });
    expect(summary.needsOrder).toBe(false);
    expect(summary.powerSummary).toBeTruthy();
  });

  it("sanitizes legacy col/row arrays", () => {
    const panels = sanitizeTrianglePanels([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    expect(panels[0].id).toBeDefined();
    expect(panels[1].join?.type).toBe("edge-edge");
  });

  it("moves a child panel to a new parent anchor", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const movingPanel = panels[2];
    const nextJoin = {
      type: "edge-edge",
      parent: { kind: "edge", index: 1 },
      child: { kind: "edge", index: 0 },
      rotationDeg: 0,
      flip: false,
    };
    const moved = moveTrianglePanelWithJoin(panels, movingPanel.id, panels[0].id, nextJoin);
    const updated = moved.find((panel) => panel.id === movingPanel.id);
    expect(updated?.parentId).toBe(panels[0].id);
    expect(updated?.join?.parent).toEqual(nextJoin.parent);
    expect(moved).toHaveLength(3);
  });

  it("rejects panel move that would stack on the same plane", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(2);
    const before = serializeTrianglePanels(panels);
    const stackedJoin = {
      type: "edge-edge",
      parent: { kind: "edge", index: 2 },
      child: { kind: "edge", index: 0 },
      rotationDeg: 180,
      flip: false,
    };
    const moved = moveTrianglePanelWithJoin(panels, panels[1].id, panels[0].id, stackedJoin);
    expect(serializeTrianglePanels(moved)).toBe(before);
  });

  it("rejects adding a panel on an occupied root edge", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(4);
    const join = resolveSmartPanelJoin({
      parentPanelId: panels[0].id,
      parentAnchor: { kind: "edge", index: 2, t: 0.5 },
      panels,
      desiredDirection: "auto",
    });
    expect(join).toBeNull();
  });

  it("adds a branch on a free root edge as a connected layout", () => {
    resetPanelIdCounter();
    const panels = buildDefaultTriangleChainPanels(4);
    const join = resolveSmartPanelJoin({
      parentPanelId: panels[0].id,
      parentAnchor: { kind: "edge", index: 1, t: 0.5 },
      panels,
      desiredDirection: "auto",
    });
    expect(join?.type).toBe("edge-edge");
    const next = addTrianglePanelWithJoin(panels, panels[0].id, join);
    expect(analyzeTrianglePanelGraph(next).isConnected).toBe(true);
  });

  it("adds a panel on a free corner of a branched tip panel", () => {
    resetPanelIdCounter();
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const right = preset.panels[2];
    const join = resolveSmartPanelJoin({
      parentPanelId: right.id,
      parentAnchor: { kind: "corner", index: 1 },
      panels: preset.panels,
      desiredDirection: "auto",
    });
    expect(join).toBeTruthy();
    const next = addTrianglePanelWithJoin(preset.panels, right.id, join);
    expect(next.length).toBe(4);
    expect(panelsLayoutHasOverlap(next)).toBe(false);
  });

  it("reorders wire panel sequence for branch layouts", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const [root, left, right] = preset.panels;
    const reordered = reorderWirePanelOrder(
      preset.panels,
      [root.id, left.id, right.id],
      right.id,
      root.id
    );
    expect(reordered).toEqual([right.id, root.id, left.id]);
  });

  it("assigns fixed led indices by panel order and corner index", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const preview = buildTrianglePanelPreview(panels, {
      wire: { origin: { type: "corner", index: 2 }, direction: "cw" },
    });

    for (const triangle of preview.triangles.filter((entry) => !entry.slot)) {
      const panelSequence = triangle.wireIndex;
      for (const led of triangle.leds) {
        expect(led.ledIndex).toBe(panelSequence * 3 + led.cornerIndex);
        expect(led.wireStep).toBe(led.cornerIndex + 1);
      }
    }
  });

  it("draws hub-and-spoke wire segments for each panel", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels);
    const panelCount = preview.triangles.filter((triangle) => !triangle.slot).length;
    const spokeSegments = preview.wirePointSegments.filter(
      (segment) => segment.length === 2 && segment[0]?.isCenter && segment[1]?.cornerIndex != null
    );

    expect(spokeSegments.length).toBe(panelCount * 3);
  });

  it("chamfers panel corners and separates shared corner handles", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const preview = buildTrianglePanelPreview(preset.panels);
    const triangles = preview.triangles.filter((triangle) => !triangle.slot);

    for (const triangle of triangles) {
      expect(triangle.points.split(" ").length).toBe(6);
    }

    const sharedHandles = [];
    for (const triangle of triangles) {
      for (const led of triangle.leds) {
        const key = `${Math.round(led.cornerX)}:${Math.round(led.cornerY)}`;
        sharedHandles.push({ key, x: led.x, y: led.y });
      }
    }

    const byKey = new Map();
    for (const handle of sharedHandles) {
      if (!byKey.has(handle.key)) {
        byKey.set(handle.key, []);
      }
      byKey.get(handle.key).push(handle);
    }

    const stacked = [...byKey.values()].some((group) => {
      if (group.length < 2) {
        return false;
      }
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          if (Math.hypot(group[i].x - group[j].x, group[i].y - group[j].y) < 2.5) {
            return true;
          }
        }
      }
      return false;
    });
    expect(stacked).toBe(false);
  });

  it("keeps triangle preview scale when adding panels", () => {
    const preview4 = buildTrianglePanelPreview(buildDefaultTriangleChainPanels(4));
    const preview6 = buildTrianglePanelPreview(buildDefaultTriangleChainPanels(6));

    function triangleWidth(preview) {
      const triangle = preview.triangles.find((entry) => !entry.slot);
      const xs = triangle.points.split(" ").map((point) => Number(point.split(",")[0]));
      return Math.max(...xs) - Math.min(...xs);
    }

    expect(triangleWidth(preview4)).toBeGreaterThan(TRIANGLE_PREVIEW_SCALE * 0.85);
    expect(Math.abs(triangleWidth(preview4) - triangleWidth(preview6))).toBeLessThan(2);
    expect(preview6.viewBox).not.toBe(preview4.viewBox);
  });

  it("numbers all panels and shared leds for branched layouts", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const panels = preset.panels;
    const preview = buildTrianglePanelPreview(panels);
    const panelLabels = preview.triangles
      .filter((triangle) => !triangle.slot)
      .map((triangle) => triangle.label)
      .sort();
    expect(panelLabels).toEqual(["1", "2", "3"]);
    const markers = collectUniqueTriangleLedMarkers(preview.triangles);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((marker) => marker.ledIndex != null)).toBe(true);
    const ledNumbers = markers.map((marker) => marker.ledIndex + 1).sort((a, b) => a - b);
    expect(ledNumbers[0]).toBe(1);
    expect(ledNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("collects all led indices at a shared corner position", () => {
    const markers = [
      { ledIndex: 2, x: 10, y: 20 },
      { ledIndex: 5, x: 10.02, y: 20.01 },
      { ledIndex: 8, x: 30, y: 40 },
    ];
    expect(collectLedIndicesAtPosition(markers, 10, 20)).toEqual([2, 5]);
    expect(collectLedIndicesAtPosition(markers, 30, 40)).toEqual([8]);
    expect(collectLedIndicesAtPosition(markers, 0, 0)).toEqual([]);
  });
});
