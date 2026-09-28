// The offer to talk declined and taken back (chat spec §8.5, screen 06), and
// a device that holds no wrap of an open conversation (GET /chats/:id/keys
// 404 no_wrap): the screen says so and offers the reissue rather than a
// spinner. "Не сейчас" is seen by this side only: the other side's inbox
// still shows the offer, nothing tells them.

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

  const run = runLabel();
  const aText = `кто на набережную? ${run}`;
  const bText = `гуляю у залива ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");

  // B says "not now": the offer stays in A's inbox, nothing tells her.
  const matchId = await openMatch(boris, "Аня");
  await boris.getByTestId("not-now").click();
  await expect(boris.getByTestId("not-now")).toHaveText("вернуть");
  await expect(boris.getByTestId("talk")).toBeDisabled();
  await anya.getByTestId("nav-inbox").click();
  await expect(anya.locator(`[data-testid="match"][data-id="${matchId}"]`)).toBeVisible({ timeout: 15000 });
  await expect(anya.locator(`[data-testid="match"][data-id="${matchId}"]`)).toContainText("предложение");

  // In B's inbox the declined offer stays as "отклонено · вернуть" while the
  // page lives, as the terminal keeps it (W17) — the node leaves it out of
  // the list; "вернуть" takes it back, and the node lists it again.
  await boris.getByTestId("back").click();
  const declinedRow = boris.locator(`[data-testid="match"][data-id="${matchId}"]`);
  await expect(declinedRow).toHaveAttribute("data-declined", "yes", { timeout: 15000 });
  await expect(declinedRow).toContainText("отклонено");
  await declinedRow.getByTestId("undo-decline").click();
  await expect(declinedRow).not.toHaveAttribute("data-declined", "yes", { timeout: 15000 });
  await expect(declinedRow.getByTestId("open-match")).toBeVisible();

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

  // A probe of the node's stored state (no wrap for B's session): no person does this, no screen shows it.
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
