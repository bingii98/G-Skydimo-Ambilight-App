import { describe, expect, it } from "vitest";
import { buildDefaultTriangleChainPanels, buildTrianglePanelPreview, moveTrianglePanelWithJoin, serializeTrianglePanels, addTrianglePanelWithJoin } from "./externalTriangleLayout";
import { resolveSmartPanelJoin } from "./externalTrianglePose";
import {
  buildTriangleDragTargets,
  buildPanelDepthById,
  findNearestDragTarget,
  getValidDropTargets,
  isValidDrop,
  resolveDragDrop,
  GHOST_PANEL_SNAP_RADIUS,
} from "./externalTriangleDrag";

describe("externalTriangleDrag", () => {
  it("builds anchor and led drag targets from preview", () => {
    const panels = buildDefaultTriangleChainPanels(1);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);

    expect(targets.some((target) => target.kind === "anchor")).toBe(true);
    expect(targets.some((target) => target.kind === "led")).toBe(true);
    expect(targets.some((target) => target.kind === "origin")).toBe(true);
  });

  it("resolves add-panel drop from ghost panel to anchor", () => {
    const panels = buildDefaultTriangleChainPanels(1);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const anchor = targets.find((target) => target.kind === "anchor");

    expect(
      isValidDrop({ kind: "ghost-panel", desiredDirection: "up" }, anchor, panels)
    ).toBe(true);
    expect(
      resolveDragDrop(
        { kind: "ghost-panel", desiredDirection: "up" },
        anchor,
        {},
        panels
      )?.type
    ).toBe("add-panel");
  });

  it("resolves wire entry drop from controller to origin anchor", () => {
    const panels = buildDefaultTriangleChainPanels(1);
    const preview = buildTrianglePanelPreview(panels);
    const targets = buildTriangleDragTargets(preview, panels);
    const origin = targets.find((target) => target.kind === "origin" && target.type === "edge");

    const result = resolveDragDrop(
      { kind: "controller", x: 0, y: 0 },
      origin,
      { origin: { type: "corner", index: 0 }, direction: "cw" },
      panels
    );

    expect(result).toEqual({
      type: "wire",
      wire: {
        origin: { type: "edge", index: origin.index },
        direction: "cw",
      },
    });
  });

  it("resolves power inlet drop onto another panel led corner", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const preview = buildTrianglePanelPreview(panels);
    const targets = buildTriangleDragTargets(preview, panels);
    const ledTarget = targets.find(
      (target) =>
        target.kind === "led" &&
        (target.panelId || target.triangle?.panelId) === panels[1].id &&
        target.cornerIndex === 0
    );
    expect(ledTarget).toBeTruthy();

    const result = resolveDragDrop(
      { kind: "controller" },
      ledTarget,
      { origin: { type: "corner", index: 0 }, direction: "cw" },
      panels
    );

    expect(result?.type).toBe("wire");
    expect(result.rootPanelId).toBe(panels[1].id);
    expect(result.wire.origin).toEqual({ type: "corner", index: 0 });
  });

  it("finds nearest target within snap radius", () => {
    const target = findNearestDragTarget(
      10,
      10,
      [
        { id: "a", x: 12, y: 11 },
        { id: "b", x: 30, y: 30 },
      ],
      5
    );

    expect(target?.id).toBe("a");
  });

  it("resolves move-panel drop from existing panel to anchor", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const movingPanel = panels[2];
    const anchor = targets.find(
      (target) =>
        target.kind === "anchor" &&
        (target.parentPanelId || target.panelId) === panels[0].id
    );

    expect(
      isValidDrop(
        {
          kind: "panel",
          panelId: movingPanel.id,
          childAnchor: movingPanel.join?.child,
        },
        anchor,
        panels
      )
    ).toBe(true);

    const result = resolveDragDrop(
      {
        kind: "panel",
        panelId: movingPanel.id,
        childAnchor: movingPanel.join?.child,
      },
      anchor,
      {},
      panels
    );

    expect(result?.type).toBe("move-panel");
    expect(result.panelId).toBe(movingPanel.id);
    expect(result.parentId).toBe(panels[0].id);
  });

  it("resolves join-anchor reconnect between panel anchors", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const movingPanel = panels[2];
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const targetAnchor = targets.find(
      (target) =>
        target.kind === "anchor" &&
        (target.parentPanelId || target.panelId) === panels[0].id &&
        target.anchorKind === "edge" &&
        target.anchorIndex === 1
    );

    expect(
      isValidDrop(
        {
          kind: "join-anchor",
          panelId: movingPanel.id,
          anchorKind: "corner",
          anchorIndex: 0,
        },
        targetAnchor,
        panels
      )
    ).toBe(true);

    const result = resolveDragDrop(
      {
        kind: "join-anchor",
        panelId: movingPanel.id,
        anchorKind: "corner",
        anchorIndex: 0,
      },
      targetAnchor,
      {},
      panels
    );

    expect(result?.type).toBe("move-panel");
    expect(result.panelId).toBe(movingPanel.id);
    expect(result.parentId).toBe(panels[0].id);
    expect(result.join?.parent?.kind).toBe("edge");
    expect(result.join?.child?.kind).toBe("corner");
  });

  it("reconnects using exact E2 to E2 edge join", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const before = serializeTrianglePanels(panels);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const targetAnchor = targets.find(
      (target) =>
        target.kind === "anchor" &&
        target.panelId === panels[0].id &&
        target.anchorKind === "edge" &&
        target.anchorIndex === 1
    );

    const result = resolveDragDrop(
      {
        kind: "join-anchor",
        panelId: panels[1].id,
        anchorKind: "edge",
        anchorIndex: 1,
      },
      targetAnchor,
      {},
      panels
    );

    expect(result?.join?.type).toBe("edge-edge");
    expect(result.join.parent.index).toBe(1);
    expect(result.join.child.index).toBe(1);

    const moved = moveTrianglePanelWithJoin(
      panels,
      result.panelId,
      result.parentId,
      result.join
    );
    expect(serializeTrianglePanels(moved)).not.toBe(before);
  });

  it("rejects join-anchor move that would stack panels", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const targetAnchor = targets.find(
      (target) =>
        target.kind === "anchor" &&
        target.panelId === panels[0].id &&
        target.anchorKind === "corner" &&
        target.anchorIndex === 0
    );
    const result = resolveDragDrop(
      {
        kind: "join-anchor",
        panelId: panels[1].id,
        anchorKind: "corner",
        anchorIndex: 0,
      },
      targetAnchor,
      {},
      panels
    );
    expect(result).toBeNull();
  });

  it("ghost panel drops only accept corner anchors", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const valid = getValidDropTargets({ kind: "ghost-panel", desiredDirection: "auto" }, targets, panels);
    expect(valid.every((target) => target.anchorKind === "corner")).toBe(true);
    expect(valid.some((target) => target.anchorKind === "edge")).toBe(false);
  });

  it("snaps ghost panel to corner when pointer is near edge midpoint on edge-edge chain", () => {
    const panels = buildDefaultTriangleChainPanels(2);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const depthById = buildPanelDepthById(panels);
    const tipId = panels[1].id;
    const corner = targets.find(
      (target) =>
        target.kind === "anchor" &&
        target.parentPanelId === tipId &&
        target.anchorKind === "corner" &&
        target.anchorIndex === 1
    );
    const edge = targets.find(
      (target) =>
        target.kind === "anchor" &&
        target.parentPanelId === tipId &&
        target.anchorKind === "edge" &&
        target.anchorIndex === 1
    );
    expect(corner).toBeTruthy();
    expect(edge).toBeTruthy();

    const valid = getValidDropTargets({ kind: "ghost-panel", desiredDirection: "auto" }, targets, panels);
    const dropX = edge.x * 0.3 + corner.x * 0.7;
    const dropY = edge.y * 0.3 + corner.y * 0.7;
    const nearest = findNearestDragTarget(
      dropX,
      dropY,
      valid,
      GHOST_PANEL_SNAP_RADIUS,
      depthById,
      { kind: "ghost-panel" }
    );
    expect(nearest?.anchorKind).toBe("corner");
    expect(nearest?.parentPanelId).toBe(tipId);

    const result = resolveDragDrop(
      { kind: "ghost-panel", desiredDirection: "auto" },
      nearest,
      {},
      panels
    );
    expect(result?.type).toBe("add-panel");
  });

  it("adds a panel on a free corner of the chain tip", () => {
    const panels = buildDefaultTriangleChainPanels(3);
    const preview = buildTrianglePanelPreview(panels, { includeSlots: true });
    const targets = buildTriangleDragTargets(preview, panels);
    const tip = panels[2];
    const corner = targets.find(
      (target) =>
        target.kind === "anchor" &&
        target.parentPanelId === tip.id &&
        target.anchorKind === "corner" &&
        target.anchorIndex === 1
    );
    expect(corner).toBeTruthy();
    const result = resolveDragDrop(
      { kind: "ghost-panel", desiredDirection: "auto" },
      corner,
      {},
      panels
    );
    expect(result?.type).toBe("add-panel");
  });
});
