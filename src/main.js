const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require("electron");
const path = require("path");
const {
  getWorkAreaForOverlay,
  incrementToPixels,
  dockToEdge,
  growFromDock,
  applyPortion,
} = require("./layout");

/** @type {BrowserWindow | null} */
let overlayWindow = null;
/** @type {BrowserWindow | null} */
let controlWindow = null;
/** @type {BrowserWindow | null} */
let incrementWindow = null;

/**
 * @type {{ axis: 'x' | 'y', screenPos: number, localOffset: number } | null}
 */
let stickyGuide = null;

/** @type {{ edge: 'left'|'right'|'top'|'bottom' } | null} */
let dockState = null;

/** Grow/shrink step for Ctrl+Arrow after a dock. */
let growIncrement = {
  mode: "fraction",
  value: 1 / 12,
};

/** @type {Record<string, unknown>} */
let sharedSettings = {
  mode: "pan",
  lineCount: 1,
  thickness: 1,
  majorEvery: 5,
  lineBreak: 0, // 0 = solid … higher = shorter dashes down to 1px/1px
  fineTune: false,
  fineTuneStep: 0.01, // 0.01 or 0.001 of the unit toward the next line number
  gridColor: "#d9773a",
  majorColor: "#f0c49a",
  accentColor: "#ffe6c8",
  majorEnabled: true,
  accentEnabled: true,
  stickyAxis: "x",
  useAutoPpi: true,
  ppiOverride: 96,
  alwaysOnTop: true,
  clickThrough: false,
  overlayMinimized: false, // checkbox: keep grid hidden while ticked
};

/** True when click-through was enabled because grid covers panel / fullscreen. */
let clickThroughAuto = false;

/** Momentary / pinned hide reasons for the overlay window. */
const overlayHide = {
  pinned: false,
  hold: false,
  z: false,
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

function placeControlBesideOverlay() {
  if (!controlWindow) return;

  const panelHeight = Math.min(
    PANEL_HEIGHT,
    screen.getPrimaryDisplay().workAreaSize.height - 40
  );
  controlWindow.setSize(PANEL_WIDTH, panelHeight);

  if (!overlayWindow) {
    placeOnWorkArea(controlWindow);
    return;
  }

  const overlay = overlayWindow.getBounds();
  const area = screen.getDisplayMatching(overlay).workArea;
  const panel = controlWindow.getBounds();
  const gap = 8;

  let x = overlay.x + overlay.width + gap;
  let y = overlay.y;

  // Prefer right of grid; fall back to left if it won't fit.
  if (x + panel.width > area.x + area.width) {
    x = overlay.x - panel.width - gap;
  }
  if (x < area.x) x = area.x;
  if (x + panel.width > area.x + area.width) {
    x = area.x + area.width - panel.width;
  }

  if (y + panel.height > area.y + area.height) {
    y = area.y + area.height - panel.height;
  }
  if (y < area.y) y = area.y;

  controlWindow.setBounds(
    {
      x: Math.round(x),
      y: Math.round(y),
      width: panel.width,
      height: panel.height,
    },
    false
  );
}

function resetControlPanel() {
  if (!controlWindow) {
    createControlWindow();
    return;
  }
  placeControlBesideOverlay();
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
  wirePeekKeys(overlayWindow);
  if (sharedSettings.overlayMinimized) {
    overlayHide.pinned = true;
    syncOverlayVisibility();
  }
  watchBoundsForAutoClickThrough(overlayWindow);

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
  const overlay = overlayWindow?.getBounds();
  const startX = overlay
    ? Math.round(overlay.x + overlay.width + 8)
    : Math.round(area.x + area.width - PANEL_WIDTH - 24);
  const startY = overlay ? Math.round(overlay.y) : Math.round(area.y + 24);

  controlWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height,
    minWidth: 280,
    minHeight: 360,
    x: startX,
    y: startY,
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
  placeControlBesideOverlay();
  wirePeekKeys(controlWindow);
  watchBoundsForAutoClickThrough(controlWindow);
  setTimeout(() => evaluateAutoClickThrough(), 50);

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
      edgeLower === "w" ||
      edgeLower.includes("nw") ||
      edgeLower.includes("sw");

    // Prefer an explicit left/west handle over "both sides changed" guesses.
    if (resizingLeft) {
      const right = bounds.x + bounds.width;
      let left = bounds.x;
      left = Math.min(left, screenPos - 1);
      left = Math.max(left, screenPos - (right - OVERLAY_MIN_WIDTH));
      next.x = Math.round(left);
      next.width = Math.max(OVERLAY_MIN_WIDTH, right - next.x);
      stickyGuide.localOffset = screenPos - next.x;
    } else {
      // Right edge (or move): keep sticky screen X by locking left via offset.
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
      edgeLower === "n" ||
      edgeLower.includes("ne") ||
      edgeLower.includes("nw");
    const resizingBottom =
      edgeLower.includes("bottom") ||
      edgeLower.includes("south") ||
      edgeLower === "s" ||
      edgeLower.includes("se") ||
      edgeLower.includes("sw");

    if (resizingTop) {
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

function applyStickyToBounds(bounds, edgeHint) {
  if (!stickyGuide) return bounds;
  const edge =
    edgeHint || refineResizeEdge(overlayWindow?.getBounds(), bounds);
  const sized = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  return constrainResize(constrainMove(sized), edge);
}

/**
 * Pick the dominant moved edge so left-drag doesn't get treated as
 * left+right (which incorrectly expands the opposite side when sticky).
 */
function refineResizeEdge(prev, next) {
  if (!prev || !next) return "";
  const leftDelta = Math.abs(next.x - prev.x);
  const rightDelta = Math.abs(next.x + next.width - (prev.x + prev.width));
  const topDelta = Math.abs(next.y - prev.y);
  const bottomDelta = Math.abs(next.y + next.height - (prev.y + prev.height));

  let edge = "";
  if (leftDelta > 0 || rightDelta > 0) {
    edge += leftDelta >= rightDelta ? "left" : "right";
  }
  if (topDelta > 0 || bottomDelta > 0) {
    edge += topDelta >= bottomDelta ? "top" : "bottom";
  }
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
  if (win === incrementWindow) return "increments";
  return "overlay";
});

ipcMain.handle("settings:get", () => ({ ...sharedSettings }));

ipcMain.handle("settings:update", (_event, patch) => {
  sharedSettings = { ...sharedSettings, ...patch };
  if ("lineCount" in patch) {
    sharedSettings.lineCount = clampLineCount(sharedSettings.lineCount);
  }
  if ("fineTuneStep" in patch) {
    const step = Number(sharedSettings.fineTuneStep);
    sharedSettings.fineTuneStep = step <= 0.001 ? 0.001 : 0.01;
  }
  if ("alwaysOnTop" in patch) {
    applyAlwaysOnTop(sharedSettings.alwaysOnTop);
  }
  if ("clickThrough" in patch) {
    // Manual checkbox / settings change clears auto mode.
    applyClickThrough(!!sharedSettings.clickThrough);
  }
  if ("overlayMinimized" in patch) {
    setOverlayHideReason("pinned", !!sharedSettings.overlayMinimized);
  }
  broadcastSettings();
  return { ...sharedSettings };
});

function clampLineCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(80, n));
}

function applyClickThrough(enabled, { fromAuto = false } = {}) {
  sharedSettings.clickThrough = Boolean(enabled);
  if (!fromAuto) {
    clickThroughAuto = false;
  } else {
    clickThroughAuto = Boolean(enabled);
  }
  if (overlayWindow) {
    if (sharedSettings.clickThrough) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  }
  broadcastSettings();
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function isNearlyFullscreen(bounds, area) {
  const coverW = bounds.width >= area.width * 0.92;
  const coverH = bounds.height >= area.height * 0.92;
  return coverW && coverH;
}

function evaluateAutoClickThrough() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (!overlayWindow.isVisible()) return;

  const bounds = overlayWindow.getBounds();
  const area = getWorkAreaForOverlay(overlayWindow, screen);
  let shouldAuto = isNearlyFullscreen(bounds, area);

  if (
    !shouldAuto &&
    controlWindow &&
    !controlWindow.isDestroyed() &&
    controlWindow.isVisible()
  ) {
    shouldAuto = rectsOverlap(bounds, controlWindow.getBounds());
  }

  if (shouldAuto) {
    if (!sharedSettings.clickThrough) {
      applyClickThrough(true, { fromAuto: true });
    }
  } else if (clickThroughAuto) {
    applyClickThrough(false, { fromAuto: true });
  }
}

function watchBoundsForAutoClickThrough(win) {
  if (!win) return;
  const kick = () => {
    // Defer so bounds are settled after move/resize.
    setTimeout(() => evaluateAutoClickThrough(), 0);
  };
  win.on("moved", kick);
  win.on("resized", kick);
  win.on("show", kick);
}

function isOverlaySuppressed() {
  return overlayHide.pinned || overlayHide.hold || overlayHide.z;
}

function syncOverlayVisibility() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return isOverlaySuppressed();
  const hide = isOverlaySuppressed();
  if (hide) {
    if (overlayWindow.isVisible()) overlayWindow.hide();
  } else if (!overlayWindow.isVisible()) {
    overlayWindow.show();
    if (sharedSettings.alwaysOnTop) {
      overlayWindow.setAlwaysOnTop(true, "screen-saver");
    }
  }
  controlWindow?.webContents.send("overlay:visibility", {
    hidden: hide,
    reasons: { ...overlayHide },
  });
  return hide;
}

function setOverlayHideReason(reason, active) {
  if (!(reason in overlayHide)) return isOverlaySuppressed();
  overlayHide[reason] = Boolean(active);
  if (reason === "pinned") {
    sharedSettings.overlayMinimized = overlayHide.pinned;
    broadcastSettings();
  }
  return syncOverlayVisibility();
}

function wirePeekKeys(win) {
  if (!win) return;
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" && input.type !== "keyUp") return;
    if (input.key?.toLowerCase() !== "z") return;
    // Ignore when typing into fields / with modifiers
    if (input.control || input.alt || input.meta) return;
    if (input.type === "keyDown" && !input.isAutoRepeat) {
      setOverlayHideReason("z", true);
    } else if (input.type === "keyUp") {
      setOverlayHideReason("z", false);
    }
  });
}

function nudgeLineCount(direction) {
  const current = clampLineCount(sharedSettings.lineCount);
  let next;
  if (sharedSettings.fineTune) {
    const stepFactor = sharedSettings.fineTuneStep === 0.001 ? 0.001 : 0.01;
    const nextInteger = Math.floor(current) + 1;
    const distance = Math.max(1e-6, nextInteger - current);
    const step = stepFactor * distance;
    next = current + direction * step;
  } else {
    next = current + direction;
  }
  sharedSettings.lineCount = clampLineCount(next);
  broadcastSettings();
}

function applyOverlayPortion(fullAxis, fraction, snap) {
  if (!overlayWindow) return null;
  const area = getWorkAreaForOverlay(overlayWindow, screen);
  const bounds = applyPortion(
    fullAxis,
    fraction,
    snap,
    area,
    OVERLAY_MIN_WIDTH,
    OVERLAY_MIN_HEIGHT
  );
  stickyGuide = null;
  dockState =
    fullAxis === "v"
      ? { edge: snap === "end" ? "right" : snap === "start" ? "left" : "left" }
      : { edge: snap === "end" ? "bottom" : snap === "start" ? "top" : "top" };
  // For centered portions, clear dock so grow shortcuts need a fresh Ctrl+Shift dock.
  if (snap === "center" || fraction >= 0.999) dockState = null;
  overlayWindow.setBounds(bounds, false);
  evaluateAutoClickThrough();
  return { bounds: overlayWindow.getBounds(), dock: dockState };
}

function dockOverlay(edge) {
  if (!overlayWindow) return null;
  const area = getWorkAreaForOverlay(overlayWindow, screen);
  const current = overlayWindow.getBounds();
  const result = dockToEdge(
    edge,
    current,
    area,
    OVERLAY_MIN_WIDTH,
    OVERLAY_MIN_HEIGHT
  );
  stickyGuide = null;
  dockState = result.dock;
  overlayWindow.setBounds(result.bounds, false);
  evaluateAutoClickThrough();
  return { bounds: overlayWindow.getBounds(), dock: dockState };
}

function growOverlay(direction) {
  if (!overlayWindow || !dockState) return null;
  const area = getWorkAreaForOverlay(overlayWindow, screen);
  const dpi = getDpiInfo();
  const axis =
    dockState.edge === "left" || dockState.edge === "right" ? "x" : "y";
  const stepPx = incrementToPixels(growIncrement, axis, area, dpi);
  const next = growFromDock(
    dockState,
    direction,
    overlayWindow.getBounds(),
    area,
    stepPx,
    OVERLAY_MIN_WIDTH,
    OVERLAY_MIN_HEIGHT
  );
  if (!next) return null;
  stickyGuide = null;
  overlayWindow.setBounds(next, false);
  evaluateAutoClickThrough();
  return { bounds: overlayWindow.getBounds(), dock: dockState };
}

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
    next = applyStickyToBounds(next, bounds.edge);
  }

  win.setBounds(next, false);
  if (isOverlay || win === controlWindow) {
    evaluateAutoClickThrough();
  }
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

ipcMain.handle("overlay:hold-hide", (_event, active) => {
  return setOverlayHideReason("hold", !!active);
});

ipcMain.handle("overlay:set-minimized", (_event, minimized) => {
  return setOverlayHideReason("pinned", !!minimized);
});

ipcMain.handle("overlay:visibility-get", () => ({
  hidden: isOverlaySuppressed(),
  reasons: { ...overlayHide },
}));

ipcMain.handle("panel:reset", () => {
  resetControlPanel();
  return true;
});

ipcMain.handle("panel:show", () => {
  resetControlPanel();
  return true;
});

ipcMain.handle("layout:portion", (_event, spec) => {
  const fullAxis = spec?.fullAxis === "h" ? "h" : "v";
  const fraction = Number(spec?.fraction) || 1;
  const snap = ["start", "center", "end"].includes(spec?.snap)
    ? spec.snap
    : "start";
  return applyOverlayPortion(fullAxis, fraction, snap);
});

ipcMain.handle("layout:dock", (_event, edge) => dockOverlay(edge));

ipcMain.handle("layout:grow", (_event, direction) => growOverlay(direction));

ipcMain.handle("increment:get", () => ({ ...growIncrement }));

ipcMain.handle("increment:set", (_event, next) => {
  if (!next || typeof next !== "object") return { ...growIncrement };
  const mode = String(next.mode || growIncrement.mode);
  const allowed = ["fraction", "percent", "pixel", "mm", "inch"];
  growIncrement = {
    mode: allowed.includes(mode) ? mode : "fraction",
    value: Number(next.value),
  };
  if (!Number.isFinite(growIncrement.value) || growIncrement.value <= 0) {
    growIncrement.value = mode === "percent" ? 10 : mode === "pixel" ? 50 : 1 / 12;
  }
  incrementWindow?.webContents.send("increment:apply", growIncrement);
  controlWindow?.webContents.send("increment:apply", growIncrement);
  return { ...growIncrement };
});

ipcMain.handle("increment:toggle-window", () => {
  toggleIncrementWindow();
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

function createIncrementWindow() {
  if (incrementWindow) {
    incrementWindow.focus();
    return;
  }

  const area = screen.getPrimaryDisplay().workArea;
  incrementWindow = new BrowserWindow({
    width: 340,
    height: 420,
    minWidth: 300,
    minHeight: 320,
    x: Math.round(area.x + area.width / 2 - 170),
    y: Math.round(area.y + 80),
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    hasShadow: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#1a1714",
    title: "GridFinder Increments",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--gf-role=increments"],
    },
  });

  incrementWindow.setAlwaysOnTop(true, "screen-saver");
  incrementWindow.loadFile(path.join(__dirname, "increments.html"));
  wirePeekKeys(incrementWindow);
  incrementWindow.on("closed", () => {
    incrementWindow = null;
  });
}

function toggleIncrementWindow() {
  if (incrementWindow) {
    incrementWindow.close();
    return;
  }
  createIncrementWindow();
}

function registerShortcuts() {
  const bind = (accelerator, fn) => {
    try {
      globalShortcut.register(accelerator, fn);
    } catch (_) {
      /* ignore unsupported accelerators */
    }
  };

  // On macOS, Ctrl+Arrow is Spaces/Mission Control — use Command instead.
  const isMac = process.platform === "darwin";
  const arrowMod = isMac ? "Command" : "Control";

  // Click-through toggle
  bind("CommandOrControl+Shift+G", () => {
    applyClickThrough(!sharedSettings.clickThrough);
  });

  // Reset / show controls panel
  bind("CommandOrControl+Shift+P", () => {
    resetControlPanel();
  });

  // Open increment settings
  bind("CommandOrControl+Shift+I", () => {
    toggleIncrementWindow();
  });

  // Zoom resolution (+ / -)
  const zoomIn = () => nudgeLineCount(1);
  const zoomOut = () => nudgeLineCount(-1);
  bind("Plus", zoomIn);
  bind("numadd", zoomIn);
  bind("=", zoomIn);
  bind("Minus", zoomOut);
  bind("numsub", zoomOut);
  bind("-", zoomOut);

  // Dock + full stretch on perpendicular axis
  bind(`${arrowMod}+Shift+Left`, () => dockOverlay("left"));
  bind(`${arrowMod}+Shift+Right`, () => dockOverlay("right"));
  bind(`${arrowMod}+Shift+Up`, () => dockOverlay("top"));
  bind(`${arrowMod}+Shift+Down`, () => dockOverlay("bottom"));

  // Grow/shrink from docked edge
  bind(`${arrowMod}+Left`, () => growOverlay("left"));
  bind(`${arrowMod}+Right`, () => growOverlay("right"));
  bind(`${arrowMod}+Up`, () => growOverlay("up"));
  bind(`${arrowMod}+Down`, () => growOverlay("down"));

  // Portion presets
  bind("CommandOrControl+Alt+1", () =>
    applyOverlayPortion("v", 1 / 3, "start")
  );
  bind("CommandOrControl+Alt+2", () =>
    applyOverlayPortion("v", 2 / 3, "start")
  );
  bind("CommandOrControl+Alt+3", () => applyOverlayPortion("v", 1, "start"));
  bind("CommandOrControl+Alt+4", () =>
    applyOverlayPortion("h", 1 / 3, "start")
  );
  bind("CommandOrControl+Alt+5", () =>
    applyOverlayPortion("h", 2 / 3, "start")
  );
  bind("CommandOrControl+Alt+6", () => applyOverlayPortion("h", 1, "start"));
}

ipcMain.handle("app:get-platform", () => ({
  platform: process.platform,
  isMac: process.platform === "darwin",
  arrowMod: process.platform === "darwin" ? "⌘" : "Ctrl",
  arrowModName: process.platform === "darwin" ? "Command" : "Ctrl",
}));

app.whenReady().then(() => {
  createOverlayWindow();
  createControlWindow();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
      createControlWindow();
      registerShortcuts();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
