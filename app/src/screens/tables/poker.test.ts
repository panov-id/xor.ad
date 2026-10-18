// Poker's table (depth/core/tables_poker.ts, poker-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Poker, pokerOf, pokerView } from "../../../../depth/core/tables_poker.ts";
import { boardSlots, seatSlots } from "./poker-logic.ts";

const poker = (over: Partial<Poker> = {}): Poker => ({
  chips: { "1": 900, "2": 850, "3": 1000 }, button: 2, hand: 3, street: "flop", board: ["10C", "9H", "7D"],
  holes: { "1": ["AS", "KH"], "2": { count: 2 }, "3": { count: 2 } }, bets: { "1": 0, "2": 2, "3": 6 }, pot: 20, current: 6, min_raise: 12, folded: [3], to_act: 1, last: null, ...over,
});
const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test("the state: a poker table is read only whole", () => {
  assert.equal(pokerOf({}), null);
  assert.equal(pokerOf({ poker: { chips: {} } }), null);
  assert.ok(pokerOf({ poker: poker() }));
});

test("the view: seats round the table from mine; stacks, bets, dealer, folded, whose turn", () => {
  const v = pokerView(poker(), 2, false);
  assert.deepEqual(v.seats.map((s) => s.seat), [2, 3, 1], "mine first, then the order of the deal");
  assert.deepEqual(v.seats.map((s) => s.chips), [850, 1000, 900]);
  assert.deepEqual(v.seats.map((s) => s.dealer), [true, false, false]);
  assert.deepEqual(v.seats.map((s) => s.folded), [false, true, false]);
  assert.deepEqual(v.seats.map((s) => s.turn), [false, false, true]);
  assert.deepEqual(v.seats.map((s) => s.mine), [true, false, false]);
  assert.deepEqual(pokerView(poker(), 9, false).seats.map((s) => s.seat), [1, 2, 3], "a watcher sees the natural order");
});

test("my cards: whole when they are an array, none when only a number; the watcher has none", () => {
  assert.deepEqual(pokerView(poker(), 1, true).hole, ["AS", "KH"]);
  assert.equal(pokerView(poker(), 2, true).hole, null);
  assert.equal(pokerView(poker(), 9, true).hole, null);
});

test("the actions: only the seat the node names, in my turn; a call costs what is owed but never more than I hold", () => {
  assert.equal(pokerView(poker(), 1, true).acts, true);
  assert.equal(pokerView(poker(), 1, false).acts, false, "not my turn");
  assert.equal(pokerView(poker({ to_act: 3 }), 1, true).acts, false, "another seat is to act");
  const owing = pokerView(poker(), 1, true);
  assert.deepEqual([owing.owe, owing.toCall], [6, 6]);
  assert.equal(pokerView(poker({ bets: { "1": 6, "2": 2, "3": 6 } }), 1, true).owe, 0, "nothing owed: check");
  assert.deepEqual([pokerView(poker({ chips: { "1": 4, "2": 850, "3": 1000 } }), 1, true).owe, pokerView(poker({ chips: { "1": 4, "2": 850, "3": 1000 } }), 1, true).toCall], [6, 4], "a short stack calls all it has");
  assert.equal(owing.minRaise, 12);
});

test("the board: five slots 59.7 apart, the dealt cards face up and the rest backs", () => {
  const b = boardSlots(["10C", "9H", "7D"]);
  assert.equal(b.length, 5);
  assert.deepEqual(b.map((s) => s.card), ["10C", "9H", "7D", null, null]);
  near(b[1].at.x - b[0].at.x, 59.7);
  near(b[0].at.x - b[0].at.w / 2, 35.81);
  assert.equal(boardSlots([]).every((s) => s.card === null), true);
  assert.equal(boardSlots(["AS", "KS", "QS", "JS", "10S"]).every((s) => s.card !== null), true);
});

test("the seats: two to six, mine at the bottom left, the rest clockwise, never two on one place", () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const s = seatSlots(n);
    assert.equal(s.length, n);
    assert.equal(new Set(s.map((p) => `${p.x}:${p.y}`)).size, n, `${n} seats, ${n} places`);
    assert.deepEqual(s[0], { x: 45.76, y: 207.33 }, "mine");
  }
  assert.deepEqual(seatSlots(4), [{ x: 45.76, y: 207.33 }, { x: 222.86, y: 207.33 }, { x: 232.8, y: 15.91 }, { x: 55.71, y: 15.91 }], "the sheet's four corners");
  assert.deepEqual(seatSlots(6).map((p) => p.y), [207.33, 207.33, 207.33, 15.91, 15.91, 15.91], "three to a row");
});
