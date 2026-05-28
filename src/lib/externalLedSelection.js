import { parseExternalDeviceModel } from "./externalDeviceProfile";
import {
  EXTERNAL_LAYOUT_KINDS,
  resolveExternalLayout,
  sanitizeLayoutKind,
} from "./externalLedLayout";

function normalizeDeviceId(value) {
  return String(value || "").trim().toLowerCase();
}

export function getExternalDeviceConfigGroupKey(device) {
  if (!device) {
    return null;
  }
  const layoutKind = sanitizeLayoutKind(device.layoutKind);
  const model =
    (typeof device.deviceModel === "string" && device.deviceModel.trim()) ||
    parseExternalDeviceModel(device?.name) ||
    "GENERIC";
  return `${layoutKind}:${String(model).toUpperCase()}`;
}

export function getExternalDeviceConfigGroupLabel(device) {
  if (!device) {
    return "External LED";
  }
  const layout = resolveExternalLayout(device);
  const model =
    device.deviceModel || parseExternalDeviceModel(device.name) || "Generic";
  const layoutLabel =
    layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE ? "Triangle chain" : "Wire strip";
  return `${layoutLabel} · ${model}`;
}

export function sanitizeConfigDeviceIds(configDeviceIds, devices, activeDeviceId) {
  const ids = Array.isArray(configDeviceIds)
    ? [...new Set(configDeviceIds.map(normalizeDeviceId).filter((id) => devices[id]))]
    : [];

  if (!ids.length) {
    return [];
  }

  const firstGroup = getExternalDeviceConfigGroupKey(devices[ids[0]]);
  return ids.filter(
    (id) => getExternalDeviceConfigGroupKey(devices[id]) === firstGroup
  );
}

export function canAddDeviceToConfigGroup(configDeviceIds, devicesById, device) {
  const id = normalizeDeviceId(device?.id);
  const target = (id && devicesById?.[id]) || device;
  if (!target) {
    return false;
  }
  if (!configDeviceIds.length) {
    return true;
  }
  const targetGroup = getExternalDeviceConfigGroupKey(target);
  const anchor = devicesById?.[configDeviceIds[0]] || devicesById?.[configDeviceIds[0]];
  if (!anchor) {
    return true;
  }
  const currentGroup = getExternalDeviceConfigGroupKey(anchor);
  return targetGroup === currentGroup;
}

export function listBulkGroupDeviceIds(devicesById, anchorDevice, options = {}) {
  const groupKey = getExternalDeviceConfigGroupKey(anchorDevice);
  if (!groupKey || !devicesById) {
    return [];
  }

  const connectedOnly = options.connectedOnly === true;
  return Object.entries(devicesById)
    .filter(([, device]) => {
      if (getExternalDeviceConfigGroupKey(device) !== groupKey) {
        return false;
      }
      if (connectedOnly && !device.connected) {
        return false;
      }
      return true;
    })
    .map(([id]) => normalizeDeviceId(id))
    .filter(Boolean);
}

export function resolveSmartBulkSelection(devicesById, anchorDevice) {
  const anchorId = normalizeDeviceId(anchorDevice?.id);
  if (!anchorId) {
    return [];
  }

  const connectedIds = listBulkGroupDeviceIds(devicesById, anchorDevice, {
    connectedOnly: true,
  });

  if (anchorDevice.connected) {
    return connectedIds.length > 0 ? connectedIds : [anchorId];
  }

  return [anchorId];
}

export function shouldSwitchBulkConfigGroup(configDeviceIds, devicesById, device) {
  if (!configDeviceIds.length) {
    return false;
  }
  return !canAddDeviceToConfigGroup(configDeviceIds, devicesById, device);
}

export function summarizeBulkSelection(devicesById, configDeviceIds, activeDeviceId) {
  const selectedIds = Array.isArray(configDeviceIds)
    ? configDeviceIds.map(normalizeDeviceId).filter(Boolean)
    : [];
  if (!selectedIds.length || !devicesById) {
    return null;
  }

  const anchor = devicesById[selectedIds[0]];
  if (!anchor) {
    return null;
  }

  const groupIds = listBulkGroupDeviceIds(devicesById, anchor);
  const selectedSet = new Set(selectedIds);
  const unselectedGroupIds = groupIds.filter((id) => !selectedSet.has(id));
  const unselectedConnected = unselectedGroupIds.filter((id) => devicesById[id]?.connected);
  const unselectedOffline = unselectedGroupIds.filter((id) => !devicesById[id]?.connected);
  const selectedConnected = selectedIds.filter((id) => devicesById[id]?.connected).length;
  const selectedOffline = selectedIds.length - selectedConnected;
  const normalizedActive = normalizeDeviceId(activeDeviceId);

  return {
    groupLabel: getExternalDeviceConfigGroupLabel(anchor),
    selectedIds,
    selectedConnected,
    selectedOffline,
    groupTotal: groupIds.length,
    groupConnected: groupIds.filter((id) => devicesById[id]?.connected).length,
    unselectedConnected,
    unselectedOffline,
    unselectedGroupIds,
    isAllGroupSelected: unselectedGroupIds.length === 0,
    isMultiBulk: selectedIds.length > 1,
    focusDeviceId:
      normalizedActive && selectedSet.has(normalizedActive) ? normalizedActive : selectedIds[0],
  };
}

export function listExternalConfigDeviceIds(externalLeds) {
  const activeDeviceId = normalizeDeviceId(externalLeds?.activeDeviceId);
  const devices = externalLeds?.devices || {};
  return sanitizeConfigDeviceIds(externalLeds?.configDeviceIds, devices, activeDeviceId);
}

export function sanitizeDeviceOrder(deviceOrder, deviceIds) {
  const available = new Set(
    (Array.isArray(deviceIds) ? deviceIds : [])
      .map(normalizeDeviceId)
      .filter(Boolean)
  );
  const seen = new Set();
  const sanitized = [];

  if (Array.isArray(deviceOrder)) {
    for (const rawId of deviceOrder) {
      const id = normalizeDeviceId(rawId);
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      sanitized.push(id);
    }
  }

  const fallback = [...available].sort((left, right) => left.localeCompare(right));
  for (const id of fallback) {
    if (!seen.has(id)) {
      sanitized.push(id);
    }
  }

  return sanitized;
}

export function sortExternalDevicesByOrder(devices, deviceOrder) {
  const ids = devices.map((device) => device.id);
  const order = sanitizeDeviceOrder(deviceOrder, ids);
  const rank = new Map(order.map((id, index) => [id, index]));

  return [...devices].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return String(left.id).localeCompare(String(right.id));
  });
}

export function reorderDeviceIds(order, dragId, targetId) {
  const normalizedDrag = normalizeDeviceId(dragId);
  const normalizedTarget = normalizeDeviceId(targetId);
  const current = Array.isArray(order) ? order.map(normalizeDeviceId).filter(Boolean) : [];

  if (!normalizedDrag || !normalizedTarget || normalizedDrag === normalizedTarget) {
    return current;
  }

  const withoutDragged = current.filter((id) => id !== normalizedDrag);
  const targetIndex = withoutDragged.indexOf(normalizedTarget);
  if (targetIndex === -1) {
    return [...withoutDragged, normalizedDrag];
  }

  withoutDragged.splice(targetIndex, 0, normalizedDrag);
  return withoutDragged;
}
