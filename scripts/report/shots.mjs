// Live screenshots of the public faces, taken now.
import { chromium } from "playwright";
const shots = [
  ["sosed-desktop", "https://sosed.place/", { width: 1440, height: 900 }, "light"],
  ["neighbro-desktop", "https://neighbro.place/", { width: 1440, height: 900 }, "light"],
  ["sosed-mobile-dark", "https://sosed.place/", { width: 390, height: 844 }, "dark"],
  ["neighbro-mobile-light", "https://neighbro.place/", { width: 390, height: 844 }, "light"],
  ["panel-login", "https://xor.panov.id/", { width: 1440, height: 900 }, "light"],
];
const browser = await chromium.launch();
for (const [name, url, viewport, scheme] of shots) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2, locale: "ru-RU" });
  const page = await ctx.newPage();
  const res = await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/out/${name}.png` });
  console.log(name, res?.status());
  await ctx.close();
}
await browser.close();
