// The reload grace (web/src/grace.ts; owner 14.10.2026: «обновил страницу —
// пин не спрашивать; пин после 30 секунд простоя»): reloaded within the window
// of the last input the page lands on its screen without the unlock, and the
// node is not asked for its share; after the window — the stand cuts it to
// 5 s (sessionStorage xor-grace-ms, vault.ts graceMsOf; 1.5 s was flaky: the
// «me» screen under a loaded stand took longer than the window between the
// click that stamped it and the reload, 15.10.2026) — the unlock; a new
// tab of the same device always meets the unlock; «forget» leaves no grace.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

test.use({ graced: true });

const on = (page: import("@playwright/test").Page, name: string) => expect(page.locator(`[data-screen="${name}"]`)).toBeVisible({ timeout: 20000 });

test("a reload within the window needs no PIN and no share; after the window, and in a new tab, the PIN", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 393, height: 851 } });
  // The stand's parameter, before any page script: a window of 5 s.
  await context.addInitScript(() => sessionStorage.setItem("xor-grace-ms", "5000"));
  const page = await context.newPage();
  const shares: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/vault/share" && r.request().method() === "POST") shares.push(r.status()); });

  await register(page);
  shares.length = 0;

  // Within the window (the registration armed it, the key stamps it right before): /me after a reload, no unlock.
  await page.getByTestId("tab-me").click();
  await on(page, "me");
  await page.keyboard.press("Shift");
  await page.reload();
  await on(page, "me");
  expect(await page.locator('[data-screen="unlock"]').count(), "the unlock was shown inside the grace").toBe(0);
  expect(shares, "the grace asked the node for its share").toEqual([]);

  // A same-tab navigation within the window: the address, no unlock, and the seal opened as by the PIN.
  await page.keyboard.press("Shift");
  await page.goto("/feed");
  await on(page, "feed");
  expect(shares).toEqual([]);
  await expect(page.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked");

  // Nothing stored in the clear: the tab holds a ciphertext and a key id, localStorage nothing of it.
  const kept = await page.evaluate(() => ({ tab: sessionStorage.getItem("xor-grace"), local: Object.keys(localStorage).filter((k) => k.includes("grace")) }));
  expect(kept.tab).toMatch(/^\{"id":"[A-Za-z0-9_-]+","c":"[A-Za-z0-9_-]+"\}$/);
  expect(kept.local).toEqual([]);

  // After the window without input: nothing of the grace is on the disk any more (grace.ts Keeper),
  // and the reload meets the unlock; the PIN opens it through the node.
  await page.waitForTimeout(6000);
  expect(await page.evaluate(() => sessionStorage.getItem("xor-grace")), "the ciphertext stayed in the tab after the window").toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("xor-grace-at")), "the stamp stayed in the tab after the window").toBeNull();
  await page.reload();
  await on(page, "unlock");
  await unlock(page, PIN);
  await on(page, "feed");
  expect(shares, "the unlock after the window did not go through the node").toEqual([200]);

  // A new tab of the same device, within the window of the first: the unlock, not the grace.
  await page.keyboard.press("Shift");
  const other = await context.newPage();
  await other.goto("/feed");
  await on(other, "unlock");
  expect(await other.evaluate(() => sessionStorage.getItem("xor-grace")), "the grace leaked to a new tab").toBeNull();
  await other.close();

  // «forget» on the unlock: nothing of the grace is left behind in this tab either.
  await page.keyboard.press("Shift");
  await page.reload();
  await on(page, "feed");
  await page.waitForTimeout(6000);
  await page.reload();
  await on(page, "unlock");
  await page.getByTestId("unlock-info").getByRole("button").first().click();
  await page.getByTestId("forget").click();
  await expect(page.getByTestId("start")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("xor-grace"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("xor-grace-at"))).toBeNull();

  await context.close();
});
