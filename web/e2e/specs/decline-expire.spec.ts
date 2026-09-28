// The offer declined and the terms running out (chat spec §8.5, §8.10; the
// flows' sections 9 and 11). Three paths, each two people against the live node:
//
// - the queue: the first to press "поговорить" writes lines before the other
//   agrees; they stand without a mark, and reach the other at their consent
//   (§8.5, owner's decision 18.09.2026);
// - the decline: the second's "не сейчас" turns the first's waiting
//   conversation into the tombstone «предложение ушло» (§8.5, same decision);
// - the terms: a match whose term ran out leaves both inboxes silently, and a
//   conversation whose term came shows the tombstone to the one watching it
//   and leaves the list without a trace (§8.10, decided 20.08.2026).
//
// The terms are moved in the stand's database, not waited out: a phrase lives
// four hours and twenty minutes, a conversation ten minutes at the least. The
// node's own minute sweepers do the rest, so each wait is up to ninety seconds.

import postgres from "postgres";
import { expect, test, type Browser, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, runLabel, writePhrase } from "./helpers.ts";

const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";
const SWEEP = 90_000;

async function twoWithAMatch(browser: Browser): Promise<{ anya: Page; boris: Page; matchId: string; close: () => Promise<void> }> {
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await a.newPage();
  const boris = await b.newPage();
  anya.on("pageerror", (e) => console.log(`[Аня error] ${e.message}`));
  boris.on("pageerror", (e) => console.log(`[Борис error] ${e.message}`));
  await register(anya, { name: "Аня", age: "28" });
  await register(boris, { name: "Борис", age: "31" });
  const run = runLabel();
  const aText = `кто на набережную? ${run}`;
  const bText = `гуляю у залива ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");
  const matchId = await openMatch(anya, "Борис");
  return { anya, boris, matchId, close: async () => { await a.close(); await b.close(); } };
}

async function inDatabase(fn: (sql: postgres.Sql) => Promise<unknown>): Promise<void> {
  const sql = postgres(DATABASE, { max: 1 });
  try {
    await fn(sql);
  } finally {
    await sql.end();
  }
}

test("lines written while waiting stand without a mark and reach the other at their consent", async ({ browser }) => {
  test.setTimeout(240_000);
  const { anya, boris, matchId, close } = await twoWithAMatch(browser);

  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  const first = `я у фонтана ${matchId.slice(0, 6)}`;
  const second = `в синей куртке ${matchId.slice(0, 6)}`;
  for (const line of [first, second]) {
    await anya.getByTestId("queued-line").fill(line);
    await anya.getByTestId("queued-line").press("Enter");
  }
  const queued = anya.getByTestId("queued").locator("li");
  await expect(queued).toHaveCount(2);
  await expect(queued.first()).toContainText(first);

  await openMatch(boris, "Аня");
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  // Anya's device sends the queue under the chat key once it is born.
  await anya.getByTestId("to-inbox").click();
  await expect(anya.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 20000 });
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(boris.getByTestId("theirs")).toHaveText([new RegExp(first), new RegExp(second)], { timeout: 30000 });

  await close();
});

test("the second's not now turns the first's waiting conversation into «предложение ушло»", async ({ browser }) => {
  // Not built yet: the node keeps a decline to its own side (chat_RU.md:2081,
  // superseded by :2135, owner 18.09.2026). Task Q9 builds it and drops this.
  test.fail(true, "Q9: the decline is not told to the waiting side yet");
  test.setTimeout(240_000);
  const { anya, boris, matchId, close } = await twoWithAMatch(browser);

  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("queued-line").fill("я уже иду");
  await anya.getByTestId("queued-line").press("Enter");

  await openMatch(boris, "Аня");
  await boris.getByTestId("not-now").click();
  await expect(boris.getByTestId("not-now")).toHaveText("вернуть");

  // §8.5 (owner 18.09.2026): the waiting side learns it, as a tombstone, and
  // the queue goes with it — nothing of it was ever on the node.
  const waiting = anya.locator(`[data-screen="match"][data-id="${matchId}"]`);
  await expect(waiting.getByTestId("tombstone"), "the first side is never told the offer went (§8.5: «предложение ушло»)")
    .toContainText("предложение ушло", { timeout: 30000 });
  await expect(waiting.getByTestId("queued-line")).toHaveCount(0);

  await close();
});

test("a match whose term ran out leaves both inboxes silently", async ({ browser }) => {
  test.setTimeout(240_000);
  const { anya, boris, matchId, close } = await twoWithAMatch(browser);
  await anya.getByTestId("back").click();
  await boris.getByTestId("nav-inbox").click();
  for (const p of [anya, boris]) await expect(p.locator(`[data-testid="match"][data-id="${matchId}"]`)).toBeVisible({ timeout: 15000 });

  await inDatabase((sql) => sql`UPDATE matches SET expires_at = now() - interval '1 second' WHERE id = ${matchId}`);

  // The list is re-read on its own; nothing says what was there.
  for (const p of [anya, boris]) {
    await expect(async () => {
      await p.getByTestId("nav-feed").click();
      await p.getByTestId("nav-inbox").click();
      // Count only a list that has loaded: an empty one while loading proves nothing.
      await expect(p.getByTestId("loading")).toHaveCount(0, { timeout: 10000 });
      await expect(p.locator(`[data-testid="match"][data-id="${matchId}"]`)).toHaveCount(0, { timeout: 3000 });
    }, "a swept match still stands in the inbox").toPass({ timeout: SWEEP });
    await expect(p.locator('[data-screen="inbox"]')).not.toContainText("истёк");
  }

  await close();
});

test("a conversation whose term came: the tombstone to the one watching, a silent row for the other", async ({ browser }) => {
  test.setTimeout(300_000);
  const { anya, boris, close } = await twoWithAMatch(browser);
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await openMatch(boris, "Аня");
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  const chatId = (await boris.locator('[data-testid="chat"]').getAttribute("data-id"))!;
  await anya.getByTestId("to-inbox").click();
  await anya.locator(`[data-testid="chat"][data-id="${chatId}"] [data-testid="open-chat"]`).click();
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });

  // Both terms come at once: the shortest there is, begun eleven minutes ago.
  await inDatabase((sql) => sql`UPDATE chat_participants SET idle_ttl_minutes = 10, last_own_message_at = now() - interval '11 minutes' WHERE chat_id = ${chatId}`);

  await expect(anya.getByTestId("tombstone"), "the one watching is not shown the end").toBeVisible({ timeout: SWEEP });
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-over", "yes");
  await expect(anya.getByTestId("text")).toHaveCount(0);
  await expect(anya.getByTestId("lines").locator("li")).toHaveCount(0);

  await expect(async () => {
    await boris.getByTestId("nav-feed").click();
    await boris.getByTestId("nav-inbox").click();
    await expect(boris.locator(`[data-testid="chat"][data-id="${chatId}"]`)).toHaveCount(0, { timeout: 3000 });
  }, "an ended conversation still stands in the list").toPass({ timeout: SWEEP });
  await expect(boris.getByTestId("tombstone")).toHaveCount(0);

  // The tombstone does not come back to the list after it is closed.
  await anya.getByTestId("back").click();
  await expect(anya.locator(`[data-testid="chat"][data-id="${chatId}"]`)).toHaveCount(0, { timeout: 15000 });

  await close();
});
