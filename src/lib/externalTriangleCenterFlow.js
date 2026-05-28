function getTriangleCenter(triangle) {
  return {
    nodeId: triangle.panelId ?? triangle.id,
    x: triangle.cx,
    y: triangle.cy,
  };
}

function mapPowerStatus(status) {
  if (status === "powered") {
    return "ACTIVE";
  }
  if (status === "voltage_warning") {
    return "VOLTAGE_WARNING";
  }
  return "IDLE";
}

function resolveIdleLinkDirection(candidate, depthByPanel, rootId) {
  const depthA = depthByPanel[candidate.panelA];
  const depthB = depthByPanel[candidate.panelB];

  if (depthA != null && depthB == null) {
    return { fromId: candidate.panelA, toId: candidate.panelB };
  }
  if (depthB != null && depthA == null) {
    return { fromId: candidate.panelB, toId: candidate.panelA };
  }
  if (depthA != null && depthB != null) {
    if (depthA <= depthB) {
      return { fromId: candidate.panelA, toId: candidate.panelB };
    }
    return { fromId: candidate.panelB, toId: candidate.panelA };
  }
  if (rootId === candidate.panelA) {
    return { fromId: candidate.panelA, toId: candidate.panelB };
  }
  if (rootId === candidate.panelB) {
    return { fromId: candidate.panelB, toId: candidate.panelA };
  }
  return { fromId: candidate.panelA, toId: candidate.panelB };
}

export function buildCenterPowerVectors(preview) {
  const analysis = preview?.powerAnalysis;
  const rootId = analysis?.rootId;
  const triangles = (preview?.triangles || []).filter((triangle) => !triangle.slot);
  const trianglesById = Object.fromEntries(
    triangles.map((triangle) => [triangle.panelId ?? triangle.id, triangle])
  );

  if (!rootId) {
    return [];
  }

  const parentByPanel = analysis.parentByPanel || {};
  const depthByPanel = analysis.depthByPanel || {};
  const panelState = analysis.panelState || {};
  const parentEdgeByPanel = analysis.parentEdgeByPanel || {};
  const activeLinkKeys = analysis.activeLinkKeys || new Set();
  const vectors = [];

  for (const [childId, parentId] of Object.entries(parentByPanel)) {
    if (!parentId || depthByPanel[childId] == null) {
      continue;
    }

    const parentTriangle = trianglesById[parentId];
    const childTriangle = trianglesById[childId];
    if (!parentTriangle || !childTriangle) {
      continue;
    }

    const edgeInfo = parentEdgeByPanel[childId];
    const linkKey = edgeInfo?.linkKey || null;
    const fromCenter = getTriangleCenter(parentTriangle);
    const toCenter = getTriangleCenter(childTriangle);
    const connectionId = `${fromCenter.nodeId}_TO_${toCenter.nodeId}`;
    const childState = panelState[childId] || {};

    vectors.push({
      connectionId,
      fromCenter,
      toCenter,
      vectorDirection: connectionId,
      arrowDisplay: true,
      powerStatus: mapPowerStatus(childState.powerStatus),
      depth: depthByPanel[childId],
      role: "OUT",
      linkKey,
      isActive: true,
      fromPanelId: parentId,
      toPanelId: childId,
    });
  }

  for (const candidate of preview?.powerCandidates || []) {
    if (activeLinkKeys.has(candidate.key)) {
      continue;
    }

    const triangleA = trianglesById[candidate.panelA];
    const triangleB = trianglesById[candidate.panelB];
    if (!triangleA || !triangleB) {
      continue;
    }

    const { fromId, toId } = resolveIdleLinkDirection(candidate, depthByPanel, rootId);
    const fromTriangle = trianglesById[fromId];
    const toTriangle = trianglesById[toId];
    const fromCenter = getTriangleCenter(fromTriangle);
    const toCenter = getTriangleCenter(toTriangle);
    const connectionId = `${fromCenter.nodeId}_TO_${toCenter.nodeId}`;

    vectors.push({
      connectionId,
      fromCenter,
      toCenter,
      vectorDirection: connectionId,
      arrowDisplay: false,
      powerStatus: "IDLE",
      depth: null,
      role: "IDLE",
      linkKey: candidate.key,
      isActive: false,
      fromPanelId: fromId,
      toPanelId: toId,
    });
  }

  return vectors;
}

export function buildPowerVectorSegments(vectors) {
  return (vectors || []).map((vector, index) => ({
    id: vector.connectionId || `power-vec-${index}`,
    from: {
      x: vector.fromCenter.x,
      y: vector.fromCenter.y,
      nodeId: vector.fromCenter.nodeId,
    },
    to: {
      x: vector.toCenter.x,
      y: vector.toCenter.y,
      nodeId: vector.toCenter.nodeId,
    },
    direction: vector.vectorDirection,
    depth: vector.depth,
    status: vector.powerStatus,
    isActive: vector.isActive !== false && vector.powerStatus !== "IDLE",
    arrowDisplay: vector.arrowDisplay !== false,
    linkKey: vector.linkKey,
  }));
}

export function buildCenterPowerFlowPaths(preview) {
  const vectors = preview?.centerPowerVectors || buildCenterPowerVectors(preview);
  const activeVectors = vectors.filter(
    (vector) => vector.isActive !== false && vector.powerStatus !== "IDLE"
  );

  return activeVectors.map((vector, index) => ({
    id: vector.connectionId || `power-flow-${index}`,
    points: [
      {
        x: vector.fromCenter.x,
        y: vector.fromCenter.y,
        nodeId: vector.fromCenter.nodeId,
      },
      {
        x: vector.toCenter.x,
        y: vector.toCenter.y,
        nodeId: vector.toCenter.nodeId,
      },
    ],
    isActive: true,
    depth: vector.depth,
    powerStatus: vector.powerStatus,
    vectorDirection: vector.vectorDirection,
    linkKey: vector.linkKey,
    fromPanelId: vector.fromPanelId,
    toPanelId: vector.toPanelId,
  }));
}

export function buildIdleCenterVector(triangleA, triangleB) {
  if (!triangleA || !triangleB) {
    return [];
  }
  return [
    {
      x: triangleA.cx,
      y: triangleA.cy,
      nodeId: triangleA.panelId ?? triangleA.id,
    },
    {
      x: triangleB.cx,
      y: triangleB.cy,
      nodeId: triangleB.panelId ?? triangleB.id,
    },
  ];
}

export function summarizeCenterFlow(preview) {
  const vectors = preview?.centerPowerVectors || buildCenterPowerVectors(preview);
  const analysis = preview?.powerAnalysis || {};
  const panelState = analysis.panelState || {};
  const outCountByPanel = {};

  for (const vector of vectors) {
    if (vector.isActive && vector.role === "OUT") {
      const fromId = vector.fromPanelId || vector.fromCenter?.nodeId;
      outCountByPanel[fromId] = (outCountByPanel[fromId] || 0) + 1;
    }
  }

  const depths = Object.values(analysis.depthByPanel || {}).filter((depth) => depth != null);
  const maxDepth = depths.length ? Math.max(...depths) : 0;
  const hasVoltageWarning = Object.values(panelState).some(
    (state) => state.powerStatus === "voltage_warning"
  );

  return {
    vectorCount: vectors.length,
    activeVectorCount: vectors.filter((vector) => vector.isActive).length,
    outCountByPanel,
    maxDepth,
    hasVoltageWarning,
  };
}

export function getPanelCenterHub(preview, panelId) {
  const vectors = preview?.centerPowerVectors || buildCenterPowerVectors(preview);
  const analysis = preview?.powerAnalysis || {};
  const rootId = analysis.rootId;
  const parentByPanel = analysis.parentByPanel || {};
  const panelState = analysis.panelState || {};
  const state = panelState[panelId] || {};
  const parentId = parentByPanel[panelId];

  let inputVector = null;
  if (parentId && state.powerStatus !== "idle") {
    inputVector = vectors.find((vector) => vector.isActive && vector.toPanelId === panelId) || null;
  }

  const outputVectors = vectors.filter((vector) => vector.isActive && vector.fromPanelId === panelId);

  return {
    panelId,
    isRoot: panelId === rootId,
    isSplitter: state.isSplitter || outputVectors.length >= 2,
    inputVector,
    outputVectors,
    powerStatus: state.powerStatus || "idle",
  };
}

export function collectCenterPowerNodeKeys(paths, extraPanelIds = []) {
  const keys = new Set();
  for (const path of paths || []) {
    for (const point of path.points || []) {
      if (point.nodeId) {
        keys.add(String(point.nodeId));
      }
    }
  }
  for (const panelId of extraPanelIds) {
    if (panelId) {
      keys.add(String(panelId));
    }
  }
  return keys;
}

export function powerDepthOpacity(depth, minOpacity = 0.35) {
  if (depth == null) {
    return 1;
  }
  return Math.max(minOpacity, 1 - depth * 0.05);
}

export function buildPowerSupplyFlowSegment(preview) {
  const rootTriangle = preview?.triangles?.find((triangle) => triangle.isPowerRoot && !triangle.slot);
  if (!rootTriangle) {
    return null;
  }
  const entryAnchor = rootTriangle.anchors?.find((anchor) => anchor.selected);
  if (!entryAnchor) {
    return null;
  }
  const rootId = rootTriangle.panelId ?? rootTriangle.id;
  return {
    id: `supply-${rootId}`,
    points: [
      { x: entryAnchor.x, y: entryAnchor.y, nodeId: "supply-in" },
      { x: rootTriangle.cx, y: rootTriangle.cy, nodeId: rootId },
    ],
    fromPanelId: "supply-in",
    toPanelId: rootId,
    depth: 0,
    powerStatus: "ACTIVE",
    isActive: true,
  };
}

export function indexPowerFlowBranches(paths) {
  const byParent = new Map();
  for (const path of paths || []) {
    const fromId = path.fromPanelId || path.points?.[0]?.nodeId;
    if (!fromId) {
      continue;
    }
    if (!byParent.has(fromId)) {
      byParent.set(fromId, []);
    }
    byParent.get(fromId).push(path);
  }

  for (const group of byParent.values()) {
    group.sort((left, right) =>
      String(left.toPanelId || left.id).localeCompare(String(right.toPanelId || right.id))
    );
  }

  return (paths || []).map((path) => {
    const from = path.points?.[0];
    const to = path.points?.[1];
    const dx = (to?.x ?? 0) - (from?.x ?? 0);
    const dy = (to?.y ?? 0) - (from?.y ?? 0);
    const segmentLength = Math.hypot(dx, dy);
    const fromId = path.fromPanelId || from?.nodeId;
    const group = byParent.get(fromId) || [];
    const branchIndex = Math.max(
      0,
      group.findIndex((entry) => entry.id === path.id)
    );

    return {
      ...path,
      branchIndex,
      segmentLength,
      durationSec: Math.max(0.85, Math.min(2.6, segmentLength / 9)),
      beginSec: (path.depth || 0) * 0.16 + branchIndex * 0.24,
    };
  });
}

export function preparePowerFlowArrowSegments(paths, preview = null) {
  const supply = preview ? buildPowerSupplyFlowSegment(preview) : null;
  const combined = supply ? [supply, ...(paths || [])] : paths || [];
  return indexPowerFlowBranches(combined);
}

export function powerFlowArrowCount(segmentLength, compact = false) {
  const length = Number(segmentLength) || 0;
  if (length < (compact ? 12 : 14)) {
    return 1;
  }
  if (length < (compact ? 24 : 28)) {
    return 2;
  }
  return 3;
}

export function powerFlowMotionPathId(pathId, arrowIndex = 0) {
  const safe = String(pathId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return arrowIndex ? `pf-motion-${safe}-${arrowIndex}` : `pf-motion-${safe}`;
}
