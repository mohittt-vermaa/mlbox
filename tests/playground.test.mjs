// Headless check that the playground's MLP actually learns.
// Runs the *same* MLP class the browser uses (js/playground-tab.js).
//
//   npm run test:playground

import { MLP, DATASETS, mulberry32 } from "../js/playground-tab.js";

const CONFIGS = {
  xor: { epochs: 4000, lr: 0.1, hidden: 6, minAcc: 0.99 },
  gaussians: { epochs: 1200, lr: 0.05, hidden: 4, minAcc: 0.98 },
  circle: { epochs: 2000, lr: 0.05, hidden: 6, minAcc: 0.97 },
  moon: { epochs: 2500, lr: 0.05, hidden: 6, minAcc: 0.95 },
};

let failed = 0;
console.log("playground MLP convergence\n");

for (const [name, cfg] of Object.entries(CONFIGS)) {
  const rnd = mulberry32(42);
  const points = DATASETS[name].gen(300, rnd);
  const net = new MLP({ hidden: cfg.hidden, lr: cfg.lr, l2: 0, act: "tanh", seed: 7 });

  const first = net.step(points);
  const t0 = Date.now();
  let last = first;
  for (let i = 1; i < cfg.epochs; i++) last = net.step(points);
  const ms = Date.now() - t0;

  const acc = net.accuracy(points);
  const ok = last < first * 0.5 && acc >= cfg.minAcc;
  if (!ok) failed++;

  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(10)} loss ${first.toFixed(4)} -> ${last.toFixed(4)}  ` +
    `acc ${(acc * 100).toFixed(1)}% (need >= ${cfg.minAcc * 100}%)  ${cfg.epochs} epochs / ${ms} ms`
  );
}

// Spiral is deliberately kept in the suite *because* it is seed-sensitive:
// full-batch GD either finds the winding solution (~95-100%) or parks in a
// straight-cut local minimum (~83%). Asserting that spread is the honest test,
// and it's exactly what the "new seed" button in the UI demonstrates.
{
  const cfg = { epochs: 8000, lr: 0.06, hidden: 16, seeds: [7, 21, 99] };
  const t0 = Date.now();
  const accs = cfg.seeds.map((seed) => {
    const rnd = mulberry32(42);
    const points = DATASETS.spiral.gen(300, rnd);
    const net = new MLP({ hidden: cfg.hidden, lr: cfg.lr, seed });
    for (let i = 0; i < cfg.epochs; i++) net.step(points);
    return net.accuracy(points);
  });
  const best = Math.max(...accs);
  const worst = Math.min(...accs);
  const ok = best >= 0.95 && worst >= 0.8;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  spiral     ${cfg.seeds.length} seeds -> ` +
    `${accs.map((a) => (a * 100).toFixed(1) + "%").join(" / ")}  ` +
    `(need best >= 95%, all >= 80%)  ${Date.now() - t0} ms`
  );
}

// a 1-hidden-unit net must NOT solve spiral — that's the demo's whole point
{
  const rnd = mulberry32(42);
  const points = DATASETS.spiral.gen(300, rnd);
  const net = new MLP({ hidden: 1, lr: 0.05, seed: 7 });
  for (let i = 0; i < 3000; i++) net.step(points);
  const acc = net.accuracy(points);
  const ok = acc < 0.85;
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  spiral/1-unit is hard   acc ${(acc * 100).toFixed(1)}% (expected < 85%)`);
}

console.log("");
if (failed) {
  console.log(`✗ ${failed} check(s) failed`);
  process.exit(1);
}
console.log("✓ the playground network learns every bundled dataset");
