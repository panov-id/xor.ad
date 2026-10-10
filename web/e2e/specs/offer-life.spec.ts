// What is left of the phrases, in the offer's row of the inbox (WP-2; sheets
// 23/24; relay routes/inbox.ts tells each end to the match only, §8.11).
// The other's phrase is a bar, and «скоро исчезнет» in its last fifth — never
// its minutes (decision 19.09.2026); one's own phrase says how long it has.
// The end is moved in the stand's database, not waited out: a phrase lives
// four hours and twenty minutes.

import postgres from "postgres";
import { expect, test } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, runLabel, writePhrase } from "./helpers.ts";

const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

test("an offer shows the other's phrase as a bar, «скоро исчезнет» near its end, and my own phrase's minutes", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await a.newPage();
  const boris = await b.newPage();
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
  await anya.getByTestId("back").click();

  const row = anya.locator(`[data-testid="match"][data-id="${matchId}"]`);
  await expect(row).toBeVisible({ timeout: 15000 });
  // Fresh: a full bar for Борис's phrase, no «скоро», and Аня's own minutes.
  await expect(row.getByTestId("life-theirs")).toBeVisible();
  expect(Number(await row.getByTestId("life-theirs").getAttribute("data-left"))).toBeGreaterThan(0.9);
  await expect(row.getByTestId("offer-soon")).toHaveCount(0);
  await expect(row.getByTestId("offer-mine-left")).toHaveText(/ещё 4 ч (1[1-9]|20) мин/); // 251–260 minutes, said in hours and minutes (П24)

  // Борис's phrase in its last fifth: ten minutes left.
  const sql = postgres(DATABASE, { max: 1 });
  try {
    await sql`UPDATE feed_messages SET expires_at = now() + interval '10 minutes' WHERE text = ${bText}`;
  } finally {
    await sql.end();
  }
  await anya.getByTestId("refresh").click();
  await expect(row.getByTestId("offer-soon")).toHaveText("скоро исчезнет", { timeout: 15000 });
  expect(Number(await row.getByTestId("life-theirs").getAttribute("data-left"))).toBeLessThan(0.2);
  // Its minutes are never printed: the only number in the row's life is Аня's own.
  await expect(row.getByTestId("offer-life")).not.toContainText(/\b(9|10)\s*мин/);
  await expect(row.getByTestId("offer-mine-left")).toHaveText(/ещё 4 ч (1[1-9]|20) мин/); // 251–260 minutes, said in hours and minutes (П24)

  await a.close();
  await b.close();
});
