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
  const alwaysOnTop = document.getElementById("alwaysOnTop");
  const clickThrough = document.getElementById("clickThrough");
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
    const decimals = settingsCache.fineTuneStep === 0.001 ? 3 : 2;
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
    alwaysOnTop.checked = !!settings.alwaysOnTop;
    clickThrough.checked = !!settings.clickThrough;
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

  window.addEventListener(
    "wheel",
    (event) => {
      if (!settingsCache.fineTune) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      nudgeResolution(direction);
    },
    { passive: false }
  );

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

  (async () => {
    const settings = await api.getSettings();
    syncLabels(settings);
    const dpi = await api.getDpi();
    if (dpi) {
      dpiNote.textContent = `DPI: ${dpi.logicalPpi} logical PPI · scale ${dpi.scaleFactor.toFixed(
        2
      )} · ~${dpi.physicalPpi.toFixed(0)} physical PPI`;
    }
  })();
})();
