import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Badge, Button, Group, Select, SegmentedControl, Text, Tooltip } from "@mantine/core";
import {
  IconArrowRight,
  IconBolt,
  IconBrush,
  IconFlipVertical,
  IconLayoutGrid,
  IconPlugConnected,
  IconPlus,
  IconRotate2,
  IconRotateClockwise,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import { useTriangleLayoutDrag } from "../hooks/useTriangleLayoutDrag";
import { ensureHex, scaledRgb } from "../lib/colorUtils";
import { COLOR_MODES } from "../lib/colorModes";
import {
  buildLedClearSelectionPatch,
  buildLedSelectionPatch,
  buildLedsSelectionPatch,
  getSelectedLeds,
  isLedActive,
} from "../lib/ledLayout";
import { buildModeSwitchPatch } from "../lib/modeColors";
import {
  toastPanelAddBlocked,
  toastPanelAddBlockedOverlap,
  toastPowerBranchLimit,
  toastPowerLoopBlocked,
  toastPanelRotateBlocked,
} from "../lib/appToast";
import {
  addTrianglePowerInjector,
  removeTrianglePowerInjector,
  toggleTriangleActiveLink,
} from "../lib/externalTrianglePowerGraph";
import {
  buildTriangleLayoutPatch,
  buildTrianglePanelConnections,
  buildTrianglePowerFlowPaths,
  buildTrianglePanelPreview,
  collectUniqueTriangleLedMarkers,
  collectLedIndicesAtPosition,
  computeTriangleLedLabelOffset,
  computeTrianglePanelLabelPosition,
  createJoinedPanel,
  detectJoinFromAnchors,
  flipPanelJoin,
  moveTrianglePanelWithJoin,
  removeTrianglePanelById,
  resolveSmartPanelJoin,
  rotatePanelJoin,
  resolveTrianglePanels,
  resolveTrianglePowerSettings,
  resolveTriangleWire,
  serializeTrianglePanels,
  summarizeTriangleLayoutEditor,
  TRIANGLE_JOIN_TYPES,
  TRIANGLE_LAYOUT_PRESETS,
} from "../lib/externalTriangleLayout";
import {
  getPanelCenterHub,
  powerDepthOpacity,
  powerFlowArrowCount,
  powerFlowMotionPathId,
  preparePowerFlowArrowSegments,
} from "../lib/externalTriangleCenterFlow";
import { clientPointToSvg } from "../lib/externalTriangleDrag";
import { toggleTriangleWireDirection } from "../lib/externalTriangleWire";

function formatAnchorRefLabel(anchor) {
  if (!anchor) {
    return "?";
  }
  const index = (anchor.index ?? 0) + 1;
  return anchor.kind === "edge" ? `E${index}` : `C${index}`;
}

function formatJoinAnchorLabel(join) {
  if (!join?.parent || !join?.child) {
    return null;
  }
  return `${formatAnchorRefLabel(join.parent)}–${formatAnchorRefLabel(join.child)}`;
}

function DirectionGlyph({ direction = "up", size = 14 }) {
  const stroke = "currentColor";
  if (direction === "down") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <polygon points="3,4 13,4 8,13" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  if (direction === "up") {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <polygon points="8,3 13,12 3,12" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <polygon points="8,3 12,9 4,9" fill="none" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
      <polygon points="4,8 12,8 8,13" fill="none" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

const DIRECTION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "up", label: "Apex up" },
  { value: "down", label: "Apex down" },
];

function computePowerEdgeGeometry(triangle, edgeIndex) {
  const corners = (triangle.leds || []).sort((left, right) => left.cornerIndex - right.cornerIndex);
  const pairs = [
    [0, 1],
    [1, 2],
    [2, 0],
  ];
  const [leftCorner, rightCorner] = pairs[edgeIndex] || pairs[0];
  const start = corners.find((corner) => corner.cornerIndex === leftCorner);
  const end = corners.find((corner) => corner.cornerIndex === rightCorner);
  if (!start || !end) {
    return { x: triangle.cx, y: triangle.cy, angleDeg: 0 };
  }
  const x = (start.x + end.x) / 2;
  const y = (start.y + end.y) / 2;
  const dx = x - triangle.cx;
  const dy = y - triangle.cy;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x, y, angleDeg };
}

function PowerCenterHub({
  triangle,
  hub,
  compact,
  isInjectorSource,
  onToggleDirection,
  isPowerRootPanel,
  powerFlowPreview = false,
  powerFlowAnimated = false,
}) {
  if (!triangle || triangle.slot || triangle.powerStatus === "idle") {
    return null;
  }

  const hubRadius = compact ? (hub.isSplitter ? 3.4 : 2.8) : hub.isSplitter ? 3.9 : 3.2;
  const arrowHead = compact ? 1.1 : 1.25;

  const renderArrow = (fromX, fromY, toX, toY, kind, vectorKey = "0", beginSec = 0) => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) {
      return null;
    }
    const ux = dx / length;
    const uy = dy / length;
    const startX = fromX + ux * hubRadius;
    const startY = fromY + uy * hubRadius;
    const endX = toX - ux * hubRadius;
    const endY = toY - uy * hubRadius;
    const segmentLength = Math.hypot(endX - startX, endY - startY);
    const panelId = triangle.panelId || triangle.id;

    if (powerFlowAnimated) {
      const path = {
        id: `hub-${panelId}-${kind}-${vectorKey}`,
        points: [
          { x: startX, y: startY },
          { x: endX, y: endY },
        ],
        segmentLength,
        durationSec: Math.max(0.55, Math.min(1.6, segmentLength / 11)),
        beginSec,
        powerStatus: triangle.powerStatus === "voltage_warning" ? "VOLTAGE_WARNING" : "ACTIVE",
      };

      return (
        <g
          key={`${kind}-${vectorKey}-${fromX}-${fromY}-${toX}-${toY}`}
          className={[
            "external-triangle-layout-editor__power-center-arrow",
            "external-triangle-layout-editor__power-center-arrow--animated",
            kind === "in"
              ? "external-triangle-layout-editor__power-center-arrow--in"
              : "external-triangle-layout-editor__power-center-arrow--out",
          ]
            .filter(Boolean)
            .join(" ")}
          pointerEvents="none"
        >
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            className="external-triangle-layout-editor__power-center-arrow-line external-triangle-layout-editor__power-center-arrow-line--glow"
          />
          <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            className="external-triangle-layout-editor__power-center-arrow-line external-triangle-layout-editor__power-center-arrow-line--track"
          />
          <PowerFlowMovingArrow path={path} compact={compact} />
        </g>
      );
    }

    return (
      <g
        key={`${kind}-${fromX}-${fromY}-${toX}-${toY}`}
        className={[
          "external-triangle-layout-editor__power-center-arrow",
          kind === "in"
            ? "external-triangle-layout-editor__power-center-arrow--in"
            : "external-triangle-layout-editor__power-center-arrow--out",
        ]
          .filter(Boolean)
          .join(" ")}
        pointerEvents="none"
      >
        <line x1={startX} y1={startY} x2={endX} y2={endY} />
        <path
          d={`M ${endX} ${endY} L ${endX - ux * arrowHead - uy * arrowHead * 0.55} ${endY - uy * arrowHead + ux * arrowHead * 0.55} L ${endX - ux * arrowHead + uy * arrowHead * 0.55} ${endY - uy * arrowHead - ux * arrowHead * 0.55} Z`}
        />
      </g>
    );
  };

  return (
    <g className="external-triangle-layout-editor__power-center-hub" pointerEvents="none">
      {hub.inputVector
        ? renderArrow(
            hub.inputVector.fromCenter.x,
            hub.inputVector.fromCenter.y,
            triangle.cx,
            triangle.cy,
            "in",
            "in",
            (hub.inputVector.depth || 0) * 0.14
          )
        : null}
      {hub.outputVectors.map((vector, index) =>
        renderArrow(
          triangle.cx,
          triangle.cy,
          vector.toCenter.x,
          vector.toCenter.y,
          "out",
          String(index),
          index * 0.18
        )
      )}
      <circle
        cx={triangle.cx}
        cy={triangle.cy}
        r={hubRadius}
        className={[
          "external-triangle-layout-editor__power-center-node",
          hub.isSplitter ? "external-triangle-layout-editor__power-center-node--splitter" : "",
          triangle.powerStatus === "voltage_warning"
            ? "external-triangle-layout-editor__power-center-node--voltage-warning"
            : "",
          isPowerRootPanel ? "external-triangle-layout-editor__power-center-node--root" : "",
          powerFlowPreview && powerFlowAnimated
            ? "external-triangle-layout-editor__power-center-node--flow-active"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={
          isPowerRootPanel
            ? (event) => {
                event.stopPropagation();
                onToggleDirection?.();
              }
            : undefined
        }
        style={{
          ...(isPowerRootPanel ? { pointerEvents: "all", cursor: "pointer" } : {}),
          ...(powerFlowPreview
            ? {
                "--power-flow-depth": hub.inputVector?.depth ?? (hub.isRoot ? 0 : 1),
              }
            : {}),
        }}
      />
      {isInjectorSource ? (
        <text
          x={triangle.cx}
          y={triangle.cy + 0.35}
          className="external-triangle-layout-editor__power-center-injector"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          ⚡
        </text>
      ) : null}
    </g>
  );
}

function PowerFlowMovingArrow({ path, compact = false, arrowIndex = 0, arrowCount = 1 }) {
  const from = path.points?.[0];
  const to = path.points?.[1];
  if (!from || !to) {
    return null;
  }

  const length =
    path.segmentLength ?? Math.hypot((to.x ?? 0) - (from.x ?? 0), (to.y ?? 0) - (from.y ?? 0));
  if (length < 0.01) {
    return null;
  }

  const durationSec = path.durationSec ?? Math.max(0.85, Math.min(2.6, length / 9));
  const beginSec =
    (path.beginSec ?? 0) + (arrowIndex * durationSec) / Math.max(1, arrowCount || 1);
  const motionPathId = powerFlowMotionPathId(path.id, arrowIndex);
  const isWarning = path.powerStatus === "VOLTAGE_WARNING";
  const size = compact ? 0.92 : 1.08;

  return (
    <g className="external-triangle-layout-editor__power-flow-arrow-mover">
      <path
        id={motionPathId}
        d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
        fill="none"
        stroke="none"
        pointerEvents="none"
      />
      <path
        d={`M ${(-size * 1.85).toFixed(2)} ${(-size).toFixed(2)} L 0 0 L ${(-size * 1.85).toFixed(2)} ${size.toFixed(2)} Z`}
        className={[
          "external-triangle-layout-editor__power-flow-arrow-head",
          isWarning ? "external-triangle-layout-editor__power-flow-arrow-head--voltage-warning" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        pointerEvents="none"
      >
        <animateMotion
          dur={`${durationSec}s`}
          repeatCount="indefinite"
          rotate="auto"
          begin={`${beginSec}s`}
          keyPoints="0.06;1"
          keyTimes="0;1"
          calcMode="linear"
        >
          <mpath href={`#${motionPathId}`} />
        </animateMotion>
      </path>
    </g>
  );
}

function PowerEdgeBadge({ triangle, edgeIndex, kind, compact, onAddInjector, onRemoveInjector, injectorId }) {
  const geometry = computePowerEdgeGeometry(triangle, edgeIndex);
  const label = kind === "in" ? "IN" : kind === "out" ? "OUT" : "⚡";
  const offset = compact ? 2.4 : 2.8;
  const rad = ((geometry.angleDeg - 90) * Math.PI) / 180;
  const labelX = geometry.x + Math.cos(rad) * offset;
  const labelY = geometry.y + Math.sin(rad) * offset;

  if (kind === "injector-add") {
    return (
      <g
        className="external-triangle-layout-editor__power-edge-badge"
        transform={`translate(${geometry.x} ${geometry.y})`}
      >
        <circle
          cx={0}
          cy={0}
          r={compact ? 3.2 : 3.6}
          className="external-triangle-layout-editor__power-injector-hit"
          onClick={(event) => {
            event.stopPropagation();
            onAddInjector?.(triangle.panelId || triangle.id, edgeIndex);
          }}
        />
        <circle cx={0} cy={0} r={compact ? 2.2 : 2.5} className="external-triangle-layout-editor__power-injector" />
        <text
          x={0}
          y={0.35}
          className="external-triangle-layout-editor__power-edge-label"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          +
        </text>
      </g>
    );
  }

  if (kind === "injector") {
    return (
      <g
        className="external-triangle-layout-editor__power-edge-badge"
        transform={`translate(${geometry.x} ${geometry.y})`}
      >
        <circle
          cx={0}
          cy={0}
          r={compact ? 3.4 : 3.8}
          className="external-triangle-layout-editor__power-injector-hit"
          onClick={(event) => {
            event.stopPropagation();
            onRemoveInjector?.(injectorId);
          }}
        />
        <circle cx={0} cy={0} r={compact ? 2.4 : 2.7} className="external-triangle-layout-editor__power-injector" />
        <text
          x={0}
          y={0.35}
          className="external-triangle-layout-editor__power-edge-label"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          ⚡
        </text>
      </g>
    );
  }

  return (
    <g
      className="external-triangle-layout-editor__power-edge-badge"
      transform={`translate(${labelX} ${labelY}) rotate(${geometry.angleDeg + 90})`}
      pointerEvents="none"
    >
      {kind === "out" ? (
        <path
          d="M -1.4 0 L 0.2 0.9 L 0.2 -0.9 Z"
          className={`external-triangle-layout-editor__power-edge-label external-triangle-layout-editor__power-edge-label--out`}
        />
      ) : null}
      <text
        x={kind === "out" ? 1.6 : 0}
        y={0.35}
        className={[
          "external-triangle-layout-editor__power-edge-label",
          kind === "in"
            ? "external-triangle-layout-editor__power-edge-label--in"
            : "external-triangle-layout-editor__power-edge-label--out",
        ]
          .filter(Boolean)
          .join(" ")}
        textAnchor={kind === "out" ? "start" : "middle"}
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  );
}

function ledColorAt(settings, ledIndex, fallbackHex) {
  const hex = ensureHex(settings?.hex, fallbackHex);
  if (
    settings?.colorMode === "leds" &&
    Array.isArray(settings.ledColors) &&
    settings.ledColors[ledIndex]
  ) {
    return ensureHex(settings.ledColors[ledIndex], hex);
  }
  return hex;
}

function selectPanelOnPointerDown(event, panelId, onSelectPanel) {
  if (event.button === 0 && panelId) {
    onSelectPanel?.(panelId);
  }
}

function renderTriangleSvg({
  preview,
  summary,
  settings,
  previewHex,
  brightness,
  compact,
  connections,
  powerFlowPaths = [],
  powerFlowPreview = false,
  powerFlowAnimated = false,
  dragState,
  validDropIds,
  selectedPanelId,
  isPaintMode = false,
  ledCount = 0,
  onSelectPanel,
  onSelectLed,
  onSelectLeds,
  onBeginLedDrag,
  onBeginControllerDrag,
  onBeginPanelDrag,
  onBeginJoinAnchorDrag,
  onTogglePowerLink,
  onAddPowerInjector,
  onRemovePowerInjector,
  injectors = [],
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onToggleDirection,
  dragSource: dragSourceProp,
  panelTransforms,
}) {
  const wireSegments =
    preview.wirePointSegments?.filter((segment) => segment.length >= 2) ||
    (preview.wirePoints?.length ? [preview.wirePoints] : []);
  const rootTriangle = preview.triangles.find((triangle) => triangle.isPowerRoot && !triangle.slot);
  const entryAnchor = rootTriangle?.anchors?.find((anchor) => anchor.selected);
  const firstPoint = wireSegments[0]?.[0] || preview.wirePoints?.[0];
  const wireStep = summary?.step === "wire" && !isPaintMode;
  const uniqueLedMarkers = collectUniqueTriangleLedMarkers(preview.triangles);
  const selectedLeds = isPaintMode ? getSelectedLeds(settings, ledCount) : [];
  const primarySelectedLed = selectedLeds.length ? selectedLeds[0] : null;
  const labelPush = compact ? 4.6 : 5.4;
  const ledRadius = compact ? 2.4 : 2.9;
  const hitRadius = compact ? 4.8 : 5.6;
  const dragging = Boolean(dragState?.active);
  const dragSource = dragSourceProp || dragState?.source;
  const ghostDragging = dragSource?.kind === "ghost-panel";
  const panelDragging = dragSource?.kind === "panel";
  const joinAnchorDragging = dragSource?.kind === "join-anchor";
  const controllerDragging = dragSource?.kind === "controller";
  const anchorHintDragging =
    ghostDragging || panelDragging || joinAnchorDragging || controllerDragging;
  const centerHubByPanelId = {};
  for (const triangle of preview.triangles.filter((entry) => !entry.slot)) {
    const panelId = triangle.panelId || triangle.id;
    centerHubByPanelId[panelId] = getPanelCenterHub(preview, panelId);
  }
  const animatedFlowSegments =
    powerFlowPreview && powerFlowAnimated
      ? preparePowerFlowArrowSegments(powerFlowPaths, preview)
      : [];
  const staticFlowSegments = powerFlowPreview ? powerFlowPaths : [];
  const flowSegments = powerFlowAnimated ? animatedFlowSegments : staticFlowSegments;

  return (
    <>
      <defs>
        <marker
          id="triangle-layout-flow-arrow"
          markerWidth="5"
          markerHeight="5"
          refX="4.2"
          refY="2.5"
          orient="auto"
        >
          <path d="M0,0 L5,2.5 L0,5 Z" className="external-triangle-layout-editor__flow-arrow-head" />
        </marker>
        <marker
          id="triangle-layout-power-arrow"
          markerWidth="5"
          markerHeight="5"
          refX="4.2"
          refY="2.5"
          orient="auto"
        >
          <path
            d="M0,0 L5,2.5 L0,5 Z"
            className="external-triangle-layout-editor__power-flow-arrow-head"
          />
        </marker>
      </defs>

      {wireSegments.map((segment, segmentIndex) => (
        <polyline
          key={`wire-segment-${segmentIndex}`}
          points={segment.map((point) => `${point.x},${point.y}`).join(" ")}
          className="external-triangle-layout-editor__wire-path"
          fill="none"
          markerMid="url(#triangle-layout-flow-arrow)"
          markerEnd="url(#triangle-layout-flow-arrow)"
        />
      ))}

      {dragging && dragSource ? (
        <line
          x1={dragSource.x ?? dragState.x}
          y1={dragSource.y ?? dragState.y}
          x2={dragState.x}
          y2={dragState.y}
          className="external-triangle-layout-editor__drag-line"
        />
      ) : null}

      <g
        className={[
          "external-triangle-layout-editor__connection-layer",
          powerFlowPreview ? "external-triangle-layout-editor__connection-layer--power-flow" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {powerFlowPreview
          ? flowSegments.map((path) => {
              const from = path.points?.[0];
              const to = path.points?.[1];
              if (!from || !to) {
                return null;
              }
              const depthClass =
                path.depth != null
                  ? `external-triangle-layout-editor__power-flow-path--depth-${Math.min(path.depth, 12)}`
                  : "";
              const depthStyle =
                path.depth != null
                  ? { "--power-flow-depth": path.depth, animationDelay: `${path.depth * 0.14}s` }
                  : undefined;
              const arrowCount = powerFlowAnimated
                ? powerFlowArrowCount(path.segmentLength, compact)
                : 0;
              return (
                <g key={path.id} className="external-triangle-layout-editor__power-flow-segment">
                  {powerFlowAnimated ? (
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      className={[
                        "external-triangle-layout-editor__power-flow-path",
                        "external-triangle-layout-editor__power-flow-path--glow",
                        depthClass,
                        path.powerStatus === "VOLTAGE_WARNING"
                          ? "external-triangle-layout-editor__power-flow-path--voltage-warning"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={depthStyle}
                    />
                  ) : null}
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={[
                      "external-triangle-layout-editor__power-flow-path",
                      "external-triangle-layout-editor__power-flow-path--active",
                      depthClass,
                      path.powerStatus === "VOLTAGE_WARNING"
                        ? "external-triangle-layout-editor__power-flow-path--voltage-warning"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ ...depthStyle, opacity: powerDepthOpacity(path.depth) }}
                    markerEnd={powerFlowAnimated ? undefined : "url(#triangle-layout-power-arrow)"}
                  />
                  {powerFlowAnimated
                    ? Array.from({ length: arrowCount }, (_, arrowIndex) => (
                        <PowerFlowMovingArrow
                          key={`${path.id}-arrow-${arrowIndex}`}
                          path={path}
                          compact={compact}
                          arrowIndex={arrowIndex}
                          arrowCount={arrowCount}
                        />
                      ))
                    : null}
                </g>
              );
            })
          : null}

        {connections.map((connection) => (
          <g key={connection.id} className="external-triangle-layout-editor__connection">
            {!connection.isActive && connection.flowCenterVector?.length === 2 ? (
              <line
                x1={connection.flowCenterVector[0].x}
                y1={connection.flowCenterVector[0].y}
                x2={connection.flowCenterVector[1].x}
                y2={connection.flowCenterVector[1].y}
                className="external-triangle-layout-editor__shared-edge external-triangle-layout-editor__shared-edge--linker-idle"
              />
            ) : null}
            <line
              x1={connection.cornerA.x}
              y1={connection.cornerA.y}
              x2={connection.cornerB.x}
              y2={connection.cornerB.y}
              stroke="transparent"
              strokeWidth={compact ? 6 : 8}
              className="external-triangle-layout-editor__power-link-hit"
              pointerEvents={isPaintMode ? "none" : "all"}
              onClick={(event) => {
                if (isPaintMode) {
                  return;
                }
                event.stopPropagation();
                onTogglePowerLink?.(connection);
              }}
            />
          </g>
        ))}
      </g>

      {preview.triangles.map((triangle) => {
        const isSlot = triangle.slot;
        const isPowerRootPanel = triangle.isPowerRoot && !isSlot;
        const isMovable = !isSlot && Boolean(triangle.join);
        const isSelected =
          !isSlot && (selectedPanelId === triangle.panelId || selectedPanelId === triangle.id);
        const isPanelDragSource =
          panelDragging &&
          dragging &&
          dragSource?.panelId === (triangle.panelId || triangle.id);
        const panelLabel = !isSlot && triangle.label ? computeTrianglePanelLabelPosition(triangle) : null;
        const anchorTargetId = isSlot ? triangle.id : null;
        const anchorDropActive =
          anchorTargetId && dragState?.hoveredTarget?.id === anchorTargetId;
        const panelInjectors = injectors.filter(
          (injector) => injector.panelId === (triangle.panelId || triangle.id)
        );
        const panelId = triangle.panelId || triangle.id;
        const centerHub = centerHubByPanelId[panelId];
        const isInjectorSource = injectors.some((injector) => injector.panelId === panelId);

        const panelTransform = !isSlot ? panelTransforms?.[triangle.id] : null;
        return (
          <g
            key={triangle.id}
            className={
              !isSlot ? "external-triangle-layout-editor__panel-group" : undefined
            }
            transform={panelTransform || undefined}
          >
            <polygon
              points={triangle.points}
              className={[
                "external-triangle-layout-editor__panel",
                isSlot ? "external-triangle-layout-editor__panel--slot" : "",
                isMovable ? "external-triangle-layout-editor__panel--movable" : "",
                isPowerRootPanel ? "external-triangle-layout-editor__panel--wire-root" : "",
                triangle.powerStatus === "idle"
                  ? "external-triangle-layout-editor__panel--idle"
                  : "",
                triangle.powerStatus === "voltage_warning"
                  ? "external-triangle-layout-editor__panel--voltage-warning"
                  : "",
                isSelected ? "external-triangle-layout-editor__panel--selected" : "",
                isSlot && anchorHintDragging ? "external-triangle-layout-editor__panel--anchor-hint" : "",
                anchorDropActive ? "external-triangle-layout-editor__panel--drop-target" : "",
                isPanelDragSource ? "external-triangle-layout-editor__panel--dragging-source" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (isPaintMode || isSlot || dragging) {
                  return;
                }
                onSelectPanel?.(triangle.panelId || triangle.id);
              }}
              onPointerDown={(event) => {
                if (isPaintMode || !isMovable || dragging) {
                  return;
                }
                onBeginPanelDrag?.(event, {
                  kind: "panel",
                  panelId: triangle.panelId || triangle.id,
                  triangle,
                  childAnchor: triangle.join?.child || { kind: "corner", index: 1 },
                });
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            />

            {isSlot && anchorHintDragging ? (
              <circle
                cx={triangle.cx}
                cy={triangle.cy}
                r={compact ? 2.2 : 2.6}
                className={[
                  "external-triangle-layout-editor__anchor-dot",
                  anchorDropActive ? "external-triangle-layout-editor__anchor-dot--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                pointerEvents="none"
              />
            ) : null}

            {panelLabel ? (
              <>
                <circle
                  cx={panelLabel.x}
                  cy={panelLabel.y}
                  r={compact ? 7 : 8}
                  className="external-triangle-layout-editor__panel-label-hit"
                  onClick={() => {
                    if (dragging) {
                      return;
                    }
                    onSelectPanel?.(triangle.panelId || triangle.id);
                  }}
                />
                <text
                  x={panelLabel.x}
                  y={panelLabel.y}
                  className="external-triangle-layout-editor__label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {triangle.label}
                </text>
              </>
            ) : null}

            {centerHub ? (
              <PowerCenterHub
                triangle={triangle}
                hub={centerHub}
                compact={compact}
                isInjectorSource={isInjectorSource}
                onToggleDirection={onToggleDirection}
                isPowerRootPanel={isPowerRootPanel}
                powerFlowPreview={powerFlowPreview}
                powerFlowAnimated={powerFlowAnimated}
              />
            ) : null}

            {(triangle.outputEdges || []).map((edgeIndex) => {
              const injector = panelInjectors.find((entry) => entry.edgeIndex === edgeIndex);
              if (injector) {
                return (
                  <PowerEdgeBadge
                    key={`injector-${triangle.id}-${edgeIndex}`}
                    triangle={triangle}
                    edgeIndex={edgeIndex}
                    kind="injector"
                    compact={compact}
                    injectorId={injector.id}
                    onRemoveInjector={onRemovePowerInjector}
                  />
                );
              }
              if (
                isSelected &&
                triangle.powerStatus !== "idle" &&
                !injector
              ) {
                return (
                  <PowerEdgeBadge
                    key={`injector-add-${triangle.id}-${edgeIndex}`}
                    triangle={triangle}
                    edgeIndex={edgeIndex}
                    kind="injector-add"
                    compact={compact}
                    onAddInjector={onAddPowerInjector}
                  />
                );
              }
              return null;
            })}

            {isPowerRootPanel
              ? triangle.anchors.map((anchor) => {
                  const targetId = `origin-${triangle.col}-${triangle.row}-${anchor.type}-${anchor.index}`;
                  const dropActive = validDropIds.has(targetId);
                  return (
                    <circle
                      key={`${anchor.type}-${anchor.index}`}
                      cx={anchor.x}
                      cy={anchor.y}
                      r={anchor.type === "corner" ? 3.6 : 3.1}
                      className={[
                        "external-triangle-layout-editor__anchor",
                        anchor.type === "edge" ? "external-triangle-layout-editor__anchor--edge" : "",
                        anchor.selected ? "external-triangle-layout-editor__anchor--selected" : "",
                        wireStep && !anchor.selected && !dragging && !anchorHintDragging
                          ? "external-triangle-layout-editor__anchor--hint"
                          : "",
                        dropActive ? "external-triangle-layout-editor__anchor--drop-target" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      pointerEvents="none"
                    />
                  );
                })
              : null}
          </g>
        );
      })}

      <g className="external-triangle-layout-editor__led-layer">
        {uniqueLedMarkers.map((led) => {
          const hex = ledColorAt(settings, led.ledIndex, previewHex);
          const { r, g, b } = scaledRgb(hex, brightness);
          const triangle = led.triangles?.[0];
          const isOrigin = led.ledIndex === 0;
          const isShared =
            uniqueLedMarkers.some(
              (other) =>
                other.ledIndex !== led.ledIndex &&
                Math.abs((other.cornerX ?? other.x) - (led.cornerX ?? led.x)) < 0.08 &&
                Math.abs((other.cornerY ?? other.y) - (led.cornerY ?? led.y)) < 0.08
            );
          const labelPos = computeTriangleLedLabelOffset(led.x, led.y, led.triangles, labelPush);
          const showOrderLabel = led.ledIndex != null && !isOrigin;
          const ledTargetId = triangle
            ? `led-${triangle.col}-${triangle.row}-${led.cornerIndex ?? 0}`
            : null;
          const isDragSource =
            dragSource?.kind === "led" &&
            dragSource.triangle?.id === triangle?.id &&
            dragSource.cornerIndex === led.cornerIndex;
          const dropActive = ledTargetId && validDropIds.has(ledTargetId);
          const inletDropActive = controllerDragging && dropActive;
          const isJoinEditPanel =
            Boolean(triangle?.join) &&
            (selectedPanelId === triangle?.panelId || selectedPanelId === triangle?.id);
          const isRootPanel = Boolean(triangle) && triangle.isPowerRoot;
          const isSelectedPanel =
            selectedPanelId === triangle?.panelId || selectedPanelId === triangle?.id;
          const draggable =
            !isPaintMode &&
            Boolean(triangle) &&
            !isJoinEditPanel &&
            !isOrigin &&
            !(isRootPanel && !wireStep);
          const isSelectedLed =
            isPaintMode && isLedActive(led.ledIndex, settings, ledCount);
          const isPrimaryLed =
            isPaintMode && primarySelectedLed != null && led.ledIndex === primarySelectedLed;
          const voltageWarning = triangle?.powerStatus === "voltage_warning";
          const panelId = triangle?.panelId || triangle?.id;
          const ledTransform = triangle ? panelTransforms?.[triangle.id] : null;

          const handlePaintLedPointerDown = (event) => {
            event.stopPropagation();
            const indices = collectLedIndicesAtPosition(uniqueLedMarkers, led.x, led.y);
            if (!indices.length) {
              return;
            }
            if (event.shiftKey) {
              const current = getSelectedLeds(settings, ledCount);
              const merged = [...new Set([...current, ...indices])].sort((a, b) => a - b);
              onSelectLeds?.(merged);
              return;
            }
            if (indices.length > 1) {
              onSelectLeds?.(indices);
              return;
            }
            onSelectLed?.(indices[0]);
          };

          return (
            <g
              key={`${led.ledIndex}-${led.x}-${led.y}`}
              className="external-triangle-layout-editor__panel-group"
              transform={ledTransform || undefined}
            >
              {isShared || inletDropActive ? (
                <circle
                  cx={led.x}
                  cy={led.y}
                  r={ledRadius + 1.4}
                  className={[
                    "external-triangle-layout-editor__led-joint-ring",
                    inletDropActive ? "external-triangle-layout-editor__led-joint-ring--drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  pointerEvents="none"
                />
              ) : null}
              <circle
                cx={led.x}
                cy={led.y}
                r={ledRadius}
                fill={`rgb(${r}, ${g}, ${b})`}
                className={[
                  "external-triangle-layout-editor__led",
                  isOrigin ? "external-triangle-layout-editor__led--origin" : "",
                  isShared ? "external-triangle-layout-editor__led--shared" : "",
                  voltageWarning ? "external-triangle-layout-editor__led--voltage-warning" : "",
                  draggable ? "external-triangle-layout-editor__led--draggable" : "",
                  isDragSource && dragging ? "external-triangle-layout-editor__led--dragging" : "",
                  dropActive ? "external-triangle-layout-editor__led--drop-target" : "",
                  isSelectedLed ? "external-triangle-layout-editor__led--selected" : "",
                  isPrimaryLed ? "external-triangle-layout-editor__led--primary" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                pointerEvents="none"
              />
              {isSelectedLed ? (
                <circle
                  cx={led.x}
                  cy={led.y}
                  r={ledRadius + (compact ? 1.8 : 2.2)}
                  className={[
                    "external-triangle-layout-editor__led-selection-ring",
                    isPrimaryLed ? "external-triangle-layout-editor__led-selection-ring--primary" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  pointerEvents="none"
                />
              ) : null}
              {isPaintMode ? (
                <circle
                  cx={led.x}
                  cy={led.y}
                  r={hitRadius}
                  className={[
                    "external-triangle-layout-editor__led-hit",
                    "external-triangle-layout-editor__led-hit--paint",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onPointerDown={handlePaintLedPointerDown}
                />
              ) : draggable ? (
                <circle
                  cx={led.x}
                  cy={led.y}
                  r={hitRadius}
                  className="external-triangle-layout-editor__led-hit"
                  onPointerDown={(event) =>
                    onBeginLedDrag?.(event, {
                      kind: "led",
                      x: led.x,
                      y: led.y,
                      cornerIndex: led.cornerIndex,
                      ledIndex: led.ledIndex,
                      wireStep: triangle.leds?.find((entry) => entry.ledIndex === led.ledIndex)?.wireStep,
                      triangle,
                      triangles: led.triangles || [triangle],
                    })
                  }
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                />
              ) : isOrigin && panelId && !isPaintMode ? (
                <circle
                  cx={led.x}
                  cy={led.y}
                  r={hitRadius}
                  className="external-triangle-layout-editor__led-hit external-triangle-layout-editor__led-hit--select"
                  onPointerDown={(event) => selectPanelOnPointerDown(event, panelId, onSelectPanel)}
                />
              ) : null}
              {showOrderLabel ? (
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  className="external-triangle-layout-editor__led-order"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {led.ledIndex + 1}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      <g className="external-triangle-layout-editor__join-anchor-layer">
        {preview.triangles.map((triangle) => {
          if (triangle.slot) {
            return null;
          }
          const isSelected =
            selectedPanelId === triangle.panelId || selectedPanelId === triangle.id;
          const showJoinAnchors =
            !isPaintMode &&
            (isSelected ||
              (joinAnchorDragging && dragSource?.panelId !== (triangle.panelId || triangle.id)));
          if (!showJoinAnchors) {
            return null;
          }
          const panelTransform = panelTransforms?.[triangle.id];
          return (
            <g
              key={`join-anchors-${triangle.id}`}
              className="external-triangle-layout-editor__panel-group"
              transform={panelTransform || undefined}
            >
              {renderPanelJoinAnchors(triangle, compact, {
                isSelected,
                isRoot: !triangle.parentId,
                joinAnchorDragging,
                dragSource,
                dragging,
                validDropIds,
                onBeginJoinAnchorDrag,
                onPointerMove,
                onPointerUp,
                onPointerCancel,
              })}
            </g>
          );
        })}
      </g>

      {entryAnchor && rootTriangle ? (
        <g className="external-triangle-layout-editor__entry-marker">
          {(() => {
            const inLabelPos = computeTriangleLedLabelOffset(
              entryAnchor.x,
              entryAnchor.y,
              [rootTriangle],
              labelPush + 1.8
            );
            const controllerDragSource =
              dragSource?.kind === "controller" &&
              Math.abs(dragSource.x - entryAnchor.x) < 0.06 &&
              Math.abs(dragSource.y - entryAnchor.y) < 0.06;
            const rootPanelId = rootTriangle.panelId || rootTriangle.id;
            return (
              <>
                <circle
                  cx={entryAnchor.x}
                  cy={entryAnchor.y}
                  r={3.8}
                  className={[
                    "external-triangle-layout-editor__entry-ring",
                    controllerDragSource && dragging
                      ? "external-triangle-layout-editor__entry-ring--dragging"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  pointerEvents="none"
                />
                <text
                  x={inLabelPos.x}
                  y={inLabelPos.y}
                  className="external-triangle-layout-editor__entry-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  IN
                </text>
                <circle
                  cx={inLabelPos.x}
                  cy={inLabelPos.y}
                  r={hitRadius + 1.2}
                  className="external-triangle-layout-editor__in-label-hit"
                  onPointerDown={(event) => selectPanelOnPointerDown(event, rootPanelId, onSelectPanel)}
                />
                <circle
                  cx={entryAnchor.x}
                  cy={entryAnchor.y}
                  r={hitRadius}
                  className="external-triangle-layout-editor__controller-hit"
                  onPointerDown={(event) => {
                    selectPanelOnPointerDown(event, rootPanelId, onSelectPanel);
                    onBeginControllerDrag?.(event, {
                      kind: "controller",
                      x: entryAnchor.x,
                      y: entryAnchor.y,
                    });
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                />
              </>
            );
          })()}
        </g>
      ) : null}

      {(ghostDragging || panelDragging) && dragging ? (
        <g className="external-triangle-layout-editor__ghost-panel" pointerEvents="none">
          <polygon
            points={dragSource.ghostPoints || ""}
            className={[
              "external-triangle-layout-editor__ghost-panel-shape",
              panelDragging ? "external-triangle-layout-editor__ghost-panel-shape--panel" : "",
              dragState.hoveredTarget && isValidDropVisual(dragState, validDropIds)
                ? "external-triangle-layout-editor__ghost-panel-shape--valid"
                : "external-triangle-layout-editor__ghost-panel-shape--invalid",
            ].join(" ")}
          />
          {dragSource.joinLabel ? (
            <text
              x={dragSource.joinLabelX ?? dragState.x}
              y={dragSource.joinLabelY ?? dragState.y - 6}
              className="external-triangle-layout-editor__ghost-join-badge"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {dragSource.joinLabel}
            </text>
          ) : null}
        </g>
      ) : null}

      {joinAnchorDragging && dragging && dragSource?.joinLabel ? (
        <text
          x={dragSource.joinLabelX ?? dragState.x}
          y={dragSource.joinLabelY ?? dragState.y - 6}
          className="external-triangle-layout-editor__ghost-join-badge"
          textAnchor="middle"
          dominantBaseline="middle"
          pointerEvents="none"
        >
          {dragSource.joinLabel}
        </text>
      ) : null}

      {dragging && controllerDragging ? (
        <>
          <circle
            cx={dragState.x}
            cy={dragState.y}
            r={ledRadius + 1.2}
            className={[
              "external-triangle-layout-editor__entry-ring",
              "external-triangle-layout-editor__entry-ring--dragging",
              dragState.hoveredTarget && isValidDropVisual(dragState, validDropIds)
                ? "external-triangle-layout-editor__entry-ring--drop-valid"
                : "external-triangle-layout-editor__entry-ring--drop-invalid",
            ]
              .filter(Boolean)
              .join(" ")}
            pointerEvents="none"
          />
          <text
            x={dragState.x}
            y={dragState.y}
            className="external-triangle-layout-editor__entry-label"
            textAnchor="middle"
            dominantBaseline="middle"
            pointerEvents="none"
          >
            IN
          </text>
        </>
      ) : null}

      {dragging && !ghostDragging && !panelDragging && !joinAnchorDragging && !controllerDragging ? (
        <circle
          cx={dragState.x}
          cy={dragState.y}
          r={ledRadius + 0.8}
          className={[
            "external-triangle-layout-editor__drag-ghost",
            dragState.hoveredTarget && isValidDropVisual(dragState, validDropIds)
              ? "external-triangle-layout-editor__drag-ghost--valid"
              : "external-triangle-layout-editor__drag-ghost--invalid",
          ].join(" ")}
          pointerEvents="none"
        />
      ) : null}

      {firstPoint && !entryAnchor ? (
        <circle
          cx={firstPoint.x}
          cy={firstPoint.y}
          r={2.2}
          className="external-triangle-layout-editor__wire-start"
        />
      ) : null}
    </>
  );
}

function isValidDropVisual(dragState, validDropIds) {
  return Boolean(dragState?.hoveredTarget && validDropIds.has(dragState.hoveredTarget.id));
}

function joinAnchorTargetId(panelId, anchorKind, anchorIndex) {
  if (anchorKind === "edge") {
    return `anchor-${panelId}-edge-${anchorIndex}-mid`;
  }
  return `anchor-${panelId}-corner-${anchorIndex}-c`;
}

function renderPanelJoinAnchors(
  triangle,
  compact,
  {
    isSelected,
    isRoot,
    joinAnchorDragging,
    dragSource,
    dragging,
    validDropIds,
    onBeginJoinAnchorDrag,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
) {
  const leds = (triangle.leds || []).slice().sort((a, b) => a.cornerIndex - b.cornerIndex);
  if (leds.length < 3) {
    return null;
  }

  const panelId = triangle.panelId || triangle.id;
  const cx = triangle.cx;
  const cy = triangle.cy;
  const cornerPull = compact ? 6 : 7.5;
  const edgePull = compact ? 4.5 : 5.5;
  const hitRadius = compact ? 5 : 5.8;
  const cornerLabels = ["C1", "C2", "C3"];
  const edgeLabels = ["E1", "E2", "E3"];
  const edgePairs = [
    [0, 1],
    [1, 2],
    [2, 0],
  ];
  const showDragSources = isSelected && !isRoot;
  const controllerDragging = dragSource?.kind === "controller";
  const showDropTargets =
    (joinAnchorDragging && dragSource?.panelId !== panelId) || controllerDragging;
  const activeChildJoin = triangle.join?.child;

  const pullInward = (px, py, distance) => {
    const dx = cx - px;
    const dy = cy - py;
    const len = Math.hypot(dx, dy) || 1;
    return { x: px + (dx / len) * distance, y: py + (dy / len) * distance };
  };

  const anchors = [];

  for (const led of leds) {
    const labelPos = pullInward(led.x, led.y, cornerPull);
    anchors.push({
      key: `corner-${led.cornerIndex}`,
      anchorKind: "corner",
      anchorIndex: led.cornerIndex,
      x: led.x,
      y: led.y,
      labelX: labelPos.x,
      labelY: labelPos.y,
      label: cornerLabels[led.cornerIndex],
      isEdge: false,
      isActiveJoin:
        activeChildJoin?.kind === "corner" && activeChildJoin.index === led.cornerIndex,
    });
  }

  for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
    const [a, b] = edgePairs[edgeIndex];
    const la = leds[a];
    const lb = leds[b];
    if (!la || !lb) {
      continue;
    }
    const mx = (la.x + lb.x) / 2;
    const my = (la.y + lb.y) / 2;
    const labelPos = pullInward(mx, my, edgePull);
    anchors.push({
      key: `edge-${edgeIndex}`,
      anchorKind: "edge",
      anchorIndex: edgeIndex,
      t: 0.5,
      x: mx,
      y: my,
      labelX: labelPos.x,
      labelY: labelPos.y,
      label: edgeLabels[edgeIndex],
      isEdge: true,
      isActiveJoin: activeChildJoin?.kind === "edge" && activeChildJoin.index === edgeIndex,
    });
  }

  return (
    <g className="external-triangle-layout-editor__join-anchors">
      {anchors.map((anchor) => {
        const targetId = joinAnchorTargetId(panelId, anchor.anchorKind, anchor.anchorIndex);
        const dropActive = showDropTargets && validDropIds.has(targetId);
        const isDragSource =
          joinAnchorDragging &&
          dragging &&
          dragSource?.panelId === panelId &&
          dragSource?.anchorKind === anchor.anchorKind &&
          dragSource?.anchorIndex === anchor.anchorIndex;

        return (
          <g key={anchor.key}>
            {(isSelected || showDropTargets) && (
              <>
                <circle
                  cx={anchor.labelX}
                  cy={anchor.labelY}
                  r={anchor.isEdge ? (compact ? 2.2 : 2.6) : compact ? 2.4 : 2.8}
                  className={[
                    "external-triangle-layout-editor__anchor-name-bg",
                    anchor.isEdge ? "external-triangle-layout-editor__anchor-name-bg--edge" : "",
                    anchor.isActiveJoin ? "external-triangle-layout-editor__anchor-name-bg--active-join" : "",
                    dropActive ? "external-triangle-layout-editor__anchor-name-bg--drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  pointerEvents="none"
                />
                <text
                  x={anchor.labelX}
                  y={anchor.labelY}
                  className={[
                    "external-triangle-layout-editor__anchor-name",
                    anchor.isEdge
                      ? "external-triangle-layout-editor__anchor-name--edge"
                      : "external-triangle-layout-editor__anchor-name--corner",
                    dropActive ? "external-triangle-layout-editor__anchor-name--drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {anchor.label}
                </text>
              </>
            )}
            {showDragSources ? (
              <circle
                cx={anchor.x}
                cy={anchor.y}
                r={hitRadius}
                className={[
                  "external-triangle-layout-editor__join-anchor-hit",
                  anchor.isActiveJoin ? "external-triangle-layout-editor__join-anchor-hit--active" : "",
                  isDragSource ? "external-triangle-layout-editor__join-anchor-hit--dragging" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={(event) =>
                  onBeginJoinAnchorDrag?.(event, {
                    kind: "join-anchor",
                    panelId,
                    anchorKind: anchor.anchorKind,
                    anchorIndex: anchor.anchorIndex,
                    t: anchor.t,
                    x: anchor.x,
                    y: anchor.y,
                    triangle,
                  })
                }
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              />
            ) : null}
            {showDropTargets ? (
              <circle
                cx={anchor.x}
                cy={anchor.y}
                r={hitRadius}
                className={[
                  "external-triangle-layout-editor__join-anchor-drop",
                  dropActive ? "external-triangle-layout-editor__join-anchor-drop--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                pointerEvents="none"
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function ghostTrianglePointsAt(cx, cy, size = 7, direction = "auto") {
  const h = (size * Math.sqrt(3)) / 2;
  if (direction === "down") {
    return `${cx - size * 0.5},${cy - h * 0.45} ${cx + size * 0.5},${cy - h * 0.45} ${cx},${cy + h * 0.55}`;
  }
  return `${cx},${cy - h * 0.55} ${cx - size * 0.5},${cy + h * 0.45} ${cx + size * 0.5},${cy + h * 0.45}`;
}

function parsePolygonPoints(points) {
  return points
    .trim()
    .split(/\s+/)
    .map((point) => point.split(",").map(Number));
}

function referencePanelTriangle(preview) {
  const triangles = preview?.triangles || [];
  return (
    triangles.find((triangle) => !triangle.slot && triangle.points && triangle.wireIndex === 0) ||
    triangles.find((triangle) => !triangle.slot && triangle.points)
  );
}

function panelEdgeLength(points) {
  const pts = parsePolygonPoints(points);
  return Math.max(
    Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]),
    Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]),
    Math.hypot(pts[0][0] - pts[2][0], pts[0][1] - pts[2][1])
  );
}

function ghostPanelPointsAtCursor(preview, cx, cy, desiredDirection = "auto") {
  const ref = referencePanelTriangle(preview);
  if (!ref?.points) {
    return ghostTrianglePointsAt(cx, cy, 7, desiredDirection);
  }

  const size = panelEdgeLength(ref.points);

  if (desiredDirection === "up" || desiredDirection === "down") {
    return ghostTrianglePointsAt(cx, cy, size, desiredDirection);
  }

  return translatePolygonPoints(ref.points, cx - ref.cx, cy - ref.cy);
}

function translatePolygonPoints(points, dx, dy) {
  return points
    .trim()
    .split(/\s+/)
    .map((point) => {
      const [x, y] = point.split(",").map(Number);
      return `${x + dx},${y + dy}`;
    })
    .join(" ");
}

function joinLabelForExactJoin(hoveredTarget, sourceAnchor) {
  if (!hoveredTarget || hoveredTarget.kind !== "anchor" || !sourceAnchor) {
    return null;
  }
  const parentAnchor = {
    kind: hoveredTarget.anchorKind,
    index: hoveredTarget.anchorIndex,
    t: hoveredTarget.t,
  };
  return formatJoinAnchorLabel(detectJoinFromAnchors(parentAnchor, sourceAnchor));
}

function joinLabelForHover(hoveredTarget, { panels = [], desiredDirection = "auto" } = {}) {
  if (!hoveredTarget || hoveredTarget.kind !== "anchor") {
    return null;
  }
  const parentAnchor = {
    kind: hoveredTarget.anchorKind,
    index: hoveredTarget.anchorIndex,
    t: hoveredTarget.t,
  };
  const join = resolveSmartPanelJoin({
    parentPanelId: hoveredTarget.parentPanelId || hoveredTarget.panelId,
    parentAnchor,
    panels,
    desiredDirection,
  });
  return formatJoinAnchorLabel(join);
}

function joinLabelPositionForHover(hoveredTarget, fallbackX, fallbackY) {
  if (!hoveredTarget || hoveredTarget.kind !== "anchor") {
    return { x: fallbackX, y: fallbackY - 6 };
  }
  return { x: hoveredTarget.x, y: hoveredTarget.y - 5.5 };
}

const VIEWPORT_UNIT_PX = 4;
const VIEWPORT_HEIGHT = 420;
const VIEWPORT_HEIGHT_COMPACT = 280;
const VIEWPORT_LAYOUT_MARGIN_RATIO = 0.45;
const VIEWPORT_LAYOUT_MARGIN_MIN = 72;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;
const PAN_DRAG_THRESHOLD = 4;
const PAN_INTERACTIVE_SELECTOR = [
  ".external-triangle-layout-editor__led-hit",
  ".external-triangle-layout-editor__led-hit--select",
  ".external-triangle-layout-editor__led-hit--paint",
  ".external-triangle-layout-editor__in-label-hit",
  ".external-triangle-layout-editor__controller-hit",
  ".external-triangle-layout-editor__join-anchor-hit",
  ".external-triangle-layout-editor__power-link-hit",
  ".external-triangle-layout-editor__power-injector-hit",
  ".external-triangle-layout-editor__panel--slot",
  ".external-triangle-layout-editor__flow-path--root",
].join(",");

function computeViewportDocument(baseViewBox, zoom, viewportSize) {
  const layoutWidthPx = Math.max(1, Math.round(baseViewBox.w * VIEWPORT_UNIT_PX * zoom));
  const layoutHeightPx = Math.max(1, Math.round(baseViewBox.h * VIEWPORT_UNIT_PX * zoom));
  const minMargin = Math.max(24, Math.round(VIEWPORT_LAYOUT_MARGIN_MIN * zoom));
  let marginX = Math.max(minMargin, Math.round(layoutWidthPx * VIEWPORT_LAYOUT_MARGIN_RATIO));
  let marginY = Math.max(minMargin, Math.round(layoutHeightPx * VIEWPORT_LAYOUT_MARGIN_RATIO));

  if (viewportSize?.w > 0 && viewportSize?.h > 0) {
    marginX = Math.max(marginX, Math.round((viewportSize.w - layoutWidthPx) / 2));
    marginY = Math.max(marginY, Math.round((viewportSize.h - layoutHeightPx) / 2));
  }

  return {
    layoutWidthPx,
    layoutHeightPx,
    marginX,
    marginY,
    contentWidthPx: layoutWidthPx + marginX * 2,
    contentHeightPx: layoutHeightPx + marginY * 2,
  };
}

function getCenteredViewportScroll(viewport, doc) {
  if (!viewport) {
    return { x: doc.marginX, y: doc.marginY };
  }
  return {
    x: Math.max(0, doc.marginX + doc.layoutWidthPx / 2 - viewport.clientWidth / 2),
    y: Math.max(0, doc.marginY + doc.layoutHeightPx / 2 - viewport.clientHeight / 2),
  };
}

function scrollLayoutToCenter(viewport, doc) {
  if (!viewport) {
    return { x: 0, y: 0 };
  }
  const next = getCenteredViewportScroll(viewport, doc);
  viewport.scrollLeft = next.x;
  viewport.scrollTop = next.y;
  return next;
}

function isNearTriangleLed(svgX, svgY, triangles, radius) {
  for (const led of collectUniqueTriangleLedMarkers(triangles)) {
    if (Math.hypot(led.x - svgX, led.y - svgY) <= radius) {
      return true;
    }
  }
  return false;
}

function canPanFromPointerDown(event, svgElement, triangles, compact) {
  if (event.button !== 0 || event.altKey) {
    return false;
  }
  if (event.target instanceof Element && event.target.closest(PAN_INTERACTIVE_SELECTOR)) {
    return false;
  }
  if (!svgElement) {
    return true;
  }
  const point = clientPointToSvg(svgElement, event.clientX, event.clientY);
  const hitRadius = compact ? 4.8 : 5.6;
  return !isNearTriangleLed(point.x, point.y, triangles, hitRadius);
}

export function ExternalTriangleLayoutEditor({
  device,
  settings,
  onChange,
  compact = false,
  showLegend = true,
  fillHeight = false,
}) {
  const panels = resolveTrianglePanels(device);
  const wire = resolveTriangleWire(device);
  const powerSettings = resolveTrianglePowerSettings(device);
  const layoutPatch = useCallback(
    (nextPanels, patch = {}) => {
      const nextWire = patch.wire ?? wire;
      return buildTriangleLayoutPatch(nextPanels, nextWire, {
        wire: nextWire,
        powerRootId: patch.powerRootId ?? powerSettings.trianglePowerRootId,
        activeLinks: patch.activeLinks ?? powerSettings.triangleActiveLinks,
        injectors: patch.injectors ?? powerSettings.trianglePowerInjectors,
      });
    },
    [wire, powerSettings]
  );
  const summary = useMemo(
    () => summarizeTriangleLayoutEditor(panels, wire, powerSettings),
    [panels, wire, powerSettings]
  );
  const preview = useMemo(
    () =>
      buildTrianglePanelPreview(panels, {
        includeSlots: !summary.atMax,
        wire,
        powerRootId: powerSettings.trianglePowerRootId,
        activeLinks: powerSettings.triangleActiveLinks,
        injectors: powerSettings.trianglePowerInjectors,
      }),
    [panels, summary.atMax, wire, powerSettings]
  );
  const connections = useMemo(() => buildTrianglePanelConnections(preview), [preview]);
  const powerFlowPaths = useMemo(() => buildTrianglePowerFlowPaths(preview), [preview]);
  const hasActivePowerFlow = powerFlowPaths.length > 0;
  const [showPowerFlowAnimation, setShowPowerFlowAnimation] = useState(false);
  useEffect(() => {
    if (!hasActivePowerFlow && showPowerFlowAnimation) {
      setShowPowerFlowAnimation(false);
    }
  }, [hasActivePowerFlow, showPowerFlowAnimation]);
  const [selectedPanelId, setSelectedPanelId] = useState(null);
  const [newPanelDirection, setNewPanelDirection] = useState("auto");
  const [panelTransforms, setPanelTransforms] = useState(null);
  const prevTrianglesRef = useRef(null);
  const animRafRef = useRef(null);
  const viewportRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const currentTriangles = preview.triangles.filter((t) => !t.slot);
    const prev = prevTrianglesRef.current;
    prevTrianglesRef.current = currentTriangles;

    if (!prev || !prev.length) {
      return;
    }
    const prevById = new Map();
    for (const t of prev) {
      prevById.set(t.id, t);
    }
    const overrides = {};
    let any = false;
    for (const tri of currentTriangles) {
      const p = prevById.get(tri.id);
      if (!p || !tri.points || !p.points) {
        continue;
      }
      const newPts = tri.points
        .trim()
        .split(/\s+/)
        .map((s) => s.split(",").map(Number));
      const oldPts = p.points
        .trim()
        .split(/\s+/)
        .map((s) => s.split(",").map(Number));
      if (newPts.length !== 3 || oldPts.length !== 3) {
        continue;
      }
      if (newPts.some((pt) => pt.some((n) => !Number.isFinite(n)))) {
        continue;
      }
      if (oldPts.some((pt) => pt.some((n) => !Number.isFinite(n)))) {
        continue;
      }
      const angleNew = Math.atan2(
        newPts[1][1] - newPts[0][1],
        newPts[1][0] - newPts[0][0]
      );
      const angleOld = Math.atan2(
        oldPts[1][1] - oldPts[0][1],
        oldPts[1][0] - oldPts[0][0]
      );
      let rotRad = angleOld - angleNew;
      while (rotRad > Math.PI) rotRad -= Math.PI * 2;
      while (rotRad < -Math.PI) rotRad += Math.PI * 2;
      const rotDeg = (rotRad * 180) / Math.PI;
      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);
      const rotX = newPts[0][0] * cos - newPts[0][1] * sin;
      const rotY = newPts[0][0] * sin + newPts[0][1] * cos;
      const tx = oldPts[0][0] - rotX;
      const ty = oldPts[0][1] - rotY;
      if (Math.abs(rotDeg) < 0.5 && Math.abs(tx) < 0.05 && Math.abs(ty) < 0.05) {
        continue;
      }
      overrides[tri.id] = `translate(${tx.toFixed(3)} ${ty.toFixed(3)}) rotate(${rotDeg.toFixed(3)})`;
      any = true;
    }
    if (!any) {
      return;
    }
    if (animRafRef.current) {
      cancelAnimationFrame(animRafRef.current);
    }
    setPanelTransforms(overrides);
    const firstFrame = requestAnimationFrame(() => {
      animRafRef.current = requestAnimationFrame(() => {
        setPanelTransforms(null);
        animRafRef.current = null;
      });
    });
    animRafRef.current = firstFrame;
  }, [preview]);

  useEffect(
    () => () => {
      if (animRafRef.current) {
        cancelAnimationFrame(animRafRef.current);
        animRafRef.current = null;
      }
    },
    []
  );

  const baseViewBox = useMemo(() => {
    const parts = (preview.viewBox || "0 0 100 100")
      .trim()
      .split(/\s+/)
      .map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
    }
    return { x: 0, y: 0, w: 100, h: 100 };
  }, [preview.viewBox]);

  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const viewBoxStr = `${baseViewBox.x} ${baseViewBox.y} ${baseViewBox.w} ${baseViewBox.h}`;
  const viewportDocument = useMemo(
    () => computeViewportDocument(baseViewBox, zoom, viewportSize),
    [baseViewBox, zoom, viewportSize]
  );
  const {
    layoutWidthPx,
    layoutHeightPx,
    marginX,
    marginY,
    contentWidthPx,
    contentHeightPx,
  } = viewportDocument;
  const centeredScroll = useMemo(
    () => getCenteredViewportScroll(viewportRef.current, viewportDocument),
    [viewportDocument, viewportSize]
  );
  const isDefaultView =
    zoom === 1 &&
    Math.abs(viewOffset.x - centeredScroll.x) < 2 &&
    Math.abs(viewOffset.y - centeredScroll.y) < 2;

  const resetView = useCallback(() => {
    setZoom(1);
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const doc = computeViewportDocument(baseViewBox, 1, {
        w: viewport.clientWidth,
        h: viewport.clientHeight,
      });
      const next = scrollLayoutToCenter(viewport, doc);
      setViewOffset(next);
    });
  }, [baseViewBox]);

  useEffect(() => {
    resetView();
  }, [preview.viewBox, summary.panelCount, resetView]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setViewportSize({ w: viewport.clientWidth, h: viewport.clientHeight });
    });
    observer.observe(viewport);
    setViewportSize({ w: viewport.clientWidth, h: viewport.clientHeight });
    return () => observer.disconnect();
  }, [fillHeight, compact]);

  useLayoutEffect(() => {
    if (zoom !== 1) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const doc = computeViewportDocument(baseViewBox, 1, {
      w: viewport.clientWidth,
      h: viewport.clientHeight,
    });
    const next = getCenteredViewportScroll(viewport, doc);
    if (
      Math.abs(viewport.scrollLeft - next.x) > 1 ||
      Math.abs(viewport.scrollTop - next.y) > 1
    ) {
      viewport.scrollLeft = next.x;
      viewport.scrollTop = next.y;
      setViewOffset(next);
    }
  }, [baseViewBox, viewportSize]);

  const zoomAt = useCallback(
    (factor, ratioX = 0.5, ratioY = 0.5) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
      if (Math.abs(nextZoom - zoom) < 1e-4) {
        return;
      }

      const unitPx = VIEWPORT_UNIT_PX * zoom;
      const docBefore = computeViewportDocument(baseViewBox, zoom, {
        w: viewport.clientWidth,
        h: viewport.clientHeight,
      });
      const docX = (viewport.scrollLeft + ratioX * viewport.clientWidth - docBefore.marginX) / unitPx;
      const docY = (viewport.scrollTop + ratioY * viewport.clientHeight - docBefore.marginY) / unitPx;

      setZoom(nextZoom);

      requestAnimationFrame(() => {
        const viewportEl = viewportRef.current;
        if (!viewportEl) {
          return;
        }
        const nextUnitPx = VIEWPORT_UNIT_PX * nextZoom;
        const docAfter = computeViewportDocument(baseViewBox, nextZoom, {
          w: viewportEl.clientWidth,
          h: viewportEl.clientHeight,
        });
        viewportEl.scrollLeft = Math.max(
          0,
          docX * nextUnitPx + docAfter.marginX - ratioX * viewportEl.clientWidth
        );
        viewportEl.scrollTop = Math.max(
          0,
          docY * nextUnitPx + docAfter.marginY - ratioY * viewportEl.clientHeight
        );
        setViewOffset({ x: viewportEl.scrollLeft, y: viewportEl.scrollTop });
      });
    },
    [zoom, baseViewBox]
  );

  const handleViewportScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    setViewOffset({ x: viewport.scrollLeft, y: viewport.scrollTop });
  }, []);

  const handleDropResult = useCallback(
    (result) => {
      if (result.type === "add-panel") {
        onChange(layoutPatch([...panels, result.panel]));
        return;
      }
      if (result.type === "wire") {
        let nextPanels = panels;
        if (result.rootPanelId) {
          nextPanels = panels;
        }
        onChange(
          layoutPatch(nextPanels, {
            wire: result.wire,
            powerRootId: result.rootPanelId ?? powerSettings.trianglePowerRootId,
          })
        );
        return;
      }
      if (result.type === "move-panel") {
        const nextPanels = moveTrianglePanelWithJoin(
          panels,
          result.panelId,
          result.parentId,
          result.join
        );
        if (serializeTrianglePanels(nextPanels) === serializeTrianglePanels(panels)) {
          return;
        }
        onChange(layoutPatch(nextPanels));
      }
    },
    [layoutPatch, onChange, panels, powerSettings.trianglePowerRootId]
  );

  const {
    svgRef,
    dragState,
    validDropIds,
    beginDrag,
    handlePointerMove,
    finishDrag,
    cancelDrag,
  } = useTriangleLayoutDrag({
    preview,
    panels,
    wire,
    powerRootId: powerSettings.trianglePowerRootId,
    onDropResult: handleDropResult,
    onDropRejected: ({ reason, dropTarget }) => {
      if (reason === "join-blocked") {
        toastPanelAddBlockedOverlap();
      } else {
        toastPanelAddBlocked();
      }
    },
    getGhostDesiredDirection: () => newPanelDirection || "auto",
  });

  useEffect(() => {
    const viewportEl = viewportRef.current;
    if (!viewportEl) {
      return undefined;
    }
    const handleWheel = (event) => {
      event.preventDefault();
      const rect = viewportEl.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const ratioX = (event.clientX - rect.left) / rect.width;
      const ratioY = (event.clientY - rect.top) / rect.height;
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAt(factor, ratioX, ratioY);
    };
    viewportEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewportEl.removeEventListener("wheel", handleWheel);
  }, [zoomAt]);

  const panStateRef = useRef(null);
  const panMovedRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const previewHex = ensureHex(settings?.hex);
  const brightness = settings?.brightness ?? 100;
  const isPaintMode = settings?.colorMode === COLOR_MODES.LEDS;
  const ledCount = summary.ledCount;

  const handleEditorModeChange = useCallback(
    (value) => {
      const nextMode = value === "paint" ? COLOR_MODES.LEDS : COLOR_MODES.SINGLE;
      const patch = buildModeSwitchPatch(settings, nextMode, { ledCount });
      if (Object.keys(patch).length) {
        onChange(patch);
      }
    },
    [ledCount, onChange, settings]
  );

  const handleSelectLed = useCallback(
    (index) => {
      const patch = buildLedSelectionPatch(settings, ledCount, index);
      onChange({ ...patch, colorMode: COLOR_MODES.LEDS });
    },
    [ledCount, onChange, settings]
  );

  const handleSelectLeds = useCallback(
    (indices) => {
      const patch = buildLedsSelectionPatch(settings, ledCount, indices, device?.deviceModel);
      if (patch) {
        onChange({ ...patch, colorMode: COLOR_MODES.LEDS });
      }
    },
    [device?.deviceModel, ledCount, onChange, settings]
  );

  const handleClearLedSelection = useCallback(() => {
    onChange(buildLedClearSelectionPatch());
  }, [onChange]);

  const handleSelectPanel = useCallback((panelId) => {
    if (panMovedRef.current) {
      panMovedRef.current = false;
      return;
    }
    setSelectedPanelId(panelId);
  }, []);

  const handleCanvasPointerDown = useCallback(
    (event) => {
      const isMiddle = event.button === 1;
      const isAltLeft = event.button === 0 && event.altKey;
      const isEmptyDrag = canPanFromPointerDown(
        event,
        svgRef.current,
        preview.triangles,
        compact
      );
      if (!isMiddle && !isAltLeft && !isEmptyDrag) {
        return;
      }
      if (isMiddle || isAltLeft) {
        event.preventDefault();
        event.stopPropagation();
      }
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // ignore
      }
      const viewport = viewportRef.current;
      panStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startScrollLeft: viewport?.scrollLeft ?? 0,
        startScrollTop: viewport?.scrollTop ?? 0,
        moved: false,
        clearSelectionOnUp: isPaintMode && isEmptyDrag && event.button === 0 && !isAltLeft,
      };
      setIsPanning(true);
    },
    [compact, isPaintMode, preview.triangles, svgRef]
  );

  useEffect(() => {
    if (!isPanning) {
      return undefined;
    }
    const handleMove = (event) => {
      const pan = panStateRef.current;
      const viewport = viewportRef.current;
      if (!pan || pan.pointerId !== event.pointerId || !viewport) {
        return;
      }
      const dx = event.clientX - pan.startClientX;
      const dy = event.clientY - pan.startClientY;
      if (!pan.moved && Math.hypot(dx, dy) >= PAN_DRAG_THRESHOLD) {
        pan.moved = true;
      }
      viewport.scrollLeft = pan.startScrollLeft - dx;
      viewport.scrollTop = pan.startScrollTop - dy;
      setViewOffset({ x: viewport.scrollLeft, y: viewport.scrollTop });
    };
    const handleUp = (event) => {
      const pan = panStateRef.current;
      if (pan && (pan.pointerId === event.pointerId || event.type === "pointercancel")) {
        if (pan.moved) {
          panMovedRef.current = true;
        } else if (pan.clearSelectionOnUp) {
          handleClearLedSelection();
        }
        panStateRef.current = null;
        setIsPanning(false);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [handleClearLedSelection, isPanning, svgRef]);

  const applyWire = (nextWire) => {
    onChange(layoutPatch(panels, { wire: nextWire }));
  };

  const handleRotatePanel = useCallback(
    (deltaDeg) => {
      if (!selectedPanelId) {
        return;
      }
      const nextPanels = rotatePanelJoin(panels, selectedPanelId, deltaDeg);
      if (serializeTrianglePanels(nextPanels) === serializeTrianglePanels(panels)) {
        toastPanelRotateBlocked();
        return;
      }
      onChange(layoutPatch(nextPanels));
    },
    [layoutPatch, onChange, panels, selectedPanelId]
  );

  const handleTogglePowerLink = useCallback(
    (connection) => {
      const candidate = {
        panelA: connection.panelAId,
        panelB: connection.panelBId,
        edgeA: connection.edgeA,
        edgeB: connection.edgeB,
      };
      const result = toggleTriangleActiveLink(
        panels,
        powerSettings.triangleActiveLinks,
        candidate,
        !connection.isActive
      );
      if (!result.success) {
        if (result.reason === "loop") {
          toastPowerLoopBlocked();
        }
        return;
      }
      onChange(layoutPatch(panels, { activeLinks: result.links }));
    },
    [layoutPatch, onChange, panels, powerSettings.triangleActiveLinks]
  );

  const handleAddPowerInjector = useCallback(
    (panelId, edgeIndex) => {
      const nextInjectors = addTrianglePowerInjector(
        panels,
        powerSettings.trianglePowerInjectors,
        panelId,
        edgeIndex
      );
      onChange(layoutPatch(panels, { injectors: nextInjectors }));
    },
    [layoutPatch, onChange, panels, powerSettings.trianglePowerInjectors]
  );

  const handleRemovePowerInjector = useCallback(
    (injectorId) => {
      const nextInjectors = removeTrianglePowerInjector(
        panels,
        powerSettings.trianglePowerInjectors,
        injectorId
      );
      onChange(layoutPatch(panels, { injectors: nextInjectors }));
    },
    [layoutPatch, onChange, panels, powerSettings.trianglePowerInjectors]
  );

  const branchLimitWarnedRef = useRef(false);
  useEffect(() => {
    if (summary.powerSummary?.hasVoltageWarning) {
      if (!branchLimitWarnedRef.current) {
        toastPowerBranchLimit();
        branchLimitWarnedRef.current = true;
      }
    } else {
      branchLimitWarnedRef.current = false;
    }
  }, [summary.powerSummary?.hasVoltageWarning]);

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) || null;
  const canRotateSelected = Boolean(
    selectedPanel && (!selectedPanel.parentId || selectedPanel.join)
  );
  const canFlipSelected =
    selectedPanel?.join?.type === TRIANGLE_JOIN_TYPES.EDGE_EDGE ||
    (selectedPanel && !selectedPanel.parentId);
  const canDeleteSelected = selectedPanelId && panels[0]?.id !== selectedPanelId;

  const handleBeginInletDrag = useCallback(
    (event) => {
      beginDrag(event, { kind: "controller" });
    },
    [beginDrag]
  );

  const handleBeginGhostDrag = (event) => {
    beginDrag(event, {
      kind: "ghost-panel",
      desiredDirection: newPanelDirection,
    });
  };

  const enrichDragSource = (source, dragStateValue) => {
    if (!dragStateValue || !source) {
      return source;
    }
    const x = dragStateValue.x ?? 0;
    const y = dragStateValue.y ?? 0;
    const hoveredTarget = dragStateValue.hoveredTarget;

    if (source.kind === "ghost-panel") {
      const desiredDirection = newPanelDirection || source.desiredDirection || "auto";
      let ghostPoints = ghostPanelPointsAtCursor(preview, x, y, desiredDirection);
      if (hoveredTarget?.kind === "anchor") {
        const parentId = hoveredTarget.parentPanelId || hoveredTarget.panelId;
        const join = resolveSmartPanelJoin({
          parentPanelId: parentId,
          parentAnchor: {
            kind: hoveredTarget.anchorKind,
            index: hoveredTarget.anchorIndex,
            t: hoveredTarget.t,
          },
          panels,
          desiredDirection,
        });
        if (join) {
          const previewTriangle = buildTrianglePanelPreview(
            [...panels, createJoinedPanel(parentId, join, "__preview__")],
            { includeSlots: false }
          ).triangles.find((triangle) => !triangle.slot && triangle.panelId === "__preview__");
          if (previewTriangle?.points) {
            ghostPoints = previewTriangle.points;
          }
        }
      }
      const labelPos = joinLabelPositionForHover(hoveredTarget, x, y);
      return {
        ...source,
        x,
        y,
        ghostPoints,
        joinLabel: joinLabelForHover(hoveredTarget, {
          panels,
          desiredDirection,
        }),
        joinLabelX: labelPos.x,
        joinLabelY: labelPos.y,
      };
    }

    if (source.kind === "panel" && source.triangle?.points) {
      const startX = source.startSvgX ?? source.triangle.cx ?? x;
      const startY = source.startSvgY ?? source.triangle.cy ?? y;
      const labelPos = joinLabelPositionForHover(hoveredTarget, x, y);
      return {
        ...source,
        x,
        y,
        ghostPoints: translatePolygonPoints(
          source.triangle.points,
          x - startX,
          y - startY
        ),
        joinLabel: joinLabelForHover(hoveredTarget, { panels }),
        joinLabelX: labelPos.x,
        joinLabelY: labelPos.y,
      };
    }

    if (source.kind === "join-anchor") {
      const labelPos = joinLabelPositionForHover(hoveredTarget, source.x ?? x, source.y ?? y);
      const sourceAnchor = {
        kind: source.anchorKind,
        index: source.anchorIndex ?? 0,
        t: source.t,
      };
      return {
        ...source,
        joinLabel: joinLabelForExactJoin(hoveredTarget, sourceAnchor),
        joinLabelX: labelPos.x,
        joinLabelY: labelPos.y,
      };
    }

    return source;
  };

  return (
    <div
      className={[
        "external-triangle-layout-editor",
        fillHeight ? "external-triangle-layout-editor--fill" : "",
        compact ? "external-triangle-layout-editor--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="external-triangle-layout-editor__smart-bar">
        <div className="external-triangle-layout-editor__smart-bar-row">
          <div className="external-triangle-layout-editor__steps">
            <span
              className={[
                "external-triangle-layout-editor__step",
                summary.step === "build" ? "external-triangle-layout-editor__step--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              1 · Build
            </span>
            <IconArrowRight size={12} className="external-triangle-layout-editor__step-arrow" />
            <span
              className={[
                "external-triangle-layout-editor__step",
                summary.step === "wire" ? "external-triangle-layout-editor__step--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              2 · Wire
            </span>
          </div>

          <Group gap={4} wrap="nowrap" className="external-triangle-layout-editor__stats">
            <Badge size="xs" variant="light" color="violet">
              {summary.panelCount}△
            </Badge>
            <Badge size="xs" variant="light" color="grape">
              {summary.ledCount} LED
            </Badge>
            {summary.graph?.isConnected === false ? (
              <Badge size="xs" variant="light" color="red">
                Off
              </Badge>
            ) : null}
            {summary.graph?.junctions?.length ? (
              <Badge size="xs" variant="light" color="orange">
                Branch
              </Badge>
            ) : null}
            <Badge size="xs" variant="light" color={summary.powerSummary?.idleCount ? "gray" : "teal"}>
              Powered {summary.powerSummary?.poweredCount ?? 0}/{summary.panelCount}
            </Badge>
            {summary.powerSummary?.idleCount ? (
              <Badge size="xs" variant="light" color="gray">
                Idle {summary.powerSummary.idleCount}
              </Badge>
            ) : null}
            {summary.powerSummary?.hasVoltageWarning ? (
              <Badge size="xs" variant="light" color="red">
                Branch limit
              </Badge>
            ) : null}
            {summary.hasOverlap ? (
              <Badge size="xs" variant="light" color="red">
                Overlap
              </Badge>
            ) : null}
          </Group>

          {!isPaintMode ? (
          <Group gap={6} wrap="nowrap" className="external-triangle-layout-editor__wire-controls">
            <Text size="xs" c="dimmed" className="external-triangle-layout-editor__wire-summary">
              <Text span fw={600} c="teal">
                {summary.originLabel}
              </Text>
              <Text span c="dimmed">
                {" · "}
                {summary.directionLabel}
              </Text>
            </Text>
            <Tooltip label="Reverse LED flow on root panel">
              <ActionIcon
                size="sm"
                variant="light"
                color="teal"
                onClick={() => applyWire(toggleTriangleWireDirection(wire))}
                aria-label="Flip flow"
              >
                <IconRotate2 size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Drag IN onto any LED corner or C/E anchor on the canvas">
              <Button
                size="compact-xs"
                variant="light"
                color="teal"
                className="external-triangle-layout-editor__inlet-chip"
                leftSection={<IconPlugConnected size={14} />}
                onPointerDown={handleBeginInletDrag}
              >
                IN
              </Button>
            </Tooltip>
          </Group>
          ) : null}
        </div>
      </div>

      <div
        className={[
          "external-triangle-layout-editor__canvas",
          compact ? "external-triangle-layout-editor__canvas--compact" : "",
          dragState?.active ? "external-triangle-layout-editor__canvas--dragging" : "",
          isPaintMode ? "external-triangle-layout-editor__canvas--paint-mode" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="external-triangle-layout-editor__canvas-toolbar">
          <SegmentedControl
            size="xs"
            value={isPaintMode ? "paint" : "layout"}
            onChange={handleEditorModeChange}
            data={[
              {
                value: "layout",
                label: (
                  <Group gap={6} wrap="nowrap" justify="center">
                    <IconLayoutGrid size={14} />
                    <span>Layout</span>
                  </Group>
                ),
              },
              {
                value: "paint",
                label: (
                  <Group gap={6} wrap="nowrap" justify="center">
                    <IconBrush size={14} />
                    <span>Chỉnh màu LED</span>
                  </Group>
                ),
              },
            ]}
          />
          {!isPaintMode ? (
          <>
          <Group gap={6} wrap="nowrap">
            <Tooltip label="Drag onto a corner or edge anchor to add a panel">
              <Button
                size="compact-xs"
                variant="light"
                color="violet"
                leftSection={<IconPlus size={14} />}
                disabled={summary.atMax}
                onPointerDown={handleBeginGhostDrag}
              >
                Panel
              </Button>
            </Tooltip>
            <Select
              size="xs"
              w={140}
              value={newPanelDirection}
              onChange={(value) => setNewPanelDirection(value || "auto")}
              data={DIRECTION_OPTIONS}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              leftSection={<DirectionGlyph direction={newPanelDirection} size={14} />}
              leftSectionWidth={26}
              renderOption={({ option, checked }) => (
                <Group gap={8} wrap="nowrap" align="center">
                  <DirectionGlyph direction={option.value} size={14} />
                  <span>{option.label}</span>
                  {checked ? (
                    <span className="external-triangle-layout-editor__direction-check">●</span>
                  ) : null}
                </Group>
              )}
            />
          </Group>
          <Group gap={4} wrap="nowrap">
            <Tooltip
              label={
                !hasActivePowerFlow
                  ? "Enable red power linkers between panels first"
                  : showPowerFlowAnimation
                    ? "Hide power flow preview"
                    : "Preview power flow (animated)"
              }
            >
              <ActionIcon
                size="sm"
                variant={showPowerFlowAnimation ? "filled" : "light"}
                color="red"
                disabled={!hasActivePowerFlow}
                aria-pressed={showPowerFlowAnimation}
                onClick={() => setShowPowerFlowAnimation((current) => !current)}
              >
                <IconBolt size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {selectedPanel ? (
            <Group gap={4} className="external-triangle-layout-editor__panel-actions">
              <Tooltip label="Rotate −60°">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="teal"
                  disabled={!canRotateSelected}
                  onClick={() => handleRotatePanel(-60)}
                >
                  <IconRotate2 size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Rotate +60°">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="teal"
                  disabled={!canRotateSelected}
                  onClick={() => handleRotatePanel(60)}
                >
                  <IconRotateClockwise size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Flip join anchor">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="violet"
                  disabled={!canFlipSelected}
                  onClick={() => onChange(layoutPatch(flipPanelJoin(panels, selectedPanelId)))}
                >
                  <IconFlipVertical size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Set this panel as power root (Root_Node)">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="grape"
                  disabled={!selectedPanelId || powerSettings.trianglePowerRootId === selectedPanelId}
                  onClick={() =>
                    onChange(layoutPatch(panels, { powerRootId: selectedPanelId }))
                  }
                >
                  <IconBolt size={14} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Remove panel and its children">
                <ActionIcon
                  size="sm"
                  variant="light"
                  color="red"
                  disabled={!canDeleteSelected}
                  onClick={() => {
                    onChange(layoutPatch(removeTrianglePanelById(panels, selectedPanelId)));
                    setSelectedPanelId(null);
                  }}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : (
            <Text size="xs" c="dimmed">
              Click a panel to select
            </Text>
          )}
          </>
          ) : (
            <Text size="xs" c="dimmed" className="external-triangle-layout-editor__paint-hint">
              Click an LED to select · Shift+click to add · empty click clears
            </Text>
          )}
          <Group gap={4} className="external-triangle-layout-editor__zoom-controls" wrap="nowrap">
            <Tooltip label="Zoom out (scroll down)">
              <ActionIcon
                size="sm"
                variant="light"
                color="gray"
                onClick={() => zoomAt(1 / ZOOM_STEP)}
                disabled={zoom <= ZOOM_MIN + 1e-3}
              >
                <IconZoomOut size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Reset view · Drag empty area, scrollbars, or Alt/middle-button to pan">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<IconZoomReset size={14} />}
                onClick={resetView}
                disabled={isDefaultView}
              >
                {Math.round(zoom * 100)}%
              </Button>
            </Tooltip>
            <Tooltip label="Zoom in (scroll up)">
              <ActionIcon
                size="sm"
                variant="light"
                color="gray"
                onClick={() => zoomAt(ZOOM_STEP)}
                disabled={zoom >= ZOOM_MAX - 1e-3}
              >
                <IconZoomIn size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>

        <div
          ref={viewportRef}
          className={[
            "external-triangle-layout-editor__viewport",
            compact ? "external-triangle-layout-editor__viewport--compact" : "",
            isPanning ? "external-triangle-layout-editor__viewport--panning" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            compact
              ? { height: VIEWPORT_HEIGHT_COMPACT }
              : fillHeight
                ? undefined
                : { height: VIEWPORT_HEIGHT }
          }
          onScroll={handleViewportScroll}
          onPointerDown={handleCanvasPointerDown}
          onAuxClick={(event) => event.preventDefault()}
          onContextMenu={(event) => {
            if (event.shiftKey) {
              event.preventDefault();
            }
          }}
        >
          <div
            className="external-triangle-layout-editor__viewport-content"
            style={{
              width: contentWidthPx,
              height: contentHeightPx,
            }}
          >
            <div
              className="external-triangle-layout-editor__viewport-layout"
              style={{
                left: marginX,
                top: marginY,
                width: layoutWidthPx,
                height: layoutHeightPx,
              }}
            >
              <svg
                ref={svgRef}
                viewBox={viewBoxStr}
                preserveAspectRatio="xMinYMin meet"
                className="external-triangle-layout-editor__svg"
                aria-hidden
              >
                {renderTriangleSvg({
                  preview,
                  summary,
                  settings,
                  previewHex,
                  brightness,
                  compact,
                  connections,
                  powerFlowPaths,
                  powerFlowPreview: showPowerFlowAnimation,
                  powerFlowAnimated: showPowerFlowAnimation,
                  dragState,
                  validDropIds,
                  selectedPanelId,
                  isPaintMode,
                  ledCount,
                  onSelectPanel: handleSelectPanel,
                  onSelectLed: handleSelectLed,
                  onSelectLeds: handleSelectLeds,
                  onBeginLedDrag: isPaintMode ? undefined : beginDrag,
                  onBeginControllerDrag: isPaintMode ? undefined : beginDrag,
                  onBeginPanelDrag: isPaintMode ? undefined : beginDrag,
                  onBeginJoinAnchorDrag: isPaintMode ? undefined : beginDrag,
                  onTogglePowerLink: isPaintMode ? undefined : handleTogglePowerLink,
                  onAddPowerInjector: isPaintMode ? undefined : handleAddPowerInjector,
                  onRemovePowerInjector: isPaintMode ? undefined : handleRemovePowerInjector,
                  injectors: powerSettings.trianglePowerInjectors || [],
                  onBeginGhostDrag: handleBeginGhostDrag,
                  onPointerMove: handlePointerMove,
                  onPointerUp: finishDrag,
                  onPointerCancel: cancelDrag,
                  onToggleDirection: () => applyWire(toggleTriangleWireDirection(wire)),
                  dragSource: enrichDragSource(dragState?.source, dragState),
                  panelTransforms,
                })}
              </svg>
            </div>
          </div>
        </div>

        <div className="external-triangle-layout-editor__canvas-legend">
          <span className="external-triangle-layout-editor__legend-chip">
            Click red/gray shared edge to toggle power linker
          </span>
          <span className="external-triangle-layout-editor__legend-chip">
            <IconBolt size={12} style={{ verticalAlign: -2 }} />
            Toolbar bolt — moving arrows along power branches
          </span>
          <span className="external-triangle-layout-editor__legend-chip">
            <span className="external-triangle-layout-editor__legend-dot external-triangle-layout-editor__legend-dot--linker-active" />
            Active linker (power ON)
          </span>
          <span className="external-triangle-layout-editor__legend-chip">
            <span className="external-triangle-layout-editor__legend-dot external-triangle-layout-editor__legend-dot--linker-idle" />
            Inactive linker
          </span>
          <span className="external-triangle-layout-editor__legend-chip">
            <span className="external-triangle-layout-editor__legend-dot external-triangle-layout-editor__legend-dot--panel-idle" />
            Panel without power
          </span>
          <span className="external-triangle-layout-editor__legend-chip">
            Drag IN chip to any powered panel corner / C/E anchor
          </span>
        </div>
      </div>

      {showLegend ? (
        <div className="external-triangle-layout-editor__preset-block">
          <Text size="xs" fw={600} mb={6}>
            Quick shapes
          </Text>
          <Group gap={6}>
            {TRIANGLE_LAYOUT_PRESETS.map((preset) => {
              const active = summary.matchingPresetLabel === preset.label;
              return (
                <Button
                  key={preset.label}
                  size="compact-xs"
                  variant={active ? "filled" : "light"}
                  color={active ? "teal" : "violet"}
                  onClick={() => onChange(layoutPatch(preset.panels))}
                >
                  {preset.label}
                </Button>
              );
            })}
          </Group>
        </div>
      ) : null}
    </div>
  );
}

export function ExternalTriangleLayoutPreview({
  device,
  settings,
  connected = false,
  ledOn = true,
  compact = false,
}) {
  const panels = resolveTrianglePanels(device);
  const wire = resolveTriangleWire(device);
  const powerSettings = resolveTrianglePowerSettings(device);
  const summary = useMemo(
    () => summarizeTriangleLayoutEditor(panels, wire, powerSettings),
    [panels, wire, powerSettings]
  );
  const preview = useMemo(
    () =>
      buildTrianglePanelPreview(panels, {
        wire,
        powerRootId: powerSettings.trianglePowerRootId,
        activeLinks: powerSettings.triangleActiveLinks,
        injectors: powerSettings.trianglePowerInjectors,
      }),
    [panels, wire, powerSettings]
  );
  const connections = useMemo(() => buildTrianglePanelConnections(preview), [preview]);
  const powerFlowPaths = useMemo(() => buildTrianglePowerFlowPaths(preview), [preview]);
  const previewHex = connected && !ledOn ? "#1a1d24" : ensureHex(settings?.hex);
  const brightness = connected && !ledOn ? 100 : settings?.brightness ?? 100;

  return (
    <svg
      viewBox={preview.viewBox}
      className={`external-triangle-layout-editor__svg${compact ? " external-triangle-layout-editor__svg--compact" : ""}`}
      aria-hidden
    >
      {renderTriangleSvg({
        preview,
        summary,
        settings,
        previewHex,
        brightness,
        compact,
        connections,
        powerFlowPaths,
        powerFlowPreview: powerFlowPaths.length > 0,
        powerFlowAnimated: false,
        dragState: null,
        validDropIds: new Set(),
        selectedPanelId: null,
        injectors: powerSettings.trianglePowerInjectors || [],
      })}
    </svg>
  );
}
