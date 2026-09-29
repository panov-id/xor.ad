// T19 · new keys between the two faces: Борис in the terminal asks for them
// (depth/ink/mixed.node-test.ts), Аня agrees on the page — the page offers
// asking only once its keys failed, agreeing always — and a line goes under
// the new epoch: the terminal reads it only with the keys both now hold. The
// path to the first line each way is mixed-depth.spec.ts's; "rekey" in the
// body of web-heard is what sends the terminal on to the new keys.
// Run by MIXED_SPEC=mixed-rekey scripts/run-web-depth-mixed.sh.

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

test("the terminal asks for new keys, the browser agrees, and a line goes under the new epoch", async ({ page }) => {
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
    const chat = page.locator('[data-screen="chat"]');
    const line = `привет из браузера ${run}`;
    await page.getByTestId("text").fill(line);
    await page.getByTestId("send").click();
    signal("web-said", line);
    const reply = await waitFor("depth-said", 60);
    await expect(page.locator('[data-testid="theirs"]').last(), "the terminal's line did not reach the browser").toContainText(reply, { timeout: 30000 });
    signal("web-heard", "rekey");

    console.log("[step] He asks for new keys in the terminal; she agrees on the page");
    const before = Number(await chat.getAttribute("data-epoch"));
    await waitFor("depth-asked-rekey", 60);
    await expect(page.getByTestId("rekey-asked"), "the page never heard the terminal ask").toBeVisible({ timeout: 30000 });
    await page.getByTestId("rekey-agree").click();
    await expect(chat, "the page's keys did not move to the next epoch").toHaveAttribute("data-epoch", String(before + 1), { timeout: 30000 });
    await expect(chat).toHaveAttribute("data-keys", "open", { timeout: 30000 });
    signal("web-agreed-rekey");
    const theirs = Number(await waitFor("depth-rekeyed", 60));
    expect(theirs, "the terminal holds another epoch than the page").toBe(before + 1);

    console.log("[step] A line under the new epoch");
    const after = `под новыми ключами ${run}`;
    await page.getByTestId("text").fill(after);
    await page.getByTestId("send").click();
    signal("web-said-rekeyed", after);
    await waitFor("depth-heard-rekeyed", 60);
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
