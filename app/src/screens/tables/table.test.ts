// The table frame's rules (table-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableView } from "../../../../depth/core/tables.ts";
import { STICKER_IDS } from "../../../../depth/core/sticker.ts";
import { diceOf, diceStep, dotsLayout, facePair, firstAction, fourColumns, hangmanView, keyRows, pipsOf, reversiCells, squares, tapSquare, meLine, MOVE_SECONDS, moveRing, STICKER_CHIPS, tableTitle } from "./table-logic.ts";

const NOW = 1_800_000_000_000;
const view = (over: Partial<TableView> = {}, board: Partial<NonNullable<TableView["board"]>> | null = {}): TableView => ({
  id: "t", class: "grid", set: "four", seat: 1, is_playing: true, playing: 2, watching: 1, like_count: 0, lines: [],
  seats: [{ seat: 1, name: "Alex", role: "playing" }, { seat: 2, name: "Nino", role: "playing" }, { seat: 3, name: "Dato", role: "watching" }],
  board: board === null ? null : { seq: 4, state: {}, turn: 1, score: {}, expires_at: NOW / 1000 + 100, pending: null, ...board },
  ...over,
});

test("the ring: whole minutes of the move left, rounded up, as a share of five; none without a clock", () => {
  assert.equal(MOVE_SECONDS, 300);
  assert.deepEqual(moveRing(view({}, { expires_at: NOW / 1000 + 100 }), NOW), { minutes: 2, share: 100 / 300 });
  assert.equal(moveRing(view({}, { expires_at: NOW / 1000 + 1 }), NOW)?.minutes, 1, "a second left is a minute");
  assert.equal(moveRing(view({}, { expires_at: NOW / 1000 + 900 }), NOW)?.share, 1, "never more than the five");
  assert.equal(moveRing(view({}, { expires_at: null }), NOW), null);
  assert.equal(moveRing(view({}, null), NOW), null);
  assert.equal(moveRing(view({}, { over: true }), NOW), null);
});
test("the title: the game, then the table's own name", () => {
  assert.equal(tableTitle("Four in a row", "Evening at the yard"), "Four in a row · Evening at the yard");
  assert.equal(tableTitle("Dots"), "Dots");
});
test("the faces: mine left, the one whose turn right; a watcher sees the first player left; watchers never", () => {
  assert.deepEqual([facePair(view()).left?.name, facePair(view()).right?.name], ["Alex", "Nino"]);
  const three = view({ seats: [...view().seats, { seat: 4, name: "Ana", role: "playing" }] }, { turn: 4 });
  assert.equal(facePair(three).right?.name, "Ana", "the one whose turn it is, not the next seat");
  const watching = view({ is_playing: false, seat: 3 });
  assert.deepEqual([facePair(watching).left?.name, facePair(watching).right?.name], ["Alex", "Nino"]);
});
test("my line: your move, their move by name, before a game, over; a watcher is told no «you»", () => {
  assert.deepEqual(meLine(view()), { who: "you", state: "your-move" });
  assert.deepEqual(meLine(view({}, { turn: 2 })), { who: "you", state: "their-move", name: "Nino" });
  assert.equal(meLine(view({}, { turn: null })).state, "not-started");
  assert.equal(meLine(view({}, null)).state, "not-started");
  assert.equal(meLine(view({}, { over: true })).state, "over");
  assert.deepEqual(meLine(view({ is_playing: false, seat: 3 })), { who: "name", name: "Alex", state: "watching" });
});
test("the foot: begin while nothing runs, say during a game, the like for a watcher", () => {
  assert.equal(firstAction(view({}, { turn: null })), "start");
  assert.equal(firstAction(view({}, { turn: null, pending: { kind: "rematch", id: "p" } })), "like", "a proposal pending: not begin again");
  assert.equal(firstAction(view()), "say");
  assert.equal(firstAction(view({ is_playing: false, seat: 3 })), "like");
  assert.equal(firstAction(view({}, { over: true })), "start", "after an end: again");
});

test("four in a row: columns a..g, top row first; a column with its top taken takes no piece; mine is my seat's", () => {
  const cells: Record<string, { seat: number; piece: string }> = { d1: { seat: 1, piece: "O" }, d2: { seat: 2, piece: "O" } };
  for (let r = 1; r <= 6; r++) cells[`g${r}`] = { seat: r % 2 ? 1 : 2, piece: "O" };
  const cols = fourColumns({ cells, rules: "four" }, 1);
  assert.deepEqual(cols.map((c) => c.column).join(""), "abcdefg");
  assert.deepEqual(cols[3].cells, ["free", "free", "free", "free", "theirs", "mine"], "row 6 on top, row 1 at the bottom");
  assert.equal(cols[3].open, true);
  assert.equal(cols[6].open, false, "a full column");
  assert.deepEqual(fourColumns({ cells, rules: "four" }, 2)[3].cells.slice(4), ["mine", "theirs"], "seen from the other seat");
});

test("the sticker chips: hi, coffee, deal first as the sheets; the whole catalogue, each once", () => {
  assert.deepEqual(STICKER_CHIPS.slice(0, 3), ["hi", "coffee", "deal"]);
  assert.deepEqual([...STICKER_CHIPS].sort(), [...STICKER_IDS].sort());
});

test("dots: every edge of an n×n field once, taken as the node says; a closed box is mine by my seat", () => {
  const l = dotsLayout({ n: 4, edges: ["h:4:0", "v:0:4"], boxes: { "1:1": 1, "3:3": 2 } }, 1);
  assert.equal(l.edges.length, 2 * 4 * 5, "40 edges on a 4×4 field");
  assert.equal(new Set(l.edges.map((e) => e.id)).size, 40);
  assert.deepEqual(l.edges.filter((e) => e.taken).map((e) => e.id).sort(), ["h:4:0", "v:0:4"]);
  assert.deepEqual(l.edges.find((e) => e.id === "v:0:4"), { id: "v:0:4", dir: "v", r: 0, c: 4, taken: true });
  assert.deepEqual(l.boxes, [{ r: 1, c: 1, stand: "mine" }, { r: 3, c: 3, stand: "theirs" }]);
});

test("hangman keys: English as QWERTY (three rows), another alphabet ten to a row in its order, none given is English", () => {
  assert.deepEqual(keyRows([..."abcdefghijklmnopqrstuvwxyz"]).map((r) => r.join("")), ["qwertyuiop", "asdfghjkl", "zxcvbnm"]);
  assert.deepEqual(keyRows(null).map((r) => r.length), [10, 9, 7]);
  const ru = [..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя"];
  assert.deepEqual(keyRows(ru).map((r) => r.length), [10, 10, 10, 3]);
  assert.equal(keyRows(ru).flat().join(""), ru.join(""), "every letter once, in order");
});
test("hangman: the guesser in turn guesses, the setter in turn sets; the mask's _ is a hidden slot; tried letters are used", () => {
  const w = { setter: 2, alphabet: null, word: null, mask: "ka__e", guessed: ["k", "a", "e", "q"], misses: 1 };
  const g = hangmanView(w, 1, true);
  assert.equal(g.mode, "guess");
  assert.deepEqual(g.slots, ["k", "a", null, null, "e"]);
  assert.deepEqual(g.rows[0].filter((k) => k.used).map((k) => k.letter), ["q", "e"]);
  assert.equal(hangmanView(w, 1, false).mode, "wait");
  assert.equal(hangmanView(w, 2, true).mode, "wait", "the setter never guesses their own word, even in turn");
  assert.equal(hangmanView({ ...w, mask: null }, 2, true).mode, "set", "no word yet: the setter in turn sets it");
  assert.equal(hangmanView({ ...w, mask: null }, 1, true).mode, "wait");
  assert.deepEqual(hangmanView({ ...w, word: "kalle" }, 2, false).slots, ["k", "a", "l", "l", "e"], "the setter sees the word whole");
});

test("reversi: 64 cells, rank 8 first; a legal cell is one that turns a piece of theirs, as the node's rule", () => {
  // the opening: mine on d5, e4; theirs on d4, e5 (relay newReversi with me low)
  const open = { cells: { d5: { seat: 1, piece: "O" }, e4: { seat: 1, piece: "O" }, d4: { seat: 2, piece: "O" }, e5: { seat: 2, piece: "O" } }, rules: "reversi" };
  const cells = reversiCells(open, 1);
  assert.equal(cells.length, 64);
  assert.deepEqual([cells[0].id, cells[63].id], ["a8", "h1"]);
  assert.deepEqual(cells.filter((c) => c.legal).map((c) => c.id).sort(), ["c4", "d3", "e6", "f5"], "the four opening moves of the first seat");
  assert.equal(cells.find((c) => c.id === "d5")?.stand, "mine");
  assert.equal(cells.find((c) => c.id === "d4")?.legal, false, "a taken cell is never a move");
  // a run of theirs that reaches the edge without mine behind it turns nothing
  const edge = { cells: { a1: { seat: 2, piece: "O" }, b1: { seat: 2, piece: "O" } }, rules: "reversi" };
  assert.equal(reversiCells(edge, 1).find((c) => c.id === "c1")?.legal, false);
});

test("checkers and chess squares: 64, tinted where the men stand (a1, b8 — the node's start), a chess letter, none for a pawn or a man", () => {
  const g = { cells: { a8: { seat: 2, piece: "R" }, b7: { seat: 2, piece: "P" }, d4: { seat: 1, piece: "M" } } };
  const sq = squares(g, 1);
  assert.equal(sq.length, 64);
  assert.deepEqual([sq[0].id, sq[0].tint, sq[1].id, sq[1].tint], ["a8", false, "b8", true]);
  assert.equal(sq.find((s) => s.id === "a1")?.tint, true, "a1 is where the node sets the first man");
  assert.equal(sq.filter((s) => s.tint).length, 32);
  assert.deepEqual(["a8", "b7", "d4"].map((id) => sq.find((s) => s.id === id)?.letter), ["R", "", ""]);
  assert.equal(sq.find((s) => s.id === "d4")?.stand, "mine");
});
test("a tap: my piece picks it (twice drops it); picked, a square not mine is the move; mine again picks that one", () => {
  const g = { cells: { d4: { seat: 1, piece: "M" }, c3: { seat: 1, piece: "M" }, e5: { seat: 2, piece: "M" } } };
  assert.deepEqual(tapSquare(g, 1, null, "d4"), { picked: "d4" });
  assert.deepEqual(tapSquare(g, 1, "d4", "d4"), { picked: null });
  assert.deepEqual(tapSquare(g, 1, "d4", "c3"), { picked: "c3" }, "another of mine: picks that one, no move");
  assert.deepEqual(tapSquare(g, 1, "d4", "e5"), { picked: null, move: { from: "d4", to: "e5" } }, "onto theirs: the move (a take)");
  assert.deepEqual(tapSquare(g, 1, "d4", "d5"), { picked: null, move: { from: "d4", to: "d5" } });
  assert.deepEqual(tapSquare(g, 1, null, "e5"), { picked: null }, "nothing picked: theirs does nothing");
});

test("dice: pips as dice are drawn (5 the corners and the middle, 6 two columns); my turn rolls, then says the move is made", () => {
  assert.deepEqual(pipsOf(5), [0, 2, 4, 6, 8]);
  assert.deepEqual(pipsOf(6), [0, 2, 3, 5, 6, 8]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((f) => pipsOf(f).length), [1, 2, 3, 4, 5, 6]);
  assert.equal(diceStep({ rolled: null, claim: null }, true), "roll");
  assert.equal(diceStep({ rolled: [5, 3], claim: null }, true), "moved");
  assert.equal(diceStep({ rolled: [5, 3], claim: null }, false), null);
  assert.deepEqual(diceOf({ dice: { rolled: [5, 3], claim: null } })?.rolled, [5, 3]);
  assert.equal(diceOf({ grid: {} }), null);
});
