// What a browser gets when the node ends a conversation's room with 4003
// (protocol §4.4): the `closed` frame {code, reason} the node sends first, and
// the socket's own close code — through the page's ws proxy (vite preview)
// and on the same node reached directly, side by side, one room per session
// so neither replaces the other. Written because the first e2e of W3 saw the
// room reconnect after a close by hand: the socket's code that reached the
// page was not 4003 (measured 2026-09-26: a bare 1006, straight and through
// the proxy alike — the node's close frame does not reach a browser), which is
// why the code now travels in a frame of its own before the close.

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, writePhrase } from "./helpers.ts";


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

type Xor = { client: Record<string, (...x: unknown[]) => Promise<unknown>> };
const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: Xor }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  await register(page, name);
  return page;
}

type Seen = { opened: boolean; code: number; reason: string; clean: boolean; closedFrame: { code?: number; reason?: string; seq?: number } | null };

// A raw socket from the page to `url` with the ticket: every frame kept, the
// last `closed` frame and the socket's own close reported once it ends.
const listenClose = (page: Page, url: string, ticket: string) =>
  page.evaluate(([u, t]) =>
    new Promise<Seen>((resolve) => {
      const s = new WebSocket(u, ["xor.p1", `ticket.${t}`]);
      let opened = false;
      let closedFrame: Seen["closedFrame"] = null;
      s.onopen = () => { opened = true; (globalThis as unknown as { probeOpen: number }).probeOpen = ((globalThis as unknown as { probeOpen?: number }).probeOpen ?? 0) + 1; };
      s.onmessage = (e) => {
        const f = JSON.parse(String(e.data)) as { type: string; seq: number; data: { code?: number; reason?: string } };
        if (f.type === "closed") closedFrame = { ...f.data, seq: f.seq };
      };
      s.onclose = (e) => resolve({ opened, code: e.code, reason: e.reason, clean: e.wasClean, closedFrame });
      setTimeout(() => resolve({ opened, code: -1, reason: "no close within 30s", clean: false, closedFrame }), 30000);
    }), [url, ticket] as const);

test("the node names 4003 in a closed frame that reaches the browser, through the proxy as directly", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const run = Date.now().toString(36);
  const aText = `фраза для зонда ${run}`;
  const bText = `ответная для зонда ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");
  // Both agree on the match screen: A first and waits, B second and the
  // conversation stands in B's inbox.
  await openMatch(anya, "Борис");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("to-inbox").click();
  await openMatch(boris, "Аня");
  // B's row knows A agreed before B presses, as chat.spec reads it.
  await expect(boris.locator('[data-screen="match"]')).toContainText("Уже согласились и ждут вас", { timeout: 15000 });
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  const chatId = (await boris.locator('[data-testid="chat"]').getAttribute("data-id"))!;

  // One room per session: B's through the page's proxy, A's straight to the
  // node (the e2e container shares the page's network; the node allows any
  // origin in this stand). Two sessions, so neither replaces the other.
  // The spec tests the raw socket's close code, so it buys its own tickets for its own sockets.
  const tB = await viaClient<string>(boris, "ticket", chatId);
  const tA = await viaClient<string>(anya, "ticket", chatId);
  const viaProxy = listenClose(boris, "ws://localhost:4173/chat", tB);
  const direct = listenClose(anya, "ws://node:8080/chat", tA);
  await boris.waitForFunction(() => (globalThis as unknown as { probeOpen?: number }).probeOpen === 1, undefined, { timeout: 15000 });
  await anya.waitForFunction(() => (globalThis as unknown as { probeOpen?: number }).probeOpen === 1, undefined, { timeout: 15000 });
  await boris.waitForTimeout(500);

  // A closes the chat by hand: NOTIFY chat_closed, every room of it gets the
  // closed frame with 4003 and then the close.
  // No screen closes a conversation by hand yet (web/src/screens/Chat.tsx has no such control) — listed to the coordinator; until then the spec closes it through the client.
  const closed = await viaClient<{ status: number }>(anya, "closeChat", chatId);
  expect(closed.status).toBe(200);
  const [proxied, straight] = await Promise.all([viaProxy, direct]);
  console.log(`[close code] direct: ${JSON.stringify(straight)}; through proxy: ${JSON.stringify(proxied)}`);
  expect(straight.opened && proxied.opened, "a room did not open").toBe(true);
  expect(straight.closedFrame?.code, "the node's closed frame did not reach the direct socket with 4003").toBe(4003);
  expect(proxied.closedFrame?.code, "the node's closed frame did not reach the page through the proxy with 4003").toBe(4003);
  expect(typeof proxied.closedFrame?.reason).toBe("string");
  // The socket's own code: the same on both sides — the proxy adds and loses
  // nothing of what the node sends; whether it is 4003 is the node's affair,
  // measured and logged, not asserted.
  expect(proxied.code, "the page's proxy changes the node's close code").toBe(straight.code);
  if (straight.code !== 4003) console.log(`[close code] the node's own close arrived as ${straight.code}; the frame carried 4003`);

  await a.close();
  await b.close();
});
