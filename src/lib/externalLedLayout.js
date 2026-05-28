import { buildTriangleLayoutPatch } from "./externalTriangleLayout";

export const EXTERNAL_LAYOUT_KINDS = {
  STRIP: "strip",
  TRIANGLE: "triangle",
};

export const LEDS_PER_TRIANGLE = 3;

export const EXTERNAL_STRIP_PRESETS = [
  { label: "1 m · 12", meters: 1, leds: 12 },
  { label: "2 m · 24", meters: 2, leds: 24 },
  { label: "5 m · 30", meters: 5, leds: 30 },
  { label: "5 m · 60", meters: 5, leds: 60 },
  { label: "10 m · 150", meters: 10, leds: 150 },
];

export const EXTERNAL_TRIANGLE_PRESETS = [
  { label: "2 triangles · 6 LED", triangles: 2 },
  { label: "4 triangles · 12 LED", triangles: 4 },
  { label: "6 triangles · 18 LED", triangles: 6 },
  { label: "8 triangles · 24 LED", triangles: 8 },
  { label: "12 triangles · 36 LED", triangles: 12 },
];

export function sanitizeLayoutKind(value) {
  return value === EXTERNAL_LAYOUT_KINDS.TRIANGLE
    ? EXTERNAL_LAYOUT_KINDS.TRIANGLE
    : EXTERNAL_LAYOUT_KINDS.STRIP;
}

export function resolveExternalLayout(device = {}) {
  const layoutKind = sanitizeLayoutKind(device.layoutKind);
  const trianglePanels = device.trianglePanels;
  const triangleCount = Math.max(
    1,
    Math.min(
      64,
      Array.isArray(trianglePanels) && trianglePanels.length
        ? trianglePanels.length
        : Math.round(Number(device.triangleCount) || 1)
    )
  );

  if (layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE) {
    const ledCount = triangleCount * LEDS_PER_TRIANGLE;
    return {
      layoutKind,
      triangleCount,
      ledCount,
      unitLabel: `${triangleCount} triangles · ${ledCount} LED`,
      previewTitle: "Triangle layout",
    };
  }

  const ledCount = Math.max(
    1,
    Math.min(512, Math.round(Number(device.ledCount) || Number(device.stripLedCount) || 30))
  );

  return {
    layoutKind: EXTERNAL_LAYOUT_KINDS.STRIP,
    triangleCount: null,
    ledCount,
    unitLabel: `${ledCount} strip LEDs`,
    previewTitle: "Wire strip",
  };
}

export function buildExternalLayoutPatch(layoutKind, options = {}) {
  const kind = sanitizeLayoutKind(layoutKind);

  if (kind === EXTERNAL_LAYOUT_KINDS.TRIANGLE) {
    if (Array.isArray(options.trianglePanels) && options.trianglePanels.length) {
      return buildTriangleLayoutPatch(
        options.trianglePanels,
        options.triangleWire,
        options.triangleWirePanelOrder
      );
    }
    const triangleCount = Math.max(
      1,
      Math.min(64, Math.round(Number(options.triangleCount) || 4))
    );
    return {
      layoutKind: kind,
      triangleCount,
      ledCount: triangleCount * LEDS_PER_TRIANGLE,
      ledCountSource: "manual",
    };
  }

  const ledCount = Math.max(
    1,
    Math.min(512, Math.round(Number(options.ledCount) || 30))
  );
  return {
    layoutKind: kind,
    triangleCount: null,
    ledCount,
    stripLedCount: ledCount,
    ledCountSource: "manual",
  };
}

/** LED index order within one triangle: top, bottom-left, bottom-right */
export function getTriangleUnitLedIndices(triangleIndex) {
  const base = triangleIndex * LEDS_PER_TRIANGLE;
  return [base, base + 1, base + 2];
}

export function buildStripPreviewNodes(ledCount, maxVisible = 24) {
  const count = Math.max(1, Math.min(maxVisible, Math.round(Number(ledCount) || 1)));
  return Array.from({ length: count }, (_, index) => ({
    id: `strip-${index}`,
    ledIndex: index,
    x: 8 + (index / Math.max(count - 1, 1)) * 84,
    y: 50,
  }));
}

export function buildTriangleChainPreview(triangleCount, maxVisible = 8) {
  const count = Math.max(1, Math.min(maxVisible, Math.round(Number(triangleCount) || 1)));
  const width = 100;
  const step = width / Math.max(count, 1);
  const triangles = [];

  for (let index = 0; index < count; index += 1) {
    const cx = step * index + step * 0.5;
    const pointUp = index % 2 === 0;
    const apexY = pointUp ? 22 : 78;
    const baseY = pointUp ? 78 : 22;
    const leftX = cx - step * 0.34;
    const rightX = cx + step * 0.34;
    const ledIndices = getTriangleUnitLedIndices(index);

    triangles.push({
      id: `tri-${index}`,
      points: `${cx},${apexY} ${leftX},${baseY} ${rightX},${baseY}`,
      leds: [
        { id: `tri-${index}-0`, ledIndex: ledIndices[0], x: cx, y: apexY },
        { id: `tri-${index}-1`, ledIndex: ledIndices[1], x: leftX, y: baseY },
        { id: `tri-${index}-2`, ledIndex: ledIndices[2], x: rightX, y: baseY },
      ],
    });
  }

  return triangles;
}
