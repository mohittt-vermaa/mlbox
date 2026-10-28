#!/usr/bin/env node
// Build the Android app: `npm run build:apk`  →  dist/mlbox-v<version>-lite-universal.apk
//
// There is no Gradle here on purpose. The app is a WebView around the same
// static files as the website, so the whole build is:
//
//   1. stage a LITE copy of the site (no Playground tab, `data-build="lite"`)
//   2. aapt2 compile/link the manifest, resources and assets into a base APK
//   3. javac + d8 the single Activity into classes.dex
//   4. zipalign + apksigner
//
// It needs a JDK and the Android SDK, installed once into ./.sdk by
//   bash .sdk/setup.sh          (no root; ~950 MB, downloads from Google/Adoptium)
// Everything else is already in this repo.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SDK = path.join(ROOT, ".sdk");
const OUT = path.join(ROOT, "dist");
const STAGE = path.join(OUT, "apk-stage");
const BT = path.join(SDK, "build-tools", "34.0.0");
const ANDROID_JAR = path.join(SDK, "platforms", "android-34", "android.jar");
const JAVA_HOME = path.join(SDK, "jdk");
const JBIN = path.join(JAVA_HOME, "bin");
const KEYSTORE = path.join(ROOT, "android", "mlbox-release.jks");
const KEYSTORE_PASS = process.env.MLBOX_KEYSTORE_PASS || "mlbox-android"; // default for CI/reproducible builds
const VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const APK = path.join(OUT, `mlbox-v${VERSION}-lite-universal.apk`);

const step = (s) => console.log(`\n\x1b[36m▸ ${s}\x1b[0m`);
const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);

function run(cmd, args, { capture = false } = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, PATH: `${JBIN}:${process.env.PATH}`, JAVA_HOME },
    });
  } catch (e) {
    const out = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${path.basename(cmd)} failed (exit ${e.status}):\n${out.slice(-3000)}`);
  }
}

for (const [p, hint] of [
  [ANDROID_JAR, "platforms;android-34"],
  [path.join(BT, "aapt2"), "build-tools;34.0.0"],
  [path.join(BT, "d8"), "build-tools;34.0.0"],
  [path.join(BT, "zipalign"), "build-tools;34.0.0"],
  [path.join(BT, "apksigner"), "build-tools;34.0.0"],
  [path.join(JBIN, "javac"), "a JDK in .sdk/jdk"],
]) {
  if (!existsSync(p)) {
    console.error(`missing ${p}\nrun:  bash .sdk/setup.sh   (installs ${hint}, no root needed)`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 1. lite site
step("staging the lite site (no Playground tab)");
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(path.join(STAGE, "assets"), { recursive: true });

let html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const patch = (from, to) => {
  if (!html.includes(from)) {
    throw new Error(`index.html no longer contains:\n  ${from}\n(update the lite patches in scripts/build-apk.mjs)`);
  }
  html = html.replace(from, to);
};

// mark the build so js/tokenizer-tab.js can pick a lighter default model set
patch("<html lang=\"en\">", "<html lang=\"en\" data-build=\"lite\">");
// the Playground tab is the only CPU-hungry one (live training loop) — drop it
patch(
  "      <button id=\"tab-playground\" role=\"tab\" aria-selected=\"false\" aria-controls=\"panel-playground\"><span>2</span> 🕹️ Playground</button>\n",
  ""
);
patch(
  "  <section id=\"panel-playground\" class=\"panel\" role=\"tabpanel\" hidden></section>\n",
  ""
);
// copy that no longer applies once the app is installed on a phone
patch(
  "<title>mlbox — tokenizer lens, tiny playground, no-GPU recipes, live LLM prices</title>",
  "<title>mlbox — tokenizer lens, no-GPU recipes, live LLM prices</title>"
);
patch(
  "content=\"mlbox — tokenizer lens, tiny playground, no-GPU recipes, live LLM prices\"",
  "content=\"mlbox — tokenizer lens, no-GPU recipes, live LLM prices\""
);
patch(
  "content=\"Four ML tools in one page: compare real LLM tokenizers on any text, train a neural net in your browser, recipes for ML without a GPU, and current API prices. No install, no API key, no GPU.\"",
  "content=\"Three ML tools, offline: compare real LLM tokenizers on any text, recipes for ML without a GPU, and current API prices. No API key, no GPU, works with no connection.\""
);
patch(
  "<p>four ML tools, one page — no install, no API key, no GPU</p>",
  "<p>three ML tools, offline on your phone — no API key, no GPU</p>"
);
patch(
  "<b>mlbox</b> — static site, no build step, no dependencies. Runs on GitHub Pages.",
  "<b>mlbox</b> — the same static site as <a href=\"https://mohittt-vermaa.github.io/mlbox/\" target=\"_blank\" rel=\"noopener\">the web version</a>, bundled here to run offline."
);

writeFileSync(path.join(STAGE, "assets", "index.html"), html);
for (const dir of ["css", "js", "data"]) {
  cpSync(path.join(ROOT, dir), path.join(STAGE, "assets", dir), { recursive: true });
}
ok(`staged ${path.join(STAGE, "assets").replace(ROOT + path.sep, "")} (playground stripped)`);
if (html.includes("panel-playground")) throw new Error("playground panel survived the lite patch");

// ------------------------------------------------------------------- 2. icon
step("rendering the launcher icon");
mkdirSync(path.join(ROOT, "android", "res", "mipmap-xxxhdpi"), { recursive: true });
writeFileSync(
  path.join(ROOT, "android", "res", "mipmap-xxxhdpi", "ic_launcher.png"),
  launcherPNG(192)
);
ok("android/res/mipmap-xxxhdpi/ic_launcher.png");

// ----------------------------------------------------------- 3. resources/dex
step("aapt2 compile + link");
const resZip = path.join(OUT, "apk-res.zip");
const baseApk = path.join(OUT, "apk-base-unsigned.apk");
rmSync(resZip, { force: true });
rmSync(baseApk, { force: true });
run(path.join(BT, "aapt2"), ["compile", "--dir", path.join(ROOT, "android", "res"), "-o", resZip]);
run(path.join(BT, "aapt2"), [
  "link",
  "--auto-add-overlay",
  "--manifest", path.join(ROOT, "android", "AndroidManifest.xml"),
  "-I", ANDROID_JAR,
  "-R", resZip,
  "-A", path.join(STAGE, "assets"),
  "-o", baseApk,
]);
ok("base APK linked (manifest + resources + assets)");

step("javac + d8 → classes.dex");
const classesDir = path.join(OUT, "apk-classes");
const dexDir = path.join(OUT, "apk-dex");
rmSync(classesDir, { recursive: true, force: true });
rmSync(dexDir, { recursive: true, force: true });
mkdirSync(classesDir, { recursive: true });
mkdirSync(dexDir, { recursive: true });

const javaFile = path.join(ROOT, "android", "src", "com", "mlbox", "app", "MainActivity.java");
run(path.join(JBIN, "javac"), [
  "-source", "8", "-target", "8",
  "-bootclasspath", ANDROID_JAR,
  "-d", classesDir,
  javaFile,
]);
// collect all .class files under classesDir
import { readdirSync } from "node:fs";
const classFiles = [];
function collectClassFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectClassFiles(full);
    else if (entry.name.endsWith(".class")) classFiles.push(full);
  }
}
collectClassFiles(classesDir);

run(path.join(BT, "d8"), [
  "--release",
  "--lib", ANDROID_JAR,
  "--min-api", "26",
  "--output", dexDir,
  ...classFiles,
]);
ok("MainActivity.class → classes.dex");

step("assembling, aligning and signing");
const withDex = path.join(OUT, "apk-with-dex.apk");
const aligned = path.join(OUT, "apk-aligned.apk");
for (const f of [withDex, aligned, APK]) rmSync(f, { force: true });

// python3's zipfile is the most portable way to append classes.dex
run("python3", ["-c", `
import zipfile, sys
src, dex, dst = sys.argv[1:4]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for info in zin.infolist():
        zout.writestr(info, zin.read(info.filename))
    zout.write(dex, "classes.dex")
`, baseApk, path.join(dexDir, "classes.dex"), withDex]);
run(path.join(BT, "zipalign"), ["-f", "4", withDex, aligned]);

if (!existsSync(KEYSTORE)) {
  run(path.join(JBIN, "keytool"), [
    "-genkeypair", "-noprompt",
    "-keystore", KEYSTORE,
    "-alias", "mlbox",
    "-keyalg", "RSA", "-keysize", "2048",
    "-validity", "10000",
    "-storepass", KEYSTORE_PASS, "-keypass", KEYSTORE_PASS,
    "-dname", "CN=mlbox, OU=mlbox, O=mlbox, L=Internet, C=ZZ",
  ]);
  ok(`generated ${path.basename(KEYSTORE)} (kept in the repo so future releases can update in place)`);
}
run(path.join(BT, "apksigner"), [
  "sign",
  "--ks", KEYSTORE, "--ks-key-alias", "mlbox",
  "--ks-pass", `pass:${KEYSTORE_PASS}`, "--key-pass", `pass:${KEYSTORE_PASS}`,
  "--out", APK,
  aligned,
]);

// ------------------------------------------------------------------ 4. verify
step("verifying");
const certs = run(path.join(BT, "apksigner"), ["verify", "--print-certs", APK], { capture: true });
console.log(certs.trim().split("\n").slice(0, 3).map((l) => "  " + l).join("\n"));
const badging = run(path.join(BT, "aapt2"), ["dump", "badging", APK], { capture: true });
const pick = (re) => (badging.match(re) || [])[1] || "?";
console.log(`  package:      ${pick(/package: name='([^']+)'/)}`);
console.log(`  version:      ${pick(/versionName='([^']+)'/)} (code ${pick(/versionCode='([^']+)'/)})`);
console.log(`  sdk:          ${pick(/sdkVersion:'(\d+)'/)}–${pick(/targetSdkVersion:'(\d+)'/)}`);
console.log(`  launcher:     ${pick(/launchable-activity: name='([^']+)'/)}`);
console.log(`  native code:  ${/native-code/.test(badging) ? "yes" : "none (pure Java + web assets)"}`);

for (const junk of [withDex, aligned, baseApk, resZip]) rmSync(junk, { force: true });
rmSync(classesDir, { recursive: true, force: true });
rmSync(dexDir, { recursive: true, force: true });

const bytes = readFileSync(APK);
const sha = createHash("sha256").update(bytes).digest("hex");
const sumsFile = path.join(OUT, "SHA256SUMS.txt");
const line = `${sha}  ${path.basename(APK)}`;
let sums = "";
try { sums = readFileSync(sumsFile, "utf8"); } catch { /* first build */ }
sums = sums.split("\n").filter((l) => l && !l.endsWith(path.basename(APK))).join("\n");
writeFileSync(sumsFile, (sums ? sums + "\n" : "") + line + "\n");

console.log(`\n\x1b[1m✓ ${path.basename(APK)}  ${(bytes.length / 1024 / 1024).toFixed(1)} MB\x1b[0m`);
console.log(`  sha256 ${sha}`);
console.log(`  install:  adb install ${path.basename(APK)}`);

// ------------------------------------------------------------------- icon art
function launcherPNG(size) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255, oa = px[i + 3] / 255, out = na + oa * (1 - na);
    if (out === 0) return;
    px[i] = Math.round((r * na + px[i] * oa * (1 - na)) / out);
    px[i + 1] = Math.round((g * na + px[i + 1] * oa * (1 - na)) / out);
    px[i + 2] = Math.round((b * na + px[i + 2] * oa * (1 - na)) / out);
    px[i + 3] = Math.round(out * 255);
  };
  const inRounded = (x, y, x0, y0, w, h, rad) => {
    const cx = Math.max(x0 + rad, Math.min(x, x0 + w - rad));
    const cy = Math.max(y0 + rad, Math.min(y, y0 + h - rad));
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= rad * rad;
  };

  // background: the site's near-black
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, 9, 12, 16);

  // four boxes — the token colours of the tokenizer view
  const colors = [[110, 231, 200], [122, 162, 255], [255, 207, 110], [255, 128, 149]];
  const m = size * 0.15, gap = size * 0.07;
  const w = (size - 2 * m - gap) / 2, rad = size * 0.07;
  const cells = [[m, m], [m + w + gap, m], [m, m + w + gap], [m + w + gap, m + w + gap]];
  cells.forEach(([x0, y0], i) => {
    const [r, g, b] = colors[i];
    for (let y = Math.floor(y0) - 1; y < y0 + w + 1; y++) {
      for (let x = Math.floor(x0) - 1; x < x0 + w + 1; x++) {
        if (inRounded(x + 0.5, y + 0.5, x0, y0, w, w, rad)) put(x, y, r, g, b);
      }
    }
  });

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
