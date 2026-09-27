// A game in a conversation past its first move (V10), by clicks against a live
// node: a class other than dots (deck), resigning, a rematch declined and one
// accepted, and a first proposal declined. The first move of dots is
// chat-game.spec.ts's; the meeting is walked here only as far as an open
// conversation on both sides.

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";

const CIRCLE = { lat: 41.96, lon: 12.56, radius: 1000 as const };

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

// The page's own client, for what has no screen in this path: a phrase, a like.
const viaClient = <T>(page: Page, fn: string, ...args: unknown[]) =>
  page.evaluate(([f, a]) => {
    const xor = (globalThis as unknown as { xor?: { client: Record<string, (...x: unknown[]) => Promise<unknown>> } }).xor;
    if (!xor) throw new Error("the page exposes no client");
    return xor.client[f](...(a as unknown[])) as Promise<T>;
  }, [fn, args] as const);

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${name} error] ${e.message}`));
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

// Two people, met and talking: both on the chat screen.
async function twoTalking(browser: import("@playwright/test").Browser, names: [string, string]): Promise<[Page, Page]> {
  const a = await personIn(await browser.newContext({ viewport: { width: 393, height: 851 } }), names[0]);
  const b = await personIn(await browser.newContext({ viewport: { width: 393, height: 851 } }), names[1]);
  const said = await viaClient<{ body: { id: string } }>(a, "say", { text: `${names[0]} ищет партию`, mode: "alone", ...CIRCLE });
  const saidB = await viaClient<{ body: { id: string } }>(b, "say", { text: `${names[1]} сыграет`, mode: "alone", ...CIRCLE });
  await viaClient(a, "like", saidB.body.id);
  const back = await viaClient<{ body: { state: string; match_id?: string } }>(b, "like", said.body.id);
  expect(back.body.state, JSON.stringify(back.body)).toBe("matched");
  for (const page of [a, b]) {
    await page.getByTestId("nav-inbox").click();
    await page.locator(`[data-testid="match"][data-id="${back.body.match_id}"] [data-testid="open-match"]`).click({ timeout: 15000 });
    await page.getByTestId("talk").click();
    if (page === a) {
      await expect(a.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
      await a.getByTestId("to-inbox").click();
    }
  }
  await openChat(b);
  await a.getByTestId("refresh").click();
  await openChat(a);
  return [a, b];
}

async function propose(page: Page, klass: string, set: string) {
  await page.getByTestId("game-toggle").click();
  await page.getByTestId("game-class").selectOption(klass);
  await page.getByTestId("game-set").selectOption(set);
  await page.getByTestId("game-propose").click();
  await expect(page.getByTestId("game-waiting")).toBeVisible({ timeout: 15000 });
}

test("deck in a conversation: a card played shows on both, a resign ends it for both, a rematch declined, then one accepted deals again", async ({ browser }) => {
  test.setTimeout(240_000);
  const [anya, boris] = await twoTalking(browser, ["Аня", "Борис"]);

  await propose(anya, "deck", "36");
  await expect(boris.getByTestId("game-offer")).toBeVisible({ timeout: 20000 });
  await boris.getByTestId("game-accept").click();

  // The proposer moves first; each sees their own hand as cards.
  await expect(anya.getByTestId("game-turn")).toHaveText("Ваш ход", { timeout: 20000 });
  await expect(boris.getByTestId("game-turn")).toHaveText("Ход собеседника", { timeout: 20000 });
  for (const page of [anya, boris]) await expect(page.getByTestId("hand").getByRole("button")).toHaveCount(6, { timeout: 15000 });
  const card = anya.getByTestId("hand").getByRole("button").first();
  const label = (await card.textContent())!.trim();
  await card.click();
  await expect(boris.getByTestId("played")).toHaveText(`на столе: ${label}`, { timeout: 20000 });
  await expect(anya.getByTestId("hand").getByRole("button")).toHaveCount(5, { timeout: 15000 });

  // A resigns: the game is over on both screens, and nobody can move.
  await anya.getByTestId("game-resign").click();
  for (const page of [anya, boris]) {
    await expect(page.getByTestId("game-turn")).toHaveText("Партия окончена", { timeout: 20000 });
    await expect(page.getByTestId("game-resign")).toHaveCount(0);
    await expect(page.getByTestId("hand").getByRole("button").first()).toBeDisabled();
  }

  // B asks for another round; A declines it, and B may ask again.
  await boris.getByTestId("game-rematch").click();
  await expect(boris.getByTestId("game-waiting")).toBeVisible({ timeout: 15000 });
  await expect(anya.getByTestId("game-offer")).toBeVisible({ timeout: 20000 });
  await expect(anya.getByTestId("game-rematch")).toHaveCount(0);
  await anya.getByTestId("game-decline").click();
  await expect(boris.getByTestId("game-waiting")).toHaveCount(0, { timeout: 20000 });
  await expect(anya.getByTestId("game-offer")).toHaveCount(0);
  await expect(boris.getByTestId("game-turn")).toHaveText("Партия окончена");

  // Asked again and accepted: a new deal, the same seats, the proposer of the first game first.
  await boris.getByTestId("game-rematch").click();
  await expect(anya.getByTestId("game-offer")).toBeVisible({ timeout: 20000 });
  await anya.getByTestId("game-accept").click();
  await expect(anya.getByTestId("game-turn")).toHaveText("Ваш ход", { timeout: 20000 });
  await expect(boris.getByTestId("game-turn")).toHaveText("Ход собеседника", { timeout: 20000 });
  for (const page of [anya, boris]) {
    await expect(page.getByTestId("hand").getByRole("button")).toHaveCount(6, { timeout: 15000 });
    await expect(page.getByTestId("played")).not.toHaveText(`на столе: ${label}`);
    await expect(page.getByTestId("game-resign")).toBeVisible();
  }
});

test("a first proposal declined: the offer goes from both screens, and the proposer can propose again", async ({ browser }) => {
  // Known defect (V10, 27.09.2026): after a decline the node keeps the game's
  // row with no board and no proposal, and ChatGame.tsx offers "propose" only
  // on a 404 — the proposer is left with nothing to press. Expected to fail
  // until the screen is fixed; when it passes, drop this line.
  test.fail();
  test.setTimeout(180_000);
  const [anya, boris] = await twoTalking(browser, ["Вера", "Глеб"]);

  await propose(anya, "dots", "2x2");
  await expect(boris.getByTestId("game-offer")).toBeVisible({ timeout: 20000 });
  await boris.getByTestId("game-decline").click();
  await expect(anya.getByTestId("game-waiting")).toHaveCount(0, { timeout: 20000 });
  await expect(boris.getByTestId("game-offer")).toHaveCount(0);
  await expect(anya.getByTestId("game-turn")).toHaveCount(0);

  // Nothing is running, so the proposer is offered to propose again.
  await expect(anya.getByTestId("game-propose")).toBeVisible({ timeout: 15000 });
});
