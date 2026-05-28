import {
  computeTrianglePanelPoses,
  countSharedWorldCorners,
  getPanelWorldGeometry,
  panelsShareWorldEdge,
} from "./externalTrianglePose";

export const MAX_PANELS_PER_POWER_BRANCH = 12;

const LOCAL_EDGES = [
  [0, 1],
  [1, 2],
  [2, 0],
];

const WORLD_EPSILON = 0.08;

let linkIdCounter = 0;

export function resetPowerLinkIdCounter() {
  linkIdCounter = 0;
}

export function createPowerLinkId() {
  linkIdCounter += 1;
  return `pl${linkIdCounter}`;
}

export function createInjectorId() {
  linkIdCounter += 1;
  return `pi${linkIdCounter}`;
}

function worldPointsMatch(left, right, epsilon = WORLD_EPSILON) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= epsilon;
}

export function normalizeActiveLinkKey(panelA, panelB, edgeA, edgeB) {
  const idA = String(panelA);
  const idB = String(panelB);
  if (idA <= idB) {
    return `${idA}|${idB}|${edgeA}|${edgeB}`;
  }
  return `${idB}|${idA}|${edgeB}|${edgeA}`;
}

export function findSharedEdgeIndices(cornersA, cornersB, epsilon = WORLD_EPSILON) {
  for (let edgeA = 0; edgeA < LOCAL_EDGES.length; edgeA += 1) {
    const [a0, a1] = LOCAL_EDGES[edgeA].map((index) => cornersA[index]);
    for (let edgeB = 0; edgeB < LOCAL_EDGES.length; edgeB += 1) {
      const [b0, b1] = LOCAL_EDGES[edgeB].map((index) => cornersB[index]);
      const forward =
        worldPointsMatch(a0, b0, epsilon) && worldPointsMatch(a1, b1, epsilon);
      const reverse =
        worldPointsMatch(a0, b1, epsilon) && worldPointsMatch(a1, b0, epsilon);
      if (forward || reverse) {
        return { edgeA, edgeB };
      }
    }
  }
  return null;
}

export function resolveTrianglePowerRootId(panels, rootId) {
  const sanitized = Array.isArray(panels) ? panels : [];
  const explicit = sanitized.find((panel) => panel.id === rootId);
  if (explicit) {
    return explicit.id;
  }
  const structuralRoot = sanitized.find((panel) => !panel.parentId);
  return structuralRoot?.id || sanitized[0]?.id || null;
}

export function sanitizeTriangleActiveLinks(panels, rawLinks) {
  const panelIds = new Set((panels || []).map((panel) => panel.id));
  const seen = new Set();
  const links = [];

  for (const raw of rawLinks || []) {
    const panelA = String(raw?.panelA || "").trim();
    const panelB = String(raw?.panelB || "").trim();
    const edgeA = Math.max(0, Math.min(2, Math.round(Number(raw?.edgeA) || 0)));
    const edgeB = Math.max(0, Math.min(2, Math.round(Number(raw?.edgeB) || 0)));
    if (!panelA || !panelB || panelA === panelB || !panelIds.has(panelA) || !panelIds.has(panelB)) {
      continue;
    }
    const key = normalizeActiveLinkKey(panelA, panelB, edgeA, edgeB);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    links.push({
      id: raw?.id || createPowerLinkId(),
      panelA,
      panelB,
      edgeA,
      edgeB,
      key,
    });
  }

  return links;
}

export function sanitizeTrianglePowerInjectors(panels, rawInjectors) {
  const panelIds = new Set((panels || []).map((panel) => panel.id));
  const injectors = [];

  for (const raw of rawInjectors || []) {
    const panelId = String(raw?.panelId || "").trim();
    const edgeIndex = Math.max(0, Math.min(2, Math.round(Number(raw?.edgeIndex) || 0)));
    if (!panelId || !panelIds.has(panelId)) {
      continue;
    }
    injectors.push({
      id: raw?.id || createInjectorId(),
      panelId,
      edgeIndex,
    });
  }

  return injectors;
}

export function listCandidatePowerLinks(panels, poses = null) {
  const sanitized = Array.isArray(panels) ? panels : [];
  const resolvedPoses = poses || computeTrianglePanelPoses(sanitized);
  const geoms = sanitized.map((panel) => getPanelWorldGeometry(panel, resolvedPoses[panel.id]));
  const candidates = [];

  for (let i = 0; i < geoms.length; i += 1) {
    for (let j = i + 1; j < geoms.length; j += 1) {
      const geomA = geoms[i];
      const geomB = geoms[j];
      if (!panelsShareWorldEdge(geomA.worldCorners, geomB.worldCorners, WORLD_EPSILON)) {
        continue;
      }
      const shared = findSharedEdgeIndices(geomA.worldCorners, geomB.worldCorners, WORLD_EPSILON);
      if (!shared) {
        continue;
      }
      const key = normalizeActiveLinkKey(geomA.id, geomB.id, shared.edgeA, shared.edgeB);
      candidates.push({
        key,
        panelA: geomA.id,
        panelB: geomB.id,
        edgeA: shared.edgeA,
        edgeB: shared.edgeB,
      });
    }
  }

  return candidates;
}

export function inferLinksFromJoinTree(panels, poses = null) {
  const sanitized = Array.isArray(panels) ? panels : [];
  const resolvedPoses = poses || computeTrianglePanelPoses(sanitized);
  const byId = Object.fromEntries(sanitized.map((panel) => [panel.id, panel]));
  const links = [];
  const seen = new Set();

  for (const panel of sanitized) {
    if (!panel.parentId) {
      continue;
    }
    const parent = byId[panel.parentId];
    if (!parent) {
      continue;
    }
    const parentGeom = getPanelWorldGeometry(parent, resolvedPoses[parent.id]);
    const childGeom = getPanelWorldGeometry(panel, resolvedPoses[panel.id]);
    const shared = findSharedEdgeIndices(parentGeom.worldCorners, childGeom.worldCorners, WORLD_EPSILON);
    if (!shared) {
      continue;
    }
    const key = normalizeActiveLinkKey(parent.id, panel.id, shared.edgeA, shared.edgeB);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    links.push({
      id: createPowerLinkId(),
      panelA: parent.id,
      panelB: panel.id,
      edgeA: shared.edgeA,
      edgeB: shared.edgeB,
      key,
    });
  }

  return links;
}

export function mergeActiveLinksWithJoinTree(panels, activeLinks, poses = null) {
  const current = sanitizeTriangleActiveLinks(panels, activeLinks);
  const inferred = inferLinksFromJoinTree(panels, poses);
  const seen = new Set(current.map((link) => link.key));
  const merged = [...current];
  for (const link of inferred) {
    if (!seen.has(link.key)) {
      seen.add(link.key);
      merged.push(link);
    }
  }
  return merged;
}

function buildAdjacency(panels, activeLinks) {
  const adjacency = Object.fromEntries(panels.map((panel) => [panel.id, []]));

  for (const link of activeLinks) {
    adjacency[link.panelA]?.push({
      panelId: link.panelB,
      edgeSelf: link.edgeA,
      edgeNeighbor: link.edgeB,
      linkKey: link.key,
    });
    adjacency[link.panelB]?.push({
      panelId: link.panelA,
      edgeSelf: link.edgeB,
      edgeNeighbor: link.edgeA,
      linkKey: link.key,
    });
  }

  return adjacency;
}

export function wouldCreatePowerLoop(panels, activeLinks, candidate) {
  const key = normalizeActiveLinkKey(
    candidate.panelA,
    candidate.panelB,
    candidate.edgeA,
    candidate.edgeB
  );
  const alreadyActive = activeLinks.some((link) => link.key === key);
  if (alreadyActive) {
    return false;
  }

  const nextLinks = [
    ...activeLinks,
    {
      panelA: candidate.panelA,
      panelB: candidate.panelB,
      edgeA: candidate.edgeA,
      edgeB: candidate.edgeB,
      key,
    },
  ];
  const adjacency = buildAdjacency(panels, nextLinks);
  const visited = new Set();
  const stack = new Set();

  function dfs(panelId) {
    if (stack.has(panelId)) {
      return true;
    }
    if (visited.has(panelId)) {
      return false;
    }
    visited.add(panelId);
    stack.add(panelId);
    for (const neighbor of adjacency[panelId] || []) {
      if (dfs(neighbor.panelId)) {
        return true;
      }
    }
    stack.delete(panelId);
    return false;
  }

  for (const panel of panels) {
    if (dfs(panel.id)) {
      return true;
    }
  }

  return false;
}

export function toggleTriangleActiveLink(panels, activeLinks, candidate, enabled) {
  const sanitized = sanitizeTriangleActiveLinks(panels, activeLinks);
  const key = normalizeActiveLinkKey(
    candidate.panelA,
    candidate.panelB,
    candidate.edgeA,
    candidate.edgeB
  );
  const exists = sanitized.find((link) => link.key === key);

  if (enabled) {
    if (exists) {
      return { links: sanitized, success: true };
    }
    if (wouldCreatePowerLoop(panels, sanitized, candidate)) {
      return { links: sanitized, success: false, reason: "loop" };
    }
    return {
      links: [
        ...sanitized,
        {
          id: createPowerLinkId(),
          panelA: candidate.panelA,
          panelB: candidate.panelB,
          edgeA: candidate.edgeA,
          edgeB: candidate.edgeB,
          key,
        },
      ],
      success: true,
    };
  }

  return {
    links: sanitized.filter((link) => link.key !== key),
    success: true,
  };
}

function bfsFromSource(sourceId, adjacency, startDepth = 1) {
  const depthByPanel = {};
  const parentByPanel = {};
  const parentEdgeByPanel = {};
  const queue = [sourceId];
  depthByPanel[sourceId] = startDepth;
  parentByPanel[sourceId] = null;

  while (queue.length) {
    const panelId = queue.shift();
    const currentDepth = depthByPanel[panelId];
    for (const neighbor of adjacency[panelId] || []) {
      if (neighbor.panelId in depthByPanel) {
        continue;
      }
      depthByPanel[neighbor.panelId] = currentDepth + 1;
      parentByPanel[neighbor.panelId] = panelId;
      parentEdgeByPanel[neighbor.panelId] = {
        edgeSelf: neighbor.edgeSelf,
        edgeNeighbor: neighbor.edgeNeighbor,
        linkKey: neighbor.linkKey,
      };
      queue.push(neighbor.panelId);
    }
  }

  return { depthByPanel, parentByPanel, parentEdgeByPanel };
}

export function analyzeTrianglePowerGraph(panels, activeLinks, rootId, injectors = [], poses = null) {
  const sanitized = Array.isArray(panels) ? panels : [];
  const links = sanitizeTriangleActiveLinks(sanitized, activeLinks);
  const resolvedInjectors = sanitizeTrianglePowerInjectors(sanitized, injectors);
  const resolvedRootId = resolveTrianglePowerRootId(sanitized, rootId);
  const adjacency = buildAdjacency(sanitized, links);
  const activeLinkKeys = new Set(links.map((link) => link.key));

  const depthByPanel = {};
  const parentByPanel = {};
  const parentEdgeByPanel = {};
  const sourceByPanel = {};

  if (resolvedRootId) {
    const rootWalk = bfsFromSource(resolvedRootId, adjacency, 1);
    for (const [panelId, depth] of Object.entries(rootWalk.depthByPanel)) {
      depthByPanel[panelId] = depth;
      parentByPanel[panelId] = rootWalk.parentByPanel[panelId];
      parentEdgeByPanel[panelId] = rootWalk.parentEdgeByPanel[panelId];
      sourceByPanel[panelId] = resolvedRootId;
    }
  }

  for (const injector of resolvedInjectors) {
    const walk = bfsFromSource(injector.panelId, adjacency, 1);
    for (const [panelId, depth] of Object.entries(walk.depthByPanel)) {
      const existingDepth = depthByPanel[panelId];
      if (existingDepth == null || depth < existingDepth) {
        depthByPanel[panelId] = depth;
        parentByPanel[panelId] = walk.parentByPanel[panelId];
        parentEdgeByPanel[panelId] = walk.parentEdgeByPanel[panelId];
        sourceByPanel[panelId] = injector.id;
      }
    }
  }

  const panelState = {};
  let poweredCount = 0;
  let idleCount = 0;
  let voltageWarningCount = 0;

  for (const panel of sanitized) {
    const depth = depthByPanel[panel.id];
    const powered = depth != null;
    let powerStatus = powered ? "powered" : "idle";
    if (powered && depth > MAX_PANELS_PER_POWER_BRANCH) {
      powerStatus = "voltage_warning";
      voltageWarningCount += 1;
    } else if (powered) {
      poweredCount += 1;
    } else {
      idleCount += 1;
    }

    const activeEdges = (adjacency[panel.id] || []).map((entry) => entry.edgeSelf);
    const uniqueActiveEdges = [...new Set(activeEdges)];
    let inputEdge = null;
    const outputEdges = [];

    if (powered && parentEdgeByPanel[panel.id]) {
      inputEdge = parentEdgeByPanel[panel.id].edgeSelf;
    }

    for (const edgeIndex of uniqueActiveEdges) {
      if (inputEdge != null && edgeIndex === inputEdge) {
        continue;
      }
      outputEdges.push(edgeIndex);
    }

    if (powered && inputEdge == null && uniqueActiveEdges.length === 1) {
      inputEdge = null;
      outputEdges.length = 0;
      outputEdges.push(uniqueActiveEdges[0]);
    }

    panelState[panel.id] = {
      powerStatus,
      depth: depth ?? null,
      sourceId: sourceByPanel[panel.id] || null,
      inputEdge,
      outputEdges,
      activeEdgeCount: uniqueActiveEdges.length,
      isSplitter: powered && uniqueActiveEdges.length >= 3,
    };
  }

  const panelOrder = orderPanelsForPowerTraversal(
    sanitized,
    resolvedRootId,
    adjacency,
    depthByPanel,
    parentByPanel
  );

  return {
    rootId: resolvedRootId,
    activeLinks: links,
    injectors: resolvedInjectors,
    activeLinkKeys,
    panelState,
    panelOrder,
    poweredCount,
    idleCount,
    voltageWarningCount,
    parentByPanel,
    parentEdgeByPanel,
    depthByPanel,
    adjacency,
  };
}

export function orderPanelsForPowerTraversal(panels, rootId, adjacency, depthByPanel, parentByPanel) {
  if (!rootId) {
    return [...panels];
  }

  const byId = Object.fromEntries(panels.map((panel) => [panel.id, panel]));
  const ordered = [];
  const visited = new Set();

  function visit(panelId) {
    if (!panelId || visited.has(panelId) || !byId[panelId]) {
      return;
    }
    if (!(panelId in depthByPanel)) {
      return;
    }
    visited.add(panelId);
    ordered.push(byId[panelId]);
    const children = (adjacency[panelId] || [])
      .map((entry) => entry.panelId)
      .filter((childId) => parentByPanel[childId] === panelId)
      .sort((left, right) => String(left).localeCompare(String(right)));
    for (const childId of children) {
      visit(childId);
    }
  }

  visit(rootId);

  for (const panel of panels) {
    if (!visited.has(panel.id) && panel.id in depthByPanel) {
      visit(panel.id);
    }
  }

  for (const panel of panels) {
    if (!visited.has(panel.id)) {
      ordered.push(panel);
    }
  }

  return ordered;
}

export function migrateTrianglePowerSettings(panels, device = {}) {
  const sanitizedPanels = Array.isArray(panels) ? panels : [];
  const rootId = resolveTrianglePowerRootId(
    sanitizedPanels,
    device.trianglePowerRootId || device.trianglePowerRootPanelId
  );
  let activeLinks = sanitizeTriangleActiveLinks(sanitizedPanels, device.triangleActiveLinks);
  if (!activeLinks.length && !device.triangleActiveLinks?.length) {
    activeLinks = inferLinksFromJoinTree(sanitizedPanels);
  }
  const injectors = sanitizeTrianglePowerInjectors(
    sanitizedPanels,
    device.trianglePowerInjectors
  );

  return {
    trianglePowerRootId: rootId,
    triangleActiveLinks: activeLinks,
    trianglePowerInjectors: injectors,
  };
}

export function addTrianglePowerInjector(panels, injectors, panelId, edgeIndex) {
  const sanitized = sanitizeTrianglePowerInjectors(panels, injectors);
  const id = String(panelId || "").trim();
  const edge = Math.max(0, Math.min(2, Math.round(Number(edgeIndex) || 0)));
  if (sanitized.some((entry) => entry.panelId === id && entry.edgeIndex === edge)) {
    return sanitized;
  }
  return [
    ...sanitized,
    {
      id: createInjectorId(),
      panelId: id,
      edgeIndex: edge,
    },
  ];
}

export function removeTrianglePowerInjector(panels, injectors, injectorId) {
  const target = String(injectorId || "").trim();
  return sanitizeTrianglePowerInjectors(panels, injectors).filter((entry) => entry.id !== target);
}

export function summarizeTrianglePowerGraph(analysis) {
  if (!analysis) {
    return {
      poweredCount: 0,
      idleCount: 0,
      voltageWarningCount: 0,
      hasVoltageWarning: false,
    };
  }
  return {
    poweredCount: analysis.poweredCount || 0,
    idleCount: analysis.idleCount || 0,
    voltageWarningCount: analysis.voltageWarningCount || 0,
    hasVoltageWarning: (analysis.voltageWarningCount || 0) > 0,
    totalPanels: (analysis.poweredCount || 0) + (analysis.idleCount || 0),
  };
}
