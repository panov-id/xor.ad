// W12-MCG · a game in a conversation across the two faces: Борис in the
// terminal (depth/ink/mixed_chat_game.node-test.ts) offers dots, the page sees
// the offer arrive on the chat's socket and accepts; the proposer moves first
// — the terminal's edge shows up on the page's board — the page draws an edge
// in its turn, and the terminal moves again. The meeting and the first line
// each way are mixed-depth.spec.ts's. Run by scripts/run-web-depth-mixed.sh mixed-chat-game.

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

test("the terminal offers dots in the conversation, the page accepts and the moves go each way", async ({ page }) => {
  test.skip(run === "", "the terminal's side runs only under scripts/run-web-depth-mixed.sh");
  test.setTimeout(420_000);
  try {
    await register(page, { name: "Аня", age: "28" });
    const mine = `гуляю у реки ${run}`;
    await writePhrase(page, mine);

    const his = await waitFor("depth-phrase", 180);
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
    signal("web-heard", "chat-game");

    console.log("[step] The terminal offers dots; the offer arrives on the socket, the page accepts");
    await waitFor("depth-proposed", 60);
    await expect(page.getByTestId("game-offer"), "the terminal's offer never reached the page").toBeVisible({ timeout: 30000 });
    await page.getByTestId("game-accept").click();
    await expect(page.getByTestId("game-turn")).toHaveText("Ход собеседника", { timeout: 20000 });
    signal("web-accepted");

    console.log("[step] The terminal moves first; its edge shows on the page's board");
    const first = await waitFor("depth-moved", 60);
    await expect(page.locator(`[data-testid="dots"] [data-taken="${first}"]`), `the terminal's edge ${first} is not on the page's board`).toHaveCount(1, { timeout: 30000 });
    await expect(page.getByTestId("game-turn")).toHaveText("Ваш ход", { timeout: 20000 });

    console.log("[step] The page draws an edge; the terminal moves again");
    await page.locator('[data-testid="dots"] [data-edge="v:1:2"]').click();
    await expect(page.locator('[data-testid="dots"] [data-taken="v:1:2"]')).toHaveCount(1, { timeout: 20000 });
    await expect(page.getByTestId("game-turn")).toHaveText("Ход собеседника", { timeout: 20000 });
    signal("web-moved", "v:1:2");
    const second = await waitFor("depth-moved-again", 60);
    await expect(page.locator(`[data-testid="dots"] [data-taken="${second}"]`), `the terminal's second edge ${second} is not on the page's board`).toHaveCount(1, { timeout: 30000 });
    await expect(page.locator('[data-testid="dots"] [data-taken]')).toHaveCount(3);
    await expect(page.getByTestId("game-turn")).toHaveText("Ваш ход", { timeout: 20000 });
    signal("web-heard-game");
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
