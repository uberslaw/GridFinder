# GridFinder

Transparent Windows desktop overlay for checking alignment and spacing against other apps.

The **grid overlay** and the **controls panel** are separate windows:

- **Grid** — see-through frame over other apps. Hold **Ctrl** and left-drag anywhere inside to move it. Resize from the edges.
- **Controls** — floating panel with a normal grabbable top title bar. Drag that bar to move the panel anywhere.

If the controls panel ever ends up off-screen, press **Ctrl+Shift+G** (or use **Reset panel on screen**).

## Features

- Transparent always-on-top grid overlay
- Floating controls panel (separate from the grid)
- Adjustable grid resolution, line thickness, colors, major-line interval
- Measure tool — two-point distance in pixels + approximate mm/cm/inches
- Sticky vertical/horizontal guide lines
- Optional click-through on the grid (panel stays interactive)

## Requirements

- Windows 10/11
- Node.js 20+ (includes npm)

## Run

```powershell
cd C:\Users\today\Cursor\GridFinder
npm install
npm approve-scripts electron
npm install
npm start
```

## Build Windows installers

```powershell
npm run dist
```

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl + left-drag on grid | Move overlay |
| Ctrl+Shift+G | Reset / show controls panel on screen |
| 1 / 2 / 3 | (via panel) Pan / Measure / Sticky |
| Esc | Clear measure / release sticky |

## Layout

```
src/
  main.js         Two windows: overlay + controls
  preload.js
  overlay.html    Transparent grid window
  overlay.js
  overlay.css
  controls.html   Floating controls panel
  controls.js
  controls.css
assets/
```
