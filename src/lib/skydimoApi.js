const noopUnsubscribe = () => () => {};

const skydimoStub = {
  getState: () => Promise.resolve(null),
  setOptions: () => Promise.resolve(null),
  scan: () => Promise.resolve(null),
  connect: () => Promise.reject(new Error("Skydimo API is only available in Electron")),
  connectBest: () => Promise.reject(new Error("Skydimo API is only available in Electron")),
  disconnect: () => Promise.resolve(null),
  setColor: () => Promise.resolve(null),
  setPixels: () => Promise.resolve(null),
  setAppBehavior: () =>
    Promise.resolve({
      runInTray: false,
      launchAtStartup: false,
      startupRegistration: { ok: true, error: null },
    }),
  getStartupStatus: () =>
    Promise.resolve({ registered: false, desired: false, mismatch: false }),
  suggestGradient: () =>
    Promise.reject(new Error("AI gradient suggestions require the Electron app")),
  suggestAnimation: () =>
    Promise.reject(new Error("AI animation suggestions require the Electron app")),
  listScreenSources: () => Promise.resolve([]),
  getWindowChrome: () => Promise.resolve({ isMaximized: false, isFullScreen: false }),
  minimizeWindow: () => Promise.resolve(null),
  toggleMaximizeWindow: () => Promise.resolve({ isMaximized: false, isFullScreen: false }),
  closeWindow: () => Promise.resolve(null),
  toggleDevTools: () => Promise.resolve(false),
  getShouldUseDarkColors: () =>
    Promise.resolve(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ),
  onThemeChange: () => noopUnsubscribe(),
  onWindowChromeChange: () => noopUnsubscribe(),
  onStateChange: () => noopUnsubscribe(),
  getExternalState: () =>
    Promise.resolve({
      bleAvailable: false,
      bleError: "External LED control requires the Electron app",
      poweredOn: false,
      scanning: false,
      devices: [],
      message: "External LED control requires the Electron app",
    }),
  externalScan: () => Promise.resolve(null),
  externalStopScan: () => Promise.resolve(null),
  externalRegisterSaved: () => Promise.resolve(null),
  externalConnect: () =>
    Promise.reject(new Error("External LED control requires the Electron app")),
  externalDisconnect: () => Promise.resolve(null),
  externalSetColor: () => Promise.resolve(null),
  externalSetPixels: () => Promise.resolve(null),
  externalSetPower: () => Promise.resolve(null),
  externalSetAnimation: () => Promise.resolve(null),
  externalSetBrightness: () => Promise.resolve(null),
  onExternalStateChange: () => noopUnsubscribe(),
};

export const skydimo = window.skydimo ?? skydimoStub;
