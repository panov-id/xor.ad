// Step К6a of the kit wave: the feed, the card, the likes, the match and the
// departure speak only through kit elements, and the defects of the 10.10.2026
// text walk stay fixed (docs/plan-goal-2026-10-10_RU.md, the П table):
// П6 / kit_RU.md §8.1 the service line «ключи: …» is gone and a seal that does
// not match is an error line in words, П2 a language is named in the interface's
// words, П16 the like count is read as «лайков: N», not as a bare number.
// The heart's 5 s undo (§8.5) is heart.spec.ts and heart-a11y.spec.ts.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, runLabel, writePhrase } from "./helpers.ts";

test("П6, П2, П16: no keys line on the feed, the radius is a named select, a card's foot names its likes in words", async ({ browser }) => {
  test.setTimeout(120_000);
  const label = runLabel();
  const line = `подпись под карточкой ${label}`;
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  try {
    await register(a, { name: "Аня", age: "28" });
    await writePhrase(a, line);
    await register(b, { name: "Борис", age: "31" });
    const feed = b.locator('[data-screen="feed"]');

    // П6: no service line at the foot, the state is only data-sealed, no error line while the seal is whole.
    await expect(feed).toHaveAttribute("data-sealed", "ok");
    await expect(feed).not.toContainText("ключи");
    await expect(feed).not.toContainText("печать хранилища");
    await expect(b.getByTestId("sealed-failed")).toHaveCount(0);
    await expect(feed.locator("footer"), "the feed has no foot of its own").toHaveCount(0);

    // The radius is the kit's Segments, chips in a row (redesign 16.10.2026): the group's label names it for a reader.
    await expect(b.getByTestId("radius").getByRole("radiogroup")).toHaveAccessibleName("радиус круга");

    // П16 and П2: the foot of a card reads «лайков: 0», never a bare number, and no language code.
    await b.getByTestId("nav-inbox").click();
    await b.getByTestId("nav-feed").click();
    const card = b.getByTestId("card").filter({ hasText: line });
    await expect(card).toHaveCount(1, { timeout: 30000 });
    await expect(card.getByTestId("card-open")).toHaveAccessibleDescription(/лайков: 0/);
    const foot = card.locator("[id$='-foot']");
    await expect(foot).toContainText("лайков: 0");
    expect(await foot.innerText(), "a language is named, not coded («ru»)").not.toMatch(/(^|[\s·])ru([\s·]|$)/);

    // The likes screen of a person who liked nothing is the kit's empty state.
    await b.getByTestId("likes").click();
    await expect(b.locator('[data-screen="likes"]')).toBeVisible();
    await expect(b.getByTestId("quiet")).toBeVisible({ timeout: 15000 });
  } finally {
    await a.context().close();
    await b.context().close();
  }
});

test("§8.1: a seal that does not match is an error line in words on the feed, data-sealed stays", async ({ page }) => {
  // The seal opens through crypto.subtle.decrypt (depth/core/seal.ts open): the
  // page is told to refuse it once the registration is confirmed, and nothing earlier.
  await page.addInitScript(() => {
    const real = SubtleCrypto.prototype.decrypt;
    SubtleCrypto.prototype.decrypt = function (...args: Parameters<SubtleCrypto["decrypt"]>) {
      if ((window as unknown as { __breakSeal?: boolean }).__breakSeal) return Promise.reject(new DOMException("broken for the test", "OperationError"));
      return real.apply(this, args);
    } as SubtleCrypto["decrypt"];
  });
  await page.goto("/");
  await page.getByTestId("start").click();
  await page.getByTestId("name").fill("Аня");
  await page.getByTestId("age").fill("28");
  await page.getByRole("checkbox").check();
  await page.getByTestId("next").click();
  await page.getByTestId("pin").fill(PIN);
  await page.getByTestId("pin-again").fill(PIN);
  await page.getByTestId("register").click();
  await expect(page.locator('[data-screen="register-3"], [data-testid="error"]').first()).toBeVisible({ timeout: 30000 });
  if (await page.getByTestId("error").isVisible()) throw new Error(`registration refused: ${await page.getByTestId("error").textContent()}`);
  const code = (await page.getByTestId("paper-code").textContent())!.trim().split(" ");
  await page.getByTestId("paper-groups").locator("input").first().fill(code[1]);
  await page.getByTestId("paper-groups").locator("input").last().fill(code[3]);
  await page.evaluate(() => { (window as unknown as { __breakSeal?: boolean }).__breakSeal = true; });
  await page.getByTestId("confirm").click();

  const feed = page.locator('[data-screen="feed"]');
  await expect(feed).toBeVisible({ timeout: 30000 });
  await expect(feed).toHaveAttribute("data-sealed", "failed");
  const line = page.getByTestId("sealed-failed");
  await expect(line).toBeVisible();
  await expect(line, "an error line is announced as an alert").toHaveAttribute("role", "alert");
  await expect(line, "«ошибка:» first, then the cause in words").toContainText(/^ошибка: Не удалось убедиться/);
  await expect(feed).not.toContainText("печать хранилища");
});
