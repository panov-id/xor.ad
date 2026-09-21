// Step 5: a chat message passes through the node (chat spec §8.8).
//
// POST /chats/:id/messages writes the ciphertext into pending_deliveries for
// the other side's live session and answers 202 {local_id, accepted} — the same
// answer, with the same work behind it, whether the other side is connected or
// gone for a week: the row is written first, the answer given, and only then is
// a socket looked for. No "delivered", no "read" (§8.8, 2026-09-12).
// POST /chats/:id/received deletes the caller's own rows; ids that are not the
// caller's are skipped in silence (SEC-19).
//
// The queue keeps chat.pending.max per (chat, recipient) — enforced here — and
// lives chat.pending.ttl — lib/pending_sweeper.ts. The socket that hands a row
// over as it is written is chat/relay.ts; its ticket is issued below.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, bytesToBase64url, sha256hex, sunsetHeader } from "../lib/identity_auth.ts";
import { checkAll, CHAT_MESSAGE_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
// limits.tsv chat.ciphertext.bytes: the base64url text, not the bytes under it —
// 256 emoji sealed and encoded come to 1404 (§8.6).
const CIPHERTEXT_MAX = 2048;
const PENDING_MAX = 200; // limits.tsv chat.pending.max

async function send(req: Request, chatId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return refuse("not_found", "no such chat", 404);
  const body = await readJson<{ local_id?: unknown; ciphertext?: unknown }>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const localId = typeof body.local_id === "string" && UUID.test(body.local_id) ? body.local_id : null;
  if (!localId) return refuse("invalid_body", "local_id must be a uuid", 400);
  if (typeof body.ciphertext !== "string" || body.ciphertext.length === 0 || body.ciphertext.length > CIPHERTEXT_MAX) {
    return refuse("invalid_body", `ciphertext must be base64url of at most ${CIPHERTEXT_MAX} characters`, 400);
  }
  const sealed = base64urlToBytes(body.ciphertext);
  if (!sealed) return refuse("invalid_body", "ciphertext is not base64url", 400);
  const me = caller.identityId;

  const answer = await transaction<Response>(async (run) => {
    const [member] = await run<{ n: number }>(
      // A member whose chat no block stands between (§8.9: a block closes the
      // shared chat to both; step 5 panel, 2026-09-21).
      `SELECT count(*)::int AS n FROM chat_participants me
        WHERE me.chat_id = $1 AND me.identity = $2 AND me.gone_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM chat_participants other
              JOIN blocks b ON (b.blocker_identity = me.identity AND b.blocked_identity = other.identity)
                            OR (b.blocker_identity = other.identity AND b.blocked_identity = me.identity)
             WHERE other.chat_id = me.chat_id AND other.identity <> me.identity)`,
      [chatId, me],
    );
    if (member.n === 0) return refuse("not_found", "no such chat", 404);
    // After membership, not before: protocol §4.3 orders stepped_away, then 404,
    // then 429 — a stranger must not learn a chat exists from a 429 (SEC-22).
    const allowed = checkAll(CHAT_MESSAGE_LIMITS, me);
    if (!allowed.allowed) {
      return refuse("rate_limited", "too many messages this minute", 429, {}, {
        "retry-after": String(allowed.retryAfterSeconds),
      });
    }
    // The other side's live session; a frozen one has nothing to read with.
    await run(
      `INSERT INTO pending_deliveries (chat, recipient_session, local_id, ciphertext)
       SELECT $1, s.id, $3, $4
         FROM chat_participants p
         JOIN sessions s ON s.identity = p.identity AND s.frozen_at IS NULL
        WHERE p.chat_id = $1 AND p.identity <> $2 AND p.gone_at IS NULL
       ON CONFLICT DO NOTHING`,
      [chatId, me, localId, sealed],
    );
    // limits.tsv chat.pending.max: two hundred per (chat, recipient); past that
    // the oldest goes, in silence (§8.8) — a refusal would say "long gone".
    await run(
      `DELETE FROM pending_deliveries d
        WHERE d.chat = $1
          AND (d.recipient_session, d.local_id) IN (
            SELECT recipient_session, local_id FROM (
              SELECT recipient_session, local_id,
                     row_number() OVER (PARTITION BY recipient_session ORDER BY created_at DESC, local_id DESC) AS n
                FROM pending_deliveries WHERE chat = $1
            ) ranked WHERE n > ${PENDING_MAX})`,
      [chatId],
    );
    await run(`UPDATE chats SET last_activity_at = now() WHERE id = $1`, [chatId]);
    await run(
      `UPDATE chat_participants SET last_own_message_at = now(), away_marked = false
        WHERE chat_id = $1 AND identity = $2`,
      [chatId, me],
    );
    // Heard by every node's room on commit (chat/relay.ts): the row is already
    // written, so a socket that is not there loses nothing.
    await run(`SELECT pg_notify('chat_message', $1)`, [`${chatId}:${localId}`]);
    inc("relay_chat_message_total", { result: "accepted" });
    return json({ local_id: localId, accepted: true }, 202, sunsetHeader());
  }).catch((error) => {
    log("error", "chat message failed", { error: String(error) });
    inc("relay_chat_message_total", { result: "storage_failed" });
    return json({ local_id: localId, error: "not_stored" }, 202, sunsetHeader());
  });
  return answer;
}

async function received(req: Request, chatId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return new Response(null, { status: 204, headers: sunsetHeader() });
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((i): i is string => typeof i === "string" && UUID.test(i)) : null;
  if (!ids) return refuse("invalid_body", "ids must be a list of uuids", 400);
  if (ids.length > 0) {
    await transaction(async (run) => {
      await run(
        `DELETE FROM pending_deliveries
          WHERE chat = $1 AND recipient_session = $2 AND local_id = ANY($3::uuid[])`,
        [chatId, caller.sessionId, ids],
      );
    }).catch((error) => log("error", "chat receipt failed", { error: String(error) }));
  }
  return new Response(null, { status: 204, headers: sunsetHeader() });
}

// POST /chats/:id/ticket — a one-time ticket for the room's socket (protocol
// §4.4): the browser's WebSocket carries no custom headers, so the signed call
// buys a ticket and the socket spends it in Sec-WebSocket-Protocol.
const TICKET_SECONDS = 30; // limits.tsv ticket.lifetime

async function ticket(req: Request, chatId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return refuse("not_found", "no such chat", 404);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64url(raw);
  const issued = await transaction<Response>(async (run) => {
    const [member] = await run<{ n: number }>(
      // A member whose chat no block stands between (§8.9: a block closes the
      // shared chat to both; step 5 panel, 2026-09-21).
      `SELECT count(*)::int AS n FROM chat_participants me
        WHERE me.chat_id = $1 AND me.identity = $2 AND me.gone_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM chat_participants other
              JOIN blocks b ON (b.blocker_identity = me.identity AND b.blocked_identity = other.identity)
                            OR (b.blocker_identity = other.identity AND b.blocked_identity = me.identity)
             WHERE other.chat_id = me.chat_id AND other.identity <> me.identity)`,
      [chatId, caller.identityId],
    );
    if (member.n === 0) return refuse("not_found", "no such chat", 404);
    // Tickets share the message budget: each one is a socket, and an unbounded
    // number of them was an unbounded number of rooms (step 5 panel, 2026-09-21).
    const allowed = checkAll(CHAT_MESSAGE_LIMITS, caller.identityId);
    if (!allowed.allowed) {
      return refuse("rate_limited", "too many tickets this minute", 429, {}, {
        "retry-after": String(allowed.retryAfterSeconds),
      });
    }
    await run(
      `INSERT INTO socket_tickets (token_hash, session, chat, expires_at)
       VALUES ($1, $2, $3, now() + interval '${TICKET_SECONDS} seconds')`,
      [await sha256hex(new TextEncoder().encode(token)), caller.sessionId, chatId],
    );
    return json({ ticket: token, expires_in: TICKET_SECONDS }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "ticket failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return issued;
}

route("POST", "/chats/:id/ticket", (c) => ticket(c.req, c.params.id));
route("POST", "/chats/:id/messages", (c) => send(c.req, c.params.id));
route("POST", "/chats/:id/received", (c) => received(c.req, c.params.id));
