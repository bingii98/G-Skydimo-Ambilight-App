import { memo, useCallback, useEffect, useRef } from "react";
import { IconGauge, IconSun } from "@tabler/icons-react";
import { AppSlider, appSliderTuningClassNames } from "./ui/AppSlider";
import { SectionLabel } from "./ui/AppPanel";

export const ExternalBleEffectTuningSliders = memo(function ExternalBleEffectTuningSliders({
  speed,
  brightness,
  onChange,
}) {
  const speedValueRef = useRef(null);
  const brightnessValueRef = useRef(null);

  useEffect(() => {
    if (speedValueRef.current) {
      speedValueRef.current.textContent = `${speed}%`;
    }
    if (brightnessValueRef.current) {
      brightnessValueRef.current.textContent = `${brightness}%`;
    }
  }, [speed, brightness]);

  const previewSpeed = useCallback((next) => {
    if (speedValueRef.current) {
      speedValueRef.current.textContent = `${next}%`;
    }
  }, []);

  const previewBrightness = useCallback((next) => {
    if (brightnessValueRef.current) {
      brightnessValueRef.current.textContent = `${next}%`;
    }
  }, []);

  const commitSpeed = useCallback(
    (value) => {
      onChange({ animationSpeed: value });
    },
    [onChange]
  );

  const commitBrightness = useCallback(
    (value) => {
      onChange({ brightness: value });
    },
    [onChange]
  );

  return (
    <div className="external-ble-effect-tuning">
      <div className="external-ble-effect-tuning__row">
        <SectionLabel
          icon={IconGauge}
          right={
            <span ref={speedValueRef} className="color-studio__brightness-value">
              {speed}%
            </span>
          }
        >
          Speed
        </SectionLabel>
        <div className="brightness-block external-ble-effect-tuning__block">
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
      </div>

      <div className="external-ble-effect-tuning__row">
        <SectionLabel
          icon={IconSun}
          right={
            <span ref={brightnessValueRef} className="color-studio__brightness-value">
              {brightness}%
            </span>
          }
        >
          Brightness
        </SectionLabel>
        <div className="brightness-block external-ble-effect-tuning__block">
          <AppSlider
            value={brightness}
            onPreview={previewBrightness}
            onChange={commitBrightness}
            min={1}
            max={100}
            size="md"
            classNames={appSliderTuningClassNames}
          />
        </div>
      </div>
    </div>
  );
});

export default ExternalBleEffectTuningSliders;
