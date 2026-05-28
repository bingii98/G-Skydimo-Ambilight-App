const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("skydimo", {
  getState: () => ipcRenderer.invoke("connection:getState"),
  setOptions: (options) => ipcRenderer.invoke("connection:setOptions", options),
  scan: () => ipcRenderer.invoke("connection:scan"),
  connect: (port) => ipcRenderer.invoke("connection:connect", port),
  connectBest: () => ipcRenderer.invoke("connection:connectBest"),
  disconnect: () => ipcRenderer.invoke("connection:disconnect"),
  setColor: (red, green, blue, ledCount) =>
    ipcRenderer.invoke("device:setColor", red, green, blue, ledCount),
  setPixels: (pixels, ledCount) =>
    ipcRenderer.invoke("device:setPixels", pixels, ledCount),
  setAppBehavior: (behavior) => ipcRenderer.invoke("app:setBehavior", behavior),
  getStartupStatus: () => ipcRenderer.invoke("app:getStartupStatus"),
  suggestGradient: (options) =>
    ipcRenderer.invoke("openai:suggestGradient", options),
  suggestAnimation: (options) =>
    ipcRenderer.invoke("openai:suggestAnimation", options),
  listScreenSources: () => ipcRenderer.invoke("screen:listSources"),
  getWindowChrome: () => ipcRenderer.invoke("window:getChrome"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  toggleDevTools: () => ipcRenderer.invoke("window:toggleDevTools"),
  getShouldUseDarkColors: () => ipcRenderer.invoke("theme:getShouldUseDarkColors"),
  onThemeChange: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("theme:updated", listener);
    return () => ipcRenderer.removeListener("theme:updated", listener);
  },
  onWindowChromeChange: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("window:chromeChanged", listener);
    return () => ipcRenderer.removeListener("window:chromeChanged", listener);
  },
  onStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("connection:state", listener);
    return () => ipcRenderer.removeListener("connection:state", listener);
  },
  getExternalState: () => ipcRenderer.invoke("externalLed:getState"),
  externalScan: () => ipcRenderer.invoke("externalLed:scan"),
  externalStopScan: () => ipcRenderer.invoke("externalLed:stopScan"),
  externalRegisterSaved: (deviceIds) =>
    ipcRenderer.invoke("externalLed:registerSaved", deviceIds),
  externalConnect: (deviceId) => ipcRenderer.invoke("externalLed:connect", deviceId),
  externalDisconnect: (deviceId) => ipcRenderer.invoke("externalLed:disconnect", deviceId),
  externalSetColor: (deviceId, red, green, blue, brightness) =>
    ipcRenderer.invoke("externalLed:setColor", deviceId, red, green, blue, brightness),
  externalSetPixels: (deviceId, pixels, brightness) =>
    ipcRenderer.invoke("externalLed:setPixels", deviceId, pixels, brightness),
  externalSetPower: (deviceId, poweredOn) =>
    ipcRenderer.invoke("externalLed:setPower", deviceId, poweredOn),
  externalSetAnimation: (deviceId, mode, speed) =>
    ipcRenderer.invoke("externalLed:setAnimation", deviceId, mode, speed),
  externalSetBrightness: (deviceId, brightness) =>
    ipcRenderer.invoke("externalLed:setBrightness", deviceId, brightness),
  onExternalStateChange: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("externalLed:state", listener);
    return () => ipcRenderer.removeListener("externalLed:state", listener);
  },
});
