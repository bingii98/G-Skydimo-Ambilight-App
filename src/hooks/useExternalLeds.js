import { useCallback, useEffect, useState } from "react";
import { skydimo } from "../lib/skydimoApi";

export function useExternalLeds() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(skydimo.getExternalState?.())
      .then((next) => {
        if (!cancelled && next) {
          setState(next);
        }
      })
      .catch(() => {});

    const unsubscribe = skydimo.onExternalStateChange?.((next) => {
      setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const scan = useCallback(async () => skydimo.externalScan?.(), []);
  const stopScan = useCallback(async () => skydimo.externalStopScan?.(), []);
  const connect = useCallback(async (deviceId) => skydimo.externalConnect?.(deviceId), []);
  const disconnect = useCallback(async (deviceId) => skydimo.externalDisconnect?.(deviceId), []);
  const setColor = useCallback(
    async (deviceId, red, green, blue, brightness) =>
      skydimo.externalSetColor?.(deviceId, red, green, blue, brightness),
    []
  );
  const setPixels = useCallback(
    async (deviceId, pixels, brightness) =>
      skydimo.externalSetPixels?.(deviceId, pixels, brightness),
    []
  );
  const setPower = useCallback(
    async (deviceId, poweredOn) => skydimo.externalSetPower?.(deviceId, poweredOn),
    []
  );
  const setAnimation = useCallback(
    async (deviceId, mode, speed) => skydimo.externalSetAnimation?.(deviceId, mode, speed),
    []
  );
  const setBrightness = useCallback(
    async (deviceId, brightness) => skydimo.externalSetBrightness?.(deviceId, brightness),
    []
  );
  const registerSaved = useCallback(
    async (deviceIds) => skydimo.externalRegisterSaved?.(deviceIds),
    []
  );

  return {
    state,
    scan,
    stopScan,
    connect,
    disconnect,
    setColor,
    setPixels,
    setPower,
    setAnimation,
    setBrightness,
    registerSaved,
  };
}
