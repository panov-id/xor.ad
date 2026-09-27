// A match I agreed to still waits after a reload (W7; chat spec §8.5, P10):
// the node says my_consent "waiting" in the inbox row, and the screen shows
// the wait instead of offering "Поговорить" a second time.

import { expect, test, type Page } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

const CIRCLE = { lat: 41.9, lon: 12.5, radius: 1000 as const };

const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: { client: Record<string, (...x: unknown[]) => Promise<unknown>> } }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

test("after a reload, a match I agreed to shows the wait, not the button", async ({ browser }) => {
  test.setTimeout(150_000);
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const boris = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(anya);
  await register(boris, { name: "Борис", age: "31" });

  const said = await viaClient<{ status: number; body: { id: string } }>(anya, "say", { text: "гуляю у моря, если кто рядом", mode: "alone", ...CIRCLE });
  const saidB = await viaClient<{ status: number; body: { id: string } }>(boris, "say", { text: "иду к морю", mode: "alone", ...CIRCLE });
  expect([said.status, saidB.status]).toEqual([200, 200]);
  await viaClient(anya, "like", saidB.body.id);
  const back = await viaClient<{ body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state).toBe("matched");
  const matchId = back.body.match_id!;
  const row = `[data-testid="match"][data-id="${matchId}"]`;

  // A agrees and waits.
  await anya.getByTestId("nav-inbox").click();
  await anya.locator(`${row} [data-testid="open-match"]`).click({ timeout: 15000 });
  await expect(anya.locator('[data-screen="match"]')).toHaveAttribute("data-waiting", "no");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });

  // A reload: the PIN, the inbox, the same match — still waiting, no button.
  await anya.evaluate(() => sessionStorage.clear());
  await anya.reload();
  await unlock(anya, PIN);
  await expect(anya.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await anya.getByTestId("nav-inbox").click();
  await anya.locator(`${row} [data-testid="open-match"]`).click({ timeout: 15000 });
  await expect(anya.locator('[data-screen="match"]')).toHaveAttribute("data-waiting", "yes");
  await expect(anya.getByTestId("waiting")).toBeVisible();
  await expect(anya.getByTestId("talk")).toHaveCount(0);

  // B, who has not answered, is still offered the button.
  await boris.getByTestId("nav-inbox").click();
  await boris.locator(`${row} [data-testid="open-match"]`).click({ timeout: 15000 });
  await expect(boris.locator('[data-screen="match"]')).toHaveAttribute("data-waiting", "no");
  await expect(boris.getByTestId("talk")).toBeVisible();
});
