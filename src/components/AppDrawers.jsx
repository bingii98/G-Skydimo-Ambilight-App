import { Drawer, ScrollArea } from "@mantine/core";
import { ConnectionPanel, SettingsPanel } from "./SidebarPanels";

export function SettingsDrawer({ opened, onClose, settings, onChange }) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Settings"
      position="right"
      size={360}
      classNames={{ content: "app-drawer" }}
      overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
    >
      <ScrollArea h="calc(100vh - 80px)" offsetScrollbars p="md">
        <SettingsPanel settings={settings} onChange={onChange} />
      </ScrollArea>
    </Drawer>
  );
}

export function ConnectionDrawer({
  opened,
  onClose,
  state,
  settings,
  selectedPort,
  onSelectPort,
  onScan,
  onConnect,
  onToggleConnection,
  onSettingsChange,
  onSyncOptions,
  scanning,
  connecting,
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Connect device"
      position="right"
      size={400}
      classNames={{ content: "app-drawer" }}
      overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
    >
      <ScrollArea h="calc(100vh - 80px)" offsetScrollbars p="md">
        <ConnectionPanel
          state={state}
          settings={settings}
          selectedPort={selectedPort}
          onSelectPort={onSelectPort}
          onScan={onScan}
          onConnect={(port) => {
            onConnect(port);
          }}
          onToggleConnection={onToggleConnection}
          onSettingsChange={onSettingsChange}
          onSyncOptions={onSyncOptions}
          scanning={scanning}
          connecting={connecting}
        />
      </ScrollArea>
    </Drawer>
  );
}
