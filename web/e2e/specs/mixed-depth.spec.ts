// Q6 · the two people's path with one of them in the terminal: Аня walks the
// page while Борис walks the depth screens against the same node
// (depth/ink/mixed.node-test.ts). They take turns through files in a shared
// directory: a side writes a step's name when it is done and waits for the
// other's. Run by scripts/run-web-depth-mixed.sh, which starts both sides.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, writePhrase } from "./helpers.ts";

const sync = "/app/results/mixed-sync";
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

test("two people, one in the browser and one in the terminal: a like each way, consent, a line each way", async ({ page }) => {
  // Without the terminal's side there is nobody to meet: the whole web suite
  // (run-web-tests.sh) passes over it, and run-web-depth-mixed.sh runs it.
  test.skip(run === "", "the terminal's side runs only under scripts/run-web-depth-mixed.sh");
  test.setTimeout(360_000);
  try {
    await register(page, { name: "Аня", age: "28" });
    const mine = `гуляю у реки ${run}`;
    await writePhrase(page, mine);

    console.log("[step] Борис's phrase from the terminal, liked in the browser");
    const his = await waitFor("depth-phrase", 180);
    expect(await likeByCard(page, his)).toBe("liked");
    signal("web-liked", mine);

    console.log("[step] His like makes the match; she agrees first and waits");
    await waitFor("depth-liked");
    await openMatch(page, "Борис");
    await page.getByTestId("talk").click();
    await expect(page.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("to-inbox").click();
    signal("web-agreed");

    console.log("[step] A line each way");
    await waitFor("depth-in-chat");
    await openChat(page);
    const line = `привет из браузера ${run}`;
    await page.getByTestId("text").fill(line);
    await page.getByTestId("send").click();
    signal("web-said", line);
    const reply = await waitFor("depth-said", 60);
    await expect(page.locator('[data-testid="theirs"]').last(), "the terminal's line did not reach the browser").toContainText(reply, { timeout: 30000 });
    signal("web-heard");
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
