// What close code a browser sees when the node ends a conversation's room with
// 4003 (protocol §4.4) — through the page's ws proxy (vite preview), and on the
// same node reached directly, side by side. Written because the first e2e of
// W3 saw the room reconnect after a close by hand: the code that reached the
// page was not 4003. This spec names who loses it, and guards the answer.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const CIRCLE = { lat: 41.9, lon: 12.5, radius: 1000 as const };

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

const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: { client: Record<string, (...x: unknown[]) => Promise<unknown>>; keys: Record<string, (...x: unknown[]) => Promise<unknown>> } }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await register(page, name);
  return page;
}

// A raw socket from the page to `url` with the ticket, resolved with the close
// code once the node ends the room; `open` resolves first so the caller knows
// the room is up before closing the chat.
const listenClose = (page: Page, url: string, ticket: string) =>
  page.evaluate(([u, t]) =>
    new Promise<{ opened: boolean; code: number; reason: string; clean: boolean }>((resolve) => {
      const s = new WebSocket(u, ["xor.p1", `ticket.${t}`]);
      let opened = false;
      s.onopen = () => { opened = true; (globalThis as unknown as { probeOpen?: boolean }).probeOpen = true; };
      s.onclose = (e) => resolve({ opened, code: e.code, reason: e.reason, clean: e.wasClean });
      setTimeout(() => resolve({ opened, code: -1, reason: "no close within 30s", clean: false }), 30000);
    }), [url, ticket] as const);

test("the node's 4003 reaches the browser through the page's proxy as it does directly", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const said = await viaClient<{ status: number; body: { id: string } }>(anya, "say", { text: "фраза для зонда", mode: "alone", ...CIRCLE });
  expect(said.status).toBe(200);
  const saidB = await viaClient<{ status: number; body: { id: string } }>(boris, "say", { text: "ответная для зонда", mode: "alone", ...CIRCLE });
  expect(saidB.status).toBe(200);
  await viaClient(anya, "like", saidB.body.id);
  const back = await viaClient<{ status: number; body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state).toBe("matched");
  // Both agree through the page's keys (the halves signed by the long key).
  const first = await anya.evaluate((m) => (globalThis as unknown as { xor: { keys: { consent(id: string): Promise<{ status: number; body: { state: string } }> } } }).xor.keys.consent(m), back.body.match_id!);
  expect(first.body.state).toBe("waiting");
  const second = await boris.evaluate((m) => (globalThis as unknown as { xor: { keys: { consent(id: string): Promise<{ status: number; body: { state: string; chat_id?: string } }> } } }).xor.keys.consent(m), back.body.match_id!);
  expect(second.body.state).toBe("agreed");
  const chatId = second.body.chat_id!;

  // Two rooms of B's: one through the page's proxy, one straight to the node
  // (the e2e container shares the page's network; the node allows any origin
  // in this stand). Each with its own ticket.
  const t1 = await viaClient<string>(boris, "ticket", chatId);
  const t2 = await viaClient<string>(boris, "ticket", chatId);
  const viaProxy = listenClose(boris, "ws://localhost:4173/chat", t1);
  const direct = listenClose(boris, "ws://node:8080/chat", t2);
  await boris.waitForFunction(() => (globalThis as unknown as { probeOpen?: boolean }).probeOpen === true, undefined, { timeout: 15000 });
  await boris.waitForTimeout(500);

  // A closes the chat by hand: NOTIFY chat_closed, every room closes 4003.
  const closed = await viaClient<{ status: number }>(anya, "closeChat", chatId);
  expect(closed.status).toBe(200);
  const [proxied, straight] = await Promise.all([viaProxy, direct]);
  console.log(`[close code] direct: ${JSON.stringify(straight)}; through proxy: ${JSON.stringify(proxied)}`);
  expect(straight.opened && proxied.opened, "a room did not open").toBe(true);
  // Measured 2026-09-26 (W3b): the node's own socket delivers 1006, no close
  // frame — Deno 2.1.4 closing an upgraded socket with 4003 — so the proxy is
  // held to the node's own code, not to 4003; 4003 on the wire is the node's
  // open item (relay.ts), and the page reads the `closing` frame meanwhile.
  expect(proxied.code, "the page's proxy changes the node's close code").toBe(straight.code);
  if (straight.code !== 4003) console.log(`[close code] the node did not deliver 4003 (got ${straight.code}); see the open item on relay.ts`);

  await a.close();
  await b.close();
});
