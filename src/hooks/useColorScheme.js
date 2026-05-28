import { useCallback, useEffect, useMemo, useState } from "react";
import { skydimo } from "../lib/skydimoApi";
import {
  normalizeColorSchemePreference,
  readSystemDark,
  resolveColorScheme,
} from "../theme/colorScheme";

export function useColorScheme(colorSchemePreference = "system") {
  const preference = normalizeColorSchemePreference(colorSchemePreference);
  const [systemDark, setSystemDark] = useState(() => readSystemDark());

  useEffect(() => {
    let cancelled = false;

    skydimo
      .getShouldUseDarkColors?.()
      .then((value) => {
        if (!cancelled && typeof value === "boolean") {
          setSystemDark(value);
        }
      })
      .catch(() => {});

    const unsubscribeNative = skydimo.onThemeChange?.((payload) => {
      if (typeof payload?.shouldUseDarkColors === "boolean") {
        setSystemDark(payload.shouldUseDarkColors);
      }
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = (event) => {
      setSystemDark(event.matches);
    };

    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      cancelled = true;
      unsubscribeNative?.();
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  const resolvedScheme = useMemo(
    () => resolveColorScheme(preference, systemDark),
    [preference, systemDark]
  );

  const isSystemDark = useCallback(() => systemDark, [systemDark]);

  return {
    preference,
    resolvedScheme,
    systemDark,
    isSystemDark,
  };
}
