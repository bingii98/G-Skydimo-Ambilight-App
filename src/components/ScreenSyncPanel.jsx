import { useState } from "react";
import { Text } from "@mantine/core";
import { IconDeviceDesktop, IconPlayerStop } from "@tabler/icons-react";
import { COLOR_MODES } from "../lib/colorModes";
import { resolveScreenSyncSmoothing } from "../lib/screenSync";
import { buildModeSwitchPatch } from "../lib/modeColors";
import { SectionLabel } from "./ui/AppPanel";
import { AppSelect } from "./ui/AppSelect";
import { AppSlider, appSliderTuningClassNames } from "./ui/AppSlider";
import { ScreenSyncRegionPicker } from "./ScreenSyncRegionPicker";

const PRIMARY_MONITOR = "__primary__";

function smoothnessHint(value) {
  if (value <= 0) return "Real-time, no blending";
  if (value < 20) return "Fast response, minimal blend";
  if (value < 55) return "Balanced motion";
  return "Cinematic, slower color transitions";
}

export function ScreenSyncPanel({
  settings,
  onChange,
  onSmoothnessPreview,
  captureReady,
  captureError,
  sources = [],
}) {
  const sourceId = settings.screenSyncSourceId || PRIMARY_MONITOR;
  const savedSmoothness = resolveScreenSyncSmoothing(settings);
  const [smoothness, setSmoothness] = useState(savedSmoothness);

  const monitorOptions = [
    { value: PRIMARY_MONITOR, label: "Primary monitor" },
    ...sources.map((source) => ({
      value: source.id,
      label: source.isPrimary ? `${source.name} · Primary` : source.name,
    })),
  ];

  const stopScreenSync = () => {
    onChange(buildModeSwitchPatch(settings, COLOR_MODES.SINGLE));
  };

  return (
    <div className="screen-sync-panel">
      <Text size="xs" c="dimmed" lh={1.45} mb={4}>
        LEDs mirror colors from the monitor you choose. Pick a monitor, sample region, and smoothness
        level.
      </Text>

      {captureError ? (
        <Text size="xs" c="red" lh={1.45} className="screen-sync-panel__error">
          {captureError}
        </Text>
      ) : null}

      {!captureReady && !captureError ? (
        <Text size="xs" c="dimmed" lh={1.45}>
          Starting screen capture…
        </Text>
      ) : null}

      <AppSelect
        label="Monitor"
        leftSection={<IconDeviceDesktop size={16} stroke={1.75} />}
        data={monitorOptions}
        value={monitorOptions.some((option) => option.value === sourceId) ? sourceId : PRIMARY_MONITOR}
        onChange={(value) =>
          onChange({
            screenSyncSourceId: !value || value === PRIMARY_MONITOR ? null : value,
          })
        }
        disabled={sources.length === 0}
        placeholder="Select monitor…"
      />

      <ScreenSyncRegionPicker settings={settings} onChange={onChange} />

      <div className="screen-sync-panel__smoothness">
        <div className="animation-tuning__header">
          <span className="animation-tuning__label">Smoothness</span>
          <span className="animation-tuning__value">{smoothness}%</span>
        </div>
        <AppSlider
          value={savedSmoothness}
          onLiveChange={setSmoothness}
          onPreview={onSmoothnessPreview}
          onChange={(value) => onChange({ screenSyncSmoothing: value })}
          min={0}
          max={100}
          size="md"
          classNames={appSliderTuningClassNames}
        />
        <Text size="xs" c="dimmed" lh={1.4} className="screen-sync-panel__smoothness-hint">
          {smoothnessHint(smoothness)}
        </Text>
      </div>

      <SectionLabel icon={IconDeviceDesktop} className="screen-sync-panel__status-label">
        {captureReady ? "Live screen sync" : "Screen sync"}
      </SectionLabel>

      <button type="button" className="animation-stop-btn" onClick={stopScreenSync}>
        <IconPlayerStop size={14} stroke={1.75} aria-hidden />
        <span>Stop screen sync</span>
      </button>
    </div>
  );
}
