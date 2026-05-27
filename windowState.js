const fs = require("fs");
const path = require("path");
const { app, screen } = require("electron");

const WINDOW_SIZE = { width: 960, height: 680 };
const WINDOW_MIN = { width: 960, height: 600 };

const DEFAULT_STATE = {
  isMaximized: false,
  bounds: { ...WINDOW_SIZE },
};

function getStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function normalizeBounds(bounds, defaults, minSize) {
  const width = Number(bounds?.width) || defaults.width;
  const height = Number(bounds?.height) || defaults.height;
  const next = {
    width: minSize ? Math.max(width, minSize.width) : width,
    height: minSize ? Math.max(height, minSize.height) : height,
  };

  if (Number.isFinite(bounds?.x)) {
    next.x = Math.round(bounds.x);
  }
  if (Number.isFinite(bounds?.y)) {
    next.y = Math.round(bounds.y);
  }

  return next;
}

function ensureVisible(bounds) {
  const next = { ...bounds };

  if (next.x !== undefined && next.y !== undefined) {
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea;
      return (
        next.x < area.x + area.width &&
        next.x + next.width > area.x &&
        next.y < area.y + area.height &&
        next.y + next.height > area.y
      );
    });

    if (visible) {
      return next;
    }
  }

  const primary = screen.getPrimaryDisplay().workArea;
  return {
    ...next,
    x: primary.x + Math.round((primary.width - next.width) / 2),
    y: primary.y + Math.round((primary.height - next.height) / 2),
  };
}

function loadWindowState() {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf8");
    const saved = JSON.parse(raw);
    const sourceBounds = saved.bounds || saved.windowBounds || WINDOW_SIZE;

    return {
      isMaximized: Boolean(saved.isMaximized),
      bounds: ensureVisible(normalizeBounds(sourceBounds, WINDOW_SIZE, WINDOW_MIN)),
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      bounds: ensureVisible(normalizeBounds(WINDOW_SIZE, WINDOW_SIZE, WINDOW_MIN)),
    };
  }
}

function saveWindowState(state) {
  try {
    fs.mkdirSync(path.dirname(getStatePath()), { recursive: true });
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf8");
  } catch (error) {
    console.warn("Could not save window state:", error.message);
  }
}

module.exports = {
  WINDOW_SIZE,
  WINDOW_MIN,
  DEFAULT_STATE,
  loadWindowState,
  saveWindowState,
  ensureVisible,
};
