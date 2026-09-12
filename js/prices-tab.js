import { el, getJSON, nfmt, money, bars } from "./lib.js";

export async function initPricesTab(root) {
  const data = await getJSON("data/pricing.json");
  const table = el("table");
  const calcOut = el("div", { class: "bars", style: "margin-top:14px" });
  const calcTotal = el("div", { class: "statrow", style: "margin-top:14px" });

  let sortKey = "input";
  let sortDir = 1;

  const inTok = el("input", { type: "number", value: "1000000", min: "0", step: "1000" });
  const outTok = el("input", { type: "number", value: "200000", min: "0", step: "1000" });
  const mix = el("input", { type: "number", value: "1000", min: "0", step: "100" });

  for (const i of [inTok, outTok, mix]) i.addEventListener("input", calc);

  root.append(
    el("div", { class: "notice" },
      el("b", {}, `Prices read off each provider's own pricing page on ${data.as_of}. `),
      "No third-party aggregators — when the aggregators disagreed with each other by 2–3x, the source was the only thing worth trusting. Every row links to where it came from. Prices move; re-check before you budget."
    ),
    el("h2", { class: "section", style: "margin-top:0" }, "Cost calculator"),
    el("p", { class: "section-sub" }, "Your monthly workload in, monthly bill out. This is the number that actually decides which model you ship."),
    el("div", { class: "card" },
      el("div", { class: "grid cols-2", style: "gap:12px" },
        el("div", {}, el("label", { class: "field" }, "requests / month"), mix),
        el("div", {}, el("label", { class: "field" }, "input tokens per request"), inTok)
      ),
      el("div", { style: "margin-top:12px" }, el("label", { class: "field" }, "output tokens per request"), outTok),
      calcTotal, calcOut
    ),
    el("h2", { class: "section" }, "The table"),
    el("p", { class: "section-sub" }, "Click a column to sort. Cached input is what you pay for prompt-cache hits, which for a long system prompt is most of your bill."),
    el("div", { class: "card" }, el("div", { style: "overflow-x:auto" }, table)),
    el("h2", { class: "section" }, "The part nobody prices"),
    el("p", { class: "section-sub" },
      "Your bill is tokens × price, and the tokenizer decides the token count. The same Hindi paragraph can be 3–8x more tokens than the English one on an older 100k-vocab tokenizer — so switching tokenizer can be a bigger cost lever than switching model. That's what the ",
      el("b", {}, "Tokenizer"), " tab measures. The '$ / 1M chars' column there is this page's prices multiplied by that page's counts."
    )
  );

  function rows() {
    return [...data.models].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "string") return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });
  }

  function renderTable() {
    table.textContent = "";
    const cols = [
      ["name", "Model"], ["org", "Provider"], ["input", "Input $/M", 1],
      ["cached_input", "Cached $/M", 1], ["output", "Output $/M", 1],
      ["context", "Context", 1], ["tier", "Tier"],
    ];
    const thead = el("thead", {}, el("tr", {},
      ...cols.map(([k, label, num]) => el("th", {
        class: "sortable" + (num ? " num" : "") + (sortKey === k ? " sorted" : ""),
        onclick: () => { sortDir = sortKey === k ? -sortDir : 1; sortKey = k; renderTable(); },
      }, label, sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : ""))
    ));
    const tbody = el("tbody");
    for (const m of rows()) {
      tbody.append(el("tr", { title: m.note },
        el("td", {}, el("b", {}, m.name), el("br"),
          el("a", { class: "small muted", href: m.source, target: "_blank", rel: "noopener" }, "source")),
        el("td", {}, m.org),
        el("td", { class: "num" }, "$" + m.input.toFixed(2)),
        el("td", { class: "num" }, m.cached_input === null ? "—" : "$" + m.cached_input.toFixed(3)),
        el("td", { class: "num" }, "$" + m.output.toFixed(2)),
        el("td", { class: "num" }, m.context >= 1e6 ? (m.context / 1e6) + "M" : (m.context / 1000) + "K"),
        el("td", {}, el("span", { class: `pill ${m.tier}` }, m.tier))
      ));
    }
    table.append(thead, tbody);
  }

  function calc() {
    const reqs = Math.max(0, +mix.value || 0);
    const ti = Math.max(0, +inTok.value || 0);
    const to = Math.max(0, +outTok.value || 0);
    const results = data.models.map((m) => ({
      label: m.name,
      value: reqs * (ti * m.input + to * m.output) / 1e6,
    })).sort((a, b) => a.value - b.value);

    calcOut.textContent = "";
    bars(calcOut, results, { format: money });

    calcTotal.textContent = "";
    const cheapest = results[0];
    const dearest = results[results.length - 1];
    for (const [k, v] of [
      ["monthly tokens", nfmt((reqs * (ti + to)) / 1e6, 1) + "M"],
      ["cheapest", cheapest.label + " · " + money(cheapest.value)],
      ["dearest", dearest.label + " · " + money(dearest.value)],
      ["spread", cheapest.value > 0 ? (dearest.value / cheapest.value).toFixed(0) + "×" : "—"],
    ]) calcTotal.append(el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v", style: "font-size:16px" }, v)));
  }

  renderTable();
  calc();
}
