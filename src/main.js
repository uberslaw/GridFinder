const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require("electron");
const path = require("path");

/** @type {BrowserWindow | null} */
let overlayWindow = null;
/** @type {BrowserWindow | null} */
let controlWindow = null;

/**
 * @type {{ axis: 'x' | 'y', screenPos: number, localOffset: number } | null}
 */
let stickyGuide = null;

/** @type {Record<string, unknown>} */
let sharedSettings = {
  mode: "pan",
  spacing: 20,
  thickness: 1,
  majorEvery: 5,
  gridColor: "#d9773a",
  majorColor: "#f0c49a",
  accentColor: "#ffe6c8",
  showOrigin: true,
  stickyAxis: "x",
  useAutoPpi: true,
  ppiOverride: 96,
  alwaysOnTop: true,
  clickThrough: false,
};

const OVERLAY_MIN_WIDTH = 200;
const OVERLAY_MIN_HEIGHT = 160;
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 720;

function broadcastSettings() {
  overlayWindow?.webContents.send("settings:apply", sharedSettings);
  controlWindow?.webContents.send("settings:apply", sharedSettings);
}

function broadcastOverlayStatus(status) {
  controlWindow?.webContents.send("overlay:status", status);
}

function placeOnWorkArea(win, preferred) {
  const display = screen.getDisplayNearestPoint(
    preferred
      ? { x: preferred.x, y: preferred.y }
      : screen.getCursorScreenPoint()
  );
  const area = display.workArea;
  const bounds = win.getBounds();
  const width = bounds.width;
  const height = bounds.height;
  const x = Math.min(
    Math.max(area.x, preferred?.x ?? area.x + area.width - width - 24),
    area.x + area.width - width
  );
  const y = Math.min(
    Math.max(area.y, preferred?.y ?? area.y + 24),
    area.y + area.height - height
  );
  win.setBounds({ x: Math.round(x), y: Math.round(y), width, height }, false);
}

function resetControlPanel() {
  if (!controlWindow) {
    createControlWindow();
    return;
  }
  controlWindow.setSize(PANEL_WIDTH, Math.min(PANEL_HEIGHT, screen.getPrimaryDisplay().workAreaSize.height - 40));
  placeOnWorkArea(controlWindow);
  controlWindow.show();
  controlWindow.focus();
  controlWindow.setAlwaysOnTop(true, "screen-saver");
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const width = Math.min(900, sw - PANEL_WIDTH - 80);
  const height = Math.min(640, sh - 80);

  overlayWindow = new BrowserWindow({
    width,
    height,
    minWidth: OVERLAY_MIN_WIDTH,
    minHeight: OVERLAY_MIN_HEIGHT,
    x: Math.round(display.workArea.x + 40),
    y: Math.round(display.workArea.y + (sh - height) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    title: "GridFinder Overlay",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--gf-role=overlay"],
    },
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));

  overlayWindow.on("will-move", (event, newBounds) => {
    if (!stickyGuide || !overlayWindow) return;
    const constrained = constrainMove(newBounds);
    if (boundsChanged(constrained, newBounds)) {
      event.preventDefault();
      overlayWindow.setBounds(constrained, false);
    }
  });

  overlayWindow.on("will-resize", (event, newBounds, details) => {
    if (!stickyGuide || !overlayWindow) return;
    const constrained = constrainResize(newBounds, details?.edge);
    if (boundsChanged(constrained, newBounds)) {
      event.preventDefault();
      overlayWindow.setBounds(constrained, false);
    }
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    stickyGuide = null;
    if (controlWindow) {
      controlWindow.close();
    } else {
      app.quit();
    }
  });
}

function createControlWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const height = Math.min(PANEL_HEIGHT, area.height - 40);

  controlWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height,
    minWidth: 280,
    minHeight: 360,
    x: Math.round(area.x + area.width - PANEL_WIDTH - 24),
    y: Math.round(area.y + 24),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    hasShadow: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#1a1714",
    title: "GridFinder",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--gf-role=controls"],
    },
  });

  controlWindow.setAlwaysOnTop(true, "screen-saver");
  controlWindow.loadFile(path.join(__dirname, "controls.html"));

  controlWindow.on("closed", () => {
    controlWindow = null;
    // Closing the panel quits the app so nothing is left running invisibly.
    if (overlayWindow) {
      overlayWindow.close();
    } else {
      app.quit();
    }
  });
}

function boundsChanged(a, b) {
  return (
    a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height
  );
}

function constrainMove(bounds) {
  if (!stickyGuide) return bounds;
  const next = { ...bounds };
  if (stickyGuide.axis === "x") {
    next.x = Math.round(stickyGuide.screenPos - stickyGuide.localOffset);
  } else {
    next.y = Math.round(stickyGuide.screenPos - stickyGuide.localOffset);
  }
  return next;
}

function constrainResize(bounds, edge = "") {
  if (!stickyGuide) return bounds;

  const next = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(OVERLAY_MIN_WIDTH, bounds.width),
    height: Math.max(OVERLAY_MIN_HEIGHT, bounds.height),
  };
  const edgeLower = String(edge || "").toLowerCase();
  const screenPos = stickyGuide.screenPos;

  if (stickyGuide.axis === "x") {
    const resizingLeft =
      edgeLower.includes("left") ||
      edgeLower.includes("west") ||
      edgeLower.includes("w");
    const resizingRight =
      edgeLower.includes("right") ||
      edgeLower.includes("east") ||
      edgeLower.includes("e");

    if (resizingLeft && !resizingRight) {
      const right = bounds.x + bounds.width;
      let left = bounds.x;
      left = Math.min(left, screenPos - 1);
      left = Math.max(left, screenPos - (right - OVERLAY_MIN_WIDTH));
      next.x = Math.round(left);
      next.width = Math.max(OVERLAY_MIN_WIDTH, right - next.x);
      stickyGuide.localOffset = screenPos - next.x;
    } else {
      next.x = Math.round(screenPos - stickyGuide.localOffset);
      const minWidth = Math.ceil(stickyGuide.localOffset + 1);
      next.width = Math.max(OVERLAY_MIN_WIDTH, minWidth, next.width);
      if (next.x + next.width <= screenPos) {
        next.width = screenPos - next.x + 1;
      }
    }
  } else {
    const resizingTop =
      edgeLower.includes("top") ||
      edgeLower.includes("north") ||
      edgeLower.includes("n");
    const resizingBottom =
      edgeLower.includes("bottom") ||
      edgeLower.includes("south") ||
      edgeLower.includes("s");

    if (resizingTop && !resizingBottom) {
      const bottom = bounds.y + bounds.height;
      let top = bounds.y;
      top = Math.min(top, screenPos - 1);
      top = Math.max(top, screenPos - (bottom - OVERLAY_MIN_HEIGHT));
      next.y = Math.round(top);
      next.height = Math.max(OVERLAY_MIN_HEIGHT, bottom - next.y);
      stickyGuide.localOffset = screenPos - next.y;
    } else {
      next.y = Math.round(screenPos - stickyGuide.localOffset);
      const minHeight = Math.ceil(stickyGuide.localOffset + 1);
      next.height = Math.max(OVERLAY_MIN_HEIGHT, minHeight, next.height);
      if (next.y + next.height <= screenPos) {
        next.height = screenPos - next.y + 1;
      }
    }
  }

  return next;
}

function applyStickyToBounds(bounds) {
  if (!stickyGuide) return bounds;
  const edgeGuess = guessResizeEdge(overlayWindow?.getBounds(), bounds);
  return constrainResize(constrainMove(bounds), edgeGuess);
}

function guessResizeEdge(prev, next) {
  if (!prev || !next) return "";
  let edge = "";
  if (next.x !== prev.x) edge += "left";
  if (next.y !== prev.y) edge += "top";
  if (next.x + next.width !== prev.x + prev.width) edge += "right";
  if (next.y + next.height !== prev.y + prev.height) edge += "bottom";
  return edge;
}

function getDpiInfo() {
  const display = screen.getDisplayMatching(
    overlayWindow
      ? overlayWindow.getBounds()
      : screen.getPrimaryDisplay().bounds
  );
  const scaleFactor = display.scaleFactor || 1;
  const logicalPpi = 96;
  return {
    scaleFactor,
    logicalPpi,
    physicalPpi: logicalPpi * scaleFactor,
    size: display.size,
    bounds: display.bounds,
  };
}

function applyAlwaysOnTop(flag) {
  const value = Boolean(flag);
  sharedSettings.alwaysOnTop = value;
  if (overlayWindow) overlayWindow.setAlwaysOnTop(value, "screen-saver");
  if (controlWindow) controlWindow.setAlwaysOnTop(value, "screen-saver");
}

ipcMain.handle("app:get-role", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win === controlWindow) return "controls";
  return "overlay";
});

ipcMain.handle("settings:get", () => ({ ...sharedSettings }));

ipcMain.handle("settings:update", (_event, patch) => {
  sharedSettings = { ...sharedSettings, ...patch };
  if ("alwaysOnTop" in patch) {
    applyAlwaysOnTop(sharedSettings.alwaysOnTop);
  }
  if ("clickThrough" in patch && overlayWindow) {
    if (!sharedSettings.clickThrough) {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
  broadcastSettings();
  return { ...sharedSettings };
});

ipcMain.handle("overlay:status", (_event, status) => {
  broadcastOverlayStatus(status);
  return true;
});

ipcMain.handle("overlay:command", (_event, command) => {
  overlayWindow?.webContents.send("overlay:command", command);
  return true;
});

ipcMain.handle("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window:close", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win === controlWindow || win === overlayWindow) {
    app.quit();
    return;
  }
  win?.close();
});

ipcMain.handle("window:get-bounds", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.getBounds() ?? null;
});

ipcMain.handle("window:set-bounds", (event, bounds) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !bounds) return null;

  const current = win.getBounds();
  const isOverlay = win === overlayWindow;
  const minW = isOverlay ? OVERLAY_MIN_WIDTH : 280;
  const minH = isOverlay ? OVERLAY_MIN_HEIGHT : 360;
  let next = {
    x: bounds.x ?? current.x,
    y: bounds.y ?? current.y,
    width: Math.max(minW, bounds.width ?? current.width),
    height: Math.max(minH, bounds.height ?? current.height),
  };

  if (isOverlay) {
    next = applyStickyToBounds(next);
  }

  win.setBounds(next, false);
  return {
    bounds: win.getBounds(),
    sticky: stickyGuide ? { ...stickyGuide } : null,
  };
});

ipcMain.handle("window:move-by", (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !delta) return null;
  const current = win.getBounds();
  let next = {
    ...current,
    x: current.x + Number(delta.dx || 0),
    y: current.y + Number(delta.dy || 0),
  };
  if (win === overlayWindow) {
    next = constrainMove(next);
  }
  win.setBounds(next, false);
  return {
    bounds: win.getBounds(),
    sticky: stickyGuide ? { ...stickyGuide } : null,
  };
});

/** @type {{ win: BrowserWindow, offsetX: number, offsetY: number } | null} */
let liveDrag = null;

ipcMain.handle("window:drag-start", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  const cursor = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  liveDrag = {
    win,
    offsetX: cursor.x - bounds.x,
    offsetY: cursor.y - bounds.y,
  };
  return true;
});

ipcMain.handle("window:drag-to-cursor", () => {
  if (!liveDrag?.win || liveDrag.win.isDestroyed()) {
    liveDrag = null;
    return null;
  }
  const cursor = screen.getCursorScreenPoint();
  const current = liveDrag.win.getBounds();
  let next = {
    ...current,
    x: cursor.x - liveDrag.offsetX,
    y: cursor.y - liveDrag.offsetY,
  };
  if (liveDrag.win === overlayWindow) {
    next = constrainMove(next);
  }
  liveDrag.win.setBounds(next, false);
  return {
    bounds: liveDrag.win.getBounds(),
    sticky: stickyGuide ? { ...stickyGuide } : null,
  };
});

ipcMain.handle("window:drag-end", () => {
  liveDrag = null;
  return true;
});

ipcMain.handle("window:set-ignore-mouse-events", (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.setIgnoreMouseEvents(Boolean(ignore), options || { forward: true });
});

ipcMain.handle("panel:reset", () => {
  resetControlPanel();
  return true;
});

ipcMain.handle("panel:show", () => {
  resetControlPanel();
  return true;
});

ipcMain.handle("display:get-dpi", () => getDpiInfo());

ipcMain.handle("sticky:set", (_event, guide) => {
  if (!guide || !overlayWindow) {
    stickyGuide = null;
    return null;
  }

  const bounds = overlayWindow.getBounds();
  const axis = guide.axis === "y" ? "y" : "x";
  const localOffset = Number(guide.localOffset);

  if (!Number.isFinite(localOffset)) {
    stickyGuide = null;
    return null;
  }

  stickyGuide = {
    axis,
    localOffset,
    screenPos:
      axis === "x" ? bounds.x + localOffset : bounds.y + localOffset,
  };

  return { ...stickyGuide };
});

ipcMain.handle("sticky:clear", () => {
  stickyGuide = null;
  return null;
});

ipcMain.handle("sticky:get", () => (stickyGuide ? { ...stickyGuide } : null));

app.whenReady().then(() => {
  createOverlayWindow();
  createControlWindow();

  globalShortcut.register("CommandOrControl+Shift+G", () => {
    resetControlPanel();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createControlWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
