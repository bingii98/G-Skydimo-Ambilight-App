import {
  Badge,
  Box,
  Button,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBulb,
  IconCpu,
  IconRocket,
  IconKey,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRefresh,
  IconRouter,
  IconSparkles,
} from "@tabler/icons-react";
import { STATUS_LABELS } from "../lib/constants";
import { resolveLedSource } from "../lib/colorUtils";
import { OrientationConfig } from "./OrientationConfig";
import { SectionLabel } from "./ui/AppPanel";

function getDeviceTitle(deviceModel, deviceId) {
  if (deviceModel) return deviceModel;
  if (deviceId) return deviceId;
  return "Skydimo LED";
}

function getDeviceSerial(deviceModel, deviceId) {
  if (!deviceId || !deviceModel) return null;
  const prefix = `${deviceModel}:`;
  if (deviceId.toUpperCase().startsWith(prefix.toUpperCase())) {
    const serial = deviceId.slice(prefix.length);
    return serial || null;
  }
  if (deviceId.toUpperCase() === deviceModel.toUpperCase()) return null;
  return deviceId;
}

function PortItem({ port, selected, connectedPath, recommendedPath, onSelect, onConnect }) {
  const isRecommended = port.path === recommendedPath && port.path !== connectedPath;
  const isConnected = port.path === connectedPath;
  const isSelected = selected && !isConnected;
  const className = [
    "list-row",
    "port-row",
    isConnected ? "port-row--connected" : "",
    isSelected ? "port-row--selected" : "",
    isRecommended ? "port-row--recommended" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelect(port.path)}
      onDoubleClick={() => onConnect(port.path)}
      aria-pressed={selected}
    >
      <span className={`port-row__avatar ${isConnected ? "port-row__avatar--connected" : isSelected ? "port-row__avatar--selected" : ""}`}>
        {port.path.replace("COM", "")}
      </span>
      <span className="list-row__body">
        <span className="list-row__title">
          {port.path}
          {isConnected ? " · Connected" : isRecommended ? " · Suggested" : ""}
        </span>
        <span className="list-row__sub">
          {port.label}
          {port.deviceId ? ` · ${port.deviceId}` : ""}
        </span>
      </span>
      <span className="list-row__meta">
        {isConnected ? (
          <Badge size="xs" variant="dot" color="teal">
            Live
          </Badge>
        ) : isSelected ? (
          <Badge size="xs" variant="light" color="teal">
            Selected
          </Badge>
        ) : (
          <Badge
            size="xs"
            variant="light"
            color={port.status === "available" ? "gray" : port.status === "busy" ? "yellow" : "gray"}
          >
            {STATUS_LABELS[port.status] || port.status}
          </Badge>
        )}
      </span>
    </button>
  );
}

export function DevicePanel({
  state,
  selectedPort,
  settings,
  ledCount,
  deviceModel,
  onSettingsChange,
  onTestZones,
  onFlashZone,
  onRunCalibrationChase,
  onAbortCalibrationPlayback,
  onCalibrationLock,
  onRestoreAfterCalibrate,
  ledOn = true,
  onToggleLedPower,
}) {
  const connected = state?.connected;
  const zoneRotation = settings.zoneRotation ?? 0;
  const ledSource = resolveLedSource(state?.deviceId);
  const deviceTitle = getDeviceTitle(deviceModel, state?.deviceId);
  const deviceSerial = getDeviceSerial(deviceModel, state?.deviceId);
  const portLabel = connected ? state?.port : selectedPort;

  if (!connected) {
    return (
      <Stack gap="sm" className="device-panel">
        <Box className="soft-info-card device-card device-card--idle">
          <div className="device-card__accent" aria-hidden />
          <div className="device-card__hero">
            <div className="device-card__avatar device-card__avatar--idle">
              {portLabel ? portLabel.replace("COM", "") : <IconPlugConnectedX size={16} stroke={1.75} aria-hidden />}
            </div>
            <div className="device-card__identity">
              <Text fw={700} size="sm" className="device-card__title">
                {portLabel ? `${portLabel} selected` : "No device connected"}
              </Text>
              <Text size="xs" c="dimmed" className="device-card__serial">
                {portLabel
                  ? "Connect in Settings → Connection"
                  : "Open Settings → Connection to scan and connect"}
              </Text>
            </div>
            {portLabel ? (
              <Badge variant="light" color="gray" size="sm" radius="xl" className="device-card__badge">
                Pending
              </Badge>
            ) : null}
          </div>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" className="device-panel">
      <Box className={`soft-info-card device-card device-card--connected ${ledOn ? "device-card--online" : "device-card--off"}`}>
        <div className="device-card__accent" aria-hidden />

        <div className="device-card__hero">
          <div className="device-card__avatar">{state.port?.replace("COM", "") || "●"}</div>
          <div className="device-card__identity">
            <Tooltip label={state.deviceId || deviceTitle} openDelay={400} disabled={!state.deviceId}>
              <Text fw={700} size="sm" className="device-card__title" truncate>
                {deviceTitle}
              </Text>
            </Tooltip>
            <Text size="xs" c="dimmed" className="device-card__serial" truncate>
              {[state.port, deviceModel, `${ledCount} LEDs`].filter(Boolean).join(" · ")}
            </Text>
            {deviceSerial ? (
              <Text size="xs" c="dimmed" ff="monospace" className="device-card__serial" truncate>
                {deviceSerial}
              </Text>
            ) : null}
            <Group gap={6} wrap="nowrap" className="device-card__badges">
              <Badge variant="dot" color={ledOn ? "teal" : "gray"} size="sm" radius="xl">
                {ledOn ? "Online" : "Off"}
              </Badge>
              <Badge variant="light" color="teal" size="sm" radius="xl">
                Live
              </Badge>
            </Group>
          </div>

          <Tooltip label={ledOn ? "Turn LEDs off" : "Turn LEDs on"} openDelay={300}>
            <div className={`device-card__power ${ledOn ? "device-card__power--on" : ""}`}>
              <IconBulb size={15} stroke={1.75} aria-hidden />
              <Switch
                checked={ledOn}
                onChange={(event) => onToggleLedPower(event.currentTarget.checked)}
                color="teal"
                size="sm"
                aria-label="Toggle LED power"
              />
            </div>
          </Tooltip>
        </div>

        <div className="device-card__stats">
          <div className="device-card__stat">
            <span className="device-card__stat-icon" aria-hidden>
              <IconRouter size={14} stroke={1.75} />
            </span>
            <span className="device-card__stat-body">
              <span className="device-card__stat-label">Port</span>
              <Tooltip label={state.port} openDelay={400} disabled={!state.port}>
                <span className="device-card__stat-value">{state.port}</span>
              </Tooltip>
            </span>
          </div>
          <div className="device-card__stat">
            <span className="device-card__stat-icon" aria-hidden>
              <IconBulb size={14} stroke={1.75} />
            </span>
            <span className="device-card__stat-body">
              <span className="device-card__stat-label">LEDs</span>
              <span className="device-card__stat-value">{ledCount}</span>
            </span>
          </div>
          <div
            className={`device-card__stat ${ledSource.matched ? "device-card__stat--matched" : "device-card__stat--default"}`}
          >
            <span className="device-card__stat-icon" aria-hidden>
              <IconCpu size={14} stroke={1.75} />
            </span>
            <span className="device-card__stat-body">
              <span className="device-card__stat-label">Profile</span>
              <Tooltip
                label={ledSource.matched ? ledSource.model || "Matched" : "Default"}
                openDelay={400}
              >
                <span className="device-card__stat-value">
                  {ledSource.matched ? ledSource.model || "Matched" : "Default"}
                </span>
              </Tooltip>
            </span>
          </div>
        </div>

        {!ledSource.matched ? (
          <Text size="xs" c="dimmed" lh={1.45} className="device-card__notice">
            {ledSource.detail}
          </Text>
        ) : null}

        <OrientationConfig
          settings={settings}
          ledCount={ledCount}
          deviceModel={deviceModel}
          zoneRotation={zoneRotation}
          connected={connected}
          onSettingsChange={onSettingsChange}
          onTestZones={onTestZones}
          onFlashZone={onFlashZone}
          onRunCalibrationChase={onRunCalibrationChase}
          onAbortCalibrationPlayback={onAbortCalibrationPlayback}
          onCalibrationLock={onCalibrationLock}
          onRestoreAfterCalibrate={onRestoreAfterCalibrate}
        />
      </Box>
    </Stack>
  );
}

export function ConnectionSettingsSection({
  state,
  selectedPort,
  onSelectPort,
  onConnect,
  onSyncOptions,
  scanning,
  portFilter = "",
}) {
  const ports = (state?.ports || [])
    .filter((port) => {
      if (!portFilter.trim()) return true;
      const q = portFilter.toLowerCase();
      return (
        port.path.toLowerCase().includes(q) ||
        port.label?.toLowerCase().includes(q) ||
        port.deviceId?.toLowerCase().includes(q)
      );
    })
    .slice()
    .sort((a, b) => {
      if (a.path === state.port) return -1;
      if (b.path === state.port) return 1;
      return b.score - a.score;
    });

  return (
    <Stack gap="sm" className="connection-settings">
      <Box className="connection-options">
        <SectionLabel icon={IconPlugConnected}>Connection</SectionLabel>
        <Group gap="lg" grow preventGrowOverflow={false}>
          <Switch
            label="Auto-scan"
            size="sm"
            checked={state?.autoScan ?? true}
            onChange={(event) => onSyncOptions({ autoScan: event.currentTarget.checked })}
            color="teal"
          />
          <Switch
            label="Auto-connect"
            size="sm"
            checked={state?.autoConnect ?? true}
            onChange={(event) => onSyncOptions({ autoConnect: event.currentTarget.checked })}
            color="teal"
          />
        </Group>
      </Box>

      <SectionLabel
        icon={IconRouter}
        right={
          <Text size="xs" c="dimmed">
            {state?.lastScanAt ? new Date(state.lastScanAt).toLocaleTimeString("en-US") : "--:--:--"}
          </Text>
        }
      >
        COM ports
      </SectionLabel>

      <div className="middle-list">
        {!ports.length ? (
          <Box className="soft-empty" ta="center">
            <IconRouter size={28} stroke={1.5} style={{ opacity: 0.35 }} />
            <Text size="sm" c="dimmed" mt="sm">
              {portFilter ? "No matching ports" : "No COM ports found"}
            </Text>
          </Box>
        ) : (
          ports.map((port) => (
            <PortItem
              key={port.path}
              port={port}
              selected={selectedPort === port.path}
              connectedPath={state.port}
              recommendedPath={state.recommendedPort?.path}
              onSelect={onSelectPort}
              onConnect={onConnect}
            />
          ))
        )}
      </div>
    </Stack>
  );
}

/** Legacy alias — prefer DevicePanel + ConnectionSettingsSection */
export function ConnectionPanel(props) {
  return (
    <Stack gap="sm" className="connection-panel">
      <DevicePanel {...props} />
      <ConnectionSettingsSection {...props} />
    </Stack>
  );
}

export function DevicePanelActions({
  connected,
  onScan,
  onToggleConnection,
  scanning,
  connecting,
}) {
  return (
    <Group grow preventGrowOverflow={false} className="middle-panel__actions" gap="xs">
      <Button
        variant="default"
        radius="md"
        size="compact-sm"
        leftSection={<IconRefresh size={15} />}
        onClick={onScan}
        loading={scanning}
      >
        Scan
      </Button>
      <Button
        className="btn-soft-primary"
        radius="md"
        size="compact-sm"
        variant={connected ? "default" : "filled"}
        color={connected ? "gray" : "dark"}
        leftSection={connected ? <IconPlugConnectedX size={15} /> : <IconPlugConnected size={15} />}
        onClick={onToggleConnection}
        loading={connecting}
      >
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </Group>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  startupError = null,
  state,
  selectedPort,
  onSelectPort,
  onConnect,
  onSyncOptions,
  portFilter = "",
}) {
  return (
    <Stack gap="lg">
      <ConnectionSettingsSection
        state={state}
        selectedPort={selectedPort}
        onSelectPort={onSelectPort}
        onConnect={onConnect}
        onSyncOptions={onSyncOptions}
        portFilter={portFilter}
      />

      <Box>
        <SectionLabel icon={IconSparkles}>AI (gradient & animation)</SectionLabel>
        <Stack gap="sm">
          <PasswordInput
            label="OpenAI API key"
            description="Stored locally. Use AI in the gradient editor or animation panel."
            placeholder="sk-..."
            value={settings.openaiApiKey || ""}
            onChange={(event) => onChange({ openaiApiKey: event.currentTarget.value })}
            leftSection={<IconKey size={16} stroke={1.75} />}
            visibilityToggleButtonProps={{ "aria-label": "Toggle API key visibility" }}
          />
          <Text size="xs" c="dimmed" lh={1.5}>
            Create a key at{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              platform.openai.com/api-keys
            </a>
            . Requests go directly from this app to OpenAI.
          </Text>
        </Stack>
      </Box>

      <Box>
        <SectionLabel icon={IconRocket}>App</SectionLabel>
        <Stack gap="sm">
          <Switch
            label="Start when computer starts"
            size="sm"
            checked={settings.launchAtStartup}
            onChange={(event) => onChange({ launchAtStartup: event.currentTarget.checked })}
            color="teal"
          />
          {startupError && settings.launchAtStartup && (
            <Text size="xs" c="red" lh={1.5}>
              Couldn't register startup: {startupError}. Check Windows login-item permissions
              or try running the app once as Administrator for Task Scheduler registration.
            </Text>
          )}
          <Switch
            label="Run in system tray when closing"
            size="sm"
            checked={settings.runInTray}
            onChange={(event) => onChange({ runInTray: event.currentTarget.checked })}
            color="teal"
          />
          <Text size="xs" c="dimmed" lh={1.5}>
            When <strong>Run in system tray when closing</strong> is off, closing the window quits the app.
            When it is on, the app hides to the tray and keeps running in the background so LEDs stay on.
            If both startup and tray are enabled, the app boots into the tray without opening a window.
            On Windows, startup uses a high-priority scheduled task so the app launches as early as possible at logon.
            Use the tray icon to open the window again, or choose Quit to exit fully.
          </Text>
        </Stack>
      </Box>
    </Stack>
  );
}
