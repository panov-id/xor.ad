// GET /inbox — offers to talk and conversations in one answer (chat spec §8.12,
// screens 6 and 7). Nothing is stored for it: it is read from matches,
// match_participants, chats and chat_participants, which is why it survives a
// closed tab and a change of node.
//
// What a row carries is what a match already discloses: the other side's name,
// age, phrase and its mode. What it never carries: the other side's decline
// (seen only by whoever declined, screen 6), the other side's term, and
// `unread` — the device counts that, the node knows nothing about reading
// (owner's decision, 2026-09-17). What it carries since P3 (§8.12, step 8):
// what happened since the moment the client names in ?since — an offer that
// arrived or was agreed to, a conversation that opened, replies still queued
// for this session, a term in its last fifth — as flags on the rows and as
// counts over everything live in `events` (lib/inbox_events.ts). Read from the
// same tables at GET time; nothing is written for it anywhere.
//
// Since P3b (2026-09-26, after P5's db/062): a match born of a like on my
// offer is an offer_interest row for me — the other side has no phrase in it
// (theirs.message_id IS NULL); the reason is one for both, so `phrase` is the
// offer on both rows and mine adds `offer` whole — and an ordinary match for
// them.
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
import { ENDING_SOON, inboxEvents, parseSince } from "../lib/inbox_events.ts";

const PAGE = 100;

async function inbox(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const me = caller.identityId;

  // What happened since the last visit (§8.12; lib/inbox_events.ts): `since`
  // is the moment the client names, and every row says whether it is newer.
  const since = parseSince(new URL(req.url).searchParams.get("since"));
  if (since === undefined) return refuse("invalid_body", "since is not a moment in unix seconds", 400);

  const after = new URL(req.url).searchParams.get("after");
  let cut: { run: "m" | "c"; at: string; id: string } | null = null;
  if (after !== null) {
    const parsed = /^([mc])_(\d{1,20})_([0-9a-f-]{36})$/.exec(after);
    if (!parsed) return refuse("invalid_body", "after is not a cursor from this inbox", 400);
    cut = { run: parsed[1] as "m" | "c", at: parsed[2], id: parsed[3] };
  }

  const matches = cut?.run === "c" ? [] : await query<{
    id: string; name: string; age: number; text: string | null; mode: string; waiting: boolean; created_at: Date; at: string;
    arrived: boolean; answered: boolean; consented: boolean;
    interest: boolean; offer_id: string | null; offer_text: string | null; offer_mode: string;
    discount_value: string | null; conditions: string | null;
    their_ends: string | null; my_ends: string | null; mine_is_phrase: boolean;
  }>(
    `SELECT m.id, them.name, them.age, theirs.text_snapshot AS text, theirs.mode,
            (theirs.accepted_at IS NOT NULL AND mine.accepted_at IS NULL) AS waiting, m.created_at,
            (extract(epoch from m.created_at) * 1000000)::bigint::text AS at,
            (m.created_at > to_timestamp($4)) AS arrived,
            (theirs.accepted_at IS NOT NULL AND theirs.accepted_at > to_timestamp($4)) AS answered,
            -- My own consent (P10): the node knows it, so a client that lost
            -- its memory still sees "waiting for the answer" after a restart.
            (mine.accepted_at IS NOT NULL) AS consented,
            -- The other side came to my offer (§8.5, db/062; P5): they have no
            -- phrase in the match, and the reason is my offer — shown as such.
            (theirs.message_id IS NULL) AS interest,
            mine.message_id AS offer_id, mine.text_snapshot AS offer_text, mine.mode AS offer_mode,
            -- The discount and its conditions, while the offer is still in the
            -- feed; gone with it — the match outlives nothing, but the read is
            -- LEFT so a row without them is a row, not a hole.
            f.discount_value, f.conditions,
            -- What is left of both phrases (§8.11, «Мэтч», 14.09.2026): the one
            -- exception to "someone else's end never leaves the node" — the end
            -- of a phrase that already led to a mutual like is told to the
            -- other side of that match, and to no one else. Sheet 24 draws it
            -- as a bar, never as a number. A phrase no longer in the feed has
            -- no end to tell (LEFT, null).
            floor(extract(epoch from tf.expires_at))::bigint::text AS their_ends,
            floor(extract(epoch from mf.expires_at))::bigint::text AS my_ends,
            (mf.id IS NOT NULL) AS mine_is_phrase
       FROM matches m
       JOIN match_participants mine   ON mine.match_id = m.id AND mine.identity = $1
       JOIN match_participants theirs ON theirs.match_id = m.id AND theirs.identity <> $1
       JOIN identities them ON them.id = theirs.identity
       LEFT JOIN feed_messages f ON theirs.message_id IS NULL AND f.id = mine.message_id
       LEFT JOIN feed_messages tf ON tf.id = theirs.message_id
       LEFT JOIN feed_messages mf ON mf.id = mine.message_id
      WHERE m.expires_at > now() AND m.chat_id IS NULL AND mine.declined_at IS NULL
        AND ($2::bigint IS NULL OR ((extract(epoch from m.created_at) * 1000000)::bigint, m.id) < ($2::bigint, $3::uuid))
      ORDER BY m.created_at DESC, m.id DESC LIMIT ${PAGE + 1}`,
    [me, cut?.run === "m" ? cut.at : null, cut?.run === "m" ? cut.id : null, since ?? 0],
  );
  // One more than a page tells whether another page exists; the offers take
  // the page first, and only what they leave is read from conversations.
  const offersFull = matches !== null && matches.length > PAGE;
  const room = matches === null ? 0 : Math.max(0, PAGE - matches.length);
  const chats = await query<{
    id: string; name: string; age: number; ends: string; span: number; created_at: Date; over: boolean;
    peer_id: string; peer_long: string; peer_half: string | null; peer_sig: string | null; match_id: string | null;
    my_epoch: number; peer_epoch: number; at: string;
    opened: boolean; soon: boolean; pending: number; activity: string;
  }>(
    `SELECT c.id, them.name, them.age, c.created_at, (o.gone_at IS NOT NULL) AS over,
            -- Since the last visit (§8.12): opened after it, in its last fifth,
            -- replies waiting in this session's queue, and the last activity
            -- for the device's "you missed a message" (lib/inbox_events.ts).
            (c.created_at > to_timestamp($4)) AS opened,
            (${ENDING_SOON}) AS soon,
            (SELECT count(*) FROM pending_deliveries d WHERE d.chat = c.id AND d.recipient_session = $5)::int AS pending,
            floor(extract(epoch from c.last_activity_at))::bigint::text AS activity,
            floor(extract(epoch from COALESCE(p.last_own_message_at, c.created_at)
              + p.idle_ttl_minutes * interval '1 minute'))::bigint::text AS ends,
            p.idle_ttl_minutes AS span,
            them.id AS peer_id, them.identity_public_key AS peer_long,
            -- The peer's ephemeral half (§8.13), the conversation's own since
            -- db/031: a match gone does not take it.
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
    [me, cut?.run === "c" ? cut.at : null, cut?.run === "c" ? cut.id : null, since ?? 0, caller.sessionId],
  );
  // Counted over everything live, whatever page this is: the badge on the tab.
  const events = await inboxEvents(me, caller.sessionId, since);
  if (matches === null || chats === null || events === null) {
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
      // Somebody came to my offer (§8.5; P3b, agreed 7a/53 on 2026-09-26):
      // kind offer_interest, and the offer as the reason. The reason is one
      // for both (P5): `phrase` carries the offer's text on both rows, and the
      // author's row adds `offer` — its id, and the discount while it lives.
      kind: m.interest ? "offer_interest" : "match", id: m.id, name: m.name, age: m.age,
      phrase: { text: m.text ?? "", mode: m.mode, ...(m.their_ends !== null ? { expires_at: Number(m.their_ends) } : {}) },
      // My own phrase in this match (sheet 24's first card), read from my side
      // of it only — mine.identity = $1 above; an offer on my side is `offer`.
      ...(!m.interest && m.mine_is_phrase
        ? { my_phrase: { text: m.offer_text ?? "", mode: m.offer_mode, ...(m.my_ends !== null ? { expires_at: Number(m.my_ends) } : {}) } }
        : {}),
      ...(m.interest
        ? {
          offer: {
            id: m.offer_id, text: m.offer_text ?? "", mode: m.offer_mode,
            ...(m.discount_value !== null ? { discount_value: m.discount_value } : {}),
            ...(m.conditions !== null ? { conditions: m.conditions } : {}),
          },
        }
        : {}),
      waiting_for_you: m.waiting, state: "pending",
      // A row here has no chat and is not declined by me (the WHERE above):
      // either I agreed and wait for them, or I have not answered yet.
      my_consent: m.consented ? "waiting" : "none",
      // Since the last visit (§8.12): the offer arrived, or the other side
      // agreed to it, after `since`.
      arrived_since: m.arrived, answered_since: m.answered,
    })),
    ...pageOfChats.map((c) => ({
      kind: "chat", id: c.id, name: c.name, age: c.age,
      // Over for the other side: screen 7 shows "ended" — the fact, never their term.
      chat_expires_at: Number(c.ends), state: c.over ? "ended" : "open",
      // One's own span (§8.6), for the header's "fades after 1h of YOUR
      // silence"; the other side's is neither shown nor sent (23.09.2026).
      // Named my_span, not span: a bare "span" on this row is what the test of
      // an ended conversation watches for as the other side's term leaking.
      my_span: c.span,
      // Since the last visit (§8.12, lib/inbox_events.ts): opened after
      // `since`; replies the node still holds for this session (§8.8) — what
      // it has not handed over, never what was read; in the last fifth of
      // one's own term; and the last activity, unix seconds, for the device
      // to compare with its own last line and say "you missed a message".
      opened_since: c.opened,
      pending_messages: c.pending,
      ending_soon: c.soon,
      last_activity_at: Number(c.activity),
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
  return json({ items, events, ...(since !== null ? { since } : {}), ...(next ? { next } : {}) }, 200, sunsetHeader());
}

route("GET", "/inbox", (c) => inbox(c.req));
