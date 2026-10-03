// neighbro's card as a screen reader and a keyboard meet it (panel 03.10,
// P2–P5): the article is named by its phrase and described by what else it
// carries; the countdown is said once, the undo button outside the live
// region; a picked heart sends focus to the card; the focused target shows
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

    // P3: placed; the live region says it once and does not tick.
    await b.keyboard.press("Enter");
    const said = b.getByTestId("heart-said");
    await expect(said, "P3: the live region speaks when the heart lands").not.toBeEmpty();
    const first = await said.textContent();
    // Read at once, not polled: the window closing would empty these on its own.
    await expect(b.getByTestId("heart-undo")).toBeVisible();
    expect(await b.locator('[role="status"] [data-testid="heart-undo"]').count(), "P3: undo is outside the live region").toBe(0);
    expect(await b.locator('[data-testid="heart-wait"][role="status"]').count(), "P3: the visible countdown is no live region").toBe(0);
    await b.waitForTimeout(2100);
    expect(await said.textContent(), "P3: the live region does not change every second").toBe(first);
    await b.getByTestId("heart-undo").click();
  } finally {
    for (const c of contexts) await c.close();
  }
});
