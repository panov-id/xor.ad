// The node's own-rules games at a web table (owner 13.10.2026): reversi, four in
// a row, battleship, poker and durak. Each test seats two people by the screen
// (twoAtATable), lets whoever the node says moves make one legal move the way a
// person does — a tap on a cell or a column, a typed fleet, a button — and
// reads it on the other person's screen. The rules are the node's
// (relay/node/src/lib/tables_{reversi,sea,poker,deck}.ts); here only that the
// screen offers the move and draws what the node cut for each seat.

import { expect, test, type Page } from "../fixtures/address.ts";
import { register, runLabel, twoAtATable } from "./helpers.ts";

const FLEET = "a1 a2 a3 a4; c1 c2 c3; e1 e2 e3; a6 a7; c6 c7; e6 e7; h1; h3; h5; h7";

// Two registered people at a started table of this class and set.
async function seated(browser: import("@playwright/test").Browser, kind: string, set: string, label: string) {
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });
  await twoAtATable(zhenya, anya, { name: `${label} ${runLabel()}`, kind, set });
  return { zhenya, anya };
}

// [the one whose turn it is, the other], once the node has named them.
async function movers(a: Page, b: Page): Promise<[Page, Page]> {
  const mine = async (p: Page) => ((await p.getByTestId("turn").textContent()) ?? "").startsWith("ваш ход");
  await expect.poll(async () => (await mine(a)) !== (await mine(b)), { message: "exactly one of the two has the move", timeout: 15000 }).toBe(true);
  return (await mine(a)) ? [a, b] : [b, a];
}

test("reversi: a tap on a free cell is the move, and the other board shows the piece and the flipped one", async ({ browser }) => {
  test.setTimeout(180_000);
  const { zhenya, anya } = await seated(browser, "grid", "reversi", "реверси");
  const [mover, other] = await movers(zhenya, anya);
  for (const page of [mover, other]) await expect(page.getByTestId("reversi").locator("[data-cell]")).toHaveCount(64);
  // The first seat is dark with d5 and e4; c4 turns d4.
  await expect(mover.getByTestId("reversi").locator('[data-cell="d4"]')).toHaveAttribute("aria-label", "d4: фишка соперника");
  await expect(mover.getByTestId("reversi-count")).toHaveText("ваших фишек: 2, фишек соперника: 2");
  await mover.getByTestId("reversi").locator('[data-cell="c4"]').click();
  await expect(other.getByTestId("reversi").locator('[data-cell="c4"]'), "the piece did not reach the other board").toHaveAttribute("aria-label", "c4: фишка соперника", { timeout: 15000 });
  await expect(other.getByTestId("reversi").locator('[data-cell="d4"]')).toHaveAttribute("aria-label", "d4: фишка соперника");
  await expect(mover.getByTestId("reversi").locator('[data-cell="c4"]')).toHaveAttribute("aria-label", "c4: ваша фишка");
  await expect(other.getByTestId("reversi-count")).toHaveText("ваших фишек: 1, фишек соперника: 4");
  await expect(other.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
});

test("four in a row: a column button drops the piece to the lowest cell, and the other board shows it", async ({ browser }) => {
  test.setTimeout(180_000);
  const { zhenya, anya } = await seated(browser, "grid", "four", "четыре");
  const [mover, other] = await movers(zhenya, anya);
  await expect(mover.getByTestId("four-columns").getByRole("button")).toHaveCount(7);
  await mover.getByRole("button", { name: "колонка d" }).click();
  await expect(other.getByTestId("four"), "the piece did not reach the other board").toHaveAttribute("aria-label", /d1: фишка соперника/, { timeout: 15000 });
  await expect(mover.getByTestId("four")).toHaveAttribute("aria-label", /d1: ваша фишка/);
  await expect(other.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  // The second piece in the column lands above the first.
  await other.getByRole("button", { name: "колонка d" }).click();
  await expect(mover.getByTestId("four")).toHaveAttribute("aria-label", /d2: фишка соперника/, { timeout: 15000 });
});

test("battleship: the fleet is typed and kept from the other, then a tap on a cell shoots and the hit shows on the owner's fleet", async ({ browser }) => {
  test.setTimeout(240_000);
  const { zhenya, anya } = await seated(browser, "grid", "battleship", "морской бой");
  const [first, second] = await movers(zhenya, anya);
  // A fleet that cannot be read is said on the screen, before the node is asked.
  await expect(first.getByTestId("fleet-hint")).toContainText(FLEET);
  await first.getByTestId("fleet-input").fill("a1 a2 zz");
  await first.getByTestId("fleet-go").click();
  await expect(first.getByTestId("fleet-bad")).toBeVisible();
  await first.getByTestId("fleet-input").fill(FLEET);
  await first.getByTestId("fleet-go").click();
  await expect(first.getByTestId("fleet-waiting")).toBeVisible({ timeout: 15000 });
  await expect(first.getByTestId("sea-mine")).toHaveAttribute("aria-label", /e1: ваш корабль/);
  // The other one sees nothing of it: no grid of ships, only their own input.
  await expect(second.getByTestId("sea-mine")).toHaveCount(0);
  await expect(second.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  await second.getByTestId("fleet-input").fill(FLEET);
  await second.getByTestId("fleet-go").click();
  await expect(first.getByTestId("sea-shots").locator("[data-cell]")).toHaveCount(100, { timeout: 15000 });
  await expect(second.getByTestId("sea-shots").locator("[data-cell]")).toHaveCount(100, { timeout: 15000 });

  const [shooter, target] = await movers(first, second);
  await shooter.getByTestId("sea-shots").locator('[data-cell="e1"]').click();
  await expect(shooter.getByTestId("sea-shots").locator('[data-cell="e1"]')).toHaveAttribute("aria-label", "e1: попадание", { timeout: 15000 });
  await expect(target.getByTestId("sea-mine"), "the shot did not reach the owner's fleet").toHaveAttribute("aria-label", /e1: попадание/, { timeout: 15000 });
  // A hit keeps the turn; a miss passes it.
  await expect(shooter.getByTestId("turn")).toContainText("ваш ход");
  await shooter.getByTestId("sea-shots").locator('[data-cell="j10"]').click();
  await expect(shooter.getByTestId("sea-shots").locator('[data-cell="j10"]')).toHaveAttribute("aria-label", "j10: мимо", { timeout: 15000 });
  await expect(target.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
});

test("poker: own two cards, a call moves the chips to the pot, and the other seat gets the move", async ({ browser }) => {
  test.setTimeout(180_000);
  const { zhenya, anya } = await seated(browser, "deck", "poker", "покер");
  const [mover, other] = await movers(zhenya, anya);
  for (const page of [mover, other]) {
    await expect(page.getByTestId("hole").getByRole("button")).toHaveCount(2);
    await expect(page.getByTestId("pot")).toHaveText("банк: 30");
    await expect(page.getByTestId("poker-seats").locator("li")).toHaveCount(2);
  }
  // Not the mover's: no actions on the other screen.
  await expect(other.getByTestId("poker-call")).toHaveCount(0);
  // The first to act owes the rest of the big blind: check is not offered, call is.
  await expect(mover.getByTestId("poker-check")).toBeDisabled();
  await mover.getByTestId("poker-call").click();
  await expect(other.getByTestId("pot"), "the call did not reach the other screen").toHaveText("банк: 40", { timeout: 15000 });
  await expect(other.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  await expect(other.getByTestId("poker-check")).toBeEnabled();
  await expect(other.getByTestId("poker-call")).toBeDisabled();
  // The caller's stack is 980 with a bet of 20, and a raise is typed as a number.
  await expect(other.getByTestId("poker-seats")).toContainText("фишки 980 · ставка 20");
  await other.getByTestId("raise-input").fill("60");
  await other.getByTestId("raise-go").click();
  await expect(mover.getByTestId("pot"), "the raise did not reach the other screen").toHaveText("банк: 80", { timeout: 15000 });
  await expect(mover.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
});

test("durak: the trump and the pairs on the table, a lead reaches the defender, who takes it", async ({ browser }) => {
  test.setTimeout(180_000);
  const { zhenya, anya } = await seated(browser, "deck", "36", "дурак");
  const [attacker, defender] = await movers(zhenya, anya);
  const defenderName = defender === zhenya ? "Женя" : "Аня";
  for (const page of [attacker, defender]) {
    await expect(page.getByTestId("trump")).toContainText("козырь: ");
    await expect(page.getByTestId("roles")).toContainText("атакует: ");
    await expect(page.getByTestId("hand").getByRole("button")).toHaveCount(6);
  }
  // Nothing to take or to end before a card is led.
  await expect(attacker.getByTestId("take")).toHaveCount(0);
  await expect(attacker.getByTestId("done")).toHaveCount(0);
  const card = attacker.getByTestId("hand").getByRole("button").first();
  const label = (await card.textContent())!.trim();
  await card.click();
  await expect(defender.getByTestId("pairs").locator("li"), "the lead did not reach the defender").toHaveText(`${label}, ещё не побита`, { timeout: 15000 });
  await expect(defender.getByTestId("turn")).toContainText("ваш ход", { timeout: 15000 });
  await expect(defender.getByTestId("take")).toBeVisible();
  await expect(attacker.getByTestId("take")).toHaveCount(0);
  await defender.getByTestId("take").click();
  // The defender holds the six and the lead; the attacker draws back to six.
  await expect(attacker.getByTestId("others"), "the take did not reach the attacker").toHaveText(`${defenderName}: 7`, { timeout: 15000 });
  await expect(attacker.getByTestId("hand").getByRole("button")).toHaveCount(6, { timeout: 15000 });
  await expect(attacker.getByTestId("pairs")).toHaveCount(0);
});
