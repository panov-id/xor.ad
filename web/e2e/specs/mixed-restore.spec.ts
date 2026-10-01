// W12-RM · the paper code raises an identity across the two faces. Аня
// registers on the page and Борис in the terminal (depth/ink/mixed_restore.node-test.ts);
// they match, agree and trade a line. Then her paper code raises her in a
// clean terminal: the page's session goes quiet (401 to its next call), the
// terminal sees the feed and the conversation, asks for new keys, and a line
// goes each way there. The terminal hands back the code it was given; a clean
// page raises her by it: the feed, the conversation in the inbox, no wrap of
// its keys — the page asks for new keys, Борис agrees, and a line goes each
// way under the next epoch. Run by scripts/run-web-depth-mixed.sh mixed-restore.

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

async function toTheChat(page: Page): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("refresh").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
}

test("the paper code raises an identity from the page in the terminal, and back", async ({ browser }) => {
  test.skip(run === "", "the terminal's side runs only under scripts/run-web-depth-mixed.sh");
  test.setTimeout(420_000);
  const first = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const page = await first.newPage();
  try {
    const paper = await register(page, { name: "Аня", age: "28" });
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
    await toTheChat(page);
    await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 30000 });
    const line = `привет из браузера ${run}`;
    await page.getByTestId("text").fill(line);
    await page.getByTestId("send").click();
    signal("web-said", line);
    const reply = await waitFor("depth-said", 60);
    await expect(page.locator('[data-testid="theirs"]').last(), "the terminal's line did not reach the browser").toContainText(reply, { timeout: 30000 });
    signal("web-heard", "restore");

    console.log("[step] Her paper code raises her in a clean terminal");
    signal("web-paper-code", paper.join(" "));
    const fresh = await waitFor("depth-raised", 240);
    expect(fresh.split(" ")).toHaveLength(4);
    // This page's session went quiet with the raise (§8.2: one live session).
    const refused = await page.evaluate(async () => {
      const xor = (globalThis as unknown as { xor?: { client: { profile(): Promise<unknown> } } }).xor;
      try { await xor!.client.profile(); return "ok"; } catch (e) { return (e as Error).message; }
    });
    expect(refused, "the page's session stayed live after the raise in the terminal").toContain("401");

    console.log("[step] The terminal's code raises her on a clean page: the feed, the conversation, new keys");
    const second = await browser.newContext({ viewport: { width: 393, height: 851 } });
    const back = await second.newPage();
    await back.goto("/");
    await back.getByTestId("restore").click();
    await expect(back.locator('[data-screen="restore"]')).toBeVisible();
    await back.getByTestId("restore-code").fill(fresh.toLowerCase());
    await back.getByTestId("restore-pin").fill("975310");
    await back.getByTestId("restore-pin-again").fill("975310");
    await back.getByTestId("restore-go").click();
    await expect(back.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
    await expect(back.getByTestId("loading")).toBeHidden({ timeout: 15000 });
    await toTheChat(back);
    const chat = back.locator('[data-screen="chat"]');
    // No wrap of the keys for this device: the page offers asking for new ones.
    await expect(back.getByTestId("keys-failed"), "the raised page did not say its keys are missing").toBeVisible({ timeout: 30000 });
    const before = Number(await chat.getAttribute("data-epoch"));
    await back.getByTestId("rekey-ask").click();
    await expect(back.getByTestId("rekey-waiting")).toBeVisible({ timeout: 15000 });
    signal("web-asked-rekey");
    await waitFor("depth-agreed-rekey", 90);
    await expect(chat, "the page's keys did not move to the next epoch").toHaveAttribute("data-epoch", String(before + 1), { timeout: 30000 });
    await expect(chat).toHaveAttribute("data-keys", "open", { timeout: 30000 });

    const after = `поднялась на странице ${run}`;
    await back.getByTestId("text").fill(after);
    await back.getByTestId("send").click();
    signal("web-said-raised", after);
    const last = await waitFor("depth-said-raised", 60);
    await expect(back.locator('[data-testid="theirs"]').last(), "the terminal's line did not reach the raised page").toContainText(last, { timeout: 30000 });
    signal("web-heard-raised");
  } catch (e) {
    signal("web-failed", (e as Error).message);
    throw e;
  }
});
