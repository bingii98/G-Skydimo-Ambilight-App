import { Text } from "@mantine/core";
import { IconTriangle } from "@tabler/icons-react";
import { ExternalLayoutConfig } from "./ExternalLayoutConfig";
import { PanelTitle } from "./ui/AppPanel";

export function ExternalTriangleLayoutPanel({ device, settings, onChange }) {
  return (
    <aside className="external-triangle-layout-panel">
      <div className="external-triangle-layout-panel__head">
        <PanelTitle icon={IconTriangle} size="md" className="external-triangle-layout-panel__title">
          Triangle layout
        </PanelTitle>
        {device ? (
          <Text size="xs" c="dimmed" lh={1.45}>
            Build panels, wire entry, and LED flow on the canvas below.
          </Text>
        ) : null}
      </div>

      <div className="external-triangle-layout-panel__body">
        <div className="external-triangle-layout-panel__pane ui-panel-enter">
          {device ? (
            <ExternalLayoutConfig
              device={device}
              settings={settings}
              onChange={onChange}
              embedded
              editorOnly
            />
          ) : (
            <Text size="sm" c="dimmed" py="md">
              Select a triangle device on the left to configure its panel layout.
            </Text>
          )}
        </div>
      </div>
    </aside>
  );
}
