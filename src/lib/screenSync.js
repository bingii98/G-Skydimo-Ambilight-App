import { getLedMap } from "./ledLayout";
import { rgbToHex, scaledRgb } from "./colorUtils";

export const SCREEN_SYNC_TICK_MS = 66;
/** Light smoothing default when the user has not customized it. */
export const SCREEN_SYNC_SMOOTHING = 18;
/** Extra saturation applied after sampling so LEDs match perceived screen edge. */
export const SCREEN_SYNC_EDGE_MATCH = 0.42;

export const SCREEN_SYNC_REGIONS = {
  EDGE: "edge",
  WIDE: "wide",
  FULL: "full",
  CENTER: "center",
};

export const SCREEN_SYNC_REGION_PROFILES = {
  [SCREEN_SYNC_REGIONS.EDGE]: {
    tickMs: 50,
    smoothing: 0,
    edgeMatch: 0,
    pickVivid: false,
    borderPinned: true,
    pickDarkest: true,
    clampBlack: true,
    inwardPercent: 5,
  },
  [SCREEN_SYNC_REGIONS.WIDE]: {
    tickMs: 66,
    smoothing: 18,
    edgeMatch: 0.32,
    pickVivid: true,
    borderPinned: true,
    pickDarkest: false,
    clampBlack: true,
    inwardPercent: 8,
  },
  [SCREEN_SYNC_REGIONS.FULL]: {
    tickMs: 75,
    smoothing: 22,
    edgeMatch: 0.24,
    pickVivid: false,
    borderPinned: false,
    patchRadius: 2,
    clampBlack: false,
  },
  [SCREEN_SYNC_REGIONS.CENTER]: {
    tickMs: 90,
    smoothing: 15,
    edgeMatch: 0.18,
    singleSample: true,
    patchRadius: 3,
    clampBlack: false,
  },
};

export const SCREEN_SYNC_REGION_OPTIONS = [
  {
    id: SCREEN_SYNC_REGIONS.EDGE,
    label: "Screen edge",
    description: "Border band at 5% inset, real-time response",
  },
  {
    id: SCREEN_SYNC_REGIONS.WIDE,
    label: "Wide edge",
    description: "Deeper border band with vivid boost",
  },
  {
    id: SCREEN_SYNC_REGIONS.FULL,
    label: "Full screen",
    description: "Zone patches with smooth blending",
  },
  {
    id: SCREEN_SYNC_REGIONS.CENTER,
    label: "Center",
    description: "One center sample for all LEDs",
  },
];

const VALID_SCREEN_SYNC_REGIONS = new Set(Object.values(SCREEN_SYNC_REGIONS));

export function resolveScreenSyncRegion(settings) {
  const value = settings?.screenSyncRegion;
  return VALID_SCREEN_SYNC_REGIONS.has(value) ? value : SCREEN_SYNC_REGIONS.EDGE;
}

export function isScreenSyncActive(settings) {
  return settings?.colorMode === "screen";
}

export function resolveScreenSyncProfile(region) {
  return (
    SCREEN_SYNC_REGION_PROFILES[region] ||
    SCREEN_SYNC_REGION_PROFILES[SCREEN_SYNC_REGIONS.EDGE]
  );
}

export function resolveScreenSyncSmoothing(settings) {
  const value = Number(settings?.screenSyncSmoothing);
  if (Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  return SCREEN_SYNC_SMOOTHING;
}

export function resolveScreenSyncTickMs(settings) {
  const region = resolveScreenSyncRegion(settings);
  return resolveScreenSyncProfile(region).tickMs || SCREEN_SYNC_TICK_MS;
}

export function resolveLedEdgeSide(ledMap, index) {
  const [x, y] = ledMap?.points?.[index] || ledMap?.points?.[0] || [0, 0];
  const gridW = Math.max(1, (ledMap?.width || 1) - 1);
  const gridH = Math.max(1, (ledMap?.height || 1) - 1);
  if (y === 0) return "top";
  if (y === gridH) return "bottom";
  if (x === 0) return "left";
  if (x === gridW) return "right";
  return null;
}

export function createScreenSyncPlan({ deviceModel, ledCount, settings }) {
  const count = Math.max(0, Number(ledCount) || 0);
  const region = resolveScreenSyncRegion(settings);
  const baseProfile = resolveScreenSyncProfile(region);
  const profile = {
    ...baseProfile,
    smoothing: resolveScreenSyncSmoothing(settings),
  };
  const ledMap = getLedMap(deviceModel, count, settings?.zoneRotation ?? 0, settings);
  const points =
    buildScreenSamplePoints(ledMap, count, { region }) ||
    Array.from({ length: count }, (_, index) => ({
      x: index / Math.max(1, count - 1),
      y: 0.5,
    }));
  const edgeSides = profile.borderPinned
    ? Array.from({ length: count }, (_, index) => resolveLedEdgeSide(ledMap, index))
    : null;

  return {
    region,
    profile,
    ledMap,
    points,
    edgeSides,
    brightness: settings?.brightness ?? 100,
  };
}

export function areScreenSyncPixelsEqual(previous, next) {
  if (!previous || !next || previous.length !== next.length) {
    return false;
  }
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

export function areScreenSyncHexesEqual(previous, next) {
  if (!previous || !next || previous.length !== next.length) {
    return false;
  }
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) {
      return false;
    }
  }
  return true;
}

/** Scale capture buffer down while preserving the monitor's native aspect ratio. */
export function resolveCaptureCanvasSize(screenWidth, screenHeight, maxEdge = 1920) {
  const width = Math.max(1, Math.round(Number(screenWidth) || 1920));
  const height = Math.max(1, Math.round(Number(screenHeight) || 1080));
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round((height * targetWidth) / width));

  return {
    screenWidth: width,
    screenHeight: height,
    width: targetWidth,
    height: targetHeight,
  };
}

const NEAR_BLACK_THRESHOLD = 32;

export function isNearBlack(r, g, b, threshold = NEAR_BLACK_THRESHOLD) {
  const max = Math.max(r, g, b);
  if (max > threshold) {
    return false;
  }
  return Math.abs(r - g) <= 10 && Math.abs(g - b) <= 10;
}

function readPixel(data, width, height, x, y) {
  const px = Math.max(0, Math.min(width - 1, x));
  const py = Math.max(0, Math.min(height - 1, y));
  const offset = (py * width + px) * 4;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
}

function pickVivid(samples) {
  return samples.reduce((best, sample) => {
    const bestScore = colorVividness(best.r, best.g, best.b);
    const sampleScore = colorVividness(sample.r, sample.g, sample.b);
    return sampleScore > bestScore ? sample : best;
  });
}

function averageRgb(samples) {
  if (!samples.length) {
    return { r: 0, g: 0, b: 0 };
  }
  let r = 0;
  let g = 0;
  let b = 0;
  for (const sample of samples) {
    r += sample.r;
    g += sample.g;
    b += sample.b;
  }
  const count = samples.length;
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function selectDarkestSample(samples) {
  return samples.reduce((best, sample) => {
    const bestScore = Math.max(best.r, best.g, best.b);
    const sampleScore = Math.max(sample.r, sample.g, sample.b);
    return sampleScore < bestScore ? sample : best;
  });
}

/** Pin samples to the captured frame border for the LED's physical edge. */
export function sampleBorderPinnedColor(imageData, point, edgeSide, options = {}) {
  const { data, width, height } = imageData;
  const cx = Math.round(point.x * (width - 1));
  const cy = Math.round(point.y * (height - 1));
  const inwardPixels = Math.max(
    0,
    Math.round((Math.min(width, height) * (options.inwardPercent || 0)) / 100)
  );
  const pickDarkest = options.pickDarkest === true;
  const pickVividColor = options.pickVivid === true;
  const samples = [];

  if (edgeSide === "top") {
    const row = Math.min(height - 1, inwardPixels);
    for (let dx = -2; dx <= 2; dx += 1) {
      samples.push(readPixel(data, width, height, cx + dx, row));
    }
  } else if (edgeSide === "bottom") {
    const row = Math.max(0, height - 1 - inwardPixels);
    for (let dx = -2; dx <= 2; dx += 1) {
      samples.push(readPixel(data, width, height, cx + dx, row));
    }
  } else if (edgeSide === "left") {
    const col = Math.min(width - 1, inwardPixels);
    for (let dy = -2; dy <= 2; dy += 1) {
      samples.push(readPixel(data, width, height, col, cy + dy));
    }
  } else if (edgeSide === "right") {
    const col = Math.max(0, width - 1 - inwardPixels);
    for (let dy = -2; dy <= 2; dy += 1) {
      samples.push(readPixel(data, width, height, col, cy + dy));
    }
  } else {
    samples.push(readPixel(data, width, height, cx, cy));
  }

  const chosen = pickDarkest
    ? selectDarkestSample(samples)
    : pickVividColor
      ? pickVivid(samples)
      : averageRgb(samples);

  if (options.clampBlack !== false && isNearBlack(chosen.r, chosen.g, chosen.b)) {
    return { r: 0, g: 0, b: 0 };
  }
  return chosen;
}

/** @deprecated Use sampleBorderPinnedColor */
export function sampleFaithfulEdgeColor(imageData, point, ledMap, ledIndex) {
  const edgeSide = resolveLedEdgeSide(ledMap, ledIndex);
  return sampleBorderPinnedColor(imageData, point, edgeSide, {
    inwardPercent: 0,
    pickDarkest: true,
    clampBlack: true,
  });
}

function samplePatchColor(imageData, point, radius = 1) {
  const { data, width, height } = imageData;
  const cx = Math.round(point.x * (width - 1));
  const cy = Math.round(point.y * (height - 1));
  const samples = [];

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      samples.push(readPixel(data, width, height, cx + dx, cy + dy));
    }
  }

  return averageRgb(samples);
}

function processSampleColor(sampled, prev, profile) {
  if (profile.clampBlack && isNearBlack(sampled.r, sampled.g, sampled.b) && profile.smoothing < 15) {
    return { r: 0, g: 0, b: 0 };
  }

  if (!profile.smoothing && !profile.edgeMatch) {
    return { ...sampled };
  }

  const matched = profile.edgeMatch
    ? matchEdgeColorForLed(sampled.r, sampled.g, sampled.b, profile.edgeMatch)
    : { ...sampled };
  const blended = profile.smoothing ? smoothRgb(prev, matched, profile.smoothing) : matched;
  return profile.edgeMatch
    ? matchEdgeColorForLed(blended.r, blended.g, blended.b, profile.edgeMatch * 0.55)
    : blended;
}

/** Pick a shallow inward sample depth so colors stay near the screen border. */
export function resolveAutoSampleDepthPercent(ledMap) {
  if (!ledMap) {
    return 4;
  }

  const perimeter = (ledMap.width || 0) + (ledMap.height || 0);
  if (perimeter <= 16) {
    return 3;
  }
  if (perimeter <= 24) {
    return 2.5;
  }
  return 2;
}

/** Normalized sample coordinates (0–1) per LED, pulled slightly inward from the bezel. */
export function buildScreenSamplePoints(ledMap, ledCount, options = {}) {
  if (!ledMap?.points?.length || !ledCount) {
    return null;
  }

  const region = options.region || SCREEN_SYNC_REGIONS.EDGE;
  const depth = resolveAutoSampleDepthPercent(ledMap);
  const wideDepth = Math.max(depth, 8);
  const appliedDepth =
    typeof options.depthPercent === "number" && Number.isFinite(options.depthPercent)
      ? Math.max(0.01, Math.min(0.12, options.depthPercent / 100))
      : Math.max(
          0.01,
          Math.min(0.12, (region === SCREEN_SYNC_REGIONS.WIDE ? wideDepth : depth) / 100)
        );

  const gridW = Math.max(1, ledMap.width - 1);
  const gridH = Math.max(1, ledMap.height - 1);
  const centerX = gridW / 2;
  const centerY = gridH / 2;

  const points = [];
  for (let index = 0; index < ledCount; index += 1) {
    const [x, y] = ledMap.points[index] || ledMap.points[0] || [0, 0];
    const nx = x / gridW;
    const ny = y / gridH;

    if (region === SCREEN_SYNC_REGIONS.EDGE) {
      points.push({ x: nx, y: ny });
      continue;
    }

    if (region === SCREEN_SYNC_REGIONS.CENTER) {
      points.push({ x: 0.5, y: 0.5 });
      continue;
    }

    if (region === SCREEN_SYNC_REGIONS.FULL) {
      points.push({
        x: nx + (0.5 - nx) * 0.42,
        y: ny + (0.5 - ny) * 0.42,
      });
      continue;
    }

    points.push({
      x: nx + (centerX / gridW - nx) * appliedDepth,
      y: ny + (centerY / gridH - ny) * appliedDepth,
    });
  }

  return points;
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));

  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { h: hue, s: sat, l: light };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

export function adjustSaturation(r, g, b, amount = 0) {
  if (!amount) {
    return { r, g, b };
  }
  const { h, s, l } = rgbToHsl(r, g, b);
  const nextS = Math.max(0, Math.min(1, s * (1 + amount)));
  return hslToRgb(h, nextS, l);
}

/** Stretch RGB away from gray so captured frames match saturated monitor edges. */
export function boostChromaFromGray(r, g, b, amount = 0) {
  if (!amount) {
    return { r, g, b };
  }
  const mix = Math.max(0, Math.min(1, amount));
  const avg = (r + g + b) / 3;
  const stretch = (channel) => Math.round(Math.max(0, Math.min(255, avg + (channel - avg) * (1 + mix))));
  return { r: stretch(r), g: stretch(g), b: stretch(b) };
}

/** Nudge sampled colors toward the vivid edge users see on the monitor. */
export function matchEdgeColorForLed(r, g, b, amount = SCREEN_SYNC_EDGE_MATCH) {
  if (isNearBlack(r, g, b)) {
    return { r, g, b };
  }
  const chromaBoosted = boostChromaFromGray(r, g, b, amount * 0.85);
  const { h, s, l } = rgbToHsl(chromaBoosted.r, chromaBoosted.g, chromaBoosted.b);
  const satBoost = Math.max(0, Math.min(1, amount));
  const nextS = Math.min(1, s + (1 - s) * satBoost);
  const nextL = Math.min(1, l + (1 - l) * (satBoost * 0.55));
  return hslToRgb(h, nextS, nextL);
}

function colorVividness(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max - min + max * 0.12;
}

export function smoothRgb(prev, next, smoothing = SCREEN_SYNC_SMOOTHING) {
  if (!prev) {
    return { ...next };
  }

  const alpha = Math.max(0, Math.min(0.95, smoothing / 100));

  if (smoothing < 15 && isNearBlack(next.r, next.g, next.b)) {
    return { ...next };
  }

  let dynamicAlpha = alpha;
  if (smoothing < 45) {
    const delta = Math.abs(next.r - prev.r) + Math.abs(next.g - prev.g) + Math.abs(next.b - prev.b);
    dynamicAlpha =
      delta > 60
        ? Math.min(alpha, 0.08)
        : delta > 30
          ? Math.min(alpha, 0.14)
          : Math.min(alpha, 0.35);
  }

  return {
    r: Math.round(prev.r * dynamicAlpha + next.r * (1 - dynamicAlpha)),
    g: Math.round(prev.g * dynamicAlpha + next.g * (1 - dynamicAlpha)),
    b: Math.round(prev.b * dynamicAlpha + next.b * (1 - dynamicAlpha)),
  };
}

export function sampleColorsFromImage(imageData, samplePoints, options = {}) {
  if (!imageData?.data || !samplePoints?.length) {
    return [];
  }

  const profile = options.profile;
  const edgeSides = options.edgeSides;
  const pickVivid = profile?.pickVivid ?? options.pickVivid !== false;
  const { data, width, height } = imageData;
  const colors = [];

  for (let index = 0; index < samplePoints.length; index += 1) {
    const point = samplePoints[index];

    if (profile?.borderPinned && edgeSides?.[index]) {
      colors.push(
        sampleBorderPinnedColor(imageData, point, edgeSides[index], {
          inwardPercent: profile.inwardPercent || 0,
          pickDarkest: profile.pickDarkest === true,
          pickVivid: profile.pickVivid === true,
          clampBlack: profile.clampBlack !== false,
        })
      );
      continue;
    }

    if (profile?.patchRadius) {
      colors.push(samplePatchColor(imageData, point, profile.patchRadius));
      continue;
    }

    const cx = Math.max(0, Math.min(width - 1, Math.round(point.x * (width - 1))));
    const cy = Math.max(0, Math.min(height - 1, Math.round(point.y * (height - 1))));

    const centerOffset = (cy * width + cx) * 4;
    const center = {
      r: data[centerOffset],
      g: data[centerOffset + 1],
      b: data[centerOffset + 2],
    };

    if (!pickVivid || isNearBlack(center.r, center.g, center.b)) {
      colors.push(center);
      continue;
    }

    let best = center;
    let bestScore = colorVividness(center.r, center.g, center.b);

    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const px = Math.max(0, Math.min(width - 1, cx + dx));
        const py = Math.max(0, Math.min(height - 1, cy + dy));
        const offset = (py * width + px) * 4;
        const candidate = { r: data[offset], g: data[offset + 1], b: data[offset + 2] };
        const score = colorVividness(candidate.r, candidate.g, candidate.b);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }

    colors.push(best);
  }

  return colors;
}

function writeScreenSyncOutput(output, index, brightness, pixels, colors, hexes) {
  colors.push(output);
  const { r, g, b } = scaledRgb(rgbToHex(output.r, output.g, output.b), brightness);
  const offset = index * 3;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  hexes.push(rgbToHex(output.r, output.g, output.b));
}

export function buildScreenSyncPixels({
  imageData,
  ledCount,
  deviceModel,
  settings,
  previousColors = null,
  samplePoints = null,
  plan = null,
}) {
  const count = Math.max(0, Number(ledCount) || 0);
  const pixels = new Uint8Array(count * 3);
  if (!count || !imageData) {
    return { pixels, colors: [], hexes: [] };
  }

  const syncPlan =
    plan ||
    createScreenSyncPlan({
      deviceModel,
      ledCount: count,
      settings,
    });
  const { profile, points: planPoints, edgeSides, brightness } = syncPlan;
  const points = samplePoints || planPoints;
  const prev = Array.isArray(previousColors) ? previousColors : [];
  const colors = [];
  const hexes = [];

  if (profile.singleSample) {
    const sampled = samplePatchColor(imageData, points[0] || { x: 0.5, y: 0.5 }, profile.patchRadius || 1);
    const output = processSampleColor(sampled, prev[0], profile);
    for (let index = 0; index < count; index += 1) {
      writeScreenSyncOutput(output, index, brightness, pixels, colors, hexes);
    }
    return { pixels, colors, hexes };
  }

  const raw = sampleColorsFromImage(imageData, points, {
    profile,
    edgeSides,
    pickVivid: profile.pickVivid !== false,
  });

  for (let index = 0; index < count; index += 1) {
    const sampled = raw[index] || raw[0] || { r: 0, g: 0, b: 0 };
    const output = processSampleColor(sampled, prev[index], profile);
    writeScreenSyncOutput(output, index, brightness, pixels, colors, hexes);
  }

  return { pixels, colors, hexes };
}
