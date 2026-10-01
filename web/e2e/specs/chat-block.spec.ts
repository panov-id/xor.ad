// A block from the web conversation (chat spec §8.9, protocol §4.8, W11-A),
// against a live node: asked twice — «точно заблокировать?» and what it costs
// — and backed out of once; then POST /blocks {chat} → 204; this side's
// tombstone says it was a block, the other side's room closes 4003 and shows
// the plain tombstone; the conversation is out of the other side's inbox, and
// the blocked person's phrase is out of the blocker's feed — all three levels
// of §8.9 at once.

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, runLabel, writePhrase } from "./helpers.ts";

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

test("a block from the conversation asks twice, closes it for both, and takes the person out of the feed and the inbox", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const run = runLabel();
  const aText = `ищу компанию на каток ${run}`;
  const bText = `еду на каток ${run}`;
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
  await anya.getByTestId("text").fill("до блока");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("до блока", { timeout: 20000 });

  // Asked twice, and the first answer is "back": nothing is sent.
  const blocks: number[] = [];
  anya.on("response", (r) => { if (new URL(r.url()).pathname === "/blocks" && r.request().method() === "POST") blocks.push(r.status()); });
  await anya.getByTestId("block").click();
  await expect(anya.getByTestId("block-confirm")).toContainText("точно заблокировать?");
  await expect(anya.getByTestId("block-confirm")).toContainText("беседа закроется у обоих, и снятый блок обратно не ставится");
  await anya.getByTestId("block-no").click();
  await expect(anya.getByTestId("block-confirm")).toHaveCount(0);
  expect(blocks).toEqual([]);
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-over", "no");

  // And for real: POST /blocks → 204, the tombstone names the block here only.
  await anya.getByTestId("block").click();
  await anya.getByTestId("block-yes").click();
  await expect(anya.getByTestId("tombstone")).toBeVisible({ timeout: 15000 });
  expect(blocks).toEqual([204]);
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-blocked", "yes");
  await expect(anya.getByTestId("tombstone")).toContainText("Вы заблокировали собеседника");
  // The other side: the room closed by the node (4003), the plain tombstone —
  // a block is never told to the one blocked.
  await expect(boris.getByTestId("tombstone")).toBeVisible({ timeout: 20000 });
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-over", "yes");
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-blocked", "no");
  await expect(boris.getByTestId("tombstone")).not.toContainText("заблокировали");

  // The conversation is out of B's inbox, and B's phrase out of A's feed.
  await boris.getByTestId("back").click();
  await boris.getByTestId("nav-feed").click();
  await boris.getByTestId("nav-inbox").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await expect(boris.locator(`[data-testid="chat"][data-id="${chatId}"]`)).toHaveCount(0, { timeout: 15000 });
  await anya.getByTestId("back").click();
  await anya.getByTestId("nav-inbox").click();
  await anya.getByTestId("nav-feed").click();
  await expect(anya.getByTestId("card").filter({ hasText: aText })).toHaveCount(1, { timeout: 30000 });
  await expect(anya.getByTestId("card").filter({ hasText: bText })).toHaveCount(0);

  await a.close();
  await b.close();
});
