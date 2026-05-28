import { useCallback, useMemo, useRef, useState } from "react";
import { Badge } from "@mantine/core";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import {
  ensureLedColors,
  getLedMap,
  getSelectedLeds,
  getZones,
  getZoneColor,
  isLedActive,
} from "../lib/ledLayout";
import { isLightHex } from "../lib/colorUtils";

const DRAG_THRESHOLD = 5;
const DOT_HIT_RADIUS = 14;

function normalizeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}

function intersectsRect(pointX, pointY, radius, rect) {
  return (
    pointX + radius >= rect.x &&
    pointX - radius <= rect.x + rect.w &&
    pointY + radius >= rect.y &&
    pointY - radius <= rect.y + rect.h
  );
}

export function PreviewLedPicker({
  settings,
  ledCount,
  deviceModel,
  onSelectLed,
  onSelectLeds,
  onClearSelection,
  connected,
  livePreview,
  ledOn = true,
  ledColorsOverride,
  readOnly = false,
}) {
  const zoneRotation = settings.zoneRotation ?? 0;
  const ledMap = getLedMap(deviceModel, ledCount, zoneRotation, settings);
  const zones = useMemo(
    () => getZones(deviceModel, ledCount, zoneRotation, settings),
    [deviceModel, ledCount, zoneRotation, settings]
  );
  const indexZoneMap = useMemo(() => {
    const map = new Map();
    for (const zone of zones) {
      for (const index of zone.indices) {
        map.set(index, zone.id);
      }
    }
    return map;
  }, [zones]);
  const ledColors =
    Array.isArray(ledColorsOverride) && ledColorsOverride.length === ledCount
      ? ledColorsOverride
      : ensureLedColors(settings, ledCount);
  const selectedLeds = getSelectedLeds(settings, ledCount);
  const hasSelection = selectedLeds.length > 0;
  const isMultiSelection = selectedLeds.length > 1;
  const primaryIndex = hasSelection ? selectedLeds[0] : null;
  const primaryHex = hasSelection ? ledColors[primaryIndex] || settings.hex : settings.hex;
  const selectionRange =
    isMultiSelection && selectedLeds.length > 1
      ? `${selectedLeds[0] + 1}–${selectedLeds[selectedLeds.length - 1] + 1}`
      : null;
  const mapWrapRef = useRef(null);
  const dragStartRef = useRef(null);
  const didDragRef = useRef(false);
  const [marquee, setMarquee] = useState(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const getMonitorElement = () =>
    mapWrapRef.current?.querySelector(".preview-led-picker__monitor");

  const getMonitorMetrics = useCallback(() => {
    const monitor = getMonitorElement();
    const wrap = mapWrapRef.current;
    if (!monitor || !wrap || !ledMap) {
      return null;
    }

    const monitorRect = monitor.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    return {
      monitorRect,
      offsetX: monitorRect.left - wrapRect.left,
      offsetY: monitorRect.top - wrapRect.top,
      width: monitorRect.width,
      height: monitorRect.height,
    };
  }, [ledMap]);

  const indicesInMarquee = useCallback(
    (rect) => {
      if (ledMap) {
        const metrics = getMonitorMetrics();
        if (!metrics) {
          return [];
        }

        const localRect = {
          x: rect.x - metrics.offsetX,
          y: rect.y - metrics.offsetY,
          w: rect.w,
          h: rect.h,
        };

        const indices = [];
        ledMap.points.forEach(([x, y], index) => {
          const dotX = (x / (ledMap.width - 1)) * metrics.width;
          const dotY = (y / (ledMap.height - 1)) * metrics.height;
          if (intersectsRect(dotX, dotY, DOT_HIT_RADIUS, localRect)) {
            indices.push(index);
          }
        });
        return indices;
      }

      const wrap = mapWrapRef.current;
      const strip = wrap?.querySelector(".preview-led-picker__strip");
      if (!wrap || !strip) {
        return [];
      }

      const wrapRect = wrap.getBoundingClientRect();
      const localRect = {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      };

      const indices = [];
      strip.querySelectorAll(".preview-led-picker__cell").forEach((cell, index) => {
        const cellRect = cell.getBoundingClientRect();
        const centerX = cellRect.left - wrapRect.left + cellRect.width / 2;
        const centerY = cellRect.top - wrapRect.top + cellRect.height / 2;
        const radius = Math.min(cellRect.width, cellRect.height) / 2;
        if (intersectsRect(centerX, centerY, radius, localRect)) {
          indices.push(index);
        }
      });
      return indices;
    },
    [getMonitorMetrics, ledMap]
  );

  const hitTestLed = useCallback(
    (clientX, clientY) => {
      if (ledMap) {
        const metrics = getMonitorMetrics();
        if (!metrics) {
          return null;
        }

        const x = clientX - metrics.monitorRect.left;
        const y = clientY - metrics.monitorRect.top;
        let closest = null;
        let closestDist = DOT_HIT_RADIUS;

        ledMap.points.forEach(([px, py], index) => {
          const dotX = (px / (ledMap.width - 1)) * metrics.width;
          const dotY = (py / (ledMap.height - 1)) * metrics.height;
          const dist = Math.hypot(x - dotX, y - dotY);
          if (dist <= closestDist) {
            closestDist = dist;
            closest = index;
          }
        });

        return closest;
      }

      const wrap = mapWrapRef.current;
      const strip = wrap?.querySelector(".preview-led-picker__strip");
      if (!wrap || !strip) {
        return null;
      }

      const cells = strip.querySelectorAll(".preview-led-picker__cell");
      for (let index = 0; index < cells.length; index += 1) {
        const cellRect = cells[index].getBoundingClientRect();
        if (
          clientX >= cellRect.left &&
          clientX <= cellRect.right &&
          clientY >= cellRect.top &&
          clientY <= cellRect.bottom
        ) {
          return index;
        }
      }

      return null;
    },
    [getMonitorMetrics, ledMap]
  );

  const finishPointer = useCallback(
    (clientX, clientY) => {
      if (!dragStartRef.current) {
        return;
      }

      const wrap = mapWrapRef.current;

      if (didDragRef.current && marquee && marquee.w >= DRAG_THRESHOLD && marquee.h >= DRAG_THRESHOLD) {
        const indices = indicesInMarquee(marquee);
        if (indices.length > 0) {
          onSelectLeds?.(indices);
        }
      } else if (!didDragRef.current) {
        const index = hitTestLed(clientX, clientY);
        if (index !== null) {
          onSelectLed?.(index);
        } else if (hasSelection) {
          onClearSelection?.();
        }
      }

      dragStartRef.current = null;
      didDragRef.current = false;
      setMarquee(null);
      setHoverIndex(null);
      wrap?.classList.remove("preview-led-picker__map-wrap--dragging");
    },
    [hasSelection, hitTestLed, indicesInMarquee, marquee, onClearSelection, onSelectLed, onSelectLeds]
  );

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    const wrap = mapWrapRef.current;
    if (!wrap) {
      return;
    }

    const bounds = wrap.getBoundingClientRect();
    dragStartRef.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    didDragRef.current = false;
    setMarquee(null);
    wrap.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragStartRef.current) {
      setHoverIndex(hitTestLed(event.clientX, event.clientY));
      return;
    }

    const wrap = mapWrapRef.current;
    if (!wrap) {
      return;
    }

    const bounds = wrap.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const dx = Math.abs(event.clientX - dragStartRef.current.clientX);
    const dy = Math.abs(event.clientY - dragStartRef.current.clientY);

    if (!didDragRef.current && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
      didDragRef.current = true;
      wrap.classList.add("preview-led-picker__map-wrap--dragging");
    }

    if (didDragRef.current) {
      setMarquee(
        normalizeRect(
          { x: dragStartRef.current.x, y: dragStartRef.current.y },
          { x, y }
        )
      );
    }
  };

  const handlePointerUp = (event) => {
    finishPointer(event.clientX, event.clientY);
    mapWrapRef.current?.releasePointerCapture(event.pointerId);
  };

  const handlePointerCancel = (event) => {
    finishPointer(event.clientX, event.clientY);
  };

  const selectAdjacentLed = (delta) => {
    if (!hasSelection || primaryIndex == null) return;
    const nextIndex = Math.max(0, Math.min(ledCount - 1, primaryIndex + delta));
    if (nextIndex !== primaryIndex) {
      onSelectLed?.(nextIndex);
    }
  };

  const clearMultiSelection = () => {
    if (primaryIndex == null) return;
    onSelectLed?.(primaryIndex);
  };

  const marqueePreviewCount = useMemo(() => {
    if (!marquee || marquee.w < DRAG_THRESHOLD || marquee.h < DRAG_THRESHOLD) {
      return 0;
    }
    return indicesInMarquee(marquee).length;
  }, [indicesInMarquee, marquee]);

  const marqueePreviewIndices = useMemo(() => {
    if (!marquee || marquee.w < DRAG_THRESHOLD || marquee.h < DRAG_THRESHOLD) {
      return null;
    }
    return new Set(indicesInMarquee(marquee));
  }, [indicesInMarquee, marquee]);

  return (
    <div className={`preview-led-picker ${readOnly ? "preview-led-picker--readonly" : ""}`}>
      {!readOnly && (
      <div className="preview-led-picker__selection" aria-live="polite">
        {!hasSelection ? (
          <>
            <div
              className="preview-led-picker__swatch preview-led-picker__swatch--empty"
              aria-hidden
            />
            <div className="preview-led-picker__selection-text">
              <span className="preview-led-picker__meta preview-led-picker__meta--empty">
                Click a LED or drag to select
              </span>
            </div>
          </>
        ) : (
          <>
        {!isMultiSelection && (
          <button
            type="button"
            className="preview-led-picker__nav"
            onClick={() => selectAdjacentLed(-1)}
            disabled={primaryIndex <= 0}
            aria-label="Previous LED"
          >
            <IconChevronLeft size={14} stroke={2} />
          </button>
        )}

        <div
          className="preview-led-picker__swatch"
          style={{ background: primaryHex, "--selection-color": primaryHex }}
          title={primaryHex}
          aria-hidden
        />

        <div className="preview-led-picker__selection-text">
          {isMultiSelection ? (
            <>
              <span className="preview-led-picker__value">{selectedLeds.length}</span>
              <span className="preview-led-picker__meta">
                LEDs{selectionRange ? ` · ${selectionRange}` : ""}
              </span>
            </>
          ) : (
            <>
              <span className="preview-led-picker__value">{primaryIndex + 1}</span>
              <span className="preview-led-picker__meta">/ {ledCount}</span>
            </>
          )}
        </div>

        {isMultiSelection ? (
          <button
            type="button"
            className="preview-led-picker__nav preview-led-picker__nav--clear"
            onClick={clearMultiSelection}
            aria-label="Select single LED"
            title="Select single LED"
          >
            <IconX size={13} stroke={2} />
          </button>
        ) : (
          <button
            type="button"
            className="preview-led-picker__nav"
            onClick={() => selectAdjacentLed(1)}
            disabled={primaryIndex >= ledCount - 1}
            aria-label="Next LED"
          >
            <IconChevronRight size={14} stroke={2} />
          </button>
        )}
          </>
        )}
      </div>
      )}

      <div
        ref={mapWrapRef}
        className={`preview-led-picker__map-wrap ${!readOnly && hasSelection ? "preview-led-picker__map-wrap--has-selection" : ""}`}
        onPointerDown={readOnly ? undefined : handlePointerDown}
        onPointerMove={readOnly ? undefined : handlePointerMove}
        onPointerUp={readOnly ? undefined : handlePointerUp}
        onPointerCancel={readOnly ? undefined : handlePointerCancel}
        onPointerLeave={readOnly ? undefined : () => setHoverIndex(null)}
      >
        {marquee && (
          <div
            className="preview-led-picker__marquee"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
            }}
            aria-hidden
          >
            {marqueePreviewCount > 0 && (
              <span className="preview-led-picker__marquee-count">{marqueePreviewCount}</span>
            )}
          </div>
        )}

        {ledMap ? (
          <div
            className="preview-led-picker__monitor-frame"
          >
            <div
              className="preview-led-picker__monitor"
              style={{
                aspectRatio: `${ledMap.width} / ${ledMap.height}`,
                "--map-w": ledMap.width,
                "--map-h": ledMap.height,
              }}
            >
              <div className="preview-led-picker__screen" aria-hidden />
              {ledMap.points.map(([x, y], index) => {
                const hex = ledColors[index] || settings.hex;
                const zoneId = indexZoneMap.get(index);
                const zoneColor = zoneId ? getZoneColor(zoneId) : null;
                const selected = isLedActive(index, settings, ledCount);
                const isPrimary = hasSelection && index === primaryIndex;
                const light = isLightHex(hex);
                const hovered = hoverIndex === index;
                const marqueePreview = marqueePreviewIndices?.has(index);
                return (
                  <span
                    key={index}
                    className={[
                      "preview-led-picker__dot",
                      zoneId ? "preview-led-picker__dot--zoned" : "",
                      light ? "preview-led-picker__dot--light" : "",
                      hovered ? "preview-led-picker__dot--hover" : "",
                      marqueePreview ? "preview-led-picker__dot--marquee" : "",
                      selected ? "preview-led-picker__dot--selected" : "",
                      isPrimary ? "preview-led-picker__dot--primary" : "",
                      index === 0 ? "preview-led-picker__dot--origin" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: `${(x / (ledMap.width - 1)) * 100}%`,
                      top: `${(y / (ledMap.height - 1)) * 100}%`,
                      background: hex,
                      "--dot-color": hex,
                      "--zone-color": zoneColor || hex,
                    }}
                    title={
                      index === 0
                        ? `LED 1 (index 0) · ${zoneId || "strip"}`
                        : `LED ${index + 1} · ${zoneId || "strip"}`
                    }
                    aria-label={`LED ${index + 1}`}
                    aria-pressed={selected}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="preview-led-picker__strip" role="list" aria-label="LED strip">
            {ledColors.map((hex, index) => {
              const selected = isLedActive(index, settings, ledCount);
              const isPrimary = hasSelection && index === primaryIndex;
              const light = isLightHex(hex);
              const hovered = hoverIndex === index;
              const marqueePreview = marqueePreviewIndices?.has(index);
              return (
                <span
                  key={index}
                  className={[
                    "preview-led-picker__cell",
                    light ? "preview-led-picker__cell--light" : "",
                    hovered ? "preview-led-picker__cell--hover" : "",
                    marqueePreview ? "preview-led-picker__cell--marquee" : "",
                    selected ? "preview-led-picker__cell--selected" : "",
                    isPrimary ? "preview-led-picker__cell--primary" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ background: hex, "--cell-color": hex }}
                  title={`LED ${index + 1}`}
                  aria-label={`LED ${index + 1}`}
                  aria-pressed={selected}
                />
              );
            })}
          </div>
        )}
        {livePreview && connected && ledOn && (
          <Badge color="teal" variant="light" className="preview-live-badge preview-live-badge--compact preview-live-badge--map">
            Live
          </Badge>
        )}

        {connected && !ledOn && (
          <Badge color="gray" variant="filled" className="preview-live-badge preview-live-badge--compact preview-live-badge--map">
            Off
          </Badge>
        )}
      </div>
    </div>
  );
}
