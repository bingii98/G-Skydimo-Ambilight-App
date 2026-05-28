import { useCallback, useEffect, useRef, useState } from "react";
import { Slider } from "@mantine/core";

export const appSliderTuningClassNames = {
  track: "animation-tuning__track",
  bar: "animation-tuning__bar",
  thumb: "animation-tuning__thumb",
};

export const appSliderBrightnessClassNames = {
  bar: "brightness-block__bar",
  thumb: "brightness-block__thumb",
};

function clampSliderValue(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || min)));
}

export function AppSlider({
  value,
  onChange,
  onPreview,
  onLiveChange,
  min = 0,
  max = 100,
  step = 1,
  size = "md",
  color,
  classNames,
  disabled,
  ...rest
}) {
  const savedValue = clampSliderValue(value, min, max);
  const [liveValue, setLiveValue] = useState(savedValue);
  const draggingRef = useRef(false);
  const pendingRef = useRef(savedValue);
  const rootRef = useRef(null);
  const previewFrameRef = useRef(null);

  const setDragging = useCallback((dragging) => {
    draggingRef.current = dragging;
    rootRef.current?.classList.toggle("app-slider--dragging", dragging);
  }, []);

  const emitPreview = useCallback(
    (next) => {
      onPreview?.(next);
      onLiveChange?.(next);
    },
    [onLiveChange, onPreview]
  );

  const schedulePreview = useCallback(
    (next) => {
      if (previewFrameRef.current != null) {
        return;
      }

      previewFrameRef.current = requestAnimationFrame(() => {
        previewFrameRef.current = null;
        emitPreview(pendingRef.current);
      });
    },
    [emitPreview]
  );

  const commit = useCallback(
    (nextRaw) => {
      if (previewFrameRef.current != null) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }

      const next = clampSliderValue(nextRaw, min, max);
      setDragging(false);
      pendingRef.current = next;
      setLiveValue(next);
      emitPreview(next);
      onChange?.(next);
    },
    [emitPreview, min, max, onChange, setDragging]
  );

  useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    pendingRef.current = savedValue;
    setLiveValue(savedValue);
  }, [savedValue]);

  useEffect(() => {
    const finishDrag = () => {
      if (!draggingRef.current) {
        return;
      }
      commit(pendingRef.current);
    };

    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("mouseup", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("mouseup", finishDrag);
      if (previewFrameRef.current != null) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
    };
  }, [commit]);

  const beginDrag = useCallback(() => {
    if (disabled || draggingRef.current) {
      return;
    }
    setDragging(true);
  }, [disabled, setDragging]);

  return (
    <div
      ref={rootRef}
      className="app-slider"
      onPointerDown={beginDrag}
    >
      <Slider
        value={liveValue}
        onChange={(next) => {
          beginDrag();
          pendingRef.current = next;
          setLiveValue(next);
          schedulePreview(next);
        }}
        onChangeEnd={(next) => {
          pendingRef.current = next;
          commit(next);
        }}
        min={min}
        max={max}
        step={step}
        size={size}
        color={color}
        disabled={disabled}
        classNames={{
          ...classNames,
          root: [classNames?.root, "app-slider__control"].filter(Boolean).join(" "),
        }}
        {...rest}
      />
    </div>
  );
}
