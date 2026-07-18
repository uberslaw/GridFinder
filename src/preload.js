const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("gridFinder", {
  getRole: () => ipcRenderer.invoke("app:get-role"),
  getPlatform: () => ipcRenderer.invoke("app:get-platform"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  onSettings: (handler) => {
    const listener = (_event, settings) => handler(settings);
    ipcRenderer.on("settings:apply", listener);
    return () => ipcRenderer.removeListener("settings:apply", listener);
  },
  sendOverlayStatus: (status) => ipcRenderer.invoke("overlay:status", status),
  onOverlayStatus: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on("overlay:status", listener);
    return () => ipcRenderer.removeListener("overlay:status", listener);
  },
  sendOverlayCommand: (command) => ipcRenderer.invoke("overlay:command", command),
  onOverlayCommand: (handler) => {
    const listener = (_event, command) => handler(command);
    ipcRenderer.on("overlay:command", listener);
    return () => ipcRenderer.removeListener("overlay:command", listener);
  },
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  getBounds: () => ipcRenderer.invoke("window:get-bounds"),
  setBounds: (bounds) => ipcRenderer.invoke("window:set-bounds", bounds),
  moveBy: (delta) => ipcRenderer.invoke("window:move-by", delta),
  dragStart: () => ipcRenderer.invoke("window:drag-start"),
  dragToCursor: () => ipcRenderer.invoke("window:drag-to-cursor"),
  dragEnd: () => ipcRenderer.invoke("window:drag-end"),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.invoke("window:set-ignore-mouse-events", ignore, options),
  resetPanel: () => ipcRenderer.invoke("panel:reset"),
  showPanel: () => ipcRenderer.invoke("panel:show"),
  holdHideOverlay: (active) => ipcRenderer.invoke("overlay:hold-hide", active),
  setOverlayMinimized: (minimized) =>
    ipcRenderer.invoke("overlay:set-minimized", minimized),
  getOverlayVisibility: () => ipcRenderer.invoke("overlay:visibility-get"),
  onOverlayVisibility: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on("overlay:visibility", listener);
    return () => ipcRenderer.removeListener("overlay:visibility", listener);
  },

  applyPortion: (spec) => ipcRenderer.invoke("layout:portion", spec),
  dock: (edge) => ipcRenderer.invoke("layout:dock", edge),
  grow: (direction) => ipcRenderer.invoke("layout:grow", direction),
  getIncrement: () => ipcRenderer.invoke("increment:get"),
  setIncrement: (next) => ipcRenderer.invoke("increment:set", next),
  toggleIncrementWindow: () => ipcRenderer.invoke("increment:toggle-window"),
  onIncrement: (handler) => {
    const listener = (_event, value) => handler(value);
    ipcRenderer.on("increment:apply", listener);
    return () => ipcRenderer.removeListener("increment:apply", listener);
  },
  getDpi: () => ipcRenderer.invoke("display:get-dpi"),
  setSticky: (guide) => ipcRenderer.invoke("sticky:set", guide),
  clearSticky: () => ipcRenderer.invoke("sticky:clear"),
  getSticky: () => ipcRenderer.invoke("sticky:get"),
});
