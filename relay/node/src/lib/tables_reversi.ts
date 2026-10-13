// Two sets of the grid class whose rules the node keeps whole (owner,
// 13.10.2026: more varied games in alpha) — reversi and four in a row. Unlike
// checkers and chess, where the legality of a move stays with the people, both
// are small enough to check entirely: the node refuses an illegal move, finds
// the end and scores the winner. The position lives in the grid's own cells
// (lib/tables_grid.ts), so a board screen that draws a grid draws these too.
//
// Reversi: 8×8, the first seat dark, starting on d5 and e4; a move is
// {to: "c4"} and must turn at least one piece of the other's. A seat without a
// legal move is skipped by the node; when neither has one, the game is over and
// more pieces win.
//
// Four in a row: 7 columns a..g, 6 rows; a move is {column: "d"} and the piece
// falls to the lowest empty cell. Four of one's own in a line — across, up or
// diagonal — wins; a full board is a draw.

import type { Grid } from "./tables_grid.ts";

export type RulesResult =
  | { refused: string }
  | { over: boolean; next: number; winner: number | null };

const FILES = "abcdefgh";
const at = (f: number, r: number) => `${FILES[f]}${r + 1}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function newReversi(low: number, high: number): Grid {
  const cells: Grid["cells"] = {
    d4: { seat: high, piece: "O" },
    e5: { seat: high, piece: "O" },
    d5: { seat: low, piece: "O" },
    e4: { seat: low, piece: "O" },
  };
  return { cells, claim: null, rules: "reversi" };
}

// The cells a piece of `seat` on (f, r) would turn; empty means illegal.
function turned(g: Grid, f: number, r: number, seat: number): string[] {
  if (g.cells[at(f, r)]) return [];
  const out: string[] = [];
  for (const [df, dr] of DIRS) {
    const line: string[] = [];
    let [x, y] = [f + df, r + dr];
    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
      const piece = g.cells[at(x, y)];
      if (!piece) break;
      if (piece.seat === seat) {
        out.push(...line);
        break;
      }
      line.push(at(x, y));
      [x, y] = [x + df, y + dr];
    }
  }
  return out;
}

const canMove = (g: Grid, seat: number) => {
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) if (turned(g, f, r, seat).length > 0) return true;
  return false;
};

export function playReversi(g: Grid, move: unknown, seat: number, other: number): RulesResult {
  const to = (typeof move === "object" && move !== null ? (move as { to?: unknown }).to : undefined);
  if (typeof to !== "string" || !/^[a-h][1-8]$/.test(to)) return { refused: "a move is {to} on a1..h8" };
  const [f, r] = [FILES.indexOf(to[0]), Number(to.slice(1)) - 1];
  if (g.cells[to]) return { refused: "the cell is taken" };
  const flips = turned(g, f, r, seat);
  if (flips.length === 0) return { refused: "the piece must turn at least one of the other's" };
  g.cells[to] = { seat, piece: "O" };
  for (const c of flips) g.cells[c] = { seat, piece: "O" };
  if (canMove(g, other)) return { over: false, next: other, winner: null };
  if (canMove(g, seat)) return { over: false, next: seat, winner: null };
  const count = (s: number) => Object.values(g.cells).filter((p) => p.seat === s).length;
  const [mine, theirs] = [count(seat), count(other)];
  return { over: true, next: other, winner: mine === theirs ? null : mine > theirs ? seat : other };
}

export const newFour = (): Grid => ({ cells: {}, claim: null, rules: "four" });

const COLUMNS = 7;
const ROWS = 6;

export function playFour(g: Grid, move: unknown, seat: number, other: number): RulesResult {
  const column = (typeof move === "object" && move !== null ? (move as { column?: unknown }).column : undefined);
  if (typeof column !== "string" || !/^[a-g]$/.test(column)) return { refused: "a move is {column} a..g" };
  const f = FILES.indexOf(column);
  let r = 0;
  while (r < ROWS && g.cells[at(f, r)]) r++;
  if (r === ROWS) return { refused: "the column is full" };
  g.cells[at(f, r)] = { seat, piece: "O" };
  const mineAt = (x: number, y: number) =>
    x >= 0 && x < COLUMNS && y >= 0 && y < ROWS && g.cells[at(x, y)]?.seat === seat;
  for (const [df, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let n = 1;
    for (let k = 1; mineAt(f + df * k, r + dr * k); k++) n++;
    for (let k = 1; mineAt(f - df * k, r - dr * k); k++) n++;
    if (n >= 4) return { over: true, next: other, winner: seat };
  }
  const full = Object.keys(g.cells).length === COLUMNS * ROWS;
  return { over: full, next: other, winner: null };
}
