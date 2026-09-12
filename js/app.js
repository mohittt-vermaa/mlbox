import { $ } from "./lib.js";
import { initTokenizerTab } from "./tokenizer-tab.js";
import { initPlaygroundTab } from "./playground-tab.js";
import { initGpuTab } from "./gpu-tab.js";
import { initPricesTab } from "./prices-tab.js";

const TABS = {
  tokenizer: { mount: initTokenizerTab, label: "Tokenizer" },
  playground: { mount: initPlaygroundTab, label: "Playground" },
  gpu: { mount: initGpuTab, label: "No-GPU recipes" },
  prices: { mount: initPricesTab, label: "Prices" },
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
  for (const [k, t] of Object.entries(TABS)) {
    const panel = $(`#panel-${k}`);
    const btn = $(`#tab-${k}`);
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

for (const k of Object.keys(TABS)) {
  $(`#tab-${k}`).addEventListener("click", () => show(k));
}

const initial = TABS[hashParams().get("tab")] ? hashParams().get("tab") : "tokenizer";
show(initial);
