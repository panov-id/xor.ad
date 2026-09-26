// A new paper code (W6): the current one is checked on the device, the new
// one is shown and typed back, the node takes it — and from then on the old
// code raises nothing on a clean device while the new one does.

import { expect, test } from "../fixtures/address.ts";
import { register, watch } from "./helpers.ts";

test("the paper code is reissued: the old one dies, the new one raises the identity", async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await a.newPage();
  const feed: number[] = [];
  watch(page, feed);
  const old = await register(page);

  await page.getByTestId("tab-me").click();
  await page.getByTestId("me-reissue").click();
  await expect(page.locator('[data-screen="reissue-1"]')).toBeVisible();
  // A wrong current code is refused on the device, nothing sent.
  const sent: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/recovery/reissue") sent.push(r.status()); });
  await page.getByTestId("reissue-current").fill("0000 0000 0000 0000");
  await page.getByTestId("reissue-next").click();
  await expect(page.getByTestId("error")).toContainText("Код не подошёл", { timeout: 30000 });
  expect(sent).toEqual([]);
  await page.getByTestId("reissue-current").fill(old.join("-").toLowerCase());
  await page.getByTestId("reissue-next").click();
  await expect(page.locator('[data-screen="reissue-2"]')).toBeVisible({ timeout: 30000 });
  const fresh = (await page.getByTestId("reissue-code").textContent())!.trim().split(" ");
  expect(fresh).toHaveLength(4);
  expect(fresh.join("")).not.toBe(old.join(""));
  await page.getByTestId("reissue-group-2").fill(fresh[1]);
  await page.getByTestId("reissue-group-4").fill(fresh[3]);
  await page.getByTestId("reissue-confirm").click();
  await expect(page.locator('[data-screen="me"]')).toBeVisible({ timeout: 30000 });
  expect(sent).toEqual([204]);

  // A clean device: the old code is dead, the new one raises.
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const clean = await b.newPage();
  const feedB: number[] = [];
  watch(clean, feedB);
  await clean.goto("/");
  await clean.getByTestId("restore").click();
  await clean.getByTestId("restore-code").fill(old.join(" "));
  await clean.getByTestId("restore-pin").fill("135790");
  await clean.getByTestId("restore-pin-again").fill("135790");
  await clean.getByTestId("restore-go").click();
  await expect(clean.getByTestId("error")).toContainText("Код не подошёл", { timeout: 30000 });
  await clean.getByTestId("restore-code").fill(fresh.join(" "));
  await clean.getByTestId("restore-go").click();
  await expect(clean.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
  await expect(clean.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feedB[feedB.length - 1]).toBe(200);
});
