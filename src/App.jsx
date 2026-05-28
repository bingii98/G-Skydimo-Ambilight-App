import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  Badge,
  Group,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconInfoCircle,
} from "@tabler/icons-react";
import { ColorControls } from "./components/ColorStudio";
import { MiddlePanel } from "./components/MiddlePanel";
import { DiscordTitleBar } from "./components/DiscordTitleBar";
import { StudioHeader } from "./components/StudioHeader";
import { StatusBanner } from "./components/StatusBanner";
import { useSkydimo } from "./hooks/useSkydimo";
import { useSettings } from "./hooks/useSettings";
import { parseModel, resolveLedCount, scaledRgb } from "./lib/colorUtils";
import {
  applyHexToSettings,
  buildFlashBuffer,
  buildPixelBuffer,
  COLOR_MODES,
  getCalibrationFlashIndices,
  getLogicalZoneForLedIndex,
  getZones,
  getWireOrderedZones,
  getZoneColor,
  migrateLegacyZoneColors,
  pixelBufferKey,
} from "./lib/ledLayout";
import { getStartEdgeFlashIndices } from "./lib/zoneLayout";
import { PRESETS } from "./lib/constants";
import {
  ANIMATIONS,
  ANIMATION_TICK_MS,
  buildAnimationPixels,
  isAnimationPlaybackActive,
} from "./lib/animations";
import {
  areScreenSyncHexesEqual,
  areScreenSyncPixelsEqual,
  buildScreenSyncPixels,
  createScreenSyncPlan,
  isScreenSyncActive,
  resolveScreenSyncSmoothing,
  resolveScreenSyncTickMs,
} from "./lib/screenSync";
import { useScreenCapture } from "./hooks/useScreenCapture";
import {
  toastColorRestored,
  toastConnected,
  toastConnectionError,
  toastConnectionFailed,
  toastConnecting,
  toastDisconnected,
  toastLedPower,
  toastScanComplete,
  toastWarning,
} from "./lib/appToast";
import { getSmartOrientationPatch } from "./lib/zoneLayout";

const PREVIEW_DEBOUNCE_MS = 80;
const ZONE_TEST_HOLD_MS = 1200;
const CALIBRATION_HOLD_MS = 2200;
const SWEEP_TICK_MS = 90;
const SWEEP_FULL_HOLD_MS = 480;
const SWEEP_GAP_MS = 220;
const SWEEP_CYCLES = 2;
const SWEEP_MAX_LIT = 16;
const CHASE_STEP_MS = 42;
const CHASE_CYCLES = 2;
const CHASE_TAIL = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function App() {
  const { state, scan, connect, connectBest, disconnect, setOptions, setPixels } = useSkydimo();
  const { settings, history, saveSettings, addHistory, clearHistory, startupError } = useSettings();

  const [selectedPort, setSelectedPort] = useState(null);
  const [activeNav, setActiveNav] = useState("devices");
  const [portFilter, setPortFilter] = useState("");
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [ledOn, setLedOn] = useState(true);

  const lastSentColorKey = useRef("");
  const previewTimer = useRef(null);
  const prevConnected = useRef(false);
  const flashAbortRef = useRef(null);
  const calibrationLockRef = useRef(false);
  const playbackPausedRef = useRef(false);
  const animSendingRef = useRef(false);
  const animationStartRef = useRef(0);
  const animationRafRef = useRef(null);
  const screenRafRef = useRef(null);
  const screenColorsRef = useRef(null);
  const screenPlanRef = useRef(null);
  const screenSentPixelsRef = useRef(null);
  const screenPreviewHexesRef = useRef(null);
  const screenSendingRef = useRef(false);
  const screenSyncSmoothingRef = useRef(resolveScreenSyncSmoothing(settings));

  const [screenLedColors, setScreenLedColors] = useState([]);

  const connected = state?.connected;
  const ledCount = useMemo(() => resolveLedCount(state?.deviceId), [state?.deviceId]);
  const deviceModel = parseModel(state?.deviceId);
  const screenMode = settings.colorMode === COLOR_MODES.SCREEN;
  const screenPlayback = screenMode && connected && ledOn;

  const {
    ready: screenCaptureReady,
    error: screenCaptureError,
    sources: screenSources,
    captureFrame,
  } = useScreenCapture({
    enabled: screenMode,
    sourceId: settings.screenSyncSourceId,
  });

  useEffect(() => {
    if (!selectedPort && state?.recommendedPort?.path) {
      setSelectedPort(state.recommendedPort.path);
    }
  }, [state?.recommendedPort?.path, selectedPort]);

  useEffect(() => {
    const { r, g, b } = scaledRgb(settings.hex, settings.brightness);
    document.documentElement.style.setProperty("--glow-color", settings.hex);
    document.documentElement.style.setProperty("--glow-rgb", `${r}, ${g}, ${b}`);
  }, [settings.hex, settings.brightness]);

  const updateSettings = useCallback(
    (patch) => {
      saveSettings(patch);
    },
    [saveSettings]
  );

  useEffect(() => {
    screenSyncSmoothingRef.current = resolveScreenSyncSmoothing(settings);
    if (screenPlanRef.current?.profile) {
      screenPlanRef.current.profile.smoothing = screenSyncSmoothingRef.current;
    }
  }, [settings.screenSyncSmoothing]);

  const previewScreenSyncSmoothing = useCallback((value) => {
    const next = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    screenSyncSmoothingRef.current = next;
    if (screenPlanRef.current?.profile) {
      screenPlanRef.current.profile.smoothing = next;
    }
  }, []);

  const syncOptions = useCallback(
    async (patch = {}) => {
      const next = {
        autoScan: patch.autoScan ?? state?.autoScan ?? true,
        autoConnect: patch.autoConnect ?? state?.autoConnect ?? true,
      };
      await setOptions(next);
    },
    [setOptions, state?.autoScan, state?.autoConnect]
  );

  const setCalibrationLock = useCallback((locked) => {
    calibrationLockRef.current = Boolean(locked);
    if (locked) {
      clearTimeout(previewTimer.current);
      playbackPausedRef.current = true;
    }
  }, []);

  const sendColor = useCallback(
    async (options = {}) => {
      if (!connected && !options.allowDisconnected) {
        return false;
      }

      if (calibrationLockRef.current && !options.ignoreCalibrationLock) {
        return false;
      }

      const useColor = ledOn || options.ignorePower;
      const pixels = useColor
        ? buildPixelBuffer(settings, ledCount, deviceModel)
        : new Uint8Array(ledCount * 3);

      const colorKey = `${pixelBufferKey(pixels)}:${ledCount}:${settings.colorMode}:${useColor ? 1 : 0}`;
      if (!options.force && colorKey === lastSentColorKey.current) {
        return true;
      }

      setSending(true);
      try {
        await setPixels(Array.from(pixels), ledCount);
        lastSentColorKey.current = colorKey;
        if (options.addHistory && useColor) {
          addHistory(settings.hex);
        }
        if (options.status) {
          setStatusText(options.status);
        }
        return true;
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Could not send color", error.message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [settings, ledCount, deviceModel, ledOn, connected, setPixels, addHistory]
  );

  const sendLedPower = useCallback(
    async (powerOn) => {
      if (!connected) {
        return false;
      }

      setSending(true);
      try {
        if (!powerOn) {
          await setPixels(Array.from(new Uint8Array(ledCount * 3)), ledCount);
          lastSentColorKey.current = `off:${ledCount}`;
          setStatusText("LEDs off");
          return true;
        }

        const pixels = buildPixelBuffer(settings, ledCount, deviceModel);
        await setPixels(Array.from(pixels), ledCount);
        lastSentColorKey.current = `${pixelBufferKey(pixels)}:${ledCount}:${settings.colorMode}:1`;
        setStatusText(`LEDs on — ${settings.hex}`);
        return true;
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Could not update LEDs", error.message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [connected, settings, ledCount, deviceModel, setPixels]
  );

  const restoreAfterFlash = useCallback(async () => {
    if (!connected) return;
    const pixels = ledOn
      ? buildPixelBuffer(settings, ledCount, deviceModel)
      : new Uint8Array(ledCount * 3);
    await setPixels(Array.from(pixels), ledCount);
    lastSentColorKey.current = "";
  }, [connected, ledOn, settings, ledCount, deviceModel, setPixels]);

  const testZones = useCallback(async (options = {}) => {
    if (!connected || !ledCount) return;

    flashAbortRef.current?.abort();
    const controller = new AbortController();
    flashAbortRef.current = controller;
    playbackPausedRef.current = true;

    const zones = getWireOrderedZones(deviceModel, ledCount, settings);
    setStatusText("Testing zone orientation…");

    try {
      for (const zone of zones) {
        if (controller.signal.aborted) return;
        options.onZoneFlash?.(zone);
        const color = getZoneColor(zone.id ?? zone.wireSide);
        const pixels = buildFlashBuffer(ledCount, zone.indices, color, settings.brightness);
        await setPixels(Array.from(pixels), ledCount);
        setStatusText(`Flashing ${zone.label} zone`);
        await sleep(ZONE_TEST_HOLD_MS);
      }
    } finally {
      playbackPausedRef.current = false;
      if (!controller.signal.aborted) {
        await restoreAfterFlash();
        setStatusText("Zone test complete");
      }
      options.onComplete?.();
    }
  }, [connected, ledCount, deviceModel, settings, setPixels, restoreAfterFlash]);

  const flashZoneForCalibration = useCallback(
    async (zoneId, options = {}) => {
      if (!connected || !ledCount) return false;

      flashAbortRef.current?.abort();
      const controller = new AbortController();
      flashAbortRef.current = controller;
      playbackPausedRef.current = true;

      const rotation = options.logicalReference ? 0 : settings.zoneRotation ?? 0;

      if (options.fromLedZero && options.sweep) {
        const originZone = getLogicalZoneForLedIndex(
          deviceModel,
          ledCount,
          0,
          settings,
          rotation
        );
        const flashColor = getZoneColor(originZone, "#14B8A6");
        const maxLit = Math.max(1, Math.min(ledCount, SWEEP_MAX_LIT));

        try {
          for (let cycle = 0; cycle < SWEEP_CYCLES; cycle += 1) {
            for (let count = 1; count <= maxLit; count += 1) {
              if (controller.signal.aborted) return false;
              const litIndices = Array.from({ length: count }, (_, i) => i);
              const pixels = buildFlashBuffer(ledCount, litIndices, flashColor, settings.brightness);
              await setPixels(Array.from(pixels), ledCount);
              if (count === 1) {
                setStatusText(`Calibration sweep — watch for the moving light from LED 1`);
              }
              await sleep(SWEEP_TICK_MS);
            }
            if (controller.signal.aborted) return false;
            await sleep(SWEEP_FULL_HOLD_MS);

            if (cycle < SWEEP_CYCLES - 1) {
              if (controller.signal.aborted) return false;
              await setPixels(Array.from(new Uint8Array(ledCount * 3)), ledCount);
              await sleep(SWEEP_GAP_MS);
            }
          }
          if (controller.signal.aborted) return false;
          const finalLit = Array.from({ length: maxLit }, (_, i) => i);
          const pixels = buildFlashBuffer(ledCount, finalLit, flashColor, settings.brightness);
          await setPixels(Array.from(pixels), ledCount);
          setStatusText(`Calibration — ${maxLit} LEDs lit from LED 1, pick the matching edge`);
          await sleep(700);
          return true;
        } catch (error) {
          if (!controller.signal.aborted) {
            setStatusText(error.message);
            toastWarning("Calibration failed", error.message);
          }
          return false;
        }
      }

      let litIndices;
      let flashColor;
      let statusLabel;

      if (options.startEdgeOnly) {
        litIndices = getStartEdgeFlashIndices(settings, deviceModel, ledCount);
        const originZone = getLogicalZoneForLedIndex(
          deviceModel,
          ledCount,
          litIndices[0] ?? 0,
          settings,
          rotation
        );
        const zones = getZones(deviceModel, ledCount, rotation, settings);
        const zone = zones.find((item) => item.id === originZone);
        flashColor = getZoneColor(originZone, "#14B8A6");
        statusLabel = `Calibration — look at the ${zone?.label || originZone} flash`;
      } else if (options.fromLedZero) {
        litIndices = getCalibrationFlashIndices(ledCount);
        const originZone = getLogicalZoneForLedIndex(
          deviceModel,
          ledCount,
          0,
          settings,
          rotation
        );
        flashColor = getZoneColor(originZone, "#14B8A6");
        statusLabel = `Calibration — lighting from LED 1 (index 0) · ${litIndices.length} LEDs`;
      } else {
        const zones = getZones(deviceModel, ledCount, rotation, settings);
        const zone = zones.find((item) => item.id === zoneId);
        if (!zone) {
          playbackPausedRef.current = false;
          return false;
        }
        litIndices = zone.indices;
        flashColor = getZoneColor(zone.id);
        statusLabel = `Calibration — look at the ${zone.label} flash`;
      }

      try {
        const pixels = buildFlashBuffer(ledCount, litIndices, flashColor, settings.brightness);
        await setPixels(Array.from(pixels), ledCount);
        setStatusText(statusLabel);
        if (!options.persist) {
          await sleep(CALIBRATION_HOLD_MS);
        }
        return true;
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Calibration failed", error.message);
        return false;
      }
    },
    [connected, ledCount, deviceModel, settings, setPixels]
  );

  const runCalibrationChase = useCallback(
    async (options = {}) => {
      if (!connected || !ledCount) return false;

      flashAbortRef.current?.abort();
      const controller = new AbortController();
      flashAbortRef.current = controller;
      playbackPausedRef.current = true;

      const cycles = Math.max(1, options.cycles ?? CHASE_CYCLES);
      const stepMs = Math.max(20, options.stepMs ?? CHASE_STEP_MS);
      const tailLength = Math.max(1, options.tailLength ?? CHASE_TAIL);
      const hex = options.color || "#14B8A6";
      const onFrame = typeof options.onFrame === "function" ? options.onFrame : null;

      try {
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          for (let head = 0; head < ledCount; head += 1) {
            if (controller.signal.aborted) return false;

            const litIndices = [];
            for (let offset = 0; offset < tailLength; offset += 1) {
              const index = head - offset;
              if (index >= 0) litIndices.push(index);
            }

            const pixels = buildFlashBuffer(ledCount, litIndices, hex, settings.brightness);
            await setPixels(Array.from(pixels), ledCount);
            onFrame?.(head, litIndices);

            if (head === 0 && cycle === 0) {
              setStatusText("Calibration — follow the moving light around your monitor");
            }

            await sleep(stepMs);
          }

          if (controller.signal.aborted) return false;
          await setPixels(Array.from(new Uint8Array(ledCount * 3)), ledCount);
          onFrame?.(null, []);
          if (cycle < cycles - 1) {
            await sleep(280);
          }
        }

        onFrame?.(null, []);
        return true;
      } catch (error) {
        if (!controller.signal.aborted) {
          setStatusText(error.message);
          toastWarning("Calibration failed", error.message);
        }
        onFrame?.(null, []);
        return false;
      }
    },
    [connected, ledCount, settings.brightness, setPixels]
  );

  const restoreAfterCalibration = useCallback(async () => {
    calibrationLockRef.current = false;
    playbackPausedRef.current = false;
    await restoreAfterFlash();
  }, [restoreAfterFlash]);

  const abortCalibrationPlayback = useCallback(() => {
    flashAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!connected || !ledCount) return;
    const patch = getSmartOrientationPatch(settings, deviceModel, ledCount);
    if (Object.keys(patch).length > 0) {
      saveSettings(patch);
    }
  }, [
    connected,
    ledCount,
    deviceModel,
    settings.stripCounts,
    settings.stripOrigin,
    settings.stripDirection,
    settings.orientationConfirmed,
    saveSettings,
  ]);

  const handleToggleLedPower = useCallback(
    async (nextOn) => {
      if (!connected) {
        return;
      }

      setLedOn(nextOn);
      lastSentColorKey.current = "";
      const ok = await sendLedPower(nextOn);
      if (!ok) {
        setLedOn(!nextOn);
        return;
      }

      toastLedPower(nextOn, settings.hex);
    },
    [connected, sendLedPower, settings.hex]
  );

  const pushColorOnConnect = useCallback(async () => {
    if (!ledOn) {
      await sendLedPower(false);
      return;
    }

    const ok = await sendColor({
      force: true,
      status: `Color restored — ${settings.hex}`,
    });

    if (ok) {
      toastColorRestored(settings.hex);
    }
  }, [settings.hex, sendColor, ledOn, sendLedPower]);

  const scheduleLivePreview = useCallback(() => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      if (calibrationLockRef.current || playbackPausedRef.current) {
        return;
      }

      if (isAnimationPlaybackActive(settings)) {
        return;
      }

      if (isScreenSyncActive(settings)) {
        return;
      }

      if (!ledOn) {
        return;
      }

      if (!connected) {
        if (!state?.autoConnect || state?.skydimoRunning) {
          return;
        }
        try {
          const next = await connectBest();
          if (!next.connected) {
            return;
          }
        } catch {
          return;
        }
      }

      await sendColor({
        force: !connected,
        addHistory: true,
        status: `Showing ${settings.hex}`,
      });
    }, PREVIEW_DEBOUNCE_MS);
  }, [settings, ledOn, connected, state?.autoConnect, state?.skydimoRunning, connectBest, sendColor]);

  useEffect(() => {
    if (ledOn) {
      scheduleLivePreview();
    } else {
      clearTimeout(previewTimer.current);
      if (!ledOn) {
        lastSentColorKey.current = "";
      }
    }
    return () => clearTimeout(previewTimer.current);
  }, [
    settings.hex,
    settings.brightness,
    settings.colorMode,
    settings.selectedLeds,
    settings.ledColors,
    settings.zoneRotation,
    settings.stripCounts,
    settings.stripOrigin,
    settings.stripDirection,
    settings.ledPaintMode,
    settings.gradientStops,
    settings.gradientActiveStopId,
    settings.animationId,
    settings.screenSyncSourceId,
    ledCount,
    ledOn,
    connected,
    scheduleLivePreview,
  ]);

  const animationActive = isAnimationPlaybackActive(settings) && connected && ledOn;

  useEffect(() => {
    if (!animationActive) {
      if (animationRafRef.current) {
        cancelAnimationFrame(animationRafRef.current);
        animationRafRef.current = null;
      }
      if (
        settings.colorMode !== COLOR_MODES.ANIMATION &&
        settings.colorMode !== COLOR_MODES.SCREEN &&
        connected &&
        ledOn
      ) {
        lastSentColorKey.current = "";
        scheduleLivePreview();
      }
      return;
    }

    animationStartRef.current = performance.now();
    let lastTick = 0;

    const tick = (now) => {
      if (playbackPausedRef.current || animSendingRef.current) {
        animationRafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (now - lastTick < ANIMATION_TICK_MS) {
        animationRafRef.current = requestAnimationFrame(tick);
        return;
      }

      lastTick = now;
      const elapsed = now - animationStartRef.current;
      const pixels = buildAnimationPixels({
        animationId: settings.animationId,
        ledCount,
        settings,
        timeMs: elapsed,
        deviceModel,
      });

      animSendingRef.current = true;
      setPixels(Array.from(pixels), ledCount)
        .then(() => {
          const label = ANIMATIONS.find((item) => item.id === settings.animationId)?.label;
          setStatusText(label ? `Animation — ${label}` : "Animation");
        })
        .catch((error) => {
          setStatusText(error.message);
          toastWarning("Animation stopped", error.message);
        })
        .finally(() => {
          animSendingRef.current = false;
        });

      animationRafRef.current = requestAnimationFrame(tick);
    };

    animationRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRafRef.current) {
        cancelAnimationFrame(animationRafRef.current);
        animationRafRef.current = null;
      }
    };
  }, [
    animationActive,
    settings.animationId,
    settings.animationSpeed,
    settings.animationIntensity,
    settings.animationReverse,
    settings.stripOrigin,
    settings.stripDirection,
    settings.stripCounts,
    settings.hex,
    settings.animationSecondaryHex,
    settings.animationColorStops,
    settings.animationColorsById,
    settings.brightness,
    settings.colorMode,
    ledCount,
    connected,
    ledOn,
    setPixels,
    scheduleLivePreview,
  ]);

  useEffect(() => {
    if (!screenMode) {
      setScreenLedColors([]);
      screenColorsRef.current = null;
      screenPlanRef.current = null;
      screenSentPixelsRef.current = null;
      screenPreviewHexesRef.current = null;
      if (screenRafRef.current) {
        cancelAnimationFrame(screenRafRef.current);
        screenRafRef.current = null;
      }
      return;
    }

    screenColorsRef.current = null;
    screenPlanRef.current = createScreenSyncPlan({
      deviceModel,
      ledCount,
      settings: {
        ...settings,
        screenSyncSmoothing: screenSyncSmoothingRef.current,
      },
    });
    screenSentPixelsRef.current = null;
    screenPreviewHexesRef.current = null;

    let lastTick = 0;

    const tick = (now) => {
      if (playbackPausedRef.current || calibrationLockRef.current) {
        screenRafRef.current = requestAnimationFrame(tick);
        return;
      }

      const tickMs = resolveScreenSyncTickMs(settings);
      if (now - lastTick >= tickMs && screenCaptureReady) {
        lastTick = now;
        const frame = captureFrame();
        if (frame) {
          if (!screenPlanRef.current) {
            screenPlanRef.current = createScreenSyncPlan({
              deviceModel,
              ledCount,
              settings: {
                ...settings,
                screenSyncSmoothing: screenSyncSmoothingRef.current,
              },
            });
          }

          const syncSettings = {
            ...settings,
            screenSyncSmoothing: screenSyncSmoothingRef.current,
          };

          const { pixels, colors, hexes } = buildScreenSyncPixels({
            imageData: frame,
            ledCount,
            deviceModel,
            settings: syncSettings,
            previousColors: screenColorsRef.current,
            plan: screenPlanRef.current,
          });
          screenColorsRef.current = colors;

          if (
            hexes.length === ledCount &&
            !areScreenSyncHexesEqual(screenPreviewHexesRef.current, hexes)
          ) {
            screenPreviewHexesRef.current = hexes;
            setScreenLedColors(hexes);
          }

          if (screenPlayback && !screenSendingRef.current) {
            const pixelArray = Array.from(pixels);
            if (!areScreenSyncPixelsEqual(screenSentPixelsRef.current, pixelArray)) {
              screenSendingRef.current = true;
              screenSentPixelsRef.current = pixelArray;
              setPixels(pixelArray, ledCount)
                .then(() => setStatusText("Screen sync"))
                .catch((error) => {
                  setStatusText(error.message);
                  toastWarning("Screen sync stopped", error.message);
                })
                .finally(() => {
                  screenSendingRef.current = false;
                });
            }
          }
        }
      }

      screenRafRef.current = requestAnimationFrame(tick);
    };

    screenRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (screenRafRef.current) {
        cancelAnimationFrame(screenRafRef.current);
        screenRafRef.current = null;
      }
    };
  }, [
    screenMode,
    screenPlayback,
    screenCaptureReady,
    captureFrame,
    ledCount,
    deviceModel,
    settings.brightness,
    settings.zoneRotation,
    settings.stripCounts,
    settings.stripOrigin,
    settings.stripDirection,
    settings.screenSyncRegion,
    setPixels,
  ]);

  useEffect(() => {
    if (!ledCount) return;
    const patch = migrateLegacyZoneColors(settings, ledCount, deviceModel);
    if (patch) {
      saveSettings(patch);
    }
  }, [ledCount, deviceModel, settings.zoneColors, saveSettings]);

  useEffect(() => {
    const justConnected = connected && !prevConnected.current;
    const justDisconnected = !connected && prevConnected.current;
    prevConnected.current = connected;

    if (justConnected) {
      toastConnected({
        port: state?.port,
        deviceId: state?.deviceId,
      });
      pushColorOnConnect();
    }

    if (justDisconnected) {
      lastSentColorKey.current = "";
      setLedOn(true);
      toastDisconnected();
    }
  }, [connected, state?.port, state?.deviceId, pushColorOnConnect]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      const next = await scan();
      setStatusText("COM ports rescanned");
      const portCount = next?.ports?.filter((port) => port.type === "skydimo")?.length ?? 0;
      toastScanComplete(portCount);
    } finally {
      setScanning(false);
    }
  }, [scan]);

  const handleConnect = async (port) => {
    setConnecting(true);
    if (!connected) {
      toastConnecting(port || selectedPort);
    }
    try {
      if (connected) {
        await disconnect();
        setStatusText("Disconnected");
        return;
      }
      const next = port ? await connect(port) : await connectBest();
      setStatusText(next.message || "Connected");
      if (!next.connected) {
        toastConnectionFailed(next.message || "Try scanning again or pick another port");
      }
    } catch (error) {
      setStatusText(error.message);
      toastConnectionError(error);
    } finally {
      setConnecting(false);
    }
  };

  const handlePreset = useCallback(
    (index) => {
      const preset = PRESETS[index]?.color;
      if (!preset) return;
      const patch = applyHexToSettings(settings, preset.toUpperCase(), ledCount, deviceModel);
      if (!patch) return;
      updateSettings(patch);
      addHistory(preset.toUpperCase());
    },
    [updateSettings, addHistory, settings, ledCount, deviceModel]
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.matches("input, textarea")) return;
      const num = Number(event.key);
      if (num >= 1 && num <= 8) {
        handlePreset(num - 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handlePreset]);

  const banner = useMemo(() => {
    if (state?.skydimoRunning) {
      return {
        variant: "warning",
        title: "SkyDimo.exe is running",
        icon: IconAlertTriangle,
        message: "The official app is using the COM port. Close SkyDimo.exe to control LEDs from here.",
      };
    }
    if (!connected && !state?.ports?.some((port) => port.type === "skydimo")) {
      return {
        variant: "info",
        title: "No device found",
        icon: IconInfoCircle,
        message: "Check the USB cable or rescan the COM port list.",
        action: {
          label: "Scan now",
          onClick: handleScan,
          loading: scanning,
        },
      };
    }
    if (!connected && state?.ports?.some((port) => port.status === "busy")) {
      return {
        variant: "warning",
        title: "COM port busy",
        icon: IconAlertTriangle,
        message: "The port may be held by another app. Try closing SkyDimo or rescanning.",
        action: {
          label: "Rescan",
          onClick: handleScan,
          loading: scanning,
        },
      };
    }
    return null;
  }, [state?.skydimoRunning, state?.ports, connected, scanning, handleScan]);

  const colorControls = (
    <ColorControls
      settings={settings}
      connected={connected}
      ledCount={ledCount}
      deviceModel={deviceModel}
      onChange={updateSettings}
      onPreset={handlePreset}
      ledOn={ledOn}
      sending={sending}
      onQuickConnect={() => handleConnect(selectedPort)}
      hideConnectOverlay={activeNav === "devices"}
      screenCaptureReady={screenCaptureReady}
      screenCaptureError={screenCaptureError}
      screenSources={screenSources}
      screenLedColors={screenLedColors}
      onScreenSyncSmoothnessPreview={previewScreenSyncSmoothing}
    />
  );

  return (
    <>
      <div className="app-ambient" aria-hidden>
        <div className="app-ambient__mesh" />
        <div className="app-ambient__glow" />
        <div className="app-ambient__grid" />
      </div>

      <AppShell header={{ height: 36 }} footer={{ height: 40 }} padding={0}>
        <AppShell.Header>
          <DiscordTitleBar
            connected={connected}
            state={state}
            currentHex={settings.hex}
            colorMode={settings.colorMode}
            animationId={settings.animationId}
          />
        </AppShell.Header>

        <AppShell.Main className="app-main">
          <div className="app-shell-body">
            {banner && (
              <StatusBanner
                variant={banner.variant}
                title={banner.title}
                message={banner.message}
                icon={banner.icon}
                action={banner.action}
              />
            )}

            <div className="soft-layout">
              <MiddlePanel
                nav={activeNav}
                onNavChange={setActiveNav}
                connected={connected}
                state={state}
                settings={settings}
                startupError={startupError}
                ledCount={ledCount}
                deviceModel={deviceModel}
                history={history}
                selectedPort={selectedPort}
                onSelectPort={setSelectedPort}
                onScan={handleScan}
                onConnect={handleConnect}
                onToggleConnection={() => handleConnect(selectedPort)}
                onSettingsChange={updateSettings}
                onSyncOptions={syncOptions}
                onTestZones={testZones}
                onFlashZone={flashZoneForCalibration}
                onRunCalibrationChase={runCalibrationChase}
                onAbortCalibrationPlayback={abortCalibrationPlayback}
                onCalibrationLock={setCalibrationLock}
                onRestoreAfterCalibrate={restoreAfterCalibration}
                ledOn={ledOn}
                onToggleLedPower={handleToggleLedPower}
                onHistoryPick={(hex) => {
                  const patch = applyHexToSettings(settings, hex, ledCount, deviceModel);
                  if (patch) updateSettings(patch);
                }}
                onClearHistory={clearHistory}
                scanning={scanning}
                connecting={connecting}
                portFilter={portFilter}
                onPortFilterChange={setPortFilter}
              />

              <section className="studio-stage">
                <StudioHeader
                  state={state}
                  ledCount={ledCount}
                  deviceModel={deviceModel}
                  connected={connected}
                  ledOn={ledOn}
                />

                <div className="studio-stage__body">{colorControls}</div>
              </section>
            </div>
          </div>
        </AppShell.Main>

        <AppShell.Footer>
          <div className="app-footer">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
              <span className={`app-status-dot ${connected ? "app-status-dot--online" : ""}`} />
              <Text size="sm" truncate>
                {statusText || state?.message || "Ready"}
              </Text>
            </Group>
            <div className="app-footer-hints">
              <Badge variant="light" color="gray" size="sm">
                Space to apply
              </Badge>
            </div>
          </div>
        </AppShell.Footer>
      </AppShell>
    </>
  );
}
