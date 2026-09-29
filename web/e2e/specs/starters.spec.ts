// The starters of a conversation in the web face (chat spec: "Liked, in
// order", §8.7; N4): two people like each other's phrases, both agree, and
// each sees at the head of the conversation the two phrases numbered in the
// order of the likes, each marked from their own side. An extra like arrives
// as a room frame — the node does not send it yet (N2), so the stand puts one
// into the page's socket — and is drawn as a card with the next number.

import AxeBuilder from "@axe-core/playwright";
import type { WebSocketRoute } from "@playwright/test";
import { expect, test, type BrowserContext, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, runLabel, watch, writePhrase } from "./helpers.ts";

async function personIn(context: BrowserContext, name: string): Promise<Page> {
  const page = await context.newPage();
  watch(page, []);
  await register(page, { name, age: "30" });
  return page;
}

async function openChat(page: Page) {
  await expect(page.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
  await page.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
  await expect(page.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
}

async function axe(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  for (const v of results.violations) console.log(`[axe ${where}] ${v.impact} ${v.id}: ${v.help}`);
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.impact} ${v.id}`), `axe on ${where}`).toEqual([]);
}

test("both see the starters in the order of the likes, marked from their own side, and an extra like comes as a numbered card", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await browser.newContext({ viewport: { width: 393, height: 851 } });
  const b = await browser.newContext({ viewport: { width: 393, height: 851 } });
  // Anya's room socket goes through the stand, which can add a frame to it.
  // Set on the context before the page exists: the route is wired into a page
  // at its navigation, and one set after it never sees the socket (measured).
  let anyaRoom: WebSocketRoute | null = null;
  await a.routeWebSocket(/\/chat$/, (ws) => { ws.connectToServer(); anyaRoom = ws; });
  const anya = await personIn(a, "Аня");
  const boris = await personIn(b, "Борис");

  // The phrases are chosen so that their alphabetical order is the reverse of
  // the order of the likes: a header sorted by anything but position reads wrong.
  const run = runLabel();
  const aText = `гуляю у реки ${run}`;
  const bText = `иду к реке ${run}`;
  await writePhrase(anya, aText);
  await writePhrase(boris, bText);
  expect(await likeByCard(anya, bText)).toBe("liked");
  expect(await likeByCard(boris, aText)).toBe("matched");

  await openMatch(anya, "Борис");
  await anya.getByTestId("talk").click();
  await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
  await anya.getByTestId("to-inbox").click();
  await openMatch(boris, "Аня");
  await boris.getByTestId("talk").click();
  await expect(boris.locator('[data-screen="inbox"]')).toBeVisible({ timeout: 15000 });
  await openChat(boris);
  await anya.getByTestId("refresh").click();
  await openChat(anya);

  // The same two rows for both, first the phrase liked first (Борис's).
  for (const [page, marks] of [[anya, ["me", "them"]], [boris, ["them", "me"]]] as const) {
    const rows = page.getByTestId("starter");
    await expect(rows).toHaveCount(2, { timeout: 15000 });
    await expect(rows.nth(0)).toHaveAttribute("data-position", "1");
    await expect(rows.nth(0)).toContainText(bText);
    await expect(rows.nth(1)).toHaveAttribute("data-position", "2");
    await expect(rows.nth(1)).toContainText(aText);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-liked-by")))).toEqual([...marks]);
  }
  await expect(anya.getByTestId("starter").nth(0)).toContainText("Вам понравилось");
  await expect(boris.getByTestId("starter").nth(0)).toContainText("Собеседнику понравилось");
  await axe(anya, "chat with starters");

  // An extra like, as the node will send it (§8.7): a card in the middle with
  // the next number, worded for this reader, and a third row in the header.
  await expect.poll(() => anyaRoom !== null, { timeout: 15000 }).toBe(true);
  anyaRoom!.send(JSON.stringify({
    type: "extra_like", seq: 1_000_000,
    data: { kind: "extra_like", position: 3, text: `и ещё одна ${run}`, mode: "company", direction: "they_liked_yours" },
  }));
  const card = anya.getByTestId("extra-like");
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(card).toHaveAttribute("data-position", "3");
  await expect(card).toContainText("3. вашему собеседнику понравилось ещё одно ваше сообщение");
  await expect(card).toContainText(`и ещё одна ${run}`);
  await expect(anya.getByTestId("starter")).toHaveCount(3);
  await expect(anya.getByTestId("starter").nth(2)).toHaveAttribute("data-liked-by", "them");
  await axe(anya, "chat with an extra like");

  await a.close();
  await b.close();
});
