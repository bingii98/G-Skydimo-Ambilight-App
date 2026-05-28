import {
  computeTrianglePanelPoses,
  LOCAL_TOPOLOGY,
  transformLocalCorners,
} from "./externalTrianglePose";

export const TRIANGLE_WIRE_DIRECTIONS = {
  CW: "cw",
  CCW: "ccw",
};

export const DEFAULT_TRIANGLE_WIRE = {
  origin: { type: "corner", index: 0 },
  direction: TRIANGLE_WIRE_DIRECTIONS.CW,
};

export const LEDS_PER_TRIANGLE_PANEL = 3;

/** @typedef {{ type: 'corner'|'edge', index: number }} TriangleWirePoint */

const LOCAL_EDGES = [
  [0, 1],
  [1, 2],
  [2, 0],
];

const WORLD_POINT_EPSILON = 0.08;

export function sanitizeTriangleWire(rawWire) {
  const originType = rawWire?.origin?.type === "edge" ? "edge" : "corner";
  const originIndex = Math.max(0, Math.min(2, Math.round(Number(rawWire?.origin?.index) || 0)));
  const direction =
    rawWire?.direction === TRIANGLE_WIRE_DIRECTIONS.CCW
      ? TRIANGLE_WIRE_DIRECTIONS.CCW
      : TRIANGLE_WIRE_DIRECTIONS.CW;

  return {
    origin: { type: originType, index: originIndex },
    direction,
  };
}

export function getTriangleTopology(col, row) {
  const up = (Math.round(Number(col) || 0) + Math.round(Number(row) || 0)) % 2 === 0;
  if (up) {
    return {
      up: true,
      corners: ["apex", "bottom-left", "bottom-right"],
      edges: [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
      edgeLabels: ["left", "base", "right"],
    };
  }
  return {
    up: false,
    corners: ["top-left", "top-right", "bottom"],
    edges: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
    edgeLabels: ["top", "right", "left"],
  };
}

export function getSharedEdgeBetween(panelA, panelB) {
  const ac = Math.round(Number(panelA.col) || 0);
  const ar = Math.round(Number(panelA.row) || 0);
  const bc = Math.round(Number(panelB.col) || 0);
  const br = Math.round(Number(panelB.row) || 0);
  const dc = bc - ac;
  const dr = br - ar;
  const upA = (ac + ar) % 2 === 0;

  if (dr === 0 && dc === 1) {
    return { edgeA: 2, edgeB: 2 };
  }
  if (dr === 0 && dc === -1) {
    return { edgeA: 0, edgeB: 0 };
  }
  if (dc === 0 && dr === -1 && upA) {
    return { edgeA: 1, edgeB: 1 };
  }
  if (dc === 0 && dr === 1 && !upA) {
    return { edgeA: 1, edgeB: 1 };
  }
  return null;
}

export function resolveEffectiveWireDirection(wire, panel) {
  const direction = sanitizeTriangleWire(wire).direction;
  const flip = panel?.parentId ? Boolean(panel.join?.flip) : Boolean(panel?.pose?.flip);
  if (flip) {
    return direction === TRIANGLE_WIRE_DIRECTIONS.CCW
      ? TRIANGLE_WIRE_DIRECTIONS.CW
      : TRIANGLE_WIRE_DIRECTIONS.CCW;
  }
  return direction;
}

export function cornerVisitOrder(startCorner, direction) {
  const start = Math.max(0, Math.min(2, Math.round(Number(startCorner) || 0)));
  const sequence = direction === TRIANGLE_WIRE_DIRECTIONS.CCW ? [0, 1, 2] : [0, 2, 1];
  const startIndex = sequence.indexOf(start);
  if (startIndex === -1) {
    return sequence;
  }
  return [...sequence.slice(startIndex), ...sequence.slice(0, startIndex)];
}

function resolveEntryCorner(entry, direction, topology, incomingCorner = null) {
  if (entry.type === "corner") {
    return Math.max(0, Math.min(2, entry.index));
  }

  const edge = topology.edges[Math.max(0, Math.min(2, entry.index))];
  if (incomingCorner != null && edge.includes(incomingCorner)) {
    return incomingCorner;
  }
  return direction === TRIANGLE_WIRE_DIRECTIONS.CCW ? edge[0] : edge[1];
}

function traversePanel(entry, exitEdge, direction, topology, incomingCorner = null) {
  const startCorner = resolveEntryCorner(entry, direction, topology, incomingCorner);
  const order = cornerVisitOrder(startCorner, direction);

  if (exitEdge == null) {
    return { order, exitCorner: order[2] };
  }

  const exitCorners = new Set(topology.edges[Math.max(0, Math.min(2, exitEdge))]);
  const exitCorner = [...order].reverse().find((corner) => exitCorners.has(corner)) ?? order[2];
  return { order, exitCorner };
}

function edgeIndexForCornerPair(cornerA, cornerB) {
  for (let index = 0; index < LOCAL_EDGES.length; index += 1) {
    const edge = LOCAL_EDGES[index];
    if (edge.includes(cornerA) && edge.includes(cornerB)) {
      return index;
    }
  }
  return 0;
}

function worldPointsMatch(left, right, epsilon = WORLD_POINT_EPSILON) {
  return Math.hypot(left.x - right.x, left.y - right.y) <= epsilon;
}

function findSharedCornerPairs(prevCorners, nextCorners) {
  const pairs = [];
  for (let prevIndex = 0; prevIndex < prevCorners.length; prevIndex += 1) {
    for (let nextIndex = 0; nextIndex < nextCorners.length; nextIndex += 1) {
      if (worldPointsMatch(prevCorners[prevIndex], nextCorners[nextIndex])) {
        pairs.push({ prevIndex, nextIndex });
      }
    }
  }
  return pairs;
}

function resolveWireTransitionFromGeometry(prevPanel, nextPanel, poses) {
  const prevCorners = transformLocalCorners(poses[prevPanel.id]);
  const nextCorners = transformLocalCorners(poses[nextPanel.id]);
  if (!prevCorners?.length || !nextCorners?.length) {
    return null;
  }

  const shared = findSharedCornerPairs(prevCorners, nextCorners);
  if (shared.length >= 2) {
    const exitEdge = edgeIndexForCornerPair(shared[0].prevIndex, shared[1].prevIndex);
    const entryEdge = edgeIndexForCornerPair(shared[0].nextIndex, shared[1].nextIndex);
    return {
      entry: { type: "edge", index: entryEdge },
      exitEdge,
      joinType: "edge-edge",
    };
  }

  if (shared.length === 1) {
    return {
      entry: { type: "corner", index: shared[0].nextIndex },
      exitEdge: null,
      joinType: "corner-corner",
    };
  }

  return null;
}

function resolveWireTransition(prevPanel, nextPanel, poses = null) {
  if (nextPanel?.parentId === prevPanel?.id && nextPanel?.join) {
    const join = nextPanel.join;
    return {
      entry: join.child,
      exitEdge:
        join.parent.kind === "edge"
          ? join.parent.index
          : join.type === "corner-corner"
            ? null
            : join.parent.index,
      joinType: join.type,
    };
  }

  if (prevPanel?.parentId === nextPanel?.id && prevPanel?.join) {
    const join = prevPanel.join;
    return {
      entry: join.parent,
      exitEdge:
        join.child.kind === "edge"
          ? join.child.index
          : join.type === "corner-corner"
            ? null
            : join.child.index,
      joinType: join.type,
    };
  }

  const isParentChild =
    nextPanel?.parentId === prevPanel?.id || prevPanel?.parentId === nextPanel?.id;

  if (!isParentChild) {
    if (
      prevPanel?.col != null &&
      nextPanel?.col != null &&
      !prevPanel?.parentId &&
      !nextPanel?.parentId
    ) {
      const shared = getSharedEdgeBetween(prevPanel, nextPanel);
      if (shared) {
        return {
          entry: { type: "edge", index: shared.edgeB },
          exitEdge: shared.edgeA,
          joinType: "edge-edge",
        };
      }
    }
    return null;
  }

  if (poses) {
    const geometric = resolveWireTransitionFromGeometry(prevPanel, nextPanel, poses);
    if (geometric) {
      return geometric;
    }
  }

  if (prevPanel?.col != null && nextPanel?.col != null) {
    const shared = getSharedEdgeBetween(prevPanel, nextPanel);
    if (shared) {
      return {
        entry: { type: "edge", index: shared.edgeB },
        exitEdge: shared.edgeA,
        joinType: "edge-edge",
      };
    }
  }

  return null;
}

export function computeTriangleWireRoute(panels, rawWire, poses = null) {
  const sanitizedPanels = Array.isArray(panels) ? panels : [];
  const wire = sanitizeTriangleWire(rawWire);
  if (!sanitizedPanels.length) {
    return { wire, panels: [], anchors: [], segments: [], ledCount: 0 };
  }

  const resolvedPoses = poses || computeTrianglePanelPoses(sanitizedPanels);
  const routePanels = [];
  const segments = [];
  let previousExitCorner = null;
  let nextGlobalLed = 0;

  for (let index = 0; index < sanitizedPanels.length; index += 1) {
    const panel = sanitizedPanels[index];
    const panelDirection = resolveEffectiveWireDirection(wire, panel);
    const topology =
      panel.col != null && panel.row != null
        ? getTriangleTopology(panel.col, panel.row)
        : {
            up: true,
            corners: ["top", "bottom-left", "bottom-right"],
            edges: LOCAL_EDGES,
            edgeLabels: ["left", "bottom", "right"],
          };
    const nextPanel = sanitizedPanels[index + 1] || null;
    const prevPanel = sanitizedPanels[index - 1] || null;
    const transition = prevPanel ? resolveWireTransition(prevPanel, panel, resolvedPoses) : null;
    const transitionNext = nextPanel ? resolveWireTransition(panel, nextPanel, resolvedPoses) : null;

    let entry;
    if (index === 0) {
      entry = wire.origin;
    } else if (transition?.entry) {
      entry = transition.entry;
    } else if (panel.join?.child) {
      entry = panel.join.child;
    } else {
      entry = { type: "corner", index: 0 };
    }

    const exitEdge =
      transitionNext?.exitEdge != null
        ? transitionNext.exitEdge
        : nextPanel && panel.col != null
          ? getSharedEdgeBetween(panel, nextPanel)?.edgeA ?? null
          : null;

    const { order, exitCorner } = traversePanel(
      entry,
      exitEdge,
      panelDirection,
      topology,
      previousExitCorner
    );

    const cornerToGlobalLed = {};
    for (const cornerIndex of order) {
      cornerToGlobalLed[cornerIndex] = nextGlobalLed;
      nextGlobalLed += 1;
    }

    const globalLedIndices = order.map((cornerIndex) => cornerToGlobalLed[cornerIndex]);

    routePanels.push({
      panelIndex: routePanels.length,
      id: panel.id,
      col: panel.col,
      row: panel.row,
      topology,
      entry,
      exitEdge,
      cornerOrder: order,
      exitCorner,
      cornerToGlobalLed,
      globalLedIndices,
      join: panel.join,
    });

    if (routePanels.length === 1) {
      segments.push({
        panelIndex: 0,
        point: entry,
      });
    }

    if (nextPanel && transitionNext) {
      previousExitCorner = exitCorner;
      segments.push({
        panelIndex: routePanels.length - 1,
        point:
          transitionNext.exitEdge != null
            ? { type: "edge", index: transitionNext.exitEdge }
            : { type: "corner", index: exitCorner },
      });
    } else {
      previousExitCorner = null;
    }
  }

  return {
    wire,
    panels: routePanels,
    segments,
    ledCount: sanitizedPanels.length * LEDS_PER_TRIANGLE_PANEL,
    poses: resolvedPoses,
  };
}

export function buildWirePointSegments(
  polylinePanels,
  triangleByPanelId,
  _poses,
  wire = DEFAULT_TRIANGLE_WIRE
) {
  const sanitizedWire = sanitizeTriangleWire(wire);
  const segments = [];

  const makeCenterPoint = (triangle, panelId) => ({
    x: triangle.cx,
    y: triangle.cy,
    panelId,
    isCenter: true,
  });

  for (const panel of polylinePanels) {
    const triangle = triangleByPanelId[panel.id];
    if (!triangle?.leds?.length) {
      continue;
    }

    const centerPoint = makeCenterPoint(triangle, panel.id);
    const ledsByCorner = Object.fromEntries(
      triangle.leds.map((led) => [led.cornerIndex, led])
    );

    if (triangle.isPowerRoot && triangle.anchors?.length) {
      const entryAnchor = triangle.anchors.find(
        (anchor) =>
          anchor.type === sanitizedWire.origin.type && anchor.index === sanitizedWire.origin.index
      );
      if (entryAnchor) {
        const gap = Math.hypot(entryAnchor.x - centerPoint.x, entryAnchor.y - centerPoint.y);
        if (gap >= 0.06) {
          segments.push([
            { x: entryAnchor.x, y: entryAnchor.y, panelId: panel.id, isInlet: true },
            { ...centerPoint },
          ]);
        }
      }
    }

    for (const cornerIndex of [0, 1, 2]) {
      const led = ledsByCorner[cornerIndex];
      if (!led) {
        continue;
      }
      segments.push([
        { ...centerPoint },
        {
          x: led.x,
          y: led.y,
          ledIndex: led.ledIndex,
          panelId: panel.id,
          cornerIndex,
        },
      ]);
    }
  }

  return segments.filter((segment) => segment.length >= 2);
}

export function buildTriangleWireAnchors(points, topology) {
  const corners = points.map((point, index) => ({
    type: "corner",
    index,
    x: point.x,
    y: point.y,
    label: topology.corners[index],
  }));

  const edges = topology.edges.map((pair, index) => {
    const left = points[pair[0]];
    const right = points[pair[1]];
    return {
      type: "edge",
      index,
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
      label: topology.edgeLabels[index],
      corners: pair,
    };
  });

  return [...corners, ...edges];
}

export function isSameWirePoint(left, right) {
  if (!left || !right) {
    return false;
  }
  return left.type === right.type && left.index === right.index;
}

export function buildTriangleWirePatch(wire) {
  return {
    triangleWire: sanitizeTriangleWire(wire),
  };
}

export function getCornerDisplayLabels(topology) {
  if (topology.up) {
    return ["Top LED", "Bottom-left LED", "Bottom-right LED"];
  }
  return ["Top-left LED", "Top-right LED", "Bottom LED"];
}

export function getEdgeDisplayLabels(topology) {
  if (topology.up) {
    return ["Left edge", "Bottom edge", "Right edge"];
  }
  return ["Top edge", "Right edge", "Left edge"];
}

export function getCornerShortLabels(topology) {
  if (topology.up) {
    return ["Top", "Left", "Right"];
  }
  return ["Top-L", "Top-R", "Bottom"];
}

export function getEdgeShortLabels(topology) {
  if (topology.up) {
    return ["Left", "Bottom", "Right"];
  }
  return ["Top", "Right", "Left"];
}

export function describeWireOrigin(wire, panel) {
  const sanitized = sanitizeTriangleWire(wire);
  const topology = getTriangleTopology(panel?.col, panel?.row);
  if (sanitized.origin.type === "corner") {
    return getCornerDisplayLabels(topology)[sanitized.origin.index] || "Corner";
  }
  return getEdgeDisplayLabels(topology)[sanitized.origin.index] || "Edge";
}

export function describeWireDirection(wire) {
  return sanitizeTriangleWire(wire).direction === TRIANGLE_WIRE_DIRECTIONS.CCW
    ? "Counter-clockwise"
    : "Clockwise";
}

export function toggleTriangleWireDirection(wire) {
  const sanitized = sanitizeTriangleWire(wire);
  return {
    ...sanitized,
    direction:
      sanitized.direction === TRIANGLE_WIRE_DIRECTIONS.CCW
        ? TRIANGLE_WIRE_DIRECTIONS.CW
        : TRIANGLE_WIRE_DIRECTIONS.CCW,
  };
}

export function getOrderedTriangleLeds(triangle) {
  if (!triangle?.leds?.length) {
    return [];
  }
  return [...triangle.leds].sort((left, right) => (left.wireStep ?? 99) - (right.wireStep ?? 99));
}

export function buildSchematicTriangleLayout(topology) {
  if (topology.up) {
    return {
      points: "100,24 34,156 166,156",
      corners: [
        { x: 100, y: 24 },
        { x: 34, y: 156 },
        { x: 166, y: 156 },
      ],
      edges: [
        { x: 67, y: 90 },
        { x: 100, y: 156 },
        { x: 133, y: 90 },
      ],
      plug: { x: 100, y: 4 },
    };
  }

  return {
    points: "34,24 166,24 100,156",
    corners: [
      { x: 34, y: 24 },
      { x: 166, y: 24 },
      { x: 100, y: 156 },
    ],
    edges: [
      { x: 100, y: 24 },
      { x: 133, y: 90 },
      { x: 67, y: 90 },
    ],
    plug: { x: 18, y: 12 },
  };
}

export function buildWireSourceOptions(panel, wire) {
  const topology = getTriangleTopology(panel?.col, panel?.row);
  const layout = buildSchematicTriangleLayout(topology);
  const cornerLabels = getCornerDisplayLabels(topology);
  const edgeLabels = getEdgeDisplayLabels(topology);
  const cornerShort = getCornerShortLabels(topology);
  const edgeShort = getEdgeShortLabels(topology);
  const selected = sanitizeTriangleWire(wire).origin;

  const corners = layout.corners.map((point, index) => ({
    type: "corner",
    index,
    x: point.x,
    y: point.y,
    label: cornerLabels[index],
    shortLabel: cornerShort[index],
    selected: selected.type === "corner" && selected.index === index,
  }));

  const edges = layout.edges.map((point, index) => ({
    type: "edge",
    index,
    x: point.x,
    y: point.y,
    label: edgeLabels[index],
    shortLabel: edgeShort[index],
    selected: selected.type === "edge" && selected.index === index,
  }));

  const selectedOption = [...corners, ...edges].find((option) => option.selected) || corners[0];

  return {
    topology,
    layout,
    corners,
    edges,
    selectedOption,
  };
}
