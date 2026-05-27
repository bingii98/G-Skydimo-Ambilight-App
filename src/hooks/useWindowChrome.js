import { useCallback, useEffect, useState } from "react";
import { skydimo } from "../lib/skydimoApi";

export function useWindowChrome() {
  const [chrome, setChrome] = useState({ isMaximized: false, isFullScreen: false });

  useEffect(() => {
    skydimo.getWindowChrome().then(setChrome);
    return skydimo.onWindowChromeChange(setChrome);
  }, []);

  const minimize = useCallback(() => skydimo.minimizeWindow(), []);
  const toggleMaximize = useCallback(async () => {
    const next = await skydimo.toggleMaximizeWindow();
    setChrome(next);
  }, []);
  const close = useCallback(() => skydimo.closeWindow(), []);

  return {
    ...chrome,
    minimize,
    toggleMaximize,
    close,
  };
}
