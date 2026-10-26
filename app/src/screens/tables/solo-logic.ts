// Playing alone while waiting (chat spec §6.2, owner 2026-10-25): a puzzle on one's own empty table, on the device only —
// the node knows the mark «playing alone» (POST /tables/:id/solo) and nothing of the puzzle. Two games first:
//   dots — a 3×3 board with lines already drawn; close the most boxes the K lines allow (the best is counted here, by
//          trying every choice of K, so a puzzle never asks for more than it holds);
//   sea  — a fleet the device placed at random on 6×6, no ship touching another even at a corner; sink it in the fewest shots.
// Every puzzle comes from a number (seeded), so «again» replays the same one and «next» moves on; the position is kept
// per table in localStorage and survives a guest's round («back to the puzzle»).

/** Which tables' games have a solo variant here (the rest wait as before; §6.2 lists all twelve). */
export const SOLO_GAMES: Record<string, "dots" | "sea"> = { dots: "dots", battleship: "sea" };
export const soloOf = (game: string | undefined): "dots" | "sea" | null => (game ? SOLO_GAMES[game] ?? null : null);

// A small seeded generator (mulberry32): the same seed, the same puzzle.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── dots ──
/** Boxes per side; edges are "h<r>,<c>" (r 0..N, c 0..N-1) and "v<r>,<c>" (r 0..N-1, c 0..N). */
export const DOTS_N = 3;
export const allEdges = (n = DOTS_N): string[] => {
  const out: string[] = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) out.push(`h${r},${c}`);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) out.push(`v${r},${c}`);
  return out;
};
const boxEdges = (r: number, c: number) => [`h${r},${c}`, `h${r + 1},${c}`, `v${r},${c}`, `v${r},${c + 1}`];
export const closedBoxes = (drawn: Set<string>, n = DOTS_N): number => {
  let k = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (boxEdges(r, c).every((e) => drawn.has(e))) k++;
  return k;
};

export interface DotsPuzzle { seed: number; given: string[]; lines: number; best: number }

/** The most boxes K more lines can close on top of `given`, by trying every choice (24 edges at most: cheap). */
export function bestOf(given: string[], lines: number, n = DOTS_N): number {
  const free = allEdges(n).filter((e) => !given.includes(e));
  const base = new Set(given);
  const before = closedBoxes(base, n);
  let best = 0;
  const pick = (from: number, left: number, set: Set<string>) => {
    if (left === 0 || from === free.length) { best = Math.max(best, closedBoxes(set, n) - before); return; }
    for (let i = from; i < free.length; i++) { set.add(free[i]); pick(i + 1, left - 1, set); set.delete(free[i]); }
  };
  pick(0, Math.min(lines, free.length), new Set(base));
  return best;
}

/** A puzzle from its number: some lines drawn, three to draw, and the best they can do (at least one box). */
export function dotsPuzzle(seed: number): DotsPuzzle {
  for (let tryNo = 0; ; tryNo++) {
    const next = rng(seed * 7919 + tryNo);
    const given = allEdges().filter(() => next() < 0.5);
    const lines = 3;
    const best = bestOf(given, lines);
    if (best >= 1 && closedBoxes(new Set(given)) === 0) return { seed, given, lines, best };
  }
}

export interface DotsPlay { drawn: string[] }
export function dotsStatus(p: DotsPuzzle, play: DotsPlay): { left: number; closed: number; over: boolean; solved: boolean } {
  const set = new Set([...p.given, ...play.drawn]);
  const closed = closedBoxes(set) - closedBoxes(new Set(p.given));
  const left = p.lines - play.drawn.length;
  const solved = closed >= p.best;
  return { left, closed, over: solved || left <= 0, solved };
}
export function drawLine(p: DotsPuzzle, play: DotsPlay, edge: string): DotsPlay {
  if (dotsStatus(p, play).over || p.given.includes(edge) || play.drawn.includes(edge) || !allEdges().includes(edge)) return play;
  return { drawn: [...play.drawn, edge] };
}

// ── sea ──
export const SEA_N = 6;
export const FLEET = [3, 2, 2, 1];
export interface SeaPuzzle { seed: number; ships: number[][] }   // each ship: cells r*SEA_N+c

/** A fleet from its number: FLEET's ships, straight, inside the board, none touching another even at a corner. */
export function seaPuzzle(seed: number): SeaPuzzle {
  const next = rng(seed * 104729 + 1);
  for (;;) {
    const taken = new Set<number>(), ships: number[][] = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const across = next() < 0.5;
        const r = Math.floor(next() * (across ? SEA_N : SEA_N - len + 1)), c = Math.floor(next() * (across ? SEA_N - len + 1 : SEA_N));
        const cells = Array.from({ length: len }, (_, i) => (across ? r * SEA_N + c + i : (r + i) * SEA_N + c));
        if (cells.some((x) => taken.has(x))) continue;
        ships.push(cells);
        for (const x of cells) {
          const xr = Math.floor(x / SEA_N), xc = x % SEA_N;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const nr = xr + dr, nc = xc + dc;
            if (nr >= 0 && nr < SEA_N && nc >= 0 && nc < SEA_N) taken.add(nr * SEA_N + nc);
          }
        }
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return { seed, ships };
  }
}
export interface SeaPlay { shots: number[] }
export function seaStatus(p: SeaPuzzle, play: SeaPlay): { shots: number; hits: number; sunk: number; over: boolean } {
  const hit = new Set(play.shots);
  const hits = p.ships.flat().filter((x) => hit.has(x)).length;
  const sunk = p.ships.filter((s) => s.every((x) => hit.has(x))).length;
  return { shots: play.shots.length, hits, sunk, over: sunk === p.ships.length };
}
export function shoot(p: SeaPuzzle, play: SeaPlay, cell: number): SeaPlay {
  if (seaStatus(p, play).over || play.shots.includes(cell) || cell < 0 || cell >= SEA_N * SEA_N) return play;
  return { shots: [...play.shots, cell] };
}
export const isShip = (p: SeaPuzzle, cell: number): boolean => p.ships.some((s) => s.includes(cell));

// ── the device's keeping: one solo game per table ──
export interface SoloSave { seed: number; dots?: DotsPlay; sea?: SeaPlay }
const KEY = (table: string) => `solo.v1.${table}`;
export function loadSolo(table: string, store: Pick<Storage, "getItem"> | null = safeStore()): SoloSave {
  try {
    const raw = store?.getItem(KEY(table));
    const got = raw ? JSON.parse(raw) as SoloSave : null;
    if (got && Number.isInteger(got.seed)) return got;
  } catch { /* a broken save starts afresh */ }
  return { seed: 1 };
}
export function keepSolo(table: string, save: SoloSave, store: Pick<Storage, "setItem"> | null = safeStore()): void {
  try { store?.setItem(KEY(table), JSON.stringify(save)); } catch { /* private window: the puzzle lives until the tab closes */ }
}
function safeStore(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

/** When the table shows the solo board: one's own table, playing, nobody else playing, no round under way. */
export function soloShown(v: { is_playing: boolean; playing: number; board: { over?: boolean; turn: number | null } | null }): boolean {
  const started = !!v.board && !v.board.over && v.board.turn !== null;
  return v.is_playing && v.playing <= 1 && !started;
}

/** A table row's sub-line with «playing alone» in front when the card is marked (§6.2: neighbours see it and may sit down). */
export const withSolo = (meta: string, solo: boolean | undefined, word: string): string => (solo ? `${word} · ${meta}` : meta);
