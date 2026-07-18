(() => {
  const api = window.gridFinder;

  const modeHelp = document.getElementById("modeHelp");
  const stickyStatus = document.getElementById("stickyStatus");
  const stickyDetail = document.getElementById("stickyDetail");
  const dpiNote = document.getElementById("dpiNote");
  const measureReadout = document.getElementById("measureReadout");

  const lineCountSlider = document.getElementById("lineCountSlider");
  const thicknessSlider = document.getElementById("thicknessSlider");
  const lineBreakSlider = document.getElementById("lineBreakSlider");
  const majorEverySlider = document.getElementById("majorEverySlider");
  const majorEveryField = document.getElementById("majorEveryField");
  const ppiSlider = document.getElementById("ppiSlider");
  const useAutoPpi = document.getElementById("useAutoPpi");
  const gridColorInput = document.getElementById("gridColor");
  const majorColorInput = document.getElementById("majorColor");
  const accentColorInput = document.getElementById("accentColor");
  const toggleMajor = document.getElementById("toggleMajor");
  const toggleAccent = document.getElementById("toggleAccent");
  const paletteName = document.getElementById("paletteName");
  const palettePreview = document.getElementById("palettePreview");
  const customPaletteName = document.getElementById("customPaletteName");
  const alwaysOnTop = document.getElementById("alwaysOnTop");
  const clickThrough = document.getElementById("clickThrough");
  const overlayMinimized = document.getElementById("overlayMinimized");
  const btnHoldHide = document.getElementById("btnHoldHide");
  const btnFineTune = document.getElementById("btnFineTune");
  const fineTuneSteps = document.getElementById("fineTuneSteps");

  const lineCountValue = document.getElementById("lineCountValue");
  const thicknessValue = document.getElementById("thicknessValue");
  const lineBreakValue = document.getElementById("lineBreakValue");
  const majorEveryValue = document.getElementById("majorEveryValue");
  const ppiValue = document.getElementById("ppiValue");

  let settingsCache = {
    lineCount: 1,
    fineTune: false,
    fineTuneStep: 0.01,
  };

  const MODE_HELP = {
    pan: "Ctrl + drag the grid to move it. Resize from the frame edges.",
    measure:
      "Click point A, then point B on the grid. Distance shows in pixels and approximate mm/cm.",
    sticky:
      "Pick Vertical or Horizontal, then click a gridline on the overlay to pin it to the screen.",
  };

  function lineLabel(count) {
    const n = Number(count) || 1;
    if (Math.abs(n - Math.round(n)) < 1e-9) {
      return Math.round(n) === 1 ? "1 line" : `${Math.round(n)} lines`;
    }
    const step = Number(settingsCache.fineTuneStep);
    const decimals = step <= 0.001 ? 3 : step <= 0.01 ? 2 : 1;
    return `${n.toFixed(decimals)} lines`;
  }

  function breakLabel(step) {
    const n = Math.max(0, Math.min(8, Number(step) || 0));
    if (n <= 0) return "Solid";
    const unit = 2 ** (8 - n);
    if (unit === 1) return "1px dots";
    return `${unit}px dash / ${unit}px gap`;
  }

  function syncLabels(settings) {
    settingsCache = { ...settingsCache, ...settings };
    const count = Number(settings.lineCount) || 1;
    lineCountSlider.value = String(Math.min(80, Math.max(1, Math.round(count))));
    thicknessSlider.value = String(settings.thickness);
    lineBreakSlider.value = String(settings.lineBreak ?? 0);
    majorEverySlider.value = String(settings.majorEvery);
    gridColorInput.value = settings.gridColor;
    majorColorInput.value = settings.majorColor;
    accentColorInput.value = settings.accentColor;
    syncPaletteUi(settings);
    alwaysOnTop.checked = !!settings.alwaysOnTop;
    clickThrough.checked = !!settings.clickThrough;
    overlayMinimized.checked = !!settings.overlayMinimized;
    useAutoPpi.checked = !!settings.useAutoPpi;
    ppiSlider.value = String(settings.ppiOverride);
    ppiSlider.disabled = !!settings.useAutoPpi;

    lineCountValue.textContent = lineLabel(settings.lineCount);
    thicknessValue.textContent = `${Number(settings.thickness).toFixed(1)} px`;
    lineBreakValue.textContent = breakLabel(settings.lineBreak);
    majorEveryValue.textContent = `${settings.majorEvery} lines`;
    ppiValue.textContent = settings.useAutoPpi
      ? "auto"
      : `${settings.ppiOverride} PPI`;

    const majorOn = settings.majorEnabled !== false;
    const accentOn = settings.accentEnabled !== false;
    toggleMajor.setAttribute("aria-pressed", majorOn ? "true" : "false");
    toggleAccent.setAttribute("aria-pressed", accentOn ? "true" : "false");
    majorEveryField.classList.toggle("is-disabled", !majorOn);

    const fineOn = !!settings.fineTune;
    btnFineTune.classList.toggle("is-active", fineOn);
    fineTuneSteps.classList.toggle("is-enabled", fineOn);
    document.querySelectorAll("[data-fine-step]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        Number(btn.dataset.fineStep) === Number(settings.fineTuneStep)
      );
    });

    document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === settings.mode);
    });
    document
      .getElementById("stickyAxisX")
      .classList.toggle("active", settings.stickyAxis === "x");
    document
      .getElementById("stickyAxisY")
      .classList.toggle("active", settings.stickyAxis === "y");
    modeHelp.textContent = MODE_HELP[settings.mode] || MODE_HELP.pan;
  }

  function patch(partial) {
    return api.updateSettings(partial);
  }

  function syncPaletteUi(settings) {
    const info = settings.paletteInfo;
    const category = settings.paletteCategory || info?.category || "dark";
    document.querySelectorAll("[data-palette-cat]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.paletteCat === category);
      btn.classList.toggle("is-active", btn.dataset.paletteCat === category);
    });
    if (info && info.count > 0) {
      paletteName.textContent = `${info.name} · ${info.index + 1}/${info.count}`;
    } else if (category === "custom") {
      paletteName.textContent = "No custom palettes yet";
    } else {
      paletteName.textContent = "—";
    }
    const grid = settings.gridColor || info?.palette?.grid || "#d9773a";
    const major = settings.majorColor || info?.palette?.major || "#f0c49a";
    const accent = settings.accentColor || info?.palette?.accent || "#ffe6c8";
    const spans = palettePreview.querySelectorAll("span");
    if (spans[0]) spans[0].style.background = grid;
    if (spans[1]) spans[1].style.background = major;
    if (spans[2]) spans[2].style.background = accent;
  }

  async function nudgeResolution(direction) {
    const current = Number(settingsCache.lineCount) || 1;
    let next;
    if (settingsCache.fineTune) {
      const stepFactor = settingsCache.fineTuneStep === 0.001 ? 0.001 : 0.01;
      const nextInteger = Math.floor(current) + 1;
      const distance = Math.max(1e-6, nextInteger - current);
      next = current + direction * stepFactor * distance;
    } else {
      next = current + direction;
    }
    next = Math.max(1, Math.min(80, next));
    await patch({ lineCount: next });
  }

  document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => patch({ mode: btn.dataset.mode }));
  });

  lineCountSlider.addEventListener("input", () => {
    const value = Number(lineCountSlider.value);
    lineCountValue.textContent = lineLabel(value);
    patch({ lineCount: value });
  });

  document.getElementById("btnZoomIn").addEventListener("click", () => nudgeResolution(1));
  document.getElementById("btnZoomOut").addEventListener("click", () => nudgeResolution(-1));

  btnFineTune.addEventListener("click", () => {
    patch({ fineTune: !settingsCache.fineTune });
  });

  document.querySelectorAll("[data-fine-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      patch({
        fineTune: true,
        fineTuneStep: Number(btn.dataset.fineStep),
      });
    });
  });

  // Mouse wheel and trackpad both zoom resolution (same as +/-).
  // Trackpads send many small pixel deltas — accumulate to one step.
  (() => {
    let accum = 0;
    const THRESHOLD = 40;

    function normalizeDeltaY(event) {
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16; // lines → px-ish
      if (event.deltaMode === 2) dy *= 120; // pages
      return dy;
    }

    function shouldZoomFromTarget(target) {
      if (settingsCache.fineTune) return true;
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(
          ".zoom-row, .fine-tune-box, #lineCountSlider, #lineCountValue, .field-hint"
        )
      );
    }

    window.addEventListener(
      "wheel",
      (event) => {
        if (!shouldZoomFromTarget(event.target)) return;
        // Prefer vertical scroll; ignore mostly-horizontal trackpad pans.
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

        event.preventDefault();
        accum += normalizeDeltaY(event);

        while (Math.abs(accum) >= THRESHOLD) {
          if (accum < 0) {
            accum += THRESHOLD;
            nudgeResolution(1); // scroll/trackpad up → zoom in
          } else {
            accum -= THRESHOLD;
            nudgeResolution(-1);
          }
        }
      },
      { passive: false }
    );
  })();

  thicknessSlider.addEventListener("input", () => {
    thicknessValue.textContent = `${Number(thicknessSlider.value).toFixed(1)} px`;
    patch({ thickness: Number(thicknessSlider.value) });
  });

  lineBreakSlider.addEventListener("input", () => {
    lineBreakValue.textContent = breakLabel(lineBreakSlider.value);
    patch({ lineBreak: Number(lineBreakSlider.value) });
  });

  majorEverySlider.addEventListener("input", () => {
    majorEveryValue.textContent = `${majorEverySlider.value} lines`;
    patch({ majorEvery: Number(majorEverySlider.value) });
  });

  gridColorInput.addEventListener("input", () =>
    patch({ gridColor: gridColorInput.value })
  );
  majorColorInput.addEventListener("input", () =>
    patch({ majorColor: majorColorInput.value })
  );
  accentColorInput.addEventListener("input", () =>
    patch({ accentColor: accentColorInput.value })
  );

  document.querySelectorAll("[data-palette-cat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const info = await api.cyclePalette(btn.dataset.paletteCat);
      if (info) {
        const settings = await api.getSettings();
        syncLabels(settings);
      }
    });
  });

  document
    .getElementById("btnSaveCustomPalette")
    .addEventListener("click", async () => {
      const name =
        customPaletteName.value.trim() ||
        `Custom ${new Date().toLocaleDateString()}`;
      await api.saveCustomPalette({
        name,
        grid: gridColorInput.value,
        major: majorColorInput.value,
        accent: accentColorInput.value,
      });
      customPaletteName.value = "";
      syncLabels(await api.getSettings());
    });

  document
    .getElementById("btnDeleteCustomPalette")
    .addEventListener("click", async () => {
      const settings = await api.getSettings();
      const id = settings.paletteInfo?.palette?.id;
      if (settings.paletteCategory !== "custom" || !id) return;
      await api.deleteCustomPalette(id);
      syncLabels(await api.getSettings());
    });

  toggleMajor.addEventListener("click", () => {
    const next = toggleMajor.getAttribute("aria-pressed") !== "true";
    patch({ majorEnabled: next });
  });

  toggleAccent.addEventListener("click", () => {
    const next = toggleAccent.getAttribute("aria-pressed") !== "true";
    patch({ accentEnabled: next });
  });

  alwaysOnTop.addEventListener("change", () =>
    patch({ alwaysOnTop: alwaysOnTop.checked })
  );
  clickThrough.addEventListener("change", () =>
    patch({ clickThrough: clickThrough.checked })
  );

  overlayMinimized.addEventListener("change", () => {
    patch({ overlayMinimized: overlayMinimized.checked });
    api.setOverlayMinimized?.(overlayMinimized.checked);
  });

  // Hold-to-hide: pointer capture so release outside the button still restores.
  (() => {
    let holding = false;
    const start = async (event) => {
      event.preventDefault();
      holding = true;
      btnHoldHide.classList.add("is-pressed");
      try {
        btnHoldHide.setPointerCapture?.(event.pointerId);
      } catch (_) {
        /* ignore */
      }
      await api.holdHideOverlay?.(true);
    };
    const end = async (event) => {
      if (!holding) return;
      holding = false;
      btnHoldHide.classList.remove("is-pressed");
      try {
        if (event?.pointerId != null) {
          btnHoldHide.releasePointerCapture?.(event.pointerId);
        }
      } catch (_) {
        /* ignore */
      }
      await api.holdHideOverlay?.(false);
    };
    btnHoldHide.addEventListener("pointerdown", start);
    btnHoldHide.addEventListener("pointerup", end);
    btnHoldHide.addEventListener("pointercancel", end);
    btnHoldHide.addEventListener("lostpointercapture", () => {
      if (!holding) return;
      holding = false;
      btnHoldHide.classList.remove("is-pressed");
      api.holdHideOverlay?.(false);
    });
  })();

  api.onOverlayVisibility?.((status) => {
    document.body.classList.toggle("grid-hidden", !!status?.hidden);
  });

  ppiSlider.addEventListener("input", () => {
    ppiValue.textContent = `${ppiSlider.value} PPI`;
    patch({ ppiOverride: Number(ppiSlider.value), useAutoPpi: false });
    useAutoPpi.checked = false;
    ppiSlider.disabled = false;
  });

  useAutoPpi.addEventListener("change", () => {
    ppiSlider.disabled = useAutoPpi.checked;
    ppiValue.textContent = useAutoPpi.checked
      ? "auto"
      : `${ppiSlider.value} PPI`;
    patch({
      useAutoPpi: useAutoPpi.checked,
      ppiOverride: Number(ppiSlider.value),
    });
  });

  document.getElementById("stickyAxisX").addEventListener("click", () => {
    patch({ stickyAxis: "x", mode: "sticky" });
  });
  document.getElementById("stickyAxisY").addEventListener("click", () => {
    patch({ stickyAxis: "y", mode: "sticky" });
  });

  document
    .getElementById("btnClearMeasure")
    .addEventListener("click", () => api.sendOverlayCommand("clearMeasure"));

  document
    .getElementById("btnClearSticky")
    .addEventListener("click", () => api.sendOverlayCommand("clearSticky"));

  document.querySelectorAll("[data-portion]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [fullAxis, fraction, snap] = btn.dataset.portion.split(":");
      api.applyPortion({
        fullAxis,
        fraction: Number(fraction),
        snap,
      });
    });
  });

  document
    .getElementById("btnIncrementWindow")
    .addEventListener("click", () => api.toggleIncrementWindow());

  const reset = () => api.resetPanel();
  document.getElementById("btnResetPanel").addEventListener("click", reset);
  document.getElementById("btnResetPanelBottom").addEventListener("click", reset);
  document.getElementById("btnMinimize").addEventListener("click", () => api.minimize());
  document.getElementById("btnClose").addEventListener("click", () => api.close());

  api.onSettings?.((settings) => syncLabels(settings));

  api.onOverlayStatus?.((status) => {
    if (status?.measure) {
      const rows = measureReadout.querySelectorAll("strong");
      rows[0].textContent = status.measure.distance;
      rows[1].textContent = status.measure.delta;
      rows[2].textContent = status.measure.metric;
    }
    if (status?.sticky) {
      stickyStatus.textContent = status.sticky.status;
      stickyDetail.textContent = status.sticky.detail;
    }
    if (status?.dpi) {
      const scale = status.dpi.scaleFactor ?? 1;
      const logical = status.dpi.logicalPpi ?? 96;
      dpiNote.textContent = `DPI: ${logical} logical PPI · scale ${Number(
        scale
      ).toFixed(2)} · ~${(logical * scale).toFixed(0)} physical PPI`;
      if (useAutoPpi.checked) {
        ppiValue.textContent = `auto (${logical})`;
      }
    }
  });

  function kbd(text) {
    return `<kbd>${text}</kbd>`;
  }

  function applyPlatformLabels(platform) {
    const mod = platform?.isMac ? "⌘" : "Ctrl";
    const modName = platform?.isMac ? "Command" : "Ctrl";
    const rows = [
      [`${kbd(mod)}+drag grid`, "Move overlay"],
      [`${kbd("Z")} (hold)`, "Hide grid while held"],
      [`${kbd("+")} / ${kbd("−")} / scroll`, "Zoom resolution in / out"],
      [`${kbd(mod)}+${kbd("Q")}`, "Quit GridFinder"],
      [`${kbd(mod)}+${kbd("Shift")}+${kbd("G")}`, "Toggle click-through"],
      [`${kbd(mod)}+${kbd("Shift")}+${kbd("P")}`, "Reset controls panel"],
      [`${kbd(mod)}+${kbd("Shift")}+${kbd("I")}`, "Grow increment window"],
      [
        `${kbd(mod)}+${kbd("Shift")}+arrows`,
        "Dock to that edge (full stretch)",
      ],
      [
        `${kbd(mod)}+arrows`,
        "Grow / shrink from dock by increment",
      ],
      [
        `${kbd(mod)}+${kbd(platform?.isMac ? "Option" : "Alt")}+${kbd("1")}…${kbd("6")}`,
        "Portion presets",
      ],
    ];

    const list = document.getElementById("shortcutList");
    if (list) {
      list.innerHTML = rows
        .map(([keys, desc]) => `<div>${keys}</div><div>${desc}</div>`)
        .join("");
    }

    const hint = document.getElementById("layoutGrowHint");
    if (hint) {
      hint.textContent = `Used by ${modName}+Arrow after docking with ${modName}+Shift+Arrow.`;
    }

    const ct = document.getElementById("clickThroughLabel");
    if (ct) {
      ct.textContent = `Click-through grid (${modName}+Shift+G · auto when covering panel / fullscreen)`;
    }
  }

  (async () => {
    const settings = await api.getSettings();
    syncLabels(settings);
    const platform = await api.getPlatform?.();
    if (platform) applyPlatformLabels(platform);
    const dpi = await api.getDpi();
    if (dpi) {
      dpiNote.textContent = `DPI: ${dpi.logicalPpi} logical PPI · scale ${dpi.scaleFactor.toFixed(
        2
      )} · ~${dpi.physicalPpi.toFixed(0)} physical PPI`;
    }
  })();
})();

