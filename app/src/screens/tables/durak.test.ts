// Durak's table (depth/core/tables_deck.ts, cards.ts, durak-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardParts, isRed } from "../../../../depth/core/cards.ts";
import { type DeckState, deckOf, durakActions, isDurak } from "../../../../depth/core/tables_deck.ts";
import { type Placed } from "./cards-logic.ts";
import { durakView, handFan, handShift, oppFan, pairSlots, panelHeight, stockAt, stockCountAt, trumpAt } from "./durak-logic.ts";

const deck = (over: Partial<DeckState> = {}): DeckState => ({
  hands: { "1": ["9S", "8H", "7D", "6S", "10S", "QH"], "2": { count: 5 } }, stock: { count: 14 }, played: [], trump: "10D",
  table: [{ attack: "6H", beat: "10H" }], attacker: 1, defender: 2, ...over,
});
const near = (a: number, b: number, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test("cards: rank and suit; ten written 10 or T; red are hearts and diamonds; anything else is no card", () => {
  assert.deepEqual(cardParts("10S"), { rank: "10", suit: "S" });
  assert.deepEqual(cardParts("TH"), { rank: "10", suit: "H" });
  assert.deepEqual(cardParts("QD"), { rank: "Q", suit: "D" });
  assert.equal(cardParts("1S"), null);
  assert.equal(cardParts("6X"), null);
  assert.equal(cardParts(""), null);
  assert.deepEqual(["S", "H", "D", "C"].map((s) => isRed(s as "S")), [false, true, true, false]);
});

test("the state: durak has a trump and a table; the old generic deck has neither", () => {
  assert.equal(deckOf({}), null);
  assert.ok(isDurak(deck()));
  assert.equal(isDurak(deck({ trump: undefined })), false);
  assert.equal(isDurak({ ...deck(), table: undefined }), false);
});

test("take: the defender, with something on the table, in turn; nobody else", () => {
  assert.equal(durakActions(deck(), 2, true).take, true);
  assert.equal(durakActions(deck(), 2, false).take, false, "not my turn");
  assert.equal(durakActions(deck(), 1, true).take, false, "the attacker does not take");
  assert.equal(durakActions(deck({ table: [] }), 2, true).take, false, "nothing on the table");
});

test("done: whoever holds the window — the thrower, else the attacker — once everything is beaten", () => {
  assert.equal(durakActions(deck(), 1, true).done, true);
  assert.equal(durakActions(deck({ table: [{ attack: "6H", beat: null }] }), 1, true).done, false, "a card unbeaten");
  assert.equal(durakActions(deck({ thrower: 3 }), 1, true).done, false, "the window is another's");
  assert.equal(durakActions(deck({ thrower: 3 }), 3, true).done, true);
});

test("transfer (perevodnoy): the defender, nothing beaten, the lowest non-trump card of the led rank", () => {
  const led = deck({ transfer: true, table: [{ attack: "7S", beat: null }], hands: { "1": [], "2": ["7D", "7H", "8H"] }, trump: "9D" });
  assert.equal(durakActions(led, 2, true).transfer, "7H", "the trump seven 7D is the last to be spent");
  assert.equal(durakActions({ ...led, transfer: false }, 2, true).transfer, undefined, "not perevodnoy");
  assert.equal(durakActions({ ...led, table: [{ attack: "7S", beat: "8S" }] }, 2, true).transfer, undefined, "a pair is beaten already");
  assert.equal(durakActions(led, 1, true).transfer, undefined, "only the defender");
  assert.equal(durakActions({ ...led, hands: { "1": [], "2": ["8H", "9H"] } }, 2, true).transfer, undefined, "no card of the rank");
});

test("the view: the others' hand sizes in seat order, my cards, the pairs, the stock, the trump", () => {
  const v = durakView(deck({ hands: { "3": ["9S"], "1": ["6S", "7S"], "2": { count: 4 } } }), 1);
  assert.deepEqual(v.opps, [{ seat: 2, count: 4 }, { seat: 3, count: 1 }]);
  assert.deepEqual(v.hand, ["6S", "7S"]);
  assert.equal(v.stock, 14);
  assert.equal(v.trump, "10D");
  assert.deepEqual(durakView(deck({ hands: { "1": { count: 6 }, "2": { count: 5 } } }), 3).hand, [], "a watcher holds nothing");
});

// The prototype durak-turn draws the table as a 120 x 110 picture; these are its card boxes (x, y, w, h and the pivot of a
// turn, the middle of the bottom edge), read off docs/newdesign/proto/durak-turn.html, in px of the 356.18 panel.
const U = 356.18 / 120;
/** Undo a turn about the bottom middle: the pivot the prototype names for a card centred at c, in its units. */
const pivotOf = (c: Placed) => ({ x: c.x / U - (c.h / U / 2) * Math.sin((c.r * Math.PI) / 180), y: c.y / U + (c.h / U / 2) * Math.cos((c.r * Math.PI) / 180) });

test("the opponents' fans: one row along the top, up to four upright backs 4 apart, the fans 30 apart", () => {
  const fans = [0, 1, 2].map((i) => oppFan(5, i, 3));
  fans.forEach((f) => assert.equal(f.length, 4, "four backs shown, the count rides on data-count"));
  near(fans[0][0].x, 26 * U); // the prototype's first back: rect x=21 w=10
  near(fans[1][0].x - fans[0][0].x, 30 * U);
  near(fans[0][1].x - fans[0][0].x, 4 * U);
  fans.flat().forEach((c) => { near(c.y, 10 * U); near(c.w, 10 * U); near(c.h, 14 * U); assert.equal(c.r, 0); });
  assert.equal(oppFan(2, 0, 3).length, 2, "a short hand shows what it has");
  assert.equal(oppFan(0).length, 0);
  const five = [0, 1, 2, 3, 4].map((i) => oppFan(6, i, 5)).flat();
  assert.ok(five.every((c) => c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= 356.18), "five opponents still fit the panel");
});

test("the stock on the left, the trump a quarter turn under it, the count pill below", () => {
  const s = stockAt(), t = trumpAt(), n = stockCountAt();
  near(s.x, 17 * U); near(s.y, 48 * U); // rect x=10 y=38 14 x 20
  assert.equal(t.r, 90);
  const p = pivotOf(t);
  near(p.x, 13, 0.01); near(p.y, 60, 0.01); // rotate(90 13 60)
  near(n.x, 15 * U); near(n.y, 67 * U); near(n.w, 18 * U);
});

test("my hand: six cards 14 apart, turned -12.5 to 12.5 about their bottom middles at y 102; a long hand fits", () => {
  const h = handFan(6);
  [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5].forEach((r, i) => {
    near(h[i].r, r, 0.001);
    const p = pivotOf(h[i]);
    near(p.x, 25.5 + 14 * i, 0.01); near(p.y, 102, 0.01);
  });
  near(h[0].w, 15 * U); near(h[0].h, 22 * U);
  const wide = handFan(14);
  assert.ok(wide.every((c) => c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= 356.18), "fourteen cards fit the panel");
  assert.deepEqual(handFan(1).map((c) => c.r), [0]);
  assert.equal(handFan(0).length, 0);
});

test("the pairs: 26 apart, three to a row, the beating card turned 12 over the attack; a second row grows the panel", () => {
  const slots = pairSlots([{ attack: "6H", beat: "10H" }, { attack: "7S", beat: null }, { attack: "8S", beat: null }, { attack: "9S", beat: null }]);
  near(slots[0].attack.x, 41 * U); near(slots[0].attack.y, 40 * U); // rect x=34 y=30
  near(slots[1].attack.x - slots[0].attack.x, 26 * U);
  const b = pivotOf(slots[0].beat!);
  near(slots[0].beat!.r, 12); near(b.x, 46, 0.01); near(b.y, 56, 0.01); // rotate(12 46 56)
  assert.equal(slots[1].beat, null, "unbeaten: one card");
  assert.equal(slots[3].attack.x, slots[0].attack.x, "the fourth begins the second row");
  near(slots[3].attack.y - slots[0].attack.y, 26 * U);
  near(panelHeight(2), 110 * U);
  near(panelHeight(4), 136 * U);
  near(handShift(4), 26 * U);
  near(handShift(1), 0, 0.001);
});
