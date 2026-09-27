// A game in a conversation (GC3), by clicks against a live node: two people in
// a conversation, one offers dots, the other sees the offer arrive on the
// chat's socket and accepts, and each draws an edge in turn — both boards show
// both moves. The meeting itself is chat.spec.ts's; it is walked here only as
// far as an open conversation on both sides.

import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";

const CIRCLE = { lat: 41.95, lon: 12.55, radius: 1000 as const };

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

test("two in a conversation play dots: one offers, the other accepts on the socket's word, each draws an edge", async ({ browser }) => {
  test.setTimeout(180_000);
  const anya = await personIn(await browser.newContext({ viewport: { width: 393, height: 851 } }), "Аня");
  const boris = await personIn(await browser.newContext({ viewport: { width: 393, height: 851 } }), "Борис");

  // Meet: two phrases, two likes, both agree to talk.
  const said = await viaClient<{ body: { id: string } }>(anya, "say", { text: "кто сыграет в точки", mode: "alone", ...CIRCLE });
  const saidB = await viaClient<{ body: { id: string } }>(boris, "say", { text: "я сыграю", mode: "alone", ...CIRCLE });
  await viaClient(anya, "like", saidB.body.id);
  const back = await viaClient<{ body: { state: string; match_id?: string } }>(boris, "like", said.body.id);
  expect(back.body.state, JSON.stringify(back.body)).toBe("matched");
  const matchId = back.body.match_id!;
  for (const page of [anya, boris]) {
    await page.getByTestId("nav-inbox").click();
    await page.locator(`[data-testid="match"][data-id="${matchId}"] [data-testid="open-match"]`).click({ timeout: 15000 });
    await page.getByTestId("talk").click();
    if (page === anya) {
      await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
      await anya.getByTestId("to-inbox").click();
    }
  }
  await openChat(boris);
  await anya.getByTestId("refresh").click();
  await openChat(anya);

  // A offers dots 2x2 through the game's own controls.
  await anya.getByTestId("game-toggle").click();
  await anya.getByTestId("game-class").selectOption("dots");
  await anya.getByTestId("game-set").selectOption("2x2");
  await anya.getByTestId("game-propose").click();
  await expect(anya.getByTestId("game-waiting")).toBeVisible({ timeout: 15000 });

  // B did not open the game: the proposal frame on the chat's socket opens it.
  await expect(boris.getByTestId("game-offer")).toBeVisible({ timeout: 20000 });
  await boris.getByTestId("game-accept").click();

  // The proposer moves first; each sees whose move it is.
  await expect(anya.getByTestId("game-turn")).toHaveText("Ваш ход", { timeout: 20000 });
  await expect(boris.getByTestId("game-turn")).toHaveText("Ход собеседника", { timeout: 20000 });
  await anya.locator('[data-testid="dots"] [data-edge="h:0:0"]').click();
  await expect(boris.locator('[data-testid="dots"] [data-taken="h:0:0"]')).toHaveCount(1, { timeout: 20000 });
  await expect(boris.getByTestId("game-turn")).toHaveText("Ваш ход", { timeout: 20000 });

  await boris.locator('[data-testid="dots"] [data-edge="v:1:2"]').click();
  await expect(anya.locator('[data-testid="dots"] [data-taken="v:1:2"]')).toHaveCount(1, { timeout: 20000 });
  for (const page of [anya, boris]) {
    await expect(page.locator('[data-testid="dots"] [data-taken]')).toHaveCount(2);
  }
  await expect(anya.getByTestId("game-turn")).toHaveText("Ваш ход");
});
