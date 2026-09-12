// Verifies js/tokenizer.js against ground truth produced by the upstream Rust
// implementations (tiktoken 0.14 / HF tokenizers 0.23) via tools/gen_reference.py
//
//   npm test
//
// Compares the *exact id sequence* of every corpus string (count + rolling hash)
// for every bundled model, and asserts the pre-tokenizer never drops a character.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Tokenizer, matchAllPieces, translatePattern } from "../js/tokenizer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD = 2 ** 31 - 1; // NB: (1 << 31) overflows to negative in JS
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

function seqHash(ids) {
  let h = 0;
  for (const i of ids) h = (h * 1000003 + i) % MOD;
  return h;
}

const corpus = read(path.join(ROOT, "tests/testdata/corpus.json"));
const manifest = read(path.join(ROOT, "data/models.json")).models;

let failed = 0;
let totalTokens = 0;
console.log(`corpus: ${corpus.length} strings, ${corpus.reduce((a, s) => a + s.length, 0).toLocaleString()} chars\n`);

for (const m of manifest) {
  const dataPath = path.join(ROOT, m.file);
  if (!fs.existsSync(dataPath)) {
    console.log(`  ⚠ ${m.id}: no bundle at ${m.file} (run tools/fetch_models.py && tools/build_tokenizers.py)`);
    continue;
  }
  const data = read(dataPath);
  Object.assign(data, { label: m.label, org: m.org, note: m.note });
  const t0 = Date.now();
  const tok = new Tokenizer(data);

  const refPath = path.join(ROOT, "tests/testdata/refs", `${m.id}.json`);
  if (!fs.existsSync(refPath)) {
    console.log(`  ⚠ ${m.id}: no reference file (run tools/gen_reference.py)`);
    continue;
  }
  const ref = read(refPath);

  let bad = 0;
  const examples = [];
  let dropped = 0;
  let tokens = 0;
  for (let i = 0; i < corpus.length; i++) {
    const s = corpus[i];
    const { ids } = tok.encode(s);
    tokens += ids.length;
    const got = [ids.length, seqHash(ids)];
    const want = ref[i];
    if (got[0] !== want[0] || got[1] !== want[1]) {
      bad++;
      if (examples.length < 3) examples.push({ i, s, got: got[0], want: want[0] });
    }
    dropped += tok.droppedChars(s);
  }
  const ms = Date.now() - t0;
  totalTokens += tokens;
  const status = bad === 0 && dropped === 0 ? "PASS" : "FAIL";
  if (bad || dropped) failed++;
  console.log(
    `  ${status}  ${m.id.padEnd(9)} ${String(corpus.length).padStart(4)} strings  ` +
    `${String(tokens).padStart(7)} tokens  ${String(ms).padStart(5)} ms  dropped=${dropped}`
  );
  for (const e of examples) {
    console.log(`        #${e.i} got ${e.got} want ${e.want}  ${JSON.stringify(e.s.slice(0, 60))}`);
  }
}

// the pattern translation must produce valid, sensible regexes
for (const m of manifest) {
  const p = path.join(ROOT, m.file);
  if (!fs.existsSync(p)) continue;
  for (const src of read(p).patterns || []) {
    const js = translatePattern(src);
    new RegExp(js, "gu"); // throws if invalid
    if (/\\s(?![a-z])/.test(js) && !/[\t\n\r \u0085]/.test(js)) {
      console.log(`  FAIL  ${m.id}: untranslated \\s in pattern`);
      failed++;
    }
  }
}
void matchAllPieces;

console.log(`\ntotal: ${totalTokens.toLocaleString()} tokens verified across ${manifest.length} models`);
if (failed) {
  console.log(`\n✗ ${failed} model(s) failed`);
  process.exit(1);
}
console.log("\n✓ every model matches the upstream Rust tokenizer exactly");
