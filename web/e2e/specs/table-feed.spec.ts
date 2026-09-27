// Tables in the feed (W10; G1h): Женя sets a table from the feed's "new
// table" at the page's own spot and circle, and lands at it; Аня, in the same
// circle, finds its card among Женя's phrases, presses it, takes the seat and
// is at the table — both screens name her among the seated.

import { expect, test, type Page } from "../fixtures/address.ts";
import { register } from "./helpers.ts";

// The page's own spot (App.tsx: 41.9, 12.5), as a phrase from there.
const CIRCLE = { lat: 41.9, lon: 12.5, radius: 1000 as const };

const say = (page: Page, text: string) =>
  page.evaluate(([t, c]) => {
    const xor = (globalThis as unknown as { xor?: { client: { say(p: unknown): Promise<{ status: number }> } } }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client.say({ text: t, mode: "company", ...c });
  }, [text, CIRCLE] as const);

test("a table set from the feed comes into a neighbour's feed, and its card seats her", async ({ browser }) => {
  test.setTimeout(150_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });

  // Phrases for the table to stand among (a table goes after every third).
  for (const text of ["кто на пляж?", "ищу компанию на ужин", "есть кто в парке?"]) {
    expect((await say(zhenya, `${text} ${Date.now().toString(36)}`)).status).toBe(200);
  }

  await zhenya.getByTestId("new-table").click();
  await expect(zhenya.locator('[data-screen="new-table"]')).toBeVisible();
  await zhenya.getByTestId("new-table-name").fill("точки у фонтана");
  await zhenya.getByTestId("new-table-go").click();
  await expect(zhenya.getByTestId("table")).toBeVisible({ timeout: 30000 });
  await expect(zhenya.getByTestId("table")).toContainText("«точки у фонтана»");

  // The feed read again: away to the inbox and back.
  await anya.getByTestId("nav-inbox").click();
  await anya.getByTestId("nav-feed").click();
  const card = anya.getByTestId("table-card").filter({ hasText: "точки у фонтана" });
  await expect(card).toHaveCount(1, { timeout: 30000 });
  await expect(card).toContainText("свободно мест: 1");
  await card.click();
  await expect(anya.getByTestId("table")).toBeVisible({ timeout: 30000 });
  await expect(anya.getByTestId("table")).toContainText("Женя");
  await expect(zhenya.getByTestId("table")).toContainText("Аня", { timeout: 15000 });
});
