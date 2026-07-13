import { chromium } from "playwright";

const url = "https://dev.neighbro.panov.id";
const outDir = "/app/screenshots";
const browser = await chromium.launch();

for (const scheme of ["dark", "light"]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: scheme,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // The splash holds ~2s. Grab it at a couple of real animation moments to
  // check the badge + wordmark land centered in the viewport.
  for (const t of [700, 1300]) {
    await page.waitForTimeout(t === 700 ? 700 : 600);
    await page.screenshot({ path: `${outDir}/dev-splash-${scheme}-${t}.png` });
    console.log(`saved dev-splash-${scheme}-${t}.png`);
  }
  await context.close();
}

// Mobile viewport too — centering matters most on phones.
const m = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
const mp = await m.newPage();
await mp.goto(url, { waitUntil: "domcontentloaded" });
await mp.waitForTimeout(900);
await mp.screenshot({ path: `${outDir}/dev-splash-mobile.png` });
console.log("saved dev-splash-mobile.png");
await m.close();

await browser.close();
