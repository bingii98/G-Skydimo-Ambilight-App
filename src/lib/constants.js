import appInfo from "../../appInfo.json";

export const {
  APP_NAME,
  APP_NAME_PRIMARY,
  APP_NAME_TAG,
  APP_TAGLINE,
  APP_DESCRIPTION,
  APP_DESCRIPTION_LONG,
} = appInfo;

/** Quick colors — tông LED phổ biến (teal, coral, neon, cool white), không dùng RGB thuần. */
export const PRESETS = [
  { label: "Teal", color: "#14B8A6" },
  { label: "Coral", color: "#FF6B6B" },
  { label: "Violet", color: "#8B5CF6" },
  { label: "Cyan", color: "#22D3EE" },
  { label: "Amber", color: "#FBBF24" },
  { label: "Fuchsia", color: "#E879F9" },
  { label: "Snow", color: "#E8F4FC" },
  { label: "Off", color: "#000000" },
];

export const DEFAULT_LED_COUNT = 96;

export const LED_BY_MODEL = {
  SK0L27: 96,
  SK0L24: 80,
  SK0L32: 114,
  SK0L34: 112,
  SK0L21: 76,
  SK0127: 67,
};

export const STATUS_LABELS = {
  available: "Ready",
  busy: "Busy",
  connected: "Connected",
  error: "Error",
  unknown: "Untested",
};

export const SETTINGS_KEY = "skydimo-last-settings";
export const HISTORY_KEY = "skydimo-color-history";
export const MAX_HISTORY = 10;
