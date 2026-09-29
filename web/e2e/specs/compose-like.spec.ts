// W2's path, against a live node in a browser: A registers and says a clean
// phrase — the node answers 200 and the feed names it as out; B registers in a
// browser of their own (a second context: its own IndexedDB, its own vault),
// finds A's phrase in the circle, opens it full-screen and likes it — the node
// says liked; B's "liked" lists it, and taking the like back empties the list.
// Then B hides a phrase and the card leaves the feed with a word about it.
//
// What is read back is the node's answers as much as the screen: the statuses
// of POST /feed and POST /feed/:id/like, so a page that lied about the verdict
// would be caught by the number.

import { type BrowserContext, expect, type Page, test } from "../fixtures/address.ts";
import { runLabel } from "./helpers.ts";

const noise = (page: Page, who: string) => {
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[${who} ${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => console.log(`[${who} error] ${e.message}`));
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (!/\.(js|css|html|ico|woff2?)$/.test(path) && path !== "/") console.log(`[${who} → node] ${r.request().method()} ${path} → ${r.status()}`);
  });
};

// The registration of register-feed.spec.ts, in short: name, age, the three
// documents, the PIN twice, the paper code's second and fourth groups.
async function register(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill(name);
  await page.getByTestId("age").fill("28");
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
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
}

test("a phrase goes out at 200, another person likes it from the card, and finds it under 'liked'", async ({ browser }) => {
  const phrase = `кто на набережную к девяти? ${runLabel()}`;
  const contexts: BrowserContext[] = [];
  try {
    // A: registers, writes, sees the verdict.
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    noise(a, "A");
    const feedPosts: number[] = [];
    a.on("response", (r) => { if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST") feedPosts.push(r.status()); });
    await register(a, "Аня");

    await a.getByTestId("write").click();
    await expect(a.locator('[data-screen="composer"]')).toBeVisible();
    // The node's limit reached the counter (GET /limits), not a number of ours.
    await expect(a.getByTestId("counter")).toHaveText(/^осталось \d+$/);
    await expect(a.getByTestId("send")).toBeDisabled();
    await a.getByTestId("text").fill(phrase);
    // Sheet 04: the mode is three segments, not a list (WS4).
    await a.getByTestId("mode-company").click();
    await expect(a.getByTestId("mode")).toHaveAttribute("data-value", "company");
    await a.getByTestId("send").click();

    // Back on the feed with the node's verdict: a clean phrase is out (200 — P1).
    await expect(a.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
    expect(feedPosts).toEqual([200]);
    await expect(a.getByTestId("sent")).toHaveAttribute("data-state", "published");
    await expect(a.getByTestId("sent")).toContainText(phrase);

    // The verdict line is dropped when the feed is left (the verifier on W2).
    await a.getByTestId("likes").click();
    await a.getByTestId("back").click();
    await expect(a.getByTestId("sent")).toHaveCount(0);

    // C: one phrase with a discount — a neighbour's offer. The rules tier
    // (lib/feed_verdict.ts, reason "offer") sends every offer to a person, so
    // the node answers 202 and the feed says it is being read; the offer never
    // becomes visible in this stand, which has no person to publish it — the
    // badge the cards draw for `offer` is not exercised here.
    const c = await (await browser.newContext()).newPage();
    contexts.push(c.context());
    noise(c, "C");
    const offerPosts: number[] = [];
    c.on("response", (r) => { if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST") offerPosts.push(r.status()); });
    await register(c, "Вера");
    const offerText = `отдам две табуретки ${runLabel()}`;
    await c.getByTestId("write").click();
    await c.getByTestId("text").fill(offerText);
    await c.getByTestId("offer-fields").locator("summary").click();
    await c.getByTestId("discount").fill("100 %");
    await c.getByTestId("conditions").fill("самовывоз");
    await c.getByTestId("send").click();
    await expect(c.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
    expect(offerPosts).toEqual([202]);
    await expect(c.getByTestId("sent")).toHaveAttribute("data-state", "checking");
    await expect(c.getByTestId("sent")).toContainText("читается");

    // B: a browser of their own, the same circle.
    const b = await (await browser.newContext()).newPage();
    contexts.push(b.context());
    noise(b, "B");
    const likePosts: number[] = [];
    b.on("response", (r) => { if (/^\/feed\/[^/]+\/like$/.test(new URL(r.url()).pathname) && r.request().method() === "POST") likePosts.push(r.status()); });
    await register(b, "Борис");

    // C's offer is with a person, not in the feed (rules tier, reason "offer").
    await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });
    await expect(b.getByTestId("card").filter({ hasText: offerText })).toHaveCount(0);

    // §8.4: a like is a phrase meeting a phrase. Without one of B's own the
    // node answers 409, and the card says so — the node's words, until the
    // refusal has words of its own (owner.md).
    let card = b.getByTestId("card").filter({ hasText: phrase });
    await expect(card).toHaveCount(1, { timeout: 15000 });
    await card.click();
    await b.getByTestId("like").click();
    await expect(b.getByTestId("refused")).toContainText("a like needs a live phrase of your own");
    expect(likePosts).toEqual([409]);
    await b.getByTestId("back").click();
    await b.getByTestId("write").click();
    await b.getByTestId("text").fill(`а я на набережную к десяти ${runLabel()}`);
    await b.getByTestId("send").click();
    await expect(b.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
    await expect(b.getByTestId("sent")).toHaveAttribute("data-state", "published");
    await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });
    likePosts.length = 0;

    card = b.getByTestId("card").filter({ hasText: phrase });
    await expect(card).toHaveCount(1, { timeout: 15000 });
    const phraseId = (await card.getAttribute("data-id"))!;
    await card.click();
    await expect(b.locator('[data-screen="card"]')).toHaveAttribute("data-id", phraseId);
    await expect(b.getByTestId("text")).toHaveText(phrase);

    await b.getByTestId("like").click();
    await expect(b.getByTestId("liked")).toBeVisible({ timeout: 15000 });
    expect(likePosts).toEqual([200]);
    await expect(b.getByTestId("like")).toBeDisabled();

    // "Liked" lists it, and the like is taken back — the phrase made no match.
    await b.getByTestId("back").click();
    await b.getByTestId("likes").click();
    await expect(b.locator('[data-screen="likes"]')).toBeVisible();
    const liked = b.getByTestId("liked-card").filter({ hasText: phrase });
    await expect(liked).toHaveCount(1, { timeout: 15000 });
    await liked.getByTestId("unlike").click();
    await expect(liked).toHaveCount(0, { timeout: 15000 });

    // Hiding from the card: the phrase leaves B's feed, with a word about it.
    await b.getByTestId("back").click();
    await expect(b.locator('[data-screen="feed"]')).toBeVisible();
    await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });
    await b.getByTestId("card").filter({ hasText: phrase }).click();
    // Blocking asks twice: "no" leaves the card in place and sends nothing.
    await b.getByTestId("block").click();
    await expect(b.getByTestId("block-confirm")).toBeVisible();
    await b.getByTestId("block-confirm-no").click();
    await expect(b.getByTestId("block-confirm")).toBeHidden();
    await expect(b.locator('[data-screen="card"]')).toHaveAttribute("data-id", phraseId);
    await b.getByTestId("hide").click();
    await expect(b.getByTestId("gone")).toHaveAttribute("data-why", "hidden");
    await expect(b.getByTestId("card").filter({ hasText: phrase })).toHaveCount(0);
  } finally {
    for (const c of contexts) await c.close();
  }
});
