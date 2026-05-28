import {
  buildJoinAnchorsForPanel,
  computeTrianglePanelPoses,
  createJoinedPanel,
  createPanelId,
  createRootPanel,
  detectJoinFromAnchors,
  getAnchorLocalPoint,
  getEdgeEndpoints,
  getLocalTriangleCorners,
  getPanelWorldGeometry,
  isLegacyGridPanel,
  panelsLayoutHasOverlap,
  LOCAL_TOPOLOGY,
  countSharedWorldCorners,
  panelsShareWorldEdge,
  panelsShareWorldPoint,
  resetPanelIdCounter,
  sanitizeTriangleJoin,
  sanitizeTrianglePanelNode,
  snapRotationDeg,
  ROTATION_SNAP_DEG,
  TRIANGLE_JOIN_TYPES,
  TRIANGLE_LAYOUT_VERSION,
} from "./externalTrianglePose";
import {
  analyzeTrianglePowerGraph,
  inferLinksFromJoinTree,
  listCandidatePowerLinks,
  mergeActiveLinksWithJoinTree,
  migrateTrianglePowerSettings,
  resolveTrianglePowerRootId,
  sanitizeTriangleActiveLinks,
  sanitizeTrianglePowerInjectors,
  summarizeTrianglePowerGraph,
} from "./externalTrianglePowerGraph";
import {
  buildCenterPowerFlowPaths,
  buildCenterPowerVectors,
  buildIdleCenterVector,
  collectCenterPowerNodeKeys,
} from "./externalTriangleCenterFlow";
import {
  buildChamferedTriangleGeometry,
  formatPolygonPoints,
} from "./externalTriangleCornerChamfer";
import {
  buildWirePointSegments,
  computeTriangleWireRoute,
  DEFAULT_TRIANGLE_WIRE,
  describeWireDirection,
  describeWireOrigin,
  getSharedEdgeBetween,
  LEDS_PER_TRIANGLE_PANEL,
  sanitizeTriangleWire,
} from "./externalTriangleWire";

export {
  MAX_PANELS_PER_POWER_BRANCH,
  analyzeTrianglePowerGraph,
  inferLinksFromJoinTree,
  listCandidatePowerLinks,
  mergeActiveLinksWithJoinTree,
  migrateTrianglePowerSettings,
  resolveTrianglePowerRootId,
  sanitizeTriangleActiveLinks,
  sanitizeTrianglePowerInjectors,
  summarizeTrianglePowerGraph,
  toggleTriangleActiveLink,
  addTrianglePowerInjector,
  removeTrianglePowerInjector,
} from "./externalTrianglePowerGraph";

export const MAX_TRIANGLE_PANELS = 64;
const LEDS_PER_TRIANGLE = LEDS_PER_TRIANGLE_PANEL;

/** Preview units per 1 world unit — keeps triangle + LED size stable as panels are added. */
export const TRIANGLE_PREVIEW_SCALE = 75;
export const TRIANGLE_PREVIEW_PAD = 14;
export const TRIANGLE_PREVIEW_WIRE_MAX_JUMP = TRIANGLE_PREVIEW_SCALE * 0.45;
/** Max LED hop within one triangle (edge length ≈ 1 world unit × scale). */
export const TRIANGLE_PREVIEW_INTRA_PANEL_MAX_JUMP = TRIANGLE_PREVIEW_SCALE * 1.05;

export {
  DEFAULT_TRIANGLE_WIRE,
  sanitizeTriangleWire,
  computeTriangleWireRoute,
  buildTriangleWirePatch,
} from "./externalTriangleWire";

export {
  TRIANGLE_JOIN_TYPES,
  TRIANGLE_LAYOUT_VERSION,
  createRootPanel,
  createJoinedPanel,
  createPanelId,
  computeTrianglePanelPoses,
  detectJoinFromAnchors,
  getPanelWorldGeometry,
  panelsLayoutHasOverlap,
  resolveSmartPanelJoin,
  sanitizeTriangleJoin,
  buildJoinAnchorsForPanel,
} from "./externalTrianglePose";

/** @typedef {import('./externalTrianglePose.js').TrianglePanelNode} TrianglePanelNode */

export function trianglePanelKey(col, row) {
  return `${Math.round(Number(col) || 0)},${Math.round(Number(row) || 0)}`;
}

export function isTrianglePanelUp(col, row) {
  return (Math.round(Number(col) || 0) + Math.round(Number(row) || 0)) % 2 === 0;
}

export function normalizeTrianglePanel(panel) {
  if (panel?.id) {
    return sanitizeTrianglePanelNode(panel);
  }
  return {
    col: Math.round(Number(panel?.col) || 0),
    row: Math.round(Number(panel?.row) || 0),
  };
}

export function migrateGridPanelsToJoinTree(gridPanels) {
  resetPanelIdCounter();
  const panels = gridPanels.map((p) => ({
    col: Math.round(Number(p.col) || 0),
    row: Math.round(Number(p.row) || 0),
  }));

  if (!panels.length) {
    return [createRootPanel()];
  }

  const keyToId = {};
  const result = [];
  const visited = new Set();
  const start = panels[0];
  const rootId = createPanelId();
  keyToId[trianglePanelKey(start.col, start.row)] = rootId;
  result.push({ id: rootId, pose: gridCellToRootPose(start.col, start.row) });
  visited.add(trianglePanelKey(start.col, start.row));

  const queue = [start];
  while (queue.length) {
    const current = queue.shift();
    const currentId = keyToId[trianglePanelKey(current.col, current.row)];

    for (const neighbor of getTriangleGridNeighbors(current.col, current.row)) {
      const key = trianglePanelKey(neighbor.col, neighbor.row);
      if (visited.has(key)) {
        continue;
      }
      const gridPanel = panels.find(
        (entry) => trianglePanelKey(entry.col, entry.row) === key
      );
      if (!gridPanel) {
        continue;
      }

      const shared = getSharedEdgeBetween(current, gridPanel);
      if (!shared) {
        continue;
      }

      const childId = createPanelId();
      keyToId[key] = childId;
      result.push({
        id: childId,
        parentId: currentId,
        join: sanitizeTriangleJoin({
          type: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
          parent: { kind: "edge", index: shared.edgeA },
          child: { kind: "edge", index: shared.edgeB },
          rotationDeg: 0,
          flip: false,
        }),
      });
      visited.add(key);
      queue.push(gridPanel);
    }
  }

  for (const panel of panels) {
    const key = trianglePanelKey(panel.col, panel.row);
    if (visited.has(key)) {
      continue;
    }
    const orphanId = createPanelId();
    result.push({
      id: orphanId,
      pose: gridCellToRootPose(panel.col, panel.row),
    });
    visited.add(key);
  }

  return result;
}

function gridCellToRootPose(col, row) {
  const up = isTrianglePanelUp(col, row);
  const stagger = row % 2 === 0 ? 0 : 0.5;
  return {
    x: col * 0.5 + stagger,
    y: row * 0.8660254,
    rotationDeg: 0,
    flip: !up,
  };
}

export function buildDefaultTriangleChainPanels(count = 4) {
  resetPanelIdCounter();
  const n = Math.max(1, Math.min(MAX_TRIANGLE_PANELS, Math.round(Number(count) || 1)));
  const panels = [createRootPanel()];

  for (let i = 1; i < n; i += 1) {
    const parent = panels[panels.length - 1];
    panels.push(
      createJoinedPanel(parent.id, {
        type: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
        parent: { kind: "edge", index: 2 },
        child: { kind: "edge", index: 0 },
        rotationDeg: 0,
        flip: false,
      })
    );
  }

  return panels;
}

export function sanitizeTrianglePanels(rawPanels, triangleCount = 4) {
  const fallbackCount = Math.max(1, Math.min(MAX_TRIANGLE_PANELS, Math.round(Number(triangleCount) || 1)));

  if (!Array.isArray(rawPanels) || rawPanels.length === 0) {
    return buildDefaultTriangleChainPanels(fallbackCount);
  }

  if (rawPanels.some(isLegacyGridPanel)) {
    const migrated = migrateGridPanelsToJoinTree(rawPanels);
    return sanitizeTrianglePanels(migrated, migrated.length);
  }

  const seen = new Set();
  const panels = [];

  for (const raw of rawPanels) {
    const panel = sanitizeTrianglePanelNode(raw, createPanelId());
    if (seen.has(panel.id)) {
      continue;
    }
    seen.add(panel.id);
    panels.push(panel);
    if (panels.length >= MAX_TRIANGLE_PANELS) {
      break;
    }
  }

  if (!panels.length) {
    return buildDefaultTriangleChainPanels(fallbackCount);
  }

  const hasRoot = panels.some((p) => !p.parentId);
  if (!hasRoot) {
    const [first, ...rest] = panels;
    return [{ ...first, parentId: undefined, join: undefined, pose: first.pose || { x: 0, y: 0, rotationDeg: 0, flip: false } }, ...rest];
  }

  return panels;
}

export function getTriangleGridNeighbors(col, row) {
  const c = Math.round(Number(col) || 0);
  const r = Math.round(Number(row) || 0);
  if (isTrianglePanelUp(c, r)) {
    return [
      { col: c - 1, row: r },
      { col: c + 1, row: r },
      { col: c, row: r - 1 },
    ];
  }
  return [
    { col: c - 1, row: r },
    { col: c + 1, row: r },
    { col: c, row: r + 1 },
  ];
}

export function listOccupiedTrianglePanelKeys(panels) {
  return new Set((panels || []).map((panel) => panel.id || trianglePanelKey(panel.col, panel.row)));
}

export function listTriangleAddSlots(panels) {
  const sanitized = sanitizeTrianglePanels(panels);
  if (sanitized.length >= MAX_TRIANGLE_PANELS) {
    return [];
  }
  const poses = computeTrianglePanelPoses(sanitized);
  const slots = [];
  for (const panel of sanitized) {
    const geom = getPanelWorldGeometry(panel, poses[panel.id]);
    const anchors = buildJoinAnchorsForPanel(geom);
    for (const anchor of anchors) {
      slots.push({
        panelId: panel.id,
        anchor,
        col: null,
        row: null,
      });
    }
  }
  return slots;
}

export function isParentEdgeOccupiedForJoin(panels, parentId, edgeIndex) {
  const edge = Math.max(0, Math.min(2, Math.round(Number(edgeIndex) || 0)));
  return sanitizeTrianglePanels(panels).some(
    (panel) =>
      panel.parentId === parentId &&
      panel.join?.type === TRIANGLE_JOIN_TYPES.EDGE_EDGE &&
      panel.join?.parent?.kind === "edge" &&
      panel.join.parent.index === edge
  );
}

export function canAddTrianglePanel(panels, col, row) {
  if (col == null && row == null) {
    return sanitizeTrianglePanels(panels).length < MAX_TRIANGLE_PANELS;
  }
  const current = sanitizeTrianglePanels(panels, panels?.length || 1);
  if (current.length >= MAX_TRIANGLE_PANELS) {
    return false;
  }
  const legacy = migrateGridPanelsToJoinTree([...current.map((p, i) => ({ col: p.col ?? i, row: p.row ?? 0 })), { col, row }]);
  return legacy.length === current.length + 1;
}

export function addTrianglePanelWithJoin(panels, parentId, join) {
  const current = sanitizeTrianglePanels(panels, panels?.length || 1);
  if (current.length >= MAX_TRIANGLE_PANELS) {
    return current;
  }
  const panel = createJoinedPanel(parentId, join);
  const parentIndex = current.findIndex((entry) => entry.id === parentId);
  if (parentIndex < 0) {
    return [...current, panel];
  }
  const next = [...current];
  next.splice(parentIndex + 1, 0, panel);
  return next;
}

export function addTrianglePanel(panels, col, row) {
  const legacyPanels = [
    ...(panels || []).map((p) => ({ col: p.col ?? 0, row: p.row ?? 0 })),
    { col, row },
  ];
  return migrateGridPanelsToJoinTree(legacyPanels);
}

export function removeTrianglePanel(panels, col, row) {
  const current = sanitizeTrianglePanels(panels, panels?.length || 1);
  if (current.length <= 1) {
    return current;
  }

  const key = trianglePanelKey(col, row);
  const byGrid = current.find(
    (panel) => panel.col != null && trianglePanelKey(panel.col, panel.row) === key
  );
  if (byGrid) {
    return removeTrianglePanelById(current, byGrid.id);
  }

  const index = Math.round(Number(col) || 0);
  const byIndex = current[index];
  if (byIndex) {
    return removeTrianglePanelById(current, byIndex.id);
  }

  return current;
}

export function collectPanelSubtreeIds(panels, panelId) {
  const ids = new Set([panelId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const panel of panels) {
      if (panel.parentId && ids.has(panel.parentId) && !ids.has(panel.id)) {
        ids.add(panel.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function moveTrianglePanelWithJoin(panels, panelId, parentId, join) {
  const current = sanitizeTrianglePanels(panels);
  const panel = current.find((entry) => entry.id === panelId);
  if (!panel?.parentId || panelId === parentId) {
    return current;
  }
  if (collectPanelSubtreeIds(current, panelId).has(parentId)) {
    return current;
  }
  if (!current.some((entry) => entry.id === parentId)) {
    return current;
  }
  const sanitizedJoin = sanitizeTriangleJoin(join);
  const next = current.map((entry) =>
    entry.id === panelId
      ? {
          ...entry,
          parentId,
          join: sanitizedJoin,
        }
      : entry
  );
  if (panelsLayoutHasOverlap(next)) {
    return current;
  }
  return next;
}

export function removeTrianglePanelById(panels, panelId) {
  const current = sanitizeTrianglePanels(panels, panels?.length || 1);
  if (current.length <= 1) {
    return current;
  }

  const toRemove = new Set([panelId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const panel of current) {
      if (panel.parentId && toRemove.has(panel.parentId) && !toRemove.has(panel.id)) {
        toRemove.add(panel.id);
        changed = true;
      }
    }
  }

  const next = current.filter((panel) => !toRemove.has(panel.id));
  if (!next.length) {
    return current;
  }

  if (!next.some((p) => !p.parentId)) {
    const [first, ...rest] = next;
    return [{ ...first, parentId: undefined, join: undefined, pose: first.pose || { x: 0, y: 0, rotationDeg: 0, flip: false } }, ...rest];
  }

  return next;
}

export function rotatePanelJoin(panels, panelId, deltaDeg = ROTATION_SNAP_DEG) {
  const current = sanitizeTrianglePanels(panels);
  const target = current.find((panel) => panel.id === panelId);
  const isRootRotation = Boolean(target && !target.parentId);
  const next = current.map((panel) => {
    if (panel.id !== panelId) {
      return panel;
    }
    if (!panel.parentId) {
      return {
        ...panel,
        pose: {
          ...(panel.pose || { x: 0, y: 0, flip: false }),
          rotationDeg: snapRotationDeg((panel.pose?.rotationDeg || 0) + deltaDeg),
        },
      };
    }
    if (!panel.join) {
      return panel;
    }
    return {
      ...panel,
      join: {
        ...panel.join,
        rotationDeg: snapRotationDeg((panel.join.rotationDeg || 0) + deltaDeg),
      },
    };
  });
  if (!isRootRotation && panelsLayoutHasOverlap(next)) {
    return current;
  }
  return next;
}

export function setControllerRootPanel(panels, newRootId) {
  const current = sanitizeTrianglePanels(panels);
  const root = current.find((panel) => !panel.parentId);
  if (!root || root.id === newRootId) {
    return current;
  }
  if (!current.some((panel) => panel.id === newRootId)) {
    return current;
  }

  const byId = Object.fromEntries(current.map((panel) => [panel.id, panel]));
  const pathParents = [];
  let cursor = byId[newRootId];
  while (cursor && cursor.parentId) {
    pathParents.push(cursor);
    cursor = byId[cursor.parentId];
  }
  if (!cursor || cursor.id !== root.id) {
    return current;
  }

  const reversed = new Map();
  for (const node of pathParents) {
    const original = node.join;
    if (!original) {
      continue;
    }
    reversed.set(node.parentId, {
      childOfId: node.id,
      newJoin: {
        type: original.type,
        parent: { ...original.child },
        child: { ...original.parent },
        rotationDeg: -(original.rotationDeg || 0),
        flip: Boolean(original.flip),
      },
    });
  }

  const newPanels = current.map((panel) => {
    if (panel.id === newRootId) {
      return {
        id: panel.id,
        pose: { x: 0, y: 0, rotationDeg: 0, flip: false },
      };
    }
    const reversal = reversed.get(panel.id);
    if (reversal) {
      return {
        id: panel.id,
        parentId: reversal.childOfId,
        join: sanitizeTriangleJoin(reversal.newJoin),
      };
    }
    return panel;
  });

  const ordered = [byId[newRootId] ? newPanels.find((p) => p.id === newRootId) : newPanels[0]];
  for (const panel of newPanels) {
    if (panel.id !== newRootId) {
      ordered.push(panel);
    }
  }
  return ordered;
}

export function flipPanelJoin(panels, panelId) {
  const current = sanitizeTrianglePanels(panels);
  const next = current.map((panel) => {
    if (panel.id !== panelId) {
      return panel;
    }
    if (!panel.parentId) {
      return {
        ...panel,
        pose: {
          ...(panel.pose || { x: 0, y: 0, rotationDeg: 0 }),
          flip: !panel.pose?.flip,
        },
      };
    }
    if (!panel.join || panel.join.type !== TRIANGLE_JOIN_TYPES.EDGE_EDGE) {
      return panel;
    }
    return {
      ...panel,
      join: {
        ...panel.join,
        flip: !panel.join.flip,
      },
    };
  });
  if (panelsLayoutHasOverlap(next)) {
    return current;
  }
  return next;
}

export function toggleTrianglePanel(panels, col, row) {
  const current = sanitizeTrianglePanels(panels, panels?.length || 1);
  const key = trianglePanelKey(col, row);
  const exists = current.find((p) => trianglePanelKey(p.col ?? 0, p.row ?? 0) === key);
  if (exists) {
    return removeTrianglePanel(current, col, row);
  }
  return addTrianglePanel(current, col, row);
}

export function buildTriangleLayoutPatch(panels, wire = null, powerOptions = null) {
  const sanitized = sanitizeTrianglePanels(panels, panels?.length || 1);
  const triangleCount = sanitized.length;
  const resolvedWire = sanitizeTriangleWire(
    powerOptions?.wire || wire || DEFAULT_TRIANGLE_WIRE
  );
  const poses = computeTrianglePanelPoses(sanitized);
  const powerRootId = resolveTrianglePowerRootId(
    sanitized,
    powerOptions?.powerRootId ?? powerOptions?.trianglePowerRootId
  );
  const activeLinks = mergeActiveLinksWithJoinTree(
    sanitized,
    sanitizeTriangleActiveLinks(sanitized, powerOptions?.activeLinks ?? powerOptions?.triangleActiveLinks),
    poses
  );
  const injectors = sanitizeTrianglePowerInjectors(
    sanitized,
    powerOptions?.injectors ?? powerOptions?.trianglePowerInjectors
  );
  const powerAnalysis = analyzeTrianglePowerGraph(
    sanitized,
    activeLinks,
    powerRootId,
    injectors,
    poses
  );
  const panelOrder =
    powerAnalysis.panelOrder.length === sanitized.length
      ? powerAnalysis.panelOrder
      : orderPanelsForWireRoute(sanitized, null);
  computeTriangleWireRoute(panelOrder, resolvedWire, poses);

  return {
    layoutKind: "triangle",
    trianglePanels: sanitized,
    triangleLayoutVersion: TRIANGLE_LAYOUT_VERSION,
    triangleCount,
    ledCount: triangleCount * LEDS_PER_TRIANGLE,
    ledCountSource: "manual",
    triangleWire: resolvedWire,
    trianglePowerRootId: powerRootId,
    triangleActiveLinks: activeLinks,
    trianglePowerInjectors: injectors,
    triangleWirePanelOrder: null,
  };
}

export const TRIANGLE_LAYOUT_PRESETS = [
  { label: "Line · 2", panels: buildDefaultTriangleChainPanels(2) },
  { label: "Line · 4", panels: buildDefaultTriangleChainPanels(4) },
  { label: "Line · 6", panels: buildDefaultTriangleChainPanels(6) },
  {
    label: "V · 3",
    panels: () => {
      resetPanelIdCounter();
      const p0 = createRootPanel();
      const p1 = createJoinedPanel(p0.id, {
        type: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
        parent: { kind: "edge", index: 2 },
        child: { kind: "edge", index: 0 },
        rotationDeg: 0,
        flip: false,
      });
      const p2 = createJoinedPanel(p0.id, {
        type: TRIANGLE_JOIN_TYPES.CORNER_CORNER,
        parent: { kind: "corner", index: 1 },
        child: { kind: "corner", index: 0 },
        rotationDeg: 120,
        flip: false,
      });
      return [p0, p1, p2];
    },
  },
  {
    label: "Zigzag · 4",
    panels: migrateGridPanelsToJoinTree([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]),
  },
  {
    label: "L · 4",
    panels: migrateGridPanelsToJoinTree([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]),
  },
  {
    label: "Block · 4",
    panels: migrateGridPanelsToJoinTree([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]),
  },
].map((preset) => ({
  ...preset,
  panels: typeof preset.panels === "function" ? preset.panels() : preset.panels,
}));

export function countOccupiedPanelNeighbors(panels, panelId) {
  const sanitized = sanitizeTrianglePanels(panels);
  const poses = computeTrianglePanelPoses(sanitized);
  const target = sanitized.find((p) => p.id === panelId);
  if (!target) {
    return 0;
  }
  const targetGeom = getPanelWorldGeometry(target, poses[target.id]);
  let count = 0;
  for (const other of sanitized) {
    if (other.id === panelId) {
      continue;
    }
    const otherGeom = getPanelWorldGeometry(other, poses[other.id]);
    if (panelsShareWorldPoint(targetGeom.worldCorners, otherGeom.worldCorners)) {
      count += 1;
    }
  }
  return count;
}

export function getOccupiedPanelNeighbors(panels, panelId) {
  const sanitized = sanitizeTrianglePanels(panels);
  const poses = computeTrianglePanelPoses(sanitized);
  const target = sanitized.find((p) => p.id === panelId);
  if (!target) {
    return [];
  }
  const targetGeom = getPanelWorldGeometry(target, poses[target.id]);
  return sanitized.filter((other) => {
    if (other.id === panelId) {
      return false;
    }
    const otherGeom = getPanelWorldGeometry(other, poses[other.id]);
    return panelsShareWorldPoint(targetGeom.worldCorners, otherGeom.worldCorners);
  });
}

export function analyzeTrianglePanelGraph(panels) {
  const sanitized = sanitizeTrianglePanels(panels);
  const poses = computeTrianglePanelPoses(sanitized);
  const geoms = sanitized.map((panel) => getPanelWorldGeometry(panel, poses[panel.id]));
  const adjacency = Object.fromEntries(sanitized.map((panel) => [panel.id, new Set()]));

  for (let i = 0; i < geoms.length; i += 1) {
    for (let j = i + 1; j < geoms.length; j += 1) {
      const panelA = sanitized[i];
      const panelB = sanitized[j];
      const sharedCorners = countSharedWorldCorners(
        geoms[i].worldCorners,
        geoms[j].worldCorners,
        0.08
      );
      const isParentChild = panelA.parentId === panelB.id || panelB.parentId === panelA.id;
      if (sharedCorners >= 2 || (sharedCorners >= 1 && isParentChild)) {
        adjacency[geoms[i].id].add(geoms[j].id);
        adjacency[geoms[j].id].add(geoms[i].id);
      }
    }
  }

  const roots = sanitized.filter((p) => !p.parentId);
  let isConnected = sanitized.length <= 1;
  if (!isConnected && roots.length) {
    const visited = new Set();
    const queue = [roots[0].id];
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      for (const neighborId of adjacency[id] || []) {
        if (!visited.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }
    isConnected = visited.size === sanitized.length;
  }

  const endpoints = sanitized.filter((panel) => (adjacency[panel.id]?.size || 0) === 1);
  const junctions = sanitized.filter((panel) => (adjacency[panel.id]?.size || 0) > 2);
  const isLinearChain =
    isConnected &&
    junctions.length === 0 &&
    (sanitized.length <= 1 || endpoints.length === 2 || isTreeLinearChain(sanitized));

  return {
    panelCount: sanitized.length,
    endpoints,
    junctions,
    roots,
    adjacency,
    isConnected,
    isLinearChain,
    canAutoOrder: isLinearChain,
  };
}

function isTreeLinearChain(panels) {
  const roots = panels.filter((panel) => !panel.parentId);
  if (roots.length !== 1) {
    return false;
  }
  let node = roots[0];
  let visited = 0;
  while (node) {
    visited += 1;
    const children = panels.filter((entry) => entry.parentId === node.id);
    if (children.length > 1) {
      return false;
    }
    node = children[0] || null;
  }
  return visited === panels.length;
}

function isGraphSimplePath(graph, panelCount) {
  if (!graph.isConnected || panelCount <= 1) {
    return true;
  }
  let endpoints = 0;
  for (const panelId of Object.keys(graph.adjacency)) {
    const degree = graph.adjacency[panelId]?.size || 0;
    if (degree > 2) {
      return false;
    }
    if (degree === 1) {
      endpoints += 1;
    }
  }
  return endpoints === 2;
}

function buildDiameterPathFromRoot(rootId, adjacency, panelById) {
  function bfs(startId) {
    const dist = { [startId]: 0 };
    const parent = { [startId]: null };
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      for (const neighborId of adjacency[id] || []) {
        if (!(neighborId in dist)) {
          dist[neighborId] = dist[id] + 1;
          parent[neighborId] = id;
          queue.push(neighborId);
        }
      }
    }
    let farthest = startId;
    for (const id of Object.keys(dist)) {
      if (dist[id] > dist[farthest]) {
        farthest = id;
      }
    }
    return { parent, farthest };
  }

  const { farthest: endA } = bfs(rootId);
  const { parent, farthest: endB } = bfs(endA);
  const path = [];
  let node = endB;
  while (node) {
    path.unshift(panelById[node]);
    node = parent[node];
  }
  return path.filter(Boolean);
}

export function orderPanelsTreeBfs(panels) {
  const sanitized = sanitizeTrianglePanels(panels);
  const root = sanitized.find((panel) => !panel.parentId) || sanitized[0];
  if (!root) {
    return sanitized;
  }

  const panelIndexById = Object.fromEntries(
    sanitized.map((panel, index) => [panel.id, index])
  );
  const ordered = [];
  const visited = new Set();
  const queue = [root.id];

  while (queue.length) {
    const panelId = queue.shift();
    if (visited.has(panelId)) {
      continue;
    }
    visited.add(panelId);
    const panel = sanitized.find((entry) => entry.id === panelId);
    if (panel) {
      ordered.push(panel);
    }
    const children = sanitized
      .filter((entry) => entry.parentId === panelId)
      .sort(
        (left, right) =>
          (panelIndexById[left.id] ?? 0) - (panelIndexById[right.id] ?? 0)
      );
    for (const child of children) {
      queue.push(child.id);
    }
  }

  for (const panel of sanitized) {
    if (!visited.has(panel.id)) {
      ordered.push(panel);
    }
  }

  return ordered;
}

export function orderPanelsTreeDfs(panels) {
  const sanitized = sanitizeTrianglePanels(panels);
  const root = sanitized.find((panel) => !panel.parentId) || sanitized[0];
  if (!root) {
    return sanitized;
  }

  const panelIndexById = Object.fromEntries(
    sanitized.map((panel, index) => [panel.id, index])
  );
  const ordered = [];
  const visited = new Set();

  function visit(panelId) {
    if (visited.has(panelId)) {
      return;
    }
    visited.add(panelId);
    const panel = sanitized.find((entry) => entry.id === panelId);
    if (panel) {
      ordered.push(panel);
    }
    const children = sanitized
      .filter((entry) => entry.parentId === panelId)
      .sort(
        (left, right) =>
          (panelIndexById[left.id] ?? 0) - (panelIndexById[right.id] ?? 0)
      );
    for (const child of children) {
      visit(child.id);
    }
  }

  visit(root.id);

  for (const panel of sanitized) {
    if (!visited.has(panel.id)) {
      ordered.push(panel);
    }
  }

  return ordered;
}

function buildLongestAdjacentWalkFromRoot(rootId, adjacency, panelById) {
  function walk(panelId, fromId) {
    const panel = panelById[panelId];
    if (!panel) {
      return [];
    }

    let bestTail = [];
    const neighbors = [...(adjacency[panelId] || [])]
      .filter((neighborId) => neighborId !== fromId)
      .sort((left, right) => String(left).localeCompare(String(right)));

    for (const neighborId of neighbors) {
      const tail = walk(neighborId, panelId);
      if (tail.length > bestTail.length) {
        bestTail = tail;
      }
    }

    return [panel, ...bestTail];
  }

  return walk(rootId, null);
}

function layoutHasWireBranches(panels) {
  const childCountByParent = {};
  for (const panel of panels) {
    if (!panel.parentId) {
      continue;
    }
    childCountByParent[panel.parentId] = (childCountByParent[panel.parentId] || 0) + 1;
  }
  return Object.values(childCountByParent).some((count) => count > 1);
}

export function sanitizeTriangleWirePanelOrder(panels, rawOrder) {
  const sanitized = sanitizeTrianglePanels(panels);
  const validIds = new Set(sanitized.map((panel) => panel.id));
  if (!Array.isArray(rawOrder) || !rawOrder.length) {
    return null;
  }

  const seen = new Set();
  const ordered = [];
  for (const rawId of rawOrder) {
    const id = String(rawId || "").trim();
    if (!id || !validIds.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ordered.push(id);
  }

  for (const panel of sanitized) {
    if (!seen.has(panel.id)) {
      ordered.push(panel.id);
    }
  }

  if (ordered.length !== sanitized.length) {
    return null;
  }

  return ordered;
}

export function reorderWirePanelOrder(panels, wirePanelOrder, movedPanelId, targetPanelId, insertBefore = true) {
  const sanitized = sanitizeTrianglePanels(panels);
  const current = sanitizeTriangleWirePanelOrder(
    sanitized,
    wirePanelOrder || orderPanelsForWireRoute(sanitized).map((panel) => panel.id)
  );
  if (!current || movedPanelId === targetPanelId) {
    return current;
  }

  const next = current.filter((id) => id !== movedPanelId);
  const targetIndex = next.indexOf(targetPanelId);
  if (targetIndex < 0) {
    return current;
  }

  const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
  next.splice(insertIndex, 0, movedPanelId);
  return sanitizeTriangleWirePanelOrder(sanitized, next);
}

export function resolveTriangleWirePanelOrder(device = {}) {
  const panels = sanitizeTrianglePanels(device.trianglePanels, device.triangleCount || 1);
  return sanitizeTriangleWirePanelOrder(panels, device.triangleWirePanelOrder);
}

function orderPanelsForWireRoute(panels, wirePanelOrder = null) {
  const sanitized = sanitizeTrianglePanels(panels);
  const custom = sanitizeTriangleWirePanelOrder(sanitized, wirePanelOrder);
  if (custom?.length === sanitized.length) {
    const byId = Object.fromEntries(sanitized.map((panel) => [panel.id, panel]));
    const ordered = custom.map((id) => byId[id]).filter(Boolean);
    if (ordered.length === sanitized.length) {
      return ordered;
    }
  }

  if (layoutHasWireBranches(sanitized)) {
    return orderPanelsTreeDfs(sanitized);
  }

  return orderPanelsTreeBfs(sanitized);
}

function orderPanelsForWirePolyline(panels, wirePanelOrder = null) {
  const sanitized = sanitizeTrianglePanels(panels);
  const custom = sanitizeTriangleWirePanelOrder(sanitized, wirePanelOrder);
  if (custom?.length === sanitized.length) {
    const byId = Object.fromEntries(sanitized.map((panel) => [panel.id, panel]));
    const ordered = custom.map((id) => byId[id]).filter(Boolean);
    if (ordered.length === sanitized.length) {
      return ordered;
    }
  }
  if (sanitized.length <= 1) {
    return sanitized;
  }

  const graph = analyzeTrianglePanelGraph(sanitized);
  if (!graph.isConnected) {
    return sanitized;
  }

  const root = graph.roots[0] || sanitized[0];
  const panelById = Object.fromEntries(sanitized.map((panel) => [panel.id, panel]));

  if (layoutHasWireBranches(sanitized)) {
    return orderPanelsTreeDfs(sanitized);
  }

  const simplePath = isGraphSimplePath(graph, sanitized.length);

  if (simplePath) {
    const diameterPath = buildDiameterPathFromRoot(root.id, graph.adjacency, panelById);
    if (diameterPath.length === sanitized.length) {
      if (diameterPath[0]?.id === root.id) {
        return diameterPath;
      }
      if (diameterPath[diameterPath.length - 1]?.id === root.id) {
        return [...diameterPath].reverse();
      }
      const rootIndex = diameterPath.findIndex((panel) => panel.id === root.id);
      if (rootIndex >= 0) {
        const tail = diameterPath.slice(rootIndex);
        const head = diameterPath.slice(0, rootIndex + 1).reverse();
        return tail.length >= head.length ? tail : head;
      }
      return diameterPath;
    }
  }

  if (graph.isLinearChain) {
    const ordered = orderTrianglePanelsForWire(sanitized);
    if (ordered.success) {
      let path = ordered.panels;
      if (path[0]?.id !== root.id && path[path.length - 1]?.id === root.id) {
        path = [...path].reverse();
      }
      return path;
    }
  }

  return buildLongestAdjacentWalkFromRoot(root.id, graph.adjacency, panelById);
}

function orderPanelsByTree(panels) {
  const root = panels.find((panel) => !panel.parentId) || panels[0];
  const ordered = [];
  let node = root;
  while (node) {
    ordered.push(node);
    node = panels.find((entry) => entry.parentId === node.id) || null;
  }
  return ordered;
}

export function orderTrianglePanelsForWire(panels) {
  const sanitized = sanitizeTrianglePanels(panels);
  const analysis = analyzeTrianglePanelGraph(sanitized);

  if (sanitized.length <= 1) {
    return { panels: sanitized, success: true };
  }

  if (!analysis.isLinearChain) {
    return {
      panels: sanitized,
      success: false,
      reason: analysis.isConnected ? "branch" : "disconnected",
    };
  }

  const sortById = (left, right) => String(left.id).localeCompare(String(right.id));
  const start = [...analysis.endpoints].sort(sortById)[0] || [...sanitized].sort(sortById)[0];
  const ordered = [];
  const visited = new Set();
  let current = start;

  while (current) {
    ordered.push(current);
    visited.add(current.id);
    const neighbors = [...(analysis.adjacency[current.id] || [])]
      .map((id) => sanitized.find((panel) => panel.id === id))
      .filter((panel) => panel && !visited.has(panel.id));
    current = neighbors[0] || null;
  }

  if (ordered.length !== sanitized.length && isTreeLinearChain(sanitized)) {
    const treeOrdered = orderPanelsByTree(sanitized);
    if (treeOrdered.length === sanitized.length) {
      return { panels: treeOrdered, success: true };
    }
  }

  if (ordered.length !== sanitized.length) {
    return { panels: sanitized, success: false, reason: "disconnected" };
  }

  return { panels: ordered, success: true };
}

export function suggestWireForOrderedChain(panels, wire) {
  const sanitized = sanitizeTrianglePanels(panels);
  const currentWire = sanitizeTriangleWire(wire || DEFAULT_TRIANGLE_WIRE);
  if (sanitized.length <= 1) {
    return currentWire;
  }

  const next = sanitized[1];
  const root = sanitized[0];
  if (next.parentId === root.id && next.join?.parent?.kind === "edge") {
    const exitCorners = new Set(LOCAL_TOPOLOGY.edges[next.join.parent.index]);
    for (const cornerIndex of [0, 1, 2]) {
      if (!exitCorners.has(cornerIndex)) {
        return {
          ...currentWire,
          origin: { type: "corner", index: cornerIndex },
        };
      }
    }
    return {
      ...currentWire,
      origin: { type: "edge", index: next.join.parent.index },
    };
  }

  return currentWire;
}

export function optimizeTriangleLayout(panels, wire) {
  const orderResult = orderTrianglePanelsForWire(panels);
  if (!orderResult.success) {
    return {
      panels: sanitizeTrianglePanels(panels),
      wire: sanitizeTriangleWire(wire),
      success: false,
      reason: orderResult.reason,
    };
  }

  const nextWire = suggestWireForOrderedChain(orderResult.panels, wire);
  return {
    panels: orderResult.panels,
    wire: nextWire,
    success: true,
  };
}

function getWireTransition(panels, index) {
  const next = panels[index + 1];
  const prev = panels[index];
  if (!next) {
    return null;
  }
  if (next.parentId === prev.id && next.join) {
    return {
      exitOnPrev: next.join.parent,
      entryOnNext: next.join.child,
      joinType: next.join.type,
    };
  }
  return {
    exitOnPrev: { kind: "edge", index: 2 },
    entryOnNext: { kind: "edge", index: 0 },
    joinType: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
  };
}

function dedupeConnectionPoints(points, epsilon = 0.08) {
  const unique = [];
  for (const point of points) {
    if (
      !unique.some(
        (entry) =>
          Math.abs(entry.x - point.x) < epsilon && Math.abs(entry.y - point.y) < epsilon
      )
    ) {
      unique.push(point);
    }
  }
  return unique;
}

function ledGeometricCorner(led) {
  return {
    x: led.cornerX ?? led.x,
    y: led.cornerY ?? led.y,
  };
}

function buildConnectionMarkers(triangle, other, sharedPoints) {
  if (sharedPoints.length >= 2) {
    const pull = 2.6;
    return sharedPoints.map((point) => {
      const towardOther =
        Math.hypot(point.x - triangle.cx, point.y - triangle.cy) <=
        Math.hypot(point.x - other.cx, point.y - other.cy)
          ? other
          : triangle;
      const ox = towardOther.cx - point.x;
      const oy = towardOther.cy - point.y;
      const len = Math.hypot(ox, oy) || 1;
      return {
        x: point.x + (ox / len) * pull,
        y: point.y + (oy / len) * pull,
      };
    });
  }

  const point = sharedPoints[0];
  if (!point) {
    return [];
  }

  const pull = 2.6;
  const markers = [];

  for (const panel of [triangle, other]) {
    const dx = panel.cx - point.x;
    const dy = panel.cy - point.y;
    const len = Math.hypot(dx, dy) || 1;
    markers.push({
      x: point.x + (dx / len) * pull,
      y: point.y + (dy / len) * pull,
    });
  }

  return markers;
}

function panelsShareWireJoin(panelA, panelB, parentByPanelId) {
  const idA = panelA.id ?? panelA.panelId;
  const idB = panelB.id ?? panelB.panelId;
  if (!idA || !idB) {
    return false;
  }
  return parentByPanelId[idA] === idB || parentByPanelId[idB] === idA;
}

function buildWireRouteAdjacentPairs(preview) {
  const pairs = new Set();
  const routePanels = preview?.route?.panels || [];
  for (let index = 0; index < routePanels.length - 1; index += 1) {
    const leftId = routePanels[index]?.id;
    const rightId = routePanels[index + 1]?.id;
    if (leftId && rightId) {
      pairs.add([leftId, rightId].sort().join("|"));
    }
  }
  return pairs;
}

export { buildIdleCenterVector } from "./externalTriangleCenterFlow";

export function buildTrianglePowerFlowPaths(preview) {
  return buildCenterPowerFlowPaths(preview);
}

export function buildPowerFlowLineSegments(paths) {
  const segments = [];
  for (const path of paths || []) {
    const points = path.points || [];
    for (let index = 1; index < points.length; index += 1) {
      segments.push({
        id: `${path.id}-seg-${index - 1}`,
        from: points[index - 1],
        to: points[index],
        isActive: path.isActive !== false,
      });
    }
  }
  return segments;
}

export function buildFlowPointsLineSegments(points, idPrefix, isActive = false) {
  const segments = [];
  for (let index = 1; index < (points || []).length; index += 1) {
    segments.push({
      id: `${idPrefix}-seg-${index - 1}`,
      from: points[index - 1],
      to: points[index],
      isActive,
    });
  }
  return segments;
}

export function collectPowerFlowNodeKeys(paths, extraPanelIds = []) {
  return collectCenterPowerNodeKeys(paths, extraPanelIds);
}

export function buildTrianglePanelConnections(preview) {
  const triangles = (preview?.triangles || []).filter((t) => !t.slot);
  const activeLinkKeys = preview?.powerAnalysis?.activeLinkKeys || new Set();
  const connections = [];
  const seen = new Set();

  for (let i = 0; i < triangles.length; i += 1) {
    for (let j = i + 1; j < triangles.length; j += 1) {
      const triangle = triangles[i];
      const other = triangles[j];
      const idA = triangle.id ?? triangle.panelId;
      const idB = other.id ?? other.panelId;
      const pairKey = [idA, idB].sort().join("|");
      if (seen.has(pairKey)) {
        continue;
      }

      const sharedCorners = [];
      for (const ledA of triangle.leds || []) {
        for (const ledB of other.leds || []) {
          const pointA = ledGeometricCorner(ledA);
          const pointB = ledGeometricCorner(ledB);
          if (
            Math.abs(pointA.x - pointB.x) < 0.08 &&
            Math.abs(pointA.y - pointB.y) < 0.08
          ) {
            sharedCorners.push(pointA);
          }
        }
      }

      if (!sharedCorners.length) {
        continue;
      }
      seen.add(pairKey);

      const sharedPoints = dedupeConnectionPoints(sharedCorners);
      const candidate = (preview?.powerCandidates || []).find((entry) => {
        const key = [entry.panelA, entry.panelB].sort().join("|");
        return key === pairKey;
      });
      const linkKey = candidate?.key || null;
      const isActive = linkKey ? activeLinkKeys.has(linkKey) : false;

      const cornerA = sharedPoints[0];
      const cornerB = sharedPoints[1] || sharedPoints[0];
      const markers = buildConnectionMarkers(triangle, other, sharedPoints);
      const midpoint = markers.reduce(
        (acc, marker) => ({
          x: acc.x + marker.x / markers.length,
          y: acc.y + marker.y / markers.length,
        }),
        { x: 0, y: 0 }
      );
      const edgeOnTriangle =
        candidate?.panelA === idA ? candidate?.edgeA : candidate?.panelB === idA ? candidate?.edgeB : null;
      const edgeOnOther =
        candidate?.panelA === idB ? candidate?.edgeA : candidate?.panelB === idB ? candidate?.edgeB : null;

      connections.push({
        id: pairKey,
        panelA: triangle,
        panelB: other,
        panelAId: idA,
        panelBId: idB,
        midpoint,
        cornerA,
        cornerB,
        markers,
        isActive,
        linkKey,
        edgeA: candidate?.edgeA ?? null,
        edgeB: candidate?.edgeB ?? null,
        flowCenterVector: buildIdleCenterVector(triangle, other),
        joinKind: sharedPoints.length >= 2 ? "corner" : "edge",
      });
    }
  }

  return connections;
}

export function serializeTrianglePanels(panels) {
  const sanitized = sanitizeTrianglePanels(panels);
  const indexById = Object.fromEntries(sanitized.map((panel, index) => [panel.id, index]));

  return sanitized
    .map((panel) => {
      if (!panel.parentId) {
        return `r:${panel.pose?.flip ? 1 : 0}:${panel.pose?.rotationDeg ?? 0}`;
      }
      const join = panel.join || {};
      const parentIndex = indexById[panel.parentId] ?? -1;
      return [
        "j",
        parentIndex,
        join.type,
        join.parent?.kind,
        join.parent?.index,
        join.parent?.t ?? "",
        join.child?.kind,
        join.child?.index,
        join.rotationDeg ?? 0,
        join.flip ? 1 : 0,
      ].join(":");
    })
    .join("|");
}

export function trianglePanelsEqual(left, right) {
  return serializeTrianglePanels(left) === serializeTrianglePanels(right);
}

export function findMatchingTrianglePreset(panels, presets = TRIANGLE_LAYOUT_PRESETS) {
  return presets.find((preset) => trianglePanelsEqual(panels, preset.panels)) || null;
}

export function buildTrianglePanelPreview(panels, options = {}) {
  const sanitized = sanitizeTrianglePanels(panels, panels?.length || 1);
  const wire = sanitizeTriangleWire(options.wire || DEFAULT_TRIANGLE_WIRE);
  const poses = options.poses || computeTrianglePanelPoses(sanitized);
  const powerRootId = resolveTrianglePowerRootId(
    sanitized,
    options.powerRootId ?? options.trianglePowerRootId
  );
  const explicitLinks = options.activeLinks ?? options.triangleActiveLinks;
  let activeLinks = sanitizeTriangleActiveLinks(sanitized, explicitLinks);
  if (!activeLinks.length && !explicitLinks?.length) {
    activeLinks = inferLinksFromJoinTree(sanitized, poses);
  }
  const injectors = sanitizeTrianglePowerInjectors(
    sanitized,
    options.injectors ?? options.trianglePowerInjectors
  );
  const powerAnalysis = analyzeTrianglePowerGraph(
    sanitized,
    activeLinks,
    powerRootId,
    injectors,
    poses
  );
  const powerCandidates = listCandidatePowerLinks(sanitized, poses);
  const panelOrder =
    powerAnalysis.panelOrder.length === sanitized.length
      ? powerAnalysis.panelOrder
      : orderPanelsForWireRoute(sanitized, null);
  const panelSequenceById = Object.fromEntries(
    panelOrder.map((panel, index) => [panel.id, index])
  );
  const polylineOrder = panelOrder;
  const polylineIndexById = Object.fromEntries(
    polylineOrder.map((panel, index) => [panel.id, index])
  );
  const route = computeTriangleWireRoute(panelOrder, wire, poses);
  const includeSlots = options.includeSlots === true;
  const geometries = sanitized.map((panel) => getPanelWorldGeometry(panel, poses[panel.id]));

  const routeById = Object.fromEntries(route.panels.map((entry) => [entry.id, entry]));

  if (!geometries.length) {
    return { triangles: [], viewBox: "0 0 100 100", wire, route, panelCount: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const geom of geometries) {
    for (const point of geom.worldCorners) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  const pad = TRIANGLE_PREVIEW_PAD;
  const rawW = Math.max(maxX - minX, 0.5);
  const rawH = Math.max(maxY - minY, 0.5);
  const viewBoxW = rawW * TRIANGLE_PREVIEW_SCALE + pad * 2;
  const viewBoxH = rawH * TRIANGLE_PREVIEW_SCALE + pad * 2;

  const normalizePoint = (x, y) => ({
    x: (x - minX) * TRIANGLE_PREVIEW_SCALE + pad,
    y: (y - minY) * TRIANGLE_PREVIEW_SCALE + pad,
  });

  const triangles = geometries.map((geom) => {
    const routePanel = routeById[geom.id];
    const panelSequence = panelSequenceById[geom.id];
    const wireIndex = panelSequence ?? -1;
    const powerState = powerAnalysis.panelState[geom.id] || { powerStatus: "idle" };
    const isPowerRoot = geom.id === powerRootId;
    const normalizedPoints = geom.worldCorners.map((p) => normalizePoint(p.x, p.y));
    const chamfer = buildChamferedTriangleGeometry(normalizedPoints);
    const center = normalizePoint(geom.cx, geom.cy);

    const anchorsRaw = isPowerRoot
      ? [
          ...chamfer.cornerHandles.map((handle) => ({
            type: "corner",
            index: handle.cornerIndex,
            x: handle.x,
            y: handle.y,
            label: LOCAL_TOPOLOGY.corners[handle.cornerIndex],
          })),
          ...chamfer.edgeMidpoints.map((midpoint) => ({
            type: "edge",
            index: midpoint.edgeIndex,
            x: midpoint.x,
            y: midpoint.y,
            label: LOCAL_TOPOLOGY.edgeLabels[midpoint.edgeIndex],
            corners: LOCAL_TOPOLOGY.edges[midpoint.edgeIndex],
          })),
        ]
      : [];

    const leds =
      !routePanel
        ? []
        : chamfer.cornerHandles.map((handle) => {
            const ledIndex =
              panelSequence != null ? panelSequence * LEDS_PER_TRIANGLE + handle.cornerIndex : null;
            const wireStep = handle.cornerIndex + 1;
            return {
              id: `tri-${wireIndex}-${handle.cornerIndex}`,
              panelId: geom.id,
              ledIndex,
              wireStep,
              cornerIndex: handle.cornerIndex,
              x: handle.x,
              y: handle.y,
              cornerX: handle.cornerX,
              cornerY: handle.cornerY,
            };
          });

    const anchors = anchorsRaw.map((anchor) => ({
      ...anchor,
      selected: wire.origin.type === anchor.type && wire.origin.index === anchor.index,
    }));

    return {
      id: geom.id,
      panelId: geom.id,
      parentId: geom.panel.parentId ?? null,
      slot: false,
      wireIndex,
      col: geom.panel.col,
      row: geom.panel.row,
      up: geom.up,
      points: formatPolygonPoints(chamfer.polygon),
      cx: center.x,
      cy: center.y,
      label: panelSequence != null ? String(panelSequence + 1) : null,
      leds,
      anchors,
      routePanel: { ...routePanel, topology: LOCAL_TOPOLOGY },
      join: geom.panel.join,
      pose: geom.pose,
      powerStatus: powerState.powerStatus,
      inputEdge: powerState.inputEdge,
      outputEdges: powerState.outputEdges || [],
      isPowerRoot,
      isSplitter: powerState.isSplitter,
    };
  });

  const slotTriangles = [];
  if (includeSlots && sanitized.length < MAX_TRIANGLE_PANELS) {
    for (const geom of geometries) {
      const anchors = buildJoinAnchorsForPanel(geom);
      for (const anchor of anchors) {
        const normalized = normalizePoint(anchor.x, anchor.y);
        const suffix = anchor.kind === "edge" ? "mid" : "c";
        slotTriangles.push({
          id: `anchor-${geom.id}-${anchor.kind}-${anchor.index}-${suffix}`,
          slot: true,
          slotAnchor: anchor,
          parentPanelId: geom.id,
          wireIndex: -1,
          col: null,
          row: null,
          points: "",
          cx: normalized.x,
          cy: normalized.y,
          label: null,
          leds: [],
          anchors: [],
        });
      }
    }
  }

  const allTriangles = [...triangles, ...slotTriangles];

  const triangleByPanelId = Object.fromEntries(
    triangles.map((triangle) => [triangle.panelId ?? triangle.id, triangle])
  );
  const wirePointSegments = buildWirePointSegments(
    polylineOrder,
    triangleByPanelId,
    poses,
    wire
  );
  const wirePoints = wirePointSegments.flat();
  const previewWithoutCenterVectors = {
    triangles: allTriangles,
    viewBox: `0 0 ${viewBoxW} ${viewBoxH}`,
    panelCount: sanitized.length,
    slotCount: slotTriangles.length,
    wire,
    route,
    wirePoints,
    wirePointSegments,
    polylinePanelIds: polylineOrder.map((panel) => panel.id),
    panelParentById: Object.fromEntries(
      sanitized.map((panel) => [panel.id, panel.parentId ?? null])
    ),
    poses,
    powerAnalysis,
    powerCandidates,
    powerRootId,
    activeLinks,
    injectors,
  };
  const centerPowerVectors = buildCenterPowerVectors(previewWithoutCenterVectors);

  return {
    ...previewWithoutCenterVectors,
    centerPowerVectors,
  };
}

export function resolveTrianglePanels(device = {}) {
  return sanitizeTrianglePanels(device.trianglePanels, device.triangleCount || 4);
}

export function resolveTriangleWire(device = {}) {
  return sanitizeTriangleWire(device.triangleWire || DEFAULT_TRIANGLE_WIRE);
}

export function resolveTrianglePowerSettings(device = {}) {
  const panels = resolveTrianglePanels(device);
  return migrateTrianglePowerSettings(panels, device);
}

export function summarizeTriangleLayoutEditor(panels, wire, powerSettings = null) {
  const sanitized = sanitizeTrianglePanels(panels);
  const atMax = sanitized.length >= MAX_TRIANGLE_PANELS;
  const matchingPreset = findMatchingTrianglePreset(sanitized);
  const graph = analyzeTrianglePanelGraph(sanitized);
  const poses = computeTrianglePanelPoses(sanitized);
  const power = powerSettings || migrateTrianglePowerSettings(sanitized, {});
  const activeLinks = sanitizeTriangleActiveLinks(sanitized, power.triangleActiveLinks);
  const powerAnalysis = analyzeTrianglePowerGraph(
    sanitized,
    activeLinks,
    power.trianglePowerRootId,
    power.trianglePowerInjectors,
    poses
  );
  const powerSummary = summarizeTrianglePowerGraph(powerAnalysis);
  const rootPanel =
    sanitized.find((panel) => panel.id === power.powerRootId) || sanitized[0] || null;
  const originLabel = rootPanel ? describeWireOrigin(wire, rootPanel) : null;
  const directionLabel = describeWireDirection(wire);
  const hasOverlap = detectLayoutOverlap(sanitized, poses);
  const uniqueLedCount = sanitized.length * LEDS_PER_TRIANGLE;

  let step = "wire";
  let hint =
    "Teal lines distribute from each panel center to its 3 corner LEDs. Click a shared edge to toggle the red power linker.";

  if (!graph.isConnected && sanitized.length > 1) {
    step = "build";
    hint = "Some panels are disconnected — attach them with the panel ghost.";
  } else if (powerSummary.idleCount > 0) {
    step = "wire";
    hint = `${powerSummary.idleCount} panel(s) have no power — enable red linkers from Root or add a power injector.`;
  } else if (powerSummary.hasVoltageWarning) {
    step = "wire";
    hint = "Branch exceeds 12 panels — add a power injector or split the layout.";
  } else if (hasOverlap) {
    step = "build";
    hint = "Some panels overlap. Select a panel to rotate or remove it.";
  } else if (matchingPreset) {
    step = "wire";
    hint = `${matchingPreset.label} detected. Toggle red linkers for power flow and drag IN to set signal entry.`;
  } else if (!atMax && sanitized.length === 1) {
    step = "build";
    hint = "Drag the panel ghost onto an anchor to grow the layout.";
  } else if (sanitized.length > 1) {
    step = "wire";
    hint =
      "Red center lines carry power between panels. Teal spokes reach corner LEDs from each hub.";
  }

  return {
    panelCount: sanitized.length,
    ledCount: uniqueLedCount,
    addSlotCount: atMax ? 0 : sanitized.length * 14,
    atMax,
    hasOverlap,
    matchingPresetLabel: matchingPreset?.label || null,
    originLabel,
    directionLabel,
    hint,
    step,
    canRemove: sanitized.length > 1,
    graph,
    needsOrder: false,
    canOptimize: false,
    powerSummary,
    powerAnalysis,
  };
}

function detectLayoutOverlap(panels, poses) {
  return panelsLayoutHasOverlap(panels, poses);
}

export function collectUniqueTriangleLedMarkers(triangles = []) {
  const markers = [];

  const sortedTriangles = [...triangles].sort(
    (left, right) => (left.wireIndex ?? 999) - (right.wireIndex ?? 999)
  );

  for (const triangle of sortedTriangles) {
    if (triangle.slot || !triangle.leds?.length) {
      continue;
    }

    for (const led of triangle.leds) {
      if (led.ledIndex == null) {
        continue;
      }
      markers.push({
        ...led,
        triangles: [triangle],
      });
    }
  }

  return markers;
}

export function collectLedIndicesAtPosition(markers = [], x, y, tolerance = 0.08) {
  const indices = [];
  for (const marker of markers) {
    if (marker.ledIndex == null) {
      continue;
    }
    const markerX = marker.cornerX ?? marker.x;
    const markerY = marker.cornerY ?? marker.y;
    if (
      Math.abs(markerX - x) < tolerance &&
      Math.abs(markerY - y) < tolerance
    ) {
      indices.push(marker.ledIndex);
    }
  }
  return [...new Set(indices)].sort((left, right) => left - right);
}

export function computeTriangleLedLabelOffset(x, y, triangles = [], push = 5.4) {
  if (!triangles.length) {
    return { x, y };
  }

  let ox = 0;
  let oy = 0;

  for (const triangle of triangles) {
    const dx = x - triangle.cx;
    const dy = y - triangle.cy;
    const len = Math.hypot(dx, dy) || 1;
    ox += dx / len;
    oy += dy / len;
  }

  const len = Math.hypot(ox, oy) || 1;
  return {
    x: x + (ox / len) * push,
    y: y + (oy / len) * push,
  };
}

export function computeTrianglePanelLabelPosition(triangle) {
  return {
    x: triangle.cx,
    y: triangle.cy + 3.4,
  };
}
