/**
 * Overlay layout helpers: screen portions, dock+grow, increment → pixels.
 */

function getWorkAreaForOverlay(overlayWindow, screen) {
  if (!overlayWindow) return screen.getPrimaryDisplay().workArea;
  return screen.getDisplayMatching(overlayWindow.getBounds()).workArea;
}

function clampBoundsToArea(bounds, area, minW, minH) {
  const width = Math.max(minW, Math.min(bounds.width, area.width));
  const height = Math.max(minH, Math.min(bounds.height, area.height));
  let x = bounds.x;
  let y = bounds.y;
  if (x < area.x) x = area.x;
  if (y < area.y) y = area.y;
  if (x + width > area.x + area.width) x = area.x + area.width - width;
  if (y + height > area.y + area.height) y = area.y + area.height - height;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * @param {{ mode: string, value: number }} increment
 * @param {'x'|'y'} axis
 * @param {Electron.Rectangle} area
 * @param {{ logicalPpi: number }} dpi
 */
function incrementToPixels(increment, axis, area, dpi) {
  const axisSize = axis === "x" ? area.width : area.height;
  const mode = increment?.mode || "fraction";
  const value = Number(increment?.value);
  const ppi = dpi?.logicalPpi || 96;

  if (!Number.isFinite(value) || value <= 0) {
    return Math.max(1, Math.round(axisSize / 12));
  }

  switch (mode) {
    case "percent":
      return Math.max(1, Math.round((axisSize * value) / 100));
    case "pixel":
      return Math.max(1, Math.round(value));
    case "mm":
      return Math.max(1, Math.round((value / 25.4) * ppi));
    case "inch":
      return Math.max(1, Math.round(value * ppi));
    case "fraction":
    default:
      return Math.max(1, Math.round(axisSize * value));
  }
}

/**
 * Dock overlay to an edge and expand fully on the perpendicular axis.
 * @returns {{ bounds: object, dock: { edge: string } }}
 */
function dockToEdge(edge, current, area, minW, minH) {
  const next = { ...current };
  if (edge === "left") {
    next.x = area.x;
    next.y = area.y;
    next.height = area.height;
    next.width = Math.min(Math.max(minW, current.width), area.width);
  } else if (edge === "right") {
    next.width = Math.min(Math.max(minW, current.width), area.width);
    next.height = area.height;
    next.y = area.y;
    next.x = area.x + area.width - next.width;
  } else if (edge === "top") {
    next.y = area.y;
    next.x = area.x;
    next.width = area.width;
    next.height = Math.min(Math.max(minH, current.height), area.height);
  } else if (edge === "bottom") {
    next.height = Math.min(Math.max(minH, current.height), area.height);
    next.width = area.width;
    next.x = area.x;
    next.y = area.y + area.height - next.height;
  }
  return {
    bounds: clampBoundsToArea(next, area, minW, minH),
    dock: { edge },
  };
}

/**
 * Grow/shrink from a docked edge using Ctrl+Arrow (no Shift).
 * Opposite arrow grows; arrow toward dock edge shrinks.
 */
function growFromDock(dock, direction, current, area, stepPx, minW, minH) {
  if (!dock?.edge) return null;
  const next = { ...current };
  const step = Math.max(1, Math.round(stepPx));

  if (dock.edge === "left") {
    if (direction === "right") next.width += step;
    else if (direction === "left") next.width -= step;
    else return null;
    next.x = area.x;
    next.y = area.y;
    next.height = area.height;
  } else if (dock.edge === "right") {
    if (direction === "left") {
      next.width += step;
      next.x = area.x + area.width - next.width;
    } else if (direction === "right") {
      next.width -= step;
      next.x = area.x + area.width - next.width;
    } else return null;
    next.y = area.y;
    next.height = area.height;
  } else if (dock.edge === "top") {
    if (direction === "down") next.height += step;
    else if (direction === "up") next.height -= step;
    else return null;
    next.y = area.y;
    next.x = area.x;
    next.width = area.width;
  } else if (dock.edge === "bottom") {
    if (direction === "up") {
      next.height += step;
      next.y = area.y + area.height - next.height;
    } else if (direction === "down") {
      next.height -= step;
      next.y = area.y + area.height - next.height;
    } else return null;
    next.x = area.x;
    next.width = area.width;
  } else {
    return null;
  }

  return clampBoundsToArea(next, area, minW, minH);
}

/**
 * Apply a screen-portion preset.
 * @param {'h'|'v'} fullAxis axis that spans the full work area
 * @param {number} fraction portion of the other axis (1/3, 2/3, 1)
 * @param {'start'|'center'|'end'} snap
 */
function applyPortion(fullAxis, fraction, snap, area, minW, minH) {
  const frac = Math.max(0.05, Math.min(1, fraction));
  let width;
  let height;
  let x;
  let y;

  if (fullAxis === "v") {
    height = area.height;
    width = Math.max(minW, Math.round(area.width * frac));
    y = area.y;
    if (snap === "start") x = area.x;
    else if (snap === "end") x = area.x + area.width - width;
    else x = area.x + Math.round((area.width - width) / 2);
  } else {
    width = area.width;
    height = Math.max(minH, Math.round(area.height * frac));
    x = area.x;
    if (snap === "start") y = area.y;
    else if (snap === "end") y = area.y + area.height - height;
    else y = area.y + Math.round((area.height - height) / 2);
  }

  return clampBoundsToArea({ x, y, width, height }, area, minW, minH);
}

module.exports = {
  getWorkAreaForOverlay,
  clampBoundsToArea,
  incrementToPixels,
  dockToEdge,
  growFromDock,
  applyPortion,
};
