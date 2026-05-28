import { createTheme } from "@mantine/core";

/** Dark chrome for the custom frameless titlebar */
export const titlebarTokens = {
  bgHeader: "#15181c",
  bgMain: "#1c2127",
  bgPanel: "#262b33",
  border: "rgba(255, 255, 255, 0.06)",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  text: "#f3f4f6",
  textMuted: "#c4cad3",
  textDim: "#8b949e",
  accent: "#14b8a6",
  accentSoft: "rgba(20, 184, 166, 0.16)",
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  live: "#38bdf8",
};

/** Soft UI — light body palette */
export const tokens = {
  bgRoot: "#dfe8e3",
  bgMain: "#ecf2ef",
  bgShell: "#f7faf8",
  bgPanel: "#ffffff",
  bgPanelHover: "#f3f7f5",
  bgElevated: "#ffffff",
  bgInput: "#f0f4f2",
  bgRail: "rgba(255, 255, 255, 0.62)",
  bgList: "rgba(255, 255, 255, 0.78)",
  border: "rgba(15, 35, 30, 0.08)",
  borderStrong: "rgba(15, 35, 30, 0.12)",
  text: "#1a2332",
  textMuted: "#5c6b7a",
  textDim: "#8b99a8",
  accent: "#0d9488",
  accentHover: "#0f766e",
  accentSoft: "rgba(13, 148, 136, 0.12)",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
  live: "#0ea5e9",
  glow: "var(--glow-color, #0d9488)",
  shadow: "0 10px 40px rgba(15, 35, 30, 0.08)",
  shadowSm: "0 4px 16px rgba(15, 35, 30, 0.06)",
  bgGradientTop: "#ffffff",
  bgGradientBottom: "#f4f8f6",
  bgGradientSoftTop: "#f8fbfb",
  bgGradientSoftBottom: "#eef4f1",
  footerBg: "rgba(255, 255, 255, 0.72)",
  tooltipBg: "#1a2332",
  tooltipBgHover: "#0f172a",
  pickerThumbRing: "rgba(15, 35, 30, 0.12)",
  pickerThumbShadow: "rgba(15, 35, 30, 0.18)",
  scrollbarMixBase: "rgba(15, 35, 30, 0.12)",
  scrollbarMixHover: "rgba(15, 35, 30, 0.18)",
  scrollbarMixActive: "rgba(15, 35, 30, 0.24)",
  scrollbarTrackHover: "rgba(13, 148, 136, 0.06)",
  ambientHighlight: "rgba(255, 255, 255, 0.55)",
  panelGlass: "rgba(255, 255, 255, 0.72)",
  previewPaneTop: "rgba(247, 250, 248, 0.6)",
  previewPaneBottom: "rgba(255, 255, 255, 0.4)",
  previewOverlay: "rgba(247, 250, 248, 0.88)",
  previewMapBg: "rgba(255, 255, 255, 0.45)",
  toastBg: "rgba(255, 255, 255, 0.96)",
  toastShadow: "0 4px 14px rgba(15, 35, 30, 0.08)",
};

/** Dark body palette */
export const darkTokens = {
  bgRoot: "#1a1d21",
  bgMain: "#1e2228",
  bgShell: "#23272e",
  bgPanel: "#2b3038",
  bgPanelHover: "#323840",
  bgElevated: "#323840",
  bgInput: "#262b33",
  bgRail: "rgba(0, 0, 0, 0.32)",
  bgList: "rgba(43, 48, 56, 0.78)",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.12)",
  text: "#f3f4f6",
  textMuted: "#c4cad3",
  textDim: "#8b949e",
  accent: "#14b8a6",
  accentHover: "#2dd4bf",
  accentSoft: "rgba(20, 184, 166, 0.16)",
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  live: "#38bdf8",
  glow: "var(--glow-color, #14b8a6)",
  shadow: "0 10px 40px rgba(0, 0, 0, 0.35)",
  shadowSm: "0 4px 16px rgba(0, 0, 0, 0.25)",
  bgGradientTop: "#2b3038",
  bgGradientBottom: "#23272e",
  bgGradientSoftTop: "#2f343c",
  bgGradientSoftBottom: "#262b33",
  footerBg: "rgba(28, 33, 39, 0.85)",
  tooltipBg: "#15181c",
  tooltipBgHover: "#0f1216",
  pickerThumbRing: "rgba(255, 255, 255, 0.12)",
  pickerThumbShadow: "rgba(0, 0, 0, 0.35)",
  scrollbarMixBase: "rgba(255, 255, 255, 0.12)",
  scrollbarMixHover: "rgba(255, 255, 255, 0.18)",
  scrollbarMixActive: "rgba(255, 255, 255, 0.24)",
  scrollbarTrackHover: "rgba(20, 184, 166, 0.12)",
  ambientHighlight: "rgba(255, 255, 255, 0.08)",
  panelGlass: "rgba(43, 48, 56, 0.72)",
  previewPaneTop: "rgba(35, 39, 46, 0.92)",
  previewPaneBottom: "rgba(26, 29, 33, 0.72)",
  previewOverlay: "rgba(26, 29, 33, 0.9)",
  previewMapBg: "rgba(0, 0, 0, 0.28)",
  toastBg: "rgba(43, 48, 56, 0.96)",
  toastShadow: "0 4px 14px rgba(0, 0, 0, 0.28)",
};

function tokenToCssVar(prefix, key) {
  return `--${prefix}-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

function injectTokenGroup(root, prefix, tokenGroup) {
  Object.entries(tokenGroup).forEach(([key, value]) => {
    root.style.setProperty(tokenToCssVar(prefix, key), value);
  });
}

function getScrollbarVars(activeTokens) {
  return {
    "--sk-scrollbar-size": "8px",
    "--sk-scrollbar-track": "transparent",
    "--sk-scrollbar-track-hover": activeTokens.scrollbarTrackHover,
    "--sk-scrollbar-thumb": `color-mix(in srgb, var(--sk-accent) 32%, ${activeTokens.scrollbarMixBase})`,
    "--sk-scrollbar-thumb-hover": `color-mix(in srgb, var(--sk-accent) 55%, ${activeTokens.scrollbarMixHover})`,
    "--sk-scrollbar-thumb-active": `color-mix(in srgb, var(--sk-accent) 72%, ${activeTokens.scrollbarMixActive})`,
  };
}

export function getTokensForScheme(resolvedScheme) {
  return resolvedScheme === "dark" ? darkTokens : tokens;
}

export function createMantineTheme(resolvedScheme = "light") {
  const activeTokens = getTokensForScheme(resolvedScheme);

  return createTheme({
    primaryColor: "teal",
    defaultRadius: "sm",
    radius: {
      xs: "4px",
      sm: "6px",
      md: "8px",
      lg: "10px",
      xl: "12px",
    },
    spacing: {
      xs: "6px",
      sm: "10px",
      md: "14px",
      lg: "18px",
      xl: "24px",
    },
    fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontFamilyMonospace: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    headings: {
      fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontWeight: "600",
      letterSpacing: "0.02em",
    },
    components: {
      AppShell: {
        styles: {
          root: { background: "transparent" },
          main: {
            background: "transparent",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          },
          header: {
            padding: 0,
            background: titlebarTokens.bgHeader,
            borderBottom: `1px solid ${titlebarTokens.border}`,
          },
          footer: {
            background: activeTokens.footerBg,
            backdropFilter: "blur(16px)",
            borderTop: `1px solid ${activeTokens.border}`,
            padding: 0,
          },
        },
      },
      Paper: {
        defaultProps: { radius: "md", withBorder: true },
        styles: {
          root: {
            backgroundColor: activeTokens.bgPanel,
            borderColor: activeTokens.border,
            boxShadow: activeTokens.shadowSm,
          },
        },
      },
      Button: {
        defaultProps: { radius: "sm" },
      },
      TextInput: {
        styles: {
          input: {
            backgroundColor: activeTokens.bgInput,
            borderColor: "transparent",
          },
        },
      },
      PasswordInput: {
        styles: {
          input: {
            backgroundColor: activeTokens.bgInput,
            borderColor: activeTokens.border,
            borderRadius: 8,
          },
          visibilityToggle: {
            color: activeTokens.textDim,
          },
        },
      },
      Select: {
        defaultProps: {
          comboboxProps: { withinPortal: true, offset: 6 },
        },
      },
      Popover: {
        styles: {
          dropdown: {
            backgroundColor: activeTokens.bgPanel,
            border: `1px solid ${activeTokens.border}`,
            boxShadow: activeTokens.shadow,
            borderRadius: 10,
          },
        },
      },
      Menu: {
        styles: {
          dropdown: {
            backgroundColor: activeTokens.bgPanel,
            border: `1px solid ${activeTokens.border}`,
            boxShadow: activeTokens.shadow,
            borderRadius: 8,
            padding: 6,
          },
          item: {
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
          },
        },
      },
      Switch: {
        styles: {
          root: {
            "--switch-color": activeTokens.accent,
          },
        },
      },
      Slider: {
        styles: {
          bar: {
            background: "linear-gradient(90deg, var(--glow-color, #0d9488), #5eead4)",
          },
          thumb: { borderColor: "white", boxShadow: activeTokens.shadowSm },
        },
      },
      NumberInput: {
        styles: {
          input: { backgroundColor: activeTokens.bgInput, borderColor: activeTokens.border },
        },
      },
      ColorPicker: {
        styles: {
          saturation: { borderRadius: 8 },
          slider: { borderRadius: 999 },
          thumb: {
            borderColor: "white",
            borderWidth: 2.5,
            boxShadow: `0 0 0 1px ${activeTokens.pickerThumbRing}, 0 2px 8px ${activeTokens.pickerThumbShadow}`,
          },
        },
      },
      Badge: {
        styles: { root: { textTransform: "none", fontWeight: 600 } },
      },
      Divider: {
        styles: { root: { borderColor: activeTokens.border } },
      },
      Alert: {
        defaultProps: { radius: "sm", variant: "light" },
        styles: {
          root: {
            border: `1px solid ${activeTokens.border}`,
            boxShadow: activeTokens.shadowSm,
            backdropFilter: "blur(14px)",
          },
          icon: {
            marginRight: 4,
          },
          title: {
            fontWeight: 700,
            letterSpacing: "0.02em",
          },
          message: {
            lineHeight: 1.45,
          },
        },
      },
      ScrollArea: {
        defaultProps: {
          classNames: {
            scrollbar: "sk-scrollarea-scrollbar",
            thumb: "sk-scrollarea-thumb",
          },
        },
        styles: {
          root: {
            "--scrollarea-scrollbar-size": "var(--sk-scrollbar-size)",
          },
        },
      },
    },
  });
}

/** @deprecated Use createMantineTheme(resolvedScheme) */
export const mantineTheme = createMantineTheme("light");

export function applyCssVariables(resolvedScheme = "light") {
  const scheme = resolvedScheme === "dark" ? "dark" : "light";
  const activeTokens = getTokensForScheme(scheme);
  const root = document.documentElement;

  injectTokenGroup(root, "sk", activeTokens);
  injectTokenGroup(root, "tb", titlebarTokens);

  root.dataset.colorScheme = scheme;

  root.style.setProperty("--sk-space-xs", "6px");
  root.style.setProperty("--sk-space-sm", "10px");
  root.style.setProperty("--sk-space-md", "14px");
  root.style.setProperty("--sk-space-lg", "20px");
  root.style.setProperty("--sk-space-xl", "28px");
  root.style.setProperty("--sk-app-padding", "12px");
  root.style.setProperty("--sk-panel-padding", "18px");
  root.style.setProperty("--sk-radius", "6px");
  root.style.setProperty("--sk-radius-md", "8px");
  root.style.setProperty("--sk-radius-lg", "10px");
  root.style.setProperty("--sk-radius-xl", "12px");
  root.style.setProperty("--sk-rail-width", "52px");
  root.style.setProperty("--sk-list-width", "420px");
  root.style.setProperty("--sk-letter-spacing", "0.025em");
  root.style.setProperty("--sk-letter-spacing-tight", "0.015em");
  root.style.setProperty("--sk-letter-spacing-label", "0.06em");
  root.style.setProperty("--sk-letter-spacing-wide", "0.08em");
  root.style.setProperty("--sk-letter-spacing-caps", "0.12em");

  Object.entries(getScrollbarVars(activeTokens)).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
}
