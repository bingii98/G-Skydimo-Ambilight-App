import { describe, expect, it, beforeEach } from "vitest";
import {
  MAX_PANELS_PER_POWER_BRANCH,
  analyzeTrianglePowerGraph,
  inferLinksFromJoinTree,
  migrateTrianglePowerSettings,
  resetPowerLinkIdCounter,
  toggleTriangleActiveLink,
  wouldCreatePowerLoop,
  addTrianglePowerInjector,
} from "./externalTrianglePowerGraph";
import {
  buildDefaultTriangleChainPanels,
  buildTrianglePanelConnections,
  buildTrianglePanelPreview,
  TRIANGLE_LAYOUT_PRESETS,
} from "./externalTriangleLayout";
import { resetPanelIdCounter } from "./externalTrianglePose";

describe("externalTrianglePowerGraph", () => {
  beforeEach(() => {
    resetPowerLinkIdCounter();
    resetPanelIdCounter();
  });

  it("auto-enables join-tree links during migration", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const migrated = migrateTrianglePowerSettings(panels, {});
    expect(migrated.triangleActiveLinks.length).toBe(2);
    expect(migrated.trianglePowerRootId).toBe(panels[0].id);
  });

  it("marks child panels idle when a link is toggled off", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const links = inferLinksFromJoinTree(panels);
    const target = links[links.length - 1];
    const toggled = toggleTriangleActiveLink(panels, links, target, false);
    const analysis = analyzeTrianglePowerGraph(
      panels,
      toggled.links,
      panels[0].id,
      []
    );
    expect(analysis.idleCount).toBe(1);
    expect(analysis.panelState[target.panelB].powerStatus).toBe("idle");
  });

  it("infers splitter IN/OUT on a V layout", () => {
    const preset = TRIANGLE_LAYOUT_PRESETS.find((entry) => entry.label === "V · 3");
    expect(preset).toBeTruthy();
    const [root, left] = preset.panels;
    const links = inferLinksFromJoinTree(preset.panels);
    const analysis = analyzeTrianglePowerGraph(preset.panels, links, root.id, []);
    const rootState = analysis.panelState[root.id];
    expect(rootState.outputEdges.length).toBeGreaterThanOrEqual(2);
    expect(analysis.panelState[left.id].inputEdge).not.toBeNull();
  });

  it("rejects link toggles that would create a loop", () => {
    resetPanelIdCounter();
    const chain = buildDefaultTriangleChainPanels(3);
    const links = inferLinksFromJoinTree(chain);
    const extraCandidate = {
      panelA: chain[0].id,
      panelB: chain[2].id,
      edgeA: 0,
      edgeB: 0,
    };
    expect(wouldCreatePowerLoop(chain, links, extraCandidate)).toBe(true);
    const result = toggleTriangleActiveLink(chain, links, extraCandidate, true);
    expect(result.success).toBe(false);
    expect(result.reason).toBe("loop");
  });

  it("flags voltage warnings after 12 panels on a branch", () => {
    const panels = buildDefaultTriangleChainPanels(MAX_PANELS_PER_POWER_BRANCH + 1);
    const links = inferLinksFromJoinTree(panels);
    const analysis = analyzeTrianglePowerGraph(panels, links, panels[0].id, []);
    const lastPanel = panels[panels.length - 1];
    expect(analysis.panelState[lastPanel.id].powerStatus).toBe("voltage_warning");
    expect(analysis.voltageWarningCount).toBeGreaterThan(0);
  });

  it("resets branch depth at power injectors", () => {
    const panels = buildDefaultTriangleChainPanels(MAX_PANELS_PER_POWER_BRANCH + 1);
    const links = inferLinksFromJoinTree(panels);
    const midPanel = panels[6];
    const injectors = addTrianglePowerInjector(panels, [], midPanel.id, 2);
    const analysis = analyzeTrianglePowerGraph(panels, links, panels[0].id, injectors);
    const lastPanel = panels[panels.length - 1];
    expect(analysis.panelState[lastPanel.id].powerStatus).toBe("powered");
    expect(analysis.panelState[lastPanel.id].depth).toBeLessThanOrEqual(
      MAX_PANELS_PER_POWER_BRANCH
    );
  });

  it("exposes active link state in panel preview connections", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels);
    const connections = buildTrianglePanelConnections(preview);
    expect(connections.length).toBeGreaterThanOrEqual(1);
    expect(connections[0].isActive).toBe(true);
    expect(connections[0].wireStatus).toBeUndefined();
  });
});
