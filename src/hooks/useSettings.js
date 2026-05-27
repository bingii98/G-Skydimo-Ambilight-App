import { useCallback, useEffect, useState } from "react";
import { HISTORY_KEY, MAX_HISTORY, SETTINGS_KEY } from "../lib/constants";
import { sanitizeSettings } from "../lib/settingsSanitize";
import { skydimo } from "../lib/skydimoApi";

const DEFAULT_SETTINGS = {
  hex: "#FFD700",
  brightness: 100,
  livePreview: true,
  runInTray: false,
  launchAtStartup: false,
  colorMode: "single",
  selectedLed: 0,
  selectedLeds: null,
  ledColors: null,
  zoneRotation: 0,
  orientationConfirmed: false,
  stripCounts: null,
  stripOrigin: "bottom-left",
  stripDirection: "cw",
  ledPaintMode: "solid",
  gradientStops: null,
  gradientActiveStopId: null,
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
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      localStorage.removeItem(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS };
    }
    const { ledCount: _ledCount, ...rest } = parsed;
    return sanitizeSettings({ ...DEFAULT_SETTINGS, ...rest }, DEFAULT_SETTINGS);
  } catch (error) {
    console.warn("Resetting corrupted Skydimo settings", error);
    localStorage.removeItem(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS };
  }
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [history, setHistory] = useState(loadHistory);

  const saveSettings = useCallback((next) => {
    setSettings((current) => {
      const merged = sanitizeSettings(
        { ...current, ...next, savedAt: new Date().toISOString() },
        DEFAULT_SETTINGS
      );
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      skydimo.setAppBehavior({
        runInTray: merged.runInTray,
        launchAtStartup: merged.launchAtStartup,
      });
      return merged;
    });
  }, []);

  const addHistory = useCallback((hex) => {
    if (typeof hex !== "string") {
      return;
    }
    const normalized = hex.toUpperCase();
    setHistory((current) => {
      const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  useEffect(() => {
    skydimo.setAppBehavior({
      runInTray: settings.runInTray,
      launchAtStartup: settings.launchAtStartup,
    });
  }, [settings.runInTray, settings.launchAtStartup]);

  return {
    settings,
    history,
    saveSettings,
    addHistory,
    clearHistory,
  };
}
