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
import { base64urlToBytes, bytesToBase64url, sha256hex, sunsetHeader, verifyByLongKey } from "../lib/identity_auth.ts";
import { checkAll, CHAT_MESSAGE_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";
import { TERM_PASSED } from "../lib/chat_sweeper.ts";

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
    // One's own term first (§8.10): past it, the sender's end is written here
    // rather than left to the sweep's next minute, and the answer is the 404 of
    // a chat that is not there.
    const ended = await run<{ chat_id: string }>(
      `UPDATE chat_participants p SET gone_at = now() FROM chats c
        WHERE c.id = p.chat_id AND p.chat_id = $1 AND p.identity = $2
          AND p.gone_at IS NULL AND ${TERM_PASSED}
        RETURNING p.chat_id`,
      [chatId, me],
    );
    if (ended.length > 0) {
      await run(`DELETE FROM pending_deliveries WHERE chat = $1`, [chatId]);
      await run(`SELECT pg_notify('chat_closed', $1)`, [chatId]);
      return refuse("not_found", "no such chat", 404);
    }
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

// DELETE /chats/:id — closed by hand, for both at once (§5, screen 8). Over for
// both, its queue gone, its rooms told to close 4003. A chat that is not the
// caller's, or already over, answers the same 404.
async function close(req: Request, chatId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return refuse("not_found", "no such chat", 404);
  const answer = await transaction<Response>(async (run) => {
    const [member] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM chat_participants
        WHERE chat_id = $1 AND identity = $2 AND gone_at IS NULL`,
      [chatId, caller.identityId],
    );
    if (member.n === 0) return refuse("not_found", "no such chat", 404);
    await run(`UPDATE chat_participants SET gone_at = now() WHERE chat_id = $1 AND gone_at IS NULL`, [chatId]);
    await run(`DELETE FROM pending_deliveries WHERE chat = $1`, [chatId]);
    await run(`SELECT pg_notify('chat_closed', $1)`, [chatId]);
    inc("relay_chat_ended_total", { by: "hand" });
    return json({ state: "closed" }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "chat close failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

// POST /chats/alive — which of these conversations still live for the caller
// (§8.10). The client wipes whatever is not in the answer, so: only the caller's
// own, live and inside the caller's own term; anything else is simply absent,
// alike for a stranger's chat and one that never was; and a failed read is 503,
// never an empty list, or a bad minute on the node would erase a history.
const ALIVE_MAX = 200; // limits.tsv chat.alive.ids

async function alive(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const body = await readJson<{ ids?: unknown }>(req);
  const ids = Array.isArray(body?.ids) ? body!.ids : null;
  if (!ids || ids.length > ALIVE_MAX || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return refuse("invalid_body", `ids must be at most ${ALIVE_MAX} uuids`, 400);
  }
  try {
    const rows = await transaction((run) =>
      run<{ chat_id: string }>(
        `SELECT p.chat_id FROM chat_participants p JOIN chats c ON c.id = p.chat_id
          WHERE p.identity = $1 AND p.chat_id = ANY($2::uuid[])
            AND p.gone_at IS NULL AND NOT (${TERM_PASSED})`,
        [caller.identityId, ids],
      )
    );
    const live = new Set(rows.map((r) => r.chat_id));
    return json({ alive: (ids as string[]).filter((i) => live.has(i)) }, 200, sunsetHeader());
  } catch (error) {
    log("error", "alive failed", { error: String(error) });
    return refuse("unavailable", "the node cannot answer right now", 503);
  }
}

// PATCH /chats/:id — one's own span: 10, 30, 60 minutes or 260, "while we talk"
// (§8.6). It moves the caller's own end and nobody else's.
const SPANS = [10, 30, 60, 260];

async function span(req: Request, chatId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return refuse("not_found", "no such chat", 404);
  const body = await readJson<{ span?: unknown }>(req);
  if (typeof body?.span !== "number" || !SPANS.includes(body.span)) {
    return refuse("invalid_body", "span must be 10, 30, 60 or 260", 400);
  }
  const done = await transaction((run) =>
    run<{ chat_id: string }>(
      // Not past one's own term: a span of 260 set between the term and the
      // sweep's next minute revived what §8.10 had ended (step 7 panel).
      `UPDATE chat_participants p SET idle_ttl_minutes = $3 FROM chats c
        WHERE c.id = p.chat_id AND p.chat_id = $1 AND p.identity = $2
          AND p.gone_at IS NULL AND NOT (${TERM_PASSED}) RETURNING p.chat_id`,
      [chatId, caller.identityId, body.span],
    )
  ).catch(() => null);
  if (done === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (done.length === 0) return refuse("not_found", "no such chat", 404);
  return json({ span: body.span }, 200, sunsetHeader());
}

// POST /chats/:id/rekey — the key reissued after a device lost its pair
// (§8.13). The side without keys publishes a new half at the next epoch; the
// other side, once its person agrees, answers with its own at the same epoch;
// then both derive the new keys. Each half is signed by the long key over
// "xor.rekey.v1\n<chat_id>\n<epoch>\n" ‖ SPKI — bound to this chat and epoch,
// so the node can neither mint one nor move one. What went before stays shut:
// nothing restores the old keys.
//
// One step at a time: a side may start the next epoch only when both hold the
// same one, and may answer only the epoch the other side started. Anything
// else is 409 — the node does not let two reissues race each other.
// Not built: a frame telling the other side's open room; it learns from the
// inbox (rekey_requested), which is what a returning device reads first.
export const REKEY_DOMAIN = "xor.rekey.v1\n";
export function rekeyToSign(chatId: string, epoch: number, spki: Uint8Array): Uint8Array {
  const prefix = new TextEncoder().encode(`${REKEY_DOMAIN}${chatId}\n${epoch}\n`);
  const out = new Uint8Array(prefix.length + spki.length);
  out.set(prefix);
  out.set(spki, prefix.length);
  return out;
}

async function rekey(req: Request, chatId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (!UUID.test(chatId)) return refuse("not_found", "no such chat", 404);
  // The same budget as tickets and messages: a reissue is one more write on
  // the chat, and nothing here needs a number of its own.
  const allowed = checkAll(CHAT_MESSAGE_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many chat actions this minute", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  const body = await readJson<{ epoch?: unknown; ephemeral_public_key?: unknown; ephemeral_signature?: unknown }>(req);
  const epoch = body?.epoch;
  const key = body?.ephemeral_public_key;
  const signature = body?.ephemeral_signature;
  if (typeof epoch !== "number" || !Number.isInteger(epoch) || epoch < 1 || epoch > 1_000_000 ||
      typeof key !== "string" || typeof signature !== "string" || key.length > 256 || signature.length > 256) {
    return refuse("invalid_body", "a rekey carries epoch, ephemeral_public_key and ephemeral_signature", 400);
  }
  const bytes = base64urlToBytes(key);
  if (!bytes) return refuse("invalid_body", "ephemeral_public_key is not base64url", 400);

  const answer = await transaction<Response>(async (run) => {
    // Both rows, in identity order — the order every writer of this table
    // takes them in (step-7 panel, 2026-09-21: lock order by identity).
    const rows = await run<{ identity: string; key_epoch: number; gone_at: Date | null; long: string; over: boolean }>(
      `SELECT p.identity, p.key_epoch, p.gone_at, i.identity_public_key AS long,
              (${TERM_PASSED}) AS over
         FROM chat_participants p
         JOIN chats c ON c.id = p.chat_id
         JOIN identities i ON i.id = p.identity
        WHERE p.chat_id = $1
        ORDER BY p.identity
        FOR UPDATE OF p`,
      [chatId],
    );
    const me = rows.find((r) => r.identity === caller.identityId);
    const other = rows.find((r) => r.identity !== caller.identityId);
    if (!me || !other || me.gone_at || me.over) return refuse("not_found", "no such chat", 404);
    const [blocked] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM blocks
        WHERE (blocker_identity = $1 AND blocked_identity = $2) OR (blocker_identity = $2 AND blocked_identity = $1)`,
      [me.identity, other.identity],
    );
    if (blocked.n > 0) return refuse("not_found", "no such chat", 404);
    if (!(await verifyByLongKey(me.long, rekeyToSign(chatId, epoch, bytes), signature))) {
      return refuse("invalid_body", "the half is not signed by your long key for this chat and epoch", 400);
    }
    const starting = me.key_epoch === other.key_epoch && epoch === me.key_epoch + 1;
    const answering = other.key_epoch === me.key_epoch + 1 && epoch === other.key_epoch;
    if (!starting && !answering) {
      return refuse("rekey_out_of_step", `the next epoch here is ${Math.max(me.key_epoch, other.key_epoch) + (me.key_epoch === other.key_epoch ? 1 : 0)}`, 409);
    }
    await run(
      `UPDATE chat_participants
          SET key_epoch = $3, ephemeral_public_key = $4, ephemeral_signature = $5
        WHERE chat_id = $1 AND identity = $2`,
      [chatId, me.identity, epoch, key, signature],
    );
    inc("relay_chat_rekey_total", { step: starting ? "asked" : "agreed" });
    return json({ state: answering ? "agreed" : "waiting", epoch }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "rekey failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

route("POST", "/chats/:id/rekey", (c) => rekey(c.req, c.params.id));
route("POST", "/chats/alive", (c) => alive(c.req));
route("PATCH", "/chats/:id", (c) => span(c.req, c.params.id));
route("DELETE", "/chats/:id", (c) => close(c.req, c.params.id));
route("POST", "/chats/:id/ticket", (c) => ticket(c.req, c.params.id));
route("POST", "/chats/:id/messages", (c) => send(c.req, c.params.id));
route("POST", "/chats/:id/received", (c) => received(c.req, c.params.id));
