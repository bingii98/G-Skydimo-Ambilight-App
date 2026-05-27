import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, Tooltip } from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  buildAnimationColorPatch,
  clampAnimationStopPosition,
  insertAnimationColorStop,
  removeAnimationColorStop,
  resolveAnimationColorStops,
  sampleAnimationColor,
  updateAnimationStopColor,
  updateAnimationStopPosition,
  ANIMATION_STOP_MIN_GAP,
} from "../lib/animationColors";
import { buildGradientTrackBackground } from "../lib/gradientStops";
import { ensureHex, normalizeHex } from "../lib/colorUtils";
import { ColorPickerPopover } from "./ColorPickerPopup";

const DRAG_THRESHOLD_PX = 4;

function sortedStops(stops) {
  return [...stops].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

function formatStopPosition(position) {
  return `${Math.round(position * 100)}%`;
}

function stopEdgeFlags(stops, stopId) {
  const ordered = sortedStops(stops);
  const index = ordered.findIndex((stop) => stop.id === stopId);
  return {
    index,
    isFirst: index === 0,
    isLast: index === ordered.length - 1,
  };
}

function findAddedStop(prevStops, nextStops) {
  return nextStops.find((stop) => !prevStops.some((existing) => existing.id === stop.id));
}

function findLargestGapInsertAt(stops) {
  let bestGap = 0;
  let insertAt = 0.5;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const gap = stops[index + 1].position - stops[index].position;
    if (gap > bestGap) {
      bestGap = gap;
      insertAt = stops[index].position + gap / 2;
    }
  }
  return insertAt;
}

function positionFromPointer(track, clientY, stopId, stops) {
  const rect = track.getBoundingClientRect();
  const raw = (clientY - rect.top) / rect.height;
  if (!stopId) {
    return Math.max(ANIMATION_STOP_MIN_GAP, Math.min(1 - ANIMATION_STOP_MIN_GAP, raw));
  }
  return clampAnimationStopPosition(stops, stopId, raw);
}

function AnimationColorRow({ label, hex, onChange, ariaLabel, compact = false }) {
  const hexUpper = ensureHex(hex).toUpperCase();
  return (
    <div className={`animation-base-color ${compact ? "animation-base-color--compact" : ""}`}>
      <ColorPickerPopover
        hex={hex}
        onChange={onChange}
        ariaLabel={ariaLabel}
        triggerClassName={`animation-base-color__swatch ${compact ? "animation-base-color__swatch--compact" : ""}`}
        triggerStyle={{ background: hex, "--swatch-color": hex }}
      />
      <div className="animation-base-color__meta">
        <Text fw={600} size={compact ? "xs" : "sm"}>
          {label}
        </Text>
        <Text ff="monospace" size="xs" fw={600} c="dimmed">
          {hexUpper}
        </Text>
      </div>
    </div>
  );
}

export function AnimationColorControls({ settings, onChange, compactHint }) {
  const stops = resolveAnimationColorStops(settings, settings.hex);
  const activeStopId = settings.animationActiveColorStopId || stops[0]?.id;
  const canRemoveStop = stops.length > 2;
  const trackRef = useRef(null);
  const dragStopRef = useRef(null);
  const dragStartRef = useRef(null);
  const dragPreviewRef = useRef(null);
  const didDragRef = useRef(false);
  const stopsRef = useRef(stops);
  const applyStopsRef = useRef(null);
  const settingsRef = useRef(settings);
  const activeStopIdRef = useRef(activeStopId);
  const [draggingId, setDraggingId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  useEffect(() => {
    settingsRef.current = settings;
    activeStopIdRef.current = activeStopId;
  }, [settings, activeStopId]);

  useEffect(() => {
    dragPreviewRef.current = dragPreview;
  }, [dragPreview]);

  const applyStops = useCallback((nextStops, nextActiveId = activeStopIdRef.current) => {
    onChange(
      buildAnimationColorPatch(settingsRef.current, {
        animationColorStops: nextStops,
        animationActiveColorStopId: nextActiveId,
      })
    );
  }, [onChange]);

  useEffect(() => {
    applyStopsRef.current = applyStops;
  }, [applyStops]);

  const selectStop = useCallback((stopId) => {
    const stop = stopsRef.current.find((item) => item.id === stopId);
    if (!stop) return;
    onChange(
      buildAnimationColorPatch(settingsRef.current, {
        animationActiveColorStopId: stopId,
      })
    );
  }, [onChange]);

  const applyStopColor = (stopId, hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    const nextStops = updateAnimationStopColor(stopsRef.current, stopId, normalized);
    applyStops(nextStops, stopId);
  };

  const addStop = () => {
    const currentStops = stopsRef.current;
    const insertAt = findLargestGapInsertAt(currentStops);
    const nextStops = insertAnimationColorStop(
      currentStops,
      insertAt,
      sampleAnimationColor(currentStops, insertAt)
    );
    const added = findAddedStop(currentStops, nextStops);
    applyStops(nextStops, added?.id || activeStopIdRef.current);
  };

  const deleteStopById = (stopId) => {
    if (!canRemoveStop) return;
    const currentStops = stopsRef.current;
    const nextStops = removeAnimationColorStop(currentStops, stopId);
    if (nextStops.length === currentStops.length) return;
    const nextActiveId = nextStops.some((stop) => stop.id === activeStopIdRef.current)
      ? activeStopIdRef.current
      : nextStops[0]?.id;
    applyStops(nextStops, nextActiveId);
  };

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

    const position = positionFromPointer(track, clientY, stopId, stopsRef.current);
    const next = { stopId, position };
    dragPreviewRef.current = next;
    setDragPreview(next);
  }, []);

  const commitDrag = useCallback(() => {
    const stopId = dragStopRef.current;
    const preview = dragPreviewRef.current;

    if (stopId && didDragRef.current && preview?.stopId === stopId) {
      const nextStops = updateAnimationStopPosition(
        stopsRef.current,
        stopId,
        preview.position
      );
      applyStopsRef.current?.(nextStops, stopId);
    } else if (stopId) {
      selectStop(stopId);
    }

    finishDrag();
  }, [finishDrag, selectStop]);

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

  const handleTrackPointerDown = (event) => {
    if (event.button !== 0 || dragStopRef.current) return;
    if (event.target.closest(".gradient-editor__handle")) return;

    const track = trackRef.current;
    if (!track) return;

    const currentStops = stopsRef.current;
    const position = positionFromPointer(track, event.clientY, null, currentStops);
    const nextStops = insertAnimationColorStop(
      currentStops,
      position,
      sampleAnimationColor(currentStops, position)
    );
    const added = findAddedStop(currentStops, nextStops);
    applyStops(nextStops, added?.id || activeStopIdRef.current);
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

  const visualStops = useMemo(() => {
    if (draggingId && dragPreview) {
      return updateAnimationStopPosition(stops, dragPreview.stopId, dragPreview.position);
    }
    return stops;
  }, [stops, draggingId, dragPreview]);

  const orderedStops = sortedStops(visualStops);
  const activeStop = orderedStops.find((stop) => stop.id === activeStopId) || orderedStops[0];

  return (
    <div className="animation-palette animation-palette--vertical">
      <div className="animation-palette__header">
        <div>
          <Text fw={600} size="sm">
            Palette
          </Text>
          <Text size="xs" c="dimmed" lh={1.35}>
            {compactHint || "Drag top/bottom or middle stops, click track to add"}
          </Text>
        </div>
        <button type="button" className="animation-palette__add-btn" onClick={addStop}>
          <IconPlus size={14} stroke={1.75} aria-hidden />
          <span>Add</span>
        </button>
      </div>

      <div className="animation-palette__workspace">
        <div className="animation-palette__rail">
          <div
            ref={trackRef}
            className={`gradient-editor__track gradient-editor__track--vertical animation-palette__track ${draggingId ? "gradient-editor__track--dragging" : ""}`}
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
            onPointerCancel={handleTrackPointerUp}
            role="presentation"
          >
            <div
              className="gradient-editor__track-fill"
              style={{ background: buildGradientTrackBackground(visualStops, "180deg") }}
              aria-hidden
            />
            <div className="gradient-editor__track-shine" aria-hidden />
            {orderedStops.map((stop) => {
              const isActive = stop.id === activeStopId;
              const isDragging = stop.id === draggingId;
              const { isFirst, isLast } = stopEdgeFlags(stops, stop.id);
              return (
                <span
                  key={stop.id}
                  role="button"
                  tabIndex={0}
                  className={[
                    "gradient-editor__handle",
                    "animation-palette__handle",
                    isActive ? "gradient-editor__handle--active" : "",
                    isDragging ? "gradient-editor__handle--dragging" : "",
                    isFirst || isLast ? "gradient-editor__handle--edge" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ top: `${stop.position * 100}%` }}
                  onPointerDown={(event) => beginStopDrag(event, stop.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectStop(stop.id);
                    }
                  }}
                  aria-label={`Palette color at ${formatStopPosition(stop.position)} from top`}
                  aria-pressed={isActive}
                >
                  <span className="gradient-editor__handle-color" style={{ background: stop.color }} />
                  {isDragging ? (
                    <span className="gradient-editor__handle-badge">
                      {formatStopPosition(stop.position)}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>

        <div className="animation-palette__side">
          <div className="animation-palette__stops" role="list" aria-label="Animation palette colors">
            {orderedStops.map((stop) => {
              const isActive = stop.id === activeStopId;
              const { isFirst, isLast } = stopEdgeFlags(stops, stop.id);
              const edgeLabel = isFirst ? "Top" : isLast ? "Bottom" : null;
              return (
                <div
                  key={stop.id}
                  role="listitem"
                  className={`gradient-stop-chip animation-palette__chip ${isActive ? "gradient-stop-chip--active" : ""} ${canRemoveStop ? "gradient-stop-chip--has-remove" : ""}`}
                >
                  <div className="gradient-stop-chip__swatch-wrap">
                    <ColorPickerPopover
                      hex={stop.color}
                      onChange={(hex) => applyStopColor(stop.id, hex)}
                      onOpen={() => selectStop(stop.id)}
                      ariaLabel={`Edit ${edgeLabel || "palette"} color`}
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
                      {edgeLabel ? `${edgeLabel} · ${formatStopPosition(stop.position)}` : `${formatStopPosition(stop.position)} from top`}
                    </span>
                    <span className="gradient-stop-chip__hex">{stop.color.toUpperCase()}</span>
                  </button>
                  {canRemoveStop ? (
                    <Tooltip label="Remove color" withArrow position="left">
                      <button
                        type="button"
                        className="gradient-stop-chip__remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteStopById(stop.id);
                        }}
                        aria-label={`Remove color at ${formatStopPosition(stop.position)}`}
                      >
                        <IconTrash size={14} stroke={1.75} />
                      </button>
                    </Tooltip>
                  ) : null}
                </div>
              );
            })}
          </div>

          {activeStop ? (
            <div className="animation-palette__active">
              <ColorPickerPopover
                hex={activeStop.color}
                onChange={(hex) => applyStopColor(activeStop.id, hex)}
                ariaLabel={`Edit active palette color at ${formatStopPosition(activeStop.position)} from top`}
                triggerClassName="animation-palette__active-swatch"
                triggerStyle={{ background: activeStop.color }}
              />
              <div className="animation-palette__active-meta">
                <Text fw={600} size="xs">
                  Active · {formatStopPosition(activeStop.position)} from top
                </Text>
                <Text ff="monospace" size="xs" c="dimmed">
                  {activeStop.color.toUpperCase()}
                </Text>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AnimationSingleColorControl({ settings, onChange, label = "Color" }) {
  const handleChange = (hex) => {
    onChange(
      buildAnimationColorPatch(settings, {
        animationColorStops: [
          { id: "anim-single", position: 0, color: hex },
          { id: "anim-single-end", position: 1, color: hex },
        ],
        animationActiveColorStopId: "anim-single",
      })
    );
  };

  return (
    <AnimationColorRow
      label={label}
      hex={settings.hex}
      onChange={handleChange}
      ariaLabel={`Animation ${label}`}
      compact
    />
  );
}
