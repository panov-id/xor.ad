import { chromium } from "playwright";
const file = "/sites/sosed/index.html";
const outDir = "/app/screenshots";
const browser = await chromium.launch();
let fail = 0;

for (const accent of ["violet", "azure", "crimson", "teal"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript((a) => localStorage.setItem("ss-accent-pick", a), accent);
  await page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const circle = document.querySelector("#splash .splash-ic circle");
    const hoy = document.querySelector("#splash .hoy");
    const accentVar = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    return {
      badge: circle ? getComputedStyle(circle).fill : null,
      wordmark: hoy ? getComputedStyle(hoy).color : null,
      accentVar,
    };
  });
  const match = r.badge && r.badge === r.wordmark;
  console.log(`[${accent}] --accent=${r.accentVar}  badge=${r.badge}  hoy=${r.wordmark}  -> ${match ? "MATCH ✓" : "MISMATCH ✗"}`);
  if (!match) fail++;
  await page.screenshot({ path: `${outDir}/logo-accent-${accent}.png` });
  await context.close();
}
await browser.close();
console.log(fail ? `\nFAILED · ${fail}` : `\nOK · badge matches wordmark accent in all`);
process.exit(fail ? 1 : 0);
