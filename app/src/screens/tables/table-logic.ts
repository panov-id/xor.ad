// The table's frame (sheets w3_table-*): the turn's ring, the title, the two faces at the top, the line under mine,
// and what the foot offers first — the web's Table.tsx rules, moved out of the screen. The game's rules are the
// node's (relay/node/src/lib/tables_*.ts); depth/core/tables.ts turnOf says whose turn and how long.
import { STICKER_IDS } from "../../../../depth/core/sticker.ts";
import { type TableSeat, type TableView, turnOf } from "../../../../depth/core/tables.ts";

// The node's term for a move (docs/facts/limits.tsv table.move.window: 5 minutes, then an automatic pass).
export const MOVE_SECONDS = 5 * 60;

// The ring by the faces: whole minutes left of the move (rounded up — a second left is still a minute), its share of
// the five; none when no clock runs (no game, over, or a turn without a term).
export function moveRing(view: TableView, now = Date.now()): { minutes: number; share: number } | null {
  const left = turnOf(view, now).secondsLeft;
  if (left === null) return null;
  const s = Math.max(0, Math.min(MOVE_SECONDS, left));
  return { minutes: Math.ceil(s / 60), share: s / MOVE_SECONDS };
}

// «Four in a row · Evening at the yard»: the game, then the table's own name when it has one.
export const tableTitle = (game: string, name?: string): string => (name ? `${game} · ${name}` : game);

// The two faces at the top: mine on the left (or, watching, the first player), on the right the one whose turn it is,
// else the next playing seat after the left one.
export function facePair(view: TableView): { left: TableSeat | null; right: TableSeat | null } {
  const playing = view.seats.filter((s) => s.role === "playing");
  const left = (view.is_playing ? playing.find((s) => s.seat === view.seat) : undefined) ?? playing[0] ?? null;
  const others = playing.filter((s) => s !== left);
  const turn = view.board && !view.board.over ? others.find((s) => s.seat === view.board!.turn) : undefined;
  return { left, right: turn ?? others[0] ?? null };
}

export type MeLine = { who: "you" | "name"; name?: string; state: "your-move" | "their-move" | "not-started" | "over" | "watching" };
// The line by the left face: «You · your move», «You · Nino's move», before a game, after it; a watcher sees a name.
export function meLine(view: TableView): MeLine {
  const turn = turnOf(view);
  const face = facePair(view).left;
  const who: MeLine = view.is_playing ? { who: "you", state: "watching" } : { who: "name", name: face?.name, state: "watching" };
  const b = view.board;
  if (!b || b.over) return { ...who, state: b?.over ? "over" : "not-started" };
  if (b.turn === null) return { ...who, state: "not-started" };
  if (turn.mine) return { ...who, state: "your-move" };
  return { ...who, state: view.is_playing ? "their-move" : "watching", ...(view.is_playing ? { name: turn.name ?? undefined } : {}) };
}

// The foot's first action (web Table.tsx): begin (or again, after an end) while playing and nothing is pending; a game
// under way, say (the stickers); my turn without a game under way to say, pass; else the like.
export function firstAction(view: TableView): "start" | "say" | "pass" | "like" {
  const board = view.board;
  const started = !!board && !board.over && board.turn !== null;
  const pending = !!board?.pending;
  if (view.is_playing && !pending && !started) return "start";
  if (view.is_playing && started) return "say";
  if (turnOf(view).mine && started) return "pass";
  return "like";
}

// ── four in a row (relay/node/src/lib/tables_reversi.ts playFour): 7 columns a..g, 6 rows, a piece falls ──
export type Grid = { cells: Record<string, { seat: number; piece: string }>; rules?: string };
export type Stand = "mine" | "theirs" | "free";
// A board's state as the node gives it (Board.state at a table, the game's state in a talk): each game reads its part.
export type BoardState = Record<string, unknown> | null | undefined;
export const gridOf = (state: BoardState): Grid | null => {
  const g = (state as { grid?: Grid } | null | undefined)?.grid;
  return g && typeof g === "object" && g.cells ? g : null;
};
const standOf = (g: Grid, id: string, seat: number): Stand => (g.cells[id] ? (g.cells[id].seat === seat ? "mine" : "theirs") : "free");

// Columns left to right, each its cells top (row 6) to bottom (row 1), and whether a piece still goes in (its top free).
export function fourColumns(g: Grid, seat: number): Array<{ column: string; open: boolean; cells: Stand[] }> {
  return [..."abcdefg"].map((column) => ({
    column,
    open: !g.cells[`${column}6`],
    cells: [6, 5, 4, 3, 2, 1].map((r) => standOf(g, `${column}${r}`, seat)),
  }));
}

// The stickers as the sheets' chips run (w3_table-*: hi, coffee, deal first), then the rest of the catalogue in its order.
const FIRST = ["hi", "coffee", "deal"];
export const STICKER_CHIPS: string[] = [...FIRST.filter((id) => (STICKER_IDS as readonly string[]).includes(id)), ...STICKER_IDS.filter((id) => !FIRST.includes(id))];

// ── dots (relay/node/src/lib/tables_dots.ts, depth/core/tables.ts dotsOf): n×n boxes, an edge "h:r:c" above box r,c or
// "v:r:c" left of it; a box names the seat that closed it ──
export type DotsLayout = {
  n: number;
  edges: Array<{ id: string; dir: "h" | "v"; r: number; c: number; taken: boolean }>;
  boxes: Array<{ r: number; c: number; stand: Exclude<Stand, "free"> }>;
};
export const dotsStateOf = (state: BoardState): { n: number; edges: string[]; boxes: Record<string, number> } | null => {
  const d = (state as { dots?: { n: number; edges: string[]; boxes: Record<string, number> } } | null | undefined)?.dots;
  return d && typeof d.n === "number" && Array.isArray(d.edges) ? d : null;
};
export function dotsLayout(dots: { n: number; edges: string[]; boxes: Record<string, number> }, seat: number): DotsLayout {
  const taken = new Set(dots.edges);
  const edges: DotsLayout["edges"] = [];
  for (let r = 0; r <= dots.n; r++) for (let c = 0; c < dots.n; c++) edges.push({ id: `h:${r}:${c}`, dir: "h", r, c, taken: taken.has(`h:${r}:${c}`) });
  for (let r = 0; r < dots.n; r++) for (let c = 0; c <= dots.n; c++) edges.push({ id: `v:${r}:${c}`, dir: "v", r, c, taken: taken.has(`v:${r}:${c}`) });
  const boxes = Object.entries(dots.boxes).map(([at, owner]) => {
    const [r, c] = at.split(":").map(Number);
    return { r, c, stand: owner === seat ? "mine" as const : "theirs" as const };
  });
  return { n: dots.n, edges, boxes };
}

// ── hangman (relay/node/src/lib/tables_word.ts wordFor): the setter sets a word, the other guesses a letter at a time;
// six misses end a round. The node gives the mask ("_" a hidden letter), the letters tried and the set's alphabet ──
export type Word = { setter: number; set?: string | null; alphabet?: string[] | null; word: string | null; mask: string | null; guessed: string[]; misses: number };
export const wordOf = (state: BoardState): Word | null => {
  const w = (state as { word?: Word } | null | undefined)?.word;
  return w && typeof w === "object" && Array.isArray(w.guessed) ? w : null;
};
const QWERTY = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const EN = "abcdefghijklmnopqrstuvwxyz";
// The keyboard: English as the sheet lays it (QWERTY); any other alphabet in its own order, ten to a row. A set
// without an alphabet (the old "hangman") takes English letters.
export function keyRows(alphabet: string[] | null | undefined): string[][] {
  const letters = alphabet && alphabet.length ? alphabet : [...EN];
  if (letters.join("") === EN) return QWERTY.map((r) => [...r]);
  const rows: string[][] = [];
  for (let i = 0; i < letters.length; i += 10) rows.push(letters.slice(i, i + 10));
  return rows;
}
export type HangmanView = { mode: "set" | "guess" | "wait"; slots: Array<string | null>; rows: Array<Array<{ letter: string; used: boolean }>>; misses: number };
export function hangmanView(w: Word, seat: number, myTurn: boolean): HangmanView {
  const mode = w.mask === null ? (w.setter === seat && myTurn ? "set" : "wait") : (w.setter !== seat && myTurn ? "guess" : "wait");
  const shown = w.word ?? w.mask;   // the setter sees the word whole
  const slots = shown === null ? [] : [...shown].map((c) => (c === "_" ? null : c));
  const used = new Set(w.guessed);
  return { mode, slots, rows: keyRows(w.alphabet).map((r) => r.map((letter) => ({ letter, used: used.has(letter) }))), misses: w.misses };
}

// ── reversi (relay/node/src/lib/tables_reversi.ts playReversi): 8×8, a move {to} must turn at least one of the other's
// pieces. The hints are the node's own rule read on this side (its `turned`); the node still decides on the move ──
const FILES8 = "abcdefgh";
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function turns(g: Grid, f: number, r: number, seat: number): number {
  if (g.cells[`${FILES8[f]}${r + 1}`]) return 0;
  let n = 0;
  for (const [df, dr] of DIRS8) {
    let run = 0, x = f + df, y = r + dr;
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      const p = g.cells[`${FILES8[x]}${y + 1}`];
      if (!p) { run = 0; break; }
      if (p.seat === seat) break;
      run++; x += df; y += dr;
    }
    if (x < 0 || x > 7 || y < 0 || y > 7) run = 0;
    n += run;
  }
  return n;
}
// The 64 cells, rank 8 on top and a1 bottom left (as the board is set), each with who stands on it and whether a piece
// of mine there would turn one of theirs.
export function reversiCells(g: Grid, seat: number): Array<{ id: string; stand: Stand; legal: boolean }> {
  const out: Array<{ id: string; stand: Stand; legal: boolean }> = [];
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) {
    const id = `${FILES8[f]}${r + 1}`;
    out.push({ id, stand: standOf(g, id, seat), legal: turns(g, f, r, seat) > 0 });
  }
  return out;
}

// ── checkers and chess (relay/node/src/lib/tables_grid.ts playGrid): a move is {from, to}; the node checks that `from`
// holds a piece of mine and `to` none of mine — whether the move is legal beyond that stays with the people ──
export type Square = { id: string; tint: boolean; stand: Stand; letter: string };
// The 64 squares, rank 8 on top; tinted where file and rank differ in parity — the squares checkers men stand on
// (relay newGrid: a1, c1 …), as the sheets draw them; a chess piece shows its letter (a pawn and a checkers man none).
export function squares(g: Grid, seat: number): Square[] {
  const out: Square[] = [];
  for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) {
    const id = `${FILES8[f]}${r + 1}`;
    const p = g.cells[id];
    out.push({ id, tint: (f + r) % 2 === 0, stand: standOf(g, id, seat), letter: p && p.piece !== "P" && p.piece !== "M" ? p.piece : "" });
  }
  return out;
}
// A tap on the board: on a piece of mine it picks that piece (again: drops it); with one picked, any other square that
// is not mine is the move; anything else does nothing.
export function tapSquare(g: Grid, seat: number, picked: string | null, at: string): { picked: string | null; move?: { from: string; to: string } } {
  const mine = g.cells[at]?.seat === seat;
  if (mine) return { picked: picked === at ? null : at };
  if (picked) return { picked: null, move: { from: picked, to: at } };
  return { picked: null };
}

// ── backgammon (relay/node/src/lib/tables_dice.ts): the node rolls; a turn is {roll: true}, then {move} as the people
// agree — the node keeps no position of the checkers, so the board draws the field and the dice, not the men ──
export type Dice = { rolled: [number, number] | null; claim: number | null };
export const diceOf = (state: BoardState): Dice | null => {
  const d = (state as { dice?: Dice } | null | undefined)?.dice;
  return d && typeof d === "object" && "rolled" in d ? d : null;
};
// A die's pips on its 3×3 (0 top left … 8 bottom right), as dice are drawn.
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const pipsOf = (face: number): number[] => PIPS[face] ?? [];
// What the dice ask of me: in my turn, to roll while nothing fell, else to say the move is made; out of turn nothing.
export const diceStep = (d: Dice, myTurn: boolean): "roll" | "moved" | null => (!myTurn ? null : d.rolled ? "moved" : "roll");
