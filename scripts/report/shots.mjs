// Screenshots of the faces from the local stand (shots.sh), taken now. The
// landings are asked for by their own hostnames, resolved to the local gateway.
import { chromium } from "playwright";
const shots = [
  ["sosed-desktop", "http://sosed.place/", { width: 1440, height: 900 }, "light"],
  ["neighbro-desktop", "http://neighbro.place/", { width: 1440, height: 900 }, "light"],
  ["sosed-mobile-dark", "http://sosed.place/", { width: 390, height: 844 }, "dark"],
  ["neighbro-mobile-light", "http://neighbro.place/", { width: 390, height: 844 }, "light"],
  ["panel-login", "http://localhost:62173/", { width: 1440, height: 900 }, "light"],
];
const browser = await chromium.launch({
  args: ["--host-resolver-rules=MAP sosed.place 127.0.0.1:8080, MAP neighbro.place 127.0.0.1:8080"],
});
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
