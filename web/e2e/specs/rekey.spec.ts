// The key reissue from the web face (chat spec §8.13, W3b): B's keys stop
// opening — the wrap the node kept for the session is replaced by one that
// does not open, and the pair in memory is dropped, which is what a lost tab
// with a kept identity comes to — so B asks for new keys; A is asked in
// person and agrees; both derive and wrap anew, and a line goes each way
// under the new epoch. Old ciphertext stays shut for both: the core's test
// says so; here the screens do the asking and the agreeing.

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
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${name} ${m.type()}] ${m.text()}`); });
  await register(page, name);
  return page;
}

async function openChat(page: Page) {
  await page.getByTestId("nav-inbox").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(page.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
}

test("a side whose keys do not open asks for new ones, the other agrees on the screen, and the conversation goes on under the new epoch", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  const said = await viaClient<{ status: number; body: { id: string } }>(anya, "say", { text: "у моста через час", mode: "alone", ...CIRCLE });
  expect(said.status).toBe(200);
  const saidB = await viaClient<{ status: number; body: { id: string } }>(boris, "say", { text: "иду к мосту", mode: "alone", ...CIRCLE });
  expect(saidB.status).toBe(200);
  await viaClient(anya, "like", saidB.body.id);
  const back = await viaClient<{ status: number; body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state).toBe("matched");
  const consentA = await anya.evaluate((m) => (globalThis as unknown as { xor: Xor }).xor.keys.consent(m) as Promise<{ body: { state: string } }>, back.body.match_id!);
  expect(consentA.body.state).toBe("waiting");
  const consentB = await boris.evaluate((m) => (globalThis as unknown as { xor: Xor }).xor.keys.consent(m) as Promise<{ body: { state: string; chat_id?: string } }>, back.body.match_id!);
  expect(consentB.body.state).toBe("agreed");
  const chatId = consentB.body.chat_id!;

  // Both open the conversation at epoch 0 and a line goes through.
  await openChat(anya);
  await openChat(boris);
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-epoch", "0");
  await anya.getByTestId("text").fill("до перевыпуска");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("до перевыпуска", { timeout: 20000 });

  // B's keys are lost: the pair in memory dropped, the kept wrap replaced by
  // 211 bytes that are not a wrap of anything. A reload then finds keys that
  // do not open.
  await boris.evaluate((id) => (globalThis as unknown as { xor: Xor }).xor.keys.forget(id), chatId);
  const junk = await boris.evaluate(() => {
    const bytes = crypto.getRandomValues(new Uint8Array(211));
    let s = ""; for (const x of bytes) s += String.fromCharCode(x);
    return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  });
  const spoiled = await viaClient<{ status: number }>(boris, "request", "PUT", `/chats/${chatId}/keys`, { epoch: 0, wrapped_key: junk });
  expect(spoiled.status).toBe(200);
  await boris.reload();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 20000 });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "failed", { timeout: 20000 });
  await expect(boris.getByTestId("keys-failed")).toContainText("do not open on this device");

  // B asks; A is asked on the screen and agrees; both stand at epoch 1.
  await boris.getByTestId("rekey-ask").click();
  await expect(boris.getByTestId("rekey-waiting")).toBeVisible({ timeout: 15000 });
  await expect(anya.getByTestId("rekey-asked")).toBeVisible({ timeout: 20000 });
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-rekey-requested", "yes");
  const putsA: number[] = [];
  anya.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}/keys` && r.request().method() === "PUT") putsA.push(r.status()); });
  await anya.getByTestId("rekey-agree").click();
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-epoch", "1", { timeout: 20000 });
  await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-epoch", "1", { timeout: 20000 });
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  // At least once, and only 200s: the rekey frame and the press may each turn
  // the keys, and a second wrap of the same keys is written over the first.
  expect(putsA.length, "A did not wrap the new keys").toBeGreaterThanOrEqual(1);
  expect(putsA.every((s) => s === 200), `a wrap was refused: ${putsA}`).toBe(true);

  // A line each way under the new keys, and the safety code unchanged: the
  // long keys are the same people.
  await anya.getByTestId("text").fill("после перевыпуска");
  await anya.getByTestId("send").click();
  await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("после перевыпуска", { timeout: 20000 });
  await boris.getByTestId("text").fill("слышу под новыми ключами");
  await boris.getByTestId("send").click();
  await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("слышу под новыми ключами", { timeout: 20000 });
  await anya.getByTestId("show-safety").click();
  await boris.getByTestId("show-safety").click();
  expect(await anya.getByTestId("safety").textContent()).toBe(await boris.getByTestId("safety").textContent());

  // B reloads once more: the new wrap opens at epoch 1 with no PUT.
  const putsB: number[] = [];
  boris.on("response", (r) => { if (new URL(r.url()).pathname === `/chats/${chatId}/keys` && r.request().method() === "PUT") putsB.push(r.status()); });
  await boris.reload();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 20000 });
  await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
  expect(putsB).toEqual([]);

  await a.close();
  await b.close();
});
