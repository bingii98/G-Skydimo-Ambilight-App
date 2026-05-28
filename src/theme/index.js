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

/** Soft UI — tham khảo messaging app trong ảnh */
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
};

export const mantineTheme = createTheme({
  primaryColor: "teal",
  defaultRadius: "lg",
  spacing: {
    xs: "6px",
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "24px",
  },
  fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontFamilyMonospace: '"DM Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  headings: {
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: "600",
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
          background: "rgba(255, 255, 255, 0.72)",
          backdropFilter: "blur(16px)",
          borderTop: `1px solid ${tokens.border}`,
          padding: 0,
        },
      },
    },
    Paper: {
      defaultProps: { radius: "xl", withBorder: true },
      styles: {
        root: {
          backgroundColor: tokens.bgPanel,
          borderColor: tokens.border,
          boxShadow: tokens.shadowSm,
        },
      },
    },
    Button: {
      defaultProps: { radius: "xl" },
    },
    TextInput: {
      styles: {
        input: {
          backgroundColor: tokens.bgInput,
          borderColor: "transparent",
        },
      },
    },
    PasswordInput: {
      styles: {
        input: {
          backgroundColor: tokens.bgInput,
          borderColor: tokens.border,
          borderRadius: 12,
        },
        visibilityToggle: {
          color: tokens.textDim,
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
          backgroundColor: tokens.bgPanel,
          border: `1px solid ${tokens.border}`,
          boxShadow: tokens.shadow,
          borderRadius: 16,
        },
      },
    },
    Menu: {
      styles: {
        dropdown: {
          backgroundColor: tokens.bgPanel,
          border: `1px solid ${tokens.border}`,
          boxShadow: tokens.shadow,
          borderRadius: 14,
          padding: 6,
        },
        item: {
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 500,
        },
      },
    },
    Switch: {
      styles: {
        root: {
          "--switch-color": tokens.accent,
        },
      },
    },
    Slider: {
      styles: {
        bar: {
          background: "linear-gradient(90deg, var(--glow-color, #0d9488), #5eead4)",
        },
        thumb: { borderColor: "white", boxShadow: tokens.shadowSm },
      },
    },
    NumberInput: {
      styles: {
        input: { backgroundColor: tokens.bgInput, borderColor: tokens.border },
      },
    },
    ColorPicker: {
      styles: {
        saturation: { borderRadius: 12 },
        slider: { borderRadius: 999 },
        thumb: {
          borderColor: "white",
          borderWidth: 2.5,
          boxShadow: "0 0 0 1px rgba(15, 35, 30, 0.12), 0 2px 8px rgba(15, 35, 30, 0.18)",
        },
      },
    },
    Badge: {
      styles: { root: { textTransform: "none", fontWeight: 600 } },
    },
    Divider: {
      styles: { root: { borderColor: tokens.border } },
    },
    Alert: {
      defaultProps: { radius: "lg", variant: "light" },
      styles: {
        root: {
          border: `1px solid ${tokens.border}`,
          boxShadow: tokens.shadowSm,
          backdropFilter: "blur(14px)",
        },
        icon: {
          marginRight: 4,
        },
        title: {
          fontWeight: 700,
          letterSpacing: "-0.01em",
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

export function applyCssVariables() {
  const root = document.documentElement;

  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(`--sk-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, value);
  });

  Object.entries(titlebarTokens).forEach(([key, value]) => {
    root.style.setProperty(`--tb-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, value);
  });

  root.style.setProperty("--sk-space-xs", "6px");
  root.style.setProperty("--sk-space-sm", "10px");
  root.style.setProperty("--sk-space-md", "14px");
  root.style.setProperty("--sk-space-lg", "20px");
  root.style.setProperty("--sk-space-xl", "28px");
  root.style.setProperty("--sk-app-padding", "12px");
  root.style.setProperty("--sk-panel-padding", "18px");
  root.style.setProperty("--sk-radius", "14px");
  root.style.setProperty("--sk-radius-md", "16px");
  root.style.setProperty("--sk-radius-lg", "20px");
  root.style.setProperty("--sk-radius-xl", "24px");
  root.style.setProperty("--sk-rail-width", "52px");
  root.style.setProperty("--sk-list-width", "420px");

  root.style.setProperty("--sk-scrollbar-size", "8px");
  root.style.setProperty("--sk-scrollbar-track", "transparent");
  root.style.setProperty("--sk-scrollbar-track-hover", "rgba(13, 148, 136, 0.06)");
  root.style.setProperty(
    "--sk-scrollbar-thumb",
    "color-mix(in srgb, var(--sk-accent) 32%, rgba(15, 35, 30, 0.12))"
  );
  root.style.setProperty(
    "--sk-scrollbar-thumb-hover",
    "color-mix(in srgb, var(--sk-accent) 55%, rgba(15, 35, 30, 0.18))"
  );
  root.style.setProperty(
    "--sk-scrollbar-thumb-active",
    "color-mix(in srgb, var(--sk-accent) 72%, rgba(15, 35, 30, 0.24))"
  );
}
