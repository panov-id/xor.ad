// The seven classes' engine in one place (chat spec §6), for a table and for a
// chat of two alike: a table was its only user until the chat's game (GC1,
// 27.09.2026), and the rules are the class's, not the place's.
//
// startState builds a class's first position for the players in order;
// stepGame applies one move or pass by a seat and says what followed — a
// refusal with its reason, whether the mover moves again, whether the game is
// over, who scored, and what to write into the moves everyone sees.
//
// Some sets keep their own order of turns (owner, 13.10.2026: reversi skips a
// seat with no move, a battleship hit shoots again, durak and poker name who
// acts next): their step says `next`, the seat whose turn it is, and the place
// puts the turn there instead of passing it round. A turn let run out means
// something to them too (passGame): the poker seat checks or folds, the durak
// defender takes.

import { emptyState, type GameState } from "./tables.ts";
import { newDots, playDots } from "./tables_dots.ts";
import { newDeck, passDeck, playDeck } from "./tables_deck.ts";
import { newWord, playWord } from "./tables_word.ts";
import { newGrid, playCon, playGrid } from "./tables_grid.ts";
import { playFour, playReversi } from "./tables_reversi.ts";
import { newSea, playSea } from "./tables_sea.ts";
import { newPoker, passPoker, playPoker } from "./tables_poker.ts";
import { newDice, playDice } from "./tables_dice.ts";
import { newFree, playFree } from "./tables_free.ts";
import { newPhysics, playPhysics } from "./tables_physics.ts";

// The sets each class knows by name, and the most seats a set allows where it
// is fewer than its class's (routes/tables.ts). A set not listed keeps its
// class's default rules, as before 13.10.2026.
export const SET_SEATS: Record<string, Record<string, number>> = {
  grid: { checkers: 2, chess: 2, reversi: 2, four: 2, battleship: 2 },
  deck: { "36": 6, durak36: 6, durak: 6, poker: 6 },
};

export function startState(game: string, set: string, order: number[]): GameState {
  const state: GameState = { ...emptyState(), order };
  if (game === "dots") state.dots = newDots(set);
  const playable = order.length >= 2;
  if (game === "deck" && playable && set === "poker") state.poker = newPoker(order);
  else if (game === "deck" && playable) state.deck = newDeck(order);
  if (game === "word" && playable) state.word = newWord(order[0], set);
  if (game === "grid" && playable && set === "battleship") state.sea = newSea(order);
  else if (game === "grid" && playable) state.grid = newGrid(set, order);
  if (game === "dice" && playable) state.dice = newDice();
  if (game === "free" && playable) state.free = newFree(order);
  if (game === "physics" && playable) state.physics = newPhysics(order);
  if (playable) state.turn = 0;
  // Poker: the first to act is not the first seat (the blinds come before).
  if (playable && state.poker) state.turn = Math.max(0, order.indexOf(state.poker.to_act));
  return state;
}

export type Step =
  | { refused: string }
  | { again: boolean; over: boolean; scores: { seat: number; points: number }[]; shown: unknown; next?: number };

const otherOf = (s: GameState, seat: number) => s.order.find((x) => x !== seat) ?? seat;

export function stepGame(s: GameState, set: string, move: unknown, pass: boolean, seat: number): Step {
  let again = false;
  let over = false;
  let next: number | undefined;
  let shown: unknown = move;
  const scores: { seat: number; points: number }[] = [];
  if (pass) {
    const passed = passGame(s, seat);
    return { again: false, over: passed?.over ?? false, scores: passed?.scores ?? [], shown: undefined, next: passed?.next };
  }
  if (s.dots) {
    // A closed box scores on the seat and the closer moves again.
    const played = playDots(s.dots, move, seat);
    if ("refused" in played) return played;
    again = played.closed > 0;
    over = played.over;
    if (played.closed > 0) scores.push({ seat, points: played.closed });
  }
  if (s.deck) {
    // Durak: the node names the next to move; the durak is the one left with cards.
    const played = playDeck(s.deck, move, seat, s.order);
    if ("refused" in played) return played;
    over = played.over;
    next = played.next;
    for (const winner of played.winners) scores.push({ seat: winner, points: 1 });
  }
  if (s.poker) {
    const played = playPoker(s.poker, move, seat, s.order);
    if ("refused" in played) return played;
    over = played.over;
    next = played.next;
    if (played.winner !== null) scores.push({ seat: played.winner, points: 1 });
  }
  if (s.word) {
    // The setter's word, then letters; a word guessed scores the guesser.
    const played = playWord(s.word, move, seat);
    if ("refused" in played) return played;
    again = played.again;
    if (played.point !== null) scores.push({ seat: played.point, points: 1 });
  }
  if (s.sea) {
    // Battleship: the fleet never goes into the moves, only that it is placed.
    const played = playSea(s.sea, move, seat, otherOf(s, seat));
    if ("refused" in played) return played;
    over = played.over;
    next = played.next;
    shown = played.shown;
    if (played.over) scores.push({ seat, points: 1 });
  }
  if (s.grid?.rules) {
    // Reversi and four in a row: the node keeps the rules whole, no con.
    const play = s.grid.rules === "reversi" ? playReversi : playFour;
    const played = play(s.grid, move, seat, otherOf(s, seat));
    if ("refused" in played) return played;
    over = played.over;
    next = played.next;
    if (played.winner !== null) scores.push({ seat: played.winner, points: 1 });
    return { again, over, scores, shown, next };
  }
  // Grid and dice: the con by agreement first; the claimant scores, not the
  // one who agreed. Then the class's own move.
  const conOf = s.grid ?? s.dice;
  const con = conOf ? playCon(conOf, move, seat) : null;
  if (con && "refused" in con) return con;
  if (con) {
    again = con.again;
    if (con.point !== null) scores.push({ seat: con.point, points: 1 });
    if (con.reset && s.grid) s.grid = { ...newGrid(set, s.order), claim: null };
    if (con.reset && s.dice) s.dice = newDice();
  } else if (s.grid) {
    const played = playGrid(s.grid, move, seat);
    if ("refused" in played) return played;
  } else if (s.dice) {
    const played = playDice(s.dice, move);
    if ("refused" in played) return played;
    again = played.again;
  }
  if (s.free) {
    const played = playFree(s.free, move, seat);
    if ("refused" in played) return played;
    over = played.won;
    if (played.won) scores.push({ seat, points: played.points });
  }
  if (s.physics) {
    const played = playPhysics(s.physics, move, seat);
    if ("refused" in played) return played;
    over = played.over;
    if (played.knocked > 0) scores.push({ seat, points: played.knocked });
  }
  // What goes into the moves everyone sees: never the hidden word itself.
  if (s.word && typeof move === "object" && move !== null && "word" in move) shown = { word: "set" };
  return { again, over, scores, shown, next };
}

// What a pass (said, or a turn let run out) means to a set that keeps its own
// turns: the seat to move next, and whether that ended the game. Null — the
// turn simply goes round.
export function passGame(
  s: GameState,
  seat: number,
): { next?: number; over: boolean; scores: { seat: number; points: number }[] } | null {
  const played = s.poker ? passPoker(s.poker, seat, s.order) : s.deck ? passDeck(s.deck, seat, s.order) : null;
  if (!played || "refused" in played) return null;
  const winners = "winners" in played ? played.winners : played.winner !== null ? [played.winner] : [];
  return { next: played.next, over: played.over, scores: winners.map((w) => ({ seat: w, points: 1 })) };
}

// Where the turn goes after a step: the set's own `next` when it names a seat
// still playing, else round as always.
export function turnAfter(s: GameState, turn: number, step: { again: boolean; next?: number }): number {
  if (step.next !== undefined) {
    const at = s.order.indexOf(step.next);
    if (at >= 0) return at;
  }
  return step.again ? turn : (turn + 1) % s.order.length;
}
