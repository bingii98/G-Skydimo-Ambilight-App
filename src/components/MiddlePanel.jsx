import { ScrollArea, Text, TextInput } from "@mantine/core";
import {
  IconClock,
  IconDeviceDesktop,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { ConnectionPanel, DevicePanelActions, SettingsPanel } from "./SidebarPanels";
import { PanelTitle } from "./ui/AppPanel";
import { ensureHex } from "../lib/colorUtils";

const NAV_META = {
  studio: { title: "Recent colors", icon: IconClock },
  devices: { title: "Devices", icon: IconDeviceDesktop },
  settings: { title: "Settings", icon: IconSettings },
};

export function MiddlePanel({
  nav,
  state,
  settings,
  ledCount,
  deviceModel,
  history,
  selectedPort,
  onSelectPort,
  onScan,
  onConnect,
  onToggleConnection,
  onSettingsChange,
  onSyncOptions,
  onTestZones,
  onFlashZone,
  onRunCalibrationChase,
  onAbortCalibrationPlayback,
  onCalibrationLock,
  onRestoreAfterCalibrate,
  ledOn,
  onToggleLedPower,
  onHistoryPick,
  onClearHistory,
  scanning,
  connecting,
  portFilter,
  onPortFilterChange,
}) {
  const navMeta = NAV_META[nav];
  const hexUpper = ensureHex(settings.hex).toUpperCase();

  return (
    <aside className="middle-panel">
      <div className="middle-panel__head">
        <PanelTitle icon={navMeta.icon} size="lg" className="middle-panel__title">
          {navMeta.title}
        </PanelTitle>
        {nav === "devices" && (
          <TextInput
            className="middle-panel__search"
            placeholder="Search COM ports..."
            value={portFilter}
            onChange={(e) => onPortFilterChange(e.currentTarget.value)}
            leftSection={<IconSearch size={16} stroke={1.6} />}
            radius="xl"
            size="sm"
          />
        )}
      </div>

      <ScrollArea className="middle-panel__body" type="auto" offsetScrollbars>
        {nav === "devices" && (
          <ConnectionPanel
            state={state}
            settings={settings}
            ledCount={ledCount}
            deviceModel={deviceModel}
            selectedPort={selectedPort}
            onSelectPort={onSelectPort}
            onScan={onScan}
            onConnect={onConnect}
            onToggleConnection={onToggleConnection}
            onSettingsChange={onSettingsChange}
            onSyncOptions={onSyncOptions}
            onTestZones={onTestZones}
            onFlashZone={onFlashZone}
            onRunCalibrationChase={onRunCalibrationChase}
            onAbortCalibrationPlayback={onAbortCalibrationPlayback}
            onCalibrationLock={onCalibrationLock}
            onRestoreAfterCalibrate={onRestoreAfterCalibrate}
            ledOn={ledOn}
            onToggleLedPower={onToggleLedPower}
            scanning={scanning}
            connecting={connecting}
            portFilter={portFilter}
          />
        )}

        {nav === "settings" && (
          <SettingsPanel settings={settings} onChange={onSettingsChange} />
        )}

        {nav === "studio" && (
          <div className="middle-list">
            {history.length > 0 && (
              <div className="middle-list__toolbar">
                <button type="button" className="color-studio__clear" onClick={onClearHistory}>
                  Clear
                </button>
              </div>
            )}
            {history.length === 0 ? (
              <Text size="sm" c="dimmed" py="md" px="xs">
                Colors you pick will show up here
              </Text>
            ) : (
              history.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`list-row ${hexUpper === hex.toUpperCase() ? "list-row--active" : ""}`}
                  onClick={() => onHistoryPick(hex)}
                >
                  <span className="list-row__swatch" style={{ background: hex }} />
                  <span className="list-row__body">
                    <span className="list-row__title">{hex}</span>
                    <span className="list-row__sub">Recently used</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </ScrollArea>

      {nav === "devices" && (
        <DevicePanelActions
          connected={state?.connected}
          onScan={onScan}
          onToggleConnection={onToggleConnection}
          scanning={scanning}
          connecting={connecting}
        />
      )}
    </aside>
  );
}
