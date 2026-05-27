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
  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const pendingRef = useRef(savedValue);

  const commit = useCallback(
    (nextRaw) => {
      const next = clampSliderValue(nextRaw, min, max);
      draggingRef.current = false;
      setIsDragging(false);
      pendingRef.current = next;
      setLiveValue(next);
      onLiveChange?.(next);
      onPreview?.(next);
      onChange?.(next);
    },
    [min, max, onChange, onLiveChange, onPreview]
  );

  useEffect(() => {
    if (draggingRef.current) {
      return;
    }
    pendingRef.current = savedValue;
    setLiveValue(savedValue);
    onLiveChange?.(savedValue);
  }, [savedValue, onLiveChange]);

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
    };
  }, [commit]);

  const beginDrag = useCallback(() => {
    if (disabled) {
      return;
    }
    draggingRef.current = true;
    setIsDragging(true);
  }, [disabled]);

  return (
    <div
      className={`app-slider${isDragging ? " app-slider--dragging" : ""}`}
      onPointerDown={beginDrag}
    >
      <Slider
        value={liveValue}
        onChange={(next) => {
          beginDrag();
          pendingRef.current = next;
          setLiveValue(next);
          onLiveChange?.(next);
          onPreview?.(next);
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
