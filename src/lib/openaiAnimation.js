import {
  buildAnimationColorPatch,
  buildAnimationSwitchPatch,
  createAnimationColorStopId,
  normalizeAnimationColorStops,
  resolveAnimationColorStops,
} from "./animationColors";
import { getAnimationColorControls, getAnimationConfig, isValidAnimationId } from "./animations";
import {
  AI_GRADIENT_MODES,
  getGradientAnchorPair,
  parseBlendGradientSuggestion,
} from "./openaiGradient";
import {
  analyzeColorPrompt,
  buildPromptConstraintsSummary,
  parseAnimationFreshPaletteSuggestion,
} from "./animationPalettePrompt";

export {
  analyzeColorPrompt,
  buildPromptConstraintsSummary,
  paletteMatchesConstraints,
  synthesizePaletteFromConstraints,
} from "./animationPalettePrompt";

export const AI_ANIMATION_MODES = {
  PALETTE_BLEND: "palette_blend",
  PALETTE_FRESH: "palette_fresh",
  SETUP: "setup",
};

function clampSetting(value, fallback = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(1, Math.min(100, Math.round(num)));
}

export function adaptAnimationStopsForEffect(stops, animationId, fallbackHex = "#FFD700") {
  const config = getAnimationConfig(animationId);
  const controls = getAnimationColorControls(config);
  const normalized = normalizeAnimationColorStops(stops, fallbackHex);

  if (!controls.showSingleColor) {
    return normalized;
  }

  const color = normalized[0]?.color || fallbackHex;
  return normalizeAnimationColorStops(
    [
      { id: createAnimationColorStopId(), position: 0, color },
      { id: createAnimationColorStopId(), position: 1, color },
    ],
    color
  );
}

export function parseAnimationPaletteSuggestion(
  payload,
  settings,
  mode,
  animationId = settings?.animationId,
  mood = ""
) {
  const fallbackHex = settings?.hex || "#FFD700";
  const anchors = getGradientAnchorPair(
    resolveAnimationColorStops(settings, fallbackHex, animationId),
    fallbackHex
  );

  const stops =
    mode === AI_ANIMATION_MODES.PALETTE_FRESH
      ? parseAnimationFreshPaletteSuggestion(payload, fallbackHex, mood)
      : parseBlendGradientSuggestion(payload, fallbackHex, anchors);

  return adaptAnimationStopsForEffect(stops, animationId, fallbackHex);
}

export function parseAnimationSetupSuggestion(payload, fallbackHex = "#FFD700") {
  const animationId =
    typeof payload?.animationId === "string" ? payload.animationId.trim().toLowerCase() : "";

  if (!isValidAnimationId(animationId)) {
    throw new Error("AI returned an invalid animation effect");
  }

  const stops = adaptAnimationStopsForEffect(
    parseAnimationFreshPaletteSuggestion({ stops: payload?.stops }, fallbackHex, ""),
    animationId,
    fallbackHex
  );

  return {
    animationId,
    stops,
    speed: clampSetting(payload?.speed, 50),
    intensity: clampSetting(payload?.intensity, 50),
  };
}

export function buildAnimationAiApplyPatch(settings, setup) {
  const switchPatch = buildAnimationSwitchPatch(settings, setup.animationId);
  const merged = { ...settings, ...switchPatch };
  const colorPatch = buildAnimationColorPatch(merged, {
    animationColorStops: setup.stops,
    animationActiveColorStopId: setup.stops[0]?.id ?? null,
  });

  return {
    ...switchPatch,
    ...colorPatch,
    animationSpeed: setup.speed,
    animationIntensity: setup.intensity,
  };
}

export function buildAnimationPaletteAiPatch(settings, stops) {
  return buildAnimationColorPatch(settings, {
    animationColorStops: stops,
    animationActiveColorStopId: stops[0]?.id ?? settings?.animationActiveColorStopId ?? null,
  });
}

export { AI_GRADIENT_MODES };
