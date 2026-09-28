// A dots table in the web, all by the screen (W8, W11, W15): Женя sets it from
// the feed, Аня sits by its card and applies, Женя starts the game; whoever
// the node says moves takes an edge by clicking it, and the other one's screen
// shows it taken. The table's own link /t/<id> opens it after the PIN.

import { expect, test } from "../fixtures/address.ts";
import { PIN, register, runLabel, unlock, twoAtATable } from "./helpers.ts";

test("a dots game begun on the screen, a move on one screen shows on the other, and the link opens it after the PIN", async ({ browser }) => {
  test.setTimeout(180_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });
  await twoAtATable(zhenya, anya, { name: `точки ${runLabel()}`, kind: "dots", set: "2x2" });
  await expect(zhenya.getByTestId("dots")).toBeVisible();
  await expect(zhenya.getByTestId("table")).toContainText("сидят");

  // Whoever's turn it is sees "ваш ход"; the other one the name.
  const mover = (await zhenya.getByTestId("turn").textContent())!.startsWith("ваш ход") ? zhenya : anya;
  const other = mover === zhenya ? anya : zhenya;
  await expect(mover.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  await expect(other.locator("[data-taken]")).toHaveCount(0);
  // An edge is a button with a box of its own (W11), pressed as a person
  // presses it; its name says which edge.
  const edge = mover.getByRole("button", { name: /^ребро [hv]:\d+:\d+$/ }).first();
  await expect(edge).toHaveAttribute("aria-label", /^ребро /);
  await edge.click();
  await expect(other.locator("[data-taken]")).toHaveCount(1, { timeout: 15000 });
  await expect(other.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });

  // The table's own link, after a reload: the PIN, then the same table.
  const id = (await zhenya.getByTestId("table").getAttribute("data-id"))!;
  await zhenya.evaluate(() => sessionStorage.clear());
  await zhenya.goto(`/t/${id}`);
  await unlock(zhenya, PIN);
  await expect(zhenya.getByTestId("table")).toHaveAttribute("data-id", id, { timeout: 30000 });
  await expect(zhenya.locator("[data-taken]")).toHaveCount(1, { timeout: 15000 });
});
