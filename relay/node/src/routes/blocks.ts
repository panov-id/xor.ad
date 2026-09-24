// Step 7: blocks (chat spec §8.9, protocol §4.8, screens 5 and 10).
//
// A person blocks by what they can see — a phrase or a conversation — never by
// an identity, which they are never shown. The answer is 204 whatever happened:
// a phrase that is gone, someone else's chat, one's own phrase, a repeat. A
// different answer would be an oracle. A block hides each one's phrases from the
// other (routes/feed.ts), stops likes and matches (routes/likes.ts), and ends
// the shared conversation for both, closing its rooms 4003.
//
// POST carries a nonce (protocol §2): a block is otherwise idempotent, but a
// captured request replayed inside the signature's window would restore a block
// its owner had lifted. The first answer is stored per (session, nonce); a
// repeat gets it back and nothing is done again.
//
// GET lists {id, since} by the opaque blocks.id, which does not lead back to an
// identity (DATA-21). DELETE answers 204 for someone else's id too (SEC-14).
//
// Not here yet: blocking by a seat at a table — there are no tables.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, sha256hex, sunsetHeader } from "../lib/identity_auth.ts";
import { checkAll, BLOCK_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
const done = () => new Response(null, { status: 204, headers: sunsetHeader() });

async function block(req: Request): Promise<Response> {
  // Past the guard's stepped-away refusal and refused below instead, after the
  // replay: protocol §2 answers a repeat even from a time away (as POST /away).
  const caller = await callerOf(req, { allowSteppedAway: true });
  if (caller instanceof Response) return caller;
  const body = await readJson<{ feed?: unknown; chat?: unknown; nonce?: unknown }>(req);
  if (!body) return refuse("invalid_body", "the body is not json", 400);
  const given = typeof body.nonce === "string" ? base64urlToBytes(body.nonce) : null;
  if (!given || given.length !== 16) return refuse("invalid_body", "nonce must be 16 bytes, base64url", 400);
  const feed = typeof body.feed === "string" && UUID.test(body.feed) ? body.feed : null;
  const chat = typeof body.chat === "string" && UUID.test(body.chat) ? body.chat : null;
  if ((feed === null) === (chat === null)) return refuse("invalid_body", "exactly one of feed or chat", 400);
  // A repeat is answered before the limit is spent (protocol §2): counting it
  // used a slot per repeat, and once the hour's slots were gone the repeat of
  // a block already made got 429 instead of its 204 (loop, 2026-09-24). The
  // transaction below still settles a race between two first tries.
  const looked = await query<{ route: string }>(
    `SELECT route FROM nonces WHERE session_id = $1 AND nonce = $2`, [caller.sessionId, given]);
  // The route's own 503 on a database that cannot answer, not the router's 500.
  if (looked === null) return refuse("unavailable", "the node cannot read right now", 503);
  const [seen] = looked;
  if (seen) {
    if (seen.route !== "POST /blocks") return refuse("invalid_body", "this nonce was used on another route", 409);
    // Answered, and counted as what it is: a repeat, not a block (review panel
    // of the loop, 2026-09-24).
    inc("relay_nonce_replay_total", { route: "POST /blocks" });
    return done();
  }
  const away = caller.steppedAwayUntil;
  if (away && away.getTime() > Date.now()) {
    return refuse("stepped_away", "you are away until the time you chose", 409, {
      until: Math.floor(away.getTime() / 1000),
    });
  }
  const allowed = checkAll(BLOCK_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many blocks this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  const me = caller.identityId;

  return await transaction<Response>(async (run) => {
    // The nonce first: a repeat stops here, before anything is done again.
    const fresh = await run<{ nonce: Uint8Array }>(
      `INSERT INTO nonces (session_id, nonce, route, status, response)
       VALUES ($1, $2, 'POST /blocks', 204, 'null'::jsonb)
       ON CONFLICT DO NOTHING RETURNING nonce`,
      [caller.sessionId, given],
    );
    if (fresh.length === 0) {
      // The same nonce on this route is a repeat: the stored answer, nothing
      // done again. On another route it is a mistake or a trick — 409 (protocol
      // §2, SEC-25).
      const [kept] = await run<{ route: string }>(
        `SELECT route FROM nonces WHERE session_id = $1 AND nonce = $2`, [caller.sessionId, given]);
      if (kept && kept.route !== "POST /blocks") {
        return refuse("invalid_body", "this nonce was used on another route", 409);
      }
      inc("relay_nonce_replay_total", { route: "POST /blocks" });
      return done();
    }

    // Whom the phrase or the conversation leads to — only if it is the
    // caller's to see: a live phrase of somebody else, or a chat they are in.
    const [target] = feed
      ? await run<{ other: string }>(
        `SELECT author_identity AS other FROM feed_messages
          WHERE id = $1 AND author_identity <> $2 AND visible_at IS NOT NULL`,
        [feed, me],
      )
      : await run<{ other: string }>(
        `SELECT o.identity AS other FROM chat_participants p
           JOIN chat_participants o ON o.chat_id = p.chat_id AND o.identity <> p.identity
          WHERE p.chat_id = $1 AND p.identity = $2`,
        [chat, me],
      );
    if (!target) return done();

    // The pair's lock, as the like takes it (routes/likes.ts): without it a like
    // that had passed its block check could write a match after this block had
    // committed and found none to delete (step 7 panel, data lens).
    const [low, high] = me < target.other ? [me, target.other] : [target.other, me];
    const pk = await sha256hex(new TextEncoder().encode(`${low}:${high}`));
    await run(`SELECT pg_advisory_xact_lock(hashtext($1))`, [pk]);

    await run(
      `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [me, target.other],
    );
    // The pair's match goes out, and their conversation ends for both (§8.9).
    await run(
      `DELETE FROM matches m WHERE m.id IN (
         SELECT a.match_id FROM match_participants a
           JOIN match_participants b ON b.match_id = a.match_id
          WHERE a.identity = $1 AND b.identity = $2)`,
      [me, target.other],
    );
    const ended = await run<{ chat_id: string }>(
      `UPDATE chat_participants SET gone_at = now()
        WHERE gone_at IS NULL AND chat_id IN (
          SELECT a.chat_id FROM chat_participants a
            JOIN chat_participants b ON b.chat_id = a.chat_id
           WHERE a.identity = $1 AND b.identity = $2)
        RETURNING chat_id`,
      [me, target.other],
    );
    for (const id of new Set(ended.map((r) => r.chat_id))) {
      await run(`DELETE FROM pending_deliveries WHERE chat = $1`, [id]);
      await run(`SELECT pg_notify('chat_closed', $1)`, [id]);
    }
    inc("relay_block_total", { by: feed ? "feed" : "chat" });
    return done();
  }).catch((error) => {
    log("error", "block failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
}

async function list(req: Request): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const rows = await query<{ id: string; since: string }>(
    `SELECT id, floor(extract(epoch from created_at))::bigint::text AS since
       FROM blocks WHERE blocker_identity = $1 ORDER BY created_at DESC`,
    [caller.identityId],
  );
  if (rows === null) return refuse("unavailable", "the node cannot answer right now", 503);
  return json(rows.map((r) => ({ id: r.id, since: Number(r.since) })), 200, sunsetHeader());
}

async function lift(req: Request, id: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  if (UUID.test(id)) {
    // A failed write is not "done" (step 7 panel): 503, so the person tries again.
    const gone = await query(`DELETE FROM blocks WHERE id = $1 AND blocker_identity = $2`, [id, caller.identityId]);
    if (gone === null) return refuse("unavailable", "the node cannot write right now", 503);
  }
  return done();
}

route("POST", "/blocks", (c) => block(c.req));
route("GET", "/blocks", (c) => list(c.req));
route("DELETE", "/blocks/:id", (c) => lift(c.req, c.params.id));
