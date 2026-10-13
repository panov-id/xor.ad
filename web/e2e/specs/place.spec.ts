// The place screen (owner 12.10.2026): a city by name or a point from a map, and the browser is never
// asked for its position — the privacy policy of both storefronts says so (landing/legal/privacy_EN.md
// in sosed.place and neighbro.place). Any call to navigator.geolocation during the walk fails the test.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

test("place: a city by name and a point from a map, the browser's position never asked", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __geo: number };
    w.__geo = 0;
    const count = () => { w.__geo++; };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      get: () => ({ getCurrentPosition: count, watchPosition: () => { count(); return 0; }, clearWatch: () => {} }),
    });
  });
  await register(page);

  await page.getByTestId("place").click();
  await expect(page.locator('[data-screen="place"]')).toBeVisible();
  await expect(page.getByTestId("place-here")).toHaveCount(0);

  await page.getByTestId("place-search").fill("Лимассол");
  await page.getByTestId("place-city").first().click();
  await expect(page.locator('[data-screen="place"]')).toHaveCount(0);

  await page.getByTestId("place").click();
  await page.getByTestId("place-point").fill("34.6719, 33.0436");
  await page.getByTestId("place-use").click();
  await expect(page.locator('[data-screen="place"]')).toHaveCount(0);

  expect(await page.evaluate(() => (window as unknown as { __geo: number }).__geo), "navigator.geolocation was touched").toBe(0);
});
