import { describe, expect, it } from "vitest";
import {
  normalizeColorSchemePreference,
  resolveColorScheme,
} from "./colorScheme";

describe("resolveColorScheme", () => {
  it("follows the OS when preference is system", () => {
    expect(resolveColorScheme("system", true)).toBe("dark");
    expect(resolveColorScheme("system", false)).toBe("light");
  });

  it("keeps explicit user overrides over the OS", () => {
    expect(resolveColorScheme("light", true)).toBe("light");
    expect(resolveColorScheme("dark", false)).toBe("dark");
  });
});

describe("normalizeColorSchemePreference", () => {
  it("coerces invalid values to system", () => {
    expect(normalizeColorSchemePreference("invalid")).toBe("system");
    expect(normalizeColorSchemePreference(null)).toBe("system");
  });

  it("preserves valid values", () => {
    expect(normalizeColorSchemePreference("light")).toBe("light");
    expect(normalizeColorSchemePreference("dark")).toBe("dark");
  });
});
