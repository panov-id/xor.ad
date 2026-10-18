// Chapayev's board and aim (depth/core/tables_physics.ts, chapayev-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { flickTo, physicsOf, screenAt } from "../../../../depth/core/tables_physics.ts";
import { aimLine, chapayevCells, seatIndex } from "./chapayev-logic.ts";

// The node's newPhysics for two seats: six pieces on row 0 (seat 1) and row 7 (seat 2), x 1..6.
const two = { cells: Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((x) => [[`${x}:0`, 1], [`${x}:7`, 2]])) };

test("a flick to a target: along a row, a column or a diagonal, 1..7 cells; anything else is no flick", () => {
  assert.deepEqual(flickTo("3:0", "3:3"), { piece: "3:0", dir: [0, 1], power: 3 });
  assert.deepEqual(flickTo("3:3", "0:3"), { piece: "3:3", dir: [-1, 0], power: 3 });
  assert.deepEqual(flickTo("3:3", "5:1"), { piece: "3:3", dir: [1, -1], power: 2 }, "a diagonal");
  assert.deepEqual(flickTo("0:0", "7:7"), { piece: "0:0", dir: [1, 1], power: 7 }, "the longest");
  assert.equal(flickTo("3:0", "4:2"), null, "a knight's step is on no line");
  assert.equal(flickTo("3:0", "3:0"), null, "to where it stands");
  assert.equal(flickTo("3:0", "8:0"), null, "off the board");
  assert.equal(flickTo("x", "3:3"), null);
});

test("the state: a physics board is read only whole", () => {
  assert.equal(physicsOf({}), null);
  assert.equal(physicsOf({ physics: 3 }), null);
  assert.deepEqual(physicsOf({ physics: two })?.cells["3:0"], 1);
});

test("my edge is the bottom: seat n of the node sits on row 0, row 7, column 0, column 7", () => {
  assert.deepEqual(screenAt(3, 0, 0), { col: 3, row: 7 }, "first seat: row 0 at the bottom");
  assert.deepEqual(screenAt(3, 7, 1), { col: 4, row: 7 }, "second seat: row 7 at the bottom, turned half round");
  assert.equal(screenAt(0, 4, 2).row, 7, "third seat: column 0 at the bottom");
  assert.equal(screenAt(7, 4, 3).row, 7, "fourth seat: column 7 at the bottom");
  for (const n of [0, 1, 2, 3]) {
    const seen = new Set<string>();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { const s = screenAt(x, y, n); seen.add(`${s.col}:${s.row}`); }
    assert.equal(seen.size, 64, `seat ${n}: every cell lands on its own screen cell`);
  }
});

test("cells: 64 from the top left; mine at the bottom row for either seat, the other's at the top", () => {
  const a = chapayevCells(two, 1, 0);
  assert.equal(a.length, 64);
  assert.deepEqual(a.slice(0, 8).map((c) => c.stand), ["free", "theirs", "theirs", "theirs", "theirs", "theirs", "theirs", "free"], "row 7 on top");
  assert.deepEqual(a.slice(56).map((c) => c.id), ["0:0", "1:0", "2:0", "3:0", "4:0", "5:0", "6:0", "7:0"]);
  assert.equal(a[57].stand, "mine");
  const b = chapayevCells(two, 2, 1);
  assert.deepEqual(b.slice(56).map((c) => c.stand), ["free", "mine", "mine", "mine", "mine", "mine", "mine", "free"], "the second seat has its own row at the bottom");
  assert.equal(b[0].id, "7:0", "and the first seat's row at the top, turned round");
});

test("the aim: from the centre of the piece's cell to the target's, on the seat's screen", () => {
  assert.deepEqual(aimLine("3:0", "3:3", 0), { x1: 3.5, y1: 7.5, x2: 3.5, y2: 4.5 });
  assert.deepEqual(aimLine("3:7", "3:4", 1), { x1: 4.5, y1: 7.5, x2: 4.5, y2: 4.5 }, "the same flick on the other seat's screen goes up too");
});

test("a seat's index among the playing seats; unknown sits at the bottom", () => {
  assert.equal(seatIndex([1, 3, 4], 3), 1);
  assert.equal(seatIndex([1, 3], 9), 0);
  assert.equal(seatIndex(undefined, 1), 0);
});
