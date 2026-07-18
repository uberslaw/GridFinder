(() => {
  const api = window.gridFinder;
  const canvas = document.getElementById("gridCanvas");
  const ctx = canvas.getContext("2d");
  const measureHud = document.getElementById("measureHud");
  const stickyHud = document.getElementById("stickyHud");

  const state = {
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
    clickThrough: false,
    measurePoints: [],
    hoverPoint: null,
    stickyPreviewOffset: null,
    stickyActive: null,
    dpi: null,
    dpr: window.devicePixelRatio || 1,
  };

  function hexToRgba(hex, alpha) {
    const raw = hex.replace("#", "");
    const full =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    const num = parseInt(full, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  function snapToGrid(value, spacing) {
    return Math.round(value / spacing) * spacing;
  }

  function effectivePpi() {
    if (state.useAutoPpi && state.dpi) return state.dpi.logicalPpi || 96;
    return state.ppiOverride || 96;
  }

  function formatDistance(px) {
    const inches = px / effectivePpi();
    const mm = inches * 25.4;
    const cm = mm / 10;
    const metric =
      mm >= 10
        ? `${cm.toFixed(2)} cm (${mm.toFixed(1)} mm)`
        : `${mm.toFixed(2)} mm`;
    return {
      px: `${px.toFixed(1)} px`,
      metric,
      inches: `${inches.toFixed(3)} in`,
    };
  }

  function applySettings(settings) {
    if (!settings) return;
    Object.assign(state, {
      mode: settings.mode ?? state.mode,
      spacing: settings.spacing ?? state.spacing,
      thickness: settings.thickness ?? state.thickness,
      majorEvery: settings.majorEvery ?? state.majorEvery,
      gridColor: settings.gridColor ?? state.gridColor,
      majorColor: settings.majorColor ?? state.majorColor,
      accentColor: settings.accentColor ?? state.accentColor,
      showOrigin: settings.showOrigin ?? state.showOrigin,
      stickyAxis: settings.stickyAxis ?? state.stickyAxis,
      useAutoPpi: settings.useAutoPpi ?? state.useAutoPpi,
      ppiOverride: settings.ppiOverride ?? state.ppiOverride,
      clickThrough: settings.clickThrough ?? state.clickThrough,
    });

    document.body.classList.remove("mode-pan", "mode-measure", "mode-sticky");
    document.body.classList.add(`mode-${state.mode}`);

    if (state.mode !== "measure") state.hoverPoint = null;
    if (state.mode !== "sticky") state.stickyPreviewOffset = null;

    // Click-through only applies to the overlay; the controls window stays usable.
    if (state.clickThrough) {
      api.setIgnoreMouseEvents?.(true, { forward: true });
    } else {
      api.setIgnoreMouseEvents?.(false);
    }

    draw();
    publishStatus();
  }

  async function clearMeasure() {
    state.measurePoints = [];
    state.hoverPoint = null;
    draw();
    publishStatus();
  }

  async function clearStickyGuide() {
    await api.clearSticky?.();
    state.stickyActive = null;
    state.stickyPreviewOffset = null;
    draw();
    publishStatus();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * state.dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    draw();
  }

  function drawGrid(width, height) {
    const { spacing, thickness, majorEvery, gridColor, majorColor } = state;
    ctx.clearRect(0, 0, width, height);
    // Keep enough alpha for Windows transparent-window hit testing
    ctx.fillStyle = "rgba(20, 16, 12, 0.06)";
    ctx.fillRect(0, 0, width, height);

    const minorWidth = thickness;
    const majorWidth = Math.max(thickness * 1.6, thickness + 0.5);

    for (let x = 0, i = 0; x <= width + 0.5; x += spacing, i += 1) {
      const isMajor = i % majorEvery === 0;
      ctx.beginPath();
      ctx.strokeStyle = isMajor
        ? hexToRgba(majorColor, 0.72)
        : hexToRgba(gridColor, 0.45);
      ctx.lineWidth = isMajor ? majorWidth : minorWidth;
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }

    for (let y = 0, i = 0; y <= height + 0.5; y += spacing, i += 1) {
      const isMajor = i % majorEvery === 0;
      ctx.beginPath();
      ctx.strokeStyle = isMajor
        ? hexToRgba(majorColor, 0.72)
        : hexToRgba(gridColor, 0.45);
      ctx.lineWidth = isMajor ? majorWidth : minorWidth;
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
      ctx.stroke();
    }

    if (state.showOrigin) {
      const cx = Math.round(width / 2) + 0.5;
      const cy = Math.round(height / 2) + 0.5;
      ctx.beginPath();
      ctx.strokeStyle = hexToRgba(state.accentColor, 0.9);
      ctx.lineWidth = Math.max(1.5, thickness + 0.5);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();
    }
  }

  function drawMeasure(width, height) {
    const points = state.measurePoints;
    if (!points.length && !state.hoverPoint) {
      measureHud.classList.add("hidden");
      return;
    }

    ctx.save();
    ctx.strokeStyle = hexToRgba(state.accentColor, 0.95);
    ctx.fillStyle = hexToRgba(state.accentColor, 0.95);
    ctx.lineWidth = Math.max(1.5, state.thickness);

    const drawPoint = (p, label) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "11px Segoe UI, sans-serif";
      ctx.fillText(label, p.x + 8, p.y - 8);
    };

    if (points[0]) drawPoint(points[0], "A");
    if (points[1]) drawPoint(points[1], "B");

    const end =
      points.length === 1 && state.hoverPoint ? state.hoverPoint : points[1] || null;

    if (points[0] && end) {
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = hexToRgba(state.majorColor, 0.55);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(end.x, points[0].y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      const dx = end.x - points[0].x;
      const dy = end.y - points[0].y;
      const dist = Math.hypot(dx, dy);
      const midX = (points[0].x + end.x) / 2;
      const midY = (points[0].y + end.y) / 2;
      const formatted = formatDistance(dist);
      measureHud.textContent = `${formatted.px} · ${formatted.metric}`;
      measureHud.classList.remove("hidden");
      measureHud.style.left = `${Math.min(width - 180, Math.max(8, midX))}px`;
      measureHud.style.top = `${Math.min(height - 40, Math.max(8, midY))}px`;
    } else {
      measureHud.classList.add("hidden");
    }
    ctx.restore();
  }

  function drawStickyPreview(width, height) {
    const offset = state.stickyActive?.localOffset ?? state.stickyPreviewOffset;
    if (offset == null) {
      stickyHud.classList.add("hidden");
      return;
    }

    const axis = state.stickyActive?.axis ?? state.stickyAxis;
    ctx.save();
    ctx.strokeStyle = state.stickyActive
      ? hexToRgba("#8fad6e", 0.95)
      : hexToRgba(state.accentColor, 0.85);
    ctx.lineWidth = Math.max(2, state.thickness + 1);
    ctx.setLineDash(state.stickyActive ? [] : [6, 4]);
    ctx.beginPath();
    if (axis === "x") {
      const x = Math.round(offset) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      stickyHud.textContent = state.stickyActive
        ? `Sticky V @ ${Math.round(offset)} px`
        : `Pin vertical @ ${Math.round(offset)} px`;
      stickyHud.style.left = `${Math.min(width - 160, Math.max(8, offset + 8))}px`;
      stickyHud.style.top = "36px";
    } else {
      const y = Math.round(offset) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      stickyHud.textContent = state.stickyActive
        ? `Sticky H @ ${Math.round(offset)} px`
        : `Pin horizontal @ ${Math.round(offset)} px`;
      stickyHud.style.left = "12px";
      stickyHud.style.top = `${Math.min(height - 40, Math.max(36, offset + 8))}px`;
    }
    ctx.stroke();
    ctx.restore();
    stickyHud.classList.remove("hidden");
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    drawGrid(rect.width, rect.height);
    if (state.mode === "measure" || state.measurePoints.length) {
      drawMeasure(rect.width, rect.height);
    } else {
      measureHud.classList.add("hidden");
    }
    if (state.mode === "sticky" || state.stickyActive) {
      drawStickyPreview(rect.width, rect.height);
    } else if (!state.stickyActive) {
      stickyHud.classList.add("hidden");
    }
  }

  function canvasPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function publishStatus() {
    const points = state.measurePoints;
    let measure = {
      distance: "—",
      delta: "—",
      metric: "—",
    };
    if (points.length === 1) {
      measure.distance = "Pick point B";
    } else if (points.length >= 2) {
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      const dist = Math.hypot(dx, dy);
      const formatted = formatDistance(dist);
      measure = {
        distance: formatted.px,
        delta: `${dx.toFixed(1)} / ${dy.toFixed(1)}`,
        metric: `${formatted.metric} · ${formatted.inches}`,
      };
    }

    let sticky = { status: "Off", detail: "—" };
    if (state.stickyActive) {
      const axisLabel = state.stickyActive.axis === "x" ? "Vertical" : "Horizontal";
      sticky = {
        status: "Pinned",
        detail: `${axisLabel} · local ${Math.round(
          state.stickyActive.localOffset
        )} px · screen ${Math.round(state.stickyActive.screenPos)} px`,
      };
    }

    api.sendOverlayStatus?.({
      measure,
      sticky,
      dpi: state.dpi,
    });
  }

  // Ctrl/Alt + left-drag (or middle-mouse drag) anywhere on the overlay to move it.
  // Drag is driven from the main process using the screen cursor so it stays smooth on Windows.
  (() => {
    let dragging = false;

    const beginDrag = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      document.body.classList.add("ctrl-drag");
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch (_) {
        /* ignore */
      }
      await api.dragStart?.();
    };

    const shouldDrag = (event) =>
      event.button === 0 && (event.ctrlKey || event.metaKey || event.altKey);

    const onPointerDown = (event) => {
      if (state.clickThrough) return;
      if (event.button === 1 || shouldDrag(event)) {
        beginDrag(event);
      }
    };

    const onPointerMove = async (event) => {
      if (!dragging) return;
      const result = await api.dragToCursor?.();
      if (result?.sticky) {
        state.stickyActive = result.sticky;
        publishStatus();
        draw();
      }
    };

    const endDrag = async (event) => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("ctrl-drag");
      try {
        if (event?.pointerId != null) canvas.releasePointerCapture?.(event.pointerId);
      } catch (_) {
        /* ignore */
      }
      await api.dragEnd?.();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", () => endDrag());
  })();

  // Resize handles
  (() => {
    const handles = document.querySelectorAll(".resize-handles .handle");
    let resizing = null;

    handles.forEach((handle) => {
      handle.addEventListener("mousedown", (event) => {
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        resizing = {
          edge: handle.dataset.edge,
          startX: event.screenX,
          startY: event.screenY,
        };
        api.getBounds().then((bounds) => {
          if (!bounds) return;
          resizing.startBounds = { ...bounds };
        });
      });
    });

    window.addEventListener("mousemove", async (event) => {
      if (!resizing?.startBounds) return;
      const dx = event.screenX - resizing.startX;
      const dy = event.screenY - resizing.startY;
      const b = { ...resizing.startBounds };
      const edge = resizing.edge;
      if (edge.includes("e")) b.width = resizing.startBounds.width + dx;
      if (edge.includes("s")) b.height = resizing.startBounds.height + dy;
      if (edge.includes("w")) {
        b.x = resizing.startBounds.x + dx;
        b.width = resizing.startBounds.width - dx;
      }
      if (edge.includes("n")) {
        b.y = resizing.startBounds.y + dy;
        b.height = resizing.startBounds.height - dy;
      }
      const result = await api.setBounds(b);
      if (result?.sticky) {
        state.stickyActive = result.sticky;
        publishStatus();
        draw();
      }
    });

    window.addEventListener("mouseup", () => {
      resizing = null;
    });
  })();

  canvas.addEventListener("mousemove", (event) => {
    if (event.ctrlKey || event.metaKey) return;
    const p = canvasPointFromEvent(event);
    if (state.mode === "measure" && state.measurePoints.length === 1) {
      state.hoverPoint = p;
      draw();
      return;
    }
    if (state.mode === "sticky" && !state.stickyActive) {
      state.stickyPreviewOffset =
        state.stickyAxis === "x"
          ? snapToGrid(p.x, state.spacing)
          : snapToGrid(p.y, state.spacing);
      draw();
    }
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverPoint = null;
    if (!state.stickyActive) state.stickyPreviewOffset = null;
    draw();
  });

  canvas.addEventListener("click", async (event) => {
    if (event.ctrlKey || event.metaKey) return;
    const p = canvasPointFromEvent(event);

    if (state.mode === "measure") {
      if (state.measurePoints.length >= 2) state.measurePoints = [];
      state.measurePoints.push({ x: p.x, y: p.y });
      if (state.measurePoints.length === 2) state.hoverPoint = null;
      draw();
      publishStatus();
      return;
    }

    if (state.mode === "sticky") {
      const offset =
        state.stickyAxis === "x"
          ? snapToGrid(p.x, state.spacing)
          : snapToGrid(p.y, state.spacing);
      const guide = await api.setSticky({
        axis: state.stickyAxis,
        localOffset: offset,
      });
      state.stickyActive = guide;
      state.stickyPreviewOffset = offset;
      draw();
      publishStatus();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.mode === "measure") clearMeasure();
      if (state.mode === "sticky" && state.stickyActive) clearStickyGuide();
    }
  });

  api.onOverlayCommand?.((command) => {
    if (command === "clearMeasure") clearMeasure();
    if (command === "clearSticky") clearStickyGuide();
  });

  window.addEventListener("resize", resizeCanvas);

  setInterval(async () => {
    const guide = await api.getSticky?.();
    const prev = state.stickyActive;
    const changed =
      (!!guide !== !!prev) ||
      (guide &&
        prev &&
        (guide.axis !== prev.axis ||
          guide.localOffset !== prev.localOffset ||
          guide.screenPos !== prev.screenPos));
    if (changed) {
      state.stickyActive = guide;
      publishStatus();
      draw();
    }
  }, 500);

  api.onSettings?.((settings) => applySettings(settings));

  (async () => {
    state.dpi = await api.getDpi?.();
    const settings = await api.getSettings?.();
    applySettings(settings);
    resizeCanvas();
    publishStatus();
  })();
})();
