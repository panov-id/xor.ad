// One's own span in the web conversation (chat spec §8.6, W11-A), against a
// live node: the screen shows «гаснет после 1ч ВАШЕГО молчания» from the
// start; a press on «10 минут» goes to PATCH /chats/:id and moves one's own
// end by exactly fifty minutes, the other side's row untouched in the
// database; the silence counter lights only in the last quarter — set up by
// moving this side's last own message eight minutes back in the database,
// which is what eight minutes of silence come to — and one's own line puts it
// out; and a healthy conversation offers «попросить новые ключи» as the
// terminal does (the owner's decision of 01.10.2026): asked here, agreed
// there, both at epoch 1.

import postgres from "postgres";
import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, runLabel, writePhrase } from "./helpers.ts";

const DATABASE = process.env.DATABASE_URL ?? "postgres://relay:test@postgres:5432/relay_test";

async function register(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill(name);
  await page.getByTestId("age").fill("30");
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
}

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${name} error] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${name} ${m.type()}] ${m.text()}`); });
  await register(page, name);
  return page;
}

// Through the feed, so the inbox is read again (rekey.spec reads it so).
async function openChat(page: Page) {
  await page.getByTestId("nav-feed").click();
  await page.getByTestId("nav-inbox").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(page.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
}

test("one's own span is set from the screen, moves only one's own end, lights the counter in the last quarter, and a healthy conversation can ask for new keys", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const run = runLabel();
  const aText = `кто в парке к вечеру ${run}`;
  const bText = `иду в парк ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");
  await openMatch(anya, "Борис");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("to-inbox").click();
  await openMatch(boris, "Аня");
  await expect(boris.locator('[data-screen="match"]')).toContainText("Уже согласились и ждут вас", { timeout: 15000 });
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  const chatId = (await boris.locator('[data-testid="chat"]').getAttribute("data-id"))!;
  await openChat(anya);
  await openChat(boris);
  const screenA = anya.locator('[data-screen="chat"]');
  const screenB = boris.locator('[data-screen="chat"]');

  // The default: an hour, one's own, in view; no counter yet.
  await expect(screenA).toHaveAttribute("data-span", "60");
  // The words live in the ⓘ balloon now (comic, 2026-10-01): open, read, close.
  await anya.getByTestId("fades-info").getByRole("button").click();
  await expect(anya.getByTestId("fades-text")).toHaveText("гаснет после 1ч ВАШЕГО молчания");
  await anya.keyboard.press("Escape");
  await expect(anya.getByTestId("fades")).toHaveAttribute("data-counting", "no");
  await expect(anya.getByTestId("span-60")).toHaveAttribute("aria-pressed", "true");
  // New keys are offered to a healthy conversation, as in the terminal.
  await expect(anya.getByTestId("rekey-ask")).toBeEnabled();

  // Ten minutes: PATCH /chats/:id → 200, the end fifty minutes closer.
  const patches: number[] = [];
  anya.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}` && r.request().method() === "PATCH") patches.push(r.status()); });
  const endBefore = Number(await screenA.getAttribute("data-ends-at"));
  await anya.getByTestId("span-10").click();
  await expect(screenA).toHaveAttribute("data-span", "10", { timeout: 15000 });
  await anya.getByTestId("fades-info").getByRole("button").click();
  await expect(anya.getByTestId("fades-text")).toHaveText("гаснет после 10 мин ВАШЕГО молчания");
  await anya.keyboard.press("Escape");
  await expect(anya.getByTestId("span-10")).toHaveAttribute("aria-pressed", "true");
  expect(patches).toEqual([200]);
  expect(Number(await screenA.getAttribute("data-ends-at"))).toBe(endBefore - 50 * 60);
  // Still not the last quarter: ten minutes from the chat's birth, nothing said.
  await expect(anya.getByTestId("fades")).toHaveAttribute("data-counting", "no");

  // In the database: one row at 10, one still at 60 — one's own and nobody else's.
  const sql = postgres(DATABASE, { max: 1 });
  try {
    const spans = await sql<{ idle_ttl_minutes: number }[]>`
      SELECT idle_ttl_minutes FROM chat_participants WHERE chat_id = ${chatId} ORDER BY idle_ttl_minutes`;
    expect(spans.map((r) => r.idle_ttl_minutes)).toEqual([10, 60]);
    // Eight minutes of A's silence, as the node would have kept them: her
    // last own message moved back, her end now two minutes away.
    await sql`UPDATE chat_participants SET last_own_message_at = now() - interval '8 minutes'
              WHERE chat_id = ${chatId} AND idle_ttl_minutes = 10`;
  } finally {
    await sql.end();
  }
  // The other side's screen knows nothing of it.
  await expect(screenB).toHaveAttribute("data-span", "60");
  await expect(boris.getByTestId("fades")).toHaveAttribute("data-counting", "no");

  // A opens the conversation again: the row's end comes from the node, and the
  // counter stands in the last quarter — a clock under 2:30.
  await anya.getByTestId("back").click();
  await openChat(anya);
  await expect(screenA).toHaveAttribute("data-span", "10");
  await expect(anya.getByTestId("fades")).toHaveAttribute("data-counting", "yes");
  await expect(anya.getByTestId("silence-clock")).toHaveText(/^ · [0-2]:[0-5]\d$/);
  // Her own line resets her silence: the counter goes out.
  await anya.getByTestId("text").fill("ещё тут");
  await anya.getByTestId("send").click();
  await expect(anya.locator('[data-testid="mine"][data-state="sent"]').last()).toContainText("ещё тут");
  await expect(anya.getByTestId("fades")).toHaveAttribute("data-counting", "no");
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("ещё тут", { timeout: 20000 });

  // New keys asked of a healthy conversation: A asks, B is asked and agrees,
  // both stand at epoch 1 and a line goes through.
  // The waiting row, not the status line: the status is overwritten by the
  // keys' own report («the other side has not answered the key reissue yet»)
  // as soon as the asking side turns its keys — seen in the full run, W11-A.
  await anya.getByTestId("rekey-ask").click();
  await expect(anya.getByTestId("rekey-waiting")).toBeVisible({ timeout: 20000 });
  // Shut while one's own request waits, as the terminal's row (rooms.ts).
  await expect(anya.getByTestId("rekey-ask")).toBeDisabled();
  await expect(boris.getByTestId("rekey-asked")).toBeVisible({ timeout: 20000 });
  await boris.getByTestId("rekey-agree").click();
  await expect(screenB).toHaveAttribute("data-epoch", "1", { timeout: 20000 });
  await expect(screenB).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(screenA).toHaveAttribute("data-epoch", "1", { timeout: 20000 });
  await expect(screenA).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await boris.getByTestId("text").fill("под новыми ключами");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("под новыми ключами", { timeout: 20000 });

  await a.close();
  await b.close();
});
