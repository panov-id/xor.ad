// The table frame's rules (table-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableView } from "../../../../depth/core/tables.ts";
import { STICKER_IDS } from "../../../../depth/core/sticker.ts";
import { dotsLayout, facePair, firstAction, fourColumns, meLine, MOVE_SECONDS, moveRing, STICKER_CHIPS, tableTitle } from "./table-logic.ts";

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
