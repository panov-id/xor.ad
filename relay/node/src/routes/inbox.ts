// GET /inbox — offers to talk and conversations in one answer (chat spec §8.12,
// screens 6 and 7). Nothing is stored for it: it is read from matches,
// match_participants, chats and chat_participants, which is why it survives a
// closed tab and a change of node.
//
// What a row carries is what a match already discloses: the other side's name,
// age, phrase and its mode. What it never carries: the other side's decline
// (seen only by whoever declined, screen 6), the other side's term, and
// `unread` — the device counts that, the node knows nothing about reading
// (owner's decision, 2026-09-17).
//
// Not here yet: offer_interest rows (the offer's one-sided match is blocked on
// the name queue).
//
// The page (protocol §6: ?after, {items, next}; 2026-09-22) is one list read in
// two runs: offers to talk first, newest first, then conversations by their
// last activity. The cursor names the run it stopped in and the row: "m_" or
// "c_", the moment in microseconds — carried as digits, since postgres.js
// rounds a timestamp parameter to milliseconds — and the id. A cursor from a
// conversation skips the offers entirely; one that is not ours is a 400.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sunsetHeader } from "../lib/identity_auth.ts";
import { TERM_PASSED } from "../lib/chat_sweeper.ts";

const PAGE = 100;

async function inbox(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const me = caller.identityId;

  const after = new URL(req.url).searchParams.get("after");
  let cut: { run: "m" | "c"; at: string; id: string } | null = null;
  if (after !== null) {
    const parsed = /^([mc])_(\d{1,20})_([0-9a-f-]{36})$/.exec(after);
    if (!parsed) return refuse("invalid_body", "after is not a cursor from this inbox", 400);
    cut = { run: parsed[1] as "m" | "c", at: parsed[2], id: parsed[3] };
  }

  const matches = cut?.run === "c" ? [] : await query<{
    id: string; name: string; age: number; text: string | null; mode: string; waiting: boolean; created_at: Date; at: string;
  }>(
    `SELECT m.id, them.name, them.age, theirs.text_snapshot AS text, theirs.mode,
            (theirs.accepted_at IS NOT NULL AND mine.accepted_at IS NULL) AS waiting, m.created_at,
            (extract(epoch from m.created_at) * 1000000)::bigint::text AS at
       FROM matches m
       JOIN match_participants mine   ON mine.match_id = m.id AND mine.identity = $1
       JOIN match_participants theirs ON theirs.match_id = m.id AND theirs.identity <> $1
       JOIN identities them ON them.id = theirs.identity
      WHERE m.expires_at > now() AND m.chat_id IS NULL AND mine.declined_at IS NULL
        AND ($2::bigint IS NULL OR ((extract(epoch from m.created_at) * 1000000)::bigint, m.id) < ($2::bigint, $3::uuid))
      ORDER BY m.created_at DESC, m.id DESC LIMIT ${PAGE + 1}`,
    [me, cut?.run === "m" ? cut.at : null, cut?.run === "m" ? cut.id : null],
  );
  // One more than a page tells whether another page exists; the offers take
  // the page first, and only what they leave is read from conversations.
  const offersFull = matches !== null && matches.length > PAGE;
  const room = matches === null ? 0 : Math.max(0, PAGE - matches.length);
  const chats = await query<{
    id: string; name: string; age: number; ends: string; created_at: Date; over: boolean;
    peer_id: string; peer_long: string; peer_half: string | null; peer_sig: string | null; match_id: string | null;
    my_epoch: number; peer_epoch: number; at: string;
  }>(
    `SELECT c.id, them.name, them.age, c.created_at, (o.gone_at IS NOT NULL) AS over,
            floor(extract(epoch from COALESCE(p.last_own_message_at, c.created_at)
              + p.idle_ttl_minutes * interval '1 minute'))::bigint::text AS ends,
            them.id AS peer_id, them.identity_public_key AS peer_long,
            -- The peer's ephemeral half (§8.13), the conversation's own since
            -- db/036: a match gone does not take it.
            o.match_id, o.ephemeral_public_key AS peer_half, o.ephemeral_signature AS peer_sig,
            p.key_epoch AS my_epoch, o.key_epoch AS peer_epoch,
            (extract(epoch from c.last_activity_at) * 1000000)::bigint::text AS at
       FROM chat_participants p
       JOIN chats c ON c.id = p.chat_id
       JOIN chat_participants o ON o.chat_id = c.id AND o.identity <> $1
       JOIN identities them ON them.id = o.identity
      WHERE p.identity = $1 AND p.gone_at IS NULL AND NOT (${TERM_PASSED})
        AND ($2::bigint IS NULL OR ((extract(epoch from c.last_activity_at) * 1000000)::bigint, c.id) < ($2::bigint, $3::uuid))
      ORDER BY c.last_activity_at DESC, c.id DESC LIMIT ${room + 1}`,
    [me, cut?.run === "c" ? cut.at : null, cut?.run === "c" ? cut.id : null],
  );
  if (matches === null || chats === null) {
    return refuse("unavailable", "the node cannot answer right now", 503);
  }

  const pageOfOffers = matches.slice(0, PAGE);
  const pageOfChats = offersFull ? [] : chats.slice(0, room);
  // The cursor names the last row given and the run it is in: another offer
  // waits, or a conversation beyond the room left on this page.
  const lastOffer = pageOfOffers[pageOfOffers.length - 1];
  const lastChat = pageOfChats[pageOfChats.length - 1];
  const next = offersFull
    ? `m_${lastOffer.at}_${lastOffer.id}`
    : chats.length > room && room > 0
    ? `c_${lastChat.at}_${lastChat.id}`
    : chats.length > 0 && room === 0 && lastOffer
    ? `m_${lastOffer.at}_${lastOffer.id}`
    : undefined;
  const items = [
    ...pageOfOffers.map((m) => ({
      kind: "match", id: m.id, name: m.name, age: m.age,
      phrase: { text: m.text ?? "", mode: m.mode },
      waiting_for_you: m.waiting, state: "pending",
    })),
    ...pageOfChats.map((c) => ({
      kind: "chat", id: c.id, name: c.name, age: c.age,
      // Over for the other side: screen 7 shows "ended" — the fact, never their term.
      chat_expires_at: Number(c.ends), state: c.over ? "ended" : "open",
      // What the client needs to open the conversation's keys (§8.13): the
      // peer's ephemeral half with its signature, the long key that signed it
      // (and from which the safety code is derived), and the ids that decide
      // which direction key is whose. Absent half: the peer consented without
      // keys, and the conversation is not encrypted.
      me,
      // The match the halves were signed for: the peer verifies the binding.
      ...(c.match_id ? { match_id: c.match_id } : {}),
      // The epoch of one's own half, and whether the other side has asked for
      // new keys (§8.13 reissue): the question to put to the person.
      key_epoch: c.my_epoch,
      rekey_requested: c.peer_epoch > c.my_epoch,
      peer: {
        key_epoch: c.peer_epoch,
        identity_id: c.peer_id,
        identity_public_key: c.peer_long,
        ...(c.peer_half ? { ephemeral_public_key: c.peer_half, ephemeral_signature: c.peer_sig } : {}),
      },
    })),
  ];
  return json({ items, ...(next ? { next } : {}) }, 200, sunsetHeader());
}

route("GET", "/inbox", (c) => inbox(c.req));
