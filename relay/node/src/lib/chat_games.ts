// The game of a chat of two (chat spec §6, screen 18; protocol §4.7; db/076).
// The engine is the table's (lib/tables_engine.ts): the rules are the class's.
// What differs is the place: two people who matched, a conversation that has a
// term of its own for each side, and a game that dies with it.
//
// Outside, the two are seat 1 (who proposed the game) and seat 2; the
// identities stay in `state.players` and never leave the node. What is hidden
// is cut by the viewer's seat, as at a table (lib/tables.ts boardFor).

import type { Query } from "./db.ts";
import { boardFor, type GameState } from "./tables.ts";

export interface ChatGameRow {
  chat_id: string;
  class: string;
  set: string;
  state: GameState & { players?: string[] };
  score: Record<string, number>;
  seq: number;
  last_move_hash: string | null;
  pending: { id: string; kind: string; class?: string; set?: string; by: string } | null;
  over: boolean;
}

// Both sides of a live conversation, the caller among them; null is the 404 a
// stranger and a finished chat get alike.
export async function liveChat(run: Query, chatId: string, me: string): Promise<{ other: string } | null> {
  const rows = await run<{ identity: string; gone: boolean }>(
    `SELECT identity, gone_at IS NOT NULL AS gone FROM chat_participants WHERE chat_id = $1`,
    [chatId],
  );
  if (rows.length !== 2 || rows.some((r) => r.gone) || !rows.some((r) => r.identity === me)) return null;
  return { other: rows.find((r) => r.identity !== me)!.identity };
}

export async function lockChatGame(run: Query, chatId: string): Promise<ChatGameRow | null> {
  const [row] = await run<ChatGameRow>(`SELECT * FROM chat_games WHERE chat_id = $1 FOR UPDATE`, [chatId]);
  return row ?? null;
}

export const seatOf = (row: ChatGameRow, identity: string): number | null => {
  const at = row.state.players?.indexOf(identity) ?? -1;
  return at < 0 ? null : at + 1;
};

// The earlier of the two sides' terms (§5 of the chat spec: each side its own).
export const TERM_SQL = `(SELECT min(coalesce(p.last_own_message_at, c.created_at) + p.idle_ttl_minutes * interval '1 minute')
                            FROM chat_participants p JOIN chats c ON c.id = p.chat_id WHERE p.chat_id = $1)`;

// An open proposal as a viewer sees it: never who by identity, only whether it
// is theirs.
export const pendingFor = (row: ChatGameRow, viewer: string) =>
  row.pending
    ? { id: row.pending.id, kind: row.pending.kind, class: row.pending.class, set: row.pending.set, mine: row.pending.by === viewer }
    : null;

export function viewOf(row: ChatGameRow, viewer: string) {
  const seat = seatOf(row, viewer);
  const started = (row.state.players?.length ?? 0) === 2;
  const board = started
    ? boardFor({ state: row.state, seq: row.seq, pending: null, turn_due: null }, row.score, row.over, seat)
    : null;
  return { class: row.class, set: row.set, your_seat: seat, board, pending: pendingFor(row, viewer) };
}

// The frame a room of this chat gets, built for the room's own identity.
export async function chatGameFrame(run: Query, chatId: string, identity: string) {
  const [row] = await run<ChatGameRow>(`SELECT * FROM chat_games WHERE chat_id = $1`, [chatId]);
  return row ? viewOf(row, identity) : null;
}

// Games whose conversation ended for either side, or whose term has passed.
export async function sweepChatGames(run: Query): Promise<number> {
  const gone = await run(
    `DELETE FROM chat_games g
      WHERE g.expires_at < now()
         OR EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = g.chat_id AND p.gone_at IS NOT NULL)
     RETURNING 1`,
  );
  return gone.length;
}
