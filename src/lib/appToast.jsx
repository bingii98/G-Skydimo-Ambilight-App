import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconBulb,
  IconBulbOff,
  IconCheck,
  IconPalette,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRadar2,
  IconSparkles,
} from "@tabler/icons-react";
import { parseModel, resolveLedCount } from "./colorUtils";

const CONNECTION_TOAST_ID = "device-connection";
const DEFAULT_AUTO_CLOSE = 4500;
const ERROR_AUTO_CLOSE = 7000;

const toastClasses = {
  root: "app-toast",
  title: "app-toast__title",
  description: "app-toast__message",
  icon: "app-toast__icon",
  closeButton: "app-toast__close",
};

function withVariant(variant) {
  return {
    ...toastClasses,
    root: `${toastClasses.root} app-toast--${variant}`,
  };
}

function showToast({
  id,
  variant = "info",
  title,
  message,
  icon,
  loading = false,
  autoClose = DEFAULT_AUTO_CLOSE,
  withCloseButton = true,
}) {
  notifications.show({
    id,
    color: variant === "success" ? "teal" : variant === "error" ? "red" : variant === "warning" ? "yellow" : "gray",
    title,
    message,
    icon,
    loading,
    autoClose,
    withCloseButton,
    classNames: withVariant(variant),
  });
}

export function formatConnectionError(raw) {
  const message = String(raw || "Connection failed").trim();

  if (/skydimo\.exe/i.test(message)) {
    return {
      title: "SkyDimo is using the port",
      message: "Close SkyDimo.exe, wait a moment, then connect again.",
    };
  }

  if (/access denied|in use|busy|cannot access/i.test(message)) {
    const portMatch = message.match(/COM\d+/i);
    return {
      title: "COM port unavailable",
      message: portMatch
        ? `${portMatch[0].toUpperCase()} is held by another app. Close serial monitors or SkyDimo.exe.`
        : "The port is held by another app. Close SkyDimo.exe and try again.",
    };
  }

  if (/not connected to a skydimo/i.test(message)) {
    return {
      title: "Not a Skydimo device",
      message: "Pick the USB-SERIAL CH340 port from the device list.",
    };
  }

  if (/no skydimo port found|no suitable port/i.test(message)) {
    return {
      title: "No device found",
      message: "Plug in the LED strip via USB, then press Scan.",
    };
  }

  if (/could not connect/i.test(message)) {
    return {
      title: "Connection failed",
      message: "Rescan COM ports or select another port, then try again.",
    };
  }

  return {
    title: "Connection error",
    message,
  };
}

export function toastConnecting(port) {
  notifications.show({
    id: CONNECTION_TOAST_ID,
    loading: true,
    title: "Connecting…",
    message: port ? `Opening ${port}` : "Looking for Skydimo on USB",
    autoClose: false,
    withCloseButton: false,
    classNames: withVariant("loading"),
  });
}

export function toastConnected({ port, deviceId }) {
  const model = parseModel(deviceId);
  const ledCount = resolveLedCount(deviceId);
  const details = [
    port,
    model,
    ledCount ? `${ledCount} LEDs` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  notifications.show({
    id: CONNECTION_TOAST_ID,
    color: "teal",
    title: "Connected",
    message: details || "Skydimo LED strip is ready",
    icon: <IconPlugConnected size={18} stroke={1.75} />,
    loading: false,
    autoClose: DEFAULT_AUTO_CLOSE,
    withCloseButton: true,
    classNames: withVariant("success"),
  });
}

export function toastDisconnected() {
  notifications.show({
    id: CONNECTION_TOAST_ID,
    color: "gray",
    title: "Disconnected",
    message: "This app no longer controls the LEDs",
    icon: <IconPlugConnectedX size={18} stroke={1.75} />,
    loading: false,
    autoClose: DEFAULT_AUTO_CLOSE,
    withCloseButton: true,
    classNames: withVariant("neutral"),
  });
}

export function toastConnectionFailed(message) {
  notifications.hide(CONNECTION_TOAST_ID);
  const formatted = formatConnectionError(message);
  showToast({
    variant: "warning",
    title: formatted.title,
    message: formatted.message,
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastConnectionError(error) {
  notifications.hide(CONNECTION_TOAST_ID);
  const formatted = formatConnectionError(error?.message || error);
  showToast({
    variant: "error",
    title: formatted.title,
    message: formatted.message,
    icon: <IconPlugConnectedX size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastScanComplete(portCount = 0) {
  showToast({
    variant: "success",
    title: "Scan complete",
    message:
      portCount > 0
        ? `Found ${portCount} Skydimo port${portCount === 1 ? "" : "s"}`
        : "COM port list refreshed",
    icon: <IconRadar2 size={18} stroke={1.75} />,
    autoClose: 3200,
  });
}

export function toastColorApplied(hex) {
  showToast({
    variant: "success",
    title: "Color applied",
    message: hex,
    icon: <IconPalette size={18} stroke={1.75} />,
  });
}

export function toastColorRestored(hex) {
  showToast({
    variant: "success",
    title: "Color restored",
    message: hex,
    icon: <IconCheck size={18} stroke={1.75} />,
  });
}

export function toastLedPower(on, hex) {
  showToast({
    variant: on ? "success" : "neutral",
    title: on ? "LEDs on" : "LEDs off",
    message: on ? hex : "Strip stays off until you turn it back on",
    icon: on ? <IconBulb size={18} stroke={1.75} /> : <IconBulbOff size={18} stroke={1.75} />,
  });
}

export function toastWarning(title, message) {
  showToast({
    variant: "warning",
    title,
    message,
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastPowerLoopBlocked() {
  showToast({
    variant: "warning",
    title: "Loop connection blocked",
    message: "Phát hiện vòng lặp (Loop Connection)! Disable another linker first.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastPowerBranchLimit() {
  showToast({
    variant: "warning",
    title: "Branch limit exceeded",
    message: "More than 12 panels on a power branch — add a power injector or split the layout.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastPanelRotateBlocked() {
  showToast({
    variant: "warning",
    title: "Cannot rotate panel",
    message: "This rotation would overlap another panel. Try the opposite direction or reposition the panel.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastPanelAddBlockedEdge() {
  showToast({
    variant: "warning",
    title: "Edge already linked",
    message:
      "That edge midpoint already has a panel attached. Drop on a corner handle (C1–C3) instead.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastPanelAddBlockedOverlap() {
  showToast({
    variant: "warning",
    title: "No room at this corner",
    message:
      "A panel here would overlap another triangle. Try a different corner or flip Apex up/down.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastPanelAddBlocked() {
  showToast({
    variant: "warning",
    title: "Cannot attach panel",
    message: "Drop closer to a corner handle (C1–C3) on the panel you want to extend.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastAiGradientMissingKey() {
  showToast({
    variant: "warning",
    title: "OpenAI key required",
    message: "Add your API key in Settings to use AI gradient and animation suggestions.",
    icon: <IconSparkles size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastAiGradientApplied(stopCount, mode = "blend") {
  const middle = Math.max(0, stopCount - 2);
  const message =
    mode === "fresh"
      ? `Applied a new ${stopCount}-color gradient palette.`
      : `Kept top & bottom swatches; ${middle} blended middle stop${middle === 1 ? "" : "s"}.`;

  showToast({
    variant: "success",
    title: "Gradient applied",
    message,
    icon: <IconSparkles size={18} stroke={1.75} />,
  });
}

export function toastOrientationCalibrated(rotation) {
  showToast({
    variant: "success",
    title: "Orientation set",
    message: `Map rotation saved at ${rotation}°.`,
    icon: <IconSparkles size={18} stroke={1.75} />,
  });
}

export function toastOrientationInferFailed() {
  showToast({
    variant: "error",
    title: "Calibration mismatch",
    message:
      "No layout matches your choices. Check CW/CCW, the lit edge, short vs long start, and LED counts per side.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastAiGradientError(message) {
  showToast({
    variant: "error",
    title: "AI gradient failed",
    message: message || "Could not fetch a gradient suggestion.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastAiAnimationApplied(mode, effectLabel) {
  const message =
    mode === "palette_blend"
      ? `Blended middle colors for ${effectLabel || "this effect"} (edges kept).`
      : `Generated new colors for ${effectLabel || "this effect"}.`;

  showToast({
    variant: "success",
    title: "Colors applied",
    message,
    icon: <IconSparkles size={18} stroke={1.75} />,
  });
}

export function toastStartupRegistrationFailed(message) {
  showToast({
    id: "startup-registration",
    variant: "error",
    title: "Couldn't register Windows startup",
    message:
      message ||
      "Startup could not be registered. Check Windows login-item permissions or try running as Administrator.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastStartupOutOfSync() {
  showToast({
    id: "startup-registration",
    variant: "warning",
    title: "Startup setting was changed by Windows",
    message:
      "The scheduled task for launch-at-startup didn't match your saved setting. We've synced it now.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}

export function toastAiAnimationError(message) {
  showToast({
    variant: "error",
    title: "AI animation failed",
    message: message || "Could not fetch an animation suggestion.",
    icon: <IconAlertTriangle size={18} stroke={1.75} />,
    autoClose: ERROR_AUTO_CLOSE,
  });
}
