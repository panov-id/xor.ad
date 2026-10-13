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
//
// The set is a language of the interface (web/src/locales; owner, 13.10.2026):
// the word and every letter must be of its alphabet. "hangman", the set before
// the languages, and any other unknown set take any letter, as they always did.

import { readText } from "./feed_verdict.ts";
import { judge } from "./moderator.ts";

// The hangman word is published to the other side (the mask, then the word
// once the round ends), so it goes through the moderator like every text people
// publish (owner, 13.10.2026): the model's publish lets it through, anything
// else is a refusal with its reason — the route answers 422 before the
// engine sees the move. Asked before the transaction, as for a table's lines:
// the model may take seconds and must not hold the game's row lock. Null when
// the move carries no word or the word is published.
export async function judgeWord(move: unknown): Promise<string | null> {
  const word = typeof move === "object" && move !== null ? (move as { word?: unknown }).word : undefined;
  if (typeof word !== "string") return null;
  const text = word.trim();
  const judgement = await judge({ kind: "game_word", text, flags: readText(text) });
  return judgement.publish ? null : judgement.reason;
}

export const MISSES = 6;

// Lower case, one code point a letter.
export const ALPHABETS: Record<string, string> = {
  en: "abcdefghijklmnopqrstuvwxyz",
  ru: "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
  uk: "абвгґдеєжзиіїйклмнопрстуфхцчшщьюя",
  be: "абвгдеёжзійклмнопрстуўфхцчшыьэюя",
  de: "abcdefghijklmnopqrstuvwxyzäöüß",
  es: "abcdefghijklmnñopqrstuvwxyzáéíóúü",
  fr: "abcdefghijklmnopqrstuvwxyzàâæçéèêëîïôœùûüÿ",
  pl: "aąbcćdeęfghijklłmnńoóprsśtuvwxyzźż",
  ro: "aăâbcdefghiîjklmnopqrsștțuvwxyz",
  az: "abcçdeəfgğhxıijkqlmnoöprsştuüvyz",
  uz: "abdefghijklmnopqrstuvxyzʻ",
  el: "αβγδεζηθικλμνξοπρσςτυφχψωάέήίόύώϊϋΐΰ",
  hy: "աբգդեզէըթժիլխծկհձղճմյնշոչպջռսվտրցւփքօֆև",
  ka: "აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ",
  kk: "аәбвгғдеёжзийкқлмнңоөпрстуұүфхһцчшщъыіьэюя",
  ky: "абвгдеёжзийклмнңоөпрстуүфхцчшщъыьэюя",
  tg: "абвгғдеёжзиӣйкқлмнопрстуӯфхҳчҷшъэюя",
};

const known = (set: string | null | undefined): set is string => !!set && Object.hasOwn(ALPHABETS, set);
const lower = (text: string, set: string | null) => text.normalize("NFC").toLocaleLowerCase(known(set) ? set : undefined);
const isLetter = (c: string, set: string | null) => (known(set) ? [...ALPHABETS[set]].includes(c) : /^\p{L}$/u.test(c));

export interface Word {
  setter: number;
  set?: string | null; // the language; null — any letter
  word: string | null;
  guessed: string[];
  misses: number;
}

export const newWord = (setter: number, set: string | null = null): Word => ({
  setter,
  set: known(set) ? set : null,
  word: null,
  guessed: [],
  misses: 0,
});

// `again`: the mover keeps the turn. `point`: the seat that scored.
export type WordResult = { refused: string } | { again: boolean; point: number | null };

export function playWord(w: Word, move: unknown, seat: number): WordResult {
  const set = w.set ?? null;
  const m = (typeof move === "object" && move !== null ? move : {}) as { word?: unknown; letter?: unknown };
  if (w.word === null) {
    if (seat !== w.setter) return { refused: "the setter sets the word first" };
    if (typeof m.word !== "string") return { refused: "a move is {word}" };
    const word = lower(m.word.trim(), set);
    const letters = [...word];
    if (letters.length < 2 || letters.length > 24 || !letters.every((c) => isLetter(c, set))) {
      return { refused: set ? "a word is 2 to 24 letters of the set's alphabet" : "a word is 2 to 24 letters" };
    }
    if (readText(word).length > 0) return { refused: "set another word" };
    w.word = word;
    return { again: false, point: null };
  }
  if (seat === w.setter) return { refused: "the guesser guesses" };
  const letter = typeof m.letter === "string" ? lower(m.letter, set) : "";
  if ([...letter].length !== 1 || !isLetter(letter, set)) {
    return { refused: set ? "a move is {letter} of the set's alphabet" : "a move is {letter}" };
  }
  if (w.guessed.includes(letter)) return { refused: "that letter was tried" };
  w.guessed.push(letter);
  if (!w.word.includes(letter)) w.misses += 1;
  const open = [...w.word].every((c) => w.guessed.includes(c));
  if (!open && w.misses < MISSES) return { again: true, point: null };
  // The round is over: the guesser sets the next word, and moves next.
  const point = open ? seat : null;
  Object.assign(w, newWord(seat, set));
  return { again: true, point };
}

// The setter sees the word; everyone else sees it masked. The alphabet goes to
// all: the screen lays out its letters.
export function wordFor(w: Word, viewer: number | null) {
  const mask = w.word === null ? null : [...w.word].map((c) => (w.guessed.includes(c) ? c : "_")).join("");
  return {
    setter: w.setter,
    set: w.set ?? null,
    alphabet: known(w.set) ? [...ALPHABETS[w.set]] : null,
    word: viewer === w.setter ? w.word : null,
    mask,
    guessed: w.guessed,
    misses: w.misses,
    misses_left: MISSES - w.misses,
  };
}
