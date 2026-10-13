// The face's address (web/src/router.ts; owner 12.10.2026, "tabs + nested,
// without ids"): a tab names itself in the path, the browser's Back walks the
// screens as they were visited, a reload after the PIN opens the screen the
// path names, and a screen that holds an object — a table, a chat — says only
// what it is: the object stays in history.state, never in the URL.

import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/address.ts";
import { likeByCard, newTable, openMatch, PIN, register, runLabel, unlock, writePhrase } from "./helpers.ts";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const path = (page: Page) => new URL(page.url()).pathname;

test("tabs change the path, Back walks them, a reload lands where the path says, a table has no id in the URL", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(page);
  await expect.poll(() => path(page)).toBe("/feed");

  await page.getByTestId("nav-tables").click();
  await expect(page.locator('[data-screen="tables"]')).toBeVisible();
  expect(path(page)).toBe("/tables");
  await page.getByTestId("nav-inbox").click();
  await expect(page.locator('[data-screen="inbox"]')).toBeVisible();
  expect(path(page)).toBe("/inbox");

  // The browser's Back: the tab before, then the one before that.
  await page.goBack();
  await expect(page.locator('[data-screen="tables"]')).toBeVisible();
  expect(path(page)).toBe("/tables");
  await page.goBack();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible();
  expect(path(page)).toBe("/feed");

  // A deep, id-less screen survives a reload: the PIN, then the composer.
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  expect(path(page)).toBe("/write");
  await page.reload();
  await unlock(page, PIN);
  await expect(page.locator('[data-screen="composer"]')).toBeVisible({ timeout: 30000 });
  expect(path(page)).toBe("/write");

  // A reload on /tables, a path the node also answers: the page, then the tables after the PIN.
  await page.goto("/tables");
  await unlock(page, PIN);
  await expect(page.locator('[data-screen="tables"]')).toBeVisible({ timeout: 30000 });
  expect(path(page)).toBe("/tables");

  // A table: /table, the id nowhere in the address; its back returns to the tables.
  await newTable(page, { name: `адрес ${runLabel()}` });
  expect(path(page)).toBe("/table");
  expect(page.url()).not.toMatch(UUID);
  await page.locator('[data-screen="table"]').getByTestId("back").click();
  await expect(page.locator('[data-screen="tables"]')).toBeVisible({ timeout: 15000 });
  expect(path(page)).toBe("/tables");

  // A reload on /table: no object in a fresh life, so its tab opens.
  await page.goForward();
  await expect(page.getByTestId("table")).toBeVisible({ timeout: 15000 });
  await page.reload();
  await unlock(page, PIN);
  await expect(page.locator('[data-screen="tables"]')).toBeVisible({ timeout: 30000 });
});

test("a chat opens at /chat with no id in the URL, and the browser's Back returns to the inbox", async ({ browser }) => {
  test.setTimeout(240_000);
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const boris = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(anya, { name: "Аня", age: "28" });
  await register(boris, { name: "Борис", age: "30" });
  const run = runLabel();
  const aText = `адрес у реки ${run}`;
  const bText = `адрес у моста ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");

  await openMatch(anya, "Борис");
  expect(path(anya)).toBe("/match");
  expect(anya.url()).not.toMatch(UUID);
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await openMatch(boris, "Аня");
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });

  const open = boris.locator('[data-testid="chat"] [data-testid="open-chat"]');
  await expect(open).toHaveCount(1, { timeout: 15000 });
  await open.click();
  await expect(boris.locator('[data-screen="chat"]')).toBeVisible({ timeout: 20000 });
  expect(path(boris)).toBe("/chat");
  expect(boris.url()).not.toMatch(UUID);

  await boris.goBack();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  expect(path(boris)).toBe("/inbox");
  // Forward again: the chat comes back from the entry's state, the URL still id-less.
  await boris.goForward();
  await expect(boris.locator('[data-screen="chat"]')).toBeVisible({ timeout: 20000 });
  expect(boris.url()).not.toMatch(UUID);
  // And the in-app back agrees with the browser's: the inbox, one entry back.
  await boris.locator('[data-screen="chat"]').getByTestId("back").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  expect(path(boris)).toBe("/inbox");
});
