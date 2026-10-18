// Durak's table (depth/core/tables_deck.ts, cards.ts, durak-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardParts, isRed } from "../../../../depth/core/cards.ts";
import { type DeckState, deckOf, durakActions, isDurak } from "../../../../depth/core/tables_deck.ts";
import { durakView, handFan, handShift, oppFan, pairSlots, panelHeight } from "./durak-logic.ts";

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

test("the opponent's fan: 25.87 apart from the left, 5° more a card, about the middle; it narrows when long", () => {
  const f = oppFan(5);
  assert.deepEqual(f.map((c) => c.r), [-10, -5, 0, 5, 10]);
  near(f[1].x - f[0].x, 25.87);
  near(f[0].x, 62.68);
  assert.equal(f[0].y, 47.94);
  const long = oppFan(18);
  assert.ok(long[17].x <= 225 + 0.001, "ends before the stock");
  near(oppFan(1)[0].r, 0);
  assert.equal(oppFan(0).length, 0);
  near(oppFan(2, 1)[0].y, 47.94 + 70, 0.001);
});

test("my hand: six cards touching, angles 18.08 12.82 7.59 either side, the outer ones lower; a longer hand narrows", () => {
  const h = handFan(6);
  [-18.08, -12.82, -7.59, 7.59, 12.82, 18.08].forEach((r, i) => near(h[i].r, r, 0.03));
  near(h[0].y, 274.0, 0.1);
  near(h[2].y, 266.0, 0.1);
  near(h[3].x - h[2].x, 49.8);
  assert.ok(h[0].r < 0 && h[5].r > 0, "left cards lean left, right cards right");
  const wide = handFan(12);
  assert.ok(wide[11].x + 49.5 / 2 <= 356.18, "twelve cards fit the panel");
  near(wide[1].x - wide[0].x, 300 / 12);
  assert.deepEqual(handFan(1).map((c) => c.r), [0]);
  assert.equal(handFan(0).length, 0);
});

test("the pairs: three to a row, the beating card down right and turned more; a second row lower, and the panel with it", () => {
  const slots = pairSlots([{ attack: "6H", beat: "10H" }, { attack: "7S", beat: null }, { attack: "8S", beat: null }, { attack: "9S", beat: null }], 1);
  near(slots[1].attack.x - slots[0].attack.x, 109.45);
  near(slots[0].beat!.x - slots[0].attack.x, 13.95);
  assert.equal(slots[1].beat, null, "unbeaten: one card");
  near(slots[3].attack.y - slots[0].attack.y, 106);
  assert.equal(slots[3].attack.x, slots[0].attack.x, "the fourth begins the second row");
  near(panelHeight(2, 1), 320.36);
  near(panelHeight(4, 1), 320.36 + 106);
  near(panelHeight(0, 1), 320.36, 0.001);
  near(panelHeight(3, 2), 320.36 + 70);
  near(handShift(4, 1), 106);
});
