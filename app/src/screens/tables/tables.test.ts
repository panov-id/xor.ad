// The tables' pure part (tables-logic.ts) and what it stands on (depth/core/new_table.ts, shared with the web's NewTable):
// the wizard's steps, the body of POST /tables, the counts a card says, the words for a game. scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GAMES, gameOfTable, makeTableWords, nameLeft, refusalCode, seatsWord, tableBody, tableCounts } from "../../../../depth/core/new_table.ts";
import { pathOf, seatScreen } from "../../router.ts";
import { apart, back, canNext, freshTables, mergeTables, nameRefused, next, pick, START_GAMES, startWizard, subParts, toneAt } from "./tables-logic.ts";

test("the twelve games, in the sheets' order, each with a variant and a seat the node plays", () => {
  assert.deepEqual(GAMES.map((g) => g.id), ["dots", "checkers", "chess", "durak", "hangman", "backgammon", "dominoes", "chapayev", "reversi", "four", "battleship", "poker"]);
  for (const g of GAMES) { assert.ok(g.sets.length > 0, g.id); assert.ok(g.seats.length > 0, g.id); }
  assert.equal(seatsWord([2]), "2");
  assert.equal(seatsWord([2, 3, 4, 5, 6]), "2–6");
});

test("a table of a card's class and set is its game: deck 36 is durak, deck poker is poker, grid chess is chess", () => {
  assert.equal(gameOfTable("deck", "36")?.id, "durak");
  assert.equal(gameOfTable("deck", "transfer")?.id, "durak");
  assert.equal(gameOfTable("deck", "poker")?.id, "poker");
  assert.equal(gameOfTable("grid", "chess")?.id, "chess");
  assert.equal(gameOfTable("dots", "4x4")?.id, "dots");
  assert.equal(gameOfTable("word", "ru")?.id, "hangman");
  assert.equal(gameOfTable("grid", "go"), undefined);
  assert.equal(gameOfTable(undefined, undefined), undefined);
});

test("tableCounts: who sits, how many seats the table has, who watches; no negative number", () => {
  assert.deepEqual(tableCounts({ id: "a", playing: 3, free_seats: 1, watching: 1 }), { seated: 3, seats: 4, watching: 1 });
  assert.deepEqual(tableCounts({ id: "b", playing: 2, free_seats: 0, watching: 3 }), { seated: 2, seats: 2, watching: 3 });
  assert.deepEqual(tableCounts({ id: "c" }), { seated: 0, seats: 0, watching: 0 });
  assert.deepEqual(tableCounts({ id: "d", playing: -1, free_seats: -2, watching: -3 }), { seated: 0, seats: 0, watching: 0 });
});

test("the wizard: no «Next» before a game is picked; a pick takes its first variant and fewest seats; back from step 1 leaves", () => {
  let w = startWizard();
  assert.equal(w.step, 1);
  assert.equal(canNext(w), false);
  assert.deepEqual(next(w), w, "«Next» went on with no game");
  w = pick(w, "durak");
  assert.deepEqual(w.draft, { game: "durak", set: "36", seats: 2, name: "" });
  assert.equal(canNext(w), true);
  assert.equal(pick(w, "no-such-game"), w, "a game the wizard does not have was picked");
  w = next(w);
  assert.equal(w.step, 2);
  w = next(w);
  assert.equal(w.step, 3);
  assert.equal(canNext(w), false, "step 3 has no «Next»: it has «Sit at the table»");
  assert.equal(next(w), w);
  w = back(w)!;
  assert.equal(w.step, 2);
  w = back(w)!;
  assert.equal(w.step, 1);
  assert.equal(back(w), null, "Back from step 1 stays in the wizard");
  assert.equal(nameRefused({ ...w, step: 3 }).step, 2, "a refused name is mended where it is typed");
});

test("tableBody: the node's own fields, a name only when there is one, nothing while a choice is missing or not the game's", () => {
  const at = { lat: 41.7, lon: 44.8 };
  assert.equal(tableBody(startWizard().draft, at, 1000), null);
  const d = { ...pick(startWizard(), "dots").draft, set: "4x4", name: "  Evening at the yard " };
  assert.deepEqual(tableBody(d, at, 1000), { class: "dots", set: "4x4", seats: 2, lat: 41.7, lon: 44.8, area_radius: 1000, name: "Evening at the yard" });
  assert.deepEqual(tableBody({ ...d, name: "   " }, at, 1000), { class: "dots", set: "4x4", seats: 2, lat: 41.7, lon: 44.8, area_radius: 1000 });
  assert.equal(tableBody({ ...d, set: "chess" }, at, 1000), null, "a variant of another game was sent");
  assert.equal(tableBody({ ...d, seats: 5 }, at, 1000), null, "five seats at a dots table were sent");
  const durak = pick(startWizard(), "durak").draft;
  assert.equal(tableBody({ ...durak, seats: 6 }, at, 3000)?.seats, 6);
  assert.equal(tableBody({ ...durak, set: "transfer" }, at, 3000)?.set, "transfer");
});

test("nameLeft counts letters, not bytes, down to nothing; refusalCode reads the node's code or the status", () => {
  assert.equal(nameLeft(""), 24);
  assert.equal(nameLeft("Вечер во дворе"), 10);
  assert.equal(nameLeft("x".repeat(30)), 0);
  assert.equal(refusalCode({ status: 422, body: { error: { code: "name_refused" } } } as never), "name_refused");
  assert.equal(refusalCode({ status: 503, body: null } as never), "503");
});

test("the words: a game by its dictionary name, a variant by its rules; an id with no word shows as itself", () => {
  const dict: Record<string, string> = {
    "web.class.dots": "dots", "web.class.word": "hangman", "web.class.free": "dominoes", "web.set.chess": "chess", "web.set.backgammon": "backgammon",
    "web.set.field": "{n}×{n} field", "web.game.durak": "durak", "web.newTable.podkidnoy": "podkidnoy", "web.newTable.perevodnoy": "perevodnoy",
  };
  const say = (k: string, v?: Record<string, string | number>) => (dict[k] ?? k).replaceAll("{n}", String(v?.n ?? ""));
  const w = makeTableWords(say);
  const game = (id: string) => GAMES.find((g) => g.id === id)!;
  assert.equal(w.gameName(game("dots")), "dots");
  assert.equal(w.gameName(game("hangman")), "hangman");
  assert.equal(w.gameName(game("chess")), "chess");
  assert.equal(w.gameName(game("durak")), "durak");
  assert.equal(w.variantWord("durak", "transfer"), "perevodnoy");
  assert.equal(w.variantWord("durak", "36"), "podkidnoy");
  assert.equal(w.variantWord("dots", "4x4"), "4×4 field");
  assert.equal(w.setWord("go"), "go");
  assert.equal(w.classWord("nothing"), "nothing");
});

test("subParts drops a part that says what another did: «backgammon · backgammon» is one word", () => {
  assert.equal(subParts(["Backgammon", "backgammon", "1 of 2 seated"]), "Backgammon · 1 of 2 seated");
  assert.equal(subParts([null, "3×3 field", "2 of 2 seated"]), "3×3 field · 2 of 2 seated");
  assert.equal(subParts([false, undefined, "x"]), "x");
});

test("toneAt: lime, yellow, peach, lilac, round again — the sheets' order, also for a negative index", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 11].map(toneAt), ["lime", "yellow", "peach", "lilac", "lime", "yellow", "lilac"]);
  assert.equal(toneAt(-1), "lilac");
});

test("mergeTables: the first page replaces the list, one after the cursor joins it without a table seen twice; apart leaves out the person's own", () => {
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  assert.deepEqual(mergeTables([c], [a, b]), [a, b]);
  assert.deepEqual(mergeTables([a, b], [b, c], "cursor"), [a, b, c]);
  assert.deepEqual(apart([a, b, c], [b]), [a, c]);
});

test("the seat's own addresses: /tables the list, /tables/new the wizard, a trailing slash ignored; the tab bar's paths are the same", () => {
  assert.deepEqual(seatScreen("/tables"), { at: "tables" });
  assert.deepEqual(seatScreen("/tables/"), { at: "tables" });
  assert.deepEqual(seatScreen("/tables/new"), { at: "new-table" });
  assert.deepEqual(seatScreen("/tables/whatever"), { at: "feed" }, "an address the shell does not know is the feed");
  assert.equal(pathOf({ at: "tables" }), "/tables");
  assert.equal(pathOf({ at: "new-table" }), "/tables/new");
});

test("«Start a game»: the wide sheets' six, in their order, each a game the node sets up; a pick lands on the wizard's first step", () => {
  assert.deepEqual(START_GAMES, ["backgammon", "durak", "chess", "dots", "dominoes", "poker"]);
  for (const id of START_GAMES) assert.ok(GAMES.some((g) => g.id === id), id);
  const w = pick(startWizard(), "durak");
  assert.deepEqual([w.step, w.draft.game], [1, "durak"]);
});

// Crowd run flow-1026-070519: the list loaded once, on mount; a guest on the screen never saw the table a neighbour made.
test("an open list looks again: the first page alone is replaced, after more pages the new tables go on top", () => {
  const a = { id: "a" } as never, b = { id: "b" } as never, c = { id: "c" } as never, d = { id: "d" } as never;
  assert.deepEqual(freshTables([a, b], [c, a], false), [c, a], "with one page the look replaces the list");
  assert.deepEqual(freshTables([a, b, d], [c, a], true), [c, a, b, d], "after more pages the scrolled tables are lost or doubled");
  const screen = readFileSync(new URL("./Tables.tsx", import.meta.url), "utf8");
  assert.match(screen, /useEvery\(TABLES_LOOK_MS,[\s\S]*?freshTables\(/, "Tables.tsx loads the list once and never looks again");
});

// tables.html: four tiles fill the list panel two by two, so even one or two tables keep the half-height tile, not a full-height one.
test("the tables list keeps the prototype's two tile rows: .k-tb-grid has two template rows in kit.css", () => {
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  const rule = /\.k-tb-grid \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(rule, /grid-template-rows: repeat\(2, /, ".k-tb-grid lost its two rows: a lone table stretches over the whole panel");
});

// new-table-2: the name is the bare pill (pen, words inside, count at the right); the label is hidden for the eye, kept for the reader.
test("the new table's name field is new-table-2's bare pill: hidden label, placeholder, count at the right", () => {
  const src = readFileSync(new URL("./NewTable.tsx", import.meta.url), "utf8");
  const field = /<div className="k-tb-name">([\s\S]*?)<\/div>/.exec(src)?.[1] ?? "";
  assert.match(field, /placeholder=\{say\("app\.nt\.name"\)\}/, "NewTable.tsx: the name pill has no words inside");
  assert.match(field, /side=\{<span className="k-meta" data-testid="new-table-left">/, "NewTable.tsx: the count left the pill's right side");
  const css = readFileSync(new URL("../../../tokens/kit.css", import.meta.url), "utf8");
  assert.match(css, /\.k-tb-name > \.k-field-wrap > label \{[^}]*clip: rect\(0 0 0 0\)/, "kit.css: the name's label shows above the pill again");
});
