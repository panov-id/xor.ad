// The table's frame (sheets w3_table-*): the turn's ring, the title, the two faces at the top, the line under mine,
// and what the foot offers first — the web's Table.tsx rules, moved out of the screen. The game's rules are the
// node's (relay/node/src/lib/tables_*.ts); depth/core/tables.ts turnOf says whose turn and how long.
import { STICKER_IDS } from "../../../../depth/core/sticker.ts";
import { openApplications, type TableSeat, type TableView, turnOf } from "../../../../depth/core/tables.ts";

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
export function facePair(view: TableView): { left: TableSeat | null; right: TableSeat | null; rest: TableSeat[] } {
  const playing = view.seats.filter((s) => s.role === "playing");
  const left = (view.is_playing ? playing.find((s) => s.seat === view.seat) : undefined) ?? playing[0] ?? null;
  const others = playing.filter((s) => s !== left);
  const turn = view.board && !view.board.over ? others.find((s) => s.seat === view.board!.turn) : undefined;
  const right = turn ?? others[0] ?? null;
  return { left, right, rest: others.filter((s) => s !== right) };
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

/**
 * A watcher asks into the next round (§6.1: an application; owner 25.10.2026 «когда увидит что есть заявка, то уже вместе
 * будут играть»): offered to a watcher while no round is under way and their own application is not already open.
 * The web had it (web/src/screens/Table.tsx «apply»); app/ lost it, and no guest could ever become a player.
 */
/** «Your turn» (design 25.10 B5): a player waiting on another player's move may nudge them; the node refuses one's own
 *  turn, a watcher and a seat nobody sits in, and keeps the minute (protocol §4.6). */
export function canNudge(view: TableView): boolean {
  const b = view.board;
  if (!view.is_playing || !b || b.over || b.turn === null || b.turn === view.seat) return false;
  return view.seats.some((s) => s.seat === b.turn);
}

/** The foot of the table by its state (owner 27.10.2026, «Прототип + ввод»): a proposal to answer, the start or the next
 *  round (*-wait, *-over), the con by agreement, a watcher's application, else the sticker strip (table.html). */
export type Foot = "ask" | "start" | "con" | "apply" | "stickers";
export function footOf(at: { proposed: boolean; first: ReturnType<typeof firstAction>; con: boolean; apply: boolean }): Foot {
  if (at.proposed) return "ask";
  if (at.first === "start") return "start";
  if (at.con) return "con";
  if (at.apply) return "apply";
  return "stickers";
}

/** table.html, table-over.html: the players' input row sits under the strip while the round runs or waits to start;
 *  a round over has its two buttons only (door, another round), and a watcher never types. */
export function footInput(view: TableView): boolean {
  return view.is_playing && !view.board?.over;
}

/** The confirm screen asks only while its move still stands: a pass on my turn of a running round, giving up while I play
 *  in one (the node's giveUp checks the seat alone, relay/node/src/routes/tables.ts:587, so the app must not send it late). */
export function sureStill(what: "pass" | "resign", view: TableView): boolean {
  const b = view.board;
  const running = view.is_playing && !!b && !b.over && b.turn !== null;
  return what === "pass" ? running && b!.turn === view.seat : running;
}

export type MenuTile = "pass" | "resign" | "nudge" | "like" | "stand";
/** table-more.html, in its order: «Pass» and «Give up» wide on top, then «Your turn», «Like», «Leave» (the door, last).
 *  Pass is for the one whose move it is, give up for a player of a running round, the nudge while the other side owes it. */
export function menuTiles(at: { canPass: boolean; canResign: boolean; canNudge: boolean }): MenuTile[] {
  const tiles: MenuTile[] = [];
  if (at.canPass) tiles.push("pass");
  if (at.canResign) tiles.push("resign");
  if (at.canNudge) tiles.push("nudge");
  tiles.push("like", "stand");
  return tiles;
}

/** *-over sheets: the accent banner over the board (crown, the round's end, the players' score chips). The node gives the
 *  score by seat and `over`, not a winner, so the banner says what it knows: the players and their points. */
export function overBanner(view: TableView): { names: string; chips: Array<{ seat: number; n: number }> } | null {
  const board = view.board;
  if (!board?.over) return null;
  const playing = view.seats.filter((s) => s.role === "playing").sort((a, b) => a.seat - b.seat);
  // a game that keeps no score (hangman, chess) sends {}: no chips rather than a false «0 : 0»
  const scored = Object.keys(board.score ?? {}).length > 0;
  return { names: playing.map((s) => s.name).join(" · "), chips: scored ? playing.map((s) => ({ seat: s.seat, n: board.score[String(s.seat)] ?? 0 })) : [] };
}

/** desktop-1440 4-tables/table.svg: the talk at the table in the right column — what was said and the stickers, mine at the
 *  right; moves, applications and refusals stay out (the foot and the guest card speak for them). The last `max`, oldest first. */
export type TalkLine = { id: string; mine: boolean; name: string; text?: string; sticker?: string };
export function talkLines(view: TableView, max = 6): TalkLine[] {
  const nameOf = (seat: number) => view.seats.find((s) => s.seat === seat)?.name ?? "?";
  return view.lines.filter((l) => l.kind === "line" || l.kind === "sticker").slice(-max)
    .map((l) => ({ id: l.id, mine: l.seat === view.seat, name: nameOf(l.seat), ...(l.kind === "sticker" ? { sticker: l.sticker } : { text: l.text }) }));
}

export function canApply(view: TableView): "apply" | "applied" | null {
  if (view.is_playing) return null;
  const board = view.board;
  if (board && !board.over && board.turn !== null) return null;
  return openApplications(view).some((l) => l.seat === view.seat) ? "applied" : "apply";
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
  const text = (v: unknown) => v === null || v === undefined || typeof v === "string";
  return w && typeof w === "object" && Array.isArray(w.guessed) && text(w.mask) && text(w.word) ? { ...w, word: w.word ?? null, mask: w.mask ?? null } : null;
};
const QWERTY = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const EN = "abcdefghijklmnopqrstuvwxyz";
// The keyboard: English as the sheet lays it (QWERTY); any other alphabet in its own order, ten to a row. A set
// without an alphabet (the old "hangman") takes English letters.
export function keyRows(alphabet: string[] | null | undefined): string[][] {
  const own = Array.isArray(alphabet) ? [...new Set(alphabet.filter((l): l is string => typeof l === "string" && l !== ""))] : [];
  const letters = own.length ? own : [...EN];
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
    out.push({ id, tint: (f + r) % 2 === 0, stand: standOf(g, id, seat), letter: p && typeof p.piece === "string" && p.piece !== "P" && p.piece !== "M" ? p.piece : "" });
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

// ── dominoes (relay/node/src/lib/tables_free.ts playFree, freeFor): the line as laid ("a:b" left to right), my hand whole,
// the others' and the boneyard as counts. A bone goes to an end one of its halves matches (the first anywhere) ──
export type FreeView = { hands: Record<string, string[] | { count: number }>; boneyard: { count: number }; line: string[] };
export const freeOf = (state: BoardState): FreeView | null => {
  const f = (state as { free?: FreeView } | null | undefined)?.free;
  return f && Array.isArray(f.line) && f.hands ? f : null;
};
const halves = (bone: string): [number, number] => bone.split(":").map(Number) as [number, number];
export type DominoView = {
  line: Array<{ bone: string; a: number; b: number; double: boolean }>;
  hand: Array<{ bone: string; a: number; b: number; ends: Array<"left" | "right"> }>;
  draw: boolean;
};
export function dominoView(f: FreeView, seat: number): DominoView {
  const line = f.line.map((bone) => { const [a, b] = halves(bone); return { bone, a, b, double: a === b }; });
  const left = line.length ? line[0].a : null, right = line.length ? line[line.length - 1].b : null;
  const mine = Array.isArray(f.hands[String(seat)]) ? (f.hands[String(seat)] as string[]) : [];
  const hand = mine.map((bone) => {
    const [a, b] = halves(bone);
    const ends: Array<"left" | "right"> = line.length === 0 ? ["right"] : [
      ...(a === left || b === left ? ["left" as const] : []),
      ...(a === right || b === right ? ["right" as const] : []),
    ];
    return { bone, a, b, ends };
  });
  return { line, hand, draw: (f.boneyard?.count ?? 0) > 0 && hand.every((h) => h.ends.length === 0) };
}

// ── the con by agreement (relay/node/src/lib/tables_grid.ts playCon; checkers, chess, backgammon — the games whose rules
// stay with the people): in turn, «the game is mine» ({con: "won"}); the other agrees with {con: "agree"} as their next
// move, any other move of theirs drops the claim. The node keeps `claim` on the grid's or the dice's state ──
export type ConStep = { offer: "claim" | "agree" | null; waiting: boolean };
export function conStep(state: BoardState, seat: number, myTurn: boolean): ConStep {
  const st = state as { grid?: { claim?: number | null; rules?: string }; dice?: { claim?: number | null } } | null | undefined;
  const holder = st?.grid && !st.grid.rules ? st.grid : st?.dice ?? null;
  if (!holder || !("claim" in holder)) return { offer: null, waiting: false };
  const claim = holder.claim ?? null;
  if (claim === seat) return { offer: null, waiting: true };
  if (!myTurn) return { offer: null, waiting: false };
  return { offer: claim === null ? "claim" : "agree", waiting: false };
}

// A board elsewhere (a talk's game, chat-game.tsx GameBoard): it takes a move only in my turn; out of it, over, nothing.
export const movesIn = <M>(turn: "mine" | "theirs" | "over", onMove: M): M | undefined => (turn === "mine" ? onMove : undefined);

// desktop-1440 tables-full.svg: after the node turns a new table away for the hour (POST /tables 429 rate_limited), the list
// says so on top until the hour is out. The mark lives on the device only; the node stays the judge.
export const TABLES_FULL_KEY = "xor.tables.full";
export const TABLES_FULL_S = 3600;
/** The moment (ms) the list may stop saying «no more tables this hour», from a refusal's retry-after (seconds) or the hour. */
export const fullUntil = (now: number, retryAfter?: number | null): number => now + 1000 * (retryAfter && retryAfter > 0 ? retryAfter : TABLES_FULL_S);
/** The note shows while its moment is ahead; a broken or missing mark says nothing. */
export const fullShown = (until: unknown, now: number): boolean => typeof until === "number" && Number.isFinite(until) && until > now;
