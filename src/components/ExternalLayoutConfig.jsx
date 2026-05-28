import { lazy, Suspense } from "react";
import { Button, Group, NumberInput, SegmentedControl, Stack, Text } from "@mantine/core";
import { IconLine, IconTriangle } from "@tabler/icons-react";
import {
  buildExternalLayoutPatch,
  EXTERNAL_LAYOUT_KINDS,
  EXTERNAL_STRIP_PRESETS,
  resolveExternalLayout,
} from "../lib/externalLedLayout";
import {
  buildDefaultTriangleChainPanels,
  buildTriangleLayoutPatch,
  resolveTrianglePanels,
  resolveTriangleWire,
  summarizeTriangleLayoutEditor,
} from "../lib/externalTriangleLayout";
import { ExternalLayoutPreview } from "./ExternalLayoutPreview";
import { SectionLabel } from "./ui/AppPanel";

const ExternalTriangleLayoutEditor = lazy(() =>
  import("./ExternalTriangleLayoutEditor").then((module) => ({
    default: module.ExternalTriangleLayoutEditor,
  }))
);

function LayoutEditorFallback() {
  return (
    <Text size="xs" c="dimmed" py="sm">
      Loading triangle editor…
    </Text>
  );
}

function LayoutKindSwitcher({ layoutKind, onChange }) {
  return (
    <SegmentedControl
      fullWidth
      size="xs"
      value={layoutKind}
      onChange={onChange}
      data={[
        {
          value: EXTERNAL_LAYOUT_KINDS.STRIP,
          label: (
            <Group gap={6} justify="center" wrap="nowrap">
              <IconLine size={14} />
              <span>Wire strip</span>
            </Group>
          ),
        },
        {
          value: EXTERNAL_LAYOUT_KINDS.TRIANGLE,
          label: (
            <Group gap={6} justify="center" wrap="nowrap">
              <IconTriangle size={14} />
              <span>Triangles</span>
            </Group>
          ),
        },
      ]}
    />
  );
}

function TriangleLayoutInfo({ device }) {
  const panels = resolveTrianglePanels(device);
  const wire = resolveTriangleWire(device);
  const summary = summarizeTriangleLayoutEditor(panels, wire);
  const layout = resolveExternalLayout(device);

  return (
    <Stack gap={8} className="external-layout-info">
      <Group gap={6} wrap="wrap">
        <Text size="xs" c="dimmed">
          {layout.unitLabel}
        </Text>
      </Group>
      <Group gap={6} wrap="wrap">
        <Text size="xs" fw={600}>
          {summary.panelCount} triangle{summary.panelCount === 1 ? "" : "s"}
        </Text>
        <Text size="xs" c="dimmed">
          ·
        </Text>
        <Text size="xs" fw={600}>
          {summary.ledCount} LED
        </Text>
        {summary.matchingPresetLabel ? (
          <>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Text size="xs" fw={600} c="teal">
              {summary.matchingPresetLabel}
            </Text>
          </>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed" lh={1.45}>
        Wire entry: {summary.originLabel} · {summary.directionLabel}
      </Text>
      <Text size="xs" c="dimmed" lh={1.45}>
        Edit panel shape and wire flow in the center canvas.
      </Text>
    </Stack>
  );
}

export function ExternalLayoutConfig({
  device,
  settings,
  onChange,
  showPreview = true,
  triangleOnly = false,
  embedded = false,
  editorOnly = false,
  settingsOnly = false,
}) {
  if (!device) {
    return null;
  }

  const layout = resolveExternalLayout(device);
  const layoutKind = layout.layoutKind;

  const applyLayoutKind = (value) => {
    if (value === EXTERNAL_LAYOUT_KINDS.TRIANGLE) {
      onChange(
        buildTriangleLayoutPatch(
          device.trianglePanels || buildDefaultTriangleChainPanels(device.triangleCount || 4),
          device.triangleWire
        )
      );
      return;
    }
    onChange(
      buildExternalLayoutPatch(EXTERNAL_LAYOUT_KINDS.STRIP, {
        ledCount: device.ledCount || device.stripLedCount || 30,
      })
    );
  };

  if (editorOnly) {
    return (
      <div className="external-layout-config external-layout-config--embedded external-layout-config--editor-fill">
        <Suspense fallback={<LayoutEditorFallback />}>
          <ExternalTriangleLayoutEditor
            device={device}
            settings={settings}
            onChange={onChange}
            compact={false}
            showLegend
            fillHeight
          />
        </Suspense>
      </div>
    );
  }

  if (settingsOnly && layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE) {
    return (
      <Stack gap="sm" className="external-layout-config external-layout-config--settings">
        <SectionLabel icon={IconTriangle}>LED layout</SectionLabel>
        <LayoutKindSwitcher layoutKind={layoutKind} onChange={applyLayoutKind} />
        <TriangleLayoutInfo device={device} />
      </Stack>
    );
  }

  if (triangleOnly || layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE) {
    return (
      <Stack gap="sm" className={`external-layout-config external-layout-config--triangle${embedded ? " external-layout-config--embedded" : ""}`}>
        {!embedded ? <SectionLabel icon={IconTriangle}>Triangle layout</SectionLabel> : null}
        <LayoutKindSwitcher layoutKind={layoutKind} onChange={applyLayoutKind} />
        <Suspense fallback={<LayoutEditorFallback />}>
          <ExternalTriangleLayoutEditor
            device={device}
            settings={settings}
            onChange={onChange}
            compact={false}
            showLegend
          />
        </Suspense>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" className={`external-layout-config${settingsOnly ? " external-layout-config--settings" : ""}`}>
      <SectionLabel icon={IconLine}>LED layout</SectionLabel>
      <LayoutKindSwitcher layoutKind={layoutKind} onChange={applyLayoutKind} />

      {showPreview ? <ExternalLayoutPreview device={device} settings={settings} compact /> : null}

      <Stack gap="xs">
        <NumberInput
          label="LEDs on strip"
          min={1}
          max={512}
          value={layout.ledCount}
          onChange={(value) =>
            onChange(
              buildExternalLayoutPatch(EXTERNAL_LAYOUT_KINDS.STRIP, {
                ledCount: value,
              })
            )
          }
        />
        <Group gap={6}>
          {EXTERNAL_STRIP_PRESETS.map((preset) => (
            <Button
              key={preset.leds}
              size="compact-xs"
              variant={layout.ledCount === preset.leds ? "filled" : "light"}
              color="teal"
              onClick={() =>
                onChange(
                  buildExternalLayoutPatch(EXTERNAL_LAYOUT_KINDS.STRIP, {
                    ledCount: preset.leds,
                  })
                )
              }
            >
              {preset.label}
            </Button>
          ))}
        </Group>
      </Stack>
    </Stack>
  );
}
