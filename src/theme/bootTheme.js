import { SETTINGS_KEY } from "../lib/constants";
import { sanitizeSettings } from "../lib/settingsSanitize";
import { resolveColorScheme, readSystemDark } from "./colorScheme";
import { applyCssVariables } from "./index.js";

export function readInitialResolvedScheme() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return resolveColorScheme("system", readSystemDark());
    }

    const parsed = JSON.parse(raw);
    const settings = sanitizeSettings(parsed);
    return resolveColorScheme(settings.colorScheme ?? "system", readSystemDark());
  } catch {
    return resolveColorScheme("system", readSystemDark());
  }
}

applyCssVariables(readInitialResolvedScheme());
