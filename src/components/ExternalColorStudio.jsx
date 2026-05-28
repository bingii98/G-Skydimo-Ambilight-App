import {
  Badge,
  Button,
  CopyButton,
  Group,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconBulb, IconBrush, IconCheck, IconCopy, IconPalette, IconPlugConnected, IconSparkles, IconSun, IconWaveSine } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { PRESETS } from "../lib/constants";
import { applyHexToSettings, COLOR_MODES, getSelectionLabel } from "../lib/ledLayout";
import { ensureHex, scaledRgb } from "../lib/colorUtils";
import { resolveExternalLayout, EXTERNAL_LAYOUT_KINDS } from "../lib/externalLedLayout";
import { getExternalDeviceProfile } from "../lib/externalDeviceProfile";
import {
  defaultBleEffectId,
  listExternalBleEffects,
} from "../lib/externalBleEffects";
import { getExternalDeviceConfigGroupLabel, getExternalDeviceLabel } from "../lib/externalLedSettings";
import { ExternalBleEffectPanel } from "./ExternalBleEffectPanel";
import { ColorPickerPopover } from "./ColorPickerPopup";
import { ExternalLayoutConfig } from "./ExternalLayoutConfig";
import { AppSlider, appSliderBrightnessClassNames } from "./ui/AppSlider";
import { SectionLabel } from "./ui/AppPanel";

const ExternalLayoutPreview = lazy(() =>
  import("./ExternalLayoutPreview").then((module) => ({
    default: module.ExternalLayoutPreview,
  }))
);

export function ExternalColorStudio({
  device,
  configDeviceIds = [],
  configDevices = [],
  connectedConfigDeviceIds = [],
  settings,
  connected,
  ledOn = true,
  sending = false,
  onChange,
  onPreset,
  onQuickConnect,
  onToggleLedPower,
  onDeviceRename,
  onBulkFocusDevice,
}) {
  const layout = resolveExternalLayout(device || settings);
  const profile = getExternalDeviceProfile(device?.name);
  const isTriangleLayout = layout.layoutKind === EXTERNAL_LAYOUT_KINDS.TRIANGLE;
  const deviceLabel = getExternalDeviceLabel(device);
  const configCount = configDeviceIds.length;
  const connectedConfigCount = connectedConfigDeviceIds.length;
  const multiConfig = configCount > 1;
  const offlineConfigCount = Math.max(0, configCount - connectedConfigCount);
  const configGroupLabel = device ? getExternalDeviceConfigGroupLabel(device) : null;
  const hexUpper = ensureHex(settings?.hex).toUpperCase();
  const [brightnessUi, setBrightnessUi] = useState(settings?.brightness ?? 100);

  useEffect(() => {
    setBrightnessUi(settings?.brightness ?? 100);
  }, [settings?.brightness]);
  const previewHex = connected && !ledOn ? "#1a1d24" : ensureHex(settings?.hex);
  const { r, g, b } = scaledRgb(previewHex, connected && !ledOn ? 100 : settings?.brightness ?? 100);
  const colorMode = settings?.colorMode || COLOR_MODES.SINGLE;
  const isPerLedMode = isTriangleLayout && colorMode === COLOR_MODES.LEDS;
  const isBleEffectMode = colorMode === COLOR_MODES.BLE_EFFECT;
  const isSingleTab = !isBleEffectMode;
  const bleEffects = listExternalBleEffects(device?.deviceModel || profile?.model);
  const supportsBleEffects = profile?.supportsBleEffects !== false && bleEffects.length > 0;

  const applyColor = (hex) => {
    const patch = applyHexToSettings(settings, hex, layout.ledCount, device?.deviceModel);
    if (patch) {
      onChange(
        isTriangleLayout && colorMode === COLOR_MODES.LEDS
          ? patch
          : { ...patch, colorMode: COLOR_MODES.SINGLE, bleEffectId: null }
      );
    }
  };

  const applyBleEffect = (nextEffectId) => {
    const parsed = Math.round(Number(nextEffectId));
    if (!Number.isFinite(parsed)) {
      return;
    }
    onChange({
      colorMode: COLOR_MODES.BLE_EFFECT,
      bleEffectId: parsed,
    });
  };

  const exitBleEffectMode = () => {
    onChange({
      colorMode: COLOR_MODES.SINGLE,
      bleEffectId: null,
    });
  };

  const setColorTab = (tab) => {
    if (tab === "effect") {
      if (isBleEffectMode) {
        return;
      }
      applyBleEffect(settings?.bleEffectId ?? defaultBleEffectId(device?.deviceModel || profile?.model));
      return;
    }
    if (colorMode === COLOR_MODES.SINGLE && !settings?.bleEffectId) {
      return;
    }
    exitBleEffectMode();
  };

  const handleLedPower = async (checked) => {
    if (onToggleLedPower) {
      await onToggleLedPower(checked);
      return;
    }
    onChange({ ledOn: checked });
  };

  return (
    <div
      className={`color-studio external-color-studio${isTriangleLayout ? " external-color-studio--color-only" : ""}`}
      style={{ "--studio-color": settings?.hex, "--glow-color": settings?.hex }}
    >
      <div className="color-studio__workspace">
        {!isTriangleLayout ? (
          <aside className="color-studio__preview external-color-studio__preview" aria-label="Layout preview">
            <Suspense
              fallback={
                <Text size="sm" c="dimmed" ta="center" py="md">
                  Loading layout preview…
                </Text>
              }
            >
              <ExternalLayoutPreview
                device={device}
                settings={settings}
                connected={connected}
                ledOn={ledOn}
              />
            </Suspense>
            {!connected ? (
              <div className="external-color-studio__offline">
                <Text size="sm" c="dimmed" ta="center">
                  Select a device on the left and connect to send colors over Bluetooth.
                </Text>
                {onQuickConnect ? (
                  <Button
                    size="compact-sm"
                    variant="light"
                    color="teal"
                    leftSection={<IconPlugConnected size={15} />}
                    onClick={onQuickConnect}
                  >
                    Connect device
                  </Button>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}

        <div className="color-studio__scroll external-color-studio__scroll ui-stagger-children">
          {device ? (
            <section className="external-color-studio__section external-device-detail">
              <SectionLabel icon={IconBulb}>Selected device</SectionLabel>
              <Group gap="xs">
                {multiConfig ? (
                  <Badge size="sm" variant="light" color="grape">
                    {configCount} devices
                  </Badge>
                ) : null}
                {device.deviceModel ? (
                  <Badge size="sm" variant="light" color="violet">
                    {device.deviceModel}
                  </Badge>
                ) : null}
                {configGroupLabel ? (
                  <Badge size="sm" variant="light" color="teal">
                    {configGroupLabel}
                  </Badge>
                ) : null}
                {isPerLedMode && profile?.perLedPreviewSupported ? (
                  <Badge size="sm" variant="light" color="orange">
                    Per-LED preview
                  </Badge>
                ) : profile?.singleZone ? (
                  <Badge size="sm" variant="light" color="blue">
                    Single-zone BLE
                  </Badge>
                ) : null}
                <Badge size="sm" variant="light" color={connected ? "teal" : "gray"}>
                  {connected
                    ? sending
                      ? "Sending…"
                      : connectedConfigCount > 1
                        ? `${connectedConfigCount} connected`
                        : "Connected"
                    : "Not connected"}
                </Badge>
              </Group>
              {!multiConfig ? (
                <TextInput
                  className="external-device-detail__name"
                  label="Display name"
                  placeholder={device.name || "External LED"}
                  size="md"
                  value={device.customName || ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (onDeviceRename) {
                      onDeviceRename(value);
                      return;
                    }
                    onChange({ customName: value });
                  }}
                  onBlur={(event) => {
                    const trimmed = event.currentTarget.value.trim();
                    if (trimmed === event.currentTarget.value) {
                      return;
                    }
                    if (onDeviceRename) {
                      onDeviceRename(trimmed);
                      return;
                    }
                    onChange({ customName: trimmed });
                  }}
                />
              ) : (
                <div className="external-bulk-roster">
                  <Text size="xs" c="dimmed" lh={1.45}>
                    Bulk mode applies color, brightness, and power to all selected devices.
                    {isTriangleLayout ? " Layout type and LED info stay on the right; shape editing is in the center." : ""}
                    Display names stay per device.
                  </Text>
                  {configDevices.length ? (
                    <div className="external-bulk-roster__chips">
                      {configDevices.map((entry) => {
                        const focused = entry.id === device?.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            className={[
                              "external-bulk-roster__chip",
                              focused ? "external-bulk-roster__chip--focus" : "",
                              entry.connected ? "external-bulk-roster__chip--live" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onClick={() => onBulkFocusDevice?.(entry.id)}
                            aria-pressed={focused}
                          >
                            <span
                              className={[
                                "external-bulk-roster__chip-dot",
                                entry.connected ? "external-bulk-roster__chip-dot--live" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              aria-hidden
                            />
                            <span className="external-bulk-roster__chip-label">{entry.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    {connectedConfigCount
                      ? `${connectedConfigCount} live device${connectedConfigCount === 1 ? "" : "s"} receive updates`
                      : "No selected devices are connected"}
                    {offlineConfigCount
                      ? ` · ${offlineConfigCount} offline saved for next connect`
                      : ""}
                  </Text>
                </div>
              )}
              <Switch
                label={multiConfig ? "LED power (all selected)" : "LED power"}
                checked={ledOn}
                onChange={(event) => handleLedPower(event.currentTarget.checked)}
              />
              <Text size="xs" c="dimmed">
                {multiConfig
                  ? `Editing focus: ${deviceLabel}. Changes apply to ${configCount} selected devices (${connectedConfigCount} live).`
                  : deviceLabel}
                {!multiConfig && device.name && device.name !== deviceLabel ? ` · ${device.name}` : ""}
              </Text>
            </section>
          ) : (
            <section className="external-color-studio__section">
              <Text size="sm" c="dimmed">
                {isTriangleLayout
                  ? "Select a device on the left to pick color and brightness."
                  : "Select a device on the left to configure layout, color, and power."}
              </Text>
            </section>
          )}

          {device ? (
            <section className="external-color-studio__section">
              <ExternalLayoutConfig
                device={device}
                settings={settings}
                onChange={onChange}
                showPreview={!isTriangleLayout}
                settingsOnly={isTriangleLayout}
              />
            </section>
          ) : null}

          {device && isTriangleLayout && !connected ? (
            <section className="external-color-studio__section external-color-studio__connect">
              <Text size="sm" c="dimmed">
                Connect the selected device to send colors over Bluetooth.
              </Text>
              {onQuickConnect ? (
                <Button
                  size="compact-sm"
                  variant="light"
                  color="teal"
                  leftSection={<IconPlugConnected size={15} />}
                  onClick={onQuickConnect}
                >
                  Connect device
                </Button>
              ) : null}
            </section>
          ) : null}

          <section className="external-color-studio__section">
            <Group justify="space-between" align="center" mb="xs">
              <SectionLabel icon={IconBrush}>Color</SectionLabel>
            </Group>

            {device && supportsBleEffects ? (
              <div
                className="paint-mode-switch paint-mode-switch--dual external-color-studio__paint-mode"
                role="tablist"
                aria-label="External color mode"
                style={{ "--paint-mode-index": isBleEffectMode ? 1 : 0, "--paint-mode-cols": 2 }}
              >
                <span className="paint-mode-switch__indicator" aria-hidden />
                <button
                  type="button"
                  role="tab"
                  className={`paint-mode-switch__btn ${isSingleTab ? "paint-mode-switch__btn--active" : ""}`}
                  onClick={() => setColorTab("single")}
                  aria-selected={isSingleTab}
                >
                  <IconPalette size={14} />
                  <span>Single</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`paint-mode-switch__btn ${isBleEffectMode ? "paint-mode-switch__btn--active" : ""}`}
                  onClick={() => setColorTab("effect")}
                  aria-selected={isBleEffectMode}
                >
                  <IconWaveSine size={14} />
                  <span>Effect</span>
                </button>
              </div>
            ) : null}

            {isSingleTab ? (
              <>
                {isPerLedMode ? (
                  <Text size="xs" c="dimmed" mb="sm" lh={1.45}>
                    {getSelectionLabel(settings, layout.ledCount)} · pick color in the center canvas or here
                  </Text>
                ) : null}

                <div className="single-mode-hero external-color-studio__picker">
                  <ColorPickerPopover
                    hex={settings?.hex}
                    onChange={applyColor}
                    ariaLabel="Pick external LED color"
                    triggerClassName="single-mode-hero__swatch external-color-studio__swatch"
                    triggerStyle={{ background: settings?.hex, "--swatch-color": settings?.hex }}
                  />
                  <div className="single-mode-hero__body">
                    <Text fw={600} size="sm">
                      {layout.unitLabel}
                    </Text>
                    <Group gap={6} wrap="nowrap">
                      <Text ff="monospace" size="xs" fw={600}>
                        {hexUpper}
                      </Text>
                      <CopyButton value={hexUpper}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? "Copied" : "Copy HEX"}>
                            <Button variant="subtle" size="compact-xs" onClick={copy} px={6} color="gray">
                              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                            </Button>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                    <Text size="xs" c="dimmed" lh={1.45}>
                      {isPerLedMode
                        ? profile.perLedPreviewSupported
                          ? "Per-LED colors show on the canvas. BLE still sends one averaged color for the whole chain until the per-LED protocol is confirmed."
                          : `Per-LED colors follow wire order. Select LEDs on the center canvas.`
                        : profile.singleZone
                          ? isTriangleLayout
                            ? "Single color for the whole chain over Bluetooth."
                            : "This BLE device sends one color for the whole strip. The preview shows wire placement only."
                          : `All ${layout.ledCount} LEDs share the same color.`}
                    </Text>
                  </div>
                </div>
              </>
            ) : (
              <ExternalBleEffectPanel
                deviceModel={device?.deviceModel || profile?.model}
                settings={settings}
                onChange={onChange}
                connected={connected}
                ledOn={ledOn}
              />
            )}
          </section>

          {isSingleTab ? (
            <section className="external-color-studio__section">
              <SectionLabel icon={IconSun}>Brightness</SectionLabel>
              <AppSlider
                classNames={appSliderBrightnessClassNames}
                value={brightnessUi}
                onChange={setBrightnessUi}
                onChangeEnd={(value) => onChange({ brightness: value })}
                min={1}
                max={100}
                label={(value) => `${value}%`}
              />
            </section>
          ) : null}

          {isSingleTab ? (
            <section className="color-section color-section--last external-color-studio__section">
              <SectionLabel icon={IconSparkles}>Quick colors</SectionLabel>
              <div className="preset-grid preset-grid--mini">
                {PRESETS.map((preset, index) => {
                  const active = hexUpper === preset.color.toUpperCase();
                  const isDark = preset.color.toLowerCase() === "#000000";
                  return (
                    <Tooltip key={preset.color} label={`${preset.label} · key ${index + 1}`}>
                      <button
                        type="button"
                        className={`preset-chip ${active ? "preset-chip--active" : ""}`}
                        onClick={() => (onPreset ? onPreset(index) : applyColor(preset.color))}
                        aria-label={`${preset.label}, key ${index + 1}`}
                      >
                        <span
                          className={`preset-chip__color ${isDark ? "preset-chip__color--dark" : ""}`}
                          style={{ background: preset.color }}
                        />
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="external-color-studio__meta">
            <div className="preview-meta-card">
              <div className="preview-meta-card__label">RGB</div>
              <Text fw={600} ff="monospace" size="sm">
                {r}, {g}, {b}
              </Text>
            </div>
            <div className="preview-meta-card">
              <div className="preview-meta-card__label">Layout</div>
              <Text fw={600} size="sm">
                {layout.previewTitle}
              </Text>
            </div>
            <div className="preview-meta-card">
              <div className="preview-meta-card__label">LEDs</div>
              <Text fw={600} size="sm">
                {layout.unitLabel}
              </Text>
            </div>
            <div className="preview-meta-card">
              <div className="preview-meta-card__label">Status</div>
              <Text fw={600} size="sm" c={connected && ledOn ? "teal" : "dimmed"}>
                {connected ? (ledOn ? "On" : "Off") : "Offline"}
              </Text>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExternalColorStudio;
