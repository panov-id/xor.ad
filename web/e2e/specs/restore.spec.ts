// A clean device raised by the paper code (W6): one browser context registers
// and writes the code down; another, with nothing on its disk, types the code
// and a new PIN, and the identity is there — the node's claim answered 200,
// the feed answers 200 to the new session's key, and a reload of the clean
// device opens with the new PIN. The old device is frozen by the raise
// (§8.2: one live session), which the node says with a 401 to its next call.

import { expect, test } from "@playwright/test";
import { register, unlock, watch } from "./helpers.ts";

test("the paper code raises the identity on a clean device, sealed under a new PIN", async ({ browser }) => {
  test.setTimeout(120_000);
  const first = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const old = await first.newPage();
  const feedOld: number[] = [];
  watch(old, feedOld);
  const code = await register(old);
  expect(code).toHaveLength(4);

  const second = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const fresh = await second.newPage();
  const feedNew: number[] = [];
  watch(fresh, feedNew);
  const claims: number[] = [];
  fresh.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (path === "/recovery/claim" || path === "/vault/init") claims.push(r.status());
  });
  await fresh.goto("/");
  await fresh.getByTestId("restore").click();
  await expect(fresh.locator('[data-screen="restore"]')).toBeVisible();
  // A wrong code is refused before anything is seated.
  await fresh.getByTestId("restore-code").fill("0000 0000 0000 0000");
  await fresh.getByTestId("restore-pin").fill("975310");
  await fresh.getByTestId("restore-pin-again").fill("975310");
  await fresh.getByTestId("restore-go").click();
  await expect(fresh.getByTestId("error")).toContainText("Код не подошёл", { timeout: 30000 });
  // The real one, typed the way a person types it.
  await fresh.getByTestId("restore-code").fill(`${code[0].toLowerCase()}-${code[1]} ${code[2]}-${code[3]}`);
  await fresh.getByTestId("restore-go").click();
  await expect(fresh.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
  await expect(fresh.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  // The wrong code was a 404; the right one a 200, then the first PIN 204.
  expect(claims).toEqual([404, 200, 204]);
  expect(feedNew[feedNew.length - 1]).toBe(200);

  // The clean device reloads: the vault, the new PIN, the feed.
  await fresh.evaluate(() => sessionStorage.clear());
  await fresh.reload();
  await unlock(fresh, "975310");
  await expect(fresh.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(fresh.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked");
  await expect(fresh.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feedNew[feedNew.length - 1]).toBe(200);

  // The old device: its session went quiet with the raise — the node refuses
  // its next signed call.
  const refused = await old.evaluate(async () => {
    const xor = (globalThis as unknown as { xor?: { client: { profile(): Promise<unknown> } } }).xor;
    try { await xor!.client.profile(); return "ok"; } catch (e) { return (e as Error).message; }
  });
  expect(refused).toContain("401");
});
