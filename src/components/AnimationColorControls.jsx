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

const NEW_STOP_ANIM_MS = 350;
const DRAG_THRESHOLD_PX = 4;
const TRACK_GRADIENT_DIRECTION = "90deg";

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
    isEdge: index === 0 || index === ordered.length - 1,
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

function getTrackHandleInsetPx(track) {
  if (!track) return 11;
  const handleSize = Number.parseFloat(
    getComputedStyle(track).getPropertyValue("--animation-palette-handle-size")
  );
  return Number.isFinite(handleSize) && handleSize > 0 ? handleSize / 2 : 11;
}

function positionFromPointer(track, clientX, stopId, stops) {
  const rect = track.getBoundingClientRect();
  const inset = getTrackHandleInsetPx(track);
  const travelWidth = Math.max(rect.width - inset * 2, 1);
  const raw = (clientX - rect.left - inset) / travelWidth;

  if (!stopId) {
    return Math.max(ANIMATION_STOP_MIN_GAP, Math.min(1 - ANIMATION_STOP_MIN_GAP, raw));
  }
  return clampAnimationStopPosition(stops, stopId, raw);
}

export function AnimationColorControls({ settings, onChange }) {
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
  const [newStopIds, setNewStopIds] = useState([]);

  const markStopNew = useCallback((stopId) => {
    if (!stopId) return;
    setNewStopIds((ids) => (ids.includes(stopId) ? ids : [...ids, stopId]));
    window.setTimeout(() => {
      setNewStopIds((ids) => ids.filter((id) => id !== stopId));
    }, NEW_STOP_ANIM_MS);
  }, []);

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
    markStopNew(added?.id);
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

  const updateDragPreview = useCallback((clientX) => {
    const stopId = dragStopRef.current;
    const track = trackRef.current;
    if (!stopId || !track) return;

    const position = positionFromPointer(track, clientX, stopId, stopsRef.current);
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

      const dx = Math.abs(event.clientX - dragStartRef.current.x);
      if (!didDragRef.current && dx > DRAG_THRESHOLD_PX) {
        didDragRef.current = true;
      }

      if (!didDragRef.current) return;

      dragStartRef.current.lastX = event.clientX;
      updateDragPreview(event.clientX);
    },
    [updateDragPreview]
  );

  const handleTrackPointerUp = useCallback(
    (event) => {
      if (!dragStopRef.current) return;
      if (didDragRef.current) {
        dragStartRef.current.lastX = event.clientX;
        updateDragPreview(event.clientX);
      }
      trackRef.current?.releasePointerCapture(event.pointerId);
      commitDrag();
    },
    [commitDrag, updateDragPreview]
  );

  const handleTrackPointerDown = (event) => {
    if (event.button !== 0 || dragStopRef.current) return;
    if (event.target.closest(".animation-palette-editor__handle")) return;

    const track = trackRef.current;
    if (!track) return;

    const currentStops = stopsRef.current;
    const position = positionFromPointer(track, event.clientX, null, currentStops);
    const nextStops = insertAnimationColorStop(
      currentStops,
      position,
      sampleAnimationColor(currentStops, position)
    );
    const added = findAddedStop(currentStops, nextStops);
    markStopNew(added?.id);
    applyStops(nextStops, added?.id || activeStopIdRef.current);
  };

  const beginStopDrag = (event, stopId) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    dragStopRef.current = stopId;
    dragStartRef.current = { x: event.clientX, lastX: event.clientX };
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
  const activeStop =
    orderedStops.find((stop) => stop.id === activeStopId) || orderedStops[0] || null;

  return (
    <div className="animation-palette-editor">
      <div className="animation-palette-editor__header">
        <Text size="xs" c="dimmed" className="animation-palette-editor__hint">
          Tap the bar to add · drag handles to blend
        </Text>
        <div className="animation-palette-editor__header-actions">
          <span className="animation-palette-editor__count">
            {stops.length} color{stops.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="gradient-editor__tool-btn"
            onClick={addStop}
            aria-label="Add color in largest gap"
          >
            <IconPlus size={15} stroke={1.75} aria-hidden />
            <span>Add</span>
          </button>
        </div>
      </div>

      <div className="animation-palette-editor__track-wrap">
        <div
          ref={trackRef}
          className={`animation-palette-editor__track ${draggingId ? "animation-palette-editor__track--dragging" : ""}`}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerUp={handleTrackPointerUp}
          onPointerCancel={handleTrackPointerUp}
          role="presentation"
        >
          <div
            className="animation-palette-editor__track-fill"
            style={{ background: buildGradientTrackBackground(visualStops, TRACK_GRADIENT_DIRECTION) }}
            aria-hidden
          />
          <div className="animation-palette-editor__track-shine" aria-hidden />
          {orderedStops.map((stop) => {
            const isActive = stop.id === activeStopId;
            const isDragging = stop.id === draggingId;
            const { isEdge } = stopEdgeFlags(stops, stop.id);

            return (
              <button
                key={stop.id}
                type="button"
                className={`animation-palette-editor__handle ${isActive ? "animation-palette-editor__handle--active" : ""} ${isDragging ? "animation-palette-editor__handle--dragging" : ""} ${isEdge ? "animation-palette-editor__handle--edge" : ""} ${newStopIds.includes(stop.id) ? "animation-palette-editor__handle--new" : ""}`}
                style={{ "--stop-position": stop.position }}
                onPointerDown={(event) => beginStopDrag(event, stop.id)}
                aria-label={`Palette color at ${formatStopPosition(stop.position)}`}
                aria-pressed={isActive}
              >
                <span
                  className="animation-palette-editor__handle-color"
                  style={{ background: stop.color }}
                />
                {isDragging ? (
                  <span className="animation-palette-editor__handle-badge">
                    {formatStopPosition(stop.position)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="animation-palette-editor__scale" aria-hidden>
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {activeStop ? (
        <div className="animation-palette-editor__inspector">
          <div className="animation-palette-editor__inspector-swatch">
            <ColorPickerPopover
              hex={activeStop.color}
              onChange={(hex) => applyStopColor(activeStop.id, hex)}
              onOpen={() => selectStop(activeStop.id)}
              ariaLabel={`Edit color at ${formatStopPosition(activeStop.position)}`}
              triggerClassName="animation-palette-editor__inspector-picker"
              triggerStyle={{ background: activeStop.color }}
            />
          </div>
          <div className="animation-palette-editor__inspector-body">
            <Text size="xs" fw={600} className="animation-palette-editor__inspector-label">
              Selected · {formatStopPosition(activeStop.position)}
            </Text>
            <Text ff="monospace" size="xs" fw={600} className="animation-palette-editor__inspector-hex">
              {activeStop.color.toUpperCase()}
            </Text>
          </div>
          {canRemoveStop ? (
            <Tooltip label="Remove color" withArrow position="top">
              <button
                type="button"
                className="animation-palette-editor__inspector-remove"
                onClick={() => deleteStopById(activeStop.id)}
                aria-label={`Remove color at ${formatStopPosition(activeStop.position)}`}
              >
                <IconTrash size={15} stroke={1.75} />
              </button>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <div className="animation-palette-editor__dots" role="list" aria-label="Palette colors">
        {orderedStops.map((stop) => {
          const isActive = stop.id === activeStopId;
          return (
            <button
              key={stop.id}
              type="button"
              role="listitem"
              className={`animation-palette-editor__dot ${isActive ? "animation-palette-editor__dot--active" : ""}`}
              style={{ "--dot-color": stop.color }}
              onClick={() => selectStop(stop.id)}
              aria-label={`Select ${formatStopPosition(stop.position)} · ${stop.color.toUpperCase()}`}
              aria-pressed={isActive}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AnimationSingleColorControl({ settings, onChange, label = "Color" }) {
  const handleChange = (hex) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    onChange(
      buildAnimationColorPatch(settings, {
        animationColorStops: [
          { id: "anim-single", position: 0, color: normalized },
          { id: "anim-single-end", position: 1, color: normalized },
        ],
        animationActiveColorStopId: "anim-single",
      })
    );
  };

  const hexUpper = ensureHex(settings.hex).toUpperCase();

  return (
    <div className="gradient-controls__solid">
      <ColorPickerPopover
        hex={settings.hex}
        onChange={handleChange}
        ariaLabel={`Animation ${label}`}
        triggerClassName="gradient-controls__solid-swatch"
        triggerStyle={{ background: settings.hex, "--swatch-color": settings.hex }}
      />
      <div className="gradient-controls__solid-body">
        <Text fw={600} size="sm">
          {label}
        </Text>
        <Text ff="monospace" size="xs" fw={600} className="gradient-controls__solid-hex">
          {hexUpper}
        </Text>
        <Text size="xs" c="dimmed" lh={1.45}>
          Single color for this effect. Click the swatch to edit.
        </Text>
      </div>
    </div>
  );
}
