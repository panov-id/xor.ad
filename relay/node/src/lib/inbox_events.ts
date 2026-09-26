// What happened while the person was away, read from the tables GET /inbox
// already reads (chat spec §8.12, step 8 of §13 without the games; P3).
//
// No notifications table, no writes in the routes that make the events: a
// match, a consent, a chat and a queued reply are already rows in matches,
// match_participants, chats, chat_participants and pending_deliveries, and the
// inbox is the one request a cold start makes. So the events are counted here
// at GET time, against a moment the client names — `since`, the unix seconds of
// its last visit — and nothing is stored for them. A client that names no
// moment is told about everything live, which is what a first visit is.
//
// Five events, each an answer to "what did I miss":
//   new_matches      offers to talk that arrived after `since`
//   waiting_for_you  offers the other side agreed to after `since`, mine still open
//   new_chats        conversations that opened after `since`
//   pending_messages replies waiting in this session's queue (§8.8) — the node
//                    cannot count what was read, but it can count what it has
//                    not yet handed over; the text stays ciphertext
//   ending_soon      conversations whose own term ends within the last fifth of
//                    it — for a 10-minute span the last 2 minutes, for 260 the
//                    last 52
//
// Where the socket is open the same events arrive as frames (§8.1); this is
// the cold path only.

import { query } from "./db.ts";
import { TERM_PASSED } from "./chat_sweeper.ts";

export type InboxEvents = {
  new_matches: number;
  waiting_for_you: number;
  new_chats: number;
  pending_messages: number;
  ending_soon: number;
};

// The share of one's own span that counts as "soon": the last fifth.
export const SOON_SHARE = 5;

// `since`: unix seconds, digits only, as a client stores the moment of its last
// visit. Absent — the dawn of time, every live row is new. Anything else is
// not a moment this inbox understands.
export function parseSince(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  if (!/^\d{1,10}$/.test(raw)) return undefined;
  return Number(raw);
}

// Whether a conversation that ends at `endsAt` (unix seconds) over a span of
// `spanMinutes` is in its last fifth at `nowSeconds`. Already over: not soon —
// the inbox does not list it, and an ended row is a fact, not a warning.
export function endingSoon(endsAt: number, spanMinutes: number, nowSeconds: number): boolean {
  const left = endsAt - nowSeconds;
  return left > 0 && left <= (spanMinutes * 60) / SOON_SHARE;
}

// The SQL form of endingSoon, over the aliases the inbox queries use: p for
// one's own chat_participants row, c for the chat.
export const ENDING_SOON = `NOT (${TERM_PASSED}) AND COALESCE(p.last_own_message_at, c.created_at)
  + p.idle_ttl_minutes * interval '1 minute' - now() <= p.idle_ttl_minutes * interval '1 minute' / ${SOON_SHARE}`;

// Counted over everything live, not over one page: the client wants a badge,
// and a badge that counts only the first hundred rows lies quietly past that.
export async function inboxEvents(me: string, sessionId: string, since: number | null): Promise<InboxEvents | null> {
  const [row] = (await query<{
    new_matches: number; waiting_for_you: number; new_chats: number; pending_messages: number; ending_soon: number;
  }>(
    `WITH offers AS (
       SELECT m.created_at, theirs.accepted_at AS theirs_at, mine.accepted_at AS mine_at
         FROM matches m
         JOIN match_participants mine   ON mine.match_id = m.id AND mine.identity = $1
         JOIN match_participants theirs ON theirs.match_id = m.id AND theirs.identity <> $1
        WHERE m.expires_at > now() AND m.chat_id IS NULL AND mine.declined_at IS NULL
     ), talks AS (
       SELECT c.id, c.created_at, (${ENDING_SOON}) AS soon
         FROM chat_participants p
         JOIN chats c ON c.id = p.chat_id
        WHERE p.identity = $1 AND p.gone_at IS NULL AND NOT (${TERM_PASSED})
     )
     SELECT (SELECT count(*) FROM offers WHERE created_at > to_timestamp($3))::int AS new_matches,
            (SELECT count(*) FROM offers WHERE theirs_at IS NOT NULL AND mine_at IS NULL AND theirs_at > to_timestamp($3))::int AS waiting_for_you,
            (SELECT count(*) FROM talks WHERE created_at > to_timestamp($3))::int AS new_chats,
            (SELECT count(*) FROM pending_deliveries d JOIN talks t ON t.id = d.chat WHERE d.recipient_session = $2)::int AS pending_messages,
            (SELECT count(*) FROM talks WHERE soon)::int AS ending_soon`,
    [me, sessionId, since ?? 0],
  )) ?? [null];
  return row;
}
