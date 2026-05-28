import { useMemo, useState } from "react";
import { Text, Tooltip } from "@mantine/core";
import {
  IconActivity,
  IconArrowMoveLeft,
  IconArrowMoveRight,
  IconBolt,
  IconCloud,
  IconCloudBolt,
  IconConfetti,
  IconDroplet,
  IconFlame,
  IconHeartbeat,
  IconMeteor,
  IconMoon,
  IconPalette,
  IconRipple,
  IconScan,
  IconSearch,
  IconShield,
  IconSparkles,
  IconStars,
  IconSunset2,
  IconTransitionRight,
  IconWaveSine,
  IconX,
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
  ANIMATION_GROUP_IDS,
  ANIMATION_GROUP_OPTIONS,
  ANIMATION_IDS,
  ANIMATION_PALETTE,
  filterAnimations,
  getAnimationColorControls,
  getAnimationConfig,
  isValidAnimationId,
} from "../lib/animations";
import { AnimationColorControls, AnimationSingleColorControl } from "./AnimationColorControls";
import { AnimationTuningSliders } from "./AnimationTuningSliders";
import { AiColorAssistant } from "./AiColorAssistant";
import { SectionLabel } from "./ui/AppPanel";

const ANIMATION_ICONS = {
  [ANIMATION_IDS.RAINBOW]: IconPalette,
  [ANIMATION_IDS.CHASE]: IconBolt,
  [ANIMATION_IDS.BREATHE]: IconMoon,
  [ANIMATION_IDS.WAVE]: IconWaveSine,
  [ANIMATION_IDS.SPARKLE]: IconStars,
  [ANIMATION_IDS.FIRE]: IconFlame,
  [ANIMATION_IDS.AURORA]: IconCloud,
  [ANIMATION_IDS.PULSE]: IconRipple,
  [ANIMATION_IDS.STROBE]: IconBolt,
  [ANIMATION_IDS.POLICE]: IconShield,
  [ANIMATION_IDS.HEARTBEAT]: IconHeartbeat,
  [ANIMATION_IDS.SCANNER]: IconScan,
  [ANIMATION_IDS.METEOR]: IconMeteor,
  [ANIMATION_IDS.LIGHTNING]: IconCloudBolt,
  [ANIMATION_IDS.SPECTRUM]: IconTransitionRight,
  [ANIMATION_IDS.FADE]: IconSunset2,
  [ANIMATION_IDS.GLITTER]: IconSparkles,
  [ANIMATION_IDS.CASCADE]: IconDroplet,
  [ANIMATION_IDS.DISCO]: IconConfetti,
};

export function AnimationPanel({ settings, onChange }) {
  const [aiLoading, setAiLoading] = useState(false);
  const [effectGroup, setEffectGroup] = useState(ANIMATION_GROUP_IDS.ALL);
  const [effectQuery, setEffectQuery] = useState("");
  const activeId = isValidAnimationId(settings.animationId) ? settings.animationId : null;
  const activeConfig = activeId ? getAnimationConfig(activeId) : null;
  const colorControls = getAnimationColorControls(activeConfig);
  const speed = settings.animationSpeed ?? 50;
  const intensity = settings.animationIntensity ?? 50;
  const reverse = Boolean(settings.animationReverse);
  const hasApiKey = Boolean(settings.openaiApiKey?.trim());

  const selectAnimation = (id) => {
    onChange(buildAnimationSwitchPatch(settings, id));
  };

  const suggestAnimationWithAi = async (prompt, mode = AI_ANIMATION_MODES.PALETTE_FRESH) => {
    const apiKey = settings.openaiApiKey?.trim();
    if (!apiKey) {
      toastAiGradientMissingKey();
      return { ok: false, error: "Add your OpenAI API key in Settings to use AI suggestions." };
    }

    if (!activeId) {
      return {
        ok: false,
        error: "Select an effect first — I'll generate colors for the active animation.",
      };
    }

    const trimmedPrompt = prompt?.trim() || "";
    if (!trimmedPrompt && mode === AI_ANIMATION_MODES.PALETTE_FRESH) {
      return { ok: false, error: "Tell me what colors or mood you want first." };
    }

    const effectConfig = getAnimationConfig(activeId);
    const paletteMode =
      effectConfig?.colorPalette === ANIMATION_PALETTE.SINGLE ? "single" : "multi";
    const constraints = analyzeColorPrompt(trimmedPrompt);

    setAiLoading(true);
    try {
      const raw = await skydimo.suggestAnimation({
        apiKey,
        mode,
        animationId: activeId,
        effectLabel: effectConfig?.label || "Animation",
        effectHint: effectConfig?.hint || "LED perimeter effect",
        paletteMode,
        mood: trimmedPrompt,
        constraints,
      });

      const nextStops = parseAnimationPaletteSuggestion(raw, settings, mode, activeId, trimmedPrompt);
      onChange(buildAnimationPaletteAiPatch(settings, nextStops));
      toastAiAnimationApplied(mode, effectConfig?.label);

      const effectLabel = effectConfig?.label || "this effect";
      const message =
        mode === AI_ANIMATION_MODES.PALETTE_BLEND
          ? `Updated the middle colors for ${effectLabel} while keeping your edge keyframes.`
          : trimmedPrompt
            ? `Applied a new palette to ${effectLabel} based on “${trimmedPrompt}”.`
            : `Applied a new palette to ${effectLabel}.`;

      return { ok: true, message };
    } catch (error) {
      toastAiAnimationError(error?.message);
      return { ok: false, error: error?.message || "Something went wrong. Try again." };
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiSend = async (prompt, options = {}) => {
    const mode =
      options.mode === "blend" ? AI_ANIMATION_MODES.PALETTE_BLEND : AI_ANIMATION_MODES.PALETTE_FRESH;
    return suggestAnimationWithAi(prompt, mode);
  };

  const visibleEffects = useMemo(
    () => filterAnimations({ group: effectGroup, query: effectQuery }),
    [effectGroup, effectQuery]
  );

  const hasEffectFilters =
    effectGroup !== ANIMATION_GROUP_IDS.ALL || effectQuery.trim().length > 0;

  return (
    <div className="animation-panel">
      <div className="animation-effect-picker">
        <div className="animation-effect-picker__bar">
          <div className="animation-effect-picker__filters" role="tablist" aria-label="Effect categories">
            {ANIMATION_GROUP_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`animation-effect-picker__filter ${effectGroup === id ? "animation-effect-picker__filter--active" : ""}`}
                aria-selected={effectGroup === id}
                onClick={() => setEffectGroup(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="animation-effect-picker__search">
            <IconSearch size={14} stroke={1.75} aria-hidden />
            <input
              type="search"
              value={effectQuery}
              onChange={(event) => setEffectQuery(event.currentTarget.value)}
              placeholder="Search…"
              aria-label="Search animation effects"
            />
            {effectQuery ? (
              <button
                type="button"
                className="animation-effect-picker__search-clear"
                onClick={() => setEffectQuery("")}
                aria-label="Clear search"
              >
                <IconX size={12} stroke={1.75} />
              </button>
            ) : null}
          </label>
        </div>

        {visibleEffects.length === 0 ? (
          <Text size="xs" c="dimmed" className="animation-effect-picker__empty">
            No effects match. Try another category or search term.
          </Text>
        ) : (
          <div className="animation-effect-grid" role="list">
            {visibleEffects.map(({ id, label, hint }) => {
              const Icon = ANIMATION_ICONS[id] || IconActivity;
              const active = activeId === id;
              return (
                <Tooltip key={id} label={hint} openDelay={300}>
                  <button
                    type="button"
                    role="listitem"
                    className={`animation-effect-chip ${active ? "animation-effect-chip--active" : ""}`}
                    onClick={() => selectAnimation(id)}
                    aria-pressed={active}
                    aria-label={`${label}. ${hint}`}
                  >
                    <span className="animation-effect-chip__icon" aria-hidden>
                      <Icon size={18} stroke={1.75} />
                    </span>
                    <span className="animation-effect-chip__label">{label}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}

        {hasEffectFilters ? (
          <Text size="xs" c="dimmed" className="animation-effect-picker__meta">
            {visibleEffects.length} effect{visibleEffects.length === 1 ? "" : "s"}
          </Text>
        ) : null}
      </div>

      {activeId && (
        <section className="animation-customize">
          <SectionLabel
            icon={IconPalette}
            right={
              <AiColorAssistant
                key={activeId}
                title="AI Color Assistant"
                contextLabel={
                  activeConfig?.label
                    ? `Palette for ${activeConfig.label}`
                    : "Animation colors"
                }
                disabled={!activeId}
                disabledTitle="Select an effect first"
                hasApiKey={hasApiKey}
                loading={aiLoading}
                onSend={handleAiSend}
                welcomeMessage={
                  activeConfig?.label
                    ? `Hi! Tell me the colors you want for ${activeConfig.label}. I'll update the palette and keep the same effect.`
                    : "Hi! Pick an effect first, then describe the colors you want."
                }
                placeholder="Sunset orange and purple, icy blue, red & blue police…"
                suggestions={[
                  "Sunset orange and purple",
                  "Icy blue and white",
                  "Neon cyberpunk",
                ]}
                showBlend={Boolean(activeId)}
                blendLabel="Keep edge colors"
              />
            }
          >
            Customize
          </SectionLabel>

          {colorControls.showPalette ? (
            <AnimationColorControls settings={settings} onChange={onChange} />
          ) : null}

          {colorControls.showSingleColor ? (
            <AnimationSingleColorControl settings={settings} onChange={onChange} label="Color" />
          ) : null}

          <div className="animation-tuning-grid">
            <AnimationTuningSliders speed={speed} intensity={intensity} onChange={onChange} />

            <div className="animation-tuning-grid__direction">
              <span className="animation-tuning__label">Direction</span>
              <div className="animation-direction__toggle" role="group" aria-label="Playback direction">
                <Tooltip label="Forward along wire path" withArrow openDelay={300}>
                  <button
                    type="button"
                    className={`animation-direction__btn ${!reverse ? "animation-direction__btn--active" : ""}`}
                    onClick={() => onChange({ animationReverse: false })}
                    aria-label="Forward along wire path"
                    aria-pressed={!reverse}
                  >
                    <IconArrowMoveRight size={17} stroke={1.85} aria-hidden />
                  </button>
                </Tooltip>
                <Tooltip label="Reverse along wire path" withArrow openDelay={300}>
                  <button
                    type="button"
                    className={`animation-direction__btn ${reverse ? "animation-direction__btn--active" : ""}`}
                    onClick={() => onChange({ animationReverse: true })}
                    aria-label="Reverse along wire path"
                    aria-pressed={reverse}
                  >
                    <IconArrowMoveLeft size={17} stroke={1.85} aria-hidden />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </section>
      )}

      {!activeId && (
        <Text size="xs" c="dimmed" lh={1.45} className="animation-panel__idle-hint">
          Select an effect above to customize colors, speed, and direction.
        </Text>
      )}
    </div>
  );
}
