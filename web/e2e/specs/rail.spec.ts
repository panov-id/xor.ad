// The rail inside the app (adaptive-*-{card,composer,chat,table}-1440 sheets; review 14.10.2026): from 1024
// a sub-screen of a tab keeps the rail with its tab current; below 1024 it gains no tab bar at the foot.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

test("rail: the composer keeps the rail at 1440 with the feed current, and shows no tab bar at 393", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await register(page);
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  const nav = page.getByTestId("nav");
  await expect(nav, "the composer lost the rail at 1440").toBeVisible();
  await expect(page.getByTestId("nav-feed")).toHaveAttribute("aria-current", /.+/);
  const rail = (await nav.boundingBox())!;
  const main = (await page.locator('[data-screen="composer"]').boundingBox())!;
  expect(main.x, "the composer sits under the rail").toBeGreaterThanOrEqual(rail.x + rail.width);

  await page.setViewportSize({ width: 393, height: 852 });
  await expect(nav, "a phone gained a tab bar on the composer").toBeHidden();
});
