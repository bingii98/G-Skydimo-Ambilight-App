import {
  canAddTrianglePanel,
  collectPanelSubtreeIds,
  createJoinedPanel,
  detectJoinFromAnchors,
  moveTrianglePanelWithJoin,
  panelsLayoutHasOverlap,
  resolveSmartPanelJoin,
  serializeTrianglePanels,
} from "./externalTriangleLayout";
import { sanitizeTriangleWire, TRIANGLE_WIRE_DIRECTIONS } from "./externalTriangleWire";

const DEFAULT_SNAP_RADIUS = 7;
export const JOIN_ANCHOR_SNAP_RADIUS = 12;
export const GHOST_PANEL_SNAP_RADIUS = 13;
const GHOST_EDGE_SNAP_PENALTY = 9;
const GHOST_CORNER_SNAP_BIAS = 0.72;

function effectiveSnapDistance(target, x, y, source) {
  const distance = Math.hypot(target.x - x, target.y - y);
  if (source?.kind !== "ghost-panel" || target.kind !== "anchor") {
    return distance;
  }
  if (target.anchorKind === "corner") {
    return distance * GHOST_CORNER_SNAP_BIAS;
  }
  if (target.anchorKind === "edge") {
    return distance + GHOST_EDGE_SNAP_PENALTY;
  }
  return distance;
}

export function snapRadiusForDragSource(source) {
  if (source?.kind === "join-anchor" || source?.kind === "controller") {
    return JOIN_ANCHOR_SNAP_RADIUS;
  }
  if (source?.kind === "ghost-panel") {
    return GHOST_PANEL_SNAP_RADIUS;
  }
  return DEFAULT_SNAP_RADIUS;
}

function controllerDropTargets(targets) {
  return targets.filter(
    (target) => target.kind === "origin" || target.kind === "led" || target.kind === "anchor"
  );
}

function resolveControllerDrop(target, wire, panels, powerRootId = null) {
  const currentWire = sanitizeTriangleWire(wire);
  const root = panels.find((panel) => panel.id === powerRootId) || panels.find((panel) => !panel.parentId);

  if (target.kind === "origin") {
    return {
      type: "wire",
      wire: {
        ...currentWire,
        origin: { type: target.type, index: target.index },
      },
    };
  }

  if (target.kind === "led") {
    const panelId = target.panelId || target.triangle?.panelId || target.triangle?.id;
    const result = {
      type: "wire",
      wire: {
        ...currentWire,
        origin: { type: "corner", index: target.cornerIndex },
      },
    };
    if (panelId && panelId !== root?.id) {
      result.rootPanelId = panelId;
    }
    return result;
  }

  if (target.kind === "anchor") {
    const panelId = target.parentPanelId || target.panelId;
    const origin =
      target.anchorKind === "edge"
        ? { type: "edge", index: target.anchorIndex }
        : { type: "corner", index: target.anchorIndex };
    const result = {
      type: "wire",
      wire: {
        ...currentWire,
        origin,
      },
    };
    if (panelId && panelId !== root?.id) {
      result.rootPanelId = panelId;
    }
    return result;
  }

  return null;
}

export function buildTriangleDragTargets(preview, panels = []) {
  const targets = [];
  const sanitizedPanels = panels;

  for (const triangle of preview?.triangles || []) {
    if (triangle.slot) {
      continue;
    }

    if (triangle.isPowerRoot && triangle.anchors?.length) {
      for (const anchor of triangle.anchors) {
        targets.push({
          id: `origin-${triangle.panelId || triangle.id}-${anchor.type}-${anchor.index}`,
          kind: "origin",
          type: anchor.type,
          index: anchor.index,
          x: anchor.x,
          y: anchor.y,
          triangle,
          panelId: triangle.panelId || triangle.id,
        });
      }
    }

    for (const led of triangle.leds || []) {
      targets.push({
        id: `led-${triangle.panelId || triangle.id}-${led.cornerIndex}`,
        kind: "led",
        x: led.x,
        y: led.y,
        cornerIndex: led.cornerIndex,
        ledIndex: led.ledIndex,
        wireStep: led.wireStep,
        triangle,
        panelId: triangle.panelId || triangle.id,
      });
    }
  }

  for (const triangle of preview?.triangles || []) {
    if (triangle.slot) {
      continue;
    }
    const corners = (triangle.leds || []).sort((a, b) => a.cornerIndex - b.cornerIndex);
    if (corners.length < 3) {
      continue;
    }
    const panelId = triangle.panelId || triangle.id;

    for (const corner of corners) {
      targets.push({
        id: `anchor-${panelId}-corner-${corner.cornerIndex}-c`,
        kind: "anchor",
        anchorKind: "corner",
        anchorIndex: corner.cornerIndex,
        panelId,
        parentPanelId: panelId,
        x: corner.x,
        y: corner.y,
        triangle,
      });
    }

    const edgePairs = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const [a, b] = edgePairs[edgeIndex];
      const ca = corners[a];
      const cb = corners[b];
      targets.push({
        id: `anchor-${panelId}-edge-${edgeIndex}-mid`,
        kind: "anchor",
        anchorKind: "edge",
        anchorIndex: edgeIndex,
        t: 0.5,
        panelId,
        parentPanelId: panelId,
        x: (ca.x + cb.x) / 2,
        y: (ca.y + cb.y) / 2,
        triangle,
      });
    }
  }

  return targets;
}

export function buildGhostPanelAnchors(x, y) {
  const localCorners = [
    { kind: "corner", index: 0, x: x, y: y - 4 },
    { kind: "corner", index: 1, x: x - 4, y: y + 3 },
    { kind: "corner", index: 2, x: x + 4, y: y + 3 },
  ];
  const edges = [
    { kind: "edge", index: 0, t: 0.5, x: x - 2, y: y + 1.5 },
    { kind: "edge", index: 1, t: 0.5, x, y: y + 3 },
    { kind: "edge", index: 2, t: 0.5, x: x + 2, y: y + 1.5 },
  ];
  return [...localCorners, ...edges];
}

export function findNearestDragTarget(
  x,
  y,
  targets,
  maxDistance = DEFAULT_SNAP_RADIUS,
  depthById = null,
  source = null
) {
  let nearest = null;
  let nearestDistance = maxDistance;

  for (const target of targets) {
    const distance = effectiveSnapDistance(target, x, y, source);
    if (distance > nearestDistance) {
      continue;
    }
    if (
      !nearest ||
      distance < nearestDistance - 1e-6 ||
      compareDragTargetPriority(target, nearest, depthById, source) < 0
    ) {
      nearest = target;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function compareDragTargetPriority(target, other, depthById = null, source = null) {
  if (source?.kind === "ghost-panel" && target.kind === "anchor" && other.kind === "anchor") {
    if (target.anchorKind === "corner" && other.anchorKind !== "corner") {
      return -1;
    }
    if (other.anchorKind === "corner" && target.anchorKind !== "corner") {
      return 1;
    }
  }

  if (!depthById) {
    if (target.kind === "anchor" && other.kind === "anchor") {
      if (target.anchorKind === "edge" && other.anchorKind !== "edge") {
        return -1;
      }
      if (other.anchorKind === "edge" && target.anchorKind !== "edge") {
        return 1;
      }
    }
    return String(target.id).localeCompare(String(other.id));
  }

  const depthA = depthById[target.panelId] ?? 999;
  const depthB = depthById[other.panelId] ?? 999;
  if (depthA !== depthB) {
    return depthA - depthB;
  }
  if (source?.kind === "ghost-panel" && target.kind === "anchor" && other.kind === "anchor") {
    if (target.anchorKind === "corner" && other.anchorKind !== "corner") {
      return -1;
    }
    if (other.anchorKind === "corner" && target.anchorKind !== "corner") {
      return 1;
    }
  }
  if (target.kind === "anchor" && other.kind === "anchor") {
    if (target.anchorKind === "edge" && other.anchorKind !== "edge") {
      return -1;
    }
    if (other.anchorKind === "edge" && target.anchorKind !== "edge") {
      return 1;
    }
  }
  return String(target.id).localeCompare(String(other.id));
}

export function buildPanelDepthById(panels = []) {
  const root = panels.find((panel) => !panel.parentId);
  const depthById = {};
  if (!root) {
    return depthById;
  }
  const queue = [{ id: root.id, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.id in depthById) {
      continue;
    }
    depthById[current.id] = current.depth;
    for (const panel of panels) {
      if (panel.parentId === current.id) {
        queue.push({ id: panel.id, depth: current.depth + 1 });
      }
    }
  }
  return depthById;
}

export function getValidDropTargets(source, targets, panels) {
  if (!source) {
    return [];
  }

  if (source.kind === "controller") {
    return controllerDropTargets(targets);
  }

  if (source.kind === "ghost-panel") {
    return targets.filter((target) => isValidDrop(source, target, panels));
  }

  if (source.kind === "panel") {
    const blockedIds = collectPanelSubtreeIds(panels, source.panelId);
    const movingPanel = panels.find((panel) => panel.id === source.panelId);
    return targets.filter((target) => {
      if (target.kind !== "anchor") {
        return false;
      }
      const parentId = target.parentPanelId || target.panelId;
      if (blockedIds.has(parentId)) {
        return false;
      }
      if (
        movingPanel?.parentId === parentId &&
        movingPanel.join?.parent?.kind === target.anchorKind &&
        movingPanel.join?.parent?.index === target.anchorIndex
      ) {
        return false;
      }
      return true;
    });
  }

  if (source.kind === "join-anchor") {
    const movingPanel = panels.find((panel) => panel.id === source.panelId);
    if (!movingPanel?.parentId) {
      return [];
    }
    const blockedIds = collectPanelSubtreeIds(panels, source.panelId);
    return targets.filter((target) => {
      if (target.kind !== "anchor") {
        return false;
      }
      const parentId = target.parentPanelId || target.panelId;
      if (parentId === source.panelId) {
        return false;
      }
      if (blockedIds.has(parentId)) {
        return false;
      }
      if (
        movingPanel.parentId === parentId &&
        movingPanel.join?.parent?.kind === target.anchorKind &&
        movingPanel.join?.parent?.index === target.anchorIndex &&
        movingPanel.join?.child?.kind === source.anchorKind &&
        movingPanel.join?.child?.index === source.anchorIndex
      ) {
        return false;
      }
      return true;
    });
  }

  if (source.kind === "led") {
    return targets.filter((target) => {
      if (target.kind === "origin" && source.triangle?.isPowerRoot) {
        return target.triangle?.id === source.triangle?.id;
      }
      if (target.kind === "led" && source.triangle?.isPowerRoot) {
        return (
          target.triangle?.id === source.triangle?.id &&
          target.cornerIndex !== source.cornerIndex
        );
      }
      return false;
    });
  }

  return [];
}

export function isValidDrop(source, target, panels) {
  if (!source || !target) {
    return false;
  }

  if (source.kind === "controller") {
    return target.kind === "origin" || target.kind === "led" || target.kind === "anchor";
  }

  if (source.kind === "ghost-panel") {
    if (target.kind !== "anchor" || !canAddTrianglePanel(panels)) {
      return false;
    }
    // New panels attach at corner handles only — avoids snapping to a nearby
    // edge midpoint when the user targets a free corner (common with edge-edge chains).
    if (target.anchorKind !== "corner") {
      return false;
    }
    return true;
  }

  if (source.kind === "panel") {
    if (target.kind !== "anchor") {
      return false;
    }
    const blockedIds = collectPanelSubtreeIds(panels, source.panelId);
    const parentId = target.parentPanelId || target.panelId;
    if (blockedIds.has(parentId)) {
      return false;
    }
    const movingPanel = panels.find((panel) => panel.id === source.panelId);
    if (
      movingPanel?.parentId === parentId &&
      movingPanel.join?.parent?.kind === target.anchorKind &&
      movingPanel.join?.parent?.index === target.anchorIndex
    ) {
      return false;
    }
    return Boolean(movingPanel?.parentId);
  }

  if (source.kind === "join-anchor") {
    if (target.kind !== "anchor") {
      return false;
    }
    const movingPanel = panels.find((panel) => panel.id === source.panelId);
    if (!movingPanel?.parentId) {
      return false;
    }
    const blockedIds = collectPanelSubtreeIds(panels, source.panelId);
    const parentId = target.parentPanelId || target.panelId;
    if (parentId === source.panelId || blockedIds.has(parentId)) {
      return false;
    }
    if (
      movingPanel.parentId === parentId &&
      movingPanel.join?.parent?.kind === target.anchorKind &&
      movingPanel.join?.parent?.index === target.anchorIndex &&
      movingPanel.join?.child?.kind === source.anchorKind &&
      movingPanel.join?.child?.index === source.anchorIndex
    ) {
      return false;
    }
    return true;
  }

  if (source.kind === "led") {
    if (target.kind === "origin" && source.triangle?.isPowerRoot) {
      return target.triangle?.id === source.triangle?.id;
    }
    if (target.kind === "led" && source.triangle?.isPowerRoot) {
      return (
        target.triangle?.id === source.triangle?.id &&
        target.cornerIndex !== source.cornerIndex
      );
    }
  }

  return false;
}

export function resolveDragDrop(source, target, wire, panels = [], powerRootId = null) {
  const currentWire = sanitizeTriangleWire(wire);

  if (source.kind === "controller") {
    return resolveControllerDrop(target, wire, panels, powerRootId);
  }

  if (source.kind === "ghost-panel" && target.kind === "anchor") {
    const parentId = target.parentPanelId || target.panelId;
    const parentAnchor = {
      kind: target.anchorKind || target.slotAnchor?.kind,
      index: target.anchorIndex ?? target.slotAnchor?.index ?? 0,
      t: target.t ?? target.slotAnchor?.t,
    };
    const join =
      resolveSmartPanelJoin({
        parentPanelId: parentId,
        parentAnchor,
        panels,
        desiredDirection: source.desiredDirection || "auto",
      }) ||
      detectJoinFromAnchors(parentAnchor, source.ghostAnchor || { kind: "corner", index: 0 });
    const panel = createJoinedPanel(parentId, join);
    if (panelsLayoutHasOverlap([...panels, panel])) {
      return null;
    }
    return {
      type: "add-panel",
      parentId,
      join,
      panel,
    };
  }

  if (source.kind === "panel" && target.kind === "anchor") {
    const parentId = target.parentPanelId || target.panelId;
    const parentAnchor = {
      kind: target.anchorKind || target.slotAnchor?.kind,
      index: target.anchorIndex ?? target.slotAnchor?.index ?? 0,
      t: target.t ?? target.slotAnchor?.t,
    };
    const childAnchor = source.childAnchor || {
      kind: "corner",
      index: 1,
    };
    const join =
      resolveSmartPanelJoin({
        parentPanelId: parentId,
        parentAnchor,
        panels,
        desiredDirection: "auto",
        preferredChildAnchor: childAnchor,
      }) || detectJoinFromAnchors(parentAnchor, childAnchor);
    if (
      serializeTrianglePanels(
        moveTrianglePanelWithJoin(panels, source.panelId, parentId, join)
      ) === serializeTrianglePanels(panels)
    ) {
      return null;
    }
    return {
      type: "move-panel",
      panelId: source.panelId,
      parentId,
      join,
    };
  }

  if (source.kind === "join-anchor" && target.kind === "anchor") {
    const parentId = target.parentPanelId || target.panelId;
    const parentAnchor = {
      kind: target.anchorKind || target.slotAnchor?.kind,
      index: target.anchorIndex ?? target.slotAnchor?.index ?? 0,
      t: target.t ?? target.slotAnchor?.t,
    };
    const childAnchor = {
      kind: source.anchorKind,
      index: source.anchorIndex ?? 0,
      t: source.t,
    };
    const join = detectJoinFromAnchors(parentAnchor, childAnchor);
    if (
      serializeTrianglePanels(
        moveTrianglePanelWithJoin(panels, source.panelId, parentId, join)
      ) === serializeTrianglePanels(panels)
    ) {
      return null;
    }
    return {
      type: "move-panel",
      panelId: source.panelId,
      parentId,
      join,
    };
  }

  if (source.kind === "led" && target.kind === "origin" && source.triangle?.isPowerRoot) {
    return {
      type: "wire",
      wire: {
        ...currentWire,
        origin: { type: target.type, index: target.index },
      },
    };
  }

  if (source.kind === "led" && target.kind === "led" && source.triangle?.isPowerRoot) {
    const nextWire = { ...currentWire, origin: { type: "corner", index: target.cornerIndex } };
    if (source.cornerIndex === 0 && target.cornerIndex === 2) {
      nextWire.direction =
        currentWire.direction === TRIANGLE_WIRE_DIRECTIONS.CCW
          ? TRIANGLE_WIRE_DIRECTIONS.CW
          : TRIANGLE_WIRE_DIRECTIONS.CCW;
    }
    return { type: "wire", wire: nextWire };
  }

  return null;
}

export function clientPointToSvg(svgElement, clientX, clientY) {
  if (!svgElement) {
    return { x: 0, y: 0 };
  }

  const point = svgElement.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svgElement.getScreenCTM()?.inverse();
  if (!matrix) {
    return { x: 0, y: 0 };
  }
  const transformed = point.matrixTransform(matrix);
  return { x: transformed.x, y: transformed.y };
}
