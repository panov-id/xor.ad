// Taking one's own phrase down from the web feed (chat spec §8.3, W11-C),
// against a live node: A's phrase goes out at POST /feed 200 and the feed's
// sent line offers «снять фразу»; B, in a browser of their own, sees the card;
// A presses — DELETE /feed/:id → 204 — the sent line goes, B's feed read again
// has no card; the live slot is free, so A's next phrase goes out at once; and
// a second DELETE by the same id, by the page's own client, is 404 — the node's
// one answer for a phrase that is not mine any more.

import { type BrowserContext, expect, type Page, test } from "../fixtures/address.ts";
import { runLabel, writePhrase } from "./helpers.ts";

type Xor = { client: Record<string, (...x: unknown[]) => Promise<unknown>> };
const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: Xor }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

async function register(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill(name);
  await page.getByTestId("age").fill("28");
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill("246813");
  await page.getByTestId("pin-again").fill("246813");
  await page.getByTestId("register").click();
  await expect(page.locator('[data-screen="register-3"]')).toBeVisible({ timeout: 30000 });
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("group-2").fill(code[1]);
  await page.getByTestId("group-4").fill(code[3]);
  await page.getByTestId("confirm").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
}

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${name} error] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${name} ${m.type()}] ${m.text()}`); });
  await register(page, name);
  return page;
}

// The feed read again, as a person does it: away to the inbox and back.
async function rereadFeed(page: Page) {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("nav-feed").click();
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
}

test("one's own phrase comes down from the feed's sent line: 204, gone from the neighbour's feed, the slot free, a second try 404", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const run = runLabel();
  const text = `иду на рынок, кому что купить ${run}`;
  const posted: string[] = [];
  anya.on("response", async (r) => {
    if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST" && r.status() === 200) posted.push(((await r.json()) as { id: string }).id);
  });
  await writePhrase(anya, text);
  await expect(anya.getByTestId("sent")).toContainText(text);
  // The handle is there only while the id is known.
  await expect(anya.getByTestId("takedown")).toBeVisible();
  expect(posted).toHaveLength(1);
  const phraseId = posted[0];

  // B sees it.
  await rereadFeed(boris);
  await expect(boris.getByTestId("card").filter({ hasText: text })).toHaveCount(1, { timeout: 30000 });

  // A takes it down: DELETE /feed/:id → 204, the sent line goes.
  const deletes: number[] = [];
  anya.on("response", (r) => { if (new URL(r.url()).pathname === `/feed/${phraseId}` && r.request().method() === "DELETE") deletes.push(r.status()); });
  await anya.getByTestId("takedown").click();
  await expect(anya.getByTestId("sent")).toHaveCount(0, { timeout: 15000 });
  expect(deletes).toEqual([204]);
  await expect(anya.getByTestId("takedown-refused")).toHaveCount(0);

  // B's feed, read again, has no such card.
  await rereadFeed(boris);
  await expect(boris.getByTestId("card").filter({ hasText: text })).toHaveCount(0);

  // The live slot is free: the next phrase goes out at once.
  const next = `передумал, иду в парк ${run}`;
  await writePhrase(anya, next);
  await expect(anya.getByTestId("sent")).toHaveAttribute("data-state", "published");
  await expect(anya.getByTestId("takedown")).toBeVisible();

  // A second DELETE by the old id: 404 — the node does not say which (W11-B).
  const again = await viaClient<{ status: number }>(anya, "takeDown", phraseId);
  expect(again.status).toBe(404);

  await a.close();
  await b.close();
});
