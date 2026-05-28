import {
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconPlugConnected,
  IconSparkles,
  IconSun,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { PRESETS } from "../lib/constants";
import { isValidAnimationId } from "../lib/animations";
import { ensureHex, scaledRgb } from "../lib/colorUtils";
import { useAnimationPreview } from "../hooks/useAnimationPreview";
import { AppPanel, SectionLabel } from "./ui/AppPanel";
import { AppSlider, appSliderBrightnessClassNames } from "./ui/AppSlider";
import { ColorModePanel } from "./ColorModePanel";
import { GradientControls } from "./GradientControls";
import {
  applyHexToSettings,
  buildLedClearSelectionPatch,
  buildLedSelectionPatch,
  buildLedsSelectionPatch,
  COLOR_MODES,
  isPerLedPreview,
} from "../lib/ledLayout";
import { PreviewLedPicker } from "./PreviewLedPicker";

export function PreviewHero({
  hex,
  brightness,
  connected,
  livePreview,
  sending,
  ledOn = true,
  onQuickConnect,
  hideConnectOverlay = false,
  inlineMeta = false,
  variant = "standalone",
  colorMode = COLOR_MODES.SINGLE,
  settings,
  ledCount,
  deviceModel,
  onSelectLed,
  onSelectLeds,
  onClearSelection,
  screenLedColors,
}) {
  const previewHex = connected && !ledOn ? "#000000" : hex;
  const previewBrightness = connected && !ledOn ? 100 : brightness;
  const { r, g, b } = scaledRgb(previewHex, previewBrightness);
  const rgb = `rgb(${r}, ${g}, ${b})`;
  const statusLabel = connected ? (livePreview ? "Streaming" : "Connected") : "Offline";
  const statusShort = connected ? (livePreview ? "Stream" : "Online") : "Offline";
  const animationPreviewActive =
    colorMode === COLOR_MODES.ANIMATION && isValidAnimationId(settings?.animationId);
  const screenPreviewActive = colorMode === COLOR_MODES.SCREEN;
  const animationPreviewEnabled = animationPreviewActive && !(connected && !ledOn);
  const animatedLedColors = useAnimationPreview({
    enabled: animationPreviewEnabled,
    animationId: settings?.animationId,
    settings,
    ledCount,
    deviceModel,
  });
  const blackLedColors = useMemo(
    () => (ledCount ? Array.from({ length: ledCount }, () => "#000000") : []),
    [ledCount]
  );

  if (variant === "embedded") {
    const perLedMode = isPerLedPreview(colorMode);
    const showLedMap = perLedMode || animationPreviewActive || screenPreviewActive;
    const animationLedColors =
      animationPreviewActive && connected && !ledOn
        ? blackLedColors
        : animatedLedColors.length === ledCount
          ? animatedLedColors
          : undefined;
    const screenColors =
      screenPreviewActive && Array.isArray(screenLedColors) && screenLedColors.length === ledCount
        ? screenLedColors
        : undefined;
    const ledColorsOverride = screenColors || animationLedColors;

    return (
      <div className="preview-compact">
        <div
          className={`preview-compact__stage ${showLedMap ? "preview-compact__stage--leds" : ""}`}
          style={showLedMap ? undefined : { "--preview-rgb": rgb }}
        >
          {showLedMap ? (
            <PreviewLedPicker
              settings={settings}
              ledCount={ledCount}
              deviceModel={deviceModel}
              onSelectLed={onSelectLed}
              onSelectLeds={onSelectLeds}
              onClearSelection={onClearSelection}
              connected={connected}
              livePreview={livePreview}
              ledOn={ledOn}
              ledColorsOverride={ledColorsOverride}
              readOnly={animationPreviewActive || screenPreviewActive}
            />
          ) : (
            <>
              <Box className="preview-compact__orb-wrap">
                <Box className="preview-orb__halo preview-orb__halo--compact" style={{ background: rgb }} />
                <Box
                  className={`preview-orb preview-orb--compact ${sending ? "preview-orb--pulse" : ""}`}
                  style={{
                    background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), ${rgb} 55%, color-mix(in srgb, ${rgb} 70%, black))`,
                    boxShadow: `0 0 0 10px rgba(${r},${g},${b},0.06), 0 0 72px rgba(${r},${g},${b},0.45), inset 0 -6px 18px rgba(0,0,0,0.22)`,
                  }}
                />
              </Box>

              <Box className="preview-led-strip preview-led-strip--compact" style={{ "--preview-rgb": rgb }}>
                <Box className="preview-led-strip__dots" aria-hidden>
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span key={i} className="preview-led-dot" />
                  ))}
                </Box>
              </Box>

              {livePreview && connected && ledOn && (
                <Badge color="teal" variant="light" className="preview-live-badge preview-live-badge--compact">
                  Live
                </Badge>
              )}

              {connected && !ledOn && (
                <Badge color="gray" variant="filled" className="preview-live-badge preview-live-badge--compact">
                  Off
                </Badge>
              )}

              <Box
                aria-hidden
                className="preview-compact__glow"
                style={{
                  background: `radial-gradient(circle at 50% 40%, rgba(${r},${g},${b},0.14), transparent 58%)`,
                }}
              />
            </>
          )}

          {!connected && !hideConnectOverlay && (
            <Box className="preview-disconnect-overlay preview-disconnect-overlay--compact">
              <Stack align="center" gap="sm" maw={180}>
                <Text fw={600} size="sm" ta="center">
                  No LED connected
                </Text>
                <Button
                  leftSection={<IconPlugConnected size={14} />}
                  onClick={onQuickConnect}
                  className="btn-soft-primary"
                  radius="sm"
                  size="compact-sm"
                >
                  Connect
                </Button>
              </Stack>
            </Box>
          )}
        </div>

        <div className="preview-compact__meta">
          <div className="preview-meta-card preview-meta-card--embedded">
            <div className="preview-meta-card__label">HEX</div>
            <Group justify="space-between" wrap="nowrap" gap={4}>
              <Text fw={600} ff="monospace" size="xs">
                {hex}
              </Text>
              <CopyButton value={hex}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy"}>
                    <Button variant="subtle" size="compact-xs" onClick={copy} px={4} color="gray">
                      {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </div>
          <div className="preview-meta-card preview-meta-card--embedded">
            <div className="preview-meta-card__label">RGB</div>
            <Text fw={600} ff="monospace" size="xs">
              {r}, {g}, {b}
            </Text>
          </div>
          <div className="preview-meta-card preview-meta-card--embedded">
            <div className="preview-meta-card__label">Status</div>
            <Text fw={600} size="xs" c={connected ? "teal" : "dimmed"}>
              {statusShort}
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Stack gap="xs" className="preview-stack">
      <AppPanel noPadding variant="soft" className="preview-hero">
        <Box className="preview-hero__inner" style={{ "--preview-rgb": rgb }}>
          <Box className="preview-orb__halo" style={{ background: rgb }} />
          <Box
            className={`preview-orb ${sending ? "preview-orb--pulse" : ""}`}
            style={{
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), ${rgb} 55%, color-mix(in srgb, ${rgb} 70%, black))`,
              boxShadow: `0 0 0 14px rgba(${r},${g},${b},0.06), 0 0 100px rgba(${r},${g},${b},0.5), inset 0 -8px 24px rgba(0,0,0,0.25)`,
            }}
          />
        </Box>

        <Box className="preview-led-strip" style={{ "--preview-rgb": rgb }}>
          <Box className="preview-led-strip__dots" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="preview-led-dot" />
            ))}
          </Box>
        </Box>

        {livePreview && connected && ledOn && (
          <Badge color="teal" variant="light" className="preview-live-badge">
            Live preview
          </Badge>
        )}

        {connected && !ledOn && (
          <Badge color="gray" variant="filled" className="preview-live-badge">
            LEDs off
          </Badge>
        )}

        {!connected && !hideConnectOverlay && (
          <Box className="preview-disconnect-overlay">
            <Stack align="center" gap="md" maw={320}>
              <Text fw={600} size="lg" ta="center">
                No LED connected
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Plug in Skydimo via USB — the app will auto-detect CH340 devices
              </Text>
              <Button
                leftSection={<IconPlugConnected size={16} />}
                onClick={onQuickConnect}
                className="btn-soft-primary"
                radius="sm"
                size="md"
              >
                Connect now
              </Button>
            </Stack>
          </Box>
        )}

        <Box
          aria-hidden
          className="preview-hero__spacer"
          style={{
            background: `radial-gradient(circle at 50% 30%, rgba(${r},${g},${b},0.12), transparent 50%)`,
          }}
        />
      </AppPanel>

      {inlineMeta ? (
        <div className="preview-meta-inline">
          <div className="preview-meta-card preview-meta-card--inline">
            <div className="preview-meta-card__label">HEX</div>
            <Text fw={600} ff="monospace" size="sm">
              {hex}
            </Text>
          </div>
          <div className="preview-meta-card preview-meta-card--inline">
            <div className="preview-meta-card__label">RGB</div>
            <Text fw={600} ff="monospace" size="sm">
              {r}, {g}, {b}
            </Text>
          </div>
          <div className="preview-meta-card preview-meta-card--inline">
            <div className="preview-meta-card__label">Status</div>
            <Text fw={600} size="sm" c={connected ? "teal" : "dimmed"}>
              {connected ? (livePreview ? "Stream" : "Online") : "Offline"}
            </Text>
          </div>
        </div>
      ) : (
        <div className="preview-meta-grid">
          <div className="preview-meta-card">
            <div className="preview-meta-card__label">HEX</div>
            <Group justify="space-between" wrap="nowrap" gap={6}>
              <Text fw={600} ff="monospace" size="sm">
                {hex}
              </Text>
              <CopyButton value={hex}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied" : "Copy"}>
                    <Button variant="subtle" size="compact-xs" onClick={copy} px={6} color="gray">
                      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </div>
          <div className="preview-meta-card">
            <div className="preview-meta-card__label">RGB</div>
            <Text fw={600} ff="monospace" size="sm">
              {r}, {g}, {b}
            </Text>
          </div>
          <div className="preview-meta-card">
            <div className="preview-meta-card__label">Status</div>
            <Text fw={600} size="sm" c={connected ? "teal" : "dimmed"}>
              {statusLabel}
            </Text>
          </div>
        </div>
      )}
    </Stack>
  );
}

export function ColorControls({
  settings,
  connected,
  ledCount,
  deviceModel,
  onChange,
  onPreset,
  ledOn = true,
  sending = false,
  onQuickConnect,
  hideConnectOverlay = false,
  screenCaptureReady = false,
  screenCaptureError = null,
  screenSources = [],
  screenLedColors = [],
  onScreenSyncSmoothnessPreview,
}) {
  const hexUpper = ensureHex(settings.hex).toUpperCase();
  const isAnimationMode = settings.colorMode === COLOR_MODES.ANIMATION;
  const isScreenMode = settings.colorMode === COLOR_MODES.SCREEN;
  const [brightnessUi, setBrightnessUi] = useState(settings.brightness ?? 100);

  const applyColor = (hex) => {
    const patch = applyHexToSettings(settings, hex, ledCount, deviceModel);
    if (patch) {
      onChange(patch);
    }
  };

  return (
    <div
      className="color-studio"
      style={{ "--studio-color": settings.hex, "--glow-color": settings.hex }}
    >
      <div className="color-studio__workspace">
        <aside className="color-studio__preview" aria-label="Live preview">
          <PreviewHero
            variant="embedded"
            hex={settings.hex}
            brightness={settings.brightness}
            connected={connected}
            livePreview={true}
            sending={sending}
            ledOn={ledOn}
            onQuickConnect={onQuickConnect}
            hideConnectOverlay={hideConnectOverlay}
            colorMode={settings.colorMode}
            settings={settings}
            ledCount={ledCount}
            deviceModel={deviceModel}
            onSelectLed={(index) => onChange(buildLedSelectionPatch(settings, ledCount, index))}
            onSelectLeds={(indices) => {
              const patch = buildLedsSelectionPatch(settings, ledCount, indices, deviceModel);
              if (patch) {
                onChange(patch);
              }
            }}
            onClearSelection={() => onChange(buildLedClearSelectionPatch())}
            screenLedColors={screenLedColors}
          />
        </aside>

        <div className="color-studio__scroll ui-stagger-children">
          <ColorModePanel
            settings={settings}
            ledCount={ledCount}
            onChange={onChange}
            onColorChange={applyColor}
            screenCaptureReady={screenCaptureReady}
            screenCaptureError={screenCaptureError}
            screenSources={screenSources}
            onScreenSyncSmoothnessPreview={onScreenSyncSmoothnessPreview}
          />

          <GradientControls
            settings={settings}
            ledCount={ledCount}
            deviceModel={deviceModel}
            onChange={onChange}
            onColorChange={applyColor}
          />

          <section className="color-section">
            <SectionLabel
              icon={IconSun}
              right={<span className="color-studio__brightness-value">{brightnessUi}%</span>}
            >
              Brightness
            </SectionLabel>
            <div className="brightness-block">
              <AppSlider
                value={settings.brightness ?? 100}
                onLiveChange={setBrightnessUi}
                onChange={(value) => onChange({ brightness: value })}
                min={0}
                max={100}
                color="teal"
                size="md"
                classNames={appSliderBrightnessClassNames}
              />
              <div className="brightness-block__labels">
                <Text size="xs" c="dimmed">
                  Dim
                </Text>
                <Text size="xs" c="dimmed">
                  Bright
                </Text>
              </div>
            </div>
          </section>

          {!isAnimationMode && !isScreenMode && (
            <section className="color-section color-section--last">
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
                        onClick={() => onPreset(index)}
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
          )}
        </div>
      </div>
    </div>
  );
}
