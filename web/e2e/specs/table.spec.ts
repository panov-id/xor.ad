// A dots table in the web, all by the screen (W8, W11, W15): Женя sets it from
// the feed, Аня sits by its card and applies, Женя starts the game; whoever
// the node says moves takes an edge by clicking it, and the other one's screen
// shows it taken. The table's own link /t/<id> opens it after the PIN.

import { expect, test } from "../fixtures/address.ts";
import { newTable, openTables, pickTableGame, PIN, register, runLabel, unlock, twoAtATable } from "./helpers.ts";

// A table's name gets the model's verdict before the table is made (owner
// 13.10.2026: the model alone, no person queue; the stand's stub in
// docker-compose.web.yml refuses a messenger). Refused, the table is not made
// and the author reads why on the same screen; a clean name makes it.
test("a refused table name is said to the author at once, and a clean one makes the table", async ({ browser }) => {
  test.setTimeout(120_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  zhenya.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  await register(zhenya, { name: "Женя", age: "30" });
  const run = runLabel();
  // "тг" is the messenger as people write it: the model refuses the name.
  const made: number[] = [];
  zhenya.on("response", (r) => { if (new URL(r.url()).pathname === "/tables" && r.request().method() === "POST") made.push(r.status()); });
  await openTables(zhenya);
  await zhenya.getByTestId("new-table").click();
  await expect(zhenya.locator('[data-screen="new-table"]')).toBeVisible();
  await pickTableGame(zhenya, "dots", "2x2");
  await zhenya.getByTestId("new-table-name").fill(`пиши в тг ${run}`);
  await zhenya.getByTestId("new-table-next").click();
  await zhenya.getByTestId("new-table-go").click();
  await expect(zhenya.getByTestId("error"), "the author was not told the name was refused").toContainText("Имя не принято.", { timeout: 20000 });
  expect(made, "the model's refusal did not reach the author as a 422").toEqual([422]);
  await expect(zhenya.getByTestId("table")).toHaveCount(0);

  // The refusal brings the author back to the name (step 2); another name, and the table is made with it.
  await expect(zhenya.getByTestId("new-table-step")).toHaveAttribute("data-step", "2");
  await zhenya.getByTestId("new-table-name").fill(`точки ${run}`);
  await zhenya.getByTestId("new-table-next").click();
  await zhenya.getByTestId("new-table-go").click();
  const table = zhenya.getByTestId("table");
  await expect(table).toBeVisible({ timeout: 30000 });
  await expect(table).toContainText(`точки ${run}`);
  await expect(zhenya.getByTestId("turn")).toBeVisible();
  // The game has not begun: nothing to give up yet (П7), and the button starts it.
  await expect(zhenya.getByTestId("turn")).toContainText("партия ещё не началась");
  await zhenya.getByTestId("table-more").click();
  await expect(zhenya.getByTestId("table-menu")).toBeVisible();
  await expect(zhenya.getByTestId("resign")).toHaveCount(0);
  await zhenya.keyboard.press("Escape");
  await expect(zhenya.getByTestId("start-game")).toHaveAttribute("aria-label", "начать игру");
});

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
  // П31 · the move's clock is read like every other span («4 мин 58 с»), never as
  // bare seconds past a minute («298 с»).
  await expect(mover.getByTestId("turn")).toHaveText(/· (\d+ мин )?\d+ с$/);
  await expect(mover.getByTestId("turn")).not.toHaveText(/\d{3,} с/);
  await expect(other.locator("[data-taken]")).toHaveCount(0);
  // An edge is a button with a box of its own (W11), pressed as a person
  // presses it; its name says which edge.
  const edge = mover.getByRole("button", { name: /^линия: ряд \d+, колонка \d+, по (горизонтали|вертикали)$/ }).first();
  await expect(edge).toHaveAttribute("aria-label", /^линия: /);
  // A game under way can be given up; the header names the class in words (П1).
  // (giving up is behind the table's «…», with the other rare actions)
  await mover.getByTestId("table-more").click();
  await expect(mover.getByTestId("resign")).toBeVisible();
  await mover.keyboard.press("Escape");
  await expect(mover.getByTestId("table-menu")).toHaveCount(0);
  await expect(zhenya.locator("h1")).toContainText("точки");
  await expect(zhenya.locator("h1")).not.toContainText("dots");
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

// П17 · a set is shown by its dictionary word, never its id («36», «3x3»); П19 ·
// standing up from a table goes back to where the person came from (the feed or
// the tables tab), as «new table» does.
test("sets are named in words, and leaving a table returns to the feed or the tables tab", async ({ browser }) => {
  test.setTimeout(150_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });

  await openTables(zhenya);
  await zhenya.getByTestId("new-table").click();
  await expect(zhenya.locator('[data-screen="new-table"]')).toBeVisible();
  // Step 1: twelve games, each a card that names itself and how many play.
  await expect(zhenya.locator('[data-testid^="new-table-game-"]')).toHaveCount(12);
  // The whole card is one button (CardOpen): its name is the game, its description how many play.
  await expect(zhenya.getByTestId("new-table-game-durak")).toHaveAccessibleName("дурак");
  await expect(zhenya.getByTestId("new-table-game-durak")).toHaveAccessibleDescription(/2–6/);
  await zhenya.getByTestId("new-table-game-dots").click();
  await expect(zhenya.getByTestId("new-table-step")).toHaveAttribute("data-step", "2");
  await expect(zhenya.getByTestId("new-table-set").getByRole("radio")).toHaveText(["поле 3×3", "поле 2×2", "поле 4×4"]);
  // Back is the step before: the games again, and durak plays two variants on 2 to 6 seats
  // (owner 14.10.2026: podkidnoy and perevodnoy, both kept by the node).
  await zhenya.getByTestId("new-table-back").click();
  await zhenya.getByTestId("new-table-game-durak").click();
  await expect(zhenya.getByTestId("new-table-set").getByRole("radio")).toHaveText(["подкидной", "переводной"]);
  await zhenya.getByTestId("new-table-set-transfer").click();
  await expect(zhenya.getByTestId("new-table-set-transfer")).toHaveAttribute("aria-checked", "true");
  await expect(zhenya.getByTestId("new-table-seats").getByRole("radio")).toHaveText(["2", "3", "4", "5", "6"]);
  await zhenya.getByTestId("new-table-back").click();
  await zhenya.getByTestId("new-table-back").click();

  // A table is made from the tables tab only (owner 11.10.2026), so standing
  // up from a new one returns there; the way back to the feed is a table
  // entered from a feed card (sitFromFeed, other specs).
  await newTable(zhenya, { name: `выход ${runLabel()}`, kind: "dots", set: "2x2" });
  await zhenya.getByTestId("table-stand").click();
  await expect(zhenya.locator('[data-screen="tables"]')).toBeVisible({ timeout: 15000 });
});

// A sticker at the table (owner 13.10.2026; sheet adaptive-*-table-sticker-*): the eight in one strip
// under the board behind «say», one tap says it, and it lands on the sender's score on the other screen.
test("a sticker tapped at the table reaches the other player as its picture and its word", async ({ browser }) => {
  test.setTimeout(180_000);
  const zhenya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  const anya = await (await browser.newContext({ viewport: { width: 393, height: 851 } })).newPage();
  await register(zhenya, { name: "Женя", age: "30" });
  await register(anya, { name: "Аня", age: "28" });
  await twoAtATable(zhenya, anya, { name: `стикеры ${runLabel()}`, kind: "dots", set: "2x2" });
  // The strip opens under «say» (sheet adaptive-*-table-393: the foot is «leave · say»).
  await expect(zhenya.getByTestId("stickers")).toHaveCount(0);
  await zhenya.getByTestId("table-say").click();
  await expect(zhenya.getByTestId("stickers").getByRole("button")).toHaveCount(8);
  await zhenya.getByTestId("sticker-hi").click();
  // It lands on the sender's score for a moment, its picture named by who said it and its word,
  // and stays in the lines as words.
  const landed = anya.getByTestId("landed");
  await expect(landed, "the sticker did not reach the other player").toBeVisible({ timeout: 15000 });
  await expect(landed).toHaveAccessibleName("Женя — привет");
  await expect(landed.locator("svg.ui-sticker")).toBeVisible();
  await expect(anya.locator('[data-testid="line"][data-kind="sticker"]')).toContainText("Женя — привет");
});
