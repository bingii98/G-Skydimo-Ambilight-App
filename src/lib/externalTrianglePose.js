/** @typedef {'edge-edge'|'corner-corner'|'corner-edge'} TriangleJoinType */

/** @typedef {{ kind: 'corner'|'edge', index: number, t?: number }} TriangleAnchorRef */

/**
 * @typedef {{
 *   type: TriangleJoinType,
 *   parent: TriangleAnchorRef,
 *   child: TriangleAnchorRef,
 *   rotationDeg?: number,
 *   flip?: boolean
 * }} TriangleJoin
 */

/**
 * @typedef {{
 *   id: string,
 *   parentId?: string | null,
 *   join?: TriangleJoin,
 *   pose?: { x: number, y: number, rotationDeg: number, flip: boolean },
 *   col?: number,
 *   row?: number
 * }} TrianglePanelNode
 */

export const TRIANGLE_JOIN_TYPES = {
  EDGE_EDGE: "edge-edge",
  CORNER_CORNER: "corner-corner",
  CORNER_EDGE: "corner-edge",
};

export const TRIANGLE_LAYOUT_VERSION = 3;
export const ROTATION_SNAP_DEG = 60;
export const TRIANGLE_HEIGHT = Math.sqrt(3) / 2;

export const LOCAL_TOPOLOGY = {
  corners: ["top", "bottom-left", "bottom-right"],
  edges: [
    [0, 1],
    [1, 2],
    [2, 0],
  ],
  edgeLabels: ["left", "bottom", "right"],
};

let panelIdCounter = 0;

export function createPanelId() {
  panelIdCounter += 1;
  return `p${panelIdCounter}`;
}

export function resetPanelIdCounter() {
  panelIdCounter = 0;
}

export function snapRotationDeg(deg) {
  const step = ROTATION_SNAP_DEG;
  return Math.round(deg / step) * step;
}

export function getLocalTriangleCorners(flip = false) {
  if (flip) {
    return [
      { x: 0.5, y: TRIANGLE_HEIGHT },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
  }
  return [
    { x: 0.5, y: 0 },
    { x: 0, y: TRIANGLE_HEIGHT },
    { x: 1, y: TRIANGLE_HEIGHT },
  ];
}

export function getEdgeEndpoints(corners, edgeIndex) {
  const edge = LOCAL_TOPOLOGY.edges[Math.max(0, Math.min(2, edgeIndex))];
  return [corners[edge[0]], corners[edge[1]]];
}

export function getAnchorLocalPoint(corners, anchor) {
  if (anchor.kind === "corner") {
    const index = Math.max(0, Math.min(2, anchor.index));
    return { ...corners[index] };
  }
  const [a, b] = getEdgeEndpoints(corners, anchor.index);
  const rawT = Number(anchor.t);
  const t = Number.isFinite(rawT) ? Math.max(0, Math.min(1, rawT)) : 0.5;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function rotatePoint(point, angleRad, origin = { x: 0, y: 0 }) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

function triangleCentroid(corners) {
  return {
    x: (corners[0].x + corners[1].x + corners[2].x) / 3,
    y: (corners[0].y + corners[1].y + corners[2].y) / 3,
  };
}

function transformLocalPoint(point, pose) {
  const flip = Boolean(pose.flip);
  const corners = getLocalTriangleCorners(flip);
  const center = triangleCentroid(corners);
  const angleRad = ((pose.rotationDeg || 0) * Math.PI) / 180;
  const rotated = rotatePoint(point, angleRad, center);
  return {
    x: rotated.x + (pose.x || 0),
    y: rotated.y + (pose.y || 0),
  };
}

export function transformLocalCorners(pose) {
  const flip = Boolean(pose.flip);
  const local = getLocalTriangleCorners(flip);
  return local.map((point) => transformLocalPoint(point, pose));
}

function getOrientationRef(anchor, corners) {
  if (anchor.kind === "corner") {
    return corners[(anchor.index + 1) % 3];
  }
  const edge = LOCAL_TOPOLOGY.edges[Math.max(0, Math.min(2, anchor.index))];
  return corners[edge[0]];
}

export function sanitizeAnchorRef(raw, defaultKind = "corner") {
  const kind = raw?.kind === "edge" ? "edge" : defaultKind === "edge" ? "edge" : "corner";
  const index = Math.max(0, Math.min(2, Math.round(Number(raw?.index) || 0)));
  const anchor = { kind, index };
  if (kind === "edge" && raw?.t != null) {
    anchor.t = Math.max(0, Math.min(1, Number(raw.t)));
  }
  return anchor;
}

export function sanitizeTriangleJoin(raw) {
  const type = Object.values(TRIANGLE_JOIN_TYPES).includes(raw?.type)
    ? raw.type
    : TRIANGLE_JOIN_TYPES.EDGE_EDGE;

  return {
    type,
    parent: sanitizeAnchorRef(raw?.parent, type === TRIANGLE_JOIN_TYPES.CORNER_EDGE ? "edge" : "corner"),
    child: sanitizeAnchorRef(raw?.child, "corner"),
    rotationDeg: snapRotationDeg(Number(raw?.rotationDeg) || defaultRotationForJoin(type)),
    flip: Boolean(raw?.flip),
  };
}

function defaultRotationForJoin(type) {
  if (type === TRIANGLE_JOIN_TYPES.CORNER_CORNER) {
    return 180;
  }
  return 0;
}

export function createRootPanel(id = createPanelId()) {
  return {
    id,
    pose: { x: 0, y: 0, rotationDeg: 0, flip: false },
  };
}

export function createJoinedPanel(parentId, join, id = createPanelId()) {
  return {
    id,
    parentId,
    join: sanitizeTriangleJoin(join),
  };
}

export function isLegacyGridPanel(panel) {
  return (
    panel != null &&
    (panel.col != null || panel.row != null) &&
    !panel.id &&
    !panel.parentId &&
    !panel.join
  );
}

export function sanitizeTrianglePanelNode(raw, fallbackId = createPanelId()) {
  if (isLegacyGridPanel(raw)) {
    return {
      id: fallbackId,
      col: Math.round(Number(raw.col) || 0),
      row: Math.round(Number(raw.row) || 0),
      _legacyGrid: true,
    };
  }

  const id = String(raw?.id || fallbackId);
  if (!raw?.parentId && !raw?.join) {
    return {
      id,
      pose: {
        x: Number(raw?.pose?.x) || 0,
        y: Number(raw?.pose?.y) || 0,
        rotationDeg: snapRotationDeg(Number(raw?.pose?.rotationDeg) || 0),
        flip: Boolean(raw?.pose?.flip),
      },
    };
  }

  return {
    id,
    parentId: String(raw.parentId),
    join: sanitizeTriangleJoin(raw.join),
  };
}

function computeChildPoseFromJoin(parentPose, parentWorldCorners, join) {
  const parentFlip = Boolean(parentPose.flip);
  const parentLocal = getLocalTriangleCorners(parentFlip);
  const childFlip = join.type === TRIANGLE_JOIN_TYPES.EDGE_EDGE ? !parentFlip : Boolean(join.flip);
  const childLocal = getLocalTriangleCorners(childFlip);

  const parentAnchorLocal = getAnchorLocalPoint(parentLocal, join.parent);
  const parentAnchorWorld = transformLocalPoint(parentAnchorLocal, parentPose);
  const parentRefLocal = getOrientationRef(join.parent, parentLocal);
  const parentRefWorld = transformLocalPoint(parentRefLocal, parentPose);

  const childAnchorLocal = getAnchorLocalPoint(childLocal, join.child);
  const childRefLocal = getOrientationRef(join.child, childLocal);

  const parentAngle = Math.atan2(
    parentRefWorld.y - parentAnchorWorld.y,
    parentRefWorld.x - parentAnchorWorld.x
  );
  const childAngle = Math.atan2(
    childRefLocal.y - childAnchorLocal.y,
    childRefLocal.x - childAnchorLocal.x
  );

  const extraRotRad = ((join.rotationDeg || 0) * Math.PI) / 180;
  let needed = parentAngle - childAngle + extraRotRad;
  if (join.type === TRIANGLE_JOIN_TYPES.CORNER_CORNER) {
    needed += Math.PI;
  }

  const centroid = triangleCentroid(childLocal);
  const rotatedAnchor = rotatePoint(childAnchorLocal, needed, centroid);
  return {
    x: parentAnchorWorld.x - rotatedAnchor.x,
    y: parentAnchorWorld.y - rotatedAnchor.y,
    rotationDeg: (needed * 180) / Math.PI,
    flip: childFlip,
  };
}

export function computeTrianglePanelPoses(panels) {
  const byId = Object.fromEntries(panels.map((panel) => [panel.id, panel]));
  const poses = {};

  const root = panels.find((panel) => !panel.parentId) || panels[0];
  if (!root) {
    return poses;
  }

  poses[root.id] = root.pose || { x: 0, y: 0, rotationDeg: 0, flip: false };

  const queue = [root.id];
  const visited = new Set();

  while (queue.length) {
    const parentId = queue.shift();
    if (visited.has(parentId)) {
      continue;
    }
    visited.add(parentId);
    const parentPose = poses[parentId];
    const parentCorners = transformLocalCorners(parentPose);

    for (const panel of panels) {
      if (panel.parentId !== parentId || !panel.join) {
        continue;
      }
      poses[panel.id] = computeChildPoseFromJoin(parentPose, parentCorners, panel.join);
      queue.push(panel.id);
    }
  }

  for (const panel of panels) {
    if (!poses[panel.id]) {
      poses[panel.id] = panel.pose || { x: 0, y: 0, rotationDeg: 0, flip: false };
    }
  }

  return poses;
}

export function getPanelWorldGeometry(panel, pose) {
  const worldCorners = transformLocalCorners(pose);
  const cx = (worldCorners[0].x + worldCorners[1].x + worldCorners[2].x) / 3;
  const cy = (worldCorners[0].y + worldCorners[1].y + worldCorners[2].y) / 3;

  return {
    id: panel.id,
    panel,
    pose,
    worldCorners,
    cx,
    cy,
    topology: LOCAL_TOPOLOGY,
    up: !pose.flip,
  };
}

export function buildJoinAnchorsForPanel(geometry) {
  const anchors = [];
  const { worldCorners, panel } = geometry;

  for (let index = 0; index < 3; index += 1) {
    anchors.push({
      panelId: panel.id,
      kind: "corner",
      index,
      x: worldCorners[index].x,
      y: worldCorners[index].y,
      label: LOCAL_TOPOLOGY.corners[index],
    });
  }

  for (let index = 0; index < 3; index += 1) {
    const [a, b] = getEdgeEndpoints(worldCorners, index);
    anchors.push({
      panelId: panel.id,
      kind: "edge",
      index,
      t: 0.5,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      label: LOCAL_TOPOLOGY.edgeLabels[index],
    });
  }

  return anchors;
}

export function detectJoinFromAnchors(parentAnchor, ghostAnchor) {
  if (parentAnchor.kind === "corner" && ghostAnchor.kind === "corner") {
    return {
      type: TRIANGLE_JOIN_TYPES.CORNER_CORNER,
      parent: { kind: "corner", index: parentAnchor.index },
      child: { kind: "corner", index: ghostAnchor.index },
      rotationDeg: 180,
      flip: false,
    };
  }

  if (parentAnchor.kind === "edge" && ghostAnchor.kind === "edge") {
    return {
      type: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
      parent: { kind: "edge", index: parentAnchor.index, t: parentAnchor.t },
      child: { kind: "edge", index: ghostAnchor.index, t: ghostAnchor.t },
      rotationDeg: 0,
      flip: false,
    };
  }

  if (parentAnchor.kind === "edge" && ghostAnchor.kind === "corner") {
    return {
      type: TRIANGLE_JOIN_TYPES.CORNER_EDGE,
      parent: { kind: "edge", index: parentAnchor.index, t: parentAnchor.t ?? 0.5 },
      child: { kind: "corner", index: ghostAnchor.index },
      rotationDeg: 0,
      flip: false,
    };
  }

  if (parentAnchor.kind === "corner" && ghostAnchor.kind === "edge") {
    return {
      type: TRIANGLE_JOIN_TYPES.CORNER_EDGE,
      parent: { kind: "edge", index: ghostAnchor.index, t: ghostAnchor.t ?? 0.5 },
      child: { kind: "corner", index: parentAnchor.index },
      rotationDeg: 0,
      flip: false,
    };
  }

  return {
    type: TRIANGLE_JOIN_TYPES.CORNER_CORNER,
    parent: { kind: "corner", index: parentAnchor.index ?? 0 },
    child: { kind: "corner", index: ghostAnchor.index ?? 0 },
    rotationDeg: 180,
    flip: false,
  };
}

function pointInTriangleInterior(point, corners) {
  if (!corners || corners.length < 3) {
    return false;
  }
  const [a, b, c] = corners;
  const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denom) < 1e-9) {
    return false;
  }
  const w1 = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denom;
  const w2 = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denom;
  const w3 = 1 - w1 - w2;
  const margin = 0.02;
  return w1 > margin && w2 > margin && w3 > margin;
}

function panelsMeetAtSharedCornersOnly(cornersA, cornersB, epsilon = 0.08) {
  if (countSharedWorldCorners(cornersA, cornersB, epsilon) === 0) {
    return false;
  }
  if (cornersA.some((point) => pointInTriangleInterior(point, cornersB))) {
    return false;
  }
  if (cornersB.some((point) => pointInTriangleInterior(point, cornersA))) {
    return false;
  }
  return true;
}

export function panelsLayoutHasOverlap(panels, poses = null) {
  const list = Array.isArray(panels) ? panels.filter(Boolean) : [];
  if (list.length < 2) {
    return false;
  }

  const computedPoses = poses || computeTrianglePanelPoses(list);
  const geoms = list.map((panel) => getPanelWorldGeometry(panel, computedPoses[panel.id]));

  for (let i = 0; i < geoms.length; i += 1) {
    for (let j = i + 1; j < geoms.length; j += 1) {
      const panelA = geoms[i].panel;
      const panelB = geoms[j].panel;
      const cornersA = geoms[i].worldCorners;
      const cornersB = geoms[j].worldCorners;
      const shared = countSharedWorldCorners(cornersA, cornersB, 0.08);

      if (shared >= 3) {
        return true;
      }

      if (shared >= 2) {
        continue;
      }

      const isParentChild = panelA.parentId === panelB.id || panelB.parentId === panelA.id;
      if (shared === 1 && isParentChild) {
        continue;
      }

      const centerDist = Math.hypot(geoms[i].cx - geoms[j].cx, geoms[i].cy - geoms[j].cy);
      if (shared === 0 && centerDist < 0.28) {
        return true;
      }
      if (shared === 1 && !isParentChild) {
        if (panelsMeetAtSharedCornersOnly(cornersA, cornersB, 0.08)) {
          continue;
        }
        if (centerDist < 0.22) {
          return true;
        }
      }

      if (cornersA.some((point) => pointInTriangleInterior(point, cornersB))) {
        return true;
      }
      if (cornersB.some((point) => pointInTriangleInterior(point, cornersA))) {
        return true;
      }
    }
  }

  return false;
}

function panelApexPointsUp(corners) {
  const apex = corners[0];
  return corners.every((corner, index) => index === 0 || apex.y <= corner.y + 0.02);
}

function panelApexPointsDown(corners) {
  const apex = corners[0];
  return corners.every((corner, index) => index === 0 || apex.y >= corner.y - 0.02);
}

function buildSmartJoinCandidates(parentAnchor) {
  const candidates = [];
  const parent = sanitizeAnchorRef(parentAnchor);

  if (parent.kind === "corner") {
    for (let childIndex = 0; childIndex < 3; childIndex += 1) {
      for (const rotationDeg of [0, 60, 120, 180, 240, 300]) {
        for (const flip of [false, true]) {
          candidates.push({
            type: TRIANGLE_JOIN_TYPES.CORNER_CORNER,
            parent: { kind: "corner", index: parent.index },
            child: { kind: "corner", index: childIndex },
            rotationDeg,
            flip,
          });
        }
      }
    }
    return candidates;
  }

  for (let childIndex = 0; childIndex < 3; childIndex += 1) {
    for (const rotationDeg of [0, 60, 120, 180, 240, 300]) {
      for (const flip of [false, true]) {
        candidates.push({
          type: TRIANGLE_JOIN_TYPES.CORNER_EDGE,
          parent: { kind: "edge", index: parent.index, t: parent.t ?? 0.5 },
          child: { kind: "corner", index: childIndex },
          rotationDeg,
          flip,
        });
      }
    }
  }

  for (let childEdge = 0; childEdge < 3; childEdge += 1) {
    for (const rotationDeg of [0, 60, 120, 180, 240, 300]) {
      candidates.push({
        type: TRIANGLE_JOIN_TYPES.EDGE_EDGE,
        parent: { kind: "edge", index: parent.index, t: parent.t ?? 0.5 },
        child: { kind: "edge", index: childEdge, t: 0.5 },
        rotationDeg,
        flip: false,
      });
    }
  }

  return candidates;
}

function matchesDesiredDirection(childCorners, desiredDirection) {
  if (desiredDirection === "up") {
    return panelApexPointsUp(childCorners);
  }
  if (desiredDirection === "down") {
    return panelApexPointsDown(childCorners);
  }
  return true;
}

function pickBestSmartJoin({
  candidates,
  parentPose,
  parentCorners,
  parentCentroid,
  parentAnchorWorld,
  parentAnchorRef,
  panels,
  parentPanelId,
  desiredDirection,
  preferredChildAnchor,
  enforceDirection = false,
}) {
  let bestJoin = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const join = sanitizeTriangleJoin(candidate);
    const childPose = computeChildPoseFromJoin(parentPose, parentCorners, join);
    const childCorners = transformLocalCorners(childPose);
    const childCentroid = triangleCentroid(childCorners);
    const shared = countSharedWorldCorners(parentCorners, childCorners, 0.08);

    if (shared === 0) {
      continue;
    }

    if (parentAnchorRef?.kind === "edge" && join.type === TRIANGLE_JOIN_TYPES.EDGE_EDGE && shared < 2) {
      continue;
    }

    if (enforceDirection && !matchesDesiredDirection(childCorners, desiredDirection)) {
      continue;
    }

    const trialPanels = [...panels, createJoinedPanel(parentPanelId, join, "__overlap-trial__")];
    if (panelsLayoutHasOverlap(trialPanels)) {
      continue;
    }

    const score = scoreSmartJoinCandidate({
      join,
      childCorners,
      childCentroid,
      parentCentroid,
      parentAnchorWorld,
      parentAnchorRef,
      desiredDirection,
      preferredChildAnchor,
    });

    if (score > bestScore) {
      bestScore = score;
      bestJoin = join;
    }
  }

  return bestJoin;
}

function scoreSmartJoinCandidate({
  join,
  childCorners,
  childCentroid,
  parentCentroid,
  parentAnchorWorld,
  parentAnchorRef,
  desiredDirection,
  preferredChildAnchor,
}) {
  let score = 0;
  const outwardX = childCentroid.x - parentCentroid.x;
  const outwardY = childCentroid.y - parentCentroid.y;
  const anchorX = childCentroid.x - parentAnchorWorld.x;
  const anchorY = childCentroid.y - parentAnchorWorld.y;
  const outwardLen = Math.hypot(outwardX, outwardY) || 1;
  const anchorLen = Math.hypot(anchorX, anchorY) || 1;
  score += ((outwardX / outwardLen) * (anchorX / anchorLen) + 1) * 40;

  if (parentAnchorRef?.kind === "edge" && join.type === TRIANGLE_JOIN_TYPES.EDGE_EDGE) {
    score += 90;
  }

  if (desiredDirection === "up" && panelApexPointsUp(childCorners)) {
    score += 120;
  } else if (desiredDirection === "down" && panelApexPointsDown(childCorners)) {
    score += 120;
  } else if (desiredDirection === "auto" && panelApexPointsUp(childCorners)) {
    score += 35;
  } else if (desiredDirection === "up" && panelApexPointsDown(childCorners)) {
    score -= 80;
  } else if (desiredDirection === "down" && panelApexPointsUp(childCorners)) {
    score -= 80;
  }

  if (
    join.type === TRIANGLE_JOIN_TYPES.CORNER_CORNER &&
    join.parent?.kind === "corner" &&
    join.child?.kind === "corner" &&
    join.parent.index === join.child.index
  ) {
    score -= 45;
  }

  if (preferredChildAnchor?.kind === "corner" && join.child?.kind === "corner") {
    if (join.child.index === preferredChildAnchor.index) {
      score += 18;
    }
  }

  if (join.type === TRIANGLE_JOIN_TYPES.CORNER_EDGE) {
    score += 8;
  }

  return score;
}

export function resolveSmartPanelJoin({
  parentPanelId,
  parentAnchor,
  panels,
  desiredDirection = "auto",
  preferredChildAnchor = null,
}) {
  const parentPanel = panels.find((panel) => panel.id === parentPanelId);
  if (!parentPanel || !parentAnchor) {
    return null;
  }

  const poses = computeTrianglePanelPoses(panels);
  const parentPose = poses[parentPanelId];
  if (!parentPose) {
    return null;
  }

  const parentCorners = transformLocalCorners(parentPose);
  const parentCentroid = triangleCentroid(parentCorners);
  const parentAnchorRef = sanitizeAnchorRef(parentAnchor);
  const parentAnchorLocal = getAnchorLocalPoint(
    getLocalTriangleCorners(parentPose.flip),
    parentAnchorRef
  );
  const parentAnchorWorld = transformLocalPoint(parentAnchorLocal, parentPose);
  let candidates = buildSmartJoinCandidates(parentAnchorRef);
  if (parentAnchorRef.kind === "edge") {
    candidates = candidates.filter((candidate) => candidate.type === TRIANGLE_JOIN_TYPES.EDGE_EDGE);
  }
  const pickerArgs = {
    candidates,
    parentPose,
    parentCorners,
    parentCentroid,
    parentAnchorWorld,
    parentAnchorRef,
    panels,
    parentPanelId,
    desiredDirection,
    preferredChildAnchor,
  };

  let bestJoin = null;
  if (desiredDirection === "up" || desiredDirection === "down") {
    bestJoin = pickBestSmartJoin({ ...pickerArgs, enforceDirection: true });
  }
  if (!bestJoin) {
    bestJoin = pickBestSmartJoin({ ...pickerArgs, enforceDirection: false });
  }

  if (bestJoin) {
    return bestJoin;
  }

  const fallback = detectJoinFromAnchors(
    parentAnchorRef,
    preferredChildAnchor || { kind: "corner", index: 0 }
  );
  const trialPanels = [...panels, createJoinedPanel(parentPanelId, fallback, "__fallback-trial__")];
  if (panelsLayoutHasOverlap(trialPanels)) {
    return null;
  }
  const trialPoses = computeTrianglePanelPoses(trialPanels);
  const trialParentCorners = transformLocalCorners(trialPoses[parentPanelId]);
  const fallbackPanel = trialPanels[trialPanels.length - 1];
  const trialChildCorners = transformLocalCorners(trialPoses[fallbackPanel.id]);
  if (countSharedWorldCorners(trialParentCorners, trialChildCorners, 0.08) === 0) {
    return null;
  }
  return fallback;
}

export function countSharedWorldCorners(cornersA, cornersB, epsilon = 0.08) {
  let count = 0;
  for (const a of cornersA) {
    for (const b of cornersB) {
      if (Math.hypot(a.x - b.x, a.y - b.y) <= epsilon) {
        count += 1;
      }
    }
  }
  return count;
}

export function panelsShareWorldPoint(cornersA, cornersB, epsilon = 0.08) {
  return countSharedWorldCorners(cornersA, cornersB, epsilon) > 0;
}

export function panelsShareWorldEdge(cornersA, cornersB, epsilon = 0.08) {
  return countSharedWorldCorners(cornersA, cornersB, epsilon) >= 2;
}
