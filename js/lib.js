// tiny shared helpers — no dependencies anywhere in this project
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const jsonCache = new Map();
export async function getJSON(url) {
  if (!jsonCache.has(url)) {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    jsonCache.set(url, r.json());
  }
  return jsonCache.get(url);
}

export function nfmt(n, digits = 0) {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** $0.00 / $0.000 / $1.23M — keeps small token bills readable */
export function money(usd) {
  if (!isFinite(usd)) return "—";
  if (usd === 0) return "$0";
  const a = Math.abs(usd);
  if (a >= 1e6) return "$" + nfmt(usd / 1e6, 2) + "M";
  if (a >= 1000) return "$" + nfmt(usd, 0);
  if (a >= 1) return "$" + nfmt(usd, 2);
  if (a >= 0.01) return "$" + nfmt(usd, 3);
  if (a >= 0.0001) return "$" + nfmt(usd, 5);
  return "$" + usd.toExponential(1);
}

export function bytesLabel(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(2) + " MB";
}

/** Horizontal bar chart rows, rendered as plain divs (no chart lib). */
export function bars(container, rows, { max, format = (v) => nfmt(v) } = {}) {
  container.textContent = "";
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  for (const r of rows) {
    const pct = Math.max(0.5, (r.value / top) * 100);
    container.append(
      el("div", { class: "bar-row" },
        el("div", { class: "name", title: r.label }, r.label),
        el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${pct}%` })),
        el("div", { class: "bar-val" }, format(r.value))
      )
    );
  }
}
