// The age filter in "me" (W14-AF; chat spec §8.2 :1485-1489), against a live
// node: the handles stay inside one's band (a 28-year-old: from 21, the right
// edge «без ограничения»), a narrowed pair is saved through PATCH
// /identities/me and comes back from GET /identities/me, and the screen
// opens on it again; the open right edge goes as null.

import { expect, test } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

type Xor = { xor: { client: { profile(): Promise<{ filter_age_min?: number; filter_age_max?: number }> } } };
const profile = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (globalThis as unknown as Xor).xor.client.profile());

test("the age filter stays inside the band, is saved to the node and opens on what was saved", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  await register(page, { name: "Аня", age: "28" });

  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-filter").click();
  const screen = page.locator('[data-screen="age-filter"]');
  await expect(screen).toBeVisible();
  // The band of 28 is [21, no limit] (min(21, A-2)): the left handle starts at 21 and goes no lower.
  await expect(page.getByTestId("filter-from")).toHaveAttribute("min", "21");
  await expect(screen).toHaveAttribute("data-from", "21");
  await expect(screen).toHaveAttribute("data-to", "open");
  await expect(page.getByTestId("filter-range")).toHaveText("21 — без ограничения");

  // Narrowed by the year: 30 to 40.
  await page.getByTestId("filter-from").fill("30");
  await page.getByTestId("filter-to").fill("40");
  await expect(page.getByTestId("filter-range")).toHaveText("30 — 40");
  await page.getByTestId("filter-save").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 15000 });
  expect(await profile(page), "the node did not keep the filter").toMatchObject({ filter_age_min: 30, filter_age_max: 40 });

  // Opened again: the saved pair. The right edge back to the end: no limit, sent as null.
  await page.getByTestId("me-filter").click();
  await expect(screen).toHaveAttribute("data-from", "30");
  await expect(screen).toHaveAttribute("data-to", "40");
  await page.getByTestId("filter-to").fill("99");
  await expect(page.getByTestId("filter-range")).toHaveText("30 — без ограничения");
  await page.getByTestId("filter-save").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 15000 });
  const after = await profile(page);
  expect(after.filter_age_min).toBe(30);
  expect(after.filter_age_max, "the open edge was not sent as null").toBeUndefined();
  await context.close();
});
