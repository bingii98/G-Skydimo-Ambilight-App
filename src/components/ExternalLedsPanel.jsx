import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBluetooth,
  IconBluetoothConnected,
  IconBookmark,
  IconGripVertical,
  IconLine,
  IconPlugConnectedX,
  IconRefresh,
  IconTriangle,
} from "@tabler/icons-react";
import {
  buildBulkConfigSelectionPatch,
  buildBulkFocusDevicePatch,
  buildExternalDeviceOrderPatch,
  buildExternalLedsAutoConnectPatch,
  buildFocusExternalDevicePatch,
  buildToggleExternalConfigDevicePatch,
  getExternalDeviceLabel,
  listExternalConfigDeviceIds,
  reorderDeviceIds,
  sanitizeDeviceOrder,
  shouldSwitchBulkConfigGroup,
  sortExternalDevicesByOrder,
  summarizeBulkSelection,
} from "../lib/externalLedSettings";
import {
  EXTERNAL_LAYOUT_KINDS,
  resolveExternalLayout,
} from "../lib/externalLedLayout";
import { ensureHex } from "../lib/colorUtils";
import { SectionLabel } from "./ui/AppPanel";

function rssiToBars(rssi) {
  if (typeof rssi !== "number" || !Number.isFinite(rssi)) {
    return 0;
  }
  if (rssi >= -55) {
    return 4;
  }
  if (rssi >= -68) {
    return 3;
  }
  if (rssi >= -80) {
    return 2;
  }
  if (rssi >= -92) {
    return 1;
  }
  return 0;
}

function formatBleAddress(address) {
  if (!address) {
    return null;
  }
  const normalized = String(address).trim().toUpperCase();
  if (normalized.length <= 8) {
    return normalized;
  }
  return normalized.slice(-8).replace(/(.{2})(?=.)/g, "$1:");
}

const DRAG_MIME = "application/x-external-device-id";
const BULK_CHIP_LIMIT = 4;

function ExternalBulkSummary({ summary, devicesById, onFocusDevice, onBulkSelection, onClear }) {
  if (!summary) {
    return null;
  }

  const {
    groupLabel,
    selectedIds,
    selectedConnected,
    selectedOffline,
    groupTotal,
    unselectedConnected,
    unselectedOffline,
    isAllGroupSelected,
    isMultiBulk,
    focusDeviceId,
  } = summary;

  const statusParts = [];
  if (selectedConnected) {
    statusParts.push(`${selectedConnected} live`);
  }
  if (selectedOffline) {
    statusParts.push(`${selectedOffline} offline`);
  }

  let hint = "Layout, color, brightness, and power apply to all checked devices.";
  if (!isMultiBulk) {
    hint = "Check another same-type device to bulk apply changes together.";
  } else if (selectedConnected === 0) {
    hint = "No selected devices are connected. Connect a device to send colors.";
  } else if (selectedConnected < selectedIds.length) {
    hint = `${selectedConnected} of ${selectedIds.length} selected devices are live and receive color updates.`;
  } else if (unselectedConnected.length) {
    hint = `${unselectedConnected.length} connected same-type device${unselectedConnected.length === 1 ? "" : "s"} not in bulk yet.`;
  } else if (unselectedOffline.length && !isAllGroupSelected) {
    hint = `${unselectedOffline.length} offline same-type device${unselectedOffline.length === 1 ? "" : "s"} not selected.`;
  }

  const visibleChipIds = selectedIds.slice(0, BULK_CHIP_LIMIT);
  const hiddenChipCount = Math.max(0, selectedIds.length - visibleChipIds.length);

  return (
    <div className="external-config-summary">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <div className="external-config-summary__head">
          <Text size="sm" fw={600}>
            {isMultiBulk ? `Bulk · ${selectedIds.length} devices` : "Bulk ready · 1 device"}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {groupLabel}
            {statusParts.length ? ` · ${statusParts.join(" · ")}` : ""}
          </Text>
          <Text size="xs" c="dimmed" mt={4} lh={1.45}>
            {hint}
          </Text>
        </div>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onClear}>
          Clear
        </Button>
      </Group>

      {isMultiBulk ? (
        <div className="external-config-summary__chips">
          {visibleChipIds.map((deviceId) => {
            const device = devicesById[deviceId];
            const label = getExternalDeviceLabel(device);
            const connected = Boolean(device?.connected);
            const focused = deviceId === focusDeviceId;
            return (
              <button
                key={deviceId}
                type="button"
                className={[
                  "external-config-summary__chip",
                  focused ? "external-config-summary__chip--focus" : "",
                  connected ? "external-config-summary__chip--live" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onFocusDevice(deviceId)}
                aria-pressed={focused}
              >
                <span
                  className={[
                    "external-config-summary__chip-dot",
                    connected ? "external-config-summary__chip-dot--live" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden
                />
                <span className="external-config-summary__chip-label">{label}</span>
              </button>
            );
          })}
          {hiddenChipCount ? (
            <span className="external-config-summary__chip external-config-summary__chip--more">
              +{hiddenChipCount} more
            </span>
          ) : null}
        </div>
      ) : null}

      {groupTotal > 1 ? (
        <Group gap={6} mt={8} className="external-config-summary__actions">
          {unselectedConnected.length ? (
            <Button
              size="compact-xs"
              variant="light"
              color="grape"
              onClick={() => onBulkSelection("connected")}
            >
              Add connected ({unselectedConnected.length})
            </Button>
          ) : null}
          {!isAllGroupSelected ? (
            <Button size="compact-xs" variant="light" color="grape" onClick={() => onBulkSelection("all")}>
              All same type ({groupTotal})
            </Button>
          ) : null}
        </Group>
      ) : null}
    </div>
  );
}

function SignalBars({ rssi }) {
  const level = rssiToBars(rssi);
  return (
    <span className="external-device-row__signal" aria-label={level ? `${rssi} dBm` : "No signal"}>
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={`external-device-row__signal-bar${bar <= level ? " external-device-row__signal-bar--on" : ""}`}
          style={{ "--signal-height": `${bar * 22}%` }}
        />
      ))}
    </span>
  );
}

function ExternalDeviceRow({
  device,
  focus,
  inConfig,
  inBulkGroup,
  bulkEligible,
  bulkInactive,
  configSwitchGroup,
  saved,
  dragging,
  dropTarget,
  onFocus,
  onToggleConfig,
  onConnect,
  onDisconnect,
  connecting,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDrop,
}) {
  const label = getExternalDeviceLabel(device);
  const layout = resolveExternalLayout(device);
  const layoutLabel = layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE ? "Triangle" : "Strip";
  const LayoutIcon =
    layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE ? IconTriangle : IconLine;
  const previewColor = ensureHex(device.hex, "#14b8a6");
  const address = formatBleAddress(device.address);
  const isConnected = Boolean(device.connected);
  const model = device.deviceModel || device.name || "BLE LED";
  const signalLabel =
    typeof device.rssi === "number" ? `${device.rssi} dBm` : "Signal unavailable";
  const detailParts = [model, layoutLabel, layout.unitLabel];
  if (address) {
    detailParts.push(address);
  }

  const rowClassName = [
    "external-device-row",
    isConnected ? "external-device-row--connected" : "",
    inBulkGroup ? "external-device-row--bulk" : "",
    bulkEligible ? "external-device-row--bulk-eligible" : "",
    bulkInactive ? "external-device-row--bulk-inactive" : "",
    focus ? "external-device-row--focus" : "",
    dragging ? "external-device-row--dragging" : "",
    dropTarget ? "external-device-row--drop-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={rowClassName}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className={[
          "external-device-row__card",
          focus ? "external-device-row__card--selected" : "",
          inBulkGroup ? "external-device-row__card--bulk" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onFocus(device.id)}
        onDoubleClick={() => (isConnected ? onDisconnect(device.id) : onConnect(device.id))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onFocus(device.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-pressed={focus}
      >
        <Tooltip label="Drag to reorder">
          <div
            className="external-device-row__drag"
            draggable
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(DRAG_MIME, device.id);
              onDragStart(device.id);
            }}
            onDragEnd={(event) => {
              event.stopPropagation();
              onDragEnd();
            }}
            aria-label={`Reorder ${label}`}
          >
            <IconGripVertical size={16} stroke={1.75} />
          </div>
        </Tooltip>

        <Tooltip
          label={
            configSwitchGroup && !inConfig
              ? "Switch bulk group to this device type"
              : inConfig
                ? "Remove from bulk configuration"
                : "Add to bulk configuration (includes connected devices of the same type)"
          }
        >
          <div
            className="external-device-row__check"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={inConfig}
              onChange={(event) => onToggleConfig(device.id, event.currentTarget.checked)}
              aria-label={`Bulk configure ${label}`}
            />
          </div>
        </Tooltip>

        <div className="external-device-row__select">
          <span
            className={`external-device-row__avatar${isConnected ? " external-device-row__avatar--connected" : focus ? " external-device-row__avatar--selected" : ""}`}
            style={{ "--device-accent": previewColor }}
          >
            <LayoutIcon size={16} stroke={1.75} />
          </span>

          <span className="external-device-row__body">
            <span className="external-device-row__title-row">
              <span className="external-device-row__title">{label}</span>
              <span className="external-device-row__chips">
                {saved ? (
                  <Tooltip label="Saved device">
                    <span className="external-device-row__chip external-device-row__chip--saved">
                      <IconBookmark size={11} stroke={1.75} />
                    </span>
                  </Tooltip>
                ) : null}
                {isConnected ? (
                  <span className="external-device-row__chip external-device-row__chip--live">
                    Live
                  </span>
                ) : null}
              </span>
            </span>
            <span className="external-device-row__sub">{detailParts.join(" · ")}</span>
          </span>

          <Tooltip label={signalLabel}>
            <span className="external-device-row__signal-wrap">
              <SignalBars rssi={device.rssi} />
            </span>
          </Tooltip>
        </div>

        <div
          className="external-device-row__action"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {isConnected ? (
            <Tooltip label="Disconnect">
              <ActionIcon
                variant="light"
                color="gray"
                size="lg"
                aria-label={`Disconnect ${label}`}
                onClick={() => onDisconnect(device.id)}
              >
                <IconPlugConnectedX size={17} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Tooltip label="Connect">
              <ActionIcon
                variant="light"
                color="teal"
                size="lg"
                loading={connecting}
                aria-label={`Connect ${label}`}
                onClick={() => onConnect(device.id)}
              >
                <IconBluetoothConnected size={17} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </div>
    </article>
  );
}

export function ExternalLedsPanel({
  settings,
  externalState,
  onSettingsChange,
  onScan,
  onConnect,
  onDisconnect,
  scanning,
  connecting,
}) {
  const activeId = settings?.externalLeds?.activeDeviceId;
  const configDeviceIds = listExternalConfigDeviceIds(settings);
  const savedDevices = settings?.externalLeds?.devices || {};
  const discovered = externalState?.devices || [];
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  const mergedDevices = [];
  const seen = new Set();

  for (const device of discovered) {
    seen.add(device.id);
    mergedDevices.push({
      ...savedDevices[device.id],
      ...device,
      saved: Boolean(savedDevices[device.id]),
    });
  }

  for (const [id, device] of Object.entries(savedDevices)) {
    if (seen.has(id)) {
      continue;
    }
    mergedDevices.push({
      ...device,
      id,
      connected: false,
      connecting: false,
      saved: true,
    });
  }

  const visibleOrder = sanitizeDeviceOrder(
    settings?.externalLeds?.deviceOrder,
    mergedDevices.map((device) => device.id)
  );
  const sortedDevices = sortExternalDevicesByOrder(mergedDevices, visibleOrder);
  const connectedCount = sortedDevices.filter((device) => device.connected).length;
  const multiBulk = configDeviceIds.length > 1;
  const hasBulkSelection = configDeviceIds.length > 0;
  const devicesById = Object.fromEntries(sortedDevices.map((item) => [item.id, item]));
  const bulkSummary = useMemo(
    () => summarizeBulkSelection(devicesById, configDeviceIds, activeId),
    [devicesById, configDeviceIds, activeId]
  );

  const handleFocus = (deviceId) => {
    const device = mergedDevices.find((item) => item.id === deviceId);
    if (!device) {
      return;
    }
    onSettingsChange(buildFocusExternalDevicePatch(settings, device));
  };

  const handleToggleConfig = (deviceId, checked) => {
    onSettingsChange(buildToggleExternalConfigDevicePatch(settings, deviceId, checked, devicesById));
  };

  const handleBulkSelection = (mode) => {
    onSettingsChange(buildBulkConfigSelectionPatch(settings, mode, devicesById));
  };

  const handleConnect = async (deviceId) => {
    const device = mergedDevices.find((item) => item.id === deviceId);
    if (device) {
      onSettingsChange(buildFocusExternalDevicePatch(settings, device));
    }
    await onConnect(deviceId);
  };

  const handleBulkFocus = (deviceId) => {
    onSettingsChange(buildBulkFocusDevicePatch(settings, deviceId));
  };

  const handleReorder = (dragId, targetId) => {
    const currentOrder = sortedDevices.map((device) => device.id);
    const nextOrder = reorderDeviceIds(currentOrder, dragId, targetId);
    onSettingsChange(buildExternalDeviceOrderPatch(settings, nextOrder));
  };

  const clearDragState = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <Stack gap="md" className="external-leds-panel">
      {!externalState?.bleAvailable ? (
        <div className="soft-info-card external-leds-panel__intro">
          <Text size="sm" c="orange">
            {externalState?.bleError || "Bluetooth is unavailable on this PC."}
          </Text>
        </div>
      ) : null}

      <SectionLabel
        icon={IconBluetooth}
        right={
          sortedDevices.length ? (
            <Text size="xs" c="dimmed">
              {connectedCount > 0
                ? `${connectedCount} live · ${sortedDevices.length} devices`
                : `${sortedDevices.length} devices`}
            </Text>
          ) : null
        }
      >
        Bluetooth devices
      </SectionLabel>

      {hasBulkSelection ? (
        <ExternalBulkSummary
          summary={bulkSummary}
          devicesById={devicesById}
          onFocusDevice={handleBulkFocus}
          onBulkSelection={handleBulkSelection}
          onClear={() => handleBulkSelection("clear")}
        />
      ) : (
        <Text size="xs" c="dimmed">
          Click a card to edit one device. Use checkboxes to bulk configure multiple devices of the same type.
        </Text>
      )}

      <Group justify="space-between" align="center" wrap="nowrap">
        <Text size="sm" c="dimmed" lineClamp={2} style={{ flex: 1, minWidth: 0 }}>
          {scanning
            ? "Scanning… keep lamps powered on and wait up to 20 seconds."
            : externalState?.message || "Scan to find nearby BLE lamps"}
        </Text>
        <Button
          size="compact-sm"
          variant="light"
          color="teal"
          loading={scanning}
          leftSection={<IconRefresh size={15} />}
          onClick={onScan}
          disabled={!externalState?.bleAvailable}
          style={{ flexShrink: 0 }}
        >
          {scanning ? "Scanning…" : "Scan"}
        </Button>
      </Group>

      {scanning ? (
        <Text size="xs" c="dimmed">
          Close LotusLamp X / Magic Lantern on your phone before connecting.
        </Text>
      ) : null}

      <Switch
        label="Auto-connect"
        description="Reconnect only to devices you connected manually before."
        checked={settings?.externalLeds?.autoConnect !== false}
        onChange={(event) =>
          onSettingsChange(
            buildExternalLedsAutoConnectPatch(settings, event.currentTarget.checked)
          )
        }
        disabled={!externalState?.bleAvailable}
      />

      <div className="middle-list external-device-list">
        {sortedDevices.length > 0 ? (
          <div className="external-device-list__head">
            <Text size="xs" c="dimmed" className="external-device-list__legend">
              Drag handle to reorder · Card = select · Checkbox = bulk
            </Text>
            <Text size="xs" c="dimmed" className="external-device-list__count">
              {connectedCount}/{sortedDevices.length} live
            </Text>
          </div>
        ) : null}
        {sortedDevices.length === 0 ? (
          <Box className="soft-empty external-device-empty" ta="center">
            <span className="external-device-empty__icon">
              <IconBluetooth size={28} stroke={1.5} />
            </span>
            <Text size="sm" fw={600} mt="sm">
              No devices yet
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              Tap Scan to find nearby BLE lamps
            </Text>
          </Box>
        ) : (
          sortedDevices.map((device) => {
            const configSwitchGroup = shouldSwitchBulkConfigGroup(
              configDeviceIds,
              devicesById,
              device
            );
            return (
            <ExternalDeviceRow
              key={device.id}
              device={device}
              focus={device.id === activeId}
              inConfig={configDeviceIds.includes(device.id)}
              inBulkGroup={multiBulk && configDeviceIds.includes(device.id)}
              bulkEligible={hasBulkSelection && !configDeviceIds.includes(device.id) && !configSwitchGroup}
              bulkInactive={hasBulkSelection && configSwitchGroup}
              configSwitchGroup={configSwitchGroup}
              saved={Boolean(savedDevices[device.id])}
              dragging={draggingId === device.id}
              dropTarget={dropTargetId === device.id && draggingId !== device.id}
              onFocus={handleFocus}
              onToggleConfig={handleToggleConfig}
              onConnect={handleConnect}
              onDisconnect={onDisconnect}
              connecting={connecting === device.id}
              onDragStart={(deviceId) => {
                setDraggingId(deviceId);
                setDropTargetId(null);
              }}
              onDragEnd={clearDragState}
              onDragEnter={(event) => {
                event.preventDefault();
                if (draggingId && draggingId !== device.id) {
                  setDropTargetId(device.id);
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const dragId = event.dataTransfer.getData(DRAG_MIME) || draggingId;
                if (dragId && dragId !== device.id) {
                  handleReorder(dragId, device.id);
                }
                clearDragState();
              }}
            />
            );
          })
        )}
      </div>
    </Stack>
  );
}
