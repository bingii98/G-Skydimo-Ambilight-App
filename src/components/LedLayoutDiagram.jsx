import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getZoneColor, ZONE_DIAGRAM_COLORS } from "../lib/ledLayout";
import { scaledRgb } from "../lib/colorUtils";
import {
  getDiagramLayout,
  getLongEdgeLedCount,
  getShortEdgeLedCount,
  inferZoneRotation,
  resolveStripLayout,
} from "../lib/zoneLayout";

const ZONE_ORDER = ["top", "right", "bottom", "left"];

const ZONE_LABELS = {
  top: "Top",
  right: "Right",
  bottom: "Bottom",
  left: "Left",
};

const DRAG_THRESHOLD = 8;
const SWAP_FLASH_MS = 520;

function rotationShiftSteps(fromZone, toZone) {
  const from = ZONE_ORDER.indexOf(fromZone);
  const to = ZONE_ORDER.indexOf(toZone);
  if (from < 0 || to < 0) return 0;
  return (to - from + 4) % 4;
}

function resolveDropTarget(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  const edge = element?.closest("[data-zone-id]");
  return edge?.getAttribute("data-zone-id") || null;
}

export function LedLayoutDiagram({
  settings,
  ledCount,
  deviceModel,
  zoneRotation = 0,
  mode = "view",
  activeZone = null,
  hoverZone = null,
  onZonePick,
  onZonePreview,
  onZoneHover = null,
  onZoneDragSwap = null,
  highlightLedIndices = null,
  showCounts = true,
  showLegend = true,
  showIndexZero = true,
  showDots = true,
  litZone = null,
  liveColor = null,
  liveBrightness = 100,
  compact = false,
  pickPreviewRotation = null,
}) {
  const diagramRef = useRef(null);
  const [dragSource, setDragSource] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);
  const [swapFlash, setSwapFlash] = useState(null);
  const [dropRejected, setDropRejected] = useState(false);
  const pointerStateRef = useRef(null);
  const ghostFrameRef = useRef(null);

  const previewRotation = useMemo(() => {
    if (!dragSource || !dragTarget || dragSource === dragTarget) return null;
    return inferZoneRotation(dragSource, dragTarget);
  }, [dragSource, dragTarget]);

  const effectivePreviewRotation =
    previewRotation ??
    (mode === "pick" && typeof pickPreviewRotation === "number" ? pickPreviewRotation : null);

  const displayRotation = effectivePreviewRotation ?? zoneRotation;

  const diagram = useMemo(
    () => getDiagramLayout(settings, deviceModel, ledCount, displayRotation),
    [settings, deviceModel, ledCount, displayRotation]
  );

  const zones = diagram?.zones ?? [];
  const wireZones = diagram?.wireZones ?? [];
  const edgeStrips = diagram?.edgeStrips ?? [];
  const ledMap = diagram?.ledMap ?? null;

  const wireZonesById = useMemo(
    () => Object.fromEntries(wireZones.map((zone) => [zone.id, zone])),
    [wireZones]
  );

  const highlightLedSet = useMemo(() => {
    if (!highlightLedIndices?.length) return null;
    return new Set(highlightLedIndices);
  }, [highlightLedIndices]);

  /** True when highlighted indices belong to a physical wire edge (Test all), not a rotated diagram zone. */
  const highlightUsesWireLayout = useMemo(() => {
    if (!highlightLedSet || !litZone || !wireZonesById[litZone]?.indices?.length) {
      return false;
    }
    return wireZonesById[litZone].indices.some((index) => highlightLedSet.has(index));
  }, [highlightLedSet, litZone, wireZonesById]);

  /** During wire-index flash (Test all), place dots on physical edges, not rotated strips. */
  const displayStrips = useMemo(() => {
    if (!highlightUsesWireLayout || !wireZones.length) return edgeStrips;
    const dotFlowById = Object.fromEntries(edgeStrips.map((strip) => [strip.id, strip.dotFlow]));
    return wireZones
      .filter((zone) => zone.indices?.length)
      .map((zone) => ({
        id: zone.id,
        label: zone.label,
        indices: zone.indices,
        dotFlow: dotFlowById[zone.id] ?? "row",
      }));
  }, [highlightUsesWireLayout, wireZones, edgeStrips]);

  /** Strip ids whose indices overlap with the currently-highlighted LED indices. */
  const litStripIds = useMemo(() => {
    if (!highlightLedSet || !displayStrips.length) return null;
    const matches = new Set();
    for (const strip of displayStrips) {
      if (strip.indices.some((index) => highlightLedSet.has(index))) {
        matches.add(strip.id);
      }
    }
    return matches.size ? matches : null;
  }, [highlightLedSet, displayStrips]);

  const zonesById = useMemo(
    () => Object.fromEntries(zones.map((zone) => [zone.id, zone])),
    [zones]
  );

  const edgeLengthLabels = useMemo(() => {
    const layoutCounts =
      diagram?.layout?.counts ?? resolveStripLayout(settings, deviceModel, ledCount)?.counts;
    if (!layoutCounts) return null;
    const shortCount = getShortEdgeLedCount(layoutCounts);
    const longCount = getLongEdgeLedCount(layoutCounts);
    if (shortCount === longCount) return null;
    return { shortCount, longCount };
  }, [diagram?.layout?.counts, settings, deviceModel, ledCount]);

  const edgeLengthLabel = useCallback(
    (edgeCount) => {
      if (!edgeLengthLabels) return null;
      if (edgeCount <= edgeLengthLabels.shortCount) return "Short";
      if (edgeCount >= edgeLengthLabels.longCount) return "Long";
      return null;
    },
    [edgeLengthLabels]
  );

  const liveDotColor = useMemo(() => {
    if (!liveColor) return null;
    const { r, g, b } = scaledRgb(liveColor, liveBrightness);
    return `rgb(${r}, ${g}, ${b})`;
  }, [liveColor, liveBrightness]);

  const isLiveView = Boolean(liveDotColor);

  const pickable = mode === "pick" && typeof onZonePick === "function";
  const inspectable = mode === "inspect" && typeof onZonePreview === "function";
  const edgeInteractive = pickable || inspectable;
  const dragEnabled = inspectable && typeof onZoneDragSwap === "function";

  const handleEdgeClick = (zoneId) => {
    if (pickable) {
      onZonePick(zoneId);
      return;
    }
    if (inspectable) {
      onZonePreview(zoneId);
    }
  };

  const updateGhostPosition = useCallback((clientX, clientY) => {
    const root = diagramRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setGhostPos({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
  }, []);

  const resetDrag = useCallback(() => {
    pointerStateRef.current = null;
    if (ghostFrameRef.current) {
      cancelAnimationFrame(ghostFrameRef.current);
      ghostFrameRef.current = null;
    }
    setDragSource(null);
    setDragTarget(null);
    setGhostPos(null);
  }, []);

  const scheduleGhostUpdate = useCallback(
    (clientX, clientY) => {
      if (ghostFrameRef.current) return;
      ghostFrameRef.current = requestAnimationFrame(() => {
        ghostFrameRef.current = null;
        updateGhostPosition(clientX, clientY);
      });
    },
    [updateGhostPosition]
  );

  const syncDragPointer = useCallback(
    (clientX, clientY) => {
      scheduleGhostUpdate(clientX, clientY);
      setDragTarget(resolveDropTarget(clientX, clientY));
    },
    [scheduleGhostUpdate]
  );

  useEffect(() => {
    if (!dragSource) return undefined;

    const onWindowPointerMove = (event) => {
      const state = pointerStateRef.current;
      if (!state?.dragging) return;
      syncDragPointer(event.clientX, event.clientY);
    };

    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onWindowPointerMove);
  }, [dragSource, syncDragPointer]);

  const handlePointerDown = (event, zoneId) => {
    if (!edgeInteractive || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStateRef.current = {
      zoneId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  };

  const handlePointerMove = (event, zoneId) => {
    const state = pointerStateRef.current;
    if (!state || state.zoneId !== zoneId || state.pointerId !== event.pointerId) return;
    if (!dragEnabled) return;

    const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (!state.dragging && distance > DRAG_THRESHOLD) {
      state.dragging = true;
      setDragSource(zoneId);
      updateGhostPosition(event.clientX, event.clientY);
      setDragTarget(resolveDropTarget(event.clientX, event.clientY));
      return;
    }

    if (state.dragging) {
      syncDragPointer(event.clientX, event.clientY);
    }
  };

  const handlePointerUp = (event, zoneId) => {
    const state = pointerStateRef.current;
    if (!state || state.zoneId !== zoneId || state.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const wasDragging = state.dragging;
    const sourceZone = state.zoneId;
    resetDrag();

    if (wasDragging) {
      const targetZone = resolveDropTarget(event.clientX, event.clientY);
      if (targetZone && targetZone !== sourceZone && dragEnabled) {
        setSwapFlash({ from: sourceZone, to: targetZone });
        window.setTimeout(() => setSwapFlash(null), SWAP_FLASH_MS);
        onZoneDragSwap(sourceZone, targetZone);
      } else {
        setDropRejected(true);
        window.setTimeout(() => setDropRejected(false), 420);
      }
      return;
    }

    handleEdgeClick(zoneId);
  };

  const handlePointerCancel = () => {
    resetDrag();
  };

  const edgeClass = (zoneId) => {
    const parts = [
      "led-layout-diagram__edge",
      `led-layout-diagram__edge--${zoneId}`,
    ];
    if (activeZone === zoneId) parts.push("led-layout-diagram__edge--active");
    if (hoverZone === zoneId) parts.push("led-layout-diagram__edge--hover");
    if (edgeInteractive) parts.push("led-layout-diagram__edge--interactive");
    if (dragEnabled) parts.push("led-layout-diagram__edge--draggable");
    if (dragSource === zoneId) parts.push("led-layout-diagram__edge--dragging");
    if (dragSource && dragSource !== zoneId) {
      parts.push("led-layout-diagram__edge--drag-idle");
    }
    if (dragTarget === zoneId && dragSource && dragSource !== zoneId) {
      parts.push("led-layout-diagram__edge--drop-target");
    }
    if (swapFlash && (swapFlash.from === zoneId || swapFlash.to === zoneId)) {
      parts.push("led-layout-diagram__edge--swap-flash");
    }
    if (litZone === zoneId) {
      parts.push("led-layout-diagram__edge--device-lit");
    } else if (litZone && (mode === "pick" || mode === "inspect")) {
      parts.push("led-layout-diagram__edge--device-idle");
    }
    if (pickable && activeZone && zoneId === activeZone && !litZone) {
      parts.push("led-layout-diagram__edge--pulse");
      parts.push("led-layout-diagram__edge--active");
    }
    return parts.join(" ");
  };

  const dragShiftSteps =
    dragSource && dragTarget && dragSource !== dragTarget
      ? rotationShiftSteps(dragSource, dragTarget)
      : 0;

  const syncMode = mode === "inspect" && Boolean(activeZone || litZone || litStripIds);

  const renderDiagramDot = (index, edgeId) => {
    const dotColor = getZoneColor(edgeId);
    const calibLit = highlightLedSet?.has(index);
    const stripLit =
      syncMode &&
      (litStripIds?.has(edgeId) || litZone === edgeId || activeZone === edgeId);
    const isHover = hoverZone === edgeId;
    const lit = highlightLedSet
      ? calibLit
      : syncMode
        ? stripLit || isHover
        : !hoverZone || isHover;

    return (
      <span
        key={index}
        className={[
          "led-layout-diagram__dot",
          lit ? "led-layout-diagram__dot--lit" : "led-layout-diagram__dot--dim",
          calibLit || stripLit ? "led-layout-diagram__dot--calib-seq" : "",
          stripLit ? "led-layout-diagram__dot--zone-active" : "",
          index === 0 && showIndexZero ? "led-layout-diagram__dot--origin" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ "--dot-color": dotColor }}
        title={
          index === 0
            ? `LED 1 (index 0) · ${ZONE_LABELS[edgeId]}`
            : `LED ${index + 1} · ${ZONE_LABELS[edgeId]}`
        }
      />
    );
  };

  const monitorContent =
    showDots && displayStrips.length > 0 && !isLiveView ? (
      <div
        className={[
          "led-layout-diagram__monitor",
          "led-layout-diagram__monitor--strips",
          compact ? "led-layout-diagram__monitor--fixed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="led-layout-diagram__screen" aria-hidden />
        {displayStrips.map((strip) => {
          const stripLit =
            litStripIds?.has(strip.id) ||
            litZone === strip.id ||
            activeZone === strip.id;
          return (
            <div
              key={strip.id}
              className={[
                "led-layout-diagram__edge-strip",
                `led-layout-diagram__edge-strip--${strip.id}`,
                stripLit ? "led-layout-diagram__edge-strip--lit" : "",
                syncMode && (litStripIds || litZone || activeZone) && !stripLit
                  ? "led-layout-diagram__edge-strip--idle"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                "--zone-color": getZoneColor(strip.id),
                flexDirection: strip.dotFlow,
              }}
              data-zone-id={strip.id}
            >
              {strip.indices.map((index) => renderDiagramDot(index, strip.id))}
            </div>
          );
        })}
      </div>
    ) : ledMap && showDots && isLiveView ? (
      <div
        className={[
          "led-layout-diagram__monitor",
          compact ? "led-layout-diagram__monitor--fixed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          compact
            ? undefined
            : {
                aspectRatio: `${ledMap.width} / ${ledMap.height}`,
              }
        }
      >
        <div className="led-layout-diagram__screen" aria-hidden />
        {ledMap.points.map(([x, y], index) => (
            <span
              key={index}
              className="led-layout-diagram__dot led-layout-diagram__dot--live led-layout-diagram__dot--lit"
              style={{
                left: `${(x / Math.max(1, ledMap.width - 1)) * 100}%`,
                top: `${(y / Math.max(1, ledMap.height - 1)) * 100}%`,
                "--dot-color": liveDotColor,
              }}
              title={`LED ${index + 1}`}
            />
          ))}
      </div>
    ) : (
    <div className="led-layout-diagram__monitor led-layout-diagram__monitor--fallback">
      <div className="led-layout-diagram__screen" aria-hidden />
      {showDots ? (
        <TextFallback counts={resolveStripLayout(settings, deviceModel, ledCount)?.counts} />
      ) : null}
    </div>
  );

  if (isLiveView) {
    return (
      <div
        className={`led-layout-diagram led-layout-diagram--live ${compact ? "led-layout-diagram--compact" : ""}`}
        aria-label="Live LED layout"
      >
        <div className="led-layout-diagram__frame led-layout-diagram__frame--live">{monitorContent}</div>
      </div>
    );
  }

  const diagramClass = [
    "led-layout-diagram",
    compact ? "led-layout-diagram--compact" : "",
    !showDots && pickable ? "led-layout-diagram--edge-pick-only" : "",
    edgeInteractive ? "led-layout-diagram--interactive" : "",
    dragSource ? "led-layout-diagram--drag-active" : "",
    effectivePreviewRotation != null ? "led-layout-diagram--preview-rotate" : "",
    swapFlash ? "led-layout-diagram--swap-success" : "",
    dropRejected ? "led-layout-diagram--drop-rejected" : "",
    litZone && mode === "inspect" ? "led-layout-diagram--zone-sync" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={diagramRef} className={diagramClass}>
      {dragSource && ghostPos ? (
        <div
          className="led-layout-diagram__ghost"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            "--zone-color": getZoneColor(dragSource),
          }}
          aria-hidden
        >
          <span className="led-layout-diagram__ghost-chip">
            {ZONE_LABELS[dragSource]}
            {previewRotation != null ? (
              <span className="led-layout-diagram__ghost-deg">{previewRotation}°</span>
            ) : null}
          </span>
        </div>
      ) : null}
      {ZONE_ORDER.map((zoneId) => {
        const zone = zonesById[zoneId];
        const wireZone = wireZonesById[zoneId];
        const count = wireZone?.indices?.length ?? zone?.indices?.length ?? 0;
        const color = getZoneColor(zoneId);
        return (
          <button
            key={zoneId}
            type="button"
            className={edgeClass(zoneId)}
            style={{ "--zone-color": color }}
            data-zone-id={zoneId}
            disabled={!edgeInteractive}
            onPointerEnter={() => onZoneHover?.(zoneId)}
            onPointerLeave={() => onZoneHover?.(null)}
            onPointerDown={(event) => handlePointerDown(event, zoneId)}
            onPointerMove={(event) => handlePointerMove(event, zoneId)}
            onPointerUp={(event) => handlePointerUp(event, zoneId)}
            onPointerCancel={handlePointerCancel}
            aria-label={`${ZONE_LABELS[zoneId]}${litZone === zoneId ? ", lit on your monitor" : ""}`}
          >
            <span className="led-layout-diagram__edge-glow" aria-hidden />
            <span className="led-layout-diagram__edge-label">
              {ZONE_LABELS[zoneId]}
              {!showDots && pickable ? (
                <span className="led-layout-diagram__edge-meta">
                  {edgeLengthLabel(count) ?? `${count} LED`}
                </span>
              ) : (
                <span
                  className={[
                    "led-layout-diagram__edge-count",
                    !showCounts ? "led-layout-diagram__edge-count--reserved" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden={!showCounts}
                >
                  {showCounts ? count : "0"}
                </span>
              )}
            </span>
          </button>
        );
      })}

      <div className="led-layout-diagram__frame">
        {monitorContent}
        {dragSource && dragTarget && dragSource !== dragTarget ? (
          <div
            className={`led-layout-diagram__rotate-ring led-layout-diagram__rotate-ring--steps-${dragShiftSteps}`}
            aria-hidden
          >
            <span className="led-layout-diagram__rotate-ring-label">
              {previewRotation}°
            </span>
          </div>
        ) : null}
      </div>

      {showLegend ? (
        <div className="led-layout-diagram__legend" aria-hidden>
          {ZONE_ORDER.map((zoneId) => (
            <span key={zoneId} className="led-layout-diagram__legend-item">
              <span
                className="led-layout-diagram__legend-swatch"
                style={{ background: ZONE_DIAGRAM_COLORS[zoneId] }}
              />
              {ZONE_LABELS[zoneId]}
            </span>
          ))}
          {showIndexZero ? (
            <span className="led-layout-diagram__legend-item led-layout-diagram__legend-item--origin">
              <span className="led-layout-diagram__legend-ring" />
              LED 1
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TextFallback({ counts }) {
  if (!counts) return null;
  return (
    <span className="led-layout-diagram__fallback-label">
      {counts.top} / {counts.right} / {counts.bottom} / {counts.left}
    </span>
  );
}
