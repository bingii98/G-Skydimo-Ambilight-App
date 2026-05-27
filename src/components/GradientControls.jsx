import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import {
  IconBucket,
  IconGradienter,
  IconPlus,
  IconSend,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import {
  buildGradientTrackBackground,
  buildGradientPaintPatch,
  COLOR_MODES,
  getSelectedLeds,
  insertGradientStop,
  LED_PAINT_MODES,
  removeGradientStop,
  resolveGradientStops,
  sampleGradientAt,
  clampGradientStopPosition,
  GRADIENT_STOP_MIN_GAP,
  updateGradientStopColor,
  updateGradientStopPosition,
} from "../lib/ledLayout";
import { ensureHex, normalizeHex } from "../lib/colorUtils";
import {
  toastAiGradientApplied,
  toastAiGradientError,
  toastAiGradientMissingKey,
  toastWarning,
} from "../lib/appToast";
import {
  AI_GRADIENT_MODES,
  getGradientAnchorPair,
  parseBlendGradientSuggestion,
  parseFreshGradientSuggestion,
} from "../lib/openaiGradient";
import { analyzeColorPrompt } from "../lib/animationPalettePrompt";
import { skydimo } from "../lib/skydimoApi";
import { ColorPickerPopover } from "./ColorPickerPopup";
import { SectionLabel } from "./ui/AppPanel";

const PAINT_OPTIONS = [
  { id: LED_PAINT_MODES.SOLID, label: "Solid", icon: IconBucket },
  { id: LED_PAINT_MODES.GRADIENT, label: "Gradient", icon: IconGradienter },
];

function sortedStops(stops) {
  return [...stops].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

function stopEdgeFlags(stops, stopId) {
  const ordered = sortedStops(stops);
  const index = ordered.findIndex((stop) => stop.id === stopId);
  return {
    index,
    isFirst: index === 0,
    isLast: index === ordered.length - 1,
    isEdge: index === 0 || index === ordered.length - 1,
  };
}

function positionFromPointer(track, clientY, stopId, stops) {
  const rect = track.getBoundingClientRect();
  const raw = (clientY - rect.top) / rect.height;
  if (!stopId) {
    return Math.max(GRADIENT_STOP_MIN_GAP, Math.min(1 - GRADIENT_STOP_MIN_GAP, raw));
  }

  return clampGradientStopPosition(stops, stopId, raw);
}

function formatStopPosition(position) {
  return `${Math.round(position * 100)}%`;
}

function findAddedStop(prevStops, nextStops) {
  return nextStops.find((stop) => !prevStops.some((existing) => existing.id === stop.id));
}

const NEW_STOP_ANIM_MS = 350;
const DRAG_THRESHOLD_PX = 4;

export function GradientControls({ settings, ledCount, deviceModel, onChange, onColorChange }) {
  const colorMode = settings.colorMode || COLOR_MODES.SINGLE;
  const selected = getSelectedLeds(settings, ledCount);
  const canPaintGradient = selected.length >= 2;
  const trackRef = useRef(null);
  const dragStopRef = useRef(null);
  const dragStartRef = useRef(null);
  const dragPreviewRef = useRef(null);
  const didDragRef = useRef(false);
  const [draggingId, setDraggingId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [newStopIds, setNewStopIds] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMood, setAiMood] = useState("");

  const markStopNew = useCallback((stopId) => {
    if (!stopId) return;
    setNewStopIds((ids) => (ids.includes(stopId) ? ids : [...ids, stopId]));
    window.setTimeout(() => {
      setNewStopIds((ids) => ids.filter((id) => id !== stopId));
    }, NEW_STOP_ANIM_MS);
  }, []);

  const paintMode = settings.ledPaintMode || LED_PAINT_MODES.SOLID;
  const gradientStops = resolveGradientStops(settings, settings.hex);
  const gradientStopsRef = useRef(gradientStops);

  useEffect(() => {
    gradientStopsRef.current = gradientStops;
  }, [gradientStops]);

  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  const visualStops = useMemo(() => {
    if (draggingId && dragPreview) {
      return updateGradientStopPosition(gradientStops, dragPreview.stopId, dragPreview.position);
    }
    return gradientStops;
  }, [gradientStops, draggingId, dragPreview]);

  const activeStopId = settings.gradientActiveStopId || gradientStops[0]?.id;
  const canRemoveStop = gradientStops.length > 2;
  const isGradient = paintMode === LED_PAINT_MODES.GRADIENT;
  const hasApiKey = Boolean(settings.openaiApiKey?.trim());
  const canUseAi = isGradient && canPaintGradient;

  const applyGradientRef = useRef(null);

  const applyGradient = useCallback(
    (nextStops, nextActiveId = activeStopId) => {
      const patch = buildGradientPaintPatch(settings, ledCount, deviceModel, {
        gradientStops: nextStops,
        gradientActiveStopId: nextActiveId,
      });
      if (patch) {
        onChange(patch);
      }
    },
    [activeStopId, deviceModel, ledCount, onChange, settings]
  );

  useEffect(() => {
    applyGradientRef.current = applyGradient;
  }, [applyGradient]);

  const finishDrag = useCallback(() => {
    dragStopRef.current = null;
    dragStartRef.current = null;
    dragPreviewRef.current = null;
    didDragRef.current = false;
    setDraggingId(null);
    setDragPreview(null);
  }, []);

  const updateDragPreview = useCallback((clientY) => {
    const stopId = dragStopRef.current;
    const track = trackRef.current;
    if (!stopId || !track) return;

    const position = positionFromPointer(track, clientY, stopId, gradientStopsRef.current);
    const next = { stopId, position };
    dragPreviewRef.current = next;
    setDragPreview(next);
  }, []);

  const commitDrag = useCallback(() => {
    const stopId = dragStopRef.current;
    const preview = dragPreviewRef.current;

    if (stopId && didDragRef.current && preview?.stopId === stopId) {
      const nextStops = updateGradientStopPosition(
        gradientStopsRef.current,
        stopId,
        preview.position
      );
      applyGradientRef.current?.(nextStops, stopId);
    } else if (stopId) {
      const stop = gradientStopsRef.current.find((item) => item.id === stopId);
      if (stop) {
        onChange({
          gradientActiveStopId: stopId,
          hex: stop.color,
        });
      }
    }

    finishDrag();
  }, [finishDrag, onChange]);

  const handleTrackPointerMove = useCallback(
    (event) => {
      if (!dragStopRef.current || !dragStartRef.current) return;

      const dy = Math.abs(event.clientY - dragStartRef.current.y);
      if (!didDragRef.current && dy > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }

      if (!didDragRef.current) return;

      dragStartRef.current.lastY = event.clientY;
      updateDragPreview(event.clientY);
    },
    [updateDragPreview]
  );

  const handleTrackPointerUp = useCallback(
    (event) => {
      if (!dragStopRef.current) return;
      if (didDragRef.current) {
        dragStartRef.current.lastY = event.clientY;
        updateDragPreview(event.clientY);
      }
      trackRef.current?.releasePointerCapture(event.pointerId);
      commitDrag();
    },
    [commitDrag, updateDragPreview]
  );

  if (colorMode !== COLOR_MODES.LEDS) {
    return null;
  }

  const setPaintMode = (nextMode) => {
    if (nextMode === paintMode) return;

    if (nextMode === LED_PAINT_MODES.GRADIENT) {
      const stops = resolveGradientStops(settings, settings.hex);
      const patch = canPaintGradient
        ? buildGradientPaintPatch(settings, ledCount, deviceModel, { gradientStops: stops })
        : null;

      if (patch) {
        onChange(patch);
        return;
      }

      onChange({
        ledPaintMode: LED_PAINT_MODES.GRADIENT,
        gradientStops: stops,
        gradientActiveStopId: settings.gradientActiveStopId || stops[0]?.id,
      });
      return;
    }

    onChange({ ledPaintMode: LED_PAINT_MODES.SOLID });
  };

  const selectStop = (stopId) => {
    const stop = gradientStops.find((item) => item.id === stopId);
    if (!stop) return;
    onChange({
      gradientActiveStopId: stopId,
      hex: stop.color,
    });
  };

  const applyStopColor = (stopId, hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;

    const nextStops = updateGradientStopColor(gradientStops, stopId, normalized);
    if (isGradient && canPaintGradient) {
      applyGradient(nextStops, stopId);
      return;
    }

    onChange({
      gradientActiveStopId: stopId,
      gradientStops: nextStops,
      hex: normalized,
    });
  };

  const addStop = () => {
    let bestGap = 0;
    let insertAt = 0.5;
    for (let index = 0; index < gradientStops.length - 1; index += 1) {
      const gap = gradientStops[index + 1].position - gradientStops[index].position;
      if (gap > bestGap) {
        bestGap = gap;
        insertAt = gradientStops[index].position + gap / 2;
      }
    }
    const nextStops = insertGradientStop(
      gradientStops,
      insertAt,
      sampleGradientAt(gradientStops, insertAt)
    );
    const added = findAddedStop(gradientStops, nextStops);
    markStopNew(added?.id);
    applyGradient(nextStops, added?.id || activeStopId);
  };

  const deleteStopById = (stopId) => {
    if (!canRemoveStop) return;
    const nextStops = removeGradientStop(gradientStops, stopId);
    if (nextStops.length === gradientStops.length) return;
    const nextActiveId = nextStops.some((stop) => stop.id === activeStopId)
      ? activeStopId
      : nextStops[0]?.id;
    applyGradient(nextStops, nextActiveId);
  };

  const suggestGradientWithAi = async (mode = AI_GRADIENT_MODES.FRESH) => {
    const apiKey = settings.openaiApiKey?.trim();
    if (!apiKey) {
      toastAiGradientMissingKey();
      return;
    }
    if (!canPaintGradient) {
      toastWarning("Select LEDs", "Choose 2 or more LEDs on the map before using AI gradient.");
      return;
    }

    const anchors = getGradientAnchorPair(gradientStops, settings.hex);
    const isFresh = mode === AI_GRADIENT_MODES.FRESH;
    const constraints = analyzeColorPrompt(aiMood);

    setAiLoading(true);
    try {
      const raw = await skydimo.suggestGradient({
        apiKey,
        mode,
        baseColor: settings.hex,
        colorFrom: anchors.colorFrom,
        colorTo: anchors.colorTo,
        topPosition: anchors.topPosition,
        bottomPosition: anchors.bottomPosition,
        mood: aiMood,
        constraints: isFresh ? constraints : undefined,
      });
      const nextStops = isFresh
        ? parseFreshGradientSuggestion(raw, settings.hex, aiMood)
        : parseBlendGradientSuggestion(raw, settings.hex, anchors);
      nextStops.forEach((stop) => markStopNew(stop.id));
      applyGradient(nextStops, nextStops[0]?.id);
      toastAiGradientApplied(nextStops.length, mode);
    } catch (error) {
      toastAiGradientError(error?.message);
    } finally {
      setAiLoading(false);
    }
  };

  const submitAiPrompt = (event) => {
    event?.preventDefault();
    if (aiLoading || !canUseAi) return;
    suggestGradientWithAi(AI_GRADIENT_MODES.FRESH);
  };

  const handleAiKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitAiPrompt(event);
    }
  };

  const handleTrackPointerDown = (event) => {
    if (event.button !== 0 || !isGradient) {
      return;
    }

    const target = event.target;
    if (target.closest(".gradient-editor__handle")) {
      return;
    }

    const track = trackRef.current;
    if (!track) return;

    const position = positionFromPointer(track, event.clientY, null, gradientStops);
    const nextStops = insertGradientStop(
      gradientStops,
      position,
      sampleGradientAt(gradientStops, position)
    );
    const added = findAddedStop(gradientStops, nextStops);
    markStopNew(added?.id);
    applyGradient(nextStops, added?.id || activeStopId);
  };

  const beginStopDrag = (event, stopId) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    dragStopRef.current = stopId;
    dragStartRef.current = { y: event.clientY, lastY: event.clientY };
    didDragRef.current = false;
    setDraggingId(stopId);
    setDragPreview(null);

    trackRef.current?.setPointerCapture(event.pointerId);
  };

  const orderedStops = sortedStops(visualStops);
  const hexUpper = ensureHex(settings.hex).toUpperCase();

  return (
    <section className="color-section gradient-controls">
      <SectionLabel
        icon={IconGradienter}
        right={
          <Text size="xs" c="dimmed" fw={600}>
            {canPaintGradient ? `${selected.length} LEDs` : "Select region"}
          </Text>
        }
      >
        Multi-LED paint
      </SectionLabel>

      <div className="paint-mode-switch" role="group" aria-label="Multi-LED paint mode">
        {PAINT_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`paint-mode-switch__btn ${paintMode === id ? "paint-mode-switch__btn--active" : ""}`}
            onClick={() => setPaintMode(id)}
            aria-pressed={paintMode === id}
          >
            <span className="paint-mode-switch__icon" aria-hidden>
              <Icon size={15} stroke={1.75} />
            </span>
            <span className="paint-mode-switch__label">{label}</span>
          </button>
        ))}
      </div>

      <div className="gradient-controls__panel paint-mode-panel">
        {!isGradient ? (
          <div className="gradient-controls__solid">
            <ColorPickerPopover
              hex={settings.hex}
              onChange={onColorChange}
              ariaLabel="Edit fill color"
              triggerClassName="gradient-controls__solid-swatch"
              triggerStyle={{ background: settings.hex, "--swatch-color": settings.hex }}
            />
            <div className="gradient-controls__solid-body">
              <Text fw={600} size="sm">
                Solid color
              </Text>
              <Text ff="monospace" size="xs" fw={600} className="gradient-controls__solid-hex">
                {hexUpper}
              </Text>
              <Text size="xs" c="dimmed" lh={1.45}>
                {canPaintGradient
                  ? `All ${selected.length} selected LEDs share one color. Click the swatch to paint.`
                  : "Select 2 or more LEDs on the preview map to paint a region."}
              </Text>
            </div>
          </div>
        ) : !canPaintGradient ? (
          <div className="gradient-controls__solid">
            <span className="gradient-controls__solid-swatch gradient-controls__solid-swatch--gradient" aria-hidden />
            <div className="gradient-controls__solid-body">
              <Text fw={600} size="sm">
                Gradient ready
              </Text>
              <Text size="xs" c="dimmed" lh={1.45}>
                Drag on the preview map to select 2 or more LEDs, then edit the gradient here.
              </Text>
            </div>
          </div>
        ) : (
          <div className="gradient-editor">
            <div className="gradient-editor__canvas">
              <div className="gradient-editor__toolbar" role="toolbar" aria-label="Gradient tools">
                <button
                  type="button"
                  className="gradient-editor__tool-btn"
                  onClick={addStop}
                  disabled={aiLoading}
                  aria-label="Add keyframe in largest gap"
                >
                  <IconPlus size={15} stroke={1.75} aria-hidden />
                  <span>Add</span>
                </button>
              </div>

              <div className="gradient-editor__workspace">
              <div className="gradient-editor__rail">
                <div
                  ref={trackRef}
                  className={`gradient-editor__track gradient-editor__track--vertical ${draggingId ? "gradient-editor__track--dragging" : ""}`}
                  onPointerDown={handleTrackPointerDown}
                  onPointerMove={handleTrackPointerMove}
                  onPointerUp={handleTrackPointerUp}
                  onPointerCancel={handleTrackPointerUp}
                  role="presentation"
                >
                  <div
                    className="gradient-editor__track-fill"
                    style={{ background: buildGradientTrackBackground(visualStops) }}
                    aria-hidden
                  />
                  <div className="gradient-editor__track-shine" aria-hidden />
                  {orderedStops.map((stop) => {
                    const isActive = stop.id === activeStopId;
                    const isDragging = stop.id === draggingId;
                    const { isEdge } = stopEdgeFlags(gradientStops, stop.id);

                    return (
                      <button
                        key={stop.id}
                        type="button"
                        className={`gradient-editor__handle ${isActive ? "gradient-editor__handle--active" : ""} ${isDragging ? "gradient-editor__handle--dragging" : ""} ${isEdge ? "gradient-editor__handle--edge" : ""} ${newStopIds.includes(stop.id) ? "gradient-editor__handle--new" : ""}`}
                        style={{ top: `${stop.position * 100}%` }}
                        onPointerDown={(event) => beginStopDrag(event, stop.id)}
                        aria-label={`Gradient keyframe at ${formatStopPosition(stop.position)} from top`}
                        aria-pressed={isActive}
                      >
                        <span
                          className="gradient-editor__handle-color"
                          style={{ background: stop.color }}
                        />
                        {isDragging ? (
                          <span className="gradient-editor__handle-badge">
                            {formatStopPosition(stop.position)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="gradient-editor__side">
                <div className="gradient-editor__stops" role="list" aria-label="Gradient keyframes">
                  {orderedStops.map((stop) => {
                    const isActive = stop.id === activeStopId;
                    const canDeleteStop = canRemoveStop;

                    return (
                      <div
                        key={stop.id}
                        role="listitem"
                        className={`gradient-stop-chip ${isActive ? "gradient-stop-chip--active" : ""} ${canDeleteStop ? "gradient-stop-chip--has-remove" : ""}`}
                      >
                        <div className="gradient-stop-chip__swatch-wrap">
                          <ColorPickerPopover
                            hex={stop.color}
                            onChange={(hex) => applyStopColor(stop.id, hex)}
                            onOpen={() => selectStop(stop.id)}
                            ariaLabel={`Edit keyframe at ${formatStopPosition(stop.position)} from top`}
                            triggerClassName="gradient-stop-chip__swatch"
                            triggerStyle={{ background: stop.color }}
                          />
                        </div>
                        <button
                          type="button"
                          className="gradient-stop-chip__body"
                          onClick={() => selectStop(stop.id)}
                          aria-pressed={isActive}
                        >
                          <span className="gradient-stop-chip__label">
                            {formatStopPosition(stop.position)} from top
                          </span>
                          <span className="gradient-stop-chip__hex">{stop.color.toUpperCase()}</span>
                        </button>
                        {canDeleteStop ? (
                          <Tooltip label="Remove keyframe" withArrow position="left">
                            <button
                              type="button"
                              className="gradient-stop-chip__remove"
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteStopById(stop.id);
                              }}
                              aria-label={`Remove keyframe at ${formatStopPosition(stop.position)}`}
                            >
                              <IconTrash size={14} stroke={1.75} />
                            </button>
                          </Tooltip>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isGradient ? (
        <form
          className={`animation-ai-composer ${!canUseAi ? "animation-ai-composer--idle" : ""}`}
          onSubmit={submitAiPrompt}
        >
          <div className="animation-ai-composer__header">
            <span className="animation-ai-composer__badge" aria-hidden>
              <IconSparkles size={14} stroke={1.75} />
            </span>
            <div className="animation-ai-composer__heading">
              <Text fw={600} size="sm">
                AI gradient
              </Text>
              <Text size="xs" c="dimmed" lh={1.35}>
                {canUseAi
                  ? `Describe colors for the ${selected.length} selected LEDs — keyframes update on the track.`
                  : "Select 2 or more LEDs on the preview map, then describe the gradient you want."}
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
                canUseAi
                  ? "Sunset orange and purple, icy blue, 7 màu rainbow sặc sỡ…"
                  : "Select a region first…"
              }
              rows={2}
              disabled={aiLoading || !canUseAi}
              aria-label="Gradient color prompt"
            />
            <button
              type="submit"
              className="animation-ai-composer__send"
              disabled={aiLoading || !hasApiKey || !canUseAi}
              aria-label="Generate gradient from prompt"
              title={
                !canUseAi
                  ? "Select 2 or more LEDs first"
                  : hasApiKey
                    ? "Generate gradient (Enter)"
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
            {canUseAi ? (
              <button
                type="button"
                className="animation-ai-composer__chip"
                disabled={aiLoading || !hasApiKey}
                onClick={() => suggestGradientWithAi(AI_GRADIENT_MODES.BLEND)}
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
      ) : null}
    </section>
  );
}
