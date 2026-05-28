import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { SETTINGS_KEY } from "../lib/constants";
import { sanitizeSettings } from "../lib/settingsSanitize";
import { useColorScheme } from "../hooks/useColorScheme";
import { normalizeColorSchemePreference } from "../theme/colorScheme";
import { applyCssVariables, createMantineTheme } from "../theme";

const ThemeContext = createContext(null);

export function readInitialColorSchemePreference() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return "system";
    const parsed = JSON.parse(raw);
    const settings = sanitizeSettings(parsed);
    return normalizeColorSchemePreference(settings.colorScheme);
  } catch {
    return "system";
  }
}

export function AppThemeProvider({ children }) {
  const [colorSchemePreference, setColorSchemePreference] = useState(readInitialColorSchemePreference);
  const { resolvedScheme } = useColorScheme(colorSchemePreference);
  const theme = useMemo(() => createMantineTheme(resolvedScheme), [resolvedScheme]);

  useEffect(() => {
    applyCssVariables(resolvedScheme);
  }, [resolvedScheme]);

  const value = useMemo(
    () => ({
      resolvedScheme,
      colorSchemePreference,
      setColorSchemePreference,
    }),
    [resolvedScheme, colorSchemePreference]
  );

  return (
    <ThemeContext.Provider value={value}>
      <MantineProvider theme={theme} forceColorScheme={resolvedScheme}>
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return context;
}
