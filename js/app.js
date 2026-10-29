import { $, store } from "./lib.js";
import { initTokenizerTab } from "./tokenizer-tab.js";
import { initPlaygroundTab } from "./playground-tab.js";
import { initGpuTab } from "./gpu-tab.js";
import { initPricesTab } from "./prices-tab.js";
import { initGuideTab } from "./guide-tab.js";

const TABS = {
  tokenizer: { mount: initTokenizerTab, label: "Tokenizer" },
  playground: { mount: initPlaygroundTab, label: "Playground" },
  gpu: { mount: initGpuTab, label: "No-GPU recipes" },
  prices: { mount: initPricesTab, label: "Prices" },
  guide: { mount: initGuideTab, label: "Guide" },
};

const started = new Set();

/** Hash scheme: `#tab=prices&data=...` (bare `#prices` also accepted for old links). */
export function hashParams() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return new URLSearchParams();
  if (h.includes("=")) return new URLSearchParams(h);
  return new URLSearchParams({ tab: h });
}

export function setHash(params) {
  history.replaceState(null, "", "#" + params.toString());
}

async function show(id) {
  const params = hashParams();
  params.set("tab", id);
  store.set("tab", id);
  for (const [k, t] of Object.entries(TABS)) {
    const panel = $(`#panel-${k}`);
    const btn = $(`#tab-${k}`);
    if (!panel || !btn) continue; // stripped by the lite (APK) build
    const on = k === id;
    panel.hidden = !on;
    btn.setAttribute("aria-selected", on ? "true" : "false");
    if (on && !started.has(k)) {
      started.add(k);
      btn.disabled = true;
      try {
        await t.mount(panel, params);
      } catch (e) {
        console.error(e);
        panel.append(Object.assign(document.createElement("div"), {
          className: "error",
          textContent: `${t.label} failed to load: ${e.message}`,
        }));
      } finally {
        btn.disabled = false;
      }
    }
  }
  setHash(params);
}

const has = (k) => Boolean(k && TABS[k] && $(`#panel-${k}`));

for (const k of Object.keys(TABS)) {
  if (has(k)) $(`#tab-${k}`).addEventListener("click", () => show(k));
}

// Priority: the hash (share links win) > whatever tab you last had open > tokenizer.
// A saved tab the current build doesn't ship (e.g. Playground remembered on the
// web build, then opened in the lite APK) falls through to the tokenizer.
const hashTab = hashParams().get("tab");
const savedTab = store.get("tab");
const initial = has(hashTab) ? hashTab : has(savedTab) ? savedTab : "tokenizer";
show(initial);

/* ========================================================================
   NEW FEATURES: Theme, Onboarding, Notifications, Budget Tracker
   ======================================================================== */

// ---------- Theme System ----------
const THEME_KEY = "mlbox:theme";
const THEME_ATTR = "data-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute(THEME_ATTR, theme);
  const toggle = $("#theme-toggle");
  if (toggle) toggle.textContent = theme === "light" ? "☀️" : "🌙";
  store.set(THEME_KEY, theme);
}

function initTheme() {
  const saved = store.get(THEME_KEY);
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const theme = saved || (prefersLight ? "light" : "dark");
  applyTheme(theme);

  $("#theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute(THEME_ATTR);
    applyTheme(current === "light" ? "dark" : "light");
  });

  // Listen for system theme changes
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    if (!store.get(THEME_KEY)) applyTheme(e.matches ? "light" : "dark");
  });
}

// ---------- Onboarding Modal ----------
const ONBOARDING_KEY = "mlbox:onboarding:completed";
const ONBOARDING_VERSION = 1;

const ONBOARDING_STEPS = [
  {
    title: "Four Tools, One Page",
    desc: "mlbox gives you four ML tools that run entirely in your browser — no install, no API key, no GPU needed.",
    items: [
      "🧮 <b>Tokenizer Lens</b> — Compare how 7 real LLM tokenizers split your text",
      "🕹️ <b>Playground</b> — Train a neural net live on canvas (XOR, spirals, moons)",
      "🐢 <b>No-GPU Recipes</b> — 12 ML projects that run on a laptop CPU or free Colab",
      "💸 <b>LLM Price Bench</b> — 13 models from 5 providers with real tokenizer pricing"
    ]
  },
  {
    title: "Works Everywhere",
    desc: "Use mlbox on any platform — the same codebase runs as a web page, Android app, and desktop app.",
    items: [
      "🌐 <b>Web</b> — Open <a href='https://mohittt-vermaa.github.io/mlbox/' target='_blank' rel='noopener'>github.io/mlbox</a> on any device",
      "📱 <b>Android</b> — 9.7 MB APK, works offline, Android 8.0+",
      "🖥️ <b>Desktop</b> — Windows/Linux/macOS builds, no installer needed",
      "💻 <b>CLI</b> — Run <code>./mlbox serve</code> to host locally"
    ]
  },
  {
    title: "Smart Features",
    desc: "Little details that save you time and prevent mistakes.",
    items: [
      "💾 <b>Auto-save</b> — Your text, selections, and settings persist in localStorage",
      "🔗 <b>Share links</b> — Copy a URL that encodes your exact comparison state",
      "⌨️ <b>Shortcuts</b> — Press <kbd>1–4</kbd> for tabs, <kbd>G</kbd> for guide, <kbd>Ctrl+Enter</kbd> to run",
      "🌙 <b>Themes</b> — Toggle light/dark mode (top right), remembers your choice"
    ]
  },
  {
    title: "Budget Tracker",
    desc: "Keep an eye on your AI API spending without leaving mlbox.",
    items: [
      "💰 <b>Live tracker</b> — Floating pill shows estimated daily AI cost",
      "🔔 <b>Notifications</b> — Get alerted when you approach your budget limit",
      "⚙️ <b>Configure in Prices tab</b> — Set your monthly budget and cache-hit %",
      "📊 <b>Real tokenizer pricing</b> — Uses actual token counts from each model"
    ]
  }
];

function initOnboarding() {
  const completed = store.get(ONBOARDING_KEY);
  if (completed === ONBOARDING_VERSION) return;

  const overlay = $("#onboarding");
  const stepsContainer = $("#onboarding-steps");
  const progressContainer = $("#onboarding-progress");
  const closeBtn = $(".onboarding-close", overlay);

  if (!overlay || !stepsContainer || !progressContainer) return;

  // Build steps
  ONBOARDING_STEPS.forEach((step, i) => {
    const stepEl = document.createElement("div");
    stepEl.className = `onboarding-step${i === 0 ? " active" : ""}`;
    stepEl.innerHTML = `
      <div class="step-header">
        <div class="step-number">${i + 1}</div>
        <div>
          <h3>${step.title}</h3>
          <p>${step.desc}</p>
        </div>
      </div>
      <div class="step-content">
        <ul>${step.items.map(item => `<li>${item}</li>`).join("")}</ul>
      </div>
      <div class="step-actions">
        ${i < ONBOARDING_STEPS.length - 1
          ? `<button class="btn" data-next="${i + 1}">Next</button>`
          : `<button class="btn primary" data-complete>Get Started</button>`
        }
        ${i > 0 ? `<button class="btn" data-prev="${i - 1}">Back</button>` : ""}
        <button class="btn" data-skip>Skip</button>
      </div>
    `;
    stepsContainer.appendChild(stepEl);

    // Progress dot
    const dot = document.createElement("div");
    dot.className = `dot${i === 0 ? " active" : ""}`;
    progressContainer.appendChild(dot);
  });

  let currentStep = 0;
  const steps = $$(".onboarding-step", stepsContainer);
  const dots = $$(".dot", progressContainer);

  function goToStep(n) {
    steps[currentStep].classList.remove("active");
    dots[currentStep].classList.remove("active");
    currentStep = n;
    steps[currentStep].classList.add("active");
    dots[currentStep].classList.add("active");
  }

  stepsContainer.addEventListener("click", (e) => {
    const next = e.target.closest("[data-next]");
    const prev = e.target.closest("[data-prev]");
    const complete = e.target.closest("[data-complete]");
    const skip = e.target.closest("[data-skip]");

    if (next) goToStep(parseInt(next.dataset.next));
    else if (prev) goToStep(parseInt(prev.dataset.prev));
    else if (complete || skip) finishOnboarding();
  });

  closeBtn?.addEventListener("click", finishOnboarding);

  function finishOnboarding() {
    overlay.classList.add("hidden");
    store.set(ONBOARDING_KEY, ONBOARDING_VERSION);
    // Show welcome notification after a delay
    setTimeout(() => notify("Welcome to mlbox! 🎉", "Press G for the guide, 1–4 for tabs, Ctrl+Enter to run.", "success"), 500);
  }

  // Show modal
  overlay.classList.remove("hidden");
}

// ---------- Notification System ----------
function notify(title, message, type = "info", actions = []) {
  const container = $("#notifications");
  if (!container) return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}${type === "warning" ? " notification-budget" : ""}`;
  notification.innerHTML = `
    <span class="notification-icon" aria-hidden="true">
      ${type === "success" ? "✅" : type === "error" ? "❌" : type === "warning" ? "⚠️" : "ℹ️"}
    </span>
    <div class="notification-content">
      <p class="notification-title">${title}</p>
      <p class="notification-message">${message}</p>
      ${actions.length ? `<div class="notification-actions">${actions.map(a => `<button class="btn sm" data-action="${a.id}">${a.label}</button>`).join("")}</div>` : ""}
    </div>
    <button class="notification-close" aria-label="Dismiss">×</button>
  `;

  // Handle action buttons
  notification.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      actions.find(a => a.id === btn.dataset.action)?.handler();
      dismiss(notification);
    });
  });

  notification.querySelector(".notification-close")?.addEventListener("click", () => dismiss(notification));

  container.appendChild(notification);

  // Auto-dismiss after 8 seconds (except warnings/errors)
  const autoDismissMs = type === "warning" || type === "error" ? 15000 : 8000;
  const timer = setTimeout(() => dismiss(notification), autoDismissMs);

  function dismiss(el) {
    clearTimeout(timer);
    el.classList.add("hiding");
    setTimeout(() => el.remove(), 200);
  }

  return dismiss;
}

// Expose globally for other tabs
window.mlboxNotify = notify;

// ---------- Budget Tracker ----------
const BUDGET_KEY = "mlbox:budget";
const BUDGET_DEFAULTS = {
  monthlyLimit: 50, // USD
  cacheHitPercent: 0,
  lastReset: new Date().toISOString().slice(0, 7), // YYYY-MM
  // Estimated costs from last calculation
  estimatedDaily: 0,
  estimatedMonthly: 0
};

function loadBudget() {
  const saved = store.get(BUDGET_KEY);
  return { ...BUDGET_DEFAULTS, ...saved };
}

function saveBudget(budget) {
  store.set(BUDGET_KEY, budget);
}

function formatMoney(usd) {
  if (usd >= 1000) return "$" + (usd / 1000).toFixed(1) + "K";
  if (usd >= 1) return "$" + usd.toFixed(2);
  return "$" + usd.toFixed(3);
}

function updateBudgetDisplay() {
  const tracker = $("#budget-tracker");
  const valueEl = $("#budget-value");
  if (!tracker || !valueEl) return;

  const budget = loadBudget();
  valueEl.textContent = formatMoney(budget.estimatedDaily);

  // Show tracker if there's meaningful usage
  if (budget.estimatedDaily > 0.01 || budget.estimatedMonthly > 0) {
    tracker.classList.remove("hidden");
  } else {
    tracker.classList.add("hidden");
  }
}

// Called from prices-tab when calculator runs
window.mlboxUpdateBudget = function(estimatedMonthly, estimatedDaily) {
  const budget = loadBudget();
  budget.estimatedMonthly = estimatedMonthly;
  budget.estimatedDaily = estimatedDaily;
  saveBudget(budget);
  updateBudgetDisplay();

  // Check budget threshold (80% warning)
  if (estimatedMonthly > 0 && budget.monthlyLimit > 0) {
    const pct = (estimatedMonthly / budget.monthlyLimit) * 100;
    if (pct >= 100) {
      notify("Budget Exceeded! 🚨", `Estimated monthly spend ($${estimatedMonthly.toFixed(2)}) exceeds your $${budget.monthlyLimit} limit.`, "error", [
        { id: "open-prices", label: "Adjust Settings", handler: () => show("prices") }
      ]);
    } else if (pct >= 80) {
      notify("Budget Warning ⚠️", `You're at ${Math.round(pct)}% of your $${budget.monthlyLimit}/mo budget.`, "warning", [
        { id: "open-prices", label: "View Details", handler: () => show("prices") }
      ]);
    }
  }
};

// Open prices tab when budget tracker clicked
$("#budget-tracker")?.addEventListener("click", () => show("prices"));
$("#budget-tracker")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show("prices"); }
});

// ---------- Keyboard Shortcuts ----------
const keyMap = { "1": "tokenizer", "2": "playground", "3": "gpu", "4": "prices", "g": "guide", "G": "guide" };
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "Enter") {
      e.preventDefault();
      const activeTab = document.querySelector("nav button[aria-selected='true']");
      if (activeTab?.id === "tab-playground") document.getElementById("train-btn")?.click();
      else if (activeTab?.id === "tab-tokenizer") document.getElementById("tok-btn")?.click();
    }
    return;
  }
  const tab = keyMap[e.key];
  if (tab && has(tab)) show(tab);
});

// ---------- Initialize Everything ----------
initTheme();
initOnboarding();
updateBudgetDisplay();

// Re-check budget on tab switch (in case prices tab updated it)
const originalShow = show;
window.show = async function(id) {
  await originalShow(id);
  updateBudgetDisplay();
};