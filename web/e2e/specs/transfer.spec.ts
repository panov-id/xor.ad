// The move of an identity between two browsers (T1; chat spec §8.2, screen
// 13): the old one shows nine characters behind its PIN, the new one types
// them, both show the same four check characters, "it is me" on the old one
// moves the identity, and the new one seals it under a first PIN. A reload of
// the new device then opens with that PIN — which needs the unlock key the
// claim carried to be on the node's new session — and the feed answers 200.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock, watch } from "./helpers.ts";

test("an identity moves from one browser to another and opens there after a reload", async ({ browser }) => {
  test.setTimeout(180_000);
  const oldContext = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const old = await oldContext.newPage();
  await register(old);
  await old.getByTestId("tab-me").click();
  await old.getByTestId("me-move").click();
  await expect(old.locator('[data-screen="departure"]')).toBeVisible();
  await old.getByTestId("move-pin").fill(PIN);
  await old.getByTestId("move-go").click();
  const code = (await old.getByTestId("move-code").textContent({ timeout: 30000 }))!.trim();
  expect(code).toMatch(/^\S{3} \S{3} \S{3}$/);

  const newContext = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const fresh = await newContext.newPage();
  const feed: number[] = [];
  watch(fresh, feed);
  await fresh.goto("/");
  await fresh.getByTestId("arrive").click();
  await fresh.getByTestId("arrive-code").fill(code.toLowerCase().replace(/ /g, "-"));
  await fresh.getByTestId("arrive-go").click();
  const check = (await fresh.getByTestId("arrive-check").textContent({ timeout: 45000 }))!.trim();
  expect(check).toHaveLength(4);

  // The old device sees the claim and the same four characters.
  await expect(old.getByTestId("move-check")).toHaveText(check, { timeout: 30000 });
  await expect(old.getByTestId("move-label")).not.toBeEmpty();
  await old.getByTestId("move-yes").click();
  await expect(old.getByTestId("move-done")).toBeVisible({ timeout: 30000 });

  // The new one: arrived, a first PIN, the feed.
  await expect(fresh.getByTestId("arrive-pin")).toBeVisible({ timeout: 30000 });
  await fresh.getByTestId("arrive-pin").fill("864209");
  await fresh.getByTestId("arrive-pin-again").fill("864209");
  await fresh.getByTestId("arrive-keep").click();
  await expect(fresh.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
  await expect(fresh.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feed[feed.length - 1]).toBe(200);

  // A reload of the new device: the vault, the new PIN, the feed.
  await fresh.evaluate(() => sessionStorage.clear());
  await fresh.reload();
  const before = feed.length;
  await unlock(fresh, "864209");
  await expect(fresh.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked", { timeout: 30000 });
  await expect(fresh.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  expect(feed.length).toBeGreaterThan(before);
  expect(feed[feed.length - 1]).toBe(200);

  // The old device let go: it keeps nothing, and is back at the start.
  await old.getByTestId("move-exit").click();
  await expect(old.locator('[data-screen="splash"]')).toBeVisible({ timeout: 15000 });
});
