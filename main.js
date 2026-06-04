const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, nativeTheme, desktopCapturer, screen } = require("electron");
const { APP_NAME } = require("./appInfo");
const path = require("path");
const { execSync } = require("child_process");
const { ConnectionManager } = require("./connectionManager");
const { ExternalLedManager } = require("./externalLedManager");
const {
  WINDOW_SIZE,
  WINDOW_MIN,
  loadWindowState,
  saveWindowState,
} = require("./windowState");
const { fetchGradientSuggestion } = require("./services/openaiGradient");
const { fetchAnimationSuggestion } = require("./services/openaiAnimation");
const { loadAppBehavior, saveAppBehavior } = require("./appBehaviorState");
const {
  STARTUP_LAUNCH_ARG,
  applyStartupProcessPriority,
  applyWindowsStartupRegistration,
  buildWindowsStartupArgs,
  isAccessDeniedError,
  queryWindowsStartupTask,
} = require("./startupRegistration");

const isDev = !app.isPackaged && process.env.NODE_ENV === "development";
const START_IN_TRAY_ARG = "--start-in-tray";
const ASSETS_DIR = path.join(__dirname, "assets");

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function getAssetPath(filename) {
  return path.join(ASSETS_DIR, filename);
}

function loadAppIcon() {
  const iconPath = getAssetPath("icon.png");
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

function loadTrayIconForTheme(useDarkColors = nativeTheme.shouldUseDarkColors) {
  const iconPath = getAssetPath(useDarkColors ? "tray-dark.png" : "tray-light.png");
  let image = nativeImage.createFromPath(iconPath);

  if (image.isEmpty()) {
    image = nativeImage.createFromPath(getAssetPath("tray.png"));
  }

  if (image.isEmpty()) {
    return nativeImage.createEmpty();
  }

  if (process.platform === "win32") {
    image = image.resize({ width: 16, height: 16, quality: "best" });
  }

  return image;
}

function updateTrayIcon() {
  if (!tray) {
    return;
  }

  tray.setImage(loadTrayIconForTheme());
}

function attachTrayThemeListener() {
  nativeTheme.on("updated", () => {
    updateTrayIcon();
    broadcastThemeChange();
  });
}

function getThemePayload() {
  return { shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
}

function broadcastThemeChange() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("theme:updated", getThemePayload());
  }
}

let mainWindow = null;
let connectionManager = null;
let externalLedManager = null;
let tray = null;
let isQuitting = false;
let isShuttingDown = false;
let windowState = null;
let saveWindowTimer = null;

const appBehavior = {
  runInTray: false,
  launchAtStartup: false,
};

function applyLoginItemSettings() {
  if (!app.isPackaged) {
    // Dev mode runs through electron.exe — never register startup or Windows
    // will launch bare Electron on login (no app path / main.js).
    app.setLoginItemSettings({ openAtLogin: false });
    return { ok: true, error: null };
  }

  // Boot via Task Scheduler / login item should always land in the tray.
  const startInTray = appBehavior.launchAtStartup;

  if (process.platform === "win32") {
    // Prefer Task Scheduler (high launch priority, zero logon delay). Fall back to
    // the per-user Run registry key when schtasks is blocked (no admin / policy).
    app.setLoginItemSettings({ openAtLogin: false });
    if (!appBehavior.launchAtStartup) {
      try {
        applyWindowsStartupRegistration({
          enabled: false,
          exePath: process.execPath,
          startInTrayArg: null,
        });
      } catch (err) {
        return { ok: false, error: err?.message || "Failed to remove Windows startup task" };
      }
      return { ok: true, error: null };
    }

    const startInTrayArg = startInTray ? START_IN_TRAY_ARG : null;
    const startupArgs = buildWindowsStartupArgs(startInTrayArg ? [startInTrayArg] : []);

    try {
      applyWindowsStartupRegistration({
        enabled: true,
        exePath: process.execPath,
        startInTrayArg,
      });
      return { ok: true, error: null };
    } catch (err) {
      if (!isAccessDeniedError(err)) {
        return { ok: false, error: err?.message || "Failed to register Windows startup task" };
      }
    }

    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: startInTray,
        path: process.execPath,
        args: startupArgs,
      });
      return { ok: true, error: null };
    } catch (err) {
      return {
        ok: false,
        error: err?.message || "Failed to register Windows startup (registry fallback)",
      };
    }
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: appBehavior.launchAtStartup,
      openAsHidden: startInTray,
      path: process.execPath,
      args: startInTray ? [START_IN_TRAY_ARG] : [],
    });
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err?.message || "Failed to set login item" };
  }
}

function shouldStartHiddenInTray() {
  if (process.argv.includes(START_IN_TRAY_ARG)) {
    return true;
  }

  if (process.argv.includes(STARTUP_LAUNCH_ARG)) {
    return true;
  }

  if (!appBehavior.launchAtStartup) {
    return false;
  }

  const login = app.getLoginItemSettings();
  return login.wasOpenedAsLogin || login.wasOpenedAsHidden;
}

function isSkydimoAppRunning() {
  if (process.platform !== "win32") {
    return false;
  }

  try {
    const output = execSync('tasklist /FI "IMAGENAME eq SkyDimo.exe" /NH', {
      encoding: "utf8",
    });
    return output.includes("SkyDimo.exe");
  } catch {
    return false;
  }
}

function broadcastExternalState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("externalLed:state", state);
  }
}

function broadcastState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("connection:state", state);
  }
}

function getWindowChromePayload() {
  return {
    isMaximized: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()),
    isFullScreen: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()),
  };
}

function broadcastWindowChrome() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:chromeChanged", getWindowChromePayload());
  }
}

function captureWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || !windowState) {
    return;
  }

  windowState.isMaximized = mainWindow.isMaximized();
  if (windowState.isMaximized || mainWindow.isFullScreen()) {
    return;
  }

  windowState.bounds = mainWindow.getBounds();
}

function persistWindowState() {
  if (!windowState) {
    return;
  }
  captureWindowState();
  saveWindowState(windowState);
}

function schedulePersistWindowState() {
  clearTimeout(saveWindowTimer);
  saveWindowTimer = setTimeout(persistWindowState, 250);
}

function attachWindowStateHandlers() {
  mainWindow.on("move", schedulePersistWindowState);
  mainWindow.on("resize", schedulePersistWindowState);
  mainWindow.on("maximize", () => {
    windowState.isMaximized = true;
    broadcastWindowChrome();
    schedulePersistWindowState();
  });
  mainWindow.on("unmaximize", () => {
    windowState.isMaximized = false;
    broadcastWindowChrome();
    schedulePersistWindowState();
  });
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();
  return true;
}

function createTray() {
  if (tray) {
    return;
  }

  tray = new Tray(loadTrayIconForTheme());
  tray.setToolTip(`${APP_NAME} — running in background`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Open ${APP_NAME}`,
        click: () => {
          focusMainWindow();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("double-click", () => {
    focusMainWindow();
  });
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function createWindow() {
  if (focusMainWindow()) {
    return;
  }

  if (!windowState) {
    windowState = loadWindowState();
  }

  const initialBounds = windowState.bounds;
  const startHiddenInTray = shouldStartHiddenInTray();

  mainWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width || WINDOW_SIZE.width,
    height: initialBounds.height || WINDOW_SIZE.height,
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    title: APP_NAME,
    icon: loadAppIcon(),
    resizable: true,
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    backgroundColor: "#15181c",
    show: !startHiddenInTray,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
  }
  attachWindowStateHandlers();

  mainWindow.once("ready-to-show", () => {
    if (startHiddenInTray) {
      createTray();
      return;
    }

    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }

    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    broadcastWindowChrome();
  });

  mainWindow.on("close", (event) => {
    persistWindowState();

    if (appBehavior.runInTray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      createTray();
    }
  });
}

function getExternalManager() {
  if (!externalLedManager) {
    externalLedManager = new ExternalLedManager({
      onStateChange: broadcastExternalState,
    });
    externalLedManager.init().catch(() => {
      externalLedManager.emitState();
    });
  }
  return externalLedManager;
}

function getManager() {
  if (!connectionManager) {
    connectionManager = new ConnectionManager({
      isSkydimoAppRunning,
      onStateChange: broadcastState,
    });
    connectionManager.start();
  }
  return connectionManager;
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  destroyTray();
  persistWindowState();

  if (connectionManager) {
    await connectionManager.destroy();
    connectionManager = null;
  }

  if (externalLedManager) {
    await externalLedManager.destroy();
    externalLedManager = null;
  }
}

ipcMain.handle("connection:getState", async () => getManager().getState());

ipcMain.handle("connection:setOptions", async (_event, options) => {
  getManager().setOptions(options);
  return getManager().getState();
});

ipcMain.handle("connection:scan", async () => getManager().scanNow());

ipcMain.handle("connection:connect", async (_event, portPath) => {
  try {
    return await getManager().connect(portPath || null, { auto: false });
  } catch (error) {
    const state = getManager().getState();
    return {
      ...state,
      connected: false,
      message: error.message,
    };
  }
});

ipcMain.handle("connection:connectBest", async () => {
  try {
    return await getManager().connectBest();
  } catch (error) {
    const state = getManager().getState();
    return {
      ...state,
      connected: false,
      message: error.message,
    };
  }
});

ipcMain.handle("connection:disconnect", async () => {
  return getManager().disconnect({ manual: true });
});

ipcMain.handle("device:setColor", async (_event, red, green, blue, count) => {
  return getManager().setColor(red, green, blue, count);
});

ipcMain.handle("device:setPixels", async (_event, pixels, count) => {
  return getManager().setPixels(pixels, count);
});

ipcMain.handle("externalLed:getState", async () => getExternalManager().getState());

ipcMain.handle("externalLed:scan", async () => getExternalManager().startScan());

ipcMain.handle("externalLed:stopScan", async () => getExternalManager().stopScan());

ipcMain.handle("externalLed:registerSaved", async (_event, deviceIds = []) => {
  getExternalManager().registerSavedDevices(deviceIds);
  return getExternalManager().getState();
});

ipcMain.handle("externalLed:connect", async (_event, deviceId) => {
  try {
    return await getExternalManager().connect(deviceId);
  } catch (error) {
    const state = getExternalManager().getState();
    return {
      ...state,
      message: error.message,
    };
  }
});

ipcMain.handle("externalLed:disconnect", async (_event, deviceId) =>
  getExternalManager().disconnect(deviceId)
);

ipcMain.handle("externalLed:setColor", async (_event, deviceId, red, green, blue, brightness) =>
  getExternalManager().setColor(deviceId, red, green, blue, brightness)
);

ipcMain.handle("externalLed:setPixels", async (_event, deviceId, pixels, brightness) =>
  getExternalManager().setPixels(deviceId, pixels, brightness)
);

ipcMain.handle("externalLed:setPower", async (_event, deviceId, poweredOn) =>
  getExternalManager().setPower(deviceId, poweredOn)
);

ipcMain.handle("externalLed:setAnimation", async (_event, deviceId, mode, speed) =>
  getExternalManager().setAnimation(deviceId, mode, speed)
);

ipcMain.handle("externalLed:setBrightness", async (_event, deviceId, brightness) =>
  getExternalManager().setBrightness(deviceId, brightness)
);

ipcMain.handle("openai:suggestGradient", async (_event, options = {}) => {
  try {
    return await fetchGradientSuggestion(options.apiKey, {
      mode: options.mode,
      baseColor: options.baseColor,
      colorFrom: options.colorFrom,
      colorTo: options.colorTo,
      topPosition: options.topPosition,
      bottomPosition: options.bottomPosition,
      mood: options.mood,
      constraints: options.constraints,
    });
  } catch (error) {
    throw new Error(error?.message || "AI gradient request failed");
  }
});

ipcMain.handle("openai:suggestAnimation", async (_event, options = {}) => {
  try {
    return await fetchAnimationSuggestion(options.apiKey, options);
  } catch (error) {
    throw new Error(error?.message || "AI animation request failed");
  }
});

ipcMain.handle("screen:listSources", async () => {
  try {
    const primaryId = screen.getPrimaryDisplay().id;
    const displays = screen.getAllDisplays();
    const displayById = Object.fromEntries(
      displays.map((display) => [String(display.id), display])
    );
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 0, height: 0 },
    });

    return sources.map((source) => {
      const display = displayById[String(source.display_id)];
      const width = Math.max(1, Math.round(display?.size?.width || display?.bounds?.width || 1920));
      const height = Math.max(1, Math.round(display?.size?.height || display?.bounds?.height || 1080));
      const scaleFactor = display?.scaleFactor || 1;
      const nativeWidth = Math.max(1, Math.round(width * scaleFactor));
      const nativeHeight = Math.max(1, Math.round(height * scaleFactor));

      return {
        id: source.id,
        name: source.name,
        displayId: source.display_id,
        isPrimary: String(source.display_id) === String(primaryId),
        width,
        height,
        scaleFactor,
        nativeWidth,
        nativeHeight,
      };
    });
  } catch (error) {
    throw new Error(error?.message || "Could not list screen sources");
  }
});

ipcMain.handle("app:setBehavior", async (_event, behavior = {}) => {
  let loginItemsChanged = false;

  if (typeof behavior.runInTray === "boolean") {
    appBehavior.runInTray = behavior.runInTray;
    if (!appBehavior.runInTray) {
      destroyTray();
    }
    if (appBehavior.launchAtStartup) {
      loginItemsChanged = true;
    }
  }

  if (typeof behavior.launchAtStartup === "boolean") {
    appBehavior.launchAtStartup = behavior.launchAtStartup;
    loginItemsChanged = true;
  }

  let startupRegistration = { ok: true, error: null };
  if (loginItemsChanged) {
    startupRegistration = applyLoginItemSettings();
  }

  saveAppBehavior({
    runInTray: appBehavior.runInTray,
    launchAtStartup: appBehavior.launchAtStartup,
  });

  return {
    runInTray: appBehavior.runInTray,
    launchAtStartup: appBehavior.launchAtStartup,
    startupRegistration,
  };
});

ipcMain.handle("app:getStartupStatus", async () => {
  const desired = Boolean(appBehavior.launchAtStartup);
  if (process.platform !== "win32" || !app.isPackaged) {
    return { registered: desired, desired, mismatch: false };
  }
  const { exists: taskExists } = queryWindowsStartupTask();
  const loginItemRegistered = Boolean(app.getLoginItemSettings().openAtLogin);
  const registered = taskExists || loginItemRegistered;
  return {
    registered,
    desired,
    mismatch: registered !== desired,
  };
});

ipcMain.handle("theme:getShouldUseDarkColors", async () => nativeTheme.shouldUseDarkColors);

ipcMain.handle("window:getChrome", async () => getWindowChromePayload());

ipcMain.handle("window:minimize", async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.handle("window:toggleMaximize", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return getWindowChromePayload();
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  broadcastWindowChrome();
  return getWindowChromePayload();
});

ipcMain.handle("window:close", async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.handle("window:toggleDevTools", async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  const wc = mainWindow.webContents;
  if (wc.isDevToolsOpened()) {
    wc.closeDevTools();
    return false;
  }
  wc.openDevTools({ mode: "detach" });
  return true;
});

app.on("second-instance", () => {
  if (!focusMainWindow()) {
    createWindow();
  }
});

app.whenReady().then(() => {
  app.setName(APP_NAME);
  Object.assign(appBehavior, loadAppBehavior());
  applyLoginItemSettings();
  applyStartupProcessPriority();
  attachTrayThemeListener();

  windowState = loadWindowState();
  getManager();
  getExternalManager();
  createWindow();

  app.on("activate", () => {
    if (!focusMainWindow()) {
      createWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (!isShuttingDown) {
    event.preventDefault();
    isQuitting = true;
    shutdown().finally(() => {
      app.quit();
    });
  }
});

app.on("window-all-closed", () => {
  if (appBehavior.runInTray) {
    return;
  }
  if (process.platform !== "darwin") {
    isQuitting = true;
    app.quit();
  }
});
