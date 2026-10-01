// W10-N5mix · the starters across the two faces (chat spec §8.7, N3/N4): Аня
// on the page and Борис in the terminal (depth/ink/mixed_starters.node-test.ts)
// each write two phrases, match on the first pair and open the conversation.
// Then a like from the page on his second phrase reaches his open chat as an
// extra-like card in the terminal, and the page sees the third starter in the
// header when it comes back; a like from the terminal on her second phrase
// reaches her open chat as a card on the page (position 4), and the terminal
// sees the fourth starter when it comes back. Run by
// scripts/run-web-depth-mixed.sh mixed-starters.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, writePhrase } from "./helpers.ts";

const sync = process.env.MIXED_SYNC ?? "/app/results/mixed-sync";
const run = process.env.MIXED_RUN ?? "";

function signal(step: string, body = ""): void {
  writeFileSync(`${sync}/${step}`, body);
  console.log(`[sync] web → ${step}`);
}

async function waitFor(step: string, seconds = 120): Promise<string> {
  for (let i = 0; i < seconds * 10; i++) {
    if (existsSync(`${sync}/${step}`)) return readFileSync(`${sync}/${step}`, "utf8");
    if (existsSync(`${sync}/depth-failed`)) {
      throw new Error(`the terminal's side failed before "${step}": ${readFileSync(`${sync}/depth-failed`, "utf8")}`);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`the terminal's side never reached "${step}"`);
}

async function openChat(page: Page): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("refresh").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 30000 });
}

test("a like from the page is a card in the terminal, a like from the terminal a card on the page, and both number the starters", async ({ page }) => {
  test.skip(run === "", "the terminal's side runs only under scripts/run-web-depth-mixed.sh");
  test.setTimeout(420_000);
  try {
    await register(page, { name: "Аня", age: "28" });
    const mine = `гуляю у реки ${run}`;
    const mineToo = `и ещё гуляю ${run}`;
    await writePhrase(page, mine);
    await writePhrase(page, mineToo);

    const his = await waitFor("depth-phrase", 180);
    const hisToo = await waitFor("depth-phrase-2", 60);
    expect(await likeByCard(page, his)).toBe("liked");
    signal("web-liked", mine);

    await waitFor("depth-liked");
    await openMatch(page, "Борис");
    await page.getByTestId("talk").click();
    await expect(page.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("to-inbox").click();
    signal("web-agreed");

    await waitFor("depth-in-chat");
    await openChat(page);
    const line = `привет из браузера ${run}`;
    await page.getByTestId("text").fill(line);
    await page.getByTestId("send").click();
    signal("web-said", line);
    const reply = await waitFor("depth-said", 60);
    await expect(page.locator('[data-testid="theirs"]').last(), "the terminal's line did not reach the browser").toContainText(reply, { timeout: 30000 });
    // The two starters of the match, in the order of the likes: his first.
    const starters = page.getByTestId("starter");
    await expect(starters).toHaveCount(2, { timeout: 15000 });
    await expect(starters.nth(0)).toContainText(his);
    await expect(starters.nth(0)).toHaveAttribute("data-liked-by", "me");
    signal("web-heard", "starters");

    console.log("[step] A like from the page on his second phrase: a card in his open terminal chat");
    await page.getByTestId("back").click();
    expect(await likeByCard(page, hisToo)).toBe("liked");
    signal("web-liked-2", hisToo);
    await waitFor("depth-saw-extra", 60);

    console.log("[step] Back in the conversation: the third starter, from my side");
    await openChat(page);
    await expect(page.getByTestId("starter")).toHaveCount(3, { timeout: 15000 });
    await expect(page.getByTestId("starter").nth(2)).toHaveAttribute("data-position", "3");
    await expect(page.getByTestId("starter").nth(2)).toHaveAttribute("data-liked-by", "me");
    await expect(page.getByTestId("starter").nth(2)).toContainText(hisToo);
    signal("web-in-chat-2");

    console.log("[step] A like from the terminal on my second phrase: a card on this open page");
    await waitFor("depth-liked-2", 120);
    const card = page.getByTestId("extra-like");
    await expect(card, "the terminal's like never reached the page's open chat").toHaveCount(1, { timeout: 30000 });
    await expect(card).toHaveAttribute("data-position", "4");
    await expect(card).toHaveAttribute("data-direction", "they_liked_yours");
    await expect(card).toContainText("4. вашему собеседнику понравилось ещё одно ваше сообщение");
    await expect(card).toContainText(mineToo);
    await expect(page.getByTestId("starter")).toHaveCount(4);
    await expect(page.getByTestId("starter").nth(3)).toHaveAttribute("data-liked-by", "them");
    signal("web-saw-extra");
    await waitFor("depth-in-chat-2", 60);
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
