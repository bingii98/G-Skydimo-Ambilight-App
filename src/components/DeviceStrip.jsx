import { Badge, Button, Group, Text, Tooltip } from "@mantine/core";
import {
  IconPlugConnected,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import { parseModel, resolveLedCount } from "../lib/colorUtils";

export function DeviceStrip({
  state,
  settings,
  onOpenConnection,
  onOpenSettings,
  onScan,
  onDisconnect,
  scanning,
  connecting,
}) {
  const model = parseModel(state?.deviceId);
  const ledCount = resolveLedCount(state?.deviceId);

  return (
    <div className="device-strip">
      <Group gap="sm" wrap="wrap" style={{ minWidth: 0 }}>
        <Badge variant="dot" color="teal" size="sm">
          Connected
        </Badge>
        <Text size="sm" fw={600}>
          {state?.port}
        </Text>
        {model && (
          <Badge variant="light" color="violet" size="sm">
            {model}
          </Badge>
        )}
        <Text size="sm" c="dimmed">
          {ledCount} LEDs
        </Text>
        <Badge variant="light" color="violet" size="sm">
          Live
        </Badge>
      </Group>

      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Rescan COM ports">
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<IconRefresh size={14} />}
            onClick={onScan}
            loading={scanning}
          >
            Scan
          </Button>
        </Tooltip>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          leftSection={<IconPlugConnected size={14} />}
          onClick={onOpenConnection}
        >
          Connect
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          leftSection={<IconSettings size={14} />}
          onClick={onOpenSettings}
        >
          Settings
        </Button>
        <Button
          variant="light"
          color="red"
          size="compact-sm"
          onClick={onDisconnect}
          loading={connecting}
        >
          Disconnect
        </Button>
      </Group>
    </div>
  );
}
