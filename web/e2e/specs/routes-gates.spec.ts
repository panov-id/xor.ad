// The gates' address (web/src/App.tsx gate/gateBack; owner 14.10.2026 "I do not see
// the routing"): before an identity is open each gate names itself in the path,
// a direct link or a reload opens the gate it names, Back walks the gates, and a
// seated path asked before sign-in is where the sign-in continues.

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

const path = (page: Page) => new URL(page.url()).pathname;
const on = (page: Page, name: string) => expect(page.locator(`[data-screen="${name}"]`)).toBeVisible();

test("gates: each names itself in the path, Back walks them, a direct link and a reload open the gate named", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start").click();
  await on(page, "register-1");
  expect(path(page), "the register gate did not write its path").toBe("/register");

  await page.goBack();
  await expect(page.getByTestId("start")).toBeVisible();
  expect(path(page)).toBe("/");

  await page.getByTestId("restore").click();
  await expect.poll(() => path(page), { message: "the restore gate did not write its path" }).toBe("/restore");
  await page.reload();
  await expect.poll(() => path(page)).toBe("/restore");
  await expect(page.getByTestId("start")).toHaveCount(0);

  await page.goto("/register");
  await on(page, "register-1");
  expect(path(page)).toBe("/register");
});

test("gates: a seated path opened before sign-in is where the unlock lands", async ({ page }) => {
  await register(page);
  await page.goto("/me");
  // A record on the device: the gate before /me is the unlock, and the address keeps /me.
  await on(page, "unlock");
  expect(path(page)).toBe("/me");
  await unlock(page, PIN);
  await expect.poll(() => path(page), { message: "the unlock did not continue to the path asked" }).toBe("/me");
  await on(page, "me");
});
