import { useCallback, useMemo } from "react";
import {
  buildActiveExternalSettingsPatch,
  getActiveExternalDevice,
  getActiveExternalDeviceSettings,
  listExternalConfigDeviceIds,
} from "../lib/externalLedSettings";
import { parseExternalDeviceModel } from "../lib/externalDeviceProfile";
import { resolveExternalLayout } from "../lib/externalLedLayout";

export function useColorOutput({
  activeNav,
  settings,
  saveSettings,
  skydimoConnected,
  skydimoLedCount,
  skydimoDeviceModel,
  skydimoLedOn,
  setSkydimoLedOn,
  setPixels,
  externalState,
  externalSetPixels,
  externalSetPower,
  externalSetAnimation,
  externalSetBrightness,
}) {
  const isExternalOutput = activeNav === "external";
  const activeExternalDevice = getActiveExternalDevice(settings);
  const activeExternalDeviceId = settings?.externalLeds?.activeDeviceId ?? null;
  const configDeviceIds = useMemo(
    () => (isExternalOutput ? listExternalConfigDeviceIds(settings) : []),
    [isExternalOutput, settings]
  );
  const externalRuntime = externalState?.devices?.find(
    (device) => device.id === activeExternalDeviceId
  );
  const connectedConfigDeviceIds = useMemo(() => {
    if (!isExternalOutput) {
      return [];
    }
    return configDeviceIds.filter((id) =>
      Boolean(externalState?.devices?.find((device) => device.id === id)?.connected)
    );
  }, [isExternalOutput, configDeviceIds, externalState?.devices]);
  const activeDeviceConnected = Boolean(
    activeExternalDeviceId &&
      externalState?.devices?.find((device) => device.id === activeExternalDeviceId)?.connected
  );
  const externalConnected =
    connectedConfigDeviceIds.length > 0 || activeDeviceConnected;

  const outputSettings = useMemo(() => {
    if (!isExternalOutput || !activeExternalDevice) {
      return settings;
    }
    const deviceSettings = getActiveExternalDeviceSettings(settings);
    return {
      ...settings,
      ...deviceSettings,
    };
  }, [isExternalOutput, activeExternalDevice, settings]);

  const outputLedCount = isExternalOutput && activeExternalDevice
    ? resolveExternalLayout(activeExternalDevice).ledCount
    : skydimoLedCount;

  const outputDeviceModel = isExternalOutput
    ? activeExternalDevice?.deviceModel ||
      parseExternalDeviceModel(activeExternalDevice?.name) ||
      "EXTERNAL"
    : skydimoDeviceModel;
  const outputConnected = isExternalOutput ? externalConnected : skydimoConnected;
  const outputLedOn = isExternalOutput
    ? activeExternalDevice?.ledOn !== false
    : skydimoLedOn;

  const updateOutputSettings = useCallback(
    (patch) => {
      if (isExternalOutput) {
        saveSettings(buildActiveExternalSettingsPatch(settings, patch));
        return;
      }
      saveSettings(patch);
    },
    [isExternalOutput, settings, saveSettings]
  );

  const setOutputLedOn = useCallback(
    (nextOn) => {
      if (isExternalOutput) {
        saveSettings(buildActiveExternalSettingsPatch(settings, { ledOn: nextOn }));
        return;
      }
      setSkydimoLedOn(nextOn);
    },
    [isExternalOutput, settings, saveSettings, setSkydimoLedOn]
  );

  const outputSetPixels = useCallback(
    async (pixels, count) => {
      if (isExternalOutput) {
        const targets = connectedConfigDeviceIds.length
          ? connectedConfigDeviceIds
          : activeExternalDeviceId
            ? [activeExternalDeviceId]
            : [];
        if (!targets.length) {
          throw new Error("No external device selected");
        }
        const brightness = outputSettings.brightness ?? 100;
        for (const deviceId of targets) {
          await externalSetPixels(deviceId, pixels, brightness);
        }
        return;
      }
      await setPixels(pixels, count);
    },
    [
      isExternalOutput,
      connectedConfigDeviceIds,
      activeExternalDeviceId,
      externalSetPixels,
      outputSettings.brightness,
      setPixels,
    ]
  );

  const outputSetPower = useCallback(
    async (powerOn) => {
      if (!isExternalOutput || !externalSetPower) {
        return;
      }
      const targets = connectedConfigDeviceIds.length
        ? connectedConfigDeviceIds
        : activeExternalDeviceId
          ? [activeExternalDeviceId]
          : [];
      for (const deviceId of targets) {
        await externalSetPower(deviceId, powerOn);
      }
    },
    [isExternalOutput, connectedConfigDeviceIds, activeExternalDeviceId, externalSetPower]
  );

  const outputSetAnimation = useCallback(
    async (mode, speed) => {
      if (!isExternalOutput || !externalSetAnimation) {
        return;
      }
      const targets = connectedConfigDeviceIds.length
        ? connectedConfigDeviceIds
        : activeExternalDeviceId
          ? [activeExternalDeviceId]
          : [];
      if (!targets.length) {
        throw new Error("No external device selected");
      }
      for (const deviceId of targets) {
        await externalSetAnimation(deviceId, mode, speed);
      }
    },
    [
      isExternalOutput,
      connectedConfigDeviceIds,
      activeExternalDeviceId,
      externalSetAnimation,
    ]
  );

  const outputSetBrightness = useCallback(
    async (brightness) => {
      if (!isExternalOutput || !externalSetBrightness) {
        return;
      }
      const targets = connectedConfigDeviceIds.length
        ? connectedConfigDeviceIds
        : activeExternalDeviceId
          ? [activeExternalDeviceId]
          : [];
      if (!targets.length) {
        throw new Error("No external device selected");
      }
      for (const deviceId of targets) {
        await externalSetBrightness(deviceId, brightness);
      }
    },
    [
      isExternalOutput,
      connectedConfigDeviceIds,
      activeExternalDeviceId,
      externalSetBrightness,
    ]
  );

  return {
    isExternalOutput,
    activeExternalDevice,
    activeExternalDeviceId,
    configDeviceIds,
    connectedConfigDeviceIds,
    externalRuntime,
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
  };
}
