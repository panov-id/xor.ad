// P4 · the second device on the two people's path, against a live node: Аня
// and Борис match, agree and talk; Борис moves his identity to a new browser
// (nine characters behind the PIN, the same four check characters on both,
// "it is me" on the old one), seals it there under a first PIN, reloads and
// opens with that PIN; the conversation is silent there until he asks for new
// keys and Аня agrees (chat-flows §11), then it goes on from the new device.
// Then the paper code raises him on a third, clean browser, and the same
// reissue carries the conversation there too. Run by scripts/run-web-two-devices.sh.

import { expect, test, type Browser, type Page } from "../fixtures/address.ts";
import { PIN, likeByCard, openMatch, register, unlock, writePhrase } from "./helpers.ts";

const SIZE = { width: 393, height: 851 };

async function fresh(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ viewport: SIZE })).newPage();
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  return page;
}

// Open the one conversation from the inbox and wait until its keys open.
async function openChat(page: Page): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("refresh").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 30000 });
  await expect(page.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
}

// A device the identity just came to: the old conversation is silent there
// (chat-flows §11 — its K stayed behind), so it asks for new keys, the other
// side is asked on the screen and agrees, and both stand at the next epoch.
async function rekeyOnNewDevice(page: Page, other: Page, epoch: number): Promise<void> {
  await page.getByTestId("nav-inbox").click();
  await page.getByTestId("refresh").click();
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]'), "the old conversation opened on a device it was never wrapped for").toHaveAttribute("data-keys", "failed", { timeout: 30000 });
  await page.getByTestId("rekey-ask").click();
  await expect(page.getByTestId("rekey-waiting")).toBeVisible({ timeout: 15000 });
  await expect(other.getByTestId("rekey-asked"), "the other side was not asked about new keys").toBeVisible({ timeout: 30000 });
  await other.getByTestId("rekey-agree").click();
  for (const p of [page, other]) {
    await expect(p.locator('[data-screen="chat"]')).toHaveAttribute("data-epoch", String(epoch), { timeout: 30000 });
    await expect(p.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 30000 });
  }
}

async function say(from: Page, to: Page, line: string): Promise<void> {
  await from.getByTestId("text").fill(line);
  await from.getByTestId("send").click();
  await expect(to.locator('[data-testid="theirs"]').last(), `"${line}" did not reach the other side`).toContainText(line, { timeout: 20000 });
}

async function leaveChat(page: Page): Promise<void> {
  await page.getByTestId("back").click();
  await page.getByTestId("nav-feed").click();
}

test("the second device: a move under the PIN, a first PIN, the chat goes on; then the paper code on a third", async ({ browser }) => {
  test.setTimeout(360_000);
  const anya = await fresh(browser);
  await register(anya, { name: "Аня", age: "28" });
  const old = await fresh(browser);
  const paper = await register(old, { name: "Борис", age: "31" });

  // The match and the conversation, from the first device.
  const run = Date.now().toString(36);
  await writePhrase(anya, `гуляю у реки ${run}`);
  await writePhrase(old, `иду к мосту ${run}`);
  expect(await likeByCard(anya, `иду к мосту ${run}`)).toBe("liked");
  expect(await likeByCard(old, `гуляю у реки ${run}`)).toBe("matched");
  await openMatch(anya, "Борис");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("to-inbox").click();
  await openMatch(old, "Аня");
  await old.getByTestId("talk").click();
  await openChat(old);
  await openChat(anya);
  await say(anya, old, "привет с первого");
  await say(old, anya, "привет, я пока тут");
  await leaveChat(old);
  // Аня stays in the conversation: that is where she is asked about new keys.

  console.log("[step] The move");
  await old.getByTestId("tab-me").click();
  await old.getByTestId("me-move").click();
  await old.getByTestId("move-pin").fill(PIN);
  await old.getByTestId("move-go").click();
  const code = (await old.getByTestId("move-code").textContent({ timeout: 30000 }))!.trim();
  const second = await fresh(browser);
  await second.goto("/");
  await second.getByTestId("arrive").click();
  await second.getByTestId("arrive-code").fill(code);
  await second.getByTestId("arrive-go").click();
  const check = (await second.getByTestId("arrive-check").textContent({ timeout: 45000 }))!.trim();
  await expect(old.getByTestId("move-check"), "the two devices show different check characters").toHaveText(check, { timeout: 30000 });
  await old.getByTestId("move-yes").click();
  await expect(old.getByTestId("move-done")).toBeVisible({ timeout: 30000 });

  console.log("[step] A first PIN on the new device, a reload, the PIN");
  await second.getByTestId("arrive-pin").fill("864209");
  await second.getByTestId("arrive-pin-again").fill("864209");
  await second.getByTestId("arrive-keep").click();
  await expect(second.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
  await second.evaluate(() => sessionStorage.clear());
  await second.reload();
  await unlock(second, "864209");
  await expect(second.locator('[data-screen="feed"]')).toHaveAttribute("data-sealed", /^unlocked/, { timeout: 30000 });

  console.log("[step] The chat goes on from the new device");
  await rekeyOnNewDevice(second, anya, 1);
  await say(second, anya, "я на новом телефоне");
  await say(anya, second, "вижу, слышно");
  await leaveChat(second);

  console.log("[step] The paper code on a third device");
  const third = await fresh(browser);
  await third.goto("/");
  await third.getByTestId("restore").click();
  await third.getByTestId("restore-code").fill(paper.join(" "));
  await third.getByTestId("restore-pin").fill("975310");
  await third.getByTestId("restore-pin-again").fill("975310");
  await third.getByTestId("restore-go").click();
  await expect(third.locator('[data-screen="feed"]')).toBeVisible({ timeout: 45000 });
  await rekeyOnNewDevice(third, anya, 2);
  await say(third, anya, "поднялся по бумажному коду");
  await say(anya, third, "и так слышно");
});
