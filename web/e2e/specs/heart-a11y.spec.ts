// neighbro's card as a screen reader and a keyboard meet it (panel 03.10,
// P2–P5): the article is named by its phrase and described by what else it
// carries; the sent like is said once, after the 5 s window (10.10.2026);
// a picked heart sends focus to the card; the focused target shows
// a solid ring, not the dashed one.
// sosed has no heart pad (blocks): the spec stands aside on that build.

import { type BrowserContext, expect, test } from "../fixtures/address.ts";
import { register, runLabel, writePhrase } from "./helpers.ts";

test("neighbro card: name, description, one announcement, focus to the target, focus ring", async ({ browser }) => {
  test.setTimeout(180_000);
  const line = `сердце для диктора ${runLabel()}`;
  const contexts: BrowserContext[] = [];
  try {
    const a = await (await browser.newContext()).newPage();
    contexts.push(a.context());
    await register(a, { name: "Аня", age: "28" });
    if ((await a.locator("html").getAttribute("data-brand")) !== "neighbro") test.skip(true, "the heart pad is neighbro's; this build is another brand");
    await writePhrase(a, line);

    const b = await (await browser.newContext()).newPage();
    contexts.push(b.context());
    await register(b, { name: "Борис", age: "31" });
    await writePhrase(b, `и я тут ${line}`);
    await b.getByTestId("nav-inbox").click();
    await b.getByTestId("nav-feed").click();
    const card = b.getByTestId("card").filter({ hasText: line }).filter({ hasNotText: "и я тут" });
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await card.click();

    const target = b.getByTestId("heart-target");
    // P2: the name is the phrase alone; the count is read as the description.
    await expect(target, "P2: the article is named by its phrase").toHaveAccessibleName(line);
    await expect(target, "P2: the like count is in the article's description").toHaveAccessibleDescription(/\d/);
    // P4: not armed, the target is no tab stop.
    await expect(target, "P4: an unarmed target is out of the tab order").toHaveAttribute("tabindex", "-1");

    // P4: Enter on the heart moves focus to the card.
    await b.getByTestId("heart").focus();
    await b.keyboard.press("Enter");
    await expect(target, "P4: the picked heart sends focus to the card").toBeFocused();
    // P5: the focused target shows the solid ring, not the dashed target line.
    expect(await target.evaluate((el) => getComputedStyle(el).outlineStyle), "P5: focus-visible outranks .target").toBe("solid");

    // P3 and WCAG 2.2.1: placed, the like waits 5 s and an undo row says so; Tab
    // from the card reaches «отменить» (keyboard), and the focus there stops the
    // clock. Out of the row the like goes, the live region says so once and
    // stays — no countdown left to tick.
    await b.keyboard.press("Enter");
    await expect(b.getByTestId("heart-undo-row"), "the undo row stands under the card").toBeVisible();
    await b.keyboard.press("Tab");
    await expect(b.getByTestId("heart-undo"), "Tab from the card reaches «отменить»").toBeFocused();
    const said = b.getByTestId("heart-said");
    await b.waitForTimeout(6500);
    await expect(said, "P3: nothing is said while the like waits on the focus").toBeEmpty();
    await b.getByTestId("heart-undo").blur();
    await expect(said, "P3: the live region speaks when the like has gone").not.toBeEmpty({ timeout: 15000 });
    const first = await said.textContent();
    await b.waitForTimeout(2100);
    expect(await said.textContent(), "P3: the live region does not change after").toBe(first);
  } finally {
    for (const c of contexts) await c.close();
  }
});
