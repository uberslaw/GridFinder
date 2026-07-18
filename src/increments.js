(() => {
  const api = window.gridFinder;

  const FRACTIONS = [
    ["1/12", 1 / 12],
    ["1/10", 1 / 10],
    ["1/8", 1 / 8],
    ["1/6", 1 / 6],
    ["1/5", 1 / 5],
    ["1/4", 1 / 4],
    ["1/3", 1 / 3],
    ["1/2", 1 / 2],
  ];
  const PERCENTS = [1, 2, 5, 10, 15, 20, 25, 50];

  let state = { mode: "fraction", value: 1 / 12 };
  let dpi = { logicalPpi: 96 };

  const fractionChoices = document.getElementById("fractionChoices");
  const percentChoices = document.getElementById("percentChoices");
  const valueInput = document.getElementById("valueInput");
  const valueLabel = document.getElementById("valueLabel");
  const previewNote = document.getElementById("previewNote");

  function fillChoices() {
    fractionChoices.innerHTML = "";
    FRACTIONS.forEach(([label, value]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = label;
      btn.addEventListener("click", () => commit({ mode: "fraction", value }));
      fractionChoices.appendChild(btn);
    });

    percentChoices.innerHTML = "";
    PERCENTS.forEach((value) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.textContent = `${value}%`;
      btn.addEventListener("click", () => commit({ mode: "percent", value }));
      percentChoices.appendChild(btn);
    });
  }

  function syncUi() {
    document.querySelectorAll(".unit-row .mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });

    fractionChoices.classList.toggle("hidden", state.mode !== "fraction");
    percentChoices.classList.toggle("hidden", state.mode !== "percent");

    [...fractionChoices.children].forEach((btn, i) => {
      btn.classList.toggle(
        "is-active",
        state.mode === "fraction" &&
          Math.abs(FRACTIONS[i][1] - state.value) < 1e-9
      );
    });
    [...percentChoices.children].forEach((btn, i) => {
      btn.classList.toggle(
        "is-active",
        state.mode === "percent" && PERCENTS[i] === state.value
      );
    });

    valueInput.value = String(state.value);
    if (state.mode === "fraction") valueLabel.textContent = "of axis";
    else if (state.mode === "percent") valueLabel.textContent = "% of axis";
    else if (state.mode === "pixel") valueLabel.textContent = "px";
    else if (state.mode === "mm") valueLabel.textContent = "mm";
    else valueLabel.textContent = "in";

    // Preview using a typical 1920-wide / 1080-tall assumption from primary display via dpi note
    const widthGuess = 1920;
    let px;
    if (state.mode === "fraction") px = Math.round(widthGuess * state.value);
    else if (state.mode === "percent") px = Math.round((widthGuess * state.value) / 100);
    else if (state.mode === "pixel") px = Math.round(state.value);
    else if (state.mode === "mm") px = Math.round((state.value / 25.4) * dpi.logicalPpi);
    else px = Math.round(state.value * dpi.logicalPpi);
    previewNote.textContent = `≈ ${px} px on a ${widthGuess}px-wide axis (actual step uses the live work area)`;
  }

  async function commit(next) {
    state = await api.setIncrement(next);
    syncUi();
  }

  document.querySelectorAll(".unit-row .mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      let value = state.value;
      if (mode === "fraction") value = 1 / 12;
      if (mode === "percent") value = 10;
      if (mode === "pixel") value = 50;
      if (mode === "mm") value = 10;
      if (mode === "inch") value = 0.5;
      commit({ mode, value });
    });
  });

  valueInput.addEventListener("change", () => {
    commit({ mode: state.mode, value: Number(valueInput.value) });
  });

  document.getElementById("btnClose").addEventListener("click", () => {
    api.toggleIncrementWindow();
  });

  api.onIncrement?.((value) => {
    state = value;
    syncUi();
  });

  fillChoices();
  (async () => {
    state = await api.getIncrement();
    dpi = (await api.getDpi()) || dpi;
    syncUi();
  })();
})();
