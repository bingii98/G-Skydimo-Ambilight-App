import { ensureHex } from "./colorUtils";
import { buildAnimationColorPatch, normalizeAnimationColorsById } from "./animationColors";
import { migrateAnimationId } from "./animationCatalog";
import { isValidAnimationId } from "./animations";
import { normalizeGradientStops, resolveGradientStops } from "./gradientStops";
import {
  normalizeStripCounts,
  normalizeStripDirection,
  normalizeStripOrigin,
  STRIP_SIDES,
} from "./zoneLayout";
import { normalizeColorSchemePreference } from "../theme/colorScheme";
import { COLOR_MODES } from "./colorModes";
import { inferModeColorsFromSettings, normalizeModeColors } from "./modeColors";

const VALID_COLOR_MODES = new Set(["single", "leds", "animation", "screen"]);
const VALID_PAINT_MODES = new Set(["solid", "gradient"]);

export function sanitizeSettings(settings, defaults = {}) {
  const base = {
    hex: "#FFD700",
    brightness: 100,
    livePreview: true,
    colorMode: "single",
    ledPaintMode: "solid",
    ...defaults,
    ...(settings && typeof settings === "object" ? settings : {}),
  };

  try {
    const fallbackHex = ensureHex(base.hex);
    const next = { ...base, hex: fallbackHex };

    if ("activeZone" in next) {
      delete next.activeZone;
    }

    if (next.studioTab === "animation") {
      next.colorMode = "animation";
    }
    delete next.studioTab;

    if (!VALID_COLOR_MODES.has(next.colorMode)) {
      next.colorMode = next.colorMode === "zones" ? "leds" : defaults.colorMode || "single";
    }

    if (!VALID_PAINT_MODES.has(next.ledPaintMode)) {
      next.ledPaintMode = "solid";
    }

    next.brightness = Math.max(0, Math.min(100, Number(next.brightness) || 100));
    next.zoneRotation = [0, 90, 180, 270].includes(Number(next.zoneRotation))
      ? Number(next.zoneRotation)
      : 0;

    if (next.stripCounts && typeof next.stripCounts === "object") {
      const counts = {};
      for (const side of STRIP_SIDES) {
        const value = Math.round(Number(next.stripCounts[side]));
        counts[side] = Number.isFinite(value) && value >= 0 ? value : 0;
      }
      next.stripCounts = counts;
    } else {
      next.stripCounts = null;
    }

    next.stripOrigin = normalizeStripOrigin(next.stripOrigin);
    next.stripDirection = normalizeStripDirection(next.stripDirection);

    next.orientationConfirmed = Boolean(next.orientationConfirmed);
    if (
      !next.orientationConfirmed &&
      next.stripCounts &&
      STRIP_SIDES.some((side) => (Number(next.stripCounts[side]) || 0) > 0)
    ) {
      next.orientationConfirmed = true;
    }

    if (Array.isArray(next.ledColors)) {
      next.ledColors = next.ledColors.map((color) => ensureHex(color, fallbackHex));
    } else {
      next.ledColors = null;
    }

    if (next.selectedLed == null) {
      next.selectedLed = null;
      next.selectedLeds = null;
    } else {
      if (Array.isArray(next.selectedLeds)) {
        next.selectedLeds = [...new Set(next.selectedLeds)]
          .map((index) => Number(index))
          .filter((index) => Number.isInteger(index) && index >= 0);
        if (next.selectedLeds.length === 0) {
          next.selectedLeds = null;
        }
      } else {
        next.selectedLeds = null;
      }

      next.selectedLed = Math.max(0, Number(next.selectedLed) || 0);
    }

    if (!next.gradientStops && (next.gradientFrom || next.gradientTo)) {
      next.gradientStops = normalizeGradientStops(
        [
          { id: "legacy-top", position: 0, color: next.gradientFrom || fallbackHex },
          { id: "legacy-bottom", position: 1, color: next.gradientTo || "#FF0066" },
        ],
        fallbackHex
      );
    }

    if (next.gradientStops || next.ledPaintMode === "gradient") {
      next.gradientStops = normalizeGradientStops(
        next.gradientStops || resolveGradientStops(next, fallbackHex),
        fallbackHex
      );

      const activeExists = next.gradientStops.some((stop) => stop.id === next.gradientActiveStopId);
      if (!activeExists) {
        if (next.gradientActiveStop === "to" && next.gradientStops[1]?.id) {
          next.gradientActiveStopId = next.gradientStops[1].id;
        } else {
          next.gradientActiveStopId = next.gradientStops[0]?.id ?? null;
        }
      }
    } else {
      next.gradientStops = null;
      next.gradientActiveStopId = null;
    }

    delete next.gradientFrom;
    delete next.gradientTo;
    delete next.gradientActiveStop;

    next.modeColors = next.modeColors
      ? normalizeModeColors(next.modeColors, fallbackHex)
      : inferModeColorsFromSettings(next, fallbackHex);

    if (next.colorMode === COLOR_MODES.SINGLE) {
      if (next.modeColors.single?.hex) {
        next.hex = ensureHex(next.modeColors.single.hex, fallbackHex);
      }
      next.modeColors = {
        ...next.modeColors,
        single: { hex: next.hex },
      };
    }

    if (next.colorMode === COLOR_MODES.LEDS) {
      next.modeColors = {
        ...next.modeColors,
        leds: {
          hex: ensureHex(next.hex, fallbackHex),
          ledPaintMode: next.ledPaintMode,
          ledColors: next.ledColors,
          gradientStops: next.gradientStops,
          gradientActiveStopId: next.gradientActiveStopId,
          selectedLed: next.selectedLed ?? 0,
          selectedLeds: next.selectedLeds,
        },
      };
    }

    next.livePreview = true;
    next.launchAtStartup = Boolean(next.launchAtStartup);
    next.colorScheme = normalizeColorSchemePreference(
      next.colorScheme,
      defaults.colorScheme || "system"
    );
    delete next.restoreOnLaunch;
    next.openaiApiKey =
      typeof next.openaiApiKey === "string" ? next.openaiApiKey.trim() : "";

    next.animationSpeed = Math.max(1, Math.min(100, Number(next.animationSpeed) || 50));
    next.animationIntensity = Math.max(1, Math.min(100, Number(next.animationIntensity) || 50));
    next.animationSecondaryHex = ensureHex(next.animationSecondaryHex, "#FF0066");
    next.animationReverse = Boolean(next.animationReverse);

    next.animationColorsById = normalizeAnimationColorsById(next.animationColorsById, fallbackHex);
    next.animationColorsById = Object.fromEntries(
      Object.entries(next.animationColorsById).flatMap(([animationId, entry]) => {
        const migratedId = migrateAnimationId(animationId);
        if (!isValidAnimationId(migratedId)) {
          return [];
        }
        return [[migratedId, entry]];
      })
    );

    if (next.animationId != null) {
      next.animationId = migrateAnimationId(next.animationId);
    }

    if (
      next.animationId &&
      isValidAnimationId(next.animationId) &&
      Array.isArray(next.animationColorStops) &&
      !next.animationColorsById[next.animationId]
    ) {
      next.animationColorsById[next.animationId] = {
        animationColorStops: normalizeGradientStops(next.animationColorStops, fallbackHex),
        animationActiveColorStopId: next.animationActiveColorStopId ?? null,
      };
    }

    if (
      next.colorMode === "animation" &&
      (Array.isArray(next.animationColorStops) || next.animationId)
    ) {
      Object.assign(next, buildAnimationColorPatch(next));
    }

    if (next.animationId != null && !isValidAnimationId(next.animationId)) {
      next.animationId = null;
    }

    next.screenSyncSourceId =
      typeof next.screenSyncSourceId === "string" && next.screenSyncSourceId.trim()
        ? next.screenSyncSourceId.trim()
        : null;

    next.screenSyncRegion = ["edge", "wide", "full", "center"].includes(next.screenSyncRegion)
      ? next.screenSyncRegion
      : "edge";

    next.screenSyncSmoothing = Math.max(
      0,
      Math.min(100, Number(next.screenSyncSmoothing ?? 18) || 18)
    );

    delete next.screenSyncSaturation;
    delete next.screenSyncDepth;

    return next;
  } catch {
    return {
      ...defaults,
      hex: ensureHex(defaults.hex),
      brightness: 100,
      livePreview: true,
      colorMode: "single",
      ledPaintMode: "solid",
      gradientStops: null,
      gradientActiveStopId: null,
      modeColors: null,
      selectedLeds: null,
      ledColors: null,
      openaiApiKey: "",
      animationId: null,
      animationSpeed: 50,
      animationSecondaryHex: "#FF0066",
      animationIntensity: 50,
      animationReverse: false,
      animationColorStops: null,
      animationActiveColorStopId: null,
      animationColorsById: null,
      screenSyncSourceId: null,
      screenSyncRegion: "edge",
      screenSyncSmoothing: 18,
      colorScheme: "system",
      stripCounts: null,
      stripOrigin: "bottom-left",
      stripDirection: "cw",
    };
  }
}
