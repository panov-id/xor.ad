// A deck table in the web, all by the screen (W12, W15): the node deals six
// each; a seat sees its own hand and the other's as a number (§6.1). Whoever
// the node says moves plays a card by pressing it; the other screen shows the
// card on the table and one card fewer in the mover's hand.

import { expect, test } from "../fixtures/address.ts";
import { register, twoAtATable } from "./helpers.ts";

test("a deck table: my hand is cards, the other's a number, and a played card shows on both screens", async ({ browser }) => {
  test.setTimeout(180_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });
  await twoAtATable(zhenya, anya, { name: `карты ${Date.now().toString(36)}`, kind: "deck", set: "36" });

  for (const page of [zhenya, anya]) {
    await expect(page.getByTestId("hand").getByRole("button")).toHaveCount(6, { timeout: 15000 });
    await expect(page.getByTestId("stock")).toHaveText("колода: 24");
  }
  const zhenyaMoves = (await zhenya.getByTestId("turn").textContent())!.startsWith("ваш ход");
  const [mover, other, moverName] = zhenyaMoves ? [zhenya, anya, "Женя"] : [anya, zhenya, "Аня"];
  await expect(other.getByTestId("others")).toHaveText(`${moverName}: 6`);
  const card = mover.getByTestId("hand").getByRole("button").first();
  const label = (await card.textContent())!.trim();
  await card.click();
  await expect(other.getByTestId("played")).toHaveText(`на столе: ${label}`, { timeout: 15000 });
  await expect(other.getByTestId("others")).toHaveText(`${moverName}: 5`, { timeout: 15000 });
  await expect(mover.getByTestId("hand").getByRole("button")).toHaveCount(5, { timeout: 15000 });
});
