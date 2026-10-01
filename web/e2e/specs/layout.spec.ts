// Where a screen starts (WD10g): the sheets draw the header band at y 0 and the
// content's left edge at x 16 on a 375 phone. A 24 of .screen's padding once
// stood above every band (WD10, 28.09.2026) and no test saw it, since the specs
// read words, not geometry. This one measures the band's box and its first
// text's left edge on the feed, the conversations, "me" and the cabinet, and
// the band's height: 56, the kit's headers and sheet 17's strip (WD10h).

import { expect, test, type Page } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

const ADV = process.env.ADV_URL ?? "https://web-adv:4173";

// The band is the screen's first child (the kit's header, or the cabinet's
// strip); its text is the first text inside it.
async function measure(page: Page, screen: string, band: string, text: string, height = 56) {
  const main = page.locator(`main[data-screen="${screen}"]`);
  await expect(main).toBeVisible({ timeout: 15000 });
  const box = await main.locator(band).first().boundingBox();
  const left = await main.locator(text).first().evaluate((e) => e.getBoundingClientRect().left);
  expect(box, `${screen}: no band ${band} to measure`).not.toBeNull();
  expect(Math.round(box!.y), `${screen}: the header band starts at y=${Math.round(box!.y)}, the sheet draws it at 0`).toBe(0);
  expect(Math.round(box!.width), `${screen}: the band is ${Math.round(box!.width)} wide, the sheet's is the phone's 375`).toBe(375);
  expect(Math.round(box!.height), `${screen}: the band is ${Math.round(box!.height)} tall, the sheet's and the kit's is ${height}`).toBe(height);
  expect(Math.round(left), `${screen}: the band's text starts at x=${Math.round(left)}, the sheet's at 16`).toBe(16);
}

test("the feed, the conversations and 'me' start with their band at y 0 and their text at x 16", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await register(page, { name: "Ева", age: "29" });
  // The feed's band is the comic's scene (2026-10-01): as tall as the kit's token --comic-scene-h says.
  const scene = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--comic-scene-h")));
  expect(scene, "the kit names the scene's height (--comic-scene-h, schemes.css)").toBeGreaterThan(56);
  await measure(page, "feed", ":scope > header", ":scope > header h1", scene);
  await page.getByTestId("nav-inbox").click();
  await measure(page, "inbox", ":scope > header", ":scope > header h1");
  await page.getByTestId("tab-me").click();
  await measure(page, "me", ":scope > header", ":scope > header h1");
});

test("the cabinet's strip starts at y 0 and its address at x 16", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${ADV}/adv`);
  await measure(page, "adv-sign-in", ":scope > .cabinet-bar", ".cabinet-where");
});
