// A deck table in the web (W12): the node deals six each; a seat sees its own
// hand and the other's as a number (§6.1). Whoever the node says moves plays
// a card by pressing it; the other screen shows the card on the table and one
// card fewer in the mover's hand.

import { expect, test, type Page } from "../fixtures/address.ts";
import { PIN, register, unlock } from "./helpers.ts";

const call = <T>(page: Page, method: string, path: string, body?: unknown) =>
  page.evaluate(([m, p, b]) => {
    const xor = (globalThis as unknown as { xor?: { client: { tableCall(m: string, p: string, b?: unknown): Promise<unknown> } } }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client.tableCall(m, p, b) as Promise<T>;
  }, [method, path, body] as const);

async function openTable(page: Page, id: string) {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`/t/${id}`);
  await unlock(page, PIN);
  await expect(page.getByTestId("table")).toBeVisible({ timeout: 30000 });
}

test("a deck table: my hand is cards, the other's a number, and a played card shows on both screens", async ({ browser }) => {
  test.setTimeout(150_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });

  const made = await call<{ status: number; body: { id: string } }>(zhenya, "POST", "/tables", {
    class: "deck", set: "36", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000,
    nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.id;
  expect((await call<{ status: number }>(anya, "POST", `/tables/${id}/seat`)).status).toBeLessThan(300);
  expect((await call<{ status: number }>(anya, "POST", `/tables/${id}/lines`, { kind: "application", text: "сыграю" })).status).toBe(202);
  expect((await call<{ status: number }>(zhenya, "POST", `/tables/${id}/proposals`, { kind: "rematch" })).status).toBeLessThan(300);

  await openTable(zhenya, id);
  await openTable(anya, id);
  for (const page of [zhenya, anya]) {
    await expect(page.getByTestId("hand").getByRole("button")).toHaveCount(6, { timeout: 15000 });
    await expect(page.getByTestId("stock")).toHaveText("колода: 24");
  }

  await expect(zhenya.getByTestId("turn")).toBeVisible({ timeout: 15000 });
  const zhenyaMoves = (await zhenya.getByTestId("turn").textContent())!.startsWith("ваш ход");
  const [mover, other, moverName] = zhenyaMoves ? [zhenya, anya, "Женя"] : [anya, zhenya, "Аня"];
  await expect(other.getByTestId("others")).toHaveText(`${moverName}: 6`);
  const card = mover.getByTestId("hand").getByRole("button").first();
  const label = (await card.textContent())!.trim();
  await card.click();
  await expect(other.getByTestId("played")).toHaveText(`на столе: ${label}`, { timeout: 15000 });
  await expect(other.getByTestId("others")).toHaveText(`${moverName}: 5`, { timeout: 15000 });
  await expect(mover.getByTestId("hand").getByRole("button")).toHaveCount(5, { timeout: 15000 });
});
