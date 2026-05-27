import { Text, Tooltip } from "@mantine/core";
import {
  IconArrowRight,
  IconBrush,
  IconDeviceDesktop,
  IconLayoutGrid,
  IconMovie,
  IconPalette,
} from "@tabler/icons-react";
import { ANIMATION_IDS } from "../lib/animations";
import { buildAnimationSwitchPatch } from "../lib/animationColors";
import { COLOR_MODES, ensureLedColors } from "../lib/ledLayout";
import { ensureHex } from "../lib/colorUtils";
import { AnimationPanel } from "./AnimationPanel";
import { ColorPickerPopover } from "./ColorPickerPopup";
import { ScreenSyncPanel } from "./ScreenSyncPanel";
import { SectionLabel } from "./ui/AppPanel";

const MODE_OPTIONS = [
  { id: COLOR_MODES.SINGLE, label: "Single", icon: IconPalette, hint: "One color for all LEDs" },
  {
    id: COLOR_MODES.LEDS,
    label: "Per LED",
    icon: IconLayoutGrid,
    hint: "Paint individual LEDs or regions",
  },
  { id: COLOR_MODES.ANIMATION, label: "Animation", icon: IconMovie, hint: "Moving LED effects" },
  {
    id: COLOR_MODES.SCREEN,
    label: "Screen",
    icon: IconDeviceDesktop,
    hint: "Match LEDs to on-screen colors",
  },
];

export function ColorModePanel({
  settings,
  ledCount,
  onChange,
  onColorChange,
  screenCaptureReady = false,
  screenCaptureError = null,
  screenSources = [],
  onScreenSyncSmoothnessPreview,
}) {
  const colorMode = settings.colorMode || COLOR_MODES.SINGLE;
  const hexUpper = ensureHex(settings.hex).toUpperCase();

  const setMode = (nextMode) => {
    if (nextMode === colorMode) return;

    if (nextMode === COLOR_MODES.LEDS) {
      onChange({
        colorMode: nextMode,
        ledColors: ensureLedColors(settings, ledCount),
        selectedLed: 0,
        selectedLeds: [0],
      });
      return;
    }

    if (nextMode === COLOR_MODES.ANIMATION) {
      const patch = { colorMode: nextMode, selectedLeds: null };
      const nextAnimationId = settings.animationId || ANIMATION_IDS.RAINBOW;
      Object.assign(patch, buildAnimationSwitchPatch(settings, nextAnimationId));
      onChange(patch);
      return;
    }

    if (nextMode === COLOR_MODES.SCREEN) {
      onChange({ colorMode: nextMode, selectedLeds: null });
      return;
    }

    onChange({ colorMode: nextMode, selectedLeds: null });
  };

  return (
    <section className="color-section color-mode-section">
      <SectionLabel icon={IconBrush}>Paint target</SectionLabel>

      <div
        className="paint-mode-switch paint-mode-switch--quad"
        role="group"
        aria-label="Paint mode"
      >
        {MODE_OPTIONS.map(({ id, label, icon: Icon, hint }) => (
          <Tooltip key={id} label={hint} openDelay={400}>
            <button
              type="button"
              className={`paint-mode-switch__btn ${colorMode === id ? "paint-mode-switch__btn--active" : ""}`}
              onClick={() => setMode(id)}
              aria-pressed={colorMode === id}
            >
              <span className="paint-mode-switch__icon" aria-hidden>
                <Icon size={15} stroke={1.75} />
              </span>
              <span className="paint-mode-switch__label">{label}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      {colorMode === COLOR_MODES.SINGLE && (
        <div className="paint-mode-panel paint-mode-panel--single">
          <div className="single-mode-hero">
            <ColorPickerPopover
              hex={settings.hex}
              onChange={onColorChange}
              ariaLabel="Edit uniform color"
              triggerClassName="single-mode-hero__swatch"
              triggerStyle={{ background: settings.hex, "--swatch-color": settings.hex }}
            />
            <div className="single-mode-hero__body">
              <Text fw={600} size="sm" className="single-mode-hero__title">
                Uniform color
              </Text>
              <Text ff="monospace" size="xs" fw={600} className="single-mode-hero__hex">
                {hexUpper}
              </Text>
              <Text size="xs" c="dimmed" lh={1.45}>
                All {ledCount} LEDs share the same color. Click the swatch to pick a color.
              </Text>
            </div>
          </div>

          <button
            type="button"
            className="single-mode-cta"
            onClick={() => setMode(COLOR_MODES.LEDS)}
          >
            <span>Paint individual LEDs or regions</span>
            <IconArrowRight size={14} stroke={1.75} aria-hidden />
          </button>
        </div>
      )}

      {colorMode === COLOR_MODES.ANIMATION && (
        <div className="paint-mode-panel paint-mode-panel--animation">
          <AnimationPanel settings={settings} onChange={onChange} onColorChange={onColorChange} />
        </div>
      )}

      {colorMode === COLOR_MODES.SCREEN && (
        <div className="paint-mode-panel paint-mode-panel--screen">
          <ScreenSyncPanel
            settings={settings}
            onChange={onChange}
            onSmoothnessPreview={onScreenSyncSmoothnessPreview}
            captureReady={screenCaptureReady}
            captureError={screenCaptureError}
            sources={screenSources}
          />
        </div>
      )}
    </section>
  );
}
