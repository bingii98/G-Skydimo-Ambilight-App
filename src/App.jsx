import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sanitizeActiveNav } from "./lib/settingsSanitize";
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
import { ExternalColorStudio } from "./components/ExternalColorStudio";
import { ExternalTriangleLayoutPanel } from "./components/ExternalTriangleLayoutPanel";
import { useAppTheme } from "./components/AppThemeProvider";
import { MiddlePanel } from "./components/MiddlePanel";
import { DiscordTitleBar } from "./components/DiscordTitleBar";
import { StatusBanner } from "./components/StatusBanner";
import { useSkydimo } from "./hooks/useSkydimo";
import { useExternalLeds } from "./hooks/useExternalLeds";
import { useColorOutput } from "./hooks/useColorOutput";
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
  defaultBleEffectId,
  getExternalBleEffectLabel,
  isBleEffectPlaybackActive,
} from "./lib/externalBleEffects";
import {
  applyAnimationTuningLive,
  resolveAnimationSettings,
} from "./lib/animationTuningLive";
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
import { listSavedExternalDeviceIds, buildAutoAddConnectedDeviceToBulkPatch, buildBulkFocusDevicePatch, buildExternalDeviceManualConnectPatch, buildExternalDeviceSettingsPatch, getExternalDeviceLabel, resolveExternalAutoConnectTargetId } from "./lib/externalLedSettings";
import { EXTERNAL_LAYOUT_KINDS, resolveExternalLayout } from "./lib/externalLedLayout";

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
  const {
    state: externalState,
    scan: externalScan,
    stopScan: externalStopScan,
    connect: externalConnect,
    disconnect: externalDisconnect,
    setPixels: externalSetPixels,
    setPower: externalSetPower,
    setAnimation: externalSetAnimation,
    setBrightness: externalSetBrightness,
    registerSaved,
  } = useExternalLeds();
  const { settings, history, saveSettings, addHistory, clearHistory, startupError } = useSettings();
  const { setColorSchemePreference } = useAppTheme();

  useEffect(() => {
    setColorSchemePreference(settings.colorScheme ?? "system");
  }, [settings.colorScheme, setColorSchemePreference]);

  const [selectedPort, setSelectedPort] = useState(null);
  const [activeNav, setActiveNav] = useState("devices");
  const [portFilter, setPortFilter] = useState("");
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [externalScanning, setExternalScanning] = useState(false);
  const [externalConnecting, setExternalConnecting] = useState(null);
  const externalAutoConnectRef = useRef({ inFlight: false, attempts: {} });
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [ledOn, setLedOn] = useState(true);

  const lastSentColorKey = useRef("");
  const lastSentBleEffectKey = useRef("");
  const lastSentBleBrightnessKey = useRef("");
  const previewTimer = useRef(null);
  const prevConnected = useRef(false);
  const externalRestoreKeyRef = useRef("");
  const flashAbortRef = useRef(null);
  const calibrationLockRef = useRef(false);
  const playbackPausedRef = useRef(false);
  const animSendingRef = useRef(false);
  const animationStartRef = useRef(0);
  const animationTimerRef = useRef(null);
  const screenRafRef = useRef(null);
  const screenColorsRef = useRef(null);
  const screenPlanRef = useRef(null);
  const screenSentPixelsRef = useRef(null);
  const screenPreviewHexesRef = useRef(null);
  const screenSendingRef = useRef(false);
  const screenSyncSmoothingRef = useRef(resolveScreenSyncSmoothing(settings));
  const settingsRef = useRef(settings);

  const [screenLedColors, setScreenLedColors] = useState([]);

  const connected = state?.connected;
  const ledCount = useMemo(() => resolveLedCount(state?.deviceId), [state?.deviceId]);
  const deviceModel = parseModel(state?.deviceId);

  const {
    isExternalOutput,
    activeExternalDevice,
    activeExternalDeviceId,
    configDeviceIds,
    connectedConfigDeviceIds,
    outputSettings,
    outputLedCount,
    outputDeviceModel,
    outputConnected,
    outputLedOn,
    updateOutputSettings,
    setOutputLedOn,
    outputSetPixels,
    outputSetPower,
    outputSetAnimation,
    outputSetBrightness,
  } = useColorOutput({
    activeNav,
    settings,
    saveSettings,
    skydimoConnected: connected,
    skydimoLedCount: ledCount,
    skydimoDeviceModel: deviceModel,
    skydimoLedOn: ledOn,
    setSkydimoLedOn: setLedOn,
    setPixels,
    externalState,
    externalSetPixels,
    externalSetPower,
    externalSetAnimation,
    externalSetBrightness,
  });

  const screenMode = outputSettings.colorMode === COLOR_MODES.SCREEN;
  const screenPlayback = screenMode && outputConnected && outputLedOn;

  const {
    ready: screenCaptureReady,
    error: screenCaptureError,
    sources: screenSources,
    captureFrame,
  } = useScreenCapture({
    enabled: screenMode,
    sourceId: outputSettings.screenSyncSourceId,
  });

  useEffect(() => {
    settingsRef.current = outputSettings;
    applyAnimationTuningLive(outputSettings);
  }, [outputSettings]);

  useEffect(() => {
    registerSaved(listSavedExternalDeviceIds(settings)).catch(() => {});
  }, [settings.externalLeds?.devices, registerSaved]);

  useEffect(() => {
    if (!selectedPort && state?.recommendedPort?.path) {
      setSelectedPort(state.recommendedPort.path);
    }
  }, [state?.recommendedPort?.path, selectedPort]);

  useEffect(() => {
    const { r, g, b } = scaledRgb(outputSettings.hex, outputSettings.brightness);
    document.documentElement.style.setProperty("--glow-color", outputSettings.hex);
    document.documentElement.style.setProperty("--glow-rgb", `${r}, ${g}, ${b}`);
  }, [outputSettings.hex, outputSettings.brightness]);

  const updateSettings = useCallback(
    (patch) => {
      if (patch.externalLeds) {
        saveSettings(patch);
        return;
      }
      if (activeNav === "external") {
        updateOutputSettings(patch);
        return;
      }
      saveSettings(patch);
    },
    [activeNav, saveSettings, updateOutputSettings]
  );

  const handleNavChange = useCallback((nav) => {
    setActiveNav(sanitizeActiveNav(nav));
  }, []);

  useEffect(() => {
    screenSyncSmoothingRef.current = resolveScreenSyncSmoothing(outputSettings);
    if (screenPlanRef.current?.profile) {
      screenPlanRef.current.profile.smoothing = screenSyncSmoothingRef.current;
    }
  }, [outputSettings.screenSyncSmoothing]);

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
      if (!outputConnected && !options.allowDisconnected) {
        return false;
      }

      if (calibrationLockRef.current && !options.ignoreCalibrationLock) {
        return false;
      }

      if (isExternalOutput && isBleEffectPlaybackActive(outputSettings)) {
        return true;
      }

      const useColor = outputLedOn || options.ignorePower;
      if (!useColor && isExternalOutput) {
        setSending(true);
        try {
          await outputSetPower(false);
          lastSentColorKey.current = `off:${outputLedCount}:external:${activeExternalDeviceId || ""}:${configDeviceIds.join(",")}`;
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
      }

      const pixels = useColor
        ? buildPixelBuffer(outputSettings, outputLedCount, outputDeviceModel)
        : new Uint8Array(outputLedCount * 3);

      const colorKey = `${pixelBufferKey(pixels)}:${outputLedCount}:${outputSettings.colorMode}:${useColor ? 1 : 0}:${isExternalOutput ? activeExternalDeviceId : "skydimo"}`;
      if (!options.force && colorKey === lastSentColorKey.current) {
        return true;
      }

      setSending(true);
      try {
        await outputSetPixels(Array.from(pixels), outputLedCount);
        lastSentColorKey.current = colorKey;
        if (options.addHistory && useColor) {
          addHistory(outputSettings.hex);
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
    [
      outputSettings,
      outputLedCount,
      outputDeviceModel,
      outputLedOn,
      outputConnected,
      outputSetPixels,
      addHistory,
      isExternalOutput,
      activeExternalDeviceId,
      configDeviceIds,
      outputSetPower,
    ]
  );

  const sendLedPower = useCallback(
    async (powerOn) => {
      if (!outputConnected) {
        return false;
      }

      setSending(true);
      try {
        if (isExternalOutput && (activeExternalDeviceId || connectedConfigDeviceIds.length)) {
          if (!powerOn) {
            await outputSetPower(false);
            lastSentColorKey.current = `off:${outputLedCount}:${configDeviceIds.join(",")}`;
            setStatusText("LEDs off");
            return true;
          }

          await outputSetPower(true);
          if (isBleEffectPlaybackActive(outputSettings)) {
            lastSentBleEffectKey.current = "";
            const effectId = Math.round(Number(outputSettings.bleEffectId));
            await outputSetAnimation(effectId, outputSettings.animationSpeed ?? 50);
            lastSentBleEffectKey.current = `${effectId}:${outputSettings.animationSpeed ?? 50}:${configDeviceIds.join(",")}:1`;
            const label = getExternalBleEffectLabel(outputDeviceModel, effectId);
            setStatusText(label ? `Animation — ${label}` : "Animation");
            return true;
          }

          const pixels = buildPixelBuffer(outputSettings, outputLedCount, outputDeviceModel);
          await outputSetPixels(Array.from(pixels), outputLedCount);
          lastSentColorKey.current = `${pixelBufferKey(pixels)}:${outputLedCount}:${outputSettings.colorMode}:1:${configDeviceIds.join(",")}`;
          setStatusText(`LEDs on — ${outputSettings.hex}`);
          return true;
        }

        if (!powerOn) {
          await outputSetPixels(Array.from(new Uint8Array(outputLedCount * 3)), outputLedCount);
          lastSentColorKey.current = `off:${outputLedCount}:skydimo`;
          setStatusText("LEDs off");
          return true;
        }

        const pixels = buildPixelBuffer(outputSettings, outputLedCount, outputDeviceModel);
        await outputSetPixels(Array.from(pixels), outputLedCount);
        lastSentColorKey.current = `${pixelBufferKey(pixels)}:${outputLedCount}:${outputSettings.colorMode}:1:skydimo`;
        setStatusText(`LEDs on — ${outputSettings.hex}`);
        return true;
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Could not update LEDs", error.message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      outputConnected,
      outputSettings,
      outputLedCount,
      outputDeviceModel,
      outputSetPixels,
      isExternalOutput,
      activeExternalDeviceId,
      configDeviceIds,
      connectedConfigDeviceIds,
      outputSetPower,
      outputSetAnimation,
      outputSetPixels,
    ]
  );

  const sendBleEffect = useCallback(
    async (options = {}) => {
      if (!outputConnected && !options.allowDisconnected) {
        return false;
      }
      if (!isBleEffectPlaybackActive(outputSettings)) {
        return false;
      }
      if (!outputLedOn && !options.ignorePower) {
        return false;
      }

      const effectId = Math.round(Number(outputSettings.bleEffectId));
      const speed = outputSettings.animationSpeed ?? 50;
      const key = `${effectId}:${speed}:${configDeviceIds.join(",")}:${outputLedOn ? 1 : 0}`;
      if (!options.force && key === lastSentBleEffectKey.current) {
        return true;
      }

      setSending(true);
      try {
        await outputSetAnimation(effectId, speed);
        lastSentBleEffectKey.current = key;
        lastSentColorKey.current = `ble:${key}`;
        const label = getExternalBleEffectLabel(outputDeviceModel, effectId);
        setStatusText(label ? `Animation — ${label}` : "Animation");
        return true;
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Could not start animation", error.message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      outputConnected,
      outputSettings,
      outputLedOn,
      outputDeviceModel,
      configDeviceIds,
      outputSetAnimation,
    ]
  );

  const sendBleBrightness = useCallback(
    async (options = {}) => {
      if (!outputConnected && !options.allowDisconnected) {
        return false;
      }
      if (!isBleEffectPlaybackActive(outputSettings)) {
        return false;
      }
      if (!outputLedOn && !options.ignorePower) {
        return false;
      }

      const brightness = outputSettings.brightness ?? 100;
      const key = `${brightness}:${configDeviceIds.join(",")}`;
      if (!options.force && key === lastSentBleBrightnessKey.current) {
        return true;
      }

      setSending(true);
      try {
        await outputSetBrightness(brightness);
        lastSentBleBrightnessKey.current = key;
        return true;
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Could not update brightness", error.message);
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      outputConnected,
      outputSettings,
      outputLedOn,
      configDeviceIds,
      outputSetBrightness,
    ]
  );

  const restoreAfterFlash = useCallback(async () => {
    if (!outputConnected) return;
    const pixels = outputLedOn
      ? buildPixelBuffer(outputSettings, outputLedCount, outputDeviceModel)
      : new Uint8Array(outputLedCount * 3);
    await outputSetPixels(Array.from(pixels), outputLedCount);
    lastSentColorKey.current = "";
  }, [outputConnected, outputLedOn, outputSettings, outputLedCount, outputDeviceModel, outputSetPixels]);

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
      } finally {
        playbackPausedRef.current = false;
        if (!options.persist && !controller.signal.aborted) {
          await restoreAfterFlash();
        }
      }
    },
    [connected, ledCount, deviceModel, settings, setPixels, restoreAfterFlash]
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
      if (!outputConnected) {
        return;
      }

      clearTimeout(previewTimer.current);
      setOutputLedOn(nextOn);
      lastSentColorKey.current = "";
      const ok = await sendLedPower(nextOn);
      if (!ok) {
        setOutputLedOn(!nextOn);
        return;
      }

      toastLedPower(nextOn, outputSettings.hex);
    },
    [outputConnected, sendLedPower, outputSettings.hex, setOutputLedOn]
  );

  const restoreConnectedColor = useCallback(
    async ({ showToast = false } = {}) => {
      if (!outputLedOn) {
        await sendLedPower(false);
        return false;
      }

      if (isExternalOutput && isBleEffectPlaybackActive(outputSettings)) {
        const ok = await sendBleEffect({
          force: true,
        });
        return ok;
      }

      const ok = await sendColor({
        force: true,
        status: showToast ? `Color restored — ${outputSettings.hex}` : undefined,
      });

      if (ok && showToast) {
        toastColorRestored(outputSettings.hex);
      }

      return ok;
    },
    [outputSettings, sendColor, outputLedOn, sendLedPower, isExternalOutput, sendBleEffect]
  );

  const scheduleLivePreview = useCallback(() => {
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      if (calibrationLockRef.current || playbackPausedRef.current) {
        return;
      }

      if (isAnimationPlaybackActive(outputSettings)) {
        return;
      }

      if (isExternalOutput && isBleEffectPlaybackActive(outputSettings)) {
        return;
      }

      if (isScreenSyncActive(outputSettings)) {
        return;
      }

      if (!outputLedOn) {
        return;
      }

      if (!outputConnected) {
        if (isExternalOutput || !state?.autoConnect || state?.skydimoRunning) {
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
        force: !outputConnected,
        addHistory: true,
        status: `Showing ${outputSettings.hex}`,
      });
    }, PREVIEW_DEBOUNCE_MS);
  }, [
    outputSettings,
    outputLedOn,
    outputConnected,
    isExternalOutput,
    state?.autoConnect,
    state?.skydimoRunning,
    connectBest,
    sendColor,
  ]);

  useEffect(() => {
    if (outputLedOn) {
      scheduleLivePreview();
    } else {
      clearTimeout(previewTimer.current);
      if (!outputLedOn) {
        lastSentColorKey.current = "";
      }
    }
    return () => clearTimeout(previewTimer.current);
  }, [
    outputSettings.hex,
    outputSettings.brightness,
    outputSettings.colorMode,
    outputSettings.selectedLeds,
    outputSettings.ledColors,
    outputSettings.zoneRotation,
    outputSettings.stripCounts,
    outputSettings.stripOrigin,
    outputSettings.stripDirection,
    outputSettings.ledPaintMode,
    outputSettings.gradientStops,
    outputSettings.gradientActiveStopId,
    outputSettings.animationId,
    outputSettings.screenSyncSourceId,
    outputLedCount,
    outputLedOn,
    outputConnected,
    activeExternalDeviceId,
    isExternalOutput,
    scheduleLivePreview,
  ]);

  const animationActive =
    !isExternalOutput &&
    isAnimationPlaybackActive(outputSettings) &&
    outputConnected &&
    outputLedOn;

  const bleEffectActive =
    isExternalOutput &&
    isBleEffectPlaybackActive(outputSettings) &&
    outputConnected &&
    outputLedOn;

  useEffect(() => {
    if (!bleEffectActive) {
      lastSentBleEffectKey.current = "";
      lastSentBleBrightnessKey.current = "";
      return undefined;
    }

    sendBleEffect({ force: true });
    return undefined;
  }, [
    bleEffectActive,
    outputSettings.bleEffectId,
    outputSettings.animationSpeed,
    activeExternalDeviceId,
    configDeviceIds.join(","),
    sendBleEffect,
  ]);

  useEffect(() => {
    if (!bleEffectActive) {
      return undefined;
    }

    sendBleBrightness();
    return undefined;
  }, [
    bleEffectActive,
    outputSettings.brightness,
    activeExternalDeviceId,
    configDeviceIds.join(","),
    sendBleBrightness,
  ]);

  useEffect(() => {
    if (!animationActive) {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
        animationTimerRef.current = null;
      }
      if (
        settingsRef.current.colorMode !== COLOR_MODES.ANIMATION &&
        settingsRef.current.colorMode !== COLOR_MODES.SCREEN &&
        outputConnected &&
        outputLedOn
      ) {
        lastSentColorKey.current = "";
        scheduleLivePreview();
      }
      return;
    }

    animationStartRef.current = performance.now();

    const tick = () => {
      if (playbackPausedRef.current || animSendingRef.current) {
        return;
      }

      const elapsed = performance.now() - animationStartRef.current;
      const currentSettings = settingsRef.current;
      const pixels = buildAnimationPixels({
        animationId: currentSettings.animationId,
        ledCount: outputLedCount,
        settings: resolveAnimationSettings(currentSettings),
        timeMs: elapsed,
        deviceModel: outputDeviceModel,
      });

      animSendingRef.current = true;
      outputSetPixels(Array.from(pixels), outputLedCount)
        .then(() => {
          const label = ANIMATIONS.find((item) => item.id === currentSettings.animationId)?.label;
          setStatusText(label ? `Animation — ${label}` : "Animation");
        })
        .catch((error) => {
          setStatusText(error.message);
          toastWarning("Animation stopped", error.message);
        })
        .finally(() => {
          animSendingRef.current = false;
        });
    };

    tick();
    animationTimerRef.current = setInterval(tick, ANIMATION_TICK_MS);

    return () => {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [
    animationActive,
    outputSettings.animationId,
    outputLedCount,
    outputDeviceModel,
    outputConnected,
    outputLedOn,
    outputSetPixels,
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
      deviceModel: outputDeviceModel,
      ledCount: outputLedCount,
      settings: {
        ...outputSettings,
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

      const tickMs = resolveScreenSyncTickMs(outputSettings);
      if (now - lastTick >= tickMs && screenCaptureReady) {
        lastTick = now;
        const frame = captureFrame();
        if (frame) {
          if (!screenPlanRef.current) {
            screenPlanRef.current = createScreenSyncPlan({
              deviceModel: outputDeviceModel,
              ledCount: outputLedCount,
              settings: {
                ...outputSettings,
                screenSyncSmoothing: screenSyncSmoothingRef.current,
              },
            });
          }

          const syncSettings = {
            ...outputSettings,
            screenSyncSmoothing: screenSyncSmoothingRef.current,
          };

          const { pixels, colors, hexes } = buildScreenSyncPixels({
            imageData: frame,
            ledCount: outputLedCount,
            deviceModel: outputDeviceModel,
            settings: syncSettings,
            previousColors: screenColorsRef.current,
            plan: screenPlanRef.current,
          });
          screenColorsRef.current = colors;

          if (
            hexes.length === outputLedCount &&
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
              outputSetPixels(pixelArray, outputLedCount)
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
    outputLedCount,
    outputDeviceModel,
    outputSettings.brightness,
    outputSettings.zoneRotation,
    outputSettings.stripCounts,
    outputSettings.stripOrigin,
    outputSettings.stripDirection,
    outputSettings.screenSyncRegion,
    outputSetPixels,
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
      restoreConnectedColor({ showToast: true });
    }

    if (justDisconnected) {
      lastSentColorKey.current = "";
      externalRestoreKeyRef.current = "";
      setLedOn(true);
      toastDisconnected();
    }
  }, [connected, state?.port, state?.deviceId, restoreConnectedColor]);

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
      const patch = applyHexToSettings(
        outputSettings,
        preset.toUpperCase(),
        outputLedCount,
        outputDeviceModel
      );
      if (!patch) return;
      updateSettings(patch);
      addHistory(preset.toUpperCase());
    },
    [updateSettings, addHistory, outputSettings, outputLedCount, outputDeviceModel]
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

  const externalConnected = Boolean(
    externalState?.devices?.some((device) => device.connected)
  );

  const handleExternalScan = useCallback(async () => {
    setExternalScanning(true);
    try {
      await externalScan();
      setStatusText("Scanning for BLE LED devices…");
    } catch (error) {
      setStatusText(error.message);
      toastWarning("Bluetooth scan failed", error.message);
    } finally {
      setExternalScanning(false);
    }
  }, [externalScan]);

  const handleExternalConnect = useCallback(
    async (deviceId, { manual = true } = {}) => {
      setExternalConnecting(deviceId);
      try {
        const next = await externalConnect(deviceId);
        if (next?.devices?.find((device) => device.id === deviceId)?.connected) {
          const savedDevices = settings.externalLeds?.devices || {};
          const devicesById = Object.fromEntries(
            (next.devices || []).map((device) => [
              device.id,
              { ...savedDevices[device.id], ...device, id: device.id },
            ])
          );
          const manualPatch = manual
            ? buildExternalDeviceManualConnectPatch(settings, deviceId)
            : {};
          const mergedSettings = { ...settings, ...manualPatch };
          const bulkPatch = buildAutoAddConnectedDeviceToBulkPatch(
            mergedSettings,
            deviceId,
            devicesById
          );
          saveSettings({ ...manualPatch, ...bulkPatch });
          setStatusText("External LED connected");
          if (activeNav === "external") {
            await restoreConnectedColor({ showToast: manual });
          }
        } else {
          setStatusText(next?.message || "Could not connect to external LED");
        }
      } catch (error) {
        setStatusText(error.message);
        if (manual) {
          toastConnectionError(error);
        }
      } finally {
        setExternalConnecting(null);
      }
    },
    [externalConnect, activeNav, restoreConnectedColor, saveSettings, settings]
  );

  const handleExternalDisconnect = useCallback(
    async (deviceId) => {
      try {
        await externalDisconnect(deviceId);
        setStatusText("External LED disconnected");
      } catch (error) {
        setStatusText(error.message);
        toastWarning("Disconnect failed", error.message);
      }
    },
    [externalDisconnect]
  );

  useEffect(() => {
    if (settings.externalLeds?.autoConnect === false) {
      return;
    }
    if (!externalState?.bleAvailable) {
      return;
    }
    if (externalConnecting || externalAutoConnectRef.current.inFlight) {
      return;
    }

    const targetId = resolveExternalAutoConnectTargetId(settings);
    if (!targetId) {
      return;
    }

    const runtime = externalState?.devices?.find((device) => device.id === targetId);
    if (runtime?.connected || runtime?.connecting) {
      return;
    }

    const lastAttempt = externalAutoConnectRef.current.attempts[targetId] || 0;
    if (Date.now() - lastAttempt < 20000) {
      return;
    }

    externalAutoConnectRef.current.inFlight = true;
    externalAutoConnectRef.current.attempts[targetId] = Date.now();

    let cancelled = false;
    (async () => {
      try {
        await handleExternalConnect(targetId, { manual: false });
      } finally {
        if (!cancelled) {
          externalAutoConnectRef.current.inFlight = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    settings,
    settings.externalLeds?.autoConnect,
    settings.externalLeds?.activeDeviceId,
    settings.externalLeds?.devices,
    externalState?.bleAvailable,
    externalState?.devices,
    externalConnecting,
    handleExternalConnect,
  ]);

  useEffect(() => {
    if (activeNav !== "external") {
      externalRestoreKeyRef.current = "";
      return;
    }

    if (!outputConnected || !outputLedOn) {
      if (!outputConnected) {
        externalRestoreKeyRef.current = "";
        lastSentColorKey.current = "";
      }
      return;
    }

    const restoreKey = `${activeExternalDeviceId || ""}:${configDeviceIds.join(",")}`;
    if (externalRestoreKeyRef.current === restoreKey) {
      return;
    }
    externalRestoreKeyRef.current = restoreKey;

    restoreConnectedColor();
  }, [
    activeNav,
    activeExternalDeviceId,
    configDeviceIds,
    outputConnected,
    outputLedOn,
    restoreConnectedColor,
  ]);

  const externalConfigDevices = useMemo(() => {
    if (!isExternalOutput || !configDeviceIds.length) {
      return [];
    }
    const savedDevices = settings?.externalLeds?.devices || {};
    return configDeviceIds.map((id) => {
      const saved = savedDevices[id] || {};
      const runtime = externalState?.devices?.find((entry) => entry.id === id);
      return {
        id,
        label: getExternalDeviceLabel({ ...saved, ...runtime, id }),
        connected: Boolean(runtime?.connected),
      };
    });
  }, [isExternalOutput, configDeviceIds, settings?.externalLeds?.devices, externalState?.devices]);

  const showExternalTriangleLayout =
    isExternalOutput &&
    resolveExternalLayout(activeExternalDevice || outputSettings).layoutKind ===
      EXTERNAL_LAYOUT_KINDS.TRIANGLE;

  const colorControls = isExternalOutput ? (
    <ExternalColorStudio
      device={activeExternalDevice}
      configDeviceIds={configDeviceIds}
      configDevices={externalConfigDevices}
      connectedConfigDeviceIds={connectedConfigDeviceIds}
      settings={outputSettings}
      connected={outputConnected}
      ledOn={outputLedOn}
      sending={sending}
      onChange={updateSettings}
      onPreset={handlePreset}
      onToggleLedPower={handleToggleLedPower}
      onDeviceRename={(customName) => {
        if (!activeExternalDeviceId) {
          return;
        }
        saveSettings(
          buildExternalDeviceSettingsPatch(settings, activeExternalDeviceId, { customName })
        );
      }}
      onQuickConnect={
        () => activeExternalDeviceId && handleExternalConnect(activeExternalDeviceId)
      }
      onBulkFocusDevice={(deviceId) => {
        saveSettings(buildBulkFocusDevicePatch(settings, deviceId));
      }}
    />
  ) : (
    <ColorControls
      settings={outputSettings}
      connected={outputConnected}
      ledCount={outputLedCount}
      deviceModel={outputDeviceModel}
      onChange={updateSettings}
      onPreset={handlePreset}
      ledOn={outputLedOn}
      sending={sending}
      onQuickConnect={() => handleConnect(selectedPort)}
      hideConnectOverlay={activeNav === "settings"}
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

            <div
              className={`soft-layout ui-app-enter${showExternalTriangleLayout ? " soft-layout--external-triangle" : ""}`}
            >
              <MiddlePanel
                nav={activeNav}
                onNavChange={handleNavChange}
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
                  const patch = applyHexToSettings(
                    outputSettings,
                    hex,
                    outputLedCount,
                    outputDeviceModel
                  );
                  if (patch) updateSettings(patch);
                }}
                onClearHistory={clearHistory}
                scanning={scanning}
                connecting={connecting}
                portFilter={portFilter}
                onPortFilterChange={setPortFilter}
                externalState={externalState}
                onExternalScan={handleExternalScan}
                onExternalConnect={handleExternalConnect}
                onExternalDisconnect={handleExternalDisconnect}
                externalScanning={externalScanning}
                externalConnecting={externalConnecting}
                externalConnected={externalConnected}
              />

              {showExternalTriangleLayout ? (
                <ExternalTriangleLayoutPanel
                  device={activeExternalDevice}
                  settings={outputSettings}
                  onChange={updateSettings}
                />
              ) : null}

              {colorControls}
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
