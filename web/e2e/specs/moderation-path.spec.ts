// The moderation path end to end (wave 5, Q3; chat spec §8.3, §8.14; WP-4):
// nobody but the model reads a phrase (owner's decision, 09.10.2026). With the
// model on (MODERATOR_URL, the stand's stub in docker-compose.web.yml) the node
// asks it about every phrase before publishing: "publish" puts the phrase out
// at 200; "reject" refuses it at 422 with the model's reason, which the author
// reads in the composer on the spot. Nothing goes to a queue and nothing waits.
//
// Two neighbours: one writes a phrase the stub lets through, the other one
// carrying a messenger, which the stub refuses. Then the published phrase is
// in both feeds, the refused one in none, and the refused author's next
// phrase goes out as any other.
//
// Runs with the rest of the stand (scripts/run-web-tests.sh); it needs no
// panel any more:
//   scripts/run-web-two-people.sh moderation-path

import { type BrowserContext, expect, type Page, test } from "../fixtures/address.ts";
import { PIN, register, runLabel, unlock, writePhrase } from "./helpers.ts";

// Writes a phrase and reads the node's answer to POST /feed.
async function write(page: Page, text: string): Promise<number[]> {
  const posts: number[] = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname === "/feed" && r.request().method() === "POST") posts.push(r.status()); });
  await page.getByTestId("write").click();
  await expect(page.locator('[data-screen="composer"]')).toBeVisible();
  await page.getByTestId("text").fill(text);
  await page.getByTestId("send").click();
  return posts;
}

// The author's feed read again from the node: a reload goes through the vault
// and the PIN (W1d), then the feed.
async function feedAgain(page: Page): Promise<void> {
  await page.reload();
  await unlock(page, PIN);
  await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("loading")).toBeHidden({ timeout: 15000 });
}

test("the model publishes one phrase and refuses another, and the refused author reads why at once", async ({ browser }) => {
  test.setTimeout(180_000);
  // Letters only: seven digits in a row read as a phone to the PHONE rule.
  const stamp = runLabel();
  const toPublish = `кто со мной на пробежку вечером ${stamp}`;
  const toRefuse = `пиши в тг, договоримся ${stamp}`;
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    const aPosts = await write(a, toPublish);
    await expect(a.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
    await expect(a.getByTestId("sent")).toHaveAttribute("data-state", "published");
    expect(aPosts, "the model's publish did not put the phrase out").toEqual([200]);

    const c = await (await browser.newContext()).newPage();
    contexts.push(c.context());
    await register(c, { name: "Вера", age: "31" });
    const cPosts = await write(c, toRefuse);
    // The refusal is the author's to read in the composer, with the reason.
    // The reason is a phrase of the dictionary (quorum 2026-10-10); the model's own "stub: a link" is not shown.
    await expect(c.getByTestId("refused"), "the author was not told that the phrase did not pass").toContainText(
      "Фраза не принята.", { timeout: 15000 },
    );
    await expect(c.getByTestId("refused"), "the model's own text reached the author").not.toContainText("stub");
    expect(cPosts, "the model's reject did not reach the author as a refusal").toEqual([422]);
    await c.getByTestId("back").click();

    // The feeds: the published phrase in both, the refused one in none.
    await feedAgain(a);
    await expect(a.getByTestId("card").filter({ hasText: toPublish }), "the published phrase is not in its author's feed").toHaveCount(1, { timeout: 15000 });
    await expect(a.getByTestId("card").filter({ hasText: toRefuse })).toHaveCount(0);
    await feedAgain(c);
    await expect(c.getByTestId("card").filter({ hasText: toPublish })).toHaveCount(1, { timeout: 15000 });
    await expect(c.getByTestId("card").filter({ hasText: toRefuse }), "the refused phrase is in the feed").toHaveCount(0);

    // Nothing holds the refused author: the next phrase goes out.
    await writePhrase(c, `передумала, просто гуляю ${stamp}`);
    await expect(c.getByTestId("sent")).toHaveAttribute("data-state", "published");
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
});
