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
export const gridOf = (view: TableView): Grid | null => {
  const g = (view.board?.state as { grid?: Grid } | undefined)?.grid;
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
