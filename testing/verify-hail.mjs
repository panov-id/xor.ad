import { chromium } from "playwright";
const file = "/sites/sosed/index.html";
const outDir = "/app/screenshots";
const browser = await chromium.launch();
const expect = { uk: "АГОВ", pl: "SIEMA", fr: "OHÉ", el: "ΕΛΑ", ro: "BĂ", uz: "HOY" };
let fail = 0;
for (const [lang, want] of Object.entries(expect)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.addInitScript((l) => { localStorage.setItem("ss-lang", l); localStorage.setItem("ss-accent-pick", "teal"); }, lang);
  await page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const got = await page.evaluate(() => document.querySelector("#splash .hoy")?.textContent);
  const ok = got === want;
  console.log(`[${lang}] wordmark="${got}" want="${want}" -> ${ok ? "OK ✓" : "MISMATCH ✗"}`);
  if (!ok) fail++;
  await page.screenshot({ path: `${outDir}/hail-${lang}.png` });
  await ctx.close();
}
await browser.close();
console.log(fail ? `\nFAILED · ${fail}` : `\nOK · wordmark localizes per language`);
process.exit(fail ? 1 : 0);
