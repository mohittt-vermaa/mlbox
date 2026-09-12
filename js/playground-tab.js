// A ~120-line MLP trained with plain gradient descent, rendered live.
// Exported so `npm run test:playground` can verify convergence headlessly.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DATASETS = {
  circle: {
    name: "Circle",
    gen(n, rnd) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const cls = i % 2;
        const r = cls ? 0.35 + rnd() * 0.15 : 0.9 + rnd() * 0.25;
        const a = rnd() * Math.PI * 2;
        pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), c: cls ? 1 : -1 });
      }
      return pts;
    },
  },
  xor: {
    name: "XOR",
    gen(n, rnd) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const x = (rnd() * 2 - 1) * 0.95;
        const y = (rnd() * 2 - 1) * 0.95;
        pts.push({ x, y, c: x * y > 0 ? 1 : -1 });
      }
      return pts;
    },
  },
  spiral: {
    name: "Spiral",
    // classic two-arm spiral: the arms are offset by pi, not interleaved
    gen(n, rnd) {
      const pts = [];
      const per = Math.floor(n / 2);
      for (let cls = 0; cls < 2; cls++) {
        for (let k = 0; k < per; k++) {
          const f = k / per;
          const r = 0.16 + f * 1.02;
          const t = f * 2.3 * Math.PI + cls * Math.PI + (rnd() - 0.5) * 0.3;
          pts.push({ x: r * Math.sin(t), y: r * Math.cos(t), c: cls ? 1 : -1 });
        }
      }
      return pts;
    },
  },
  gaussians: {
    name: "Two blobs",
    gen(n, rnd) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const cls = i % 2;
        const cx = cls ? 0.55 : -0.55;
        const cy = cls ? -0.35 : 0.35;
        pts.push({
          x: cx + (rnd() + rnd() + rnd() - 1.5) * 0.5,
          y: cy + (rnd() + rnd() + rnd() - 1.5) * 0.5,
          c: cls ? 1 : -1,
        });
      }
      return pts;
    },
  },
  moon: {
    name: "Moons",
    gen(n, rnd) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const cls = i % 2;
        const a = rnd() * Math.PI;
        const noise = 0.14;
        const x = cls ? Math.cos(a) : 1 - Math.cos(a) - 0.5;
        const y = cls ? Math.sin(a) - 0.4 : -Math.sin(a) + 0.4;
        pts.push({
          x: x * 0.9 + (rnd() - 0.5) * noise,
          y: y * 0.9 + (rnd() - 0.5) * noise,
          c: cls ? 1 : -1,
        });
      }
      return pts;
    },
  },
};

export class MLP {
  constructor({ hidden = 8, lr = 0.03, l2 = 0, act = "tanh", seed = 1 } = {}) {
    this.set({ hidden, lr, l2, act });
    this.rnd = mulberry32(seed);
    this.reset();
  }

  set({ hidden, lr, l2, act }) {
    this.hidden = hidden;
    this.lr = lr;
    this.l2 = l2;
    this.act = act;
  }

  reset() {
    const r = this.rnd;
    const s1 = Math.sqrt(6 / (2 + this.hidden));
    const s2 = Math.sqrt(6 / (this.hidden + 1));
    this.W1 = Array.from({ length: 2 }, () => Array.from({ length: this.hidden }, () => (r() * 2 - 1) * s1));
    this.b1 = new Array(this.hidden).fill(0);
    this.W2 = Array.from({ length: this.hidden }, () => (r() * 2 - 1) * s2);
    this.b2 = 0;
    this.epoch = 0;
  }

  f(v) {
    return this.act === "relu" ? Math.max(0, v) : Math.tanh(v);
  }
  df(v) {
    return this.act === "relu" ? (v > 0 ? 1 : 0) : 1 - Math.tanh(v) ** 2;
  }

  forward(x, y) {
    const h = new Array(this.hidden);
    const z = new Array(this.hidden);
    for (let j = 0; j < this.hidden; j++) {
      z[j] = x * this.W1[0][j] + y * this.W1[1][j] + this.b1[j];
      h[j] = this.f(z[j]);
    }
    const o = h.reduce((a, hj, j) => a + hj * this.W2[j], this.b2);
    return { z, h, o: Math.tanh(o) };
  }

  /** Full-batch gradient descent step. Returns the mean squared error. */
  step(points) {
    const n = points.length;
    const gW1 = [new Array(this.hidden).fill(0), new Array(this.hidden).fill(0)];
    const gb1 = new Array(this.hidden).fill(0);
    const gW2 = new Array(this.hidden).fill(0);
    let gb2 = 0;
    let loss = 0;

    for (const p of points) {
      const { z, h, o } = this.forward(p.x, p.y);
      const err = o - p.c;
      loss += err * err;
      const dout = (2 * err / n) * (1 - o * o);
      gb2 += dout;
      for (let j = 0; j < this.hidden; j++) {
        gW2[j] += dout * h[j];
        const dh = dout * this.W2[j] * this.df(z[j]);
        gW1[0][j] += dh * p.x;
        gW1[1][j] += dh * p.y;
        gb1[j] += dh;
      }
    }

    for (let j = 0; j < this.hidden; j++) {
      this.W2[j] -= this.lr * (gW2[j] + this.l2 * this.W2[j]);
      this.b1[j] -= this.lr * gb1[j];
      this.W1[0][j] -= this.lr * (gW1[0][j] + this.l2 * this.W1[0][j]);
      this.W1[1][j] -= this.lr * (gW1[1][j] + this.l2 * this.W1[1][j]);
    }
    this.b2 -= this.lr * gb2;
    this.epoch += 1;
    return loss / n;
  }

  accuracy(points) {
    let ok = 0;
    for (const p of points) if (Math.sign(this.forward(p.x, p.y).o) === p.c) ok++;
    return ok / points.length;
  }
}

// --------------------------------------------------------------------------
// UI
// --------------------------------------------------------------------------
import { $, el } from "./lib.js";

export function initPlaygroundTab(root) {
  const state = {
    dataset: "spiral",
    points: [],
    net: null,
    running: true,
    stepsPerFrame: 6,
    lossHist: [],
    accHist: [],
    seed: 1,
  };

  const cvs = el("canvas", { width: "460", height: "460", style: "width:100%;height:auto" });
  const lossCvs = el("canvas", { width: "460", height: "130", style: "width:100%;height:auto" });
  const readout = el("div", { class: "statrow", style: "margin-top:12px" });

  function slider(label, min, max, step, value, fmt, onchange) {
    const input = el("input", { type: "range", min, max, step, value });
    const out = el("output", {}, fmt(value));
    input.addEventListener("input", () => { out.textContent = fmt(input.value); onchange(+input.value); });
    return el("div", { class: "slider-row" }, el("span", { class: "muted" }, label), input, out);
  }

  const controls = el("div", {},
    slider("hidden units", 1, 16, 1, 8, (v) => v, (v) => { state.net.set({ hidden: v }); rebuild(); }),
    slider("learning rate", 0.001, 0.3, 0.001, 0.03, (v) => (+v).toFixed(3), (v) => state.net.set({ lr: v })),
    slider("L2 regularisation", 0, 0.03, 0.0005, 0, (v) => (+v).toFixed(4), (v) => state.net.set({ l2: v })),
    slider("steps / frame", 1, 30, 1, 6, (v) => v, (v) => { state.stepsPerFrame = v; }),
    el("div", { class: "slider-row" }, el("span", { class: "muted" }, "activation"),
      (() => {
        const sel = el("select", {}, el("option", { value: "tanh" }, "tanh"), el("option", { value: "relu" }, "relu"));
        sel.addEventListener("change", () => { state.net.set({ act: sel.value }); rebuild(); });
        return sel;
      })(), el("span")),
    el("div", { style: "display:flex;gap:8px;margin-top:12px;flex-wrap:wrap" },
      el("button", { class: "btn primary", onclick: () => { state.running = !state.running; } }, "pause / play"),
      el("button", { class: "btn", onclick: () => rebuild() }, "restart"),
      el("button", { class: "btn", onclick: () => { state.seed = (state.seed * 7919 + 13) % 100000; rebuild(); } }, "new seed")
    )
  );

  const dsChips = el("div", { class: "chips", style: "margin-bottom:14px" });
  for (const [id, d] of Object.entries(DATASETS)) {
    dsChips.append(el("button", {
      class: "chip", type: "button", "aria-pressed": id === state.dataset ? "true" : "false",
      onclick: (e) => {
        state.dataset = id;
        dsChips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
        e.currentTarget.setAttribute("aria-pressed", "true");
        rebuild();
      },
    }, d.name));
  }

  root.append(
    el("p", { class: "section-sub" },
      "A two-input MLP trained with plain gradient descent, right here in the tab. No framework, no GPU, no network — the forward and backward passes are ~80 lines you can read in ",
      el("code", {}, "js/playground-tab.js"),
      ". The background is the model's prediction at every point; the dots are the data."
    ),
    dsChips,
    el("div", { class: "pg-grid" },
      el("div", { class: "card" }, el("h2", {}, "Decision boundary"), el("p", { class: "sub" }, "Live."), cvs, readout),
      el("div", { class: "card" },
        el("h2", {}, "Controls"),
        el("p", { class: "sub" }, "Try 1 hidden unit on Spiral, then raise it. Try L2 = 0 vs 0.01 on a noisy dataset."),
        controls,
        el("h3", { style: "margin:20px 0 6px;font-size:13px" }, "Training loss"),
        lossCvs
      )
    )
  );

  function rebuild() {
    const rnd = mulberry32(state.seed);
    state.points = DATASETS[state.dataset].gen(240, rnd);
    state.net = new MLP({ hidden: state.net?.hidden ?? 8, lr: state.net?.lr ?? 0.03, l2: state.net?.l2 ?? 0, act: state.net?.act ?? "tanh", seed: state.seed + 99 });
    state.lossHist = [];
    state.accHist = [];
    state.running = true;
    draw();
  }

  const GRID = 56;
  function draw() {
    const ctx = cvs.getContext("2d");
    const W = cvs.width, H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    // boundary heatmap
    const cell = W / GRID;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x = (i / (GRID - 1)) * 2.6 - 1.3;
        const y = (j / (GRID - 1)) * 2.6 - 1.3;
        const o = state.net.forward(x, y).o;
        const t = (o + 1) / 2;
        ctx.fillStyle = o >= 0
          ? `rgba(110,231,200,${(0.06 + t * 0.5).toFixed(3)})`
          : `rgba(122,162,255,${(0.06 + (1 - t) * 0.5).toFixed(3)})`;
        ctx.fillRect(i * cell, H - (j + 1) * cell, cell + 0.6, cell + 0.6);
      }
    }
    // data
    for (const p of state.points) {
      const px = ((p.x + 1.3) / 2.6) * W;
      const py = H - ((p.y + 1.3) / 2.6) * H;
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = p.c > 0 ? "#0d2b24" : "#101a33";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = p.c > 0 ? "#6ee7c8" : "#7aa2ff";
      ctx.stroke();
    }

    // loss curve
    const lc = lossCvs.getContext("2d");
    const LW = lossCvs.width, LH = lossCvs.height;
    lc.clearRect(0, 0, LW, LH);
    lc.strokeStyle = "#232a38";
    lc.beginPath(); lc.moveTo(0, LH - 0.5); lc.lineTo(LW, LH - 0.5); lc.stroke();
    if (state.lossHist.length > 1) {
      const maxL = Math.max(...state.lossHist, 1e-6);
      lc.strokeStyle = "#6ee7c8";
      lc.lineWidth = 1.5;
      lc.beginPath();
      state.lossHist.forEach((v, i) => {
        const x = (i / (state.lossHist.length - 1)) * LW;
        const y = LH - (v / maxL) * (LH - 8) - 4;
        i ? lc.lineTo(x, y) : lc.moveTo(x, y);
      });
      lc.stroke();
    }

    readout.textContent = "";
    for (const [k, v] of [
      ["epoch", state.net.epoch.toLocaleString()],
      ["loss", state.lossHist.length ? state.lossHist[state.lossHist.length - 1].toFixed(4) : "—"],
      ["train acc", state.accHist.length ? (state.accHist[state.accHist.length - 1] * 100).toFixed(1) + "%" : "—"],
    ]) readout.append(el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v)));
  }

  function frame() {
    if (state.running && state.net) {
      let loss = 0;
      for (let i = 0; i < state.stepsPerFrame; i++) loss = state.net.step(state.points);
      state.lossHist.push(loss);
      if (state.lossHist.length > 900) state.lossHist.shift();
      if (state.net.epoch % 12 === 0) {
        state.accHist.push(state.net.accuracy(state.points));
        if (state.accHist.length > 300) state.accHist.shift();
      }
      draw();
    }
    requestAnimationFrame(frame);
  }

  rebuild();
  requestAnimationFrame(frame);
}
