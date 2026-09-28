// E1 · the whole path two people walk, in one run against a live node: both
// register through the screens, each writes a phrase, they like each other,
// both agree, a line goes each way in the sealed chat, then one sets a dots
// table, the other sits down and applies, and the game is played to its end.
// Each person's browser is recorded (results/two-people/*.webm) — the video
// is the proof a person can watch. Run by scripts/run-web-two-people.sh.

import { expect, test, type Browser, type Page } from "../fixtures/address.ts";
import { likeByCard, openMatch, register, runLabel, twoAtATable, writePhrase } from "./helpers.ts";

const VIDEO = { dir: "results/two-people", size: { width: 393, height: 851 } };

async function person(browser: Browser, who: { name: string; age: string }): Promise<Page> {
  const context = await browser.newContext({ viewport: VIDEO.size, recordVideo: VIDEO });
  const page = await context.newPage();
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (r.status() >= 400 && !/\.(js|css|html|ico)$/.test(path)) console.log(`[${who.name} node] ${r.request().method()} ${path} → ${r.status()}`);
  });
  await register(page, who);
  return page;
}

test("two people: registration, a phrase each, a mutual like, consent, the chat, a table and a game to its end", async ({ browser }) => {
  test.setTimeout(300_000);
  const anya = await person(browser, { name: "Аня", age: "28" });
  const boris = await person(browser, { name: "Борис", age: "31" });
  try {
    // A phrase each, in the same circle.
    const run = runLabel();
    const aText = `гуляю у реки ${run}`;
    const bText = `иду к мосту ${run}`;
    await writePhrase(anya, aText);
    await writePhrase(boris, bText);

    console.log("[step] The mutual like");
    // The mutual like: the second like makes the match.
    expect(await likeByCard(anya, bText), "the first like did not land").toBe("liked");
    expect(await likeByCard(boris, aText), "the second like made no match").toBe("matched");

    console.log("[step] Consent from both");
    // Consent from both: the conversation opens.
    await openMatch(anya, "Борис");
    await anya.getByTestId("talk").click();
    await expect(anya.getByTestId("waiting")).toBeVisible({ timeout: 15000 });
    await anya.getByTestId("to-inbox").click();
    await openMatch(boris, "Аня");
    await boris.getByTestId("talk").click();
    await expect(boris.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });

    console.log("[step] The chat: a line");
    // The chat: a line each way, read as text on the other side.
    await boris.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
    await expect(boris.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
    await anya.getByTestId("refresh").click();
    await expect(anya.locator('[data-testid="chat"]')).toHaveCount(1, { timeout: 15000 });
    await anya.locator('[data-testid="chat"] [data-testid="open-chat"]').click();
    await expect(anya.locator('[data-screen="chat"]')).toHaveAttribute("data-keys", "open", { timeout: 20000 });
    await expect(anya.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
    await expect(boris.getByTestId("status")).toHaveText("на связи", { timeout: 20000 });
    await anya.getByTestId("text").fill("сыграем в точки?");
    await anya.getByTestId("send").click();
    await expect(boris.locator('[data-testid="theirs"]').last()).toContainText("сыграем в точки?", { timeout: 20000 });
    await boris.getByTestId("text").fill("давай, ставь стол");
    await boris.getByTestId("send").click();
    await expect(anya.locator('[data-testid="theirs"]').last()).toContainText("давай, ставь стол", { timeout: 20000 });

    console.log("[step] The table: back");
    // The table: back to the feed, Аня sets it, Борис sits and applies, the game begins.
    // Out of the chat: its back leads to the inbox, the nav to the feed.
    for (const page of [anya, boris]) {
      await page.getByTestId("back").click();
      await page.getByTestId("nav-feed").click();
      await expect(page.locator('[data-screen="feed"]')).toBeVisible({ timeout: 15000 });
    }
    await twoAtATable(anya, boris, { name: `точки ${run}`, kind: "dots", set: "2x2" });

    console.log("[step] The game to its end");
    // The game to its end: whoever's turn it is presses a free edge, until the
    // node says it is over. 2x2 has twelve edges, so twelve moves at most.
    for (let move = 0; move < 12; move++) {
      if (await anya.getByTestId("over").isVisible()) break;
      const aTurn = (await anya.getByTestId("turn").textContent())?.startsWith("ваш ход");
      const mover = aTurn ? anya : boris;
      const taken = await mover.locator("[data-taken]").count();
      console.log(`[move ${move}] ${aTurn ? "Аня" : "Борис"} taken ${taken}`);
      await mover.getByRole("button", { name: /^ребро [hv]:\d+:\d+$/ }).first().click();
      await expect(mover.locator("[data-taken]")).toHaveCount(taken + 1, { timeout: 15000 });
    }
    await expect(anya.getByTestId("over")).toBeVisible({ timeout: 15000 });
    await expect(boris.getByTestId("over")).toBeVisible({ timeout: 15000 });
  } finally {
    // The videos are written when their contexts close.
    await anya.context().close();
    await boris.context().close();
  }
});
