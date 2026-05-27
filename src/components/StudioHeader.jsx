import { Badge, Group, Text } from "@mantine/core";
import { IconBulb, IconPlugConnectedX } from "@tabler/icons-react";

export function StudioHeader({ state, ledCount, deviceModel, connected, ledOn = true }) {
  const TitleIcon = connected ? IconBulb : IconPlugConnectedX;

  return (
    <header className="studio-header">
      <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
        <div className="studio-header__avatar">
          {connected ? state?.port?.replace("COM", "") || "●" : "—"}
        </div>
        <div style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap" mb={2}>
            <TitleIcon size={18} stroke={1.75} className="studio-header__title-icon" />
            <Text fw={700} size="md" truncate className="studio-header__title">
              {connected ? state?.deviceId || "Skydimo LED" : "Not connected"}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" truncate>
            {connected
              ? `${state?.port}${deviceModel ? ` · ${deviceModel}` : ""} · ${ledCount} LEDs (auto-detected)`
              : "Pick a device in the middle panel to get started"}
          </Text>
        </div>
      </Group>
      <Group gap="xs" wrap="nowrap">
        {connected && (
          <Badge variant="dot" color={ledOn ? "teal" : "gray"} size="lg" radius="xl">
            {ledOn ? "Online" : "Off"}
          </Badge>
        )}
        <Badge variant="light" color="teal" radius="xl">
          Live
        </Badge>
      </Group>
    </header>
  );
}
