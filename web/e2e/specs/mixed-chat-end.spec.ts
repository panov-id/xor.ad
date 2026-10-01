// W11-MB · the end of a conversation between the two faces, both ways. Борис
// is in the terminal (depth/ink/mixed_chat_end.node-test.ts); two people are
// in browsers of their own. Round one, Аня: the path to a line each way as
// mixed-depth.spec.ts walks it, then the terminal ends the conversation by
// hand — the page's room closes 4003 and the plain tombstone stands (not the
// block's). Round two, Вера: the same path, then the page blocks from the
// conversation, asked twice — the page's tombstone names the block; the
// terminal sees «Беседа закончилась.», and her phrase is out of his feed
// (§8.9: all three levels). A match outlives its conversation (likes.ts: a
// live match stands for the pair), so the second round is a second person.
// Run by scripts/run-web-depth-mixed.sh mixed-chat-end.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, writePhrase } from "./helpers.ts";

const sync = process.env.MIXED_SYNC ?? "/app/results/mixed-sync";
const run = process.env.MIXED_RUN ?? "";

function signal(step: string, body = ""): void {
  writeFileSync(`${sync}/${step}`, body);
  console.log(`[sync] web → ${step}`);
}

async function waitFor(step: string, seconds = 120): Promise<string> {
  for (let i = 0; i < seconds * 10; i++) {
    if (existsSync(`${sync}/${step}`)) return readFileSync(`${sync}/${step}`, "utf8");
    if (existsSync(`${sync}/depth-failed`)) {
      throw new Error(`the terminal's side failed before "${step}": ${readFileSync(`${sync}/depth-failed`, "utf8")}`);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`the terminal's side never reached "${step}"`);
}

async function openChat(page: Page): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("refresh").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 30000 });
}

// The path to a line each way with Борис, as mixed-depth.spec.ts walks it;
// the step names carry the round so the two never read each other's files.
async function meetAndTalk(page: Page, name: string, phrase: string, r: string): Promise<void> {
  await register(page, { name, age: "28" });
  await writePhrase(page, phrase);
  const his = await waitFor(`depth-phrase-${r}`, 180);
  expect(await likeByCard(page, his)).toBe("liked");
  signal(`web-liked-${r}`, phrase);
  await waitFor(`depth-liked-${r}`);
  await openMatch(page, "Борис");
  await page.getByTestId("talk").click();
  await expect(page.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("to-inbox").click();
  signal(`web-agreed-${r}`);
  await waitFor(`depth-in-chat-${r}`);
  await openChat(page);
  const line = `привет из браузера ${r} ${run}`;
  await page.getByTestId("text").fill(line);
  await page.getByTestId("send").click();
  signal(`web-said-${r}`, line);
  const reply = await waitFor(`depth-said-${r}`, 60);
  await expect(page.locator('[data-testid="theirs"]').last(), "the terminal's line did not reach the browser").toContainText(reply, { timeout: 30000 });
}

test("the terminal ends a conversation and the page sees the tombstone; the page blocks and the terminal sees the end", async ({ browser }) => {
  test.skip(run === "", "the terminal's side runs only under scripts/run-web-depth-mixed.sh");
  test.setTimeout(600_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const v = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await a.newPage();
  const vera = await v.newPage();
  for (const [who, page] of [["Аня", anya], ["Вера", vera]] as const) {
    page.on("pageerror", (e) => console.log(`[${who} error] ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${who} ${m.type()}] ${m.text()}`); });
  }
  try {
    console.log("[round 1] Аня: the terminal ends the conversation by hand");
    await meetAndTalk(anya, "Аня", `гуляю у реки ${run}`, "one");
    signal("web-heard-one");
    // The terminal's DELETE /chats/:id: the page's room closes 4003 — the plain
    // tombstone, not the block's; nothing to press.
    await waitFor("depth-ended", 60);
    const chatA = anya.locator('[data-screen="chat"]');
    await expect(anya.getByTestId("tombstone"), "the page never saw the terminal end the conversation").toBeVisible({ timeout: 30000 });
    await expect(chatA).toHaveAttribute("data-over", "yes");
    await expect(chatA).toHaveAttribute("data-blocked", "no");
    await expect(anya.getByTestId("tombstone")).toContainText("Беседа кончилась");
    await expect(anya.getByTestId("tombstone")).not.toContainText("заблокировали");
    // And the conversation is out of her inbox.
    await anya.getByTestId("back").click();
    await anya.getByTestId("refresh").click();
    await expect(anya.locator('[data-testid="chat"]')).toHaveCount(0, { timeout: 15000 });
    signal("web-saw-end");

    console.log("[round 2] Вера: the page blocks from the conversation");
    const hers = `ищу компанию на каток ${run}`;
    await meetAndTalk(vera, "Вера", hers, "two");
    const chatV = vera.locator('[data-screen="chat"]');
    const blocks: number[] = [];
    vera.on("response", (r) => { if (new URL(r.url()).pathname === "/blocks" && r.request().method() === "POST") blocks.push(r.status()); });
    // Asked twice (§8.9); backed out of once, nothing sent.
    await vera.getByTestId("block").click();
    await expect(vera.getByTestId("block-confirm")).toContainText("точно заблокировать?");
    await vera.getByTestId("block-no").click();
    expect(blocks).toEqual([]);
    await vera.getByTestId("block").click();
    await vera.getByTestId("block-yes").click();
    await expect(vera.getByTestId("tombstone")).toBeVisible({ timeout: 15000 });
    expect(blocks).toEqual([204]);
    await expect(chatV).toHaveAttribute("data-blocked", "yes");
    await expect(vera.getByTestId("tombstone")).toContainText("Вы заблокировали собеседника");
    signal("web-blocked", hers);
    // The terminal's side: the tombstone there, and her phrase gone from his feed.
    await waitFor("depth-saw-end", 60);
    await waitFor("depth-feed-clean", 90);
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  } finally {
    await a.close();
    await v.close();
  }
});
