import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTriangleDragTargets,
  buildPanelDepthById,
  clientPointToSvg,
  findNearestDragTarget,
  getValidDropTargets,
  isValidDrop,
  resolveDragDrop,
  snapRadiusForDragSource,
} from "../lib/externalTriangleDrag";

const DRAG_THRESHOLD = 4;
const DEFAULT_SNAP_RADIUS = 7;

export function useTriangleLayoutDrag({
  preview,
  panels,
  wire,
  powerRootId = null,
  onDropResult,
  onDropRejected,
  getGhostDesiredDirection,
}) {
  const svgRef = useRef(null);
  const pointerRef = useRef(null);
  const [dragState, setDragState] = useState(null);

  const targets = useMemo(
    () => buildTriangleDragTargets(preview, panels),
    [preview, panels]
  );
  const panelDepthById = useMemo(() => buildPanelDepthById(panels), [panels]);

  const validDropTargets = useMemo(() => {
    if (!dragState?.source) {
      return [];
    }
    return getValidDropTargets(dragState.source, targets, panels);
  }, [dragState?.source, targets, panels]);

  const validDropIds = useMemo(
    () => new Set(validDropTargets.map((target) => target.id)),
    [validDropTargets]
  );

  const resetDrag = useCallback(() => {
    pointerRef.current = null;
    setDragState(null);
  }, []);

  const updatePointer = useCallback(
    (clientX, clientY) => {
      const svgPoint = clientPointToSvg(svgRef.current, clientX, clientY);
      setDragState((current) => {
        if (!current?.source) {
          return current;
        }
        const validTargets = getValidDropTargets(current.source, targets, panels);
        const snapPool = validTargets.length ? validTargets : targets;
        const snapRadius = snapRadiusForDragSource(current.source);
        const hoveredTarget = findNearestDragTarget(
          svgPoint.x,
          svgPoint.y,
          snapPool,
          snapRadius,
          panelDepthById,
          current.source
        );
        return {
          ...current,
          x: svgPoint.x,
          y: svgPoint.y,
          hoveredTarget,
        };
      });
    },
    [panels, panelDepthById, targets]
  );

  const beginDrag = useCallback((event, source) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      if (event.currentTarget?.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    } catch {
      // Ignore — some elements (Mantine Button) may not support pointer capture cleanly
    }

    const svgPoint = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
    const isGhostSource = source?.kind === "ghost-panel";
    pointerRef.current = {
      pointerId: event.pointerId,
      source,
      startX: event.clientX,
      startY: event.clientY,
      startSvgX: svgPoint.x,
      startSvgY: svgPoint.y,
      active: isGhostSource,
      capturedTarget: event.currentTarget,
    };
    setDragState({
      source:
        source.kind === "panel"
          ? { ...source, startSvgX: svgPoint.x, startSvgY: svgPoint.y }
          : source,
      x: svgPoint.x,
      y: svgPoint.y,
      hoveredTarget: findNearestDragTarget(
        svgPoint.x,
        svgPoint.y,
        targets,
        DEFAULT_SNAP_RADIUS,
        panelDepthById,
        source
      ),
      active: isGhostSource,
    });
  }, [targets, panelDepthById]);

  const handlePointerMove = useCallback(
    (event) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) {
        return;
      }

      const distance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
      if (!pointer.active && distance >= DRAG_THRESHOLD) {
        pointer.active = true;
        setDragState((current) => (current ? { ...current, active: true } : current));
      }

      if (pointer.active) {
        updatePointer(event.clientX, event.clientY);
      }
    },
    [updatePointer]
  );

  const finishDrag = useCallback(
    (event) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) {
        return;
      }

      try {
        if (
          pointer.capturedTarget?.hasPointerCapture &&
          pointer.capturedTarget.hasPointerCapture(event.pointerId)
        ) {
          pointer.capturedTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      const wasActive = pointer.active;
      let source = pointer.source;
      if (source?.kind === "ghost-panel") {
        source = {
          ...source,
          desiredDirection: getGhostDesiredDirection?.() ?? source.desiredDirection ?? "auto",
        };
      }
      resetDrag();

      if (!wasActive) {
        return;
      }

      const svgPoint = clientPointToSvg(svgRef.current, event.clientX, event.clientY);
      const validTargets = getValidDropTargets(source, targets, panels);
      const snapRadius = snapRadiusForDragSource(source);
      const dropTarget = findNearestDragTarget(
        svgPoint.x,
        svgPoint.y,
        validTargets,
        snapRadius,
        panelDepthById,
        source
      );
      if (!dropTarget || !isValidDrop(source, dropTarget, panels)) {
        if (source?.kind === "ghost-panel") {
          onDropRejected?.({ reason: "invalid-target", source, dropTarget });
        }
        return;
      }

      const result = resolveDragDrop(source, dropTarget, wire, panels, powerRootId);
      if (result) {
        onDropResult?.(result);
      } else if (source?.kind === "ghost-panel") {
        onDropRejected?.({ reason: "join-blocked", source, dropTarget });
      }
    },
    [getGhostDesiredDirection, onDropRejected, onDropResult, panelDepthById, panels, powerRootId, resetDrag, targets, wire]
  );

  const cancelDrag = useCallback(() => {
    resetDrag();
  }, [resetDrag]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handleWindowPointerMove = (event) => {
      if (pointerRef.current?.pointerId === event.pointerId) {
        handlePointerMove(event);
      }
    };

    const handleWindowPointerUp = (event) => {
      if (pointerRef.current?.pointerId === event.pointerId) {
        finishDrag(event);
      }
    };

    const handleWindowPointerCancel = () => {
      cancelDrag();
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerCancel);
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerCancel);
    };
  }, [dragState, handlePointerMove, finishDrag, cancelDrag]);

  return {
    svgRef,
    dragState,
    validDropIds,
    beginDrag,
    handlePointerMove,
    finishDrag,
    cancelDrag,
  };
}
