// A table in the web face (W8; G2's screen 19): Женя sets a dots table and
// Аня sits and applies, a rematch starts the board — through the page's
// client, as no screen makes a table yet — then both open the table's own
// link, /t/<id>, after their PIN; whoever the node says moves takes an edge
// by clicking it, and the other one's screen shows it taken.

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

test("a table opens by its link after the PIN, and a move on one screen shows on the other", async ({ browser }) => {
  test.setTimeout(150_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });

  const made = await call<{ status: number; body: { id: string } }>(zhenya, "POST", "/tables", {
    class: "dots", set: "2x2", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000,
    // 16 bytes, base64url, as depth/core/tables.ts makes it.
    nonce: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.id;
  const sat = await call<{ status: number }>(anya, "POST", `/tables/${id}/seat`);
  expect(sat.status).toBeLessThan(300);
  expect((await call<{ status: number }>(anya, "POST", `/tables/${id}/lines`, { kind: "application", text: "сыграю" })).status).toBe(202);
  expect((await call<{ status: number }>(zhenya, "POST", `/tables/${id}/proposals`, { kind: "rematch" })).status).toBeLessThan(300);

  await openTable(zhenya, id);
  await openTable(anya, id);
  await expect(zhenya.getByTestId("dots")).toBeVisible();
  await expect(zhenya.getByTestId("table")).toContainText("сидят");

  // Whoever's turn it is sees "ваш ход"; the other one the name.
  await expect(zhenya.getByTestId("turn")).toBeVisible({ timeout: 15000 });
  const mover = (await zhenya.getByTestId("turn").textContent())!.startsWith("ваш ход") ? zhenya : anya;
  const other = mover === zhenya ? anya : zhenya;
  await expect(mover.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  await expect(other.locator("[data-taken]")).toHaveCount(0);
  // An edge is an SVG line: a box of zero height or width, which Playwright
  // never calls clickable; the click event is what the screen listens to.
  await mover.locator('[data-edge][role="button"]').first().dispatchEvent("click");
  await expect(other.locator("[data-taken]")).toHaveCount(1, { timeout: 15000 });
  await expect(other.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
});
