// W11-MV · an identity with an open conversation moves from the page into the
// terminal: Аня and Борис (depth/ink/mixed_move.node-test.ts) match, agree and
// trade a line as mixed-depth.spec.ts does; then Аня opens the move on the
// page (screen 13), the terminal types the nine characters, both show the same
// four check characters, "it is me" here moves her. The page lets go and is
// back at the start. What follows — the new keys of the conversation the moved
// device holds no pair for, and the first line each way under them — is the
// terminal's side alone. Run by scripts/run-web-depth-mixed.sh mixed-move.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "../fixtures/address.ts";
import { PIN, likeByCard, openMatch, register, unlock, writePhrase } from "./helpers.ts";

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

test("an identity with an open conversation moves from the page into the terminal", async ({ page }) => {
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
    signal("web-heard", "move");

    console.log("[step] The move: nine characters behind the PIN, the terminal types them");
    // Back to the feed the way a person leaves a conversation on this page:
    // a reload, the vault and the PIN (unlock-chat.spec).
    await page.reload();
    await unlock(page, PIN);
    await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 30000 });
    await page.getByTestId("tab-me").click();
    await page.getByTestId("me-move").click();
    await expect(page.locator('[data-screen="departure"]')).toBeVisible();
    await page.getByTestId("move-pin").fill(PIN);
    await page.getByTestId("move-go").click();
    const code = (await page.getByTestId("move-code").textContent({ timeout: 30000 }))!.trim();
    expect(code).toMatch(/^\S{3} \S{3} \S{3}$/);
    signal("web-move-code", code);

    const check = await waitFor("depth-claimed", 90);
    await expect(page.getByTestId("move-check"), "the page shows other check characters than the terminal").toHaveText(check, { timeout: 30000 });
    await expect(page.getByTestId("move-label")).toContainText("depth");
    await page.getByTestId("move-yes").click();
    await expect(page.getByTestId("move-done")).toBeVisible({ timeout: 30000 });
    signal("web-moved");

    // The page let go: nothing kept, back at the start.
    await page.getByTestId("move-exit").click();
    await expect(page.locator('[data-screen="splash"]')).toBeVisible({ timeout: 15000 });

    // The rest is between the two terminals; the page only waits for the end
    // so a failure there is this run's failure too.
    await waitFor("depth-heard-after-move", 240);
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
