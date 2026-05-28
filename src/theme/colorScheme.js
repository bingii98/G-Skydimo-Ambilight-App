export const COLOR_SCHEME_OPTIONS = ["system", "light", "dark"];
export const RESOLVED_COLOR_SCHEMES = ["light", "dark"];

export function readSystemDark() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function normalizeColorSchemePreference(value, fallback = "system") {
  return COLOR_SCHEME_OPTIONS.includes(value) ? value : fallback;
}

export function resolveColorScheme(preference, systemDark) {
  const normalized = normalizeColorSchemePreference(preference);
  if (normalized === "light") return "light";
  if (normalized === "dark") return "dark";
  return systemDark ? "dark" : "light";
}
