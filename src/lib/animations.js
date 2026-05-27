import {
  getAnimationPrimaryColor,
  getAnimationSecondaryColor,
  orderedAnimationColors,
  pickAnimationPaletteColor,
  resolveAnimationColorStops,
  sampleAnimationColor,
  ANIMATION_PALETTE,
} from "./animationColors";
import { buildAnimationPerimeterPhases } from "./animationSpatial";
import { ensureHex, interpolateHex, rgbToHex, scaledRgb } from "./colorUtils";
import { COLOR_MODES } from "./ledLayout";

export { ANIMATION_PALETTE } from "./animationColors";

export const ANIMATION_TICK_MS = 40;

export const ANIMATION_IDS = {
  RAINBOW: "rainbow",
  CHASE: "chase",
  BREATHE: "breathe",
  WAVE: "wave",
  SPARKLE: "sparkle",
  FIRE: "fire",
  AURORA: "aurora",
  PULSE: "pulse",
  COMET: "comet",
  STROBE: "strobe",
  BLEND: "blend",
  POLICE: "police",
  OCEAN: "ocean",
  HEARTBEAT: "heartbeat",
  SCANNER: "scanner",
  METEOR: "meteor",
  LIGHTNING: "lightning",
  LAVA: "lava",
  NEON: "neon",
  TWINKLE: "twinkle",
  SPECTRUM: "spectrum",
  FADE: "fade",
  CANDLE: "candle",
};

export const ANIMATIONS = [
  {
    id: ANIMATION_IDS.RAINBOW,
    label: "Rainbow",
    hint: "Color sweep across a palette",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.CHASE,
    label: "Chase",
    hint: "Bright dot travels along LEDs",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.BREATHE,
    label: "Breathe",
    hint: "Pulse brightness on one color",
    colorPalette: ANIMATION_PALETTE.SINGLE,
  },
  {
    id: ANIMATION_IDS.WAVE,
    label: "Wave",
    hint: "Moving palette wave",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.SPARKLE,
    label: "Sparkle",
    hint: "Random twinkles from palette colors",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.FIRE,
    label: "Fire",
    hint: "Warm flicker through palette",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.AURORA,
    label: "Aurora",
    hint: "Flowing bands through palette",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.PULSE,
    label: "Pulse",
    hint: "Ripple outward from strip center",
    colorPalette: ANIMATION_PALETTE.SINGLE,
  },
  {
    id: ANIMATION_IDS.COMET,
    label: "Comet",
    hint: "Glowing head with a fading tail",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.STROBE,
    label: "Strobe",
    hint: "Fast flash on one color",
    colorPalette: ANIMATION_PALETTE.SINGLE,
  },
  {
    id: ANIMATION_IDS.BLEND,
    label: "Blend",
    hint: "Sweep through palette colors",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.POLICE,
    label: "Police",
    hint: "Alternating palette blocks",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.OCEAN,
    label: "Ocean",
    hint: "Cool rolling palette waves",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.HEARTBEAT,
    label: "Heartbeat",
    hint: "Double-beat pulse on one color",
    colorPalette: ANIMATION_PALETTE.SINGLE,
  },
  {
    id: ANIMATION_IDS.SCANNER,
    label: "Scanner",
    hint: "Bright segment scans back and forth",
    colorPalette: ANIMATION_PALETTE.SINGLE,
  },
  {
    id: ANIMATION_IDS.METEOR,
    label: "Meteor",
    hint: "Multiple glowing trails around the strip",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.LIGHTNING,
    label: "Lightning",
    hint: "Random bright flashes from palette colors",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.LAVA,
    label: "Lava",
    hint: "Slow bubbling heat through palette",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.NEON,
    label: "Neon",
    hint: "Flickering neon bands from palette",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.TWINKLE,
    label: "Twinkle",
    hint: "Soft pulsing stars from palette",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.SPECTRUM,
    label: "Spectrum",
    hint: "Hard color bands cycling around strip",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.FADE,
    label: "Fade",
    hint: "Whole strip crossfades palette colors",
    colorPalette: ANIMATION_PALETTE.MULTI,
  },
  {
    id: ANIMATION_IDS.CANDLE,
    label: "Candle",
    hint: "Warm random flicker on one color",
    colorPalette: ANIMATION_PALETTE.SINGLE,
  },
];

const VALID_ANIMATION_IDS = new Set(ANIMATIONS.map((item) => item.id));

export function getAnimationConfig(id) {
  return ANIMATIONS.find((item) => item.id === id) ?? null;
}

export function getAnimationColorControls(config) {
  const mode = config?.colorPalette || ANIMATION_PALETTE.SINGLE;
  return {
    mode,
    showPalette: mode === ANIMATION_PALETTE.MULTI,
    showSingleColor: mode === ANIMATION_PALETTE.SINGLE,
  };
}

export function isValidAnimationId(id) {
  return typeof id === "string" && VALID_ANIMATION_IDS.has(id);
}

/** Map slider 1–100 to time multiplier (~0.01× … ~2.5×). Power curve keeps 1% very slow. */
export function animationSpeedFactor(speed = 50) {
  const clamped = Math.max(1, Math.min(100, Number(speed) || 50));
  const normalized = clamped / 100;
  const min = 0.01;
  const max = 2.5;
  return min + normalized ** 3 * (max - min);
}

/** Map slider 1–100 to effect strength (~0.1 … 1). */
export function animationIntensityFactor(intensity = 50) {
  const clamped = Math.max(1, Math.min(100, Number(intensity) || 50));
  return 0.1 + (clamped / 100) * 0.9;
}

export function animationDirection(settings) {
  return settings?.animationReverse ? -1 : 1;
}

function writePixel(pixels, index, hex, brightness) {
  const { r, g, b } = scaledRgb(hex, brightness);
  const offset = index * 3;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
}

function writeRgb(pixels, index, r, g, b) {
  const offset = index * 3;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function directedPhase(phases, index, direction) {
  const phase = phases[index] ?? 0;
  return direction > 0 ? phase : 1 - phase;
}

function phaseMix(phase, scroll = 0) {
  return wrapMix(phase + scroll);
}

function animationPhaseDistance(from, to, direction) {
  if (direction > 0) {
    let dist = to - from;
    if (dist < 0) dist += 1;
    return dist;
  }

  let dist = from - to;
  if (dist < 0) dist += 1;
  return dist;
}

function ringDistanceFromCenter(phase, center = 0.5) {
  let dist = Math.abs(phase - center);
  if (dist > 0.5) {
    dist = 1 - dist;
  }
  return dist * 2;
}

function mixHex(fromHex, toHex, amount) {
  return interpolateHex(fromHex, toHex, Math.max(0, Math.min(1, amount)));
}

function wrapMix(value) {
  const wrapped = value % 1;
  if (wrapped === 0 && value > 0) {
    return 1;
  }
  return wrapped < 0 ? wrapped + 1 : wrapped;
}


function resolvePalette(settings) {
  const stops = resolveAnimationColorStops(settings);
  const ordered = orderedAnimationColors(stops);
  return {
    stops,
    ordered,
    primary: getAnimationPrimaryColor(settings),
    secondary: getAnimationSecondaryColor(settings),
    sample: (t) => sampleAnimationColor(stops, t),
  };
}

/**
 * @param {{ animationId: string, ledCount: number, settings: object, timeMs: number, deviceModel?: string|null }} params
 * @returns {Uint8Array}
 */
export function buildAnimationPixels({ animationId, ledCount, settings, timeMs, deviceModel = null }) {
  const count = Math.max(0, Number(ledCount) || 0);
  const pixels = new Uint8Array(count * 3);
  if (!count || !isValidAnimationId(animationId)) {
    return pixels;
  }

  const brightness = settings.brightness ?? 100;
  const palette = resolvePalette(settings);
  const { primary, secondary, sample, ordered } = palette;
  const speed = animationSpeedFactor(settings.animationSpeed);
  const intensity = animationIntensityFactor(settings.animationIntensity);
  const direction = animationDirection(settings);
  const t = (timeMs / 1000) * speed;
  const perimeterPhases = buildAnimationPerimeterPhases(settings, deviceModel, count);
  const loopRate = 14 / Math.max(1, count);

  switch (animationId) {
    case ANIMATION_IDS.RAINBOW: {
      const scroll = t * (0.2 + intensity * 0.35);
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        writePixel(pixels, i, sample(phaseMix(ledPhase, scroll)), brightness);
      }
      break;
    }

    case ANIMATION_IDS.CHASE: {
      const tail = Math.max(2, Math.round(2 + intensity * 8));
      const headPhase = wrapMix(t * loopRate * direction);
      for (let i = 0; i < count; i += 1) {
        const dist = animationPhaseDistance(headPhase, perimeterPhases[i], direction) * count;
        const lit = dist < tail;
        const fade = lit ? 1 - dist / tail : 0;
        const hex = lit ? mixHex(secondary, primary, fade) : "#000000";
        writePixel(pixels, i, hex, brightness);
      }
      break;
    }

    case ANIMATION_IDS.BREATHE: {
      const floor = 0.45 - intensity * 0.35;
      const pulse = floor + (1 - floor) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      const { r, g, b } = scaledRgb(primary, brightness * pulse);
      for (let i = 0; i < count; i += 1) {
        writeRgb(pixels, i, r, g, b);
      }
      break;
    }

    case ANIMATION_IDS.WAVE: {
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        const phase = ledPhase * Math.PI * (3 + intensity * 3) + t * Math.PI * 2;
        const mix = 0.5 + 0.5 * Math.sin(phase);
        writePixel(pixels, i, sample(mix), brightness);
      }
      break;
    }

    case ANIMATION_IDS.SPARKLE: {
      const threshold = 0.95 - intensity * 0.28;
      const softThreshold = threshold - 0.08;
      for (let i = 0; i < count; i += 1) {
        const seed = i * 17.3 + Math.floor(t * (12 + intensity * 16));
        const flicker = seededRandom(seed);
        const boost = flicker > threshold ? 1 : flicker > softThreshold ? 0.55 : 0;
        const sparkHex = pickAnimationPaletteColor(palette.stops, seed + 0.37);
        const { r, g, b } = scaledRgb(sparkHex, brightness * (0.2 + boost * (0.55 + intensity * 0.25)));
        const offset = i * 3;
        pixels[offset] = Math.min(255, r + Math.round(boost * 180));
        pixels[offset + 1] = Math.min(255, g + Math.round(boost * 200));
        pixels[offset + 2] = Math.min(255, b + Math.round(boost * 220));
      }
      break;
    }

    case ANIMATION_IDS.FIRE: {
      for (let i = 0; i < count; i += 1) {
        const noise = seededRandom(i * 9.1 + Math.floor(t * (16 + intensity * 12)));
        const flicker = Math.max(0, Math.sin(t * (4 + intensity * 3) + i * 0.2)) * (0.08 + intensity * 0.12);
        const heat = Math.min(1, noise * (0.55 + intensity * 0.35) + flicker);
        writePixel(pixels, i, sample(heat), brightness);
      }
      break;
    }

    case ANIMATION_IDS.AURORA: {
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction) * count;
        const band = Math.sin(ledPhase * 0.45 + t * (1.2 + intensity * 0.8));
        const mix = 0.5 + 0.5 * band;
        const lit = 0.35 + (0.25 + intensity * 0.25) * (0.5 + 0.5 * band);
        writePixel(pixels, i, sample(mix), brightness * lit);
      }
      break;
    }

    case ANIMATION_IDS.PULSE: {
      for (let i = 0; i < count; i += 1) {
        const dist = ringDistanceFromCenter(perimeterPhases[i]);
        const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * direction - dist * Math.PI * (1.5 + intensity * 2));
        const level = 0.25 + intensity * 0.75 * Math.max(0, wave);
        writePixel(pixels, i, primary, brightness * level);
      }
      break;
    }

    case ANIMATION_IDS.COMET: {
      const tail = Math.max(3, Math.round(3 + intensity * 12));
      const headPhase = wrapMix(t * (10 / Math.max(1, count)) * direction);
      for (let i = 0; i < count; i += 1) {
        const dist = animationPhaseDistance(headPhase, perimeterPhases[i], direction) * count;
        if (dist >= tail) {
          writePixel(pixels, i, "#000000", brightness);
          continue;
        }
        const fade = 1 - dist / tail;
        const hex = mixHex(secondary, primary, fade);
        writePixel(pixels, i, hex, brightness * (0.15 + fade * (0.55 + intensity * 0.4)));
      }
      break;
    }

    case ANIMATION_IDS.STROBE: {
      const phase = t * (2 + intensity * 6) * direction;
      const on = Math.sin(phase * Math.PI * 2) > (0.15 - intensity * 0.25);
      const level = on ? 1 : 0.04;
      for (let i = 0; i < count; i += 1) {
        writePixel(pixels, i, primary, brightness * level);
      }
      break;
    }

    case ANIMATION_IDS.BLEND: {
      const scroll = t * (0.35 + intensity * 0.45);
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        const mix = 0.5 + 0.5 * Math.sin(phaseMix(ledPhase, scroll) * Math.PI * 2);
        writePixel(pixels, i, sample(mix), brightness);
      }
      break;
    }

    case ANIMATION_IDS.POLICE: {
      const block = Math.max(1, Math.round(2 - intensity));
      const colors = ordered.length > 0 ? ordered : [{ color: primary }, { color: secondary }];
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction) * count;
        const segment = Math.floor((ledPhase + t * (6 + intensity * 8)) / block);
        const color = colors[((segment % colors.length) + colors.length) % colors.length].color;
        writePixel(pixels, i, color, brightness);
      }
      break;
    }

    case ANIMATION_IDS.OCEAN: {
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction) * count;
        const swell = Math.sin(ledPhase * 0.35 + t * (1.5 + intensity));
        const mix = 0.5 + 0.5 * swell;
        const lit = 0.35 + (0.18 + intensity * 0.22) * (0.5 + 0.5 * Math.sin(ledPhase * 0.22 + t * 2.4));
        writePixel(pixels, i, sample(mix), brightness * lit);
      }
      break;
    }

    case ANIMATION_IDS.HEARTBEAT: {
      const beat = Math.max(0, Math.sin(t * Math.PI * 2));
      const bump = Math.max(0, Math.sin(t * Math.PI * 8)) * (0.15 + intensity * 0.25);
      const floor = 0.35 - intensity * 0.2;
      const pulse = floor + (1 - floor) * beat + bump;
      const { r, g, b } = scaledRgb(primary, brightness * Math.min(1, pulse));
      for (let i = 0; i < count; i += 1) {
        writeRgb(pixels, i, r, g, b);
      }
      break;
    }

    case ANIMATION_IDS.SCANNER: {
      const window = Math.max(1, Math.round(1 + intensity * 4));
      const headPhase = 0.5 + 0.5 * Math.sin(t * (2 + intensity * 2) * direction);
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        let dist = Math.abs(ledPhase - headPhase);
        if (dist > 0.5) {
          dist = 1 - dist;
        }
        const wrapDist = dist * count;
        const lit = wrapDist < window;
        const fade = lit ? 1 - wrapDist / window : 0;
        writePixel(pixels, i, primary, brightness * (0.05 + fade * (0.6 + intensity * 0.4)));
      }
      break;
    }

    case ANIMATION_IDS.METEOR: {
      const meteorCount = Math.max(1, Math.round(1 + intensity * 2));
      const tail = Math.max(2, Math.round(2 + intensity * 6));
      for (let i = 0; i < count; i += 1) {
        let level = 0;
        let color = secondary;
        for (let m = 0; m < meteorCount; m += 1) {
          const offset = m / meteorCount;
          const headPhase = wrapMix((t * loopRate * (0.8 + m * 0.15) + offset) * direction);
          const dist = animationPhaseDistance(headPhase, perimeterPhases[i], direction) * count;
          if (dist < tail) {
            const fade = 1 - dist / tail;
            const boost = fade * (0.4 + intensity * 0.5);
            if (boost > level) {
              level = boost;
              color = mixHex(secondary, primary, fade);
            }
          }
        }
        writePixel(pixels, i, color, brightness * Math.max(0.03, level));
      }
      break;
    }

    case ANIMATION_IDS.LIGHTNING: {
      for (let i = 0; i < count; i += 1) {
        const strikeSeed = Math.floor(t * (3 + intensity * 5));
        const flicker = seededRandom(i * 13.7 + strikeSeed);
        const hit = flicker > 0.92 - intensity * 0.15;
        const decay = hit ? Math.max(0, 1 - (t * 20 - Math.floor(t * 20)) * 3) : 0;
        const boltColor = pickAnimationPaletteColor(palette.stops, flicker);
        writePixel(
          pixels,
          i,
          hit ? boltColor : secondary,
          brightness * (hit ? 0.3 + decay * 0.7 : 0.04)
        );
      }
      break;
    }

    case ANIMATION_IDS.LAVA: {
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        const bubble = seededRandom(i * 7.3 + Math.floor(t * (2 + intensity)));
        const rise = Math.sin(ledPhase * Math.PI * 2 + t * (0.8 + intensity * 0.5) + bubble * 4);
        const heat = Math.min(1, Math.max(0, (rise + 1) * 0.35 + bubble * (0.25 + intensity * 0.3)));
        writePixel(pixels, i, sample(heat), brightness * (0.5 + heat * 0.5));
      }
      break;
    }

    case ANIMATION_IDS.NEON: {
      const bands = ordered.length > 0 ? ordered : [{ color: primary }, { color: secondary }];
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        const bandIndex = Math.floor(ledPhase * Math.max(2, bands.length));
        const baseColor = bands[bandIndex % bands.length].color;
        const flicker = 0.75 + 0.25 * seededRandom(i * 3.1 + Math.floor(t * (8 + intensity * 12)));
        const hum = 0.5 + 0.5 * Math.sin(t * (1 + intensity) + i * 0.4);
        writePixel(pixels, i, baseColor, brightness * flicker * hum * (0.4 + intensity * 0.45));
      }
      break;
    }

    case ANIMATION_IDS.TWINKLE: {
      for (let i = 0; i < count; i += 1) {
        const cycle = seededRandom(i * 23.1);
        const speedMul = 0.5 + cycle * (1.5 + intensity);
        const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * speedMul + cycle * Math.PI * 2);
        const starHex = pickAnimationPaletteColor(palette.stops, cycle);
        writePixel(pixels, i, starHex, brightness * (0.08 + wave * wave * (0.35 + intensity * 0.45)));
      }
      break;
    }

    case ANIMATION_IDS.SPECTRUM: {
      const bandCount = Math.max(2, Math.round(2 + intensity * 5));
      const scroll = wrapMix(t * (0.15 + intensity * 0.25) * direction);
      for (let i = 0; i < count; i += 1) {
        const ledPhase = directedPhase(perimeterPhases, i, direction);
        const shifted = wrapMix(ledPhase + scroll);
        const band = Math.floor(shifted * bandCount);
        const mix = (band + 0.5) / bandCount;
        writePixel(pixels, i, sample(mix), brightness);
      }
      break;
    }

    case ANIMATION_IDS.FADE: {
      const colors =
        ordered.length >= 2
          ? ordered.map((entry) => entry.color)
          : [primary, secondary];
      const cycle = wrapMix(t * (0.08 + intensity * 0.12) * direction);
      const idx = Math.floor(cycle * colors.length) % colors.length;
      const nextIdx = (idx + 1) % colors.length;
      const blend = (cycle * colors.length) % 1;
      const hex = mixHex(colors[idx], colors[nextIdx], blend);
      for (let i = 0; i < count; i += 1) {
        writePixel(pixels, i, hex, brightness);
      }
      break;
    }

    case ANIMATION_IDS.CANDLE: {
      for (let i = 0; i < count; i += 1) {
        const noise = seededRandom(i * 5.7 + Math.floor(t * (10 + intensity * 8)));
        const flicker = 0.82 + noise * (0.12 + intensity * 0.15);
        const sway = 0.5 + 0.5 * Math.sin(t * (3 + intensity * 2) + i * 0.05);
        writePixel(pixels, i, primary, brightness * flicker * (0.85 + sway * 0.15));
      }
      break;
    }

    default:
      break;
  }

  return pixels;
}

export function isAnimationPlaybackActive(settings) {
  return (
    settings?.colorMode === COLOR_MODES.ANIMATION &&
    isValidAnimationId(settings?.animationId)
  );
}

/** @param {Uint8Array} pixels @param {number} ledCount */
export function pixelsToLedHexes(pixels, ledCount) {
  const count = Math.max(0, Number(ledCount) || 0);
  const hexes = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    hexes[i] = rgbToHex(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }
  return hexes;
}
