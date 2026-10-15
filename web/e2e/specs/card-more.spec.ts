// The card's rare actions sit behind «…» (strict review 11.10, card-more.svg): the face of the card holds the
// main row of one action — the like; «hide» stands first in the menu — and «block» appears only in the bottom sheet that «…»
// opens, red, last. sosed welds the row in one capsule (.ui-split); neighbro's row is its sticker pad
// (.heart-pad: the heart to drag).

import { expect, test } from "../fixtures/address.ts";
import { register, runLabel } from "./helpers.ts";

test("block and hide are behind «…»; the main row is the like alone", async ({ browser }) => {
  test.setTimeout(150_000);
  const phrase = `кто на рынок к десяти? ${runLabel()}`;
  const a = await (await browser.newContext()).newPage();
  await register(a);
  await a.getByTestId("write").click();
  await a.getByTestId("text").fill(phrase);
  await a.getByTestId("send").click();
  await expect(a.getByTestId("sent")).toHaveAttribute("data-state", "published", { timeout: 15000 });

  const b = await (await browser.newContext()).newPage();
  await register(b, { name: "Борис", age: "31" });
  await expect(b.getByTestId("loading")).toBeHidden({ timeout: 15000 });
  await b.getByTestId("card").filter({ hasText: phrase }).click();

  const card = b.locator('[data-screen="card"]');
  await expect(card).toBeVisible();
  await expect(b.getByTestId("block"), "block is not on the face of the card").toHaveCount(0);
  await expect(b.getByTestId("complain")).toHaveCount(0);
  await expect(b.getByTestId("report")).toHaveCount(0);
  await expect(card.locator(".ui-split button, .heart-pad button"), "the main row is the like alone").toHaveCount(1);
  await expect(b.getByTestId("hide"), "hide is not on the main row").toHaveCount(0);

  await b.getByTestId("more").click();
  await expect(b.getByTestId("more-sheet")).toBeVisible();
  await expect(b.getByTestId("hide"), "hide waits in the menu").toBeVisible();
  await expect(b.getByTestId("block")).toBeVisible();
  await expect(b.getByTestId("block"), "the dangerous item is styled danger").toHaveClass(/ui-danger/);

  await b.keyboard.press("Escape");
  await expect(b.getByTestId("more-sheet")).toHaveCount(0);
  await expect(b.getByTestId("block")).toHaveCount(0);
});
