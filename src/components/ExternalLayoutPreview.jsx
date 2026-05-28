import { Text } from "@mantine/core";
import { ensureHex, scaledRgb } from "../lib/colorUtils";
import {
  buildStripPreviewNodes,
  EXTERNAL_LAYOUT_KINDS,
  resolveExternalLayout,
} from "../lib/externalLedLayout";
import { ExternalTriangleLayoutPreview } from "./ExternalTriangleLayoutEditor";

function ledColorAt(settings, ledIndex, fallbackHex) {
  const hex = ensureHex(settings?.hex, fallbackHex);
  if (
    settings?.colorMode === "leds" &&
    Array.isArray(settings.ledColors) &&
    settings.ledColors[ledIndex]
  ) {
    return ensureHex(settings.ledColors[ledIndex], hex);
  }
  return hex;
}

export function ExternalLayoutPreview({
  device,
  settings,
  connected = false,
  ledOn = true,
  compact = false,
}) {
  const layout = resolveExternalLayout(device || settings);
  const previewHex = connected && !ledOn ? "#1a1d24" : ensureHex(settings?.hex);
  const brightness = connected && !ledOn ? 100 : settings?.brightness ?? 100;

  if (layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE) {
    return (
      <div className={`external-layout-preview${compact ? " external-layout-preview--compact" : ""}`}>
        <div className="external-layout-preview__head">
          <Text size="xs" c="dimmed">
            {layout.previewTitle}
          </Text>
          <Text size="xs" fw={600}>
            {layout.unitLabel}
          </Text>
        </div>
        <ExternalTriangleLayoutPreview
          device={device}
          settings={settings}
          connected={connected}
          ledOn={ledOn}
          compact={compact}
        />
        {!compact ? (
          <Text size="xs" c="dimmed">
            Arrange triangles like Nanoleaf to match your physical setup. Numbers show wire order.
          </Text>
        ) : null}
      </div>
    );
  }

  const nodes = buildStripPreviewNodes(layout.ledCount, compact ? 18 : 28);
  return (
    <div className={`external-layout-preview${compact ? " external-layout-preview--compact" : ""}`}>
      <div className="external-layout-preview__head">
        <Text size="xs" c="dimmed">
          {layout.previewTitle}
        </Text>
        <Text size="xs" fw={600}>
          {layout.unitLabel}
        </Text>
      </div>
      <svg viewBox="0 0 100 100" className="external-layout-preview__svg" aria-hidden>
        <line x1="6" y1="50" x2="94" y2="50" className="external-layout-preview__wire" />
        {nodes.map((node) => {
          const hex = ledColorAt(settings, node.ledIndex, previewHex);
          const { r, g, b } = scaledRgb(hex, brightness);
          return (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={compact ? 2.6 : 3.2}
              fill={`rgb(${r}, ${g}, ${b})`}
              className="external-layout-preview__led"
            />
          );
        })}
      </svg>
      {!compact ? (
        <Text size="xs" c="dimmed">
          Linear wire strip layout — suited for ambilight and lengthwise gradients.
        </Text>
      ) : null}
    </div>
  );
}
