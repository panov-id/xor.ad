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
// lives chat.pending.ttl — lib/pending_sweeper.ts. Not here yet: the socket
// that hands a row over as it is written (the ticket and chat/relay.ts).

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, sunsetHeader } from "../lib/identity_auth.ts";
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
  const allowed = checkAll(CHAT_MESSAGE_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many messages this minute", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
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
      `SELECT count(*)::int AS n FROM chat_participants
        WHERE chat_id = $1 AND identity = $2 AND gone_at IS NULL`,
      [chatId, me],
    );
    if (member.n === 0) return refuse("not_found", "no such chat", 404);
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

route("POST", "/chats/:id/messages", (c) => send(c.req, c.params.id));
route("POST", "/chats/:id/received", (c) => received(c.req, c.params.id));
