// A device raised by the paper code changes its PIN, and the vault still
// opens after a reload with the new PIN (V1): such a device keeps its session
// key under the PIN's seal too, and a change that re-sealed only the long key
// and the wrapping pair locked it out for good.

import { expect, test } from "../fixtures/address.ts";
import { register, unlock, watch } from "./helpers.ts";

test("a device raised by the paper code changes its PIN and opens with the new one after a reload", async ({ browser }) => {
  test.setTimeout(150_000);
  const first = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const code = await register(await first.newPage());

  const second = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await second.newPage();
  const feed: number[] = [];
  watch(page, feed);
  await page.goto("/");
  await page.getByTestId("restore").click();
  await page.getByTestId("restore-code").fill(code.join(" "));
  await page.getByTestId("restore-pin").fill("975310");
  await page.getByTestId("restore-pin-again").fill("975310");
  await page.getByTestId("restore-go").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });

  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-pin").click();
  await page.getByTestId("pin-current").fill("975310");
  await page.getByTestId("pin-next").fill("135792");
  await page.getByTestId("pin-again").fill("135792");
  await page.getByTestId("pin-go").click();
  await expect(page.getByTestId("pin-changed")).toContainText("ПИН сменён.", { timeout: 30000 });

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  const before = feed.length;
  await unlock(page, "135792");
  await expect(page.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked", { timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feed.length).toBeGreaterThan(before);
  expect(feed[feed.length - 1]).toBe(200);
});
