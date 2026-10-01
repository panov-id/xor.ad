// The lock after idle time (W13-WL; screen 12, docs/depth-client_RU.md
// 2026-09-17), against a live node, with the wait cut to three seconds by the
// stand's parameter (sessionStorage xor-idle-ms; web/src/idle.ts). Registered
// and left alone, the page becomes one line with no name on it; the core
// refuses a signed call; a wrong PIN is counted by the node and says the
// attempts left; the right one opens the page where it was — the tab was not
// reloaded — and a phrase goes out, so the keys sign again.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, runLabel, writePhrase } from "./helpers.ts";

type Xor = { client: { locked: boolean; profile(): Promise<unknown> } };

test("left alone, the page locks to one line; the PIN opens it in place and the keys sign again", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 393, height: 851 } });
  // The stand's parameter, before any page script runs: three seconds idle.
  await context.addInitScript(() => sessionStorage.setItem("xor-idle-ms", "3000"));
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[page ${m.type()}] ${m.text()}`); });
  const shares: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/vault/share" && r.request().method() === "POST") shares.push(r.status()); });

  await register(page, { name: "Аня", age: "28" });
  // The registration fetched the share once for its own seal; the lock's
  // calls are counted from here.
  shares.length = 0;
  // A mark on the window: a reload would lose it.
  await page.evaluate(() => { (globalThis as unknown as { __tab: number }).__tab = 7; });

  // Three seconds without input: the lock. One line, no name, the core shut.
  await expect(page.locator('[data-screen="locked"]'), "the page did not lock after the idle time").toBeVisible({ timeout: 20000 });
  await expect(page.locator("body")).not.toContainText("Аня");
  await expect(page.locator('[data-testid="nav"]')).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as unknown as { xor: Xor }).xor.client.locked)).toBe(true);
  const refused = await page.evaluate(() => (globalThis as unknown as { xor: Xor }).xor.client.profile().then(() => "answered", (e: Error) => e.message));
  expect(refused, "a signed call went through the lock").toMatch(/locked/);

  // A wrong PIN: the node counts it and says what is left.
  await page.getByTestId("lock-pin").fill("000000");
  await page.getByTestId("lock-go").click();
  await expect(page.getByTestId("error")).toHaveText("ПИН не подходит. Осталось попыток: 9", { timeout: 15000 });
  expect(shares).toEqual([409]);

  // The right one: the feed, the same tab, and the keys sign a phrase.
  // The wait goes back up first, so the steps below are not locked out mid-way.
  await page.evaluate(() => sessionStorage.setItem("xor-idle-ms", "600000"));
  await page.getByTestId("lock-pin").fill(PIN);
  await page.getByTestId("lock-go").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 20000 });
  expect(shares).toEqual([409, 200]);
  expect(await page.evaluate(() => (globalThis as unknown as { __tab?: number }).__tab), "the page was reloaded to open").toBe(7);
  expect(await page.evaluate(() => (globalThis as unknown as { xor: Xor }).xor.client.locked)).toBe(false);
  await writePhrase(page, `после замка снова здесь ${runLabel()}`);

  await context.close();
});
