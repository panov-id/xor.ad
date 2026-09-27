// The offer to talk declined and taken back (chat spec §8.5, screen 06), and
// a device that holds no wrap of an open conversation (GET /chats/:id/keys
// 404 no_wrap): the screen says so and offers the reissue rather than a
// spinner. "Не сейчас" is seen by this side only: the other side's inbox
// still shows the offer, nothing tells them.

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";

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

type Xor = { client: Record<string, (...x: unknown[]) => Promise<unknown>>; keys: Record<string, (...x: unknown[]) => unknown> };
const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: Xor }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${name} error] ${e.message}`));
  await register(page, name);
  return page;
}

test("not now is this side's alone and can be taken back; a device with no wrap is told to ask for keys", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const said = await viaClient<{ status: number; body: { id: string } }>(anya, "say", { text: "кто на набережную?", mode: "alone", ...CIRCLE });
  expect(said.status).toBe(200);
  const saidB = await viaClient<{ status: number; body: { id: string } }>(boris, "say", { text: "гуляю у залива", mode: "alone", ...CIRCLE });
  expect(saidB.status).toBe(200);
  await viaClient(anya, "like", saidB.body.id);
  const back = await viaClient<{ status: number; body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state).toBe("matched");
  const matchId = back.body.match_id!;

  // B says "not now": the offer leaves B's inbox and stays in A's.
  await boris.getByTestId("nav-inbox").click();
  await boris.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click();
  await boris.getByTestId("not-now").click();
  await expect(boris.getByTestId("not-now")).toHaveText("вернуть");
  await expect(boris.getByTestId("talk")).toBeDisabled();
  await boris.getByTestId("back").click();
  await boris.getByTestId("refresh").click();
  await expect(boris.locator('[data-testid="match"]')).toHaveCount(0, { timeout: 15000 });
  await anya.getByTestId("nav-inbox").click();
  await expect(anya.locator(`[data-testid="match"][data-id="${matchId}"]`)).toBeVisible({ timeout: 15000 });
  await expect(anya.locator(`[data-testid="match"][data-id="${matchId}"]`)).toContainText("предложение");

  // Taken back through the client (the card is gone from B's inbox by design;
  // the screen's "вернуть" is the same call): the offer is back.
  const undone = await viaClient<{ status: number }>(boris, "undoDecline", matchId);
  expect(undone.status).toBe(204);
  await boris.getByTestId("refresh").click();
  await expect(boris.locator(`[data-testid="match"][data-id="${matchId}"]`)).toBeVisible({ timeout: 15000 });

  // Both agree; A opens the conversation and wraps her keys. B never opens it
  // in this tab, then reloads: no pair in memory, no wrap on the node — the
  // screen names it and offers the reissue.
  await boris.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click();
  await boris.getByTestId("talk").click();
  await expect(boris.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click();
  await anya.getByTestId("talk").click();
  await expect(anya.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await expect(anya.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  const chatId = (await anya.locator('[data-testid="chat"]').getAttribute("data-id"))!;
  await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });

  const noWrap = await viaClient<{ status: number; body: { error?: { code?: string } } }>(boris, "request", "GET", `/chats/${chatId}/keys`);
  expect(noWrap.status).toBe(404);
  expect(noWrap.body.error?.code).toBe("no_wrap");
  // A reload goes through the vault and the PIN (W1d, SEC-2), then the inbox.
  await boris.reload();
  await expect(boris.locator('[data-screen="unlock"]')).toBeVisible({ timeout: 20000 });
  await boris.getByTestId("unlock-pin").fill("246813");
  await boris.getByTestId("unlock").click();
  await expect(boris.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await boris.getByTestId("nav-inbox").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 20000 });
  await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "failed", { timeout: 20000 });
  await expect(boris.getByTestId("keys-failed")).toContainText("holds no keys for the conversation: ask for a reissue");
  await expect(boris.getByTestId("rekey-ask")).toBeVisible();

  await a.close();
  await b.close();
});
