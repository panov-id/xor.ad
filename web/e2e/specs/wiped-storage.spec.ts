// The site's data wiped while the identity lives on (W12-WS): the person
// clears the browser's storage, the vault's record (IndexedDB xor-vault) is
// gone, and the node still holds the identity and its session. The page has
// nothing on the disk to tell this from a first visit, so the way back is the
// splash's "I have a paper code" — not a dead end at the PIN, not a wait on
// "loading", and the paper code raises the identity under a new PIN (the old
// session is frozen by the raise, §8.2). The words are the temporary ones
// (owner.md 27.09 V2); what is held here is the path.

import { expect, test } from "../fixtures/address.ts";
import { register, unlock, watch } from "./helpers.ts";

test("with the site's data wiped the page leads to the paper code, and the code raises the identity here", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await context.newPage();
  const feed: number[] = [];
  watch(page, feed);
  const code = await register(page);
  expect(code).toHaveLength(4);
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });

  // The person clears the site's data: the vault's database goes, the tab's
  // storage too. The node knows nothing of it.
  const wiped = await page.evaluate(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("xor-vault");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
    return (await indexedDB.databases()).map((d) => d.name);
  });
  expect(wiped).not.toContain("xor-vault");

  await page.reload();
  // Not the PIN of a device that remembers nobody, and not "loading" for good:
  // the splash, with the paper code's way in.
  await expect(page.locator('[data-screen="splash"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-screen="unlock"]')).toHaveCount(0);
  await expect(page.getByTestId("restore")).toBeVisible();

  const claims: number[] = [];
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (path === "/recovery/claim" || path === "/vault/init") claims.push(r.status());
  });
  await page.getByTestId("restore").click();
  await expect(page.locator('[data-screen="restore"]')).toBeVisible();
  await page.getByTestId("restore-code").fill(code.join(" "));
  await page.getByTestId("restore-pin").fill("246810");
  await page.getByTestId("restore-pin-again").fill("246810");
  await page.getByTestId("restore-go").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(claims).toEqual([200, 204]);
  expect(feed[feed.length - 1]).toBe(200);

  // The device remembers again: a reload asks the new PIN and opens.
  await page.reload();
  await unlock(page, "246810");
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked");
  await context.close();
});
