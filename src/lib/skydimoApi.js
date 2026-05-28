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
};

export const skydimo = window.skydimo ?? skydimoStub;
