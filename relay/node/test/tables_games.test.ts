// The games added 13.10.2026 (owner: more varied games in alpha), through the
// engine itself — startState, stepGame, passGame — and the one place that cuts
// what is hidden, boardFor. No database: the rules are pure. The routes that
// carry them are exercised in tables.test.ts.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { passGame, startState, stepGame, turnAfter } from "../src/lib/tables_engine.ts";
import { boardFor, type GameState } from "../src/lib/tables.ts";
import { fleetFault } from "../src/lib/tables_sea.ts";
import { best, compare } from "../src/lib/tables_poker.ts";

// deno-lint-ignore no-explicit-any
type Seen = { state: Record<string, any> };
const view = (s: GameState, viewer: number | null) =>
  boardFor({ state: s, seq: 1, pending: null, turn_due: null }, {}, false, viewer) as unknown as Seen;
const reason = (step: ReturnType<typeof stepGame>) => ("refused" in step ? step.refused : null);

// Applies a move as the routes do: the step, then the turn where it says.
function play(s: GameState, set: string, seat: number, move: unknown) {
  assertEquals(s.order[s.turn!], seat, `not seat ${seat}'s turn but ${s.order[s.turn!]}'s`);
  const step = stepGame(s, set, move, false, seat);
  if ("refused" in step) return step;
  s.board.push({ seat, move: step.shown });
  s.turn = turnAfter(s, s.turn!, step);
  return step;
}
const ok = (step: ReturnType<typeof stepGame>) => {
  assert(!("refused" in step), `refused: ${reason(step)}`);
  return step as Exclude<typeof step, { refused: string }>;
};

// --- reversi -----------------------------------------------------------------

Deno.test("reversi: the start, a move must turn a piece, turned pieces change sides, the end counts pieces", () => {
  const s = startState("grid", "reversi", [1, 2]);
  assertEquals(Object.keys(s.grid!.cells).length, 4);
  assertEquals(reason(stepGame(s, "reversi", { to: "a1" }, false, 1)), "the piece must turn at least one of the other's");
  assertEquals(reason(stepGame(s, "reversi", { to: "d4" }, false, 1)), "the cell is taken");
  assertEquals(reason(stepGame(s, "reversi", { from: "d4" }, false, 1)), "a move is {to} on a1..h8");
  ok(play(s, "reversi", 1, { to: "d3" }));
  assertEquals(s.grid!.cells.d4.seat, 1, "d4 is turned to the mover");
  assertEquals(s.order[s.turn!], 2);
  // A position one move from the end: seat 1 fills h8 and turns g8, nobody can move.
  const cells: Record<string, { seat: number; piece: string }> = {};
  for (const f of "abcdefgh") for (let r = 1; r <= 8; r++) cells[`${f}${r}`] = { seat: 1, piece: "O" };
  delete cells.h8;
  cells.g8 = { seat: 2, piece: "O" };
  s.grid!.cells = cells;
  s.turn = 0;
  const end = ok(play(s, "reversi", 1, { to: "h8" }));
  assertEquals([end.over, end.scores], [true, [{ seat: 1, points: 1 }]], "the full board is over, more pieces win");
});

// --- four in a row ----------------------------------------------------------

Deno.test("four in a row: pieces fall, a full column is refused, four across wins", () => {
  const s = startState("grid", "four", [1, 2]);
  ok(play(s, "four", 1, { column: "a" }));
  ok(play(s, "four", 2, { column: "a" }));
  assertEquals([s.grid!.cells.a1.seat, s.grid!.cells.a2.seat], [1, 2], "the second piece lands on the first");
  assertEquals(reason(stepGame(s, "four", { column: "h" }, false, 1)), "a move is {column} a..g");
  for (let i = 0; i < 4; i++) ok(play(s, "four", s.order[s.turn!], { column: "a" }));
  assertEquals(reason(stepGame(s, "four", { column: "a" }, false, s.order[s.turn!])), "the column is full");
  const t = startState("grid", "four", [1, 2]);
  let last;
  for (const [seat, column] of [[1, "b"], [2, "b"], [1, "c"], [2, "c"], [1, "d"], [2, "d"], [1, "e"]] as const) {
    last = ok(play(t, "four", seat, { column }));
    if (column !== "e") assertEquals(last.over, false);
  }
  assertEquals([last!.over, last!.scores], [true, [{ seat: 1, points: 1 }]], "four across ends it for the mover");
});

// --- battleship -------------------------------------------------------------

const FLEET_A = [["a1", "a2", "a3", "a4"], ["c1", "c2", "c3"], ["e1", "e2", "e3"], ["g1", "g2"], ["i1", "i2"], ["a6", "b6"], ["d6"], ["f6"], ["h6"], ["j6"]];
const FLEET_B = [["j7", "j8", "j9", "j10"], ["a10", "b10", "c10"], ["e10", "f10", "g10"], ["a8", "b8"], ["d8", "e8"], ["g8", "h8"], ["a5"], ["c5"], ["e5"], ["g5"]];

Deno.test("battleship: a fleet is checked, nobody else sees it — not the board, not the moves — shots, hits keep the turn, the last sink wins", () => {
  assertEquals(fleetFault(FLEET_A), null);
  assertEquals(fleetFault(FLEET_B), null);
  assertEquals(fleetFault(FLEET_A.slice(1)), "a fleet is ten ships");
  assertEquals(fleetFault([["a1", "b2", "c3", "d4"], ...FLEET_A.slice(1)]), "a ship is straight");
  assertEquals(fleetFault([["a1", "a2", "a3", "a5"], ...FLEET_A.slice(1)]), "a ship's cells are in one unbroken line");
  assertEquals(fleetFault([["b1", "b2", "b3", "b4"], ...FLEET_A.slice(1)]), "ships do not touch, not even at a corner");
  assertEquals(fleetFault([["a1", "a2", "a3", "a4"], ["a1", "b1", "c1"], ...FLEET_A.slice(2)]), "ships do not overlap");
  assertEquals(fleetFault([["a1", "a2", "a3", "a4", "a5"], ...FLEET_A.slice(1)]), "the fleet is 4, 3, 3, 2, 2, 2, 1, 1, 1, 1");

  const s = startState("grid", "battleship", [1, 2]);
  assertEquals(reason(stepGame(s, "battleship", { shot: "a1" }, false, 1)), "a move is {fleet} before the shots");
  ok(play(s, "battleship", 1, { fleet: FLEET_A }));
  assertEquals(reason(stepGame(s, "battleship", { fleet: FLEET_A }, false, 1)), "your fleet is placed; the other places theirs");
  ok(play(s, "battleship", 2, { fleet: FLEET_B }));
  assertEquals(s.sea!.phase, "shoot");
  assertEquals(s.order[s.turn!], 1, "the first seat shoots first");
  for (const [viewer, hidden] of [[2, FLEET_A], [1, FLEET_B], [null, FLEET_A], [null, FLEET_B]] as const) {
    const seen = JSON.stringify(view(s, viewer));
    for (const cell of hidden.flat()) {
      assert(!seen.includes(`"${cell}"`), `seat ${viewer} sees cell ${cell} of a hidden fleet: ${seen}`);
    }
  }
  assertEquals(view(s, 1).state.sea.fleets, { "1": FLEET_A, "2": { placed: true } }, "one's own fleet whole, the other's placed");
  assertEquals(s.board.map((m) => m.move), [{ fleet: "placed" }, { fleet: "placed" }], "the moves say placed, not where");

  const miss = ok(play(s, "battleship", 1, { shot: "b1" }));
  assertEquals([miss.shown, s.order[s.turn!]], [{ shot: "b1", result: "miss" }, 2], "a miss passes the turn");
  const hit = ok(play(s, "battleship", 2, { shot: "a1" }));
  assertEquals([hit.shown, s.order[s.turn!]], [{ shot: "a1", result: "hit" }, 2], "a hit keeps it");
  assertEquals(reason(stepGame(s, "battleship", { shot: "a1" }, false, 2)), "that cell was shot");
  let last;
  for (const cell of FLEET_A.flat().slice(1)) last = ok(play(s, "battleship", 2, { shot: cell }));
  assertEquals([last!.over, last!.scores], [true, [{ seat: 2, points: 1 }]], "the last ship sunk wins");
  assertEquals(s.sea!.shots["2"].a1, "sunk");
});

// --- hangman in the languages ----------------------------------------------

Deno.test("hangman: each language set takes only its alphabet, ru stays, the alphabet is shown to all, the word only to its setter", () => {
  const en = startState("word", "en", [1, 2]);
  assertEquals(reason(stepGame(en, "en", { word: "кот" }, false, 1)), "a word is 2 to 24 letters of the set's alphabet");
  ok(play(en, "en", 1, { word: "Cat" }));
  assertEquals(reason(stepGame(en, "en", { letter: "ж" }, false, 2)), "a move is {letter} of the set's alphabet");
  assertEquals(view(en, 2).state.word.word, null);
  assert(!JSON.stringify(view(en, 2)).includes("cat"), "the word leaks to the guesser");
  assertEquals(view(en, 1).state.word.word, "cat");
  assertEquals((view(en, 2).state.word.alphabet as string[]).length, 26);
  for (const c of "ca") ok(play(en, "en", 2, { letter: c.toUpperCase() }));
  const won = ok(play(en, "en", 2, { letter: "t" }));
  assertEquals(won.scores, [{ seat: 2, points: 1 }]);
  assertEquals(en.word!.set, "en", "the next round keeps the language");

  const ru = startState("word", "ru", [1, 2]);
  assertEquals(reason(stepGame(ru, "ru", { word: "cat" }, false, 1)), "a word is 2 to 24 letters of the set's alphabet");
  ok(play(ru, "ru", 1, { word: "ёжик" }));
  const de = startState("word", "de", [1, 2]);
  ok(play(de, "de", 1, { word: "Straße" }));
  const ka = startState("word", "ka", [1, 2]);
  ok(play(ka, "ka", 1, { word: "სახლი" }));
  const az = startState("word", "az", [1, 2]);
  ok(play(az, "az", 1, { word: "İLAN" }));
  assertEquals(az.word!.word, "ilan", "Azerbaijani lower case: İ is i");
  const legacy = startState("word", "hangman", [1, 2]);
  ok(play(legacy, "hangman", 1, { word: "кот" }));
});

// --- durak ------------------------------------------------------------------

function durak(hands: Record<string, string[]>, trump: string, stock: string[] = []) {
  const s = startState("deck", "36", [1, 2]);
  Object.assign(s.deck!, { hands, trump, stock, table: [], played: [], attacker: 1, defender: 2, out: [], discard: 0 });
  return s;
}

Deno.test("durak: 36 is durak — the attack, beating by suit or trump, throwing in by rank, taking, the stock refills, the last with cards is the durak", () => {
  const dealt = startState("deck", "36", [1, 2]);
  assertEquals([dealt.deck!.hands["1"].length, dealt.deck!.stock.length], [6, 24]);
  assertEquals(dealt.deck!.trump, dealt.deck!.stock[23], "the bottom card of the stock is the trump");
  assertEquals(view(dealt, 1).state.deck.hands["2"], { count: 6 }, "the other hand is a number");
  assert(!JSON.stringify(view(dealt, 1)).includes(`"${dealt.deck!.stock[0]}"`), "the stock's top leaks");
  for (const card of dealt.deck!.hands["2"]) {
    assert(!JSON.stringify(view(dealt, 1)).includes(`"${card}"`), `seat 1 sees ${card} of seat 2`);
  }

  const s = durak({ "1": ["7S", "7H", "9C", "AD"], "2": ["8S", "6D", "QD", "KH"] }, "6D", ["10C", "JC", "QC", "KC", "AC", "6D"]);
  assertEquals(reason(stepGame(s, "36", { play: "8S" }, false, 2)), "there is nothing to beat");
  ok(play(s, "36", 1, { play: "7S" }));
  assertEquals(s.order[s.turn!], 2, "the defender answers");
  assertEquals(reason(stepGame(s, "36", { play: "KH" }, false, 2)), "the card does not beat the attack");
  ok(play(s, "36", 2, { play: "8S" }));
  assertEquals(reason(stepGame(s, "36", { play: "9C" }, false, 1)), "throw in only a rank already on the table");
  ok(play(s, "36", 1, { play: "7H" }));
  ok(play(s, "36", 2, { play: "6D" }));
  assertEquals(s.deck!.table![1].beat, "6D", "a trump beats a plain card");
  ok(play(s, "36", 1, { done: true }));
  assertEquals([s.deck!.hands["1"].length, s.deck!.hands["2"].length, s.deck!.discard], [6, 4, 4], "the attacker refills first, the defender gets what is left");
  assertEquals(s.deck!.attacker, 2, "the beaten-off defender attacks next");
  assertEquals(s.order[s.turn!], 2);

  // Taking: the defender takes the table and the attacker attacks again.
  ok(play(s, "36", 2, { play: s.deck!.hands["2"][0] }));
  ok(play(s, "36", 1, { take: true }));
  assertEquals([s.deck!.attacker, s.order[s.turn!]], [2, 2], "one who took is passed over");

  // The end: the stock empty, seat 1 beats its last attack with its last card and ends with no cards.
  const e = durak({ "1": ["AS"], "2": ["6H", "7H"] }, "6D");
  e.deck!.attacker = 2;
  e.deck!.defender = 1;
  e.turn = 1;
  ok(play(e, "36", 2, { play: "6H" }));
  assertEquals(reason(stepGame(e, "36", { take: false }, false, 1)), "the defender moves {play: card} or {take: true}");
  // AS does not beat a heart: seat 1 must take.
  assertEquals(reason(stepGame(e, "36", { play: "AS" }, false, 1)), "the card does not beat the attack");
  const f = durak({ "1": ["AH"], "2": ["6H", "7S"] }, "6D");
  Object.assign(f.deck!, { attacker: 2, defender: 1 });
  f.turn = 1;
  ok(play(f, "36", 2, { play: "6H" }));
  ok(play(f, "36", 1, { play: "AH" }));
  const end = ok(play(f, "36", 2, { done: true }));
  assertEquals([end.over, end.scores, f.deck!.durak], [true, [{ seat: 1, points: 1 }], 2], "the one left holding cards is the durak");
});

Deno.test("durak: a turn let run out — the defender takes", () => {
  const s = durak({ "1": ["7S"], "2": ["KH", "QH"] }, "6D", ["10C"]);
  ok(play(s, "36", 1, { play: "7S" }));
  const passed = passGame(s, 2)!;
  assertEquals([passed.next, s.deck!.hands["2"].includes("7S")], [1, true]);
});

// --- poker ------------------------------------------------------------------

Deno.test("poker: hands rank right, ties split by the best five of seven", () => {
  const r = (cards: string) => best(cards.split(" "));
  assert(compare(r("AS KS QS JS TS 2D 3C"), r("9H 9D 9S 9C 2S 3D 4C")) > 0, "a royal flush beats four of a kind");
  assert(compare(r("AS 2D 3C 4H 5S KD KC"), r("KS KH 8D 8C 2S 3D 4C")) > 0, "the wheel is a straight and beats two pair");
  assert(compare(r("2H 2D 2S 3C 3S 9D 9C"), r("AH AD KS KC QS JD 9H")) > 0, "a full house beats two pair");
  assertEquals(compare(r("AH KD 2S 3C 7S 8D 9C"), r("AS KH 2D 3H 7C 8S 9D")), 0, "the same ranks tie");
});

Deno.test("poker: blinds, the cut — the stock never, a hand only to its seat — calls, raises, folds, chips only, and the game ends when one seat has every chip", () => {
  const s = startState("deck", "poker", [1, 2, 3]);
  const p = s.poker!;
  assertEquals([p.button, p.bets["2"], p.bets["3"], p.chips["2"], p.chips["3"]], [1, 10, 20, 990, 980]);
  assertEquals(s.order[s.turn!], 1, "after the big blind the button acts first with three");
  for (const viewer of [1, 2, 3, null]) {
    const seen = JSON.stringify(view(s, viewer));
    for (const card of p.stock) assert(!seen.includes(`"${card}"`), `the stock's ${card} leaks to ${viewer}`);
    for (const [seat, hole] of Object.entries(p.holes)) {
      if (String(viewer) === seat) continue;
      for (const card of hole) assert(!seen.includes(`"${card}"`), `seat ${seat}'s ${card} leaks to ${viewer}`);
    }
  }
  assertEquals(view(s, 1).state.poker.holes["1"].length, 2);
  assertEquals(view(s, 1).state.poker.holes["2"], { count: 2 });

  assertEquals(reason(stepGame(s, "poker", { check: true }, false, 1)), "there is 20 to call");
  assertEquals(reason(stepGame(s, "poker", { raise: 30 }, false, 1)), "a raise is at least 40");
  assertEquals(reason(stepGame(s, "poker", { raise: 5000 }, false, 1)), "you have not that many chips");
  assertEquals(reason(stepGame(s, "poker", { call: true }, false, 2)), "it is another seat's turn in the hand");
  ok(play(s, "poker", 1, { raise: 60 }));
  ok(play(s, "poker", 2, { fold: true }));
  ok(play(s, "poker", 3, { call: true }));
  assertEquals([p.street, p.board.length, s.order[s.turn!]], ["flop", 3, 3], "the flop, and the first live seat after the button acts");
  ok(play(s, "poker", 3, { check: true }));
  ok(play(s, "poker", 1, { raise: 100 }));
  const folded = ok(play(s, "poker", 3, { fold: true }));
  assertEquals(folded.over, false);
  // The next hand's blinds are already up: count what each holds and has bet.
  const stack = (seat: number) => p.chips[seat] + p.bets[seat];
  assertEquals([stack(1), stack(2), stack(3)], [1000 + 10 + 60, 990, 940], "the pot to the last one in");
  assertEquals(Object.values(p.chips).reduce((a, b) => a + b, 0) + 30, 3000, "no chip made or lost");
  assertEquals(p.last!.shown, {});
  assertEquals([p.hand, p.button], [2, 2], "a new hand, the button moves on");

  // Heads-up to the end: everyone all-in, the board runs out, one seat takes every chip.
  const h = startState("deck", "poker", [1, 2]);
  const q = h.poker!;
  assertEquals([q.button, q.bets["1"], q.bets["2"], h.order[h.turn!]], [1, 10, 20, 1], "heads-up the button posts small and acts first");
  q.holes = { "1": ["AS", "AH"], "2": ["7C", "2D"] };
  q.stock = ["KD", "9S", "4H", "3C", "JD", "8C", ...q.stock.filter((c) => !["AS", "AH", "7C", "2D", "KD", "9S", "4H", "3C", "JD", "8C"].includes(c))];
  ok(play(h, "poker", 1, { allin: true }));
  const end = ok(play(h, "poker", 2, { call: true }));
  assertEquals([end.over, end.scores, q.chips["1"], q.chips["2"], q.winner], [true, [{ seat: 1, points: 1 }], 2000, 0, 1]);
  assertEquals(q.last!.shown, { "1": ["AS", "AH"], "2": ["7C", "2D"] }, "at a showdown the hands still in are shown");
});

Deno.test("poker: a turn let run out checks when it can and folds when it owes", () => {
  const s = startState("deck", "poker", [1, 2]);
  const passed = passGame(s, 1)!;
  assert(s.poker!.folded.includes(1) || s.poker!.hand === 2, "seat 1 owed 10 and folded");
  assertEquals(passed.over, false);
});
