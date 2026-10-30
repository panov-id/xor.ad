// Poker's table (depth/core/tables_poker.ts, poker-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Poker, pokerOf, pokerView } from "../../../../depth/core/tables_poker.ts";
import { boardSlots, FELT, holeSlots, POT_AT, seatSlots } from "./poker-logic.ts";

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

// The prototype poker-turn draws the table as a 120 x 120 picture; these are its boxes, read off
// docs/newdesign/proto/poker-turn.html, in px of the 356.18 panel.
const U = 356.18 / 120;

test("the board: five slots 13.5 apart on the felt, the dealt cards and null for the rest", () => {
  const b = boardSlots(["10C", "9H", "7D"]);
  assert.equal(b.length, 5);
  assert.deepEqual(b.map((s) => s.card), ["10C", "9H", "7D", null, null]);
  near(b[0].at.x - b[0].at.w / 2, 27 * U); // rect x=27 y=42 12 x 17
  near(b[0].at.y - b[0].at.h / 2, 42 * U);
  near(b[1].at.x - b[0].at.x, 13.5 * U);
  near(b[0].at.w, 12 * U); near(b[0].at.h, 17 * U);
  assert.equal(boardSlots([]).every((s) => s.card === null), true);
  assert.equal(boardSlots(["AS", "KS", "QS", "JS", "10S"]).every((s) => s.card !== null), true);
  near(FELT.x, 60 * U); near(FELT.w, 100 * U); near(FELT.h, 62 * U); // rect x=10 y=22 100 x 62
  near(POT_AT.x - POT_AT.w / 2, 66 * U); near(POT_AT.y - POT_AT.h / 2, 63 * U); // the pot pill
});

test("the seats: mine at the bottom, the prototype's four left, top, right; two to six, never two on one place", () => {
  const four = seatSlots(4).map((s) => ({ x: s.avatar.x / U, y: s.avatar.y / U }));
  [[60, 96], [14, 50], [60, 12], [106, 50]].forEach(([x, y], i) => { near(four[i].x, x, 0.001); near(four[i].y, y, 0.001); });
  for (const n of [2, 3, 4, 5, 6]) {
    const s = seatSlots(n);
    assert.equal(s.length, n);
    assert.equal(new Set(s.map((p) => `${p.avatar.x}:${p.avatar.y}`)).size, n, `${n} seats, ${n} places`);
    near(s[0].avatar.y, 96 * U, 0.001);
    s.flatMap((p) => [p.avatar, ...p.backs, p.stack]).forEach((c) => assert.ok(c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= 356.18, `${n} seats fit the panel`));
  }
  const top = seatSlots(4)[2], left = seatSlots(4)[1];
  near(top.backs[0].x - top.backs[0].w / 2, 53 * U); near(top.backs[0].y - top.backs[0].h / 2, 19 * U); // rect x=53 y=19 7 x 10
  near(top.backs[1].x - top.backs[1].w / 2, 59 * U);
  near(top.stack.y - top.stack.h / 2, -2 * U); // on the top row the pill rides above the avatar
  near(left.stack.y - left.stack.h / 2, 59 * U); // elsewhere under it, over the backs
});

test("my two cards: under my avatar, turned -6 and 6 about their bottom middles at 52.5 and 66.5, y 118", () => {
  const h = holeSlots(2);
  [[52.5, -6], [66.5, 6]].forEach(([px, r], i) => {
    near(h[i].r, r, 0.001);
    const t = (h[i].r * Math.PI) / 180;
    near(h[i].x / U - (h[i].h / U / 2) * Math.sin(t), px, 0.01);
    near(h[i].y / U + (h[i].h / U / 2) * Math.cos(t), 118, 0.01);
  });
});
