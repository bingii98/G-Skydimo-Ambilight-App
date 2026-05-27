const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const DEFAULT_BEHAVIOR = {
  runInTray: false,
  launchAtStartup: false,
};

function getBehaviorPath() {
  return path.join(app.getPath("userData"), "app-behavior.json");
}

function loadAppBehavior() {
  try {
    const raw = fs.readFileSync(getBehaviorPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_BEHAVIOR };
    }
    return {
      runInTray: Boolean(parsed.runInTray),
      launchAtStartup: Boolean(parsed.launchAtStartup),
    };
  } catch {
    return { ...DEFAULT_BEHAVIOR };
  }
}

function saveAppBehavior(behavior) {
  fs.writeFileSync(getBehaviorPath(), JSON.stringify(behavior, null, 2), "utf8");
}

module.exports = {
  DEFAULT_BEHAVIOR,
  loadAppBehavior,
  saveAppBehavior,
};
