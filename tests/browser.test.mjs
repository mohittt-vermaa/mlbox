// Real-browser smoke test. Loads the served site in headless Chrome, drives the
// UI, and fails on any console error or missing render.
//
//   npm run test:browser   (needs: npm i -D puppeteer)
import puppeteer from "puppeteer";

const URL = process.env.URL || "http://127.0.0.1:8000/";
let failed = 0;
const check = (ok, label, extra = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
};

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url() + " " + (r.failure()?.errorText || "")));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

// ---- tokenizer tab -------------------------------------------------------
await page.waitForSelector(".tokens .tok", { timeout: 60000 });
let counts = await page.$$eval(".bar-row", (rows) => rows.map((r) => ({
  name: r.querySelector(".name").textContent,
  val: r.querySelector(".bar-val").textContent,
})));
check(counts.length === 2, "default models loaded", JSON.stringify(counts));

const stats = await page.$$eval(".statrow .stat", (s) => s.map((x) => x.textContent));
check(stats.length >= 3, "input stats rendered", stats[0]);

// the language matrix should exist and show Hindi > English on cl100k
const matrix = await page.$$eval("table tbody tr", (rows) =>
  rows.map((r) => Array.from(r.children).map((c) => c.textContent.trim())));
const eng = matrix.find((r) => r[0].startsWith("English"));
const hin = matrix.find((r) => r[0].startsWith("Hindi"));
check(!!eng && !!hin, "language matrix rows present");
if (eng && hin) {
  const ratio = parseFloat(hin[hin.length - 1]);
  check(ratio > 2, "Hindi costs materially more than English on a loaded model", `${hin[0]} = ${hin[hin.length - 1]}`);
  console.log(`        English ${eng[1]} tok vs Hindi ${hin[1]} tok`);
}

// switching a model on: load llama3 and confirm a third bar appears
await page.evaluate(() => {
  const chip = Array.from(document.querySelectorAll("#panel-tokenizer .card .chip"))
    .find((c) => c.textContent.includes("Llama"));
  chip.click();
});
await new Promise((r) => setTimeout(r, 6000));
counts = await page.$$eval(".bar-row", (rows) => rows.map((r) => r.querySelector(".name").textContent));
check(counts.length === 3, "third tokenizer loads on demand", JSON.stringify(counts));

// typing updates the counts
await page.click("#panel-tokenizer textarea");
await page.evaluate(() => {
  const t = document.querySelector("#panel-tokenizer textarea");
  t.value = "नमस्ते दुनिया";
  t.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 900));
const afterType = await page.$$eval(".bar-row .bar-val", (v) => v.map((x) => x.textContent));
check(afterType.length === 3 && afterType.every((v) => parseInt(v.replace(/,/g, "")) > 0),
  "live re-tokenisation after typing", JSON.stringify(afterType));

const tokInfo = await page.$eval(".tokinfo", (e) => e.textContent);
check(/pieces/.test(tokInfo), "token visualiser reports pieces", tokInfo.slice(0, 60));

await page.screenshot({ path: "/tmp/pptr/shot-tokenizer.png", fullPage: true });

// ---- playground ----------------------------------------------------------
await page.click("#tab-playground");
await page.waitForSelector("#panel-playground canvas", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 2500));
let epoch = await page.$eval("#panel-playground .statrow", (e) => e.textContent);
check(/epoch/.test(epoch), "playground reports an epoch count", epoch.replace(/\s+/g, " ").slice(0, 70));

// the canvas must actually have drawn something
const nonBlank = await page.evaluate(() => {
  const c = document.querySelector("#panel-playground canvas");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 10) lit++;
  return lit;
});
check(nonBlank > 50, "decision-boundary canvas is painted", `${nonBlank} sampled pixels lit`);

// dataset switch + a few seconds of training must move the epoch counter
const e1 = parseInt((await page.$eval("#panel-playground .statrow", (e) => e.textContent)).match(/epoch([\d,]+)/)[1].replace(/,/g, ""));
await page.evaluate(() => Array.from(document.querySelectorAll("#panel-playground .chip"))[0].click());
await new Promise((r) => setTimeout(r, 1500));
const e2 = parseInt((await page.$eval("#panel-playground .statrow", (e) => e.textContent)).match(/epoch([\d,]+)/)[1].replace(/,/g, ""));
check(e2 > 0, "training is running", `epoch ${e1} -> ${e2}`);
await page.screenshot({ path: "/tmp/pptr/shot-playground.png", fullPage: true });

// ---- gpu tab -------------------------------------------------------------
await page.click("#tab-gpu");
await page.waitForSelector("#panel-gpu .recipe", { timeout: 20000 });
const recipes = await page.$$eval("#panel-gpu .recipe h3", (h) => h.map((x) => x.textContent));
check(recipes.length >= 10, "recipe cards rendered", `${recipes.length} recipes`);
await page.evaluate(() => Array.from(document.querySelectorAll("#panel-gpu .chip"))[1].click());
const filtered = await page.$$eval("#panel-gpu .recipe", (r) => r.length);
check(filtered > 0 && filtered < recipes.length, "hardware filter narrows the list", `${filtered} shown`);
await page.screenshot({ path: "/tmp/pptr/shot-gpu.png", fullPage: true });

// ---- prices tab ----------------------------------------------------------
await page.click("#tab-prices");
await page.waitForSelector("#panel-prices tbody tr", { timeout: 20000 });
const priceRows = await page.$$eval("#panel-prices table tbody tr", (r) => r.length);
check(priceRows >= 10, "pricing table rendered", `${priceRows} models`);
const calcRows = await page.$$eval("#panel-prices .bars .bar-row", (r) => r.length);
check(calcRows === priceRows, "calculator priced every model", `${calcRows} bars`);
// sorting
await page.evaluate(() => document.querySelector("#panel-prices th.sortable.num").click());
const sortedFirst = await page.$eval("#panel-prices tbody tr td b", (e) => e.textContent);
check(!!sortedFirst, "column sort works", sortedFirst);
await page.screenshot({ path: "/tmp/pptr/shot-prices.png", fullPage: true });

// ---- console hygiene -----------------------------------------------------
check(errors.length === 0, "no console/page/network errors", errors.slice(0, 4).join(" | "));

await browser.close();
console.log("");
if (failed) { console.log(`✗ ${failed} check(s) failed`); process.exit(1); }
console.log("✓ site works end to end in a real browser");
