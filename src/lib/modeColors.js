import { ensureHex } from "./colorUtils";
import {
  buildAnimationSwitchPatch,
  persistCurrentAnimationColors,
} from "./animationColors";
import { ANIMATION_IDS } from "./animations";
import { COLOR_MODES } from "./colorModes";
import { normalizeGradientStops } from "./gradientStops";

function fillLedColors(hex, ledColors, ledCount) {
  const safeHex = ensureHex(hex);
  if (Array.isArray(ledColors) && ledColors.length === ledCount) {
    return ledColors.map((color) => ensureHex(color, safeHex));
  }
  return Array.from({ length: ledCount }, () => safeHex);
}

export function defaultModeColors(fallbackHex = "#FFD700") {
  const hex = ensureHex(fallbackHex);
  return {
    single: { hex },
    leds: {
      hex,
      ledPaintMode: "solid",
      ledColors: null,
      gradientStops: null,
      gradientActiveStopId: null,
      selectedLed: 0,
      selectedLeds: null,
    },
  };
}

export function normalizeModeColors(modeColors, fallbackHex = "#FFD700") {
  const hex = ensureHex(fallbackHex);
  const base = defaultModeColors(hex);

  if (!modeColors || typeof modeColors !== "object" || Array.isArray(modeColors)) {
    return base;
  }

  const leds = modeColors.leds && typeof modeColors.leds === "object" ? modeColors.leds : {};

  return {
    single: {
      hex: ensureHex(modeColors.single?.hex, hex),
    },
    leds: {
      hex: ensureHex(leds.hex, hex),
      ledPaintMode: leds.ledPaintMode === "gradient" ? "gradient" : "solid",
      ledColors: Array.isArray(leds.ledColors)
        ? leds.ledColors.map((color) => ensureHex(color, hex))
        : null,
      gradientStops: Array.isArray(leds.gradientStops)
        ? normalizeGradientStops(leds.gradientStops, hex)
        : null,
      gradientActiveStopId:
        typeof leds.gradientActiveStopId === "string" ? leds.gradientActiveStopId : null,
      selectedLed: Number.isInteger(leds.selectedLed) ? leds.selectedLed : 0,
      selectedLeds: Array.isArray(leds.selectedLeds)
        ? [...new Set(leds.selectedLeds)]
            .map((index) => Number(index))
            .filter((index) => Number.isInteger(index) && index >= 0)
        : null,
    },
  };
}

export function inferModeColorsFromSettings(settings, fallbackHex = "#FFD700") {
  const hex = ensureHex(settings?.hex, fallbackHex);
  const normalized = normalizeModeColors(settings?.modeColors, hex);
  const mode = settings?.colorMode || COLOR_MODES.SINGLE;

  if (mode === COLOR_MODES.SINGLE) {
    return {
      ...normalized,
      single: { hex },
    };
  }

  if (mode === COLOR_MODES.LEDS) {
    return {
      ...normalized,
      leds: {
        hex,
        ledPaintMode: settings.ledPaintMode === "gradient" ? "gradient" : "solid",
        ledColors: Array.isArray(settings.ledColors)
          ? settings.ledColors.map((color) => ensureHex(color, hex))
          : null,
        gradientStops: Array.isArray(settings.gradientStops)
          ? normalizeGradientStops(settings.gradientStops, hex)
          : null,
        gradientActiveStopId: settings.gradientActiveStopId ?? null,
        selectedLed: settings.selectedLed ?? 0,
        selectedLeds: Array.isArray(settings.selectedLeds) ? settings.selectedLeds : null,
      },
    };
  }

  return normalized;
}

export function persistCurrentModeColors(settings) {
  const hex = ensureHex(settings?.hex);
  const modeColors = normalizeModeColors(settings?.modeColors, hex);
  const mode = settings?.colorMode || COLOR_MODES.SINGLE;

  if (mode === COLOR_MODES.SINGLE) {
    return {
      ...modeColors,
      single: { hex },
    };
  }

  if (mode === COLOR_MODES.LEDS) {
    return {
      ...modeColors,
      leds: {
        hex,
        ledPaintMode: settings.ledPaintMode === "gradient" ? "gradient" : "solid",
        ledColors: Array.isArray(settings.ledColors)
          ? settings.ledColors.map((color) => ensureHex(color, hex))
          : null,
        gradientStops: Array.isArray(settings.gradientStops)
          ? normalizeGradientStops(settings.gradientStops, hex)
          : null,
        gradientActiveStopId: settings.gradientActiveStopId ?? null,
        selectedLed: settings.selectedLed ?? 0,
        selectedLeds: Array.isArray(settings.selectedLeds) ? settings.selectedLeds : null,
      },
    };
  }

  return modeColors;
}

export function attachModeColorsSnapshot(settings, patch = {}) {
  const merged = { ...settings, ...patch };
  return {
    ...patch,
    modeColors: persistCurrentModeColors(merged),
  };
}

export function buildModeSwitchPatch(
  settings,
  nextMode,
  { ledCount = 0, defaultAnimationId = ANIMATION_IDS.RAINBOW } = {}
) {
  if (!nextMode || nextMode === settings?.colorMode) {
    return {};
  }

  const modeColors = persistCurrentModeColors(settings);
  const base = { colorMode: nextMode, modeColors };

  if (settings?.colorMode === COLOR_MODES.ANIMATION) {
    base.animationColorsById = persistCurrentAnimationColors(settings);
  }

  if (nextMode === COLOR_MODES.SINGLE) {
    return {
      ...base,
      hex: ensureHex(modeColors.single?.hex, settings?.hex),
      selectedLeds: null,
    };
  }

  if (nextMode === COLOR_MODES.LEDS) {
    const leds = modeColors.leds || defaultModeColors(settings?.hex).leds;
    const hex = ensureHex(leds.hex, settings?.hex);
    const selectedLed = leds.selectedLed ?? 0;
    const selectedLeds =
      Array.isArray(leds.selectedLeds) && leds.selectedLeds.length > 0
        ? leds.selectedLeds
        : [selectedLed];

    return {
      ...base,
      hex,
      ledPaintMode: leds.ledPaintMode || "solid",
      ledColors: ledCount
        ? fillLedColors(hex, leds.ledColors, ledCount)
        : leds.ledColors,
      gradientStops: leds.gradientStops,
      gradientActiveStopId: leds.gradientActiveStopId,
      selectedLed,
      selectedLeds,
    };
  }

  if (nextMode === COLOR_MODES.ANIMATION) {
    const animationId = settings?.animationId || defaultAnimationId;
    const animPatch = buildAnimationSwitchPatch(
      {
        ...settings,
        ...base,
      },
      animationId
    );

    return {
      ...base,
      ...animPatch,
      selectedLeds: null,
    };
  }

  if (nextMode === COLOR_MODES.SCREEN) {
    return {
      ...base,
      selectedLeds: null,
    };
  }

  return base;
}
