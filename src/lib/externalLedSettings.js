import { sanitizeSettings } from "./settingsSanitize";
import { buildExternalDeviceRegistration, parseExternalDeviceModel } from "./externalDeviceProfile";
import {
  EXTERNAL_LAYOUT_KINDS,
  resolveExternalLayout,
  sanitizeLayoutKind,
} from "./externalLedLayout";
import { sanitizeTrianglePanels } from "./externalTriangleLayout";
import { sanitizeTriangleWire } from "./externalTriangleWire";
import { migrateTrianglePowerSettings } from "./externalTrianglePowerGraph";
import { TRIANGLE_LAYOUT_VERSION } from "./externalTrianglePose";
import {
  canAddDeviceToConfigGroup,
  getExternalDeviceConfigGroupKey,
  getExternalDeviceConfigGroupLabel,
  listBulkGroupDeviceIds,
  listExternalConfigDeviceIds as listConfigIdsFromExternal,
  reorderDeviceIds,
  resolveSmartBulkSelection,
  sanitizeConfigDeviceIds,
  sanitizeDeviceOrder,
  sortExternalDevicesByOrder,
  summarizeBulkSelection,
} from "./externalLedSelection";

export {
  getExternalDeviceConfigGroupKey,
  getExternalDeviceConfigGroupLabel,
  canAddDeviceToConfigGroup,
  listBulkGroupDeviceIds,
  reorderDeviceIds,
  resolveSmartBulkSelection,
  sanitizeDeviceOrder,
  shouldSwitchBulkConfigGroup,
  sortExternalDevicesByOrder,
  summarizeBulkSelection,
} from "./externalLedSelection";

export const DEFAULT_EXTERNAL_LED_COUNT = 1;

export const DEFAULT_EXTERNAL_DEVICE_SETTINGS = {
  customName: "",
  deviceModel: null,
  layoutKind: EXTERNAL_LAYOUT_KINDS.STRIP,
  triangleCount: 4,
  trianglePanels: null,
  triangleWire: null,
  triangleWirePanelOrder: null,
  triangleLayoutVersion: null,
  trianglePowerRootId: null,
  triangleActiveLinks: null,
  trianglePowerInjectors: null,
  stripLedCount: 30,
  ledCount: DEFAULT_EXTERNAL_LED_COUNT,
  ledCountSource: "auto",
  singleZone: true,
  ledOn: true,
  hex: "#FFD700",
  brightness: 100,
  livePreview: true,
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
  animationId: null,
  bleEffectId: null,
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
  everConnected: false,
};

export const DEFAULT_EXTERNAL_LEDS = {
  activeDeviceId: null,
  configDeviceIds: [],
  deviceOrder: [],
  autoConnect: true,
  devices: {},
};

function normalizeDeviceId(value) {
  return String(value || "").trim().toLowerCase();
}

export function sanitizeExternalDeviceSettings(settings, defaults = DEFAULT_EXTERNAL_DEVICE_SETTINGS) {
  const sanitized = sanitizeSettings(
    {
      ...defaults,
      ...(settings && typeof settings === "object" ? settings : {}),
    },
    defaults
  );

  const layoutKind = sanitizeLayoutKind(settings?.layoutKind);
  const triangleCount = Math.max(
    1,
    Math.min(64, Math.round(Number(settings?.triangleCount) || 4))
  );
  const stripLedCount = Math.max(
    1,
    Math.min(512, Math.round(Number(settings?.stripLedCount ?? settings?.ledCount) || 30))
  );
  const layout = resolveExternalLayout({
    ...settings,
    layoutKind,
    triangleCount,
    trianglePanels: settings?.trianglePanels,
    ledCount: settings?.ledCount,
    stripLedCount,
  });
  const trianglePanels =
    layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE
      ? sanitizeTrianglePanels(settings?.trianglePanels, layout.triangleCount)
      : null;
  const triangleWire =
    layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE
      ? sanitizeTriangleWire(settings?.triangleWire)
      : null;
  const trianglePower =
    layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE && trianglePanels
      ? migrateTrianglePowerSettings(trianglePanels, settings)
      : null;

  return {
    ...sanitized,
    customName:
      typeof settings?.customName === "string" ? settings.customName.slice(0, 64) : "",
    deviceModel:
      typeof settings?.deviceModel === "string" && settings.deviceModel.trim()
        ? settings.deviceModel.trim().toUpperCase()
        : parseExternalDeviceModel(settings?.name) || null,
    layoutKind: layout.layoutKind,
    triangleCount: layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE ? trianglePanels.length : null,
    trianglePanels,
    triangleWire,
    triangleWirePanelOrder: null,
    triangleLayoutVersion:
      layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE ? TRIANGLE_LAYOUT_VERSION : null,
    trianglePowerRootId: trianglePower?.trianglePowerRootId ?? null,
    triangleActiveLinks: trianglePower?.triangleActiveLinks ?? null,
    trianglePowerInjectors: trianglePower?.trianglePowerInjectors ?? null,
    stripLedCount: layout.layoutKind === EXTERNAL_LAYOUT_KINDS.STRIP ? layout.ledCount : stripLedCount,
    ledCount: layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE
      ? trianglePanels.length * 3
      : layout.ledCount,
    ledCountSource: settings?.ledCountSource === "manual" ? "manual" : "auto",
    singleZone: settings?.singleZone !== false,
    ledOn: settings?.ledOn !== false,
    everConnected: settings?.everConnected === true,
  };
}

export function sanitizeExternalLeds(externalLeds, defaults = DEFAULT_EXTERNAL_LEDS) {
  const base = {
    ...DEFAULT_EXTERNAL_LEDS,
    ...defaults,
    ...(externalLeds && typeof externalLeds === "object" ? externalLeds : {}),
  };

  const devices = {};
  const sourceDevices =
    base.devices && typeof base.devices === "object" && !Array.isArray(base.devices)
      ? base.devices
      : {};

  for (const [rawId, rawSettings] of Object.entries(sourceDevices)) {
    const id = normalizeDeviceId(rawId);
    if (!id) {
      continue;
    }
    devices[id] = {
      ...sanitizeExternalDeviceSettings(rawSettings),
      id,
      name: typeof rawSettings?.name === "string" ? rawSettings.name : "External LED",
      address: typeof rawSettings?.address === "string" ? rawSettings.address : null,
      deviceModel:
        typeof rawSettings?.deviceModel === "string"
          ? rawSettings.deviceModel
          : parseExternalDeviceModel(rawSettings?.name),
      everConnected: rawSettings?.everConnected === true,
    };
  }

  const activeDeviceId = normalizeDeviceId(base.activeDeviceId);
  const configDeviceIds = sanitizeConfigDeviceIds(base.configDeviceIds, devices, activeDeviceId);
  const resolvedActiveId =
    activeDeviceId && devices[activeDeviceId]
      ? activeDeviceId
      : configDeviceIds[0] || null;
  const deviceOrder = sanitizeDeviceOrder(base.deviceOrder, Object.keys(devices));

  return {
    activeDeviceId: resolvedActiveId,
    configDeviceIds,
    deviceOrder,
    autoConnect: base.autoConnect !== false,
    devices,
  };
}

export function getExternalDevice(settings, deviceId) {
  const id = normalizeDeviceId(deviceId);
  if (!id) {
    return null;
  }
  return settings?.externalLeds?.devices?.[id] ?? null;
}

export function getActiveExternalDevice(settings) {
  const activeId = settings?.externalLeds?.activeDeviceId;
  if (!activeId) {
    return null;
  }
  return getExternalDevice(settings, activeId);
}

export function getActiveExternalDeviceSettings(settings) {
  const device = getActiveExternalDevice(settings);
  if (!device) {
    return null;
  }
  const { id, name, address, customName, deviceModel, ledCountSource, singleZone, ...deviceSettings } = device;
  return deviceSettings;
}

export function buildExternalLedsPatch(settings, patch = {}) {
  const current = sanitizeExternalLeds(settings?.externalLeds);
  return {
    externalLeds: sanitizeExternalLeds({
      ...current,
      ...patch,
      devices: {
        ...current.devices,
        ...(patch.devices || {}),
      },
    }),
  };
}

export function buildExternalDeviceSettingsPatch(settings, deviceId, patch = {}) {
  const id = normalizeDeviceId(deviceId);
  const current = sanitizeExternalLeds(settings?.externalLeds);
  const existing = current.devices[id] || {
    ...sanitizeExternalDeviceSettings({}),
    id,
    name: "External LED",
    address: null,
  };

  const mergedInput = {
    ...existing,
    ...patch,
  };

  if (patch.hex) {
    mergedInput.modeColors = {
      ...(existing.modeColors || {}),
      single: { hex: patch.hex },
    };
  }

  const merged = sanitizeExternalDeviceSettings(mergedInput);

  return buildExternalLedsPatch(settings, {
    activeDeviceId: current.activeDeviceId || id,
    devices: {
      [id]: {
        ...existing,
        ...merged,
        id,
        name: patch.name ?? existing.name,
        address: patch.address ?? existing.address,
        customName: patch.customName ?? merged.customName,
        deviceModel: patch.deviceModel ?? merged.deviceModel ?? existing.deviceModel,
        ledCountSource: patch.ledCountSource ?? merged.ledCountSource ?? existing.ledCountSource,
        singleZone: patch.singleZone ?? merged.singleZone ?? existing.singleZone,
        everConnected: patch.everConnected ?? merged.everConnected ?? existing.everConnected,
      },
    },
  });
}

export function buildActiveExternalSettingsPatch(settings, patch = {}) {
  const ids = listExternalConfigDeviceIds(settings);
  if (ids.length > 1) {
    return buildBulkExternalDevicesSettingsPatch(settings, patch);
  }
  const activeId = settings?.externalLeds?.activeDeviceId;
  if (ids.length === 1) {
    const targetId = activeId && ids.includes(activeId) ? activeId : ids[0];
    return buildExternalDeviceSettingsPatch(settings, targetId, patch);
  }
  if (!activeId) {
    return {};
  }
  return buildExternalDeviceSettingsPatch(settings, activeId, patch);
}

export function buildSelectExternalDevicePatch(settings, deviceId) {
  const id = normalizeDeviceId(deviceId);
  const current = sanitizeExternalLeds(settings?.externalLeds);
  if (!id || !current.devices[id]) {
    return {};
  }
  return buildExternalLedsPatch(settings, { activeDeviceId: id });
}

export function buildRegisterExternalDevicePatch(settings, device) {
  const id = normalizeDeviceId(device?.id);
  if (!id) {
    return {};
  }

  const current = sanitizeExternalLeds(settings?.externalLeds);
  const existing = current.devices[id];
  const defaults = sanitizeExternalDeviceSettings(existing || {});
  const registration = buildExternalDeviceRegistration(device, existing);

  return buildExternalLedsPatch(settings, {
    activeDeviceId: id,
    devices: {
      [id]: {
        ...defaults,
        ...registration,
        id,
        name: device?.name || existing?.name || "External LED",
        address: device?.address || existing?.address || null,
        customName: existing?.customName || "",
        everConnected: existing?.everConnected === true,
      },
    },
  });
}

export function listExternalConfigDeviceIds(settings) {
  return listConfigIdsFromExternal(sanitizeExternalLeds(settings?.externalLeds));
}

export function getSelectedExternalDevices(settings) {
  const external = sanitizeExternalLeds(settings?.externalLeds);
  return listExternalConfigDeviceIds(settings)
    .map((id) => external.devices[id])
    .filter(Boolean);
}

export function buildBulkExternalDevicesSettingsPatch(settings, patch = {}) {
  const ids = listExternalConfigDeviceIds(settings);
  if (!ids.length) {
    return buildActiveExternalSettingsPatch(settings, patch);
  }

  let next = settings;
  for (const id of ids) {
    next = {
      ...next,
      ...buildExternalDeviceSettingsPatch(next, id, patch),
    };
  }
  return { externalLeds: sanitizeExternalLeds(next.externalLeds) };
}

export function buildFocusExternalDevicePatch(settings, device) {
  const registerPatch = buildRegisterExternalDevicePatch(settings, device);
  const merged = { ...settings, ...registerPatch };
  const id = normalizeDeviceId(device?.id);
  const external = sanitizeExternalLeds(merged.externalLeds);
  const entry = external.devices[id];
  if (!entry) {
    return registerPatch;
  }

  return buildExternalLedsPatch(merged, {
    activeDeviceId: id,
    configDeviceIds: [id],
  });
}

export function buildBulkFocusDevicePatch(settings, deviceId) {
  const id = normalizeDeviceId(deviceId);
  const configDeviceIds = listExternalConfigDeviceIds(settings);
  if (!id || !configDeviceIds.includes(id)) {
    return {};
  }
  return buildExternalLedsPatch(settings, { activeDeviceId: id });
}

export function buildExternalDeviceOrderPatch(settings, orderedIds) {
  const visibleIds = Array.isArray(orderedIds)
    ? orderedIds.map(normalizeDeviceId).filter(Boolean)
    : [];

  return buildExternalLedsPatch(settings, {
    deviceOrder: sanitizeDeviceOrder(visibleIds, visibleIds),
  });
}

export function buildToggleExternalConfigDevicePatch(
  settings,
  deviceId,
  checked,
  devicesById = null
) {
  const id = normalizeDeviceId(deviceId);
  const external = sanitizeExternalLeds(settings?.externalLeds);
  if (!id || !external.devices[id]) {
    return {};
  }

  const deviceMap = devicesById || external.devices;
  let configDeviceIds = listExternalConfigDeviceIds(settings);
  const entry = { ...external.devices[id], ...deviceMap[id], id };
  const groupKey = getExternalDeviceConfigGroupKey(entry);

  if (checked) {
    if (configDeviceIds.length) {
      const currentGroup = getExternalDeviceConfigGroupKey(external.devices[configDeviceIds[0]]);
      if (groupKey !== currentGroup) {
        configDeviceIds = resolveSmartBulkSelection(deviceMap, entry);
        return buildExternalLedsPatch(settings, {
          activeDeviceId: id,
          configDeviceIds,
        });
      }
    }

    if (!configDeviceIds.includes(id)) {
      configDeviceIds = configDeviceIds.length
        ? [...configDeviceIds, id]
        : resolveSmartBulkSelection(deviceMap, entry);
    }
  } else {
    configDeviceIds = configDeviceIds.filter((item) => item !== id);
  }

  return buildExternalLedsPatch(settings, {
    activeDeviceId: external.activeDeviceId,
    configDeviceIds,
  });
}

export function buildBulkConfigSelectionPatch(settings, mode, devicesById = null) {
  const external = sanitizeExternalLeds(settings?.externalLeds);
  const deviceMap = devicesById || external.devices;

  if (mode === "clear") {
    return buildExternalLedsPatch(settings, { configDeviceIds: [] });
  }

  const anchorId =
    external.activeDeviceId ||
    listExternalConfigDeviceIds(settings)[0] ||
    null;
  const anchor = (anchorId && deviceMap[anchorId]) || (anchorId && external.devices[anchorId]);
  if (!anchor) {
    return {};
  }

  const configDeviceIds =
    mode === "connected"
      ? listBulkGroupDeviceIds(deviceMap, anchor, { connectedOnly: true })
      : listBulkGroupDeviceIds(deviceMap, anchor);

  return buildExternalLedsPatch(settings, { configDeviceIds });
}

export function buildAutoAddConnectedDeviceToBulkPatch(settings, deviceId, devicesById = null) {
  const id = normalizeDeviceId(deviceId);
  const external = sanitizeExternalLeds(settings?.externalLeds);
  const configDeviceIds = listExternalConfigDeviceIds(settings);
  if (!id || configDeviceIds.length <= 1) {
    return {};
  }

  const deviceMap = devicesById || external.devices;
  const device = { ...external.devices[id], ...deviceMap[id], id };
  if (!device.connected || configDeviceIds.includes(id)) {
    return {};
  }

  const anchor = external.devices[configDeviceIds[0]];
  if (getExternalDeviceConfigGroupKey(device) !== getExternalDeviceConfigGroupKey(anchor)) {
    return {};
  }

  return buildExternalLedsPatch(settings, {
    configDeviceIds: [...configDeviceIds, id],
  });
}

export function buildExternalLedsAutoConnectPatch(settings, autoConnect) {
  return buildExternalLedsPatch(settings, { autoConnect: autoConnect !== false });
}

export function buildExternalDeviceManualConnectPatch(settings, deviceId) {
  return buildExternalDeviceSettingsPatch(settings, deviceId, { everConnected: true });
}

export function listPreviouslyConnectedExternalDeviceIds(settings) {
  const external = sanitizeExternalLeds(settings?.externalLeds);
  return Object.entries(external.devices)
    .filter(([, device]) => device.everConnected === true)
    .map(([id]) => id);
}

export function resolveExternalAutoConnectTargetId(settings) {
  const external = sanitizeExternalLeds(settings?.externalLeds);
  const candidates = listPreviouslyConnectedExternalDeviceIds(settings);
  if (!candidates.length) {
    return null;
  }
  if (external.activeDeviceId && candidates.includes(external.activeDeviceId)) {
    return external.activeDeviceId;
  }
  return candidates[0];
}

export function listSavedExternalDeviceIds(settings) {
  return Object.keys(sanitizeExternalLeds(settings?.externalLeds).devices);
}

export function getExternalDeviceLabel(device) {
  if (!device) {
    return "External LED";
  }
  const customName =
    typeof device.customName === "string" ? device.customName.trim() : "";
  if (customName) {
    return customName;
  }
  if (device.name) {
    return device.name;
  }
  return device.id;
}
