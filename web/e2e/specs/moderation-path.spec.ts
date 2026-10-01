// The moderation path end to end (wave 5, Q3; chat spec §8.3, §8.14): two
// neighbours write phrases the rules of the first tier flag — a site, and a
// messenger — so the node answers 202 and each author's feed says the phrase
// is being read. The node asks the model behind its flag (MODERATOR_URL, the
// stand's stub in docker-compose.web.yml) and keeps its word beside the
// phrase; the moderator signs in to the panel, sees both phrases in the feed
// queue with the model's hint, publishes one and refuses the other. Then the
// published phrase is in its author's feed, and the refused one is nowhere.
//
// The model only says: both phrases carry "reject" from the stub, and one is
// published anyway, because the person decides (lib/moderator.ts).
//
// Needs the panel service of the stand; scripts/run-web-two-people.sh brings it
// up for a spec that reads PANEL_URL:
//   scripts/run-web-two-people.sh moderation-path

import { type BrowserContext, expect, type Page, test } from "../fixtures/address.ts";
import { devices } from "@playwright/test";
import { PIN, register, runLabel, unlock, writePhrase } from "./helpers.ts";

const PANEL_URL = process.env.PANEL_URL ?? "";
const SECRET = process.env.PANEL_SESSION_SECRET ?? "";
const ENV_NAME = process.env.PANEL_ENV_NAME ?? "test";
// Laid in the node's storage by the stand's panel-user service.
const MODERATOR = "moderator@webtest.invalid";

// A panel session as the node signs one (relay/node/src/lib/auth.ts, the same
// fifteen lines as panel/tests/helpers/token.ts): HS256 over the stand's
// secret. The node still reads the operator's record on every request, so the
// token opens nothing for an address the stand does not know.
async function panelToken(): Promise<string> {
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const enc = new TextEncoder();
  const header = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64(enc.encode(JSON.stringify({
    sub: MODERATOR, role: "moderator", brand: null, env: ENV_NAME, exp: Math.floor(Date.now() / 1000) + 3600,
  })));
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64(sig)}`;
}

// Writes a phrase the rules flag and reads the node's 202 and the feed's word.
async function writeFlagged(page: Page, text: string): Promise<void> {
  const posts: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST") posts.push(r.status()); });
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  await page.getByTestId("text").fill(text);
  await page.getByTestId("send").click();
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
  expect(posts, "the rules did not send the phrase to the queue").toEqual([202]);
  await expect(page.getByTestId("sent")).toHaveAttribute("data-state", "checking");
  await expect(page.getByTestId("sent")).toContainText("читается");
}

// The author's feed read again from the node: a reload goes through the vault
// and the PIN (W1d), then the feed.
async function feedAgain(page: Page): Promise<void> {
  await page.reload();
  await unlock(page, PIN);
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
}

test("a flagged phrase waits with the model's hint, the moderator decides in the panel, and the authors see the outcome", async ({ browser }) => {
  // Not a skip: a skipped path exits 0, and run-e2e-paths.sh would count it green.
  expect(PANEL_URL && SECRET, "the stand's panel and its session secret (docker-compose.web.yml e2e)").toBeTruthy();
  test.setTimeout(180_000);
  // Letters only: seven digits in a row read as a phone to the PHONE rule.
  const stamp = runLabel();
  // A site and a messenger: "link" and "contact" of lib/feed_verdict.ts readText.
  const toPublish = `кто со мной на пробежку, маршрут на бег.рф ${stamp}`;
  const toRefuse = `пиши в тг, договоримся ${stamp}`;
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    await writeFlagged(a, toPublish);

    const c = await (await browser.newContext()).newPage();
    contexts.push(c.context());
    await register(c, { name: "Вера", age: "31" });
    await writeFlagged(c, toRefuse);

    // The moderator, in the panel.
    // On a desktop, as the panel is used: the stand's device is a phone, and
    // at its width the panel's menu has no "Feed queue" link to click.
    const m = await (await browser.newContext({ ...devices["Desktop Chrome"] })).newPage();
    contexts.push(m.context());
    // The fixture stamps the storefront's Bunny headers on every context; the
    // panel is not behind Bunny, and the node's CORS refuses x-origin-token
    // from it, so the page stays blank. The moderator goes without them.
    await m.context().setExtraHTTPHeaders({});
    const token = await panelToken();
    await m.addInitScript(([k, v]) => window.localStorage.setItem(k, v), ["panel_jwt", token]);
    await m.goto(PANEL_URL);
    await m.getByRole("link", { name: "Feed queue" }).click();
    await expect(m.getByRole("heading", { name: "Feed queue" })).toBeVisible();

    const published = m.getByRole("row", { name: new RegExp(`бег\\.рф ${stamp}`) });
    const refused = m.getByRole("row", { name: new RegExp(`тг, договоримся ${stamp}`) });
    await expect(published).toBeVisible({ timeout: 15000 });
    await expect(refused).toBeVisible();
    // The model's word beside each, after the 202 and outside it: the page
    // re-reads every fifteen seconds, so the hint may land on a later read.
    await expect(published.getByText("model: reject — stub: a link"), "the model's hint is not beside the phrase").toBeVisible({ timeout: 40000 });
    await expect(refused.getByText("model: reject — stub: a link")).toBeVisible({ timeout: 40000 });

    // The person decides, whatever the model said.
    await published.getByRole("button", { name: "Publish" }).click();
    await expect(published).toHaveCount(0, { timeout: 15000 });
    await refused.getByRole("button", { name: "Refuse", exact: true }).click();
    await refused.getByRole("button", { name: "Yes, refuse" }).click();
    await expect(refused).toHaveCount(0, { timeout: 15000 });

    // The authors: the published phrase is in the feed, the refused one is not
    // — in its author's feed or anybody's.
    await feedAgain(a);
    await expect(a.getByTestId("card").filter({ hasText: toPublish }), "the published phrase is not in its author's feed").toHaveCount(1, { timeout: 15000 });
    await expect(a.getByTestId("card").filter({ hasText: toRefuse })).toHaveCount(0);
    // The author of the published phrase is told nothing of a refusal.
    await expect(a.getByTestId("refused")).toHaveCount(0);
    await feedAgain(c);
    await expect(c.getByTestId("card").filter({ hasText: toPublish })).toHaveCount(1, { timeout: 15000 });
    await expect(c.getByTestId("card").filter({ hasText: toRefuse }), "the refused phrase is in the feed").toHaveCount(0);
    // The refused phrase's author sees that it did not pass (W12-MRc, the
    // owner's decision of 2026-10-01): GET /inbox counts the moment, the feed
    // says so without naming the phrase; the next phrase of her own puts the
    // line out.
    await expect(c.getByTestId("refused"), "the author was not told the phrase did not pass moderation").toBeVisible({ timeout: 15000 });
    await expect(c.getByTestId("refused")).toHaveText("Ваша фраза не прошла модерацию и снята.");
    await writePhrase(c, `передумала, просто гуляю ${stamp}`);
    await expect(c.getByTestId("sent")).toBeVisible();
    await expect(c.getByTestId("refused")).toHaveCount(0);
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
});
