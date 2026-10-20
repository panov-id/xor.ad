// Battleship's view (depth/core/tables_sea.ts, sea-logic.ts). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFleet, type Sea, seaOf, seaView } from "../../../../depth/core/tables_sea.ts";
import { canShoot, ownCells, shotCells } from "./sea-logic.ts";

const sea = (over: Partial<Sea> = {}): Sea => ({
  phase: "shoot",
  fleets: { "1": [["a1", "a2"], ["c1"]], "2": { placed: true } },
  shots: { "1": { b2: "sunk", c2: "hit", d2: "sunk", f9: "miss" }, "2": { a2: "hit", b6: "miss" } },
  ...over,
});

test("the fleet typed: ships by «;», cells by spaces or commas, a1..j10 only", () => {
  assert.deepEqual(parseFleet("a1 a2; C1"), [["a1", "a2"], ["c1"]]);
  assert.deepEqual(parseFleet("a1,a2 ;; j10"), [["a1", "a2"], ["j10"]]);
  assert.equal(parseFleet("k1"), null);
  assert.equal(parseFleet("a11"), null);
  assert.equal(parseFleet("a0"), null);
  assert.equal(parseFleet("  ;  "), null);
});

test("the state: a sea is read only whole", () => {
  assert.equal(seaOf({}), null);
  assert.equal(seaOf({ sea: { phase: "later", fleets: {}, shots: {} } }), null);
  assert.ok(seaOf({ sea: sea() }));
});

test("my view: my fleet whole, the other's only as placed; their shots on my sea, mine on theirs; a watcher sees nothing", () => {
  const v = seaView(sea(), 1, true)!;
  assert.deepEqual(v.ships, [["a1", "a2"], ["c1"]]);
  assert.deepEqual(v.mine, { b2: "sunk", c2: "hit", d2: "sunk", f9: "miss" });
  assert.deepEqual(v.theirs, { a2: "hit", b6: "miss" });
  const other = seaView(sea(), 2, false)!;
  assert.equal(other.ships, null, "the other's fleet is only {placed}");
  assert.deepEqual(other.mine, { a2: "hit", b6: "miss" });
  assert.equal(seaView(sea(), 3, false), null);
});

test("placing: mine to place only before a fleet, in my turn, in the placing phase", () => {
  const place = sea({ phase: "place", fleets: { "1": { placed: false }, "2": { placed: false } }, shots: { "1": {}, "2": {} } });
  assert.equal(seaView(place, 1, true)!.toPlace, true);
  assert.equal(seaView(place, 1, false)!.toPlace, false, "not my turn");
  assert.equal(seaView(sea({ ...place, fleets: { "1": [["a1"]], "2": { placed: false } } }), 1, true)!.toPlace, false, "already placed");
  assert.equal(seaView(sea(), 1, true)!.toPlace, false, "the shots have begun");
});

test("shots: a hundred cells from a1, a found ship joins its found neighbours into one bar, a miss joins nothing", () => {
  const cells = shotCells(seaView(sea(), 1, true)!);
  assert.equal(cells.length, 100);
  assert.deepEqual(cells.slice(0, 11).map((c) => c.id), ["a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1", "i1", "j1", "a2"], "row by row");
  const by = Object.fromEntries(cells.map((c) => [c.id, c]));
  assert.equal(by.b2.join, "r", "b2 goes on over to c2");
  assert.equal(by.c2.join, "r l");
  assert.equal(by.d2.join, "l");
  assert.equal(by.f9.join, "");
  assert.equal(by.a1.result, null);
  const vertical = shotCells(seaView(sea({ shots: { "1": { g5: "sunk", g6: "hit", g7: "sunk" }, "2": {} } }), 1, true)!);
  assert.equal(vertical.find((c) => c.id === "g6")!.join, "d u");
});

test("a tap: a free cell, in the shots, in my turn", () => {
  const v = seaView(sea(), 1, true)!;
  const cells = shotCells(v);
  assert.equal(canShoot(v, cells.find((c) => c.id === "h1")!, true), true);
  assert.equal(canShoot(v, cells.find((c) => c.id === "h1")!, false), false, "not my turn");
  assert.equal(canShoot(v, cells.find((c) => c.id === "f9")!, true), false, "shot already");
  const place = seaView(sea({ phase: "place" }), 1, true)!;
  assert.equal(canShoot(place, shotCells(place)[0], true), false, "before the shots");
});

test("my own sea: my ships, and what the other's shots found", () => {
  const own = Object.fromEntries(ownCells(seaView(sea(), 1, false)!).map((c) => [c.id, c]));
  assert.deepEqual(Object.values(own).filter((c) => c.ship).map((c) => c.id), ["a1", "c1", "a2"], "row by row");
  assert.equal(own.a2.shot, "hit");
  assert.equal(own.b6.shot, "miss");
  assert.equal(own.j10.shot, null);
});
