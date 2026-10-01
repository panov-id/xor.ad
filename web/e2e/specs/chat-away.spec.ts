// The other side's absence in the web conversation (chat spec §8.2, §8.8;
// W12-AW), against a live node: Аня and Борис talk; Аня steps away from "me"
// (POST /away 200) — Борис's open conversation gets the node's one system frame
// and shows «отошёл» by her name, the field still live; she comes back and
// writes, and her line takes the mark off. Then what a tab did not see: the
// conversation's last activity moved in the database past the newest moment
// this tab saw — what a line this tab never got comes to — and on opening the
// conversation again the page says «вы пропустили сообщение — попросите
// прислать снова»; a tab that saw nothing of the conversation says nothing.

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

async function openChat(page: Page) {
  await page.getByTestId("nav-feed").click();
  await page.getByTestId("nav-inbox").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(page.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
}

test("the other side's step away marks the header until their next line, and a tab says what it missed only when it saw the conversation before", async ({ browser }) => {
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
  const screenB = boris.locator('[data-screen="chat"]');
  // A line each way, so both tabs have seen the conversation.
  await anya.getByTestId("text").fill("я тут");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("я тут", { timeout: 20000 });
  await boris.getByTestId("text").fill("и я");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("и я", { timeout: 20000 });
  // Nothing missed, nobody away.
  await expect(screenB).toHaveAttribute("data-peer-away", "no");
  await expect(screenB).toHaveAttribute("data-missed", "no");
  await expect(boris.getByTestId("missed")).toHaveCount(0);

  // Аня steps away for twenty minutes: POST /away 200; Борис's open
  // conversation hears the node's system frame and marks her name — and the
  // field is still his to write in.
  const aways: number[] = [];
  anya.on("response", (r) => { if (new URL(r.url()).pathname === "/away" && r.request().method() === "POST") aways.push(r.status()); });
  await anya.getByTestId("back").click();
  await anya.getByTestId("tab-me").click();
  await anya.getByTestId("me-away").click();
  await expect(anya.locator('[data-screen="step-away"]')).toBeVisible();
  await anya.getByTestId("away-short").click();
  await expect(anya.getByTestId("away-price")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("away-go").click();
  await expect(anya.locator('[data-screen="away"]')).toBeVisible({ timeout: 15000 });
  expect(aways).toEqual([200]);
  await expect(boris.getByTestId("peer-away"), "the page never heard the other side step away").toBeVisible({ timeout: 20000 });
  await expect(boris.getByTestId("peer-away")).toContainText("отошёл");
  await expect(screenB).toHaveAttribute("data-peer-away", "yes");
  await expect(boris.getByTestId("text")).toBeEnabled();

  // She comes back early and writes: her line takes the mark off.
  await anya.getByTestId("away-return").click();
  await expect(anya.getByTestId("away-sure")).toBeVisible();
  await anya.getByTestId("away-return").click();
  await expect(anya.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
  await openChat(anya);
  await anya.getByTestId("text").fill("вернулась");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("вернулась", { timeout: 20000 });
  await expect(screenB).toHaveAttribute("data-peer-away", "no");
  await expect(boris.getByTestId("peer-away")).toHaveCount(0);

  // What a tab did not see: the conversation moved on the node after the
  // newest moment Борис's tab saw — set up in the database, as a line this
  // tab never got comes to — and the next opening says so; Аня's tab, which
  // saw the same conversation up to its own last line, says nothing.
  await boris.getByTestId("back").click();
  const sql = postgres(DATABASE, { max: 1 });
  try {
    await sql`UPDATE chats SET last_activity_at = now() + interval '2 minutes' WHERE id = ${chatId}`;
  } finally {
    await sql.end();
  }
  await openChat(boris);
  await expect(boris.getByTestId("missed")).toHaveText("вы пропустили сообщение — попросите прислать снова");
  await expect(screenB).toHaveAttribute("data-missed", "yes");
  // His own line is the newest moment again: the line goes.
  await boris.getByTestId("text").fill("что я пропустил?");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("что я пропустил?", { timeout: 20000 });
  await expect(boris.getByTestId("missed")).toHaveCount(0);
  await expect(screenB).toHaveAttribute("data-missed", "no");

  // A tab that never saw the conversation claims nothing: Аня reloads — the
  // vault, the PIN — and opens it; the row's activity is ahead of a tab with
  // no memory, and no line says "missed".
  await anya.reload();
  await expect(anya.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 20000 });
  await anya.getByTestId("unlock-pin").fill("246813");
  await anya.getByTestId("unlock").click();
  await expect(anya.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await openChat(anya);
  await expect(anya.getByTestId("missed")).toHaveCount(0);
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-missed", "no");

  await a.close();
  await b.close();
});
