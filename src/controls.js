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

  const lineCountValue = document.getElementById("lineCountValue");
  const thicknessValue = document.getElementById("thicknessValue");
  const lineBreakValue = document.getElementById("lineBreakValue");
  const majorEveryValue = document.getElementById("majorEveryValue");
  const ppiValue = document.getElementById("ppiValue");

  function breakLabel(step) {
    const n = Math.max(0, Math.min(8, Number(step) || 0));
    if (n <= 0) return "Solid";
    const unit = 2 ** (8 - n);
    if (unit === 1) return "1px dots";
    return `${unit}px dash / ${unit}px gap`;
  }

  const MODE_HELP = {
    pan: "Ctrl + drag the grid to move it. Resize from the frame edges.",
    measure:
      "Click point A, then point B on the grid. Distance shows in pixels and approximate mm/cm.",
    sticky:
      "Pick Vertical or Horizontal, then click a gridline on the overlay to pin it to the screen.",
  };

  function lineLabel(count) {
    const n = Number(count) || 1;
    return n === 1 ? "1 line" : `${n} lines`;
  }

  function syncLabels(settings) {
    lineCountSlider.value = String(settings.lineCount ?? 1);
    thicknessSlider.value = String(settings.thickness);
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
    majorEveryValue.textContent = `${settings.majorEvery} lines`;
    ppiValue.textContent = settings.useAutoPpi
      ? "auto"
      : `${settings.ppiOverride} PPI`;

    const majorOn = settings.majorEnabled !== false;
    const accentOn = settings.accentEnabled !== false;
    toggleMajor.setAttribute("aria-pressed", majorOn ? "true" : "false");
    toggleAccent.setAttribute("aria-pressed", accentOn ? "true" : "false");
    majorEveryField.classList.toggle("is-disabled", !majorOn);

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

  document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => patch({ mode: btn.dataset.mode }));
  });

  lineCountSlider.addEventListener("input", () => {
    lineCountValue.textContent = lineLabel(lineCountSlider.value);
    patch({ lineCount: Number(lineCountSlider.value) });
  });

  thicknessSlider.addEventListener("input", () => {
    thicknessValue.textContent = `${Number(thicknessSlider.value).toFixed(1)} px`;
    patch({ thickness: Number(thicknessSlider.value) });
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
