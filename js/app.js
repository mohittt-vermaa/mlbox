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

// Keyboard shortcuts
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
