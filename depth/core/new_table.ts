// What a table list and the new-table wizard share between the faces (web screens/TableList.tsx, NewTable.tsx;
// app/src/screens/tables/*): the games the wizard offers, the counts a table card says, the words for a class,
// a set and a game, and the body of POST /tables. Pure: no DOM, no dictionary of its own — the words come from
// the `say` the face passes in.
import type { Answer } from "./client.ts";
import { graphemeCount } from "./limits.ts";
import type { BoardClass, NewTable } from "./tables.ts";

/** Hangman in each interface language (relay/node/src/lib/tables_word.ts ALPHABETS). */
export const WORD_SETS = ["ru", "en", "uk", "be", "de", "es", "fr", "pl", "ro", "az", "uz", "el", "hy", "ka", "kk", "ky", "tg"];

export interface Game { id: string; klass: BoardClass; sets: string[]; seats: number[] }

/**
 * The twelve games of step 1, in the sheets' order: each is a class and the sets it offers as variants. Variants are
 * what the node plays — a variant a sheet draws and the node lacks is not offered (GOALS §6 question 9, default
 * «as in the node»). "36" is durak podkidnoy, "transfer" durak perevodnoy (14.10.2026); "poker" is Texas hold'em on
 * chips, no money (13.10.2026). The most seats per class are the node's (routes/tables.ts SEAT_LIMITS).
 */
export const GAMES: Game[] = [
  { id: "dots", klass: "dots", sets: ["3x3", "2x2", "4x4"], seats: [2] },
  { id: "checkers", klass: "grid", sets: ["checkers"], seats: [2] },
  { id: "chess", klass: "grid", sets: ["chess"], seats: [2] },
  { id: "durak", klass: "deck", sets: ["36", "transfer"], seats: [2, 3, 4, 5, 6] },
  { id: "hangman", klass: "word", sets: WORD_SETS, seats: [2] },
  { id: "backgammon", klass: "dice", sets: ["backgammon"], seats: [2] },
  { id: "dominoes", klass: "free", sets: ["double-six"], seats: [2, 3, 4] },
  { id: "chapayev", klass: "physics", sets: ["chapayev"], seats: [2, 3, 4] },
  { id: "reversi", klass: "grid", sets: ["reversi"], seats: [2] },
  { id: "four", klass: "grid", sets: ["four"], seats: [2] },
  { id: "battleship", klass: "grid", sets: ["battleship"], seats: [2] },
  { id: "poker", klass: "deck", sets: ["poker"], seats: [2, 3, 4, 5, 6] },
];

export const gameById = (id: string | null): Game | undefined => GAMES.find((g) => g.id === id);

/** The game a table of this class and set is (a card says «deck» and «36», the wizard's tile «durak»). */
export const gameOfTable = (klass: string | undefined, set: string | undefined): Game | undefined =>
  GAMES.find((g) => g.klass === klass && !!set && g.sets.includes(set));

/** A table's name is up to this many letters (routes/tables.ts: 24 graphemes). */
export const TABLE_NAME_MAX = 24;

/** Letters still free in a table's name (the counter under the field). */
export const nameLeft = (name: string): number => Math.max(0, TABLE_NAME_MAX - graphemeCount(name));

/** "2" for a game that seats two, "2–6" for one that seats two to six. */
export const seatsWord = (seats: number[]): string => (seats.length === 1 ? String(seats[0]) : `${seats[0]}–${seats[seats.length - 1]}`);

/** A table as GET /tables deals it (relay lib/tables_feed.ts) — the fields a card says. */
export interface TableCard {
  id: string;
  name?: string | null;
  game?: string;
  set?: string;
  playing?: number;
  watching?: number;
  free_seats?: number;
  like_count?: number;
  /** `mine` only: the person sits here / liked it. */
  seated?: boolean;
  liked?: boolean;
}

/** "2 of 4 seated, 1 watching" as numbers: who plays, how many seats the table has, who watches. */
export function tableCounts(card: TableCard): { seated: number; seats: number; watching: number } {
  const seated = Math.max(0, card.playing ?? 0);
  return { seated, seats: seated + Math.max(0, card.free_seats ?? 0), watching: Math.max(0, card.watching ?? 0) };
}

export type Say = (key: string, values?: Record<string, string | number>) => string;

/** The words of a class, a set and a game, by the dictionary the face has (never an id, «dots» or «36»). */
export function makeTableWords(say: Say) {
  // The class of a table by its dictionary name («точки»), never its id («dots»).
  const classWord = (klass: string): string => {
    const key = `web.class.${klass}`;
    const word = say(key);
    return word === key ? klass : word;
  };
  // The set of a table by its dictionary name («колода из 36 карт»); an NxN field is one key. An id with no word shows as itself.
  const setWord = (set: string): string => {
    const square = /^(\d+)x\1$/.exec(set);
    if (square) return say("web.set.field", { n: square[1] });
    const key = `web.set.${set}`;
    const word = say(key);
    return word === key ? set : word;
  };
  // A game's name: the words the dictionaries have — a class's (dots, dominoes, hangman) or a set's (checkers, chess, …) —
  // and two of its own, durak and poker.
  const gameName = (g: Pick<Game, "id" | "klass" | "sets">): string =>
    g.id === "durak" || g.id === "poker" ? say(`web.game.${g.id}`)
      : ["dots", "hangman", "dominoes"].includes(g.id) ? classWord(g.klass) : setWord(g.sets[0]);
  // A variant's word: durak's two rule sets are named by their rules, the rest by their set.
  const variantWord = (game: string, set: string): string =>
    game === "durak" ? say(set === "transfer" ? "web.newTable.perevodnoy" : "web.newTable.podkidnoy") : setWord(set);
  return { classWord, setWord, gameName, variantWord };
}

/** What the person has chosen so far in the wizard. */
export interface Draft { game: string | null; set: string | null; seats: number | null; name: string }

export const emptyDraft = (): Draft => ({ game: null, set: null, seats: null, name: "" });

/** A game picked: its first variant and its fewest seats stand until the person picks another. */
export function pickGame(draft: Draft, id: string): Draft {
  const g = gameById(id);
  return g ? { ...draft, game: g.id, set: g.sets[0], seats: g.seats[0] } : draft;
}

/** The body of POST /tables at the person's own spot and circle; null while a game, a variant or the seats are missing. */
export function tableBody(draft: Draft, at: { lat: number; lon: number }, radius: NewTable["area_radius"]): NewTable | null {
  const g = gameById(draft.game);
  if (!g || !draft.set || !g.sets.includes(draft.set) || draft.seats === null || !g.seats.includes(draft.seats)) return null;
  const name = draft.name.trim();
  return { class: g.klass, set: draft.set, seats: draft.seats, lat: at.lat, lon: at.lon, area_radius: radius, ...(name ? { name } : {}) };
}

/** The node's code of a refusal of POST /tables (error.code), else the status as a string. */
export const refusalCode = (answer: Answer<unknown>): string => (answer.body as { error?: { code?: string } } | null)?.error?.code ?? String(answer.status);
