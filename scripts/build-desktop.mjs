#!/usr/bin/env node
// Build a desktop package of mlbox.
//
//   node scripts/build-desktop.mjs            # Windows x64 .exe (default)
//   node scripts/build-desktop.mjs linux      # Linux x64 binary
//   node scripts/build-desktop.mjs darwin     # macOS .app
//
// How it works: the app files are staged into dist/app, then @electron/packager
// unpacks the *official prebuilt* Electron runtime for the target platform over
// them. Building a Windows exe on Linux/macOS therefore needs no wine, no Windows
// SDK and no cross-compiler — the runtime is a downloaded artifact, and our code
// is plain static files. Output: dist/mlbox-v<version>-<platform>-<arch>.zip plus
// a SHA256SUMS.txt.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");
const stageDir = path.join(outDir, "app");

const PACKAGER = "@electron/packager@20.3.0";
const ELECTRON_VERSION = "45.0.0";
// only these ship in the app — everything else (tests, tools, promo, docs) stays out
const APP_FILES = [
  "index.html", "css", "data", "js", "electron",
  "package.json", "LICENSE", "NOTICE.md", "README.md",
];

const platform = (process.argv[2] || "win32").replace(/^--/, "");
const arch = "x64";
if (!["win32", "linux", "darwin"].includes(platform)) {
  console.error(`unknown platform "${platform}" — use win32, linux or darwin`);
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });

const rel = (p) => path.relative(root, p);
const step = (msg) => console.log(`\n→ ${msg}`);

// 1. stage exactly the files the app needs -------------------------------
step(`staging ${APP_FILES.length} app entries → ${rel(stageDir)}`);
fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });
for (const f of APP_FILES) fs.cpSync(path.join(root, f), path.join(stageDir, f), { recursive: true });

// 2. unpack the prebuilt Electron runtime over them -----------------------
step(`packaging with ${PACKAGER} (electron ${ELECTRON_VERSION}, ${platform}-${arch})`);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
run(npx, [
  "--yes", PACKAGER,
  "dist/app", "mlbox",
  `--platform=${platform}`,
  `--arch=${arch}`,
  `--electron-version=${ELECTRON_VERSION}`,
  "--out=dist",
  "--overwrite",
  // plain files, not an asar archive: the app is a static site, and keeping it
  // unpacked means the bundled code is exactly what ships in the repo
  "--no-asar",
]);

const appDir = path.join(outDir, `mlbox-${platform}-${arch}`);
if (!fs.existsSync(appDir)) {
  console.error(`packager did not produce ${rel(appDir)}`);
  process.exit(1);
}

// 3. entry binary: packager names it after the app for Windows already, but
//    fall back to renaming the raw runtime so this holds on every platform
step("renaming entry binary");
const rename = (from, to) => {
  if (from !== to && fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
};
if (platform === "win32") rename(path.join(appDir, "electron.exe"), path.join(appDir, "mlbox.exe"));
else if (platform === "linux") rename(path.join(appDir, "electron"), path.join(appDir, "mlbox"));
else rename(path.join(appDir, "electron.app"), path.join(appDir, "mlbox.app"));

// 4. zip + checksum -------------------------------------------------------
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const zipName = `mlbox-v${version}-${platform}-${arch}.zip`;
const zipPath = path.join(outDir, zipName);
step(`zipping → ${rel(zipPath)}`);
fs.rmSync(zipPath, { force: true });
try {
  run("zip", ["-r", "-X", zipPath, path.basename(appDir)], { cwd: outDir });
} catch {
  // no `zip` on this machine (Windows) — python3 ships the same format
  run("python3", ["-m", "zipfile", "-c", zipPath, path.basename(appDir)], { cwd: outDir });
}

const sha = createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
fs.writeFileSync(path.join(outDir, "SHA256SUMS.txt"), `${sha}  ${zipName}\n`);

const exe = path.join(appDir, platform === "win32" ? "mlbox.exe" : platform === "linux" ? "mlbox" : "mlbox.app");
console.log(`\n✓ ${zipName}`);
console.log(`  entry: ${rel(exe)}${fs.existsSync(exe) ? "" : "  ← MISSING"}`);
console.log(`  size:  ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB`);
console.log(`  sha256: ${sha}`);
console.log(`\nSHA256SUMS.txt written to ${rel(outDir)}/`);
