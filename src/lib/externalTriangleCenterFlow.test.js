import { describe, expect, it } from "vitest";
import {
  buildCenterPowerFlowPaths,
  buildCenterPowerVectors,
  buildIdleCenterVector,
  buildPowerVectorSegments,
  collectCenterPowerNodeKeys,
  getPanelCenterHub,
  indexPowerFlowBranches,
  powerDepthOpacity,
  powerFlowArrowCount,
  preparePowerFlowArrowSegments,
  summarizeCenterFlow,
} from "./externalTriangleCenterFlow";
import {
  buildDefaultTriangleChainPanels,
  buildTrianglePanelPreview,
  TRIANGLE_LAYOUT_PRESETS,
} from "./externalTriangleLayout";
import { toggleTriangleActiveLink, migrateTrianglePowerSettings } from "./externalTrianglePowerGraph";

describe("externalTriangleCenterFlow", () => {
  it("builds center-to-center power vectors for a V layout splitter", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();

    const preview = buildTrianglePanelPreview(preset.panels);
    const vectors = buildCenterPowerVectors(preview);
    const activeVectors = vectors.filter((vector) => vector.isActive);

    expect(activeVectors.length).toBeGreaterThanOrEqual(2);
    for (const vector of activeVectors) {
      expect(vector.fromCenter.x).toBeTypeOf("number");
      expect(vector.toCenter.x).toBeTypeOf("number");
      expect(vector.connectionId).toBe(`${vector.fromCenter.nodeId}_TO_${vector.toCenter.nodeId}`);
      expect(vector.arrowDisplay).toBe(true);
    }

    const [root] = preset.panels;
    const rootHub = getPanelCenterHub(preview, root.id);
    expect(rootHub.isRoot).toBe(true);
    expect(rootHub.outputVectors.length).toBeGreaterThanOrEqual(2);
    expect(rootHub.inputVector).toBeNull();
  });

  it("builds chain vectors with one IN and one OUT per middle panel", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const preview = buildTrianglePanelPreview(panels);
    const middlePanel = panels[1];
    const hub = getPanelCenterHub(preview, middlePanel.id);

    expect(hub.inputVector).toBeTruthy();
    expect(hub.outputVectors).toHaveLength(1);
    expect(hub.inputVector.toPanelId).toBe(middlePanel.id);
    expect(hub.outputVectors[0].toPanelId).toBe(panels[2].id);
  });

  it("includes idle center vectors for inactive candidate links", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const power = migrateTrianglePowerSettings(panels, {});
    const links = power.triangleActiveLinks;
    const target = links[links.length - 1];
    const toggled = toggleTriangleActiveLink(panels, links, target, false);
    const preview = buildTrianglePanelPreview(panels, {
      powerRootId: power.trianglePowerRootId,
      activeLinks: toggled.links,
    });

    const idleVectors = buildCenterPowerVectors(preview).filter((vector) => !vector.isActive);
    expect(idleVectors.length).toBeGreaterThan(0);
    expect(idleVectors[0].powerStatus).toBe("IDLE");
    expect(idleVectors[0].arrowDisplay).toBe(false);
  });

  it("maps power flow paths to centroid endpoints", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    const preview = buildTrianglePanelPreview(preset.panels);
    const paths = buildCenterPowerFlowPaths(preview);
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

    const segments = buildPowerVectorSegments(buildCenterPowerVectors(preview));
    expect(segments.length).toBeGreaterThanOrEqual(paths.length);
  });

  it("collects center node keys and depth opacity metadata", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels);
    const paths = buildCenterPowerFlowPaths(preview);
    const keys = collectCenterPowerNodeKeys(paths, [panels[0].id, panels[1].id]);

    expect(keys.has(panels[0].id)).toBe(true);
    expect(keys.has(panels[1].id)).toBe(true);

    const summary = summarizeCenterFlow(preview);
    expect(summary.activeVectorCount).toBeGreaterThan(0);
    expect(summary.maxDepth).toBeGreaterThan(0);
    expect(powerDepthOpacity(1)).toBeGreaterThan(powerDepthOpacity(8));
  });

  it("builds idle center vectors between adjacent panels", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels);
    const [triangleA, triangleB] = preview.triangles.filter((triangle) => !triangle.slot);
    const vector = buildIdleCenterVector(triangleA, triangleB);

    expect(vector).toHaveLength(2);
    expect(vector[0].x).toBeCloseTo(triangleA.cx, 1);
    expect(vector[1].x).toBeCloseTo(triangleB.cx, 1);
  });

  it("assigns branch indices for split power flow segments", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    const preview = buildTrianglePanelPreview(preset.panels);
    const paths = buildCenterPowerFlowPaths(preview);
    const indexed = indexPowerFlowBranches(paths);
    const rootId = preview.powerAnalysis.rootId;
    const branches = indexed.filter((path) => path.fromPanelId === rootId);

    expect(branches.length).toBeGreaterThanOrEqual(2);
    expect(new Set(branches.map((path) => path.branchIndex)).size).toBe(branches.length);
    expect(branches.every((path) => path.durationSec > 0)).toBe(true);
  });

  it("prepares animated arrow segments including branches", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    const preview = buildTrianglePanelPreview(preset.panels);
    const paths = buildCenterPowerFlowPaths(preview);
    const segments = preparePowerFlowArrowSegments(paths, preview);

    expect(segments.length).toBeGreaterThanOrEqual(paths.length);
    expect(segments.some((segment) => segment.branchIndex > 0)).toBe(true);
    expect(powerFlowArrowCount(segments[0].segmentLength)).toBeGreaterThanOrEqual(1);
  });
});
