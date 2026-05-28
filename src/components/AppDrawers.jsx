import { Drawer, ScrollArea } from "@mantine/core";
import { ConnectionSettingsSection, SettingsPanel } from "./SidebarPanels";

export function SettingsDrawer({
  opened,
  onClose,
  settings,
  onChange,
  state,
  selectedPort,
  onSelectPort,
  onConnect,
  onSyncOptions,
  portFilter = "",
}) {
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
        <SettingsPanel
          settings={settings}
          onChange={onChange}
          state={state}
          selectedPort={selectedPort}
          onSelectPort={onSelectPort}
          onConnect={onConnect}
          onSyncOptions={onSyncOptions}
          portFilter={portFilter}
        />
      </ScrollArea>
    </Drawer>
  );
}

export function ConnectionDrawer({
  opened,
  onClose,
  state,
  selectedPort,
  onSelectPort,
  onConnect,
  onSyncOptions,
  scanning,
  connecting,
  portFilter = "",
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
        <ConnectionSettingsSection
          state={state}
          selectedPort={selectedPort}
          onSelectPort={onSelectPort}
          onConnect={onConnect}
          onSyncOptions={onSyncOptions}
          portFilter={portFilter}
        />
      </ScrollArea>
    </Drawer>
  );
}
