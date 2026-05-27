import { useCallback, useEffect, useState } from "react";
import { skydimo } from "../lib/skydimoApi";

export function useSkydimo() {
  const [state, setState] = useState(null);

  useEffect(() => {
    skydimo.getState().then(setState);
    return skydimo.onStateChange(setState);
  }, []);

  const scan = useCallback(() => skydimo.scan(), []);
  const connect = useCallback((port) => skydimo.connect(port), []);
  const connectBest = useCallback(() => skydimo.connectBest(), []);
  const disconnect = useCallback(() => skydimo.disconnect(), []);
  const setOptions = useCallback((options) => skydimo.setOptions(options), []);
  const setColor = useCallback((r, g, b, count) => skydimo.setColor(r, g, b, count), []);
  const setPixels = useCallback((pixels, count) => skydimo.setPixels(pixels, count), []);

  return {
    state,
    scan,
    connect,
    connectBest,
    disconnect,
    setOptions,
    setColor,
    setPixels,
  };
}
