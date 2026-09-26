// The path W3 promises, in a browser against a live node: two people register,
// one writes a phrase, they like each other, both agree, a line goes each way
// and opens on the other side — and the second person reloads the page, comes
// back to the inbox with the same session, and the conversation opens again
// from the wrap the node kept (GET /chats/:id/keys → unwrapConversation),
// with the peer's next line readable. What has no screen in W3 — the phrase
// and the likes — is driven through the page's own client (window.xor).

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";

const CIRCLE = { lat: 41.9, lon: 12.5, radius: 1000 as const };

function watch(page: Page, who: string) {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${who} ${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[${who} error] ${e.message}`));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (!/\.(js|css|html|ico)$/.test(path) && path !== "/") console.log(`[${who} node] ${r.request().method()} ${path} → ${r.status()}`);
  });
  page.on("requestfailed", (r) => console.log(`[${who} request failed] ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
}

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
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId("error").isVisible()) throw new Error(`registration refused: ${await page.getByTestId("error").textContent()}`);
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("group-2").fill(code[1]);
  await page.getByTestId("group-4").fill(code[3]);
  await page.getByTestId("confirm").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
}

// The page's own client: a phrase, a like — no screen for them in W3.
const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: { client: Record<string, (...x: unknown[]) => Promise<unknown>> } }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  watch(page, name);
  await register(page, name);
  return page;
}

test("two people meet through likes, talk encrypted, and the second reopens the conversation after a reload", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await browser.newContext({ ...{}, viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  // Two phrases in the same circle, published by the rules at once (FEED_VERDICT=rules).
  const said = await viaClient<{ status: number; body: { id: string; state: string } }>(anya, "say", { text: "гуляю у реки, если кто рядом", mode: "alone", ...CIRCLE });
  expect(said.status, JSON.stringify(said.body)).toBe(200);
  const saidB = await viaClient<{ status: number; body: { id: string; state: string } }>(boris, "say", { text: "иду к реке", mode: "alone", ...CIRCLE });
  expect(saidB.status, JSON.stringify(saidB.body)).toBe(200);

  // A likes B's phrase, B likes A's: the match.
  const liked = await viaClient<{ status: number; body: { state: string } }>(anya, "like", saidB.body.id);
  expect(liked.body.state).toBe("liked");
  const back = await viaClient<{ status: number; body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state, JSON.stringify(back.body)).toBe("matched");
  const matchId = back.body.match_id!;

  // Both see the offer to talk in the inbox; A agrees first and waits, B agrees and the chat opens.
  await anya.getByTestId("nav-inbox").click();
  await expect(anya.locator(`[data-testid="match"][data-id="${matchId}"]`)).toBeVisible({ timeout: 15000 });
  await anya.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click();
  await expect(anya.locator('[data-screen="match"]')).toBeVisible();
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  // A line before the second agrees waits on A's device, unsealed.
  await anya.getByTestId("queued-line").fill("привет заранее");
  await anya.getByTestId("queued-line").press("Enter");
  await expect(anya.getByTestId("queued").locator("li")).toHaveCount(1);
  await anya.getByTestId("to-inbox").click();

  await boris.getByTestId("nav-inbox").click();
  await boris.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click();
  await expect(boris.locator('[data-screen="match"]')).toContainText("Уже согласились и ждут вас");
  await boris.getByTestId("talk").click();
  // Agreed: back in the inbox, the conversation is there.
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  const chatId = (await boris.locator('[data-testid="chat"]').getAttribute("data-id"))!;

  // B opens the conversation: keys derived from the halves and wrapped for
  // this session (PUT /chats/:id/keys → 200), the socket up.
  const kept: number[] = [];
  boris.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}/keys` && r.request().method() === "PUT") kept.push(r.status()); });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(boris.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
  expect(kept).toEqual([200]);

  // A opens it too: the queued line goes first, then a fresh one.
  await anya.getByTestId("refresh").click();
  await expect(anya.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(anya.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
  // B reads A's queued line, opened with the direction key — the text, not ciphertext.
  await expect(boris.locator('[data-testid="theirs"]').first()).toHaveText(/привет заранее/, { timeout: 20000 });
  await anya.getByTestId("text").fill("вижу тебя у моста");
  await anya.getByTestId("send").click();
  await expect(anya.locator('[data-testid="mine"][data-state="sent"]').last()).toContainText("вижу тебя у моста");
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("вижу тебя у моста", { timeout: 20000 });
  // And back.
  await boris.getByTestId("text").fill("иду, две минуты");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("иду, две минуты", { timeout: 20000 });

  // The safety code is the same on both screens: no key was planted by the node.
  await anya.getByTestId("show-safety").click();
  await boris.getByTestId("show-safety").click();
  const codeA = await anya.getByTestId("safety").textContent();
  const codeB = await boris.getByTestId("safety").textContent();
  expect(codeA).toMatch(/^\d{4}( \d{4}){4}$/);
  expect(codeA).toBe(codeB);

  // B reloads: the same session comes back (the tab's record), the inbox is
  // shown, the conversation opens from the wrap — GET /chats/:id/keys 200 and
  // no PUT — and A's next line reads.
  const reads: number[] = [];
  boris.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}/keys` && r.request().method() === "GET") reads.push(r.status()); });
  await boris.reload();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 20000 });
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(boris.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
  expect(reads).toEqual([200]);
  expect(kept, "a reload made a new wrap instead of opening the kept one").toEqual([200]);
  await anya.getByTestId("text").fill("после перезагрузки тоже слышно?");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("после перезагрузки тоже слышно?", { timeout: 20000 });
  await boris.getByTestId("text").fill("слышно");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("слышно", { timeout: 20000 });

  // Closed by hand on A's side: B's room closes 4003 and the tombstone stands.
  // By the code the node names in its `closed` frame (protocol §4.4), not by a
  // ticket refused on the way back in: no ticket is bought after the close.
  const ticketsAfterClose: number[] = [];
  boris.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}/ticket`) ticketsAfterClose.push(r.status()); });
  const closed = await viaClient<{ status: number; body: { state: string } }>(anya, "closeChat", chatId);
  expect(closed.status).toBe(200);
  await expect(boris.getByTestId("tombstone")).toBeVisible({ timeout: 20000 });
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-over", "yes");
  await boris.waitForTimeout(3000);
  expect(ticketsAfterClose, "the tombstone came by a refused ticket, not by the node's code").toEqual([]);

  await a.close();
  await b.close();
});
