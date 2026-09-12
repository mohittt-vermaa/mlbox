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

async function show(id) {
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
        await t.mount(panel);
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
  if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id);
}

for (const k of Object.keys(TABS)) {
  $(`#tab-${k}`).addEventListener("click", () => show(k));
}

const initial = TABS[location.hash.slice(1)] ? location.hash.slice(1) : "tokenizer";
show(initial);
