// Playing alone while waiting (solo-logic.ts, chat spec §6.2). scripts/run-app-unit-tests.sh, node:test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GAMES } from "../../../../depth/core/new_table.ts";
import {
  allEdges, bestOf, closedBoxes, dotsPuzzle, dotsStatus, drawLine, FLEET, isShip, keepSolo, loadSolo, SEA_N, seaPuzzle, seaStatus, shoot, SOLO_GAMES, soloOf, soloShown, withSolo,
} from "./solo-logic.ts";

test("solo games name only games of the table set (depth/core GAMES), and backgammon has none (§6.2)", () => {
  const ids = GAMES.map((g) => g.id);
  for (const g of Object.keys(SOLO_GAMES)) assert.ok(ids.includes(g), `${g} is not a table game`);
  assert.equal(soloOf("backgammon"), null);
  assert.equal(soloOf("dots"), "dots");
  assert.equal(soloOf(undefined), null);
});

test("a dots puzzle: the same number gives the same board, its best is reachable, and closing the best solves it", () => {
  const p = dotsPuzzle(5);
  assert.deepEqual(dotsPuzzle(5), p, "the same seed drew another puzzle");
  assert.notDeepEqual(dotsPuzzle(6).given, p.given, "the next puzzle is the same board");
  assert.ok(p.best >= 1 && p.lines === 3);
  assert.equal(closedBoxes(new Set(p.given)), 0, "a puzzle starts with a box already closed");
  assert.equal(bestOf(p.given, p.lines), p.best);
  // Find a winning choice by trying them, as a person would, and play it line by line.
  const free = allEdges().filter((e) => !p.given.includes(e));
  let won: string[] | null = null;
  for (let a = 0; a < free.length && !won; a++) for (let b = a + 1; b < free.length && !won; b++) for (let c = b + 1; c < free.length && !won; c++) {
    if (closedBoxes(new Set([...p.given, free[a], free[b], free[c]])) >= p.best) won = [free[a], free[b], free[c]];
  }
  assert.ok(won, "no choice of lines reaches the best");
  let play = { drawn: [] as string[] };
  for (const e of won!) play = drawLine(p, play, e);
  assert.ok(dotsStatus(p, play).solved, "the best closed and the puzzle is not solved");
  assert.ok(dotsStatus(p, play).over);
});

test("dots: a given line, a repeated one and one past the last change nothing", () => {
  const p = dotsPuzzle(9);
  const empty = { drawn: [] as string[] };
  assert.equal(drawLine(p, empty, p.given[0]), empty);
  const free = allEdges().filter((e) => !p.given.includes(e));
  const one = drawLine(p, empty, free[0]);
  assert.equal(drawLine(p, one, free[0]), one);
  assert.equal(drawLine(p, empty, "h9,9"), empty);
});

test("a sea puzzle: the fleet is whole, inside, and no ship touches another even at a corner", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = seaPuzzle(seed);
    assert.deepEqual(p.ships.map((s) => s.length).sort(), [...FLEET].sort());
    const owner = new Map<number, number>();
    p.ships.forEach((s, i) => s.forEach((x) => owner.set(x, i)));
    for (const [x, i] of owner) {
      assert.ok(x >= 0 && x < SEA_N * SEA_N);
      const r = Math.floor(x / SEA_N), c = x % SEA_N;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= SEA_N || nc < 0 || nc >= SEA_N) continue;
        const o = owner.get(nr * SEA_N + nc);
        assert.ok(o === undefined || o === i, `seed ${seed}: two ships touch at ${x}`);
      }
    }
  }
});

test("sea: every ship cell shot sinks the fleet; a repeated shot does not count", () => {
  const p = seaPuzzle(3);
  let play = { shots: [] as number[] };
  play = shoot(p, play, 0);
  assert.equal(shoot(p, play, 0), play, "a repeated shot counted");
  for (const x of p.ships.flat()) play = shoot(p, play, x);
  const s = seaStatus(p, play);
  assert.ok(s.over && s.sunk === p.ships.length);
  assert.equal(s.hits, p.ships.flat().length);
  assert.equal(isShip(p, p.ships[0][0]), true);
});

test("the device keeps one solo game per table; a broken save starts afresh", () => {
  const box = new Map<string, string>();
  const store = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
  assert.deepEqual(loadSolo("t1", store), { seed: 1 });
  keepSolo("t1", { seed: 4, dots: { drawn: ["h0,0"] } }, store);
  assert.deepEqual(loadSolo("t1", store), { seed: 4, dots: { drawn: ["h0,0"] } });
  assert.deepEqual(loadSolo("t2", store), { seed: 1 }, "another table took this table's puzzle");
  box.set("solo.v1.t3", "{broken");
  assert.deepEqual(loadSolo("t3", store), { seed: 1 });
});

test("the solo board shows only on one's own table with nobody else playing and no round under way", () => {
  assert.equal(soloShown({ is_playing: true, playing: 1, board: null }), true);
  assert.equal(soloShown({ is_playing: true, playing: 1, board: { over: true, turn: 1 } }), true, "after a round, alone again");
  assert.equal(soloShown({ is_playing: true, playing: 2, board: null }), false, "a second player sat in");
  assert.equal(soloShown({ is_playing: true, playing: 2, board: { turn: 1 } }), false, "a round under way");
  assert.equal(soloShown({ is_playing: false, playing: 1, board: null }), false, "a watcher plays nothing alone");
});

test("a neighbour's row says playing alone first when the card is marked (owner 2026-10-25: «пусть видят»)", () => {
  assert.equal(withSolo("1 of 2 seated · 0 watching", true, "playing alone"), "playing alone · 1 of 2 seated · 0 watching");
  assert.equal(withSolo("1 of 2 seated · 0 watching", false, "playing alone"), "1 of 2 seated · 0 watching");
  assert.equal(withSolo("1 of 2 seated · 0 watching", undefined, "playing alone"), "1 of 2 seated · 0 watching");
});

// Review 26.10 (correctness lens): the puzzle only ever opened on the node's mark, so after a round (startRound clears the
// mark) it came back on the device unmarked; a refused mark left it open too. Table.tsx is checked by its text.
test("Table.tsx follows the node's solo mark both ways and takes back a refused one", () => {
  const screen = readFileSync(new URL("./Table.tsx", import.meta.url), "utf8");
  assert.match(screen, /useEffect\(\(\) => \{ setSoloOpen\(!!view\?\.solo\); \}, \[view\?\.solo\]\)/, "the puzzle opens on the mark but never closes when the node clears it");
  assert.match(screen, /if \(refusalOf\(a\)\) setSoloOpen\(!on\)/, "a refused mark leaves the puzzle open with no mark on the node");
});
