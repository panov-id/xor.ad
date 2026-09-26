// What W1d promises, with W3 in place: a conversation survives a cold start.
// Two people match and both agree; the second opens the chat, which wraps the
// direction keys under this session's wrap_public_key (PUT /chats/:id/keys);
// then the second comes back as a new tab would — the tab's id gone, the
// vault and the PIN the way in — and the conversation opens from the wrap the
// node kept (GET /chats/:id/keys 200, no PUT): the wrapping pair out of the
// seal is the one the wrap was made for. The phrase and the likes have no
// screen; they go through the page's own client (window.xor), as chat.spec.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const CIRCLE = { lat: 41.9, lon: 12.5, radius: 1000 as const };
const PIN = "246813";

function watch(page: Page, who: string) {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${who} ${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[${who} error] ${e.message}`));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (!/\.(js|css|html|ico|json)$/.test(path) && path !== "/") console.log(`[${who} node] ${r.request().method()} ${path} → ${r.status()}`);
  });
}

async function register(page: Page, name: string) {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill(name);
  await page.getByTestId("age").fill("30");
  await page.getByTestId("consent").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-again").fill(PIN);
  await page.getByTestId("register").click();
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId("error").isVisible()) throw new Error(`registration refused: ${await page.getByTestId("error").textContent()}`);
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("group-2").fill(code[1]);
  await page.getByTestId("group-4").fill(code[3]);
  await page.getByTestId("confirm").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
}

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

test("a conversation opens again after a cold start: the PIN raises the same wrapping pair", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const said = await viaClient<{ status: number; body: { id: string } }>(anya, "say", { text: "гуляю у реки, если кто рядом", mode: "alone", ...CIRCLE });
  expect(said.status, JSON.stringify(said.body)).toBe(200);
  const saidB = await viaClient<{ status: number; body: { id: string } }>(boris, "say", { text: "иду к реке", mode: "alone", ...CIRCLE });
  expect(saidB.status, JSON.stringify(saidB.body)).toBe(200);
  await viaClient(anya, "like", saidB.body.id);
  const back = await viaClient<{ status: number; body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state, JSON.stringify(back.body)).toBe("matched");
  const matchId = back.body.match_id!;

  // Both agree: A first and waits, B second and the chat opens.
  await anya.getByTestId("nav-inbox").click();
  await anya.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click({ timeout: 15000 });
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("to-inbox").click();
  await boris.getByTestId("nav-inbox").click();
  await boris.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click({ timeout: 15000 });
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  const chatId = (await boris.locator('[data-testid="chat"]').getAttribute("data-id"))!;

  // B opens it: the keys are wrapped for this session — PUT 200.
  const keys: Array<[string, number]> = [];
  boris.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}/keys`) keys.push([r.request().method(), r.status()]); });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  expect(keys).toEqual([["PUT", 200]]);

  // B reloads: the vault and the PIN, nothing else.
  await boris.reload();
  await expect(boris.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 15000 });
  await boris.getByTestId("unlock-pin").fill(PIN);
  await boris.getByTestId("unlock").click();
  await expect(boris.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  // "unlocked", not "unlocked-new-wrap": the pair out of the seal is the one.
  await expect(boris.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", "unlocked");

  // The conversation opens from the kept wrap: GET 200, no second PUT.
  await boris.getByTestId("nav-inbox").click();
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(boris.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
  expect(keys).toEqual([["PUT", 200], ["GET", 200]]);

  // And a line each way reads.
  await anya.getByTestId("refresh").click();
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').click({ timeout: 15000 });
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await anya.getByTestId("text").fill("после холодного старта слышно?");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("после холодного старта слышно?", { timeout: 20000 });
  await boris.getByTestId("text").fill("слышно");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("слышно", { timeout: 20000 });
});
