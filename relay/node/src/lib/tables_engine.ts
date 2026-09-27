// The seven classes' engine in one place (chat spec §6), for a table and for a
// chat of two alike: a table was its only user until the chat's game (GC1,
// 27.09.2026), and the rules are the class's, not the place's.
//
// startState builds a class's first position for the players in order;
// stepGame applies one move or pass by a seat and says what followed — a
// refusal with its reason, whether the mover moves again, whether the game is
// over, who scored, and what to write into the moves everyone sees.

import { emptyState, type GameState } from "./tables.ts";
import { newDots, playDots } from "./tables_dots.ts";
import { newDeck, playDeck } from "./tables_deck.ts";
import { newWord, playWord } from "./tables_word.ts";
import { newGrid, playCon, playGrid } from "./tables_grid.ts";
import { newDice, playDice } from "./tables_dice.ts";
import { newFree, playFree } from "./tables_free.ts";
import { newPhysics, playPhysics } from "./tables_physics.ts";

export function startState(game: string, set: string, order: number[]): GameState {
  const state: GameState = { ...emptyState(), order };
  if (game === "dots") state.dots = newDots(set);
  const playable = order.length >= 2;
  if (game === "deck" && playable) state.deck = newDeck(order);
  if (game === "word" && playable) state.word = newWord(order[0]);
  if (game === "grid" && playable) state.grid = newGrid(set, order);
  if (game === "dice" && playable) state.dice = newDice();
  if (game === "free" && playable) state.free = newFree(order);
  if (game === "physics" && playable) state.physics = newPhysics(order);
  if (playable) state.turn = 0;
  return state;
}

export type Step =
  | { refused: string }
  | { again: boolean; over: boolean; scores: { seat: number; points: number }[]; shown: unknown };

export function stepGame(s: GameState, set: string, move: unknown, pass: boolean, seat: number): Step {
  let again = false;
  let over = false;
  const scores: { seat: number; points: number }[] = [];
  if (!pass && s.dots) {
    // A closed box scores on the seat and the closer moves again.
    const played = playDots(s.dots, move, seat);
    if ("refused" in played) return played;
    again = played.closed > 0;
    over = played.over;
    if (played.closed > 0) scores.push({ seat, points: played.closed });
  }
  if (!pass && s.deck) {
    // The card from the hand; an empty hand wins the deal.
    const played = playDeck(s.deck, move, seat);
    if ("refused" in played) return played;
    over = played.won;
    if (played.won) scores.push({ seat, points: 1 });
  }
  if (!pass && s.word) {
    // The setter's word, then letters; a word guessed scores the guesser.
    const played = playWord(s.word, move, seat);
    if ("refused" in played) return played;
    again = played.again;
    if (played.point !== null) scores.push({ seat: played.point, points: 1 });
  }
  // Grid and dice: the con by agreement first; the claimant scores, not the
  // one who agreed. Then the class's own move.
  const conOf = !pass && (s.grid ?? s.dice);
  const con = conOf ? playCon(conOf, move, seat) : null;
  if (con && "refused" in con) return con;
  if (con) {
    again = con.again;
    if (con.point !== null) scores.push({ seat: con.point, points: 1 });
    if (con.reset && s.grid) s.grid = { ...newGrid(set, s.order), claim: null };
    if (con.reset && s.dice) s.dice = newDice();
  } else if (!pass && s.grid) {
    const played = playGrid(s.grid, move, seat);
    if ("refused" in played) return played;
  } else if (!pass && s.dice) {
    const played = playDice(s.dice, move);
    if ("refused" in played) return played;
    again = played.again;
  }
  if (!pass && s.free) {
    const played = playFree(s.free, move, seat);
    if ("refused" in played) return played;
    over = played.won;
    if (played.won) scores.push({ seat, points: played.points });
  }
  if (!pass && s.physics) {
    const played = playPhysics(s.physics, move, seat);
    if ("refused" in played) return played;
    over = played.over;
    if (played.knocked > 0) scores.push({ seat, points: played.knocked });
  }
  // What goes into the moves everyone sees: never the hidden word itself.
  const shown = s.word && typeof move === "object" && move !== null && "word" in move ? { word: "set" } : move;
  return { again, over, scores, shown };
}
