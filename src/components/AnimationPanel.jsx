import { useState } from "react";
import { SegmentedControl, Text, Tooltip } from "@mantine/core";
import {
  IconActivity,
  IconBolt,
  IconBulb,
  IconCloud,
  IconCloudBolt,
  IconColorSwatch,
  IconComet,
  IconDroplet,
  IconFlame,
  IconHeartbeat,
  IconMeteor,
  IconMoon,
  IconPalette,
  IconPlayerStop,
  IconRipple,
  IconScan,
  IconSend,
  IconShield,
  IconSparkles,
  IconStars,
  IconSunset2,
  IconTransitionRight,
  IconVolcano,
  IconWaveSine,
} from "@tabler/icons-react";
import { buildAnimationSwitchPatch } from "../lib/animationColors";
import {
  toastAiAnimationApplied,
  toastAiAnimationError,
  toastAiGradientMissingKey,
} from "../lib/appToast";
import {
  AI_ANIMATION_MODES,
  analyzeColorPrompt,
  buildAnimationPaletteAiPatch,
  parseAnimationPaletteSuggestion,
} from "../lib/openaiAnimation";
import { skydimo } from "../lib/skydimoApi";
import {
  ANIMATION_IDS,
  ANIMATIONS,
  ANIMATION_PALETTE,
  getAnimationColorControls,
  getAnimationConfig,
  isValidAnimationId,
} from "../lib/animations";
import { AnimationColorControls, AnimationSingleColorControl } from "./AnimationColorControls";
import { AppSlider, appSliderTuningClassNames } from "./ui/AppSlider";

const ANIMATION_ICONS = {
  [ANIMATION_IDS.RAINBOW]: IconPalette,
  [ANIMATION_IDS.CHASE]: IconBolt,
  [ANIMATION_IDS.BREATHE]: IconMoon,
  [ANIMATION_IDS.WAVE]: IconWaveSine,
  [ANIMATION_IDS.SPARKLE]: IconStars,
  [ANIMATION_IDS.FIRE]: IconFlame,
  [ANIMATION_IDS.AURORA]: IconCloud,
  [ANIMATION_IDS.PULSE]: IconRipple,
  [ANIMATION_IDS.COMET]: IconComet,
  [ANIMATION_IDS.STROBE]: IconBolt,
  [ANIMATION_IDS.BLEND]: IconColorSwatch,
  [ANIMATION_IDS.POLICE]: IconShield,
  [ANIMATION_IDS.OCEAN]: IconDroplet,
  [ANIMATION_IDS.HEARTBEAT]: IconHeartbeat,
  [ANIMATION_IDS.SCANNER]: IconScan,
  [ANIMATION_IDS.METEOR]: IconMeteor,
  [ANIMATION_IDS.LIGHTNING]: IconCloudBolt,
  [ANIMATION_IDS.LAVA]: IconVolcano,
  [ANIMATION_IDS.NEON]: IconBulb,
  [ANIMATION_IDS.TWINKLE]: IconSparkles,
  [ANIMATION_IDS.SPECTRUM]: IconTransitionRight,
  [ANIMATION_IDS.FADE]: IconSunset2,
  [ANIMATION_IDS.CANDLE]: IconFlame,
};

export function AnimationPanel({ settings, onChange }) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMood, setAiMood] = useState("");
  const activeId = isValidAnimationId(settings.animationId) ? settings.animationId : null;
  const activeConfig = activeId ? getAnimationConfig(activeId) : null;
  const colorControls = getAnimationColorControls(activeConfig);
  const speed = settings.animationSpeed ?? 50;
  const intensity = settings.animationIntensity ?? 50;
  const [speedUi, setSpeedUi] = useState(speed);
  const [intensityUi, setIntensityUi] = useState(intensity);
  const reverse = Boolean(settings.animationReverse);
  const hasApiKey = Boolean(settings.openaiApiKey?.trim());

  const selectAnimation = (id) => {
    onChange(buildAnimationSwitchPatch(settings, id));
  };

  const stopAnimation = () => {
    onChange({ animationId: null });
  };

  const suggestAnimationWithAi = async (mode = AI_ANIMATION_MODES.PALETTE_FRESH) => {
    const apiKey = settings.openaiApiKey?.trim();
    if (!apiKey) {
      toastAiGradientMissingKey();
      return;
    }

    if (!activeId) {
      toastAiAnimationError("Select an effect first — AI generates colors for the active animation.");
      return;
    }

    const effectConfig = getAnimationConfig(activeId);
    const paletteMode =
      effectConfig?.colorPalette === ANIMATION_PALETTE.SINGLE ? "single" : "multi";
    const constraints = analyzeColorPrompt(aiMood);

    setAiLoading(true);
    try {
      const raw = await skydimo.suggestAnimation({
        apiKey,
        mode,
        animationId: activeId,
        effectLabel: effectConfig?.label || "Animation",
        effectHint: effectConfig?.hint || "LED perimeter effect",
        paletteMode,
        mood: aiMood,
        constraints,
      });

      const nextStops = parseAnimationPaletteSuggestion(raw, settings, mode, activeId, aiMood);
      onChange(buildAnimationPaletteAiPatch(settings, nextStops));
      toastAiAnimationApplied(mode, effectConfig?.label);
    } catch (error) {
      toastAiAnimationError(error?.message);
    } finally {
      setAiLoading(false);
    }
  };

  const submitAiPrompt = (event) => {
    event?.preventDefault();
    if (aiLoading) return;
    suggestAnimationWithAi(AI_ANIMATION_MODES.PALETTE_FRESH);
  };

  const handleAiKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitAiPrompt();
    }
  };

  return (
    <div className="animation-panel">
      <Text size="xs" c="dimmed" lh={1.45} mb={4}>
        Pick an effect and tune speed, intensity, and colors. Effects run on the device while this
        tab is open.
      </Text>

      <div className="animation-effect-grid" role="list">
        {ANIMATIONS.map(({ id, label, hint }) => {
          const Icon = ANIMATION_ICONS[id] || IconActivity;
          const active = activeId === id;
          return (
            <Tooltip key={id} label={hint} openDelay={350}>
              <button
                type="button"
                role="listitem"
                className={`animation-effect-card ${active ? "animation-effect-card--active" : ""}`}
                onClick={() => selectAnimation(id)}
                aria-pressed={active}
              >
                <span className="animation-effect-card__icon" aria-hidden>
                  <Icon size={14} stroke={1.75} />
                </span>
                <span className="animation-effect-card__label">{label}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {activeId && (
        <button type="button" className="animation-stop-btn" onClick={stopAnimation}>
          <IconPlayerStop size={14} stroke={1.75} aria-hidden />
          <span>Stop animation</span>
        </button>
      )}

      <form
        className={`animation-ai-composer ${!activeId ? "animation-ai-composer--idle" : ""}`}
        onSubmit={submitAiPrompt}
      >
        <div className="animation-ai-composer__header">
          <span className="animation-ai-composer__badge" aria-hidden>
            <IconSparkles size={14} stroke={1.75} />
          </span>
          <div className="animation-ai-composer__heading">
            <Text fw={600} size="sm">
              AI colors
            </Text>
            <Text size="xs" c="dimmed" lh={1.35}>
              {activeId
                ? `Generate a palette for ${activeConfig?.label || "this effect"} — effect stays the same.`
                : "Select an effect above, then describe the colors you want."}
            </Text>
          </div>
        </div>

        <div
          className={`animation-ai-composer__field ${aiLoading ? "animation-ai-composer__field--loading" : ""}`}
        >
          <textarea
            className="animation-ai-composer__input"
            value={aiMood}
            onChange={(event) => setAiMood(event.currentTarget.value)}
            onKeyDown={handleAiKeyDown}
            placeholder={
              activeId
                ? "Sunset orange and purple, icy blue, red & blue police…"
                : "Pick an effect first…"
            }
            rows={2}
            disabled={aiLoading || !activeId}
            aria-label="Animation color prompt"
          />
          <button
            type="submit"
            className="animation-ai-composer__send"
            disabled={aiLoading || !hasApiKey || !activeId}
            aria-label="Generate colors for current effect"
            title={
              !activeId
                ? "Select an effect first"
                : hasApiKey
                  ? "Generate colors (Enter)"
                  : "Add OpenAI API key in Settings"
            }
          >
            {aiLoading ? (
              <span className="animation-ai-composer__spinner" aria-hidden />
            ) : (
              <IconSend size={17} stroke={1.85} aria-hidden />
            )}
          </button>
        </div>

        <div className="animation-ai-composer__footer">
          <Text size="xs" c="dimmed" className="animation-ai-composer__hint">
            Enter to generate · Shift+Enter for new line
          </Text>
          {activeId ? (
            <button
              type="button"
              className="animation-ai-composer__chip"
              disabled={aiLoading || !hasApiKey}
              onClick={() => suggestAnimationWithAi(AI_ANIMATION_MODES.PALETTE_BLEND)}
            >
              Keep edge colors (uses current keyframes)
            </button>
          ) : null}
        </div>

        {!hasApiKey ? (
          <Text size="xs" c="dimmed" lh={1.45} className="animation-ai-composer__key-hint">
            Add your OpenAI API key in Settings to use AI suggestions.
          </Text>
        ) : null}
      </form>

      {activeId && (
        <div className="animation-customize">
          <Text fw={600} size="sm" className="animation-customize__title">
            Customize
          </Text>

          {colorControls.showPalette ? (
            <AnimationColorControls settings={settings} onChange={onChange} />
          ) : null}

          {colorControls.showSingleColor ? (
            <AnimationSingleColorControl settings={settings} onChange={onChange} label="Color" />
          ) : null}

          <div className="animation-tuning">
            <div className="animation-tuning__header">
              <span className="animation-tuning__label">Speed</span>
              <span className="animation-tuning__value">{speedUi}%</span>
            </div>
            <AppSlider
              value={speed}
              onLiveChange={setSpeedUi}
              onChange={(value) => onChange({ animationSpeed: value })}
              min={1}
              max={100}
              size="md"
              classNames={appSliderTuningClassNames}
            />
          </div>

          <div className="animation-tuning">
            <div className="animation-tuning__header">
              <span className="animation-tuning__label">Intensity</span>
              <span className="animation-tuning__value">{intensityUi}%</span>
            </div>
            <AppSlider
              value={intensity}
              onLiveChange={setIntensityUi}
              onChange={(value) => onChange({ animationIntensity: value })}
              min={1}
              max={100}
              size="md"
              classNames={appSliderTuningClassNames}
            />
          </div>

          <div className="animation-direction">
            <span className="animation-tuning__label">Direction</span>
            <Text size="xs" c="dimmed" lh={1.35} mb={6}>
              Forward follows wire path from calibration (
              {settings.stripDirection === "ccw" ? "counter-clockwise" : "clockwise"}). Reverse
              runs opposite.
            </Text>
            <SegmentedControl
              value={reverse ? "reverse" : "forward"}
              onChange={(value) => onChange({ animationReverse: value === "reverse" })}
              data={[
                { label: "Forward", value: "forward" },
                { label: "Reverse", value: "reverse" },
              ]}
              size="xs"
              fullWidth
              classNames={{
                root: "animation-direction__segmented",
                indicator: "animation-direction__indicator",
                label: "animation-direction__label",
                control: "animation-direction__control",
              }}
            />
          </div>
        </div>
      )}

      {!activeId && (
        <Text size="xs" c="dimmed" lh={1.45} className="animation-panel__idle-hint">
          Select an effect above, then use AI to generate its color palette.
        </Text>
      )}
    </div>
  );
}
