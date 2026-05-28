const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, nativeTheme, desktopCapturer, screen } = require("electron");
const { APP_NAME } = require("./appInfo");
const path = require("path");
const { execSync } = require("child_process");
const { ConnectionManager } = require("./connectionManager");
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
  applyStartupProcessPriority,
  applyWindowsStartupRegistration,
} = require("./startupRegistration");

const isDev = !app.isPackaged && process.env.NODE_ENV === "development";
const START_IN_TRAY_ARG = "--start-in-tray";
const ASSETS_DIR = path.join(__dirname, "assets");

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
  });
}

let mainWindow = null;
let connectionManager = null;
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
    return;
  }

  const startInTray = appBehavior.launchAtStartup && appBehavior.runInTray;

  if (process.platform === "win32") {
    // Task Scheduler gives us high launch priority and zero logon delay.
    // Registry Run entries (Electron default) cannot set process priority.
    app.setLoginItemSettings({ openAtLogin: false });
    applyWindowsStartupRegistration({
      enabled: appBehavior.launchAtStartup,
      exePath: process.execPath,
      startInTrayArg: startInTray ? START_IN_TRAY_ARG : null,
    });
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: appBehavior.launchAtStartup,
    openAsHidden: startInTray,
    path: process.execPath,
    args: startInTray ? [START_IN_TRAY_ARG] : [],
  });
}

function shouldStartHiddenInTray() {
  if (!appBehavior.runInTray) {
    return false;
  }

  if (process.argv.includes(START_IN_TRAY_ARG)) {
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
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function createWindow() {
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

  if (loginItemsChanged) {
    applyLoginItemSettings();
  }

  saveAppBehavior({
    runInTray: appBehavior.runInTray,
    launchAtStartup: appBehavior.launchAtStartup,
  });

  return {
    runInTray: appBehavior.runInTray,
    launchAtStartup: appBehavior.launchAtStartup,
  };
});

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

app.whenReady().then(() => {
  app.setName(APP_NAME);
  Object.assign(appBehavior, loadAppBehavior());
  applyLoginItemSettings();
  applyStartupProcessPriority();
  attachTrayThemeListener();

  windowState = loadWindowState();
  getManager();
  createWindow();

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
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
