/** @typedef {{ x: number, y: number }} Point2D */

export const TRIANGLE_CHAMFER_EDGE_RATIO = 0.14;
export const TRIANGLE_CHAMFER_MIN = 4;
export const TRIANGLE_CHAMFER_MAX = 14;

function unitVector(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return { x: 0, y: 0 };
  }
  return { x: dx / len, y: dy / len };
}

function insetCorner(corner, toward, distance) {
  const dir = unitVector(corner, toward);
  return {
    x: corner.x + dir.x * distance,
    y: corner.y + dir.y * distance,
  };
}

function edgeLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function resolveChamferDistance(corners, maxChamfer) {
  const edgeLengths = [
    edgeLength(corners[0], corners[1]),
    edgeLength(corners[1], corners[2]),
    edgeLength(corners[2], corners[0]),
  ];
  const shortest = Math.min(...edgeLengths);
  const scaled = shortest * TRIANGLE_CHAMFER_EDGE_RATIO;
  return Math.max(
    TRIANGLE_CHAMFER_MIN,
    Math.min(maxChamfer ?? TRIANGLE_CHAMFER_MAX, scaled, shortest * 0.38)
  );
}

/**
 * Clip triangle corners so shared vertices fan into separate handles per panel.
 *
 * @param {Point2D[]} corners length 3, CCW
 * @param {number} [maxChamfer]
 */
export function buildChamferedTriangleGeometry(corners, maxChamfer = TRIANGLE_CHAMFER_MAX) {
  if (!corners?.length || corners.length < 3) {
    return {
      polygon: corners || [],
      cornerHandles: corners || [],
      edgeMidpoints: [],
    };
  }

  const chamfer = resolveChamferDistance(corners, maxChamfer);
  const left = [];
  const right = [];

  for (let index = 0; index < 3; index += 1) {
    const corner = corners[index];
    const prev = corners[(index + 2) % 3];
    const next = corners[(index + 1) % 3];
    left.push(insetCorner(corner, prev, chamfer));
    right.push(insetCorner(corner, next, chamfer));
  }

  const polygon = [
    left[0],
    right[0],
    left[1],
    right[1],
    left[2],
    right[2],
  ];

  const cornerHandles = corners.map((corner, index) => ({
    x: (left[index].x + right[index].x) / 2,
    y: (left[index].y + right[index].y) / 2,
    cornerIndex: index,
    cornerX: corner.x,
    cornerY: corner.y,
  }));

  const edgeMidpoints = [0, 1, 2].map((edgeIndex) => {
    const next = (edgeIndex + 1) % 3;
    return {
      edgeIndex,
      x: (right[edgeIndex].x + left[next].x) / 2,
      y: (right[edgeIndex].y + left[next].y) / 2,
    };
  });

  return {
    polygon,
    cornerHandles,
    edgeMidpoints,
    chamfer,
  };
}

export function formatPolygonPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
