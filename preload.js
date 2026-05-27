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
});
