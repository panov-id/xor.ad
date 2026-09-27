// The text class — hangman (chat spec §6: "whose turn; a letter is not
// repeated, the word is guessed, the score by words guessed"). Two seats. The
// setter's word is checked by the feed's first tier of rules before anyone
// sees it (§6: "the word passes the moderation queue, as a phrase"); a flagged
// word is refused, "set another one". The board shows the word only to its
// setter; everybody else sees it masked (§6.1: what is hidden is cut).
//
// A round: the setter moves {word}, the guesser then moves {letter} until the
// word is open (+1 to the guesser) or six misses; either way the roles swap and
// the one who just guessed sets the next word.

import { readText } from "./feed_verdict.ts";

export const MISSES = 6;

export interface Word {
  setter: number;
  word: string | null;
  guessed: string[];
  misses: number;
}

export const newWord = (setter: number): Word => ({ setter, word: null, guessed: [], misses: 0 });

// `again`: the mover keeps the turn. `point`: the seat that scored.
export type WordResult = { refused: string } | { again: boolean; point: number | null };

export function playWord(w: Word, move: unknown, seat: number): WordResult {
  const m = (typeof move === "object" && move !== null ? move : {}) as { word?: unknown; letter?: unknown };
  if (w.word === null) {
    if (seat !== w.setter) return { refused: "the setter sets the word first" };
    if (typeof m.word !== "string") return { refused: "a move is {word}" };
    const word = m.word.trim().toLowerCase();
    if (!/^\p{L}{2,24}$/u.test(word)) return { refused: "a word is 2 to 24 letters" };
    if (readText(word).length > 0) return { refused: "set another word" };
    w.word = word;
    return { again: false, point: null };
  }
  if (seat === w.setter) return { refused: "the guesser guesses" };
  if (typeof m.letter !== "string" || !/^\p{L}$/u.test(m.letter)) return { refused: "a move is {letter}" };
  const letter = m.letter.toLowerCase();
  if (w.guessed.includes(letter)) return { refused: "that letter was tried" };
  w.guessed.push(letter);
  if (!w.word.includes(letter)) w.misses += 1;
  const open = [...w.word].every((c) => w.guessed.includes(c));
  if (!open && w.misses < MISSES) return { again: true, point: null };
  // The round is over: the guesser sets the next word, and moves next.
  const point = open ? seat : null;
  Object.assign(w, newWord(seat));
  return { again: true, point };
}

// The setter sees the word; everyone else sees it masked.
export function wordFor(w: Word, viewer: number | null) {
  const mask = w.word === null ? null : [...w.word].map((c) => (w.guessed.includes(c) ? c : "_")).join("");
  return {
    setter: w.setter,
    word: viewer === w.setter ? w.word : null,
    mask,
    guessed: w.guessed,
    misses: w.misses,
    misses_left: MISSES - w.misses,
  };
}
