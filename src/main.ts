import { invoke } from "@tauri-apps/api/core";
declare type Chart = any;
declare const Chart: any;

// 1. HORLOGE EN TEMPS RÉEL
function updateClock() {
  const clockEl = document.getElementById("system-clock");
  if (clockEl) {
    clockEl.innerText = new Date().toLocaleTimeString();
  }
}
setInterval(updateClock, 1000);
updateClock();

// 2. CONFIGURATION DE CHART.JS (GRAPH 60 SECONDES)
const ctx = (document.getElementById("thermalChart") as HTMLCanvasElement)?.getContext("2d");
let thermalChart: Chart | null = null;

if (ctx) {
  const labels = Array.from({ length: 60 }, (_, i) => `${60 - i}s`);
  const initialDataCPU = Array(60).fill(null);
  const initialDataGPU = Array(60).fill(null);

  thermalChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "CPU",
          data: initialDataCPU,
          borderColor: "#ff2a38",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
        {
          label: "GPU",
          data: initialDataGPU,
          borderColor: "#ff7b00",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: {
          min: 30,
          max: 100,
          grid: { color: "#1f2330" },
          ticks: { color: "#7e859b", font: { size: 10 } },
        },
      },
    },
  });
}

// 3. TÉLÉMÉTRIE (RPM & TEMPÉRATURES)
async function updateTelemetry() {
  try {
    const [cpuRpm, gpuRpm, cpuTemp, gpuTemp] = await invoke<[number, number, number, number]>("get_status");

    const cpuTempEl = document.getElementById("cpu-temp-text");
    const gpuTempEl = document.getElementById("gpu-temp-text");
    if (cpuTempEl) cpuTempEl.innerText = `${cpuTemp}°C`;
    if (gpuTempEl) gpuTempEl.innerText = `${gpuTemp}°C`;

    const cpuRpmEl = document.getElementById("cpu-rpm-text");
    const gpuRpmEl = document.getElementById("gpu-rpm-text");
    if (cpuRpmEl) cpuRpmEl.innerText = cpuRpm > 0 ? `${cpuRpm}` : "0";
    if (gpuRpmEl) gpuRpmEl.innerText = gpuRpm > 0 ? `${gpuRpm}` : "0";

    const CIRCUMFERENCE = 314;
    const cpuProgress = document.getElementById("cpu-progress");
    const gpuProgress = document.getElementById("gpu-progress");

    if (cpuProgress) {
      const cpuPercent = Math.min(cpuRpm / 6000, 1);
      const offset = CIRCUMFERENCE - (cpuPercent * CIRCUMFERENCE);
      cpuProgress.style.strokeDashoffset = `${offset}`;
    }

    if (gpuProgress) {
      const gpuPercent = Math.min(gpuRpm / 6000, 1);
      const offset = CIRCUMFERENCE - (gpuPercent * CIRCUMFERENCE);
      gpuProgress.style.strokeDashoffset = `${offset}`;
    }

    if (thermalChart) {
      const cpuData = thermalChart.data.datasets[0].data;
      const gpuData = thermalChart.data.datasets[1].data;

      cpuData.shift();
      cpuData.push(cpuTemp);

      gpuData.shift();
      gpuData.push(gpuTemp);

      thermalChart.update("none");
    }

    setSysStatus(true);
  } catch (err) {
    setSysStatus(false);
  }
}

function setSysStatus(isOk: boolean) {
  const badge = document.getElementById("sys-status");
  const text = document.getElementById("sys-status-text");
  if (badge && text) {
    if (isOk) {
      badge.className = "status-badge sys-ok";
      text.innerText = "SYS OK";
    } else {
      badge.className = "status-badge sys-down";
      text.innerText = "DAEMON DOWN";
    }
  }
}

setInterval(updateTelemetry, 200);

async function applyFanConfig() {
  const activeModeBtn = document.querySelector(".mode-btn.active");
  let mode = "auto";

  if (activeModeBtn) {
    if (activeModeBtn.id === "mode-max") mode = "max";
    if (activeModeBtn.id === "mode-custom") mode = "custom";
  }

  // On récupère l'état réel des switches
  const cpuCustom = (document.getElementById("toggle-cpu-custom") as HTMLInputElement)?.checked ?? false;
  const gpuCustom = (document.getElementById("toggle-gpu-custom") as HTMLInputElement)?.checked ?? false;

  const cpuSpeed = parseInt((document.getElementById("cpu-fan-slider") as HTMLInputElement)?.value || "75", 10);
  const gpuSpeed = parseInt((document.getElementById("gpu-fan-slider") as HTMLInputElement)?.value || "60", 10);

  // Si on est en Auto ou Max, on force les drapeaux custom à false pour éviter tout conflit
  const isCustomMode = mode === "custom";

  try {
    await invoke("set_fans", {
      mode: mode,
      cpuCustom: isCustomMode ? cpuCustom : false,
      cpuSpeed: cpuSpeed,
      gpuCustom: isCustomMode ? gpuCustom : false,
      gpuSpeed: gpuSpeed,
    });
  } catch (e) {
    console.error("Erreur lors de l'envoi de la commande ventilateur:", e);
  }
}

// Helper pour les boutons d'un même groupe
function setupButtonGroup(selector: string, onClick: (btn: HTMLElement) => void) {
  const buttons = document.querySelectorAll<HTMLElement>(selector);
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onClick(btn);
    });
  });
}

// ÉVÉNEMENTS INTERFACE
window.addEventListener("DOMContentLoaded", () => {
  // Power Plan
  setupButtonGroup(".power-btn", async (btn) => {
    const id = btn.id;
    let profile = "default";
    if (id === "power-quiet") profile = "quiet";
    if (id === "power-perf") profile = "performance";

    await invoke("set_power_profile", { profile });
  });

  // Modes Ventilateurs (Auto / Max / Custom)
  setupButtonGroup(".mode-btn", async () => {
    await applyFanConfig();
  });

  // Sliders
  const cpuSlider = document.getElementById("cpu-fan-slider") as HTMLInputElement;
  const gpuSlider = document.getElementById("gpu-fan-slider") as HTMLInputElement;

  cpuSlider?.addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value;
    document.getElementById("cpu-slider-val")!.innerText = `${val}%`;
    applyFanConfig();
  });

  gpuSlider?.addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value;
    document.getElementById("gpu-slider-val")!.innerText = `${val}%`;
    applyFanConfig();
  });

  // Switches CPU & GPU Custom
  document.getElementById("toggle-cpu-custom")?.addEventListener("change", applyFanConfig);
  document.getElementById("toggle-gpu-custom")?.addEventListener("change", applyFanConfig);
});

// 5. SWITCH D'ONGLETS AVEC SLIDE
const btnMon = document.getElementById("tab-monitoring");
const btnKbd = document.getElementById("tab-keyboard");
const slider = document.getElementById("pages-slider");

btnMon?.addEventListener("click", () => {
  btnMon.classList.add("active");
  btnKbd?.classList.remove("active");
  slider?.classList.remove("slide-kbd");
});

btnKbd?.addEventListener("click", () => {
  btnKbd.classList.add("active");
  btnMon?.classList.remove("active");
  slider?.classList.add("slide-kbd");
});

// 6. DYNAMISME DES SÉLECTEURS DE COULEURS RGB
const zones = ["z1", "z2", "z3", "z4"];
zones.forEach((z) => {
  const picker = document.getElementById(`picker-${z}`) as HTMLInputElement;
  const preview = document.getElementById(`preview-${z}`);

  picker?.addEventListener("input", (e) => {
    const color = (e.target as HTMLInputElement).value;
    if (preview) {
      preview.style.borderColor = color;
      preview.style.background = `${color}22`;
      preview.style.boxShadow = `0 0 15px ${color}44`;
    }
  });
});