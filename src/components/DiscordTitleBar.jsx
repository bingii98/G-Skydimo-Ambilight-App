import { Tooltip } from "@mantine/core";
import {
  IconBolt,
  IconCode,
  IconMinus,
  IconRectangle,
  IconMaximize,
  IconX,
} from "@tabler/icons-react";
import { parseModel } from "../lib/colorUtils";
import { ANIMATIONS } from "../lib/animations";
import { COLOR_MODES } from "../lib/ledLayout";
import { useWindowChrome } from "../hooks/useWindowChrome";
import { skydimo } from "../lib/skydimoApi";
import { APP_NAME_PRIMARY, APP_NAME_TAG, APP_TAGLINE } from "../lib/constants";
import appLogoUrl from "../assets/app-logo.png";

function WindowControl({ label, className, onClick, children }) {
  return (
    <Tooltip label={label} position="bottom" withArrow openDelay={400}>
      <button
        type="button"
        className={`titlebar-winbtn ${className || ""}`}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function getPaintModeLabel(colorMode, animationId) {
  if (colorMode === COLOR_MODES.ANIMATION) {
    const label = ANIMATIONS.find((item) => item.id === animationId)?.label;
    return label ? `Anim · ${label}` : "Animation";
  }
  if (colorMode === COLOR_MODES.SCREEN) return "Screen sync";
  if (colorMode === COLOR_MODES.LEDS) return "Per LED";
  return "Single";
}

export function DiscordTitleBar({
  connected,
  state,
  currentHex = "#FFD700",
  colorMode = COLOR_MODES.SINGLE,
  animationId = null,
}) {
  const { isMaximized, isFullScreen, minimize, toggleMaximize, close } = useWindowChrome();
  const deviceModel = parseModel(state?.deviceId);

  const statusText = connected
    ? state?.port || "Connected"
    : state?.connecting
      ? "Connecting…"
      : state?.scanning
        ? "Scanning…"
        : state?.skydimoRunning
          ? "Port in use"
          : "Not connected";

  const statusClass = connected
    ? "online"
    : state?.connecting || state?.scanning
      ? "pending"
      : state?.skydimoRunning
        ? "warning"
        : "offline";

  const handleDragDoubleClick = () => {
    if (!isFullScreen) {
      toggleMaximize();
    }
  };

  return (
    <div className="titlebar">
      <div className="titlebar__main" onDoubleClick={handleDragDoubleClick}>
        <div className="titlebar__brand">
          <span className="titlebar__logo" aria-hidden>
            <img src={appLogoUrl} alt="" draggable={false} />
          </span>
          <div className="titlebar__titles">
            <span className="titlebar__name">{APP_NAME_PRIMARY}</span>
            <span className="titlebar__tag">{APP_NAME_TAG}</span>
          </div>
        </div>

        <div className="titlebar__meta">
          {connected ? (
            <>
              <span
                className="titlebar__color-chip"
                style={{ "--chip-color": currentHex }}
                title={`Current color ${currentHex}`}
                aria-hidden
              />
              {deviceModel && <span className="titlebar__device-chip">{deviceModel}</span>}
              <span className="titlebar__meta-text">{state?.port}</span>
            </>
          ) : (
            <span className="titlebar__meta-text titlebar__meta-text--muted">{APP_TAGLINE}</span>
          )}
        </div>

        <div className="titlebar__spacer" />

        <div className="titlebar__status">
          <span className="titlebar__pill titlebar__pill--mode is-live">
            <IconBolt size={12} stroke={2.2} />
            Live
          </span>
          <span className={`titlebar__pill titlebar__pill--${statusClass}`}>
            <span className="titlebar__status-dot" />
            <span className="titlebar__status-label">{statusText}</span>
          </span>
          {connected && (
            <span className="titlebar__pill titlebar__pill--ghost">
              {getPaintModeLabel(colorMode, animationId)}
            </span>
          )}
        </div>
      </div>

      <div className="titlebar__window">
        <WindowControl label="DevTools" onClick={() => skydimo.toggleDevTools()}>
          <IconCode size={15} stroke={1.75} />
        </WindowControl>
        <WindowControl label="Minimize" onClick={minimize}>
          <IconMinus size={15} stroke={1.75} />
        </WindowControl>
        <WindowControl label={isMaximized ? "Restore" : "Maximize"} onClick={toggleMaximize}>
          {isMaximized ? <IconRectangle size={13} /> : <IconMaximize size={13} stroke={1.75} />}
        </WindowControl>
        <WindowControl label="Close" className="close" onClick={close}>
          <IconX size={15} stroke={1.75} />
        </WindowControl>
      </div>
    </div>
  );
}
