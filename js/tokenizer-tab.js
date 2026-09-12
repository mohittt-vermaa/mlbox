import { $, el, debounce, getJSON, nfmt, money, bytesLabel, bars } from "./lib.js";
import { Tokenizer } from "./tokenizer.js";

const PRESETS = {
  English: "Machine learning models never see words. They see tokens — and the tokenizer is what decides how your sentence gets chopped up, which quietly sets your bill, your context window, and how well the model handles the language you actually care about.",
  Hindi: "मशीन लर्निंग मॉडल शब्द नहीं देखते, वे टोकन देखते हैं। टोकनाइज़र तय करता है कि आपका वाक्य कैसे टूटेगा — और यही चुपचाप आपका बिल, आपकी कॉन्टेक्स्ट विंडो और भाषा की समझ तय करता है।",
  Bengali: "মেশিন লার্নিং মডেল শব্দ দেখে না, টোকেন দেখে। টোকেনাইজার ঠিক করে আপনার বাক্য কীভাবে ভাগ হবে — আর এটাই আপনার খরচ নির্ধারণ করে।",
  Tamil: "இயந்திரக் கற்றல் மாதிரிகள் சொற்களைப் பார்ப்பதில்லை, டோக்கன்களைப் பார்க்கின்றன. உங்கள் வாக்கியம் எப்படிப் பிரிக்கப்படும் என்பதை டோக்கனைசர் முடிவு செய்கிறது.",
  "中文": "机器学习模型看到的不是词，而是词元。分词器决定了你的句子如何被切分，也悄悄决定了你的账单、上下文窗口，以及模型对这门语言的掌握程度。",
  "日本語": "機械学習モデルは単語ではなくトークンを見ます。トークナイザーが文章の分割方法を決め、それがコストとコンテキスト長を左右します。",
  "العربية": "نماذج التعلم الآلي لا ترى الكلمات، بل ترى الرموز. المحدد هو الذي يقرر كيف تُقسَّم جملتك، وهو ما يحدد تكلفتك ونافذة السياق لديك.",
  Code: "def train(model, loader, epochs=3, lr=1e-4):\n    opt = torch.optim.AdamW(model.parameters(), lr=lr)\n    for e in range(epochs):\n        for x, y in loader:\n            loss = model(x, y)\n            loss.backward(); opt.step(); opt.zero_grad()\n",
  Emoji: "🚀 Shipping a tokenizer comparison tool today! 🎉 Hindi text costs 4-8x more tokens than English 😱 — that's a real bill, not a rounding error. 💸 #ML #LLM",
};

/** Same sentence, hand-translated. Comparisons are indicative, not scientific. */
const LANG_SAMPLES = [
  ["English", PRESETS.English],
  ["Hindi", PRESETS.Hindi],
  ["Bengali", PRESETS.Bengali],
  ["Tamil", PRESETS.Tamil],
  ["Chinese", PRESETS["中文"]],
  ["Japanese", PRESETS["日本語"]],
  ["Arabic", PRESETS["العربية"]],
];

const TOKEN_COLORS = [
  "rgba(110,231,200,.16)", "rgba(122,162,255,.16)", "rgba(255,207,110,.16)",
  "rgba(255,128,149,.16)", "rgba(180,150,255,.16)", "rgba(120,220,255,.16)",
];

export function decodeShare(str) {
  // URL-safe base64 -> standard, then JSON. Tolerates `+`->space mangling.
  try {
    let b = str.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch { return null; }
}
export function encodeShare(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function initTokenizerTab(root, params = new URLSearchParams()) {
  const shared = params.get("data") ? decodeShare(params.get("data")) : null;
  const manifest = (await getJSON("data/models.json")).models;
  const pricing = await getJSON("data/pricing.json");
  const loaded = new Map(); // id -> Tokenizer
  const selected = new Set(shared && Array.isArray(shared.m) && shared.m.length ? shared.m : ["cl100k", "o200k"]);
  let text = shared && typeof shared.t === "string" ? shared.t : PRESETS.English;
  let viewId = shared && shared.v && selected.has(shared.v) ? shared.v : ([...selected].includes("o200k") ? "o200k" : [...selected][0]);
  let diffA = null, diffB = null;

  // ---- build UI ---------------------------------------------------------
  const chips = el("div", { class: "chips" });
  let viewChips = null;
  for (const m of manifest) {
    const chip = el("button", {
      class: "chip", type: "button", "aria-pressed": selected.has(m.id) ? "true" : "false",
      title: `${m.label} — ${m.note}`,
      onclick: () => toggleModel(m.id),
    },
      el("span", {}, m.label.replace(/ \(.*/, "")),
      el("span", { class: "size" }, bytesLabel(m.bytes))
    );
    chip.dataset.id = m.id;
    chips.append(chip);
  }

  const area = el("textarea", { spellcheck: "false", rows: "6" });
  area.value = text;
  area.addEventListener("input", () => { text = area.value; rerunDebounced(); });

  const shareOut = el("input", { type: "text", readonly: "true", style: "display:none", onclick: (e) => e.currentTarget.select() });
  const presetRow = el("div", { class: "chips", style: "margin-bottom:10px" },
    ...Object.keys(PRESETS).map((k) =>
      el("button", { class: "chip", type: "button", onclick: () => { text = PRESETS[k]; area.value = text; rerun(); } }, k)
    ),
    el("button", {
      class: "chip", type: "button", style: "border-style:dashed",
      onclick: async () => {
        const p = new URLSearchParams(location.hash.slice(1).includes("=") ? location.hash.slice(1) : "");
        p.set("tab", "tokenizer");
        p.set("data", encodeShare({ t: text, m: [...selected], v: viewId }));
        const url = location.origin + location.pathname + "#" + p.toString();
        shareOut.style.display = "";
        shareOut.value = url;
        try { await navigator.clipboard.writeText(url); shareOut.title = "copied!"; } catch { shareOut.select(); }
      },
    }, "🔗 share this comparison")
  );

  let diffSelA, diffSelB, diffCount;
  const stats = el("div", { class: "statrow" });
  const compareTable = el("table");
  const compareChart = el("div", { class: "bars" });
  const tokensBox = el("div", { class: "tokens" });
  const tokenInfo = el("div", { class: "tokinfo" });
  const langTable = el("div", { style: "overflow-x:auto" });
  const status = el("div", { class: "loading" });

  root.append(
    el("div", { class: "notice" },
      el("b", {}, "Every count on this page is computed locally, in your browser, "),
      "by a dependency-free re-implementation of each tokenizer. It is verified token-for-token against the upstream Rust implementations (tiktoken 0.14 and Hugging Face tokenizers 0.23) over a 1,251-string corpus: 218,877 tokens, exact match on all seven models. Nothing is sent anywhere."
    ),
    el("div", { class: "card" },
      el("h2", {}, "Pick tokenizers"),
      el("p", { class: "sub" }, "Vocabularies load on demand and then live in your browser cache. Sizes shown are the download."),
      chips
    ),
    el("div", { class: "card", style: "margin-top:18px" },
      el("h2", {}, "Your text"),
      el("p", { class: "sub" }, "Paste anything. Or start from a preset."),
      presetRow, area, shareOut,
      el("div", { style: "margin-top:14px" }, stats),
      status
    ),
    el("div", { class: "grid cols-2", style: "margin-top:18px" },
      el("div", { class: "card" },
        el("h2", {}, "Token count"),
        el("p", { class: "sub" }, "Fewer tokens = cheaper and more context for the same text."),
        compareChart
      ),
      el("div", { class: "card" },
        el("h2", {}, "Cost per million characters"),
        el("p", { class: "sub" }, "Token count × the cheapest current API price for that tokenizer. Hover for detail."),
        el("div", { style: "overflow-x:auto" }, compareTable)
      )
    ),
    el("div", { class: "card", style: "margin-top:18px" },
      el("h2", {}, "How it actually cuts"),
      el("p", { class: "sub" }, "Hover a piece to see its id and byte length. Click a row above to switch model."),
      (viewChips = el("div", { class: "chips", style: "margin-bottom:12px" },
        el("span", { class: "muted small", style: "align-self:center" }, "Showing:")
      )),
      tokensBox, tokenInfo
    ),
    el("div", { class: "card", style: "margin-top:18px" },
      el("h2", {}, "Where two tokenizers disagree"),
      el("p", { class: "sub" },
        "The same text with each token boundary marked. A tick means “a token starts here”. Positions where only one model starts a token are highlighted — that's exactly where your bill diverges."),
      el("div", { class: "chips", style: "margin-bottom:12px" },
        el("span", { class: "muted small", style: "align-self:center" }, "A:"), (diffSelA = el("select", { style: "width:auto" })),
        el("span", { class: "muted small", style: "align-self:center" }, "vs B:"), (diffSelB = el("select", { style: "width:auto" }))
      ),
      el("div", { class: "diffbox" }),
      el("div", { class: "small muted", style: "margin-top:10px" },
        "Legend: ", el("span", { class: "seg both" }, "┃ both"), "  ",
        el("span", { class: "seg a" }, "┃ only A"), "  ", el("span", { class: "seg b" }, "┃ only B"),
        "  ·  ", (diffCount = el("span", {}))
      )
    ),
    el("h2", { class: "section" }, "Why your language is expensive"),
    el("p", { class: "section-sub" },
      "The same sentence in seven languages, tokenised by every model you've loaded. The number that matters is the last column: how many times more tokens than English. On older 100k-vocab tokenizers, Indic scripts routinely cost 3–8x — which is a 3–8x bill and a 3–8x smaller effective context window for the same content."
    ),
    el("div", { class: "card" }, langTable)
  );

  // ---- model loading ----------------------------------------------------
  async function ensure(id) {
    if (loaded.has(id)) return loaded.get(id);
    const m = manifest.find((x) => x.id === id);
    const chip = chips.querySelector(`[data-id="${id}"]`);
    chip.classList.add("busy");
    chip.append(el("span", { class: "size" }, "…"));
    try {
      const data = await getJSON(m.file);
      Object.assign(data, { label: m.label, org: m.org, note: m.note });
      const t = new Tokenizer(data);
      loaded.set(id, t);
      return t;
    } catch (e) {
      chip.classList.remove("busy");
      throw new Error(`Could not load ${m.label} (${m.file}): ${e.message}. If you're opening index.html directly from disk, serve the folder over HTTP instead — browsers block module + data fetches on file://.`);
    }
  }

  async function toggleModel(id) {
    if (selected.has(id)) {
      selected.delete(id);
      if (viewId === id) viewId = [...selected][0] || null;
    } else {
      selected.add(id);
      try {
        await ensure(id);
        viewId = id;
      } catch (e) {
        selected.delete(id);
        showError(e.message);
        return;
      }
    }
    chips.querySelector(`[data-id="${id}"]`).setAttribute("aria-pressed", selected.has(id) ? "true" : "false");
    rerun();
  }

  function showError(msg) {
    status.textContent = "";
    status.append(el("div", { class: "error" }, msg));
  }

  // ---- analysis ---------------------------------------------------------
  function cheapestPriceFor(tokenizerId) {
    const ms = pricing.models.filter((m) => m.tokenizer === tokenizerId);
    if (!ms.length) return null;
    return ms.reduce((a, b) => (a.input <= b.input ? a : b));
  }

  async function rerun() {
    status.textContent = "";
    const ids = [...selected];
    if (!ids.length) {
      compareChart.textContent = "";
      compareTable.textContent = "";
      tokensBox.textContent = "";
      langTable.textContent = "";
      status.append(el("div", { class: "muted small" }, "Select at least one tokenizer."));
      return;
    }

    try {
      for (const id of ids) await ensure(id);
    } catch (e) {
      showError(e.message);
      return;
    }

    const chars = Array.from(text).length;
    const bytes = new TextEncoder().encode(text).length;
    const words = (text.trim().match(/\S+/g) || []).length;

    stats.textContent = "";
    for (const [k, v] of [["characters", nfmt(chars)], ["utf-8 bytes", nfmt(bytes)], ["words", nfmt(words)]]) {
      stats.append(el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v)));
    }

    // per-model counts (yield between models so long text doesn't freeze the tab)
    const results = [];
    for (const id of ids) {
      const tok = loaded.get(id);
      const t0 = performance.now();
      const enc = tok.encode(text);
      results.push({ id, tok, ids: enc.ids, pieces: enc.pieces, ms: performance.now() - t0 });
      await new Promise((r) => setTimeout(r, 0));
    }
    results.sort((a, b) => a.ids.length - b.ids.length);

    bars(compareChart, results.map((r) => ({ label: shortName(r.tok.label), value: r.ids.length })),
      { format: (v) => nfmt(v) });

    // cost table
    compareTable.textContent = "";
    const thead = el("thead", {}, el("tr", {},
      el("th", {}, "Model"), el("th", { class: "num" }, "Tokens"),
      el("th", { class: "num" }, "chars/tok"), el("th", { class: "num" }, "$ / 1M chars")
    ));
    const tbody = el("tbody");
    for (const r of results) {
      const price = cheapestPriceFor(r.id);
      const perM = price && chars ? (r.ids.length / chars) * 1e6 * price.input : null;
      const tr = el("tr", {
        class: r.id === viewId ? "hl" : "", style: "cursor:pointer",
        onclick: () => { viewId = r.id; rerun(); },
        title: price
          ? `${r.tok.label}\n${nfmt(r.ids.length)} tokens\ncheapest API on this tokenizer: ${price.name} at $${price.input}/1M input tokens\n(source: ${price.source}, checked ${price.checked})`
          : `${r.tok.label} — no bundled API price uses this tokenizer`,
      },
        el("td", {}, shortName(r.tok.label), " ", el("span", { class: "muted small" }, r.tok.org)),
        el("td", { class: "num" }, nfmt(r.ids.length)),
        el("td", { class: "num" }, chars ? (chars / r.ids.length).toFixed(2) : "—"),
        el("td", { class: "num" }, perM === null ? "—" : money(perM))
      );
      tbody.append(tr);
    }
    compareTable.append(thead, tbody);

    // visualiser
    renderTokens(results.find((r) => r.id === viewId) || results[0]);
    renderViewChips(results);
    renderDiffOptions(results);
    renderDiff(results);
    renderLangMatrix(results);

    const totalMs = results.reduce((a, r) => a + r.ms, 0);
    status.textContent = `${nfmt(chars)} chars → tokenised by ${results.length} model(s) in ${totalMs.toFixed(0)} ms, locally.`;
  }

  function shortName(label) { return label.replace(/ \(.*/, ""); }

  function renderViewChips(results) {
    viewChips.querySelectorAll(".chip").forEach((c) => c.remove());
    for (const r of results) {
      viewChips.append(el("button", {
        class: "chip", type: "button", "aria-pressed": r.id === viewId ? "true" : "false",
        onclick: () => { viewId = r.id; rerun(); },
      }, shortName(r.tok.label)));
    }
  }

  function renderTokens(r) {
    tokensBox.textContent = "";
    tokenInfo.textContent = "";
    if (!r) return;
    const flat = [];
    for (const p of r.pieces) for (const q of p) flat.push(q);
    const enc = new TextEncoder();
    flat.forEach((piece, i) => {
      const shown = r.tok.pieceToString(piece);
      const byteLen = enc.encode(piece).length;
      const id = r.ids[i];
      const span = el("span", {
        class: "tok" + (shown.startsWith(" ") ? " wb" : ""),
        style: `background:${TOKEN_COLORS[i % TOKEN_COLORS.length]}`,
      }, shown === "" ? "∅" : shown);
      span.addEventListener("mouseenter", () => {
        tokenInfo.textContent = "";
        tokenInfo.append(
          el("b", {}, `#${i}`), `  id `, el("b", {}, String(id)),
          `  ·  ${byteLen} utf-8 byte${byteLen === 1 ? "" : "s"}  ·  `,
          JSON.stringify(shown)
        );
      });
      tokensBox.append(span);
    });
    tokenInfo.textContent = `${nfmt(flat.length)} pieces. Hover any piece for its id and byte length.`;
  }

  function renderLangMatrix(results) {
    langTable.textContent = "";
    if (!results.length) return;
    const head = el("tr", {}, el("th", {}, "Language"),
      ...results.map((r) => el("th", { class: "num" }, shortName(r.tok.label))),
      el("th", { class: "num" }, "worst × English"));
    const tbody = el("tbody");
    const base = {};
    for (const [lang, sample] of LANG_SAMPLES) {
      const cells = results.map((r) => {
        const n = r.tok.count(sample);
        if (lang === "English") base[r.id] = n;
        return n;
      });
      const ratios = results.map((r, i) => (base[r.id] ? cells[i] / base[r.id] : 1));
      const worst = Math.max(...ratios);
      const row = el("tr", {},
        el("td", {}, lang, " ", el("span", { class: "muted small" }, `${nfmt(new TextEncoder().encode(sample).length)} B`)),
        ...cells.map((n) => el("td", { class: "num" }, nfmt(n))),
        el("td", { class: "num" },
          lang === "English" ? el("span", { class: "muted" }, "1.00×")
            : el("b", { style: worst >= 3 ? "color:var(--bad)" : worst >= 1.8 ? "color:var(--warn)" : "color:var(--acc)" }, worst.toFixed(2) + "×"))
      );
      tbody.append(row);
    }
    langTable.append(el("table", {}, el("thead", {}, head), tbody),
      el("p", { class: "muted small", style: "margin-top:10px" },
        "One sentence, hand-translated into each language, so the row is an indicative comparison rather than a controlled experiment. Byte counts are shown because a script's utf-8 size explains a lot of — but not all of — the difference."));
  }

  function renderDiffOptions(results) {
    const ids = results.map((r) => r.id);
    if (!diffA || !ids.includes(diffA)) diffA = ids.includes("o200k") ? "o200k" : ids[0];
    if (!diffB || !ids.includes(diffB) || diffB === diffA) diffB = ids.includes("cl100k") && "cl100k" !== diffA ? "cl100k" : ids.find((i) => i !== diffA);
    for (const [sel, val, set] of [[diffSelA, diffA, (v) => (diffA = v)], [diffSelB, diffB, (v) => (diffB = v)]]) {
      sel.textContent = "";
      for (const r of results) sel.append(el("option", { value: r.id, selected: r.id === val ? "true" : null }, shortName(r.tok.label)));
      sel.onchange = () => { set(sel.value); renderDiff(results); };
    }
  }

  function renderDiff(results) {
    const box = $(".diffbox", root);
    box.textContent = "";
    const A = results.find((r) => r.id === diffA);
    const B = results.find((r) => r.id === diffB);
    if (!A || !B || A === B) { diffCount.textContent = "pick two different models"; return; }
    const startsOf = (r) => {
      const set = new Set();
      for (const tok of r.tok.encodeWithOffsets(text).tokens) {
        const st = Math.max(0, Math.min(tok.start, text.length));
        if (st > 0) set.add(st);
      }
      return set;
    };
    const sa = startsOf(A), sb = startsOf(B);
    const cuts = [...new Set([...sa, ...sb])].filter((c) => c > 0 && c <= text.length).sort((a, b) => a - b);
    let pos = 0;
    for (const c of [...cuts, text.length]) {
      if (c > pos) {
        const a = sa.has(pos), b = sb.has(pos);
        const mark = pos === 0 ? "" : a && b ? "both" : a ? "a" : b ? "b" : "";
        box.append(el("span", { class: "segtext" + (mark ? " seg-" + mark : "") }, text.slice(pos, c)));
      }
      pos = c;
    }
    const onlyA = [...sa].filter((x) => !sb.has(x)).length;
    const onlyB = [...sb].filter((x) => !sa.has(x)).length;
    diffCount.textContent = `${shortName(A.tok.label)}: ${A.ids.length} tokens · ${shortName(B.tok.label)}: ${B.ids.length} tokens · boundaries only in A: ${onlyA}, only in B: ${onlyB}`;
  }

  const rerunDebounced = debounce(rerun, 250);
  await rerun();
}
