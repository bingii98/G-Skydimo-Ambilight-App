import { useEffect, useRef, useState } from "react";
import {
  ANIMATION_TICK_MS,
  buildAnimationPixels,
  isValidAnimationId,
  pixelsToLedHexes,
} from "../lib/animations";
import { resolveAnimationSettings } from "../lib/animationTuningLive";

export function useAnimationPreview({ enabled, animationId, settings, ledCount, deviceModel = null }) {
  const [ledColors, setLedColors] = useState([]);
  const startRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!enabled || !isValidAnimationId(animationId) || !ledCount) {
      setLedColors([]);
      return undefined;
    }

    const pushFrame = (elapsed) => {
      const pixels = buildAnimationPixels({
        animationId,
        ledCount,
        settings: resolveAnimationSettings(settings),
        timeMs: elapsed,
        deviceModel,
      });
      setLedColors(pixelsToLedHexes(pixels, ledCount));
    };

    startRef.current = performance.now();
    pushFrame(0);

    let lastTick = 0;

    const tick = (now) => {
      if (now - lastTick >= ANIMATION_TICK_MS) {
        lastTick = now;
        pushFrame(now - startRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    enabled,
    animationId,
    ledCount,
    settings?.animationReverse,
    settings?.stripOrigin,
    settings?.stripDirection,
    settings?.stripCounts,
    settings?.hex,
    settings?.animationSecondaryHex,
    settings?.animationColorStops,
    settings?.animationColorsById,
    settings?.brightness,
    deviceModel,
  ]);

  return ledColors;
}
