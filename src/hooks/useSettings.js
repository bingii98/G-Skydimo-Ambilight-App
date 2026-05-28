import { useCallback, useEffect, useState } from "react";
import { HISTORY_KEY, MAX_HISTORY, SETTINGS_KEY } from "../lib/constants";
import { sanitizeSettings } from "../lib/settingsSanitize";
import { skydimo } from "../lib/skydimoApi";
import {
  toastStartupOutOfSync,
  toastStartupRegistrationFailed,
} from "../lib/appToast";

const DEFAULT_SETTINGS = {
  hex: "#FFD700",
  brightness: 100,
  livePreview: true,
  runInTray: false,
  launchAtStartup: false,
  colorScheme: "system",
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
  modeColors: null,
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

function persistSettings(merged) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
}

function handleBehaviorResult(result, setStartupError) {
  const reg = result?.startupRegistration;
  if (reg && reg.ok === false) {
    setStartupError(reg.error || "Failed to register Windows startup task");
    toastStartupRegistrationFailed(reg.error);
    return false;
  }
  setStartupError(null);
  return true;
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const [history, setHistory] = useState(loadHistory);
  const [startupError, setStartupError] = useState(null);

  const saveSettings = useCallback((next) => {
    let mergedSnapshot = null;
    setSettings((current) => {
      const merged = sanitizeSettings(
        { ...current, ...next, savedAt: new Date().toISOString() },
        DEFAULT_SETTINGS
      );
      persistSettings(merged);
      mergedSnapshot = merged;
      return merged;
    });

    if (mergedSnapshot) {
      Promise.resolve(
        skydimo.setAppBehavior({
          runInTray: mergedSnapshot.runInTray,
          launchAtStartup: mergedSnapshot.launchAtStartup,
        })
      )
        .then((result) => handleBehaviorResult(result, setStartupError))
        .catch((err) => {
          setStartupError(err?.message || "Could not contact main process");
          toastStartupRegistrationFailed(err?.message);
        });
    }
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
    let cancelled = false;

    Promise.resolve(
      skydimo.setAppBehavior({
        runInTray: settings.runInTray,
        launchAtStartup: settings.launchAtStartup,
      })
    )
      .then((result) => {
        if (cancelled) return;
        handleBehaviorResult(result, setStartupError);
      })
      .catch(() => {
        // Initial sync best-effort; getStartupStatus below will reconcile.
      });

    Promise.resolve(skydimo.getStartupStatus())
      .then((status) => {
        if (cancelled || !status) return;
        if (status.mismatch) {
          toastStartupOutOfSync();
          setSettings((current) => {
            if (current.launchAtStartup === Boolean(status.registered)) {
              return current;
            }
            const merged = sanitizeSettings(
              {
                ...current,
                launchAtStartup: Boolean(status.registered),
                savedAt: new Date().toISOString(),
              },
              DEFAULT_SETTINGS
            );
            persistSettings(merged);
            return merged;
          });
        }
      })
      .catch(() => {
        // Status query is non-critical; ignore.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    settings,
    history,
    saveSettings,
    addHistory,
    clearHistory,
    startupError,
  };
}
