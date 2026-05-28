import { memo, useCallback, useEffect, useRef } from "react";
import { patchAnimationTuningLive } from "../lib/animationTuningLive";
import { AppSlider, appSliderTuningClassNames } from "./ui/AppSlider";

export const AnimationTuningSliders = memo(function AnimationTuningSliders({
  speed,
  intensity,
  onChange,
}) {
  const speedValueRef = useRef(null);
  const intensityValueRef = useRef(null);

  useEffect(() => {
    if (speedValueRef.current) {
      speedValueRef.current.textContent = `${speed}%`;
    }
    if (intensityValueRef.current) {
      intensityValueRef.current.textContent = `${intensity}%`;
    }
  }, [speed, intensity]);

  const previewSpeed = useCallback((next) => {
    if (speedValueRef.current) {
      speedValueRef.current.textContent = `${next}%`;
    }
    patchAnimationTuningLive({ speed: next });
  }, []);

  const previewIntensity = useCallback((next) => {
    if (intensityValueRef.current) {
      intensityValueRef.current.textContent = `${next}%`;
    }
    patchAnimationTuningLive({ intensity: next });
  }, []);

  const commitSpeed = useCallback(
    (value) => {
      patchAnimationTuningLive({ speed: value });
      onChange({ animationSpeed: value });
    },
    [onChange]
  );

  const commitIntensity = useCallback(
    (value) => {
      patchAnimationTuningLive({ intensity: value });
      onChange({ animationIntensity: value });
    },
    [onChange]
  );

  return (
    <div className="animation-tuning-grid__sliders">
      <div className="animation-tuning">
        <div className="animation-tuning__header">
          <span className="animation-tuning__label">Speed</span>
          <span ref={speedValueRef} className="animation-tuning__value">
            {speed}%
          </span>
        </div>
        <AppSlider
          value={speed}
          onPreview={previewSpeed}
          onChange={commitSpeed}
          min={1}
          max={100}
          size="md"
          classNames={appSliderTuningClassNames}
        />
      </div>

      <div className="animation-tuning">
        <div className="animation-tuning__header">
          <span className="animation-tuning__label">Intensity</span>
          <span ref={intensityValueRef} className="animation-tuning__value">
            {intensity}%
          </span>
        </div>
        <AppSlider
          value={intensity}
          onPreview={previewIntensity}
          onChange={commitIntensity}
          min={1}
          max={100}
          size="md"
          classNames={appSliderTuningClassNames}
        />
      </div>
    </div>
  );
});
