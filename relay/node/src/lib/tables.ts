// Step 8: what a table is made of beyond its routes (chat spec §6, §6.1;
// protocol §4.6). The routes live in routes/tables.ts; this file holds what
// other paths call too — standing up from a table (five paths lead here), the
// overdue turn, the sweeper — so that each rule is written once.
//
// The engine here keeps turn order, the board's version and the three-pass
// rule for every class. The per-class checks of the §6 table (a domino end, a
// closed dot area, a letter not repeated) are not here yet: a move is stored as
// the client sent it, and `illegal_move` is only a shape refusal.

import { queryOrThrow, type Query, transaction } from "./db.ts";
import type { Limit } from "./rate_limit.ts";
import type { Dots } from "./tables_dots.ts";
import { type Deck, deckFor } from "./tables_deck.ts";
import { type Word, wordFor } from "./tables_word.ts";
import { log } from "./log.ts";

const HOUR = 60 * 60 * 1000;

// docs/facts/limits.tsv, by name.
export const MOVE_WINDOW_MS = 5 * 60 * 1000; // table.move.window
export const PASS_LIMIT = 3; // table.pass.limit
export const IDLE_MINUTES = 60; // table.idle.span
export const TABLE_CREATE_LIMITS: Limit[] = [{ name: "tables-create", max: 4, windowMs: HOUR }]; // tables.create.hour
export const SEAT_LIMITS: Limit[] = [{ name: "seat-attempts", max: 30, windowMs: HOUR }]; // seat.attempts.hour
export const STICKER_LIMITS: Limit[] = [{ name: "table-sticker", max: 6, windowMs: 60_000 }]; // sticker.minute
export const TICKET_LIMITS: Limit[] = [{ name: "table-ticket", max: 60, windowMs: 60_000 }]; // as chat.messages.minute, a ticket is a socket
export const TICKET_SECONDS = 30; // ticket.lifetime

export const CLASSES = ["grid", "free", "dots", "deck", "dice", "physics", "word"] as const;
export const RADII = [100, 300, 1000, 3000, 10000];

// The game's state, the same shape for every class: who plays in which order,
// whose turn it is, consecutive passes per seat, and the moves so far. The
// seat numbers are what goes out; an identity never does (§8.11).
export interface GameState {
  order: number[];
  turn: number | null; // index into order; null before the first round
  passes: Record<string, number>;
  board: { seat: number; move?: unknown; pass?: true }[];
  dots?: Dots; // the dots class keeps its field here (lib/tables_dots.ts)
  deck?: Deck; // the deck class: stock and hands, cut per viewer (lib/tables_deck.ts)
  word?: Word; // the text class: the word, shown to its setter only (lib/tables_word.ts)
}

export const emptyState = (): GameState => ({ order: [], turn: null, passes: {}, board: [] });

// "Each with each" of §8.2, for two identities aliased `a` and `b`: both are
// inside each other's band. The same arithmetic as routes/hidden.ts.
export function bandBetween(a: string, b: string): string {
  const band = (x: string) =>
    `BETWEEN (CASE WHEN ${x}.age <= 20 THEN greatest(13, ${x}.age - 2) ELSE least(21, ${x}.age - 2) END)
         AND (CASE WHEN ${x}.age <= 20 THEN ${x}.age + 2 ELSE 1000 END)`;
  return `(${b}.age ${band(a)} AND ${a}.age ${band(b)})`;
}

// A block either way between two identity expressions.
export const blockedEither = (a: string, b: string) =>
  `EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_identity = ${a} AND bl.blocked_identity = ${b})
                                     OR (bl.blocker_identity = ${b} AND bl.blocked_identity = ${a}))`;

interface GameRow {
  id: string;
  state: GameState;
  seq: number;
  pending: { id: string; kind: string; by: number; until?: number } | null;
  turn_due: Date | null;
}

// The table's running game under a row lock, or none.
export async function lockGame(run: Query, tableId: string): Promise<GameRow | null> {
  const [game] = await run<GameRow>(
    `SELECT id, state, seq, pending, turn_due FROM table_games
      WHERE table_id = $1 AND ended_at IS NULL FOR UPDATE`,
    [tableId],
  );
  return game ?? null;
}

// The next turn after `from`, and its term. With fewer than two playing, the
// game is over at once (the owner's decision of 2026-09-18).
function advance(run: Query, game: GameRow, from: Date): Promise<unknown> {
  const s = game.state;
  if (s.order.length < 2) {
    return run(
      `UPDATE table_games SET state = $2::text::jsonb, seq = seq + 1, turn_due = NULL, ended_at = now() WHERE id = $1`,
      [game.id, JSON.stringify(s)],
    );
  }
  s.turn = s.turn === null ? 0 : (s.turn + 1) % s.order.length;
  return run(
    `UPDATE table_games SET state = $2::text::jsonb, seq = seq + 1, turn_due = $3 WHERE id = $1`,
    [game.id, JSON.stringify(s), new Date(from.getTime() + MOVE_WINDOW_MS)],
  );
}

// A seat leaves the game (stood up, three passes, blocked away): out of the
// order; if it was their turn, the turn moves on.
async function dropFromOrder(run: Query, game: GameRow, seat: number, now: Date): Promise<void> {
  const s = game.state;
  const at = s.order.indexOf(seat);
  if (at < 0) return;
  const wasTurn = s.turn === at;
  s.order.splice(at, 1);
  if (s.order.length < 2) {
    await run(
      `UPDATE table_games SET state = $2::text::jsonb, seq = seq + 1, turn_due = NULL, ended_at = now() WHERE id = $1`,
      [game.id, JSON.stringify(s)],
    );
    return;
  }
  if (s.turn !== null && at < s.turn) s.turn -= 1;
  if (!wasTurn) {
    await run(`UPDATE table_games SET state = $2::text::jsonb, seq = seq + 1 WHERE id = $1`, [game.id, JSON.stringify(s)]);
    return;
  }
  // The seat after the leaver now stands at the leaver's index.
  s.turn = at % s.order.length;
  await run(
    `UPDATE table_games SET state = $2::text::jsonb, seq = seq + 1, turn_due = $3 WHERE id = $1`,
    [game.id, JSON.stringify(s), new Date(now.getTime() + MOVE_WINDOW_MS)],
  );
}

// Overdue turns become passes, in order, each with its own seq (OPS-12, OPS-3,
// OPS-4); three in a row seat the player as a spectator. An expired proposal
// goes too. Called by every request to the table and by the autopass job.
export async function applyOverdue(run: Query, tableId: string): Promise<void> {
  const game = await lockGame(run, tableId);
  if (!game) return;
  if (game.pending?.until && game.pending.until * 1000 <= Date.now()) {
    await run(`UPDATE table_games SET pending = NULL WHERE id = $1`, [game.id]);
    game.pending = null;
  }
  let due = game.turn_due;
  while (due && due.getTime() <= Date.now() && game.state.turn !== null) {
    const s = game.state;
    const seat = s.order[s.turn!];
    s.board.push({ seat, pass: true });
    s.passes[seat] = (s.passes[seat] ?? 0) + 1;
    if (s.passes[seat] >= PASS_LIMIT) {
      delete s.passes[seat];
      await run(
        `UPDATE table_seats SET playing_from = NULL WHERE table_id = $1 AND seat_no = $2 AND left_at IS NULL`,
        [tableId, seat],
      );
      await dropFromOrder(run, game, seat, due);
      await tableEvent(run, tableId, "seat");
    } else {
      await advance(run, game, due);
    }
    // One frame per applied pass: each has its own seq (OPS-12).
    await tableEvent(run, tableId, "board");
    game.seq += 1;
    const [next] = await run<{ turn_due: Date | null; ended: boolean }>(
      `SELECT turn_due, ended_at IS NOT NULL AS ended FROM table_games WHERE id = $1`,
      [game.id],
    );
    if (!next || next.ended) break;
    due = next.turn_due;
  }
}

// Resigning (§6): a one-sided declaration with no result — the seat stops
// playing and stays at the table as a spectator; a game of two is over.
export async function resign(run: Query, tableId: string, seat: number): Promise<void> {
  await run(`UPDATE table_seats SET playing_from = NULL WHERE table_id = $1 AND seat_no = $2 AND left_at IS NULL`, [
    tableId,
    seat,
  ]);
  const game = await lockGame(run, tableId);
  if (game) await dropFromOrder(run, game, seat, new Date());
}

// leave_table(identity) of §6.1 — a transaction step, not a database object
// (DATA-3): left_at and NOTIFY seat_left; the leaver's proposal goes; a
// playing leaver leaves the order; the last one out closes the table.
// Returns the table left, or null if the identity sat nowhere.
export async function leaveTable(run: Query, identity: string): Promise<string | null> {
  const [seat] = await run<{ table_id: string; seat_no: number; playing: boolean }>(
    `UPDATE table_seats SET left_at = now() WHERE identity = $1 AND left_at IS NULL
     RETURNING table_id, seat_no, playing_from IS NOT NULL AS playing`,
    [identity],
  );
  if (!seat) return null;
  // "<table>:<seat>:<identity>": the relay closes that identity's room of the
  // table 4005 (protocol §4.4). The identity stays inside the node.
  await run(`SELECT pg_notify('seat_left', $1)`, [`${seat.table_id}:${seat.seat_no}:${identity}`]);
  const game = await lockGame(run, seat.table_id);
  if (game) {
    if (game.pending?.by === seat.seat_no) {
      await run(`UPDATE table_games SET pending = NULL WHERE id = $1`, [game.id]);
    }
    if (seat.playing) await dropFromOrder(run, game, seat.seat_no, new Date());
  }
  await run(
    `UPDATE tables SET closed_at = now() WHERE id = $1 AND closed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM table_seats WHERE table_id = $1 AND left_at IS NULL)`,
    [seat.table_id],
  );
  await tableEvent(run, seat.table_id, "seat");
  if (seat.playing) await tableEvent(run, seat.table_id, "board");
  return seat.table_id;
}

// The autopass job (`table_autopass`, every 30 seconds): every overdue game,
// each in its own transaction so one bad table does not hold the rest.
export async function autopass(): Promise<number> {
  const due = await queryOrThrow<{ table_id: string }>(
    `SELECT table_id FROM table_games WHERE ended_at IS NULL AND turn_due <= now() LIMIT 500`,
  );
  for (const { table_id } of due) {
    await transaction((run) => applyOverdue(run, table_id)).catch((error) =>
      log("error", "autopass failed", { error: String(error) })
    );
  }
  return due.length;
}

// The sweeper of §6.1, one operator: closed tables and tables silent for an
// hour go, and their seats, lines, games, scores and hidden rows with them by
// cascade. In batches, as the other sweepers.
export async function pruneTables(): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < 100; batch++) {
    const [row] = await queryOrThrow<{ count: string }>(
      `WITH doomed AS (
         SELECT id FROM tables
          WHERE closed_at IS NOT NULL OR last_move_at < now() - interval '${IDLE_MINUTES} minutes'
          LIMIT 1000
       ), gone AS (DELETE FROM tables WHERE id IN (SELECT id FROM doomed) RETURNING 1)
       SELECT count(*)::text AS count FROM gone`,
    );
    const went = Number(row?.count ?? 0);
    total += went;
    if (went < 1000) break;
  }
  return total;
}

// Whom `{table, seat}` names, for POST /blocks (§8.9, protocol §4.8): the
// identity at that live seat, only if the caller sits at the same table and it
// is not the caller. Null otherwise, and the block route answers 204 anyway.
export async function seatedOther(run: Query, me: string, tableId: string, seatNo: number): Promise<string | null> {
  const [row] = await run<{ other: string }>(
    `SELECT o.identity AS other FROM table_seats o
       JOIN table_seats mine ON mine.table_id = o.table_id AND mine.identity = $1 AND mine.left_at IS NULL
      WHERE o.table_id = $2 AND o.seat_no = $3 AND o.left_at IS NULL AND o.identity <> $1`,
    [me, tableId, seatNo],
  );
  return row?.other ?? null;
}

// A line the caller may hide (POST /hidden {line}, screen 19): published, at
// the table they sit at, said since they sat down, and not their own.
export const HIDEABLE_LINE = `SELECT l.id FROM table_lines l
    JOIN table_seats s ON s.table_id = l.table_id AND s.identity = $1 AND s.left_at IS NULL
   WHERE l.id = $2 AND l.visible_at IS NOT NULL AND l.created_at >= s.joined_at
     AND l.kind IN ('line', 'application', 'refusal')
     AND l.author_identity IS DISTINCT FROM $1`;

// The board as this seat may see it. No class here keeps a hand yet, so
// nothing is cut; when one does, this is the one place that cuts it (§6.1).
// The table's score by seat: it lives on the seat and outlasts games (§6.1,
// table_scores); only live seats — the one who left does not take it along.
export async function scoreOf(run: Query, tableId: string): Promise<Record<string, number>> {
  const rows = await run<{ seat_no: number; points: number }>(
    `SELECT s.seat_no, sc.points FROM table_scores sc JOIN table_seats s ON s.id = sc.seat_id
      WHERE s.table_id = $1 AND s.left_at IS NULL`,
    [tableId],
  );
  return Object.fromEntries(rows.map((r) => [String(r.seat_no), r.points]));
}

export function boardFor(
  game: { state: GameState; seq: number; pending: unknown; turn_due: Date | null } | null,
  score: Record<string, number> = {},
  over = false,
  viewer: number | null = null,
) {
  if (!game) return null;
  const s = game.state;
  // The contract's Board (docs/api/openapi.yaml): whose turn by seat, the
  // turn's term as expires_at; score by seat from table_scores. What is
  // hidden is cut here and nowhere else (§6.1): a hand but one's own, the
  // stock but its size, a word but to its setter — `viewer` is the seat asking.
  const state: Record<string, unknown> = { order: s.order, moves: s.board };
  if (s.dots) state.dots = s.dots;
  if (s.deck) state.deck = deckFor(s.deck, viewer);
  if (s.word) state.word = wordFor(s.word, viewer);
  return {
    seq: game.seq,
    state,
    turn: s.turn === null ? null : s.order[s.turn] ?? null,
    score,
    over,
    expires_at: game.turn_due ? Math.floor(new Date(game.turn_due).getTime() / 1000) : null,
    pending: game.pending ?? null,
  };
}

// The board as a frame carries it (protocol §4.4 `board`): the running game,
// or the last one over, with the table's score — what GET /tables/:id answers.
export async function boardNow(run: Query, tableId: string, viewer: number | null = null) {
  const running = await lockGame(run, tableId);
  const [last] = running ? [] : await run<{ state: GameState; seq: number; pending: unknown; turn_due: Date | null }>(
    `SELECT state, seq, pending, NULL::timestamptz AS turn_due FROM table_games
      WHERE table_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [tableId],
  );
  return boardFor(running ?? last ?? null, await scoreOf(run, tableId), !running && !!last, viewer);
}

// Frames for a table's rooms (chat/relay.ts): `NOTIFY table_event` with
// "<table>|board", "<table>|seat" or "<table>|line|<line id>". The relay reads
// the state itself, so the notice stays far under Postgres's 8000 bytes
// whatever the board holds. Sent inside the writing transaction: it arrives
// on commit and not at all on a rollback.
export const tableEvent = (run: Query, tableId: string, kind: "board" | "seat" | "line", id = "") =>
  run(`SELECT pg_notify('table_event', $1)`, [`${tableId}|${kind}${id ? `|${id}` : ""}`]);
