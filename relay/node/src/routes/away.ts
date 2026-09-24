// POST /away and DELETE /away — stepping away (chat spec §8.2 "отошёл",
// protocol §4.9, screen 20 of the storefronts).
//
// Not a pause of the interface but a state of the identity on the node: until
// `stepped_away_until` there is no product for the person, and every signed
// request but four answers 409 stepped_away (lib/identity_guard.ts) — and but
// a repeat of POST /away with its own nonce, which answers the stored {until}
// (protocol §2, 2026-09-24). One transaction takes what the spec lists:
//
//  - one's phrases, published and waiting for the queue alike — DELETE, not
//    hiding, so the slots are free at once; the likes on them go by cascade;
//  - the likes one gave (owner, 18.09.2026), with like_count and both sides'
//    counters taken back as a take-back would — the liked phrases return to
//    the feed and "liked" empties;
//  - one's matches are put out the way a phrase's expiry puts them out, with
//    no word to the other side about why;
//  - in every live conversation one is marked away_marked and the other side
//    gets `peer_stepped_away` on the socket; conversations are not frozen —
//    each side's clock keeps its own count (§8.2).
//
// Not here, and said so: tables and table likes, games and the seat (the node
// has no tables yet); closing this session's sockets — the freezing channel
// would close them with 4002, "the identity moved", which is the wrong word
// for a step away, so they stay open and every request through them is refused.
//
// Coming back early is DELETE: stepped_away_until = now(). The marks are left
// for one's own first line in each conversation to clear (chats.ts).

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { base64urlToBytes, sunsetHeader } from "../lib/identity_auth.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

// limits.tsv away.span.short / hour / long.
export const AWAY_SPANS = { short: 20, hour: 60, long: 240 } as const;
type SpanName = keyof typeof AWAY_SPANS;

class AwayRetry extends Error {}

async function stepAway(req: Request): Promise<Response> {
  // A like on a new author racing the step away is rare; three tries cover it.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await stepAwayOnce(req.clone());
    } catch (error) {
      if (!(error instanceof AwayRetry)) throw error;
    }
  }
  return refuse("unavailable", "the node cannot write right now", 503);
}

async function stepAwayOnce(req: Request): Promise<Response> {
  // Past the guard's refusal of anyone away, and refused below instead: the
  // one request that makes a person away is also the one whose repeat must
  // find them away. The guard answered that repeat 409 before the nonce was
  // looked at, so a lost answer could never be asked for again (protocol §2;
  // loop quorum, 2026-09-24).
  const caller = await callerOf(req, { allowSteppedAway: true });
  if (caller instanceof Response) return caller;
  const body = await req.json().catch(() => null) as { span?: unknown; nonce?: unknown } | null;
  if (!body || typeof body !== "object") return refuse("invalid_body", "a JSON object is expected", 400);
  if (typeof body.span !== "string" || !(body.span in AWAY_SPANS)) {
    return refuse("invalid_body", "span must be short, hour or long", 400);
  }
  const minutes = AWAY_SPANS[body.span as SpanName];
  const given = typeof body.nonce === "string" ? base64urlToBytes(body.nonce) : null;
  if (!given || given.length !== 16) return refuse("invalid_body", "nonce must be 16 bytes, base64url", 400);
  const me = caller.identityId;

  const away = caller.steppedAwayUntil;
  if (away && away.getTime() > Date.now()) {
    const looked = await query<{ response: unknown }>(
      `SELECT response FROM nonces WHERE session_id = $1 AND nonce = $2 AND route = 'POST /away'`,
      [caller.sessionId, given],
    );
    // The route's own 503 on a database that cannot answer, not the router's 500.
    if (looked === null) return refuse("unavailable", "the node cannot write right now", 503);
    const [kept] = looked;
    if (kept && kept.response !== null) {
      inc("relay_nonce_replay_total", { route: "POST /away" });
      return json(kept.response, 200, sunsetHeader());
    }
    // Anything else while away is what the guard would have said.
    return refuse("stepped_away", "you are away until the time you chose", 409, {
      until: Math.floor(away.getTime() / 1000),
    });
  }

  return await transaction<Response>(async (run) => {
    // The nonce first, as POST /blocks does: a repeat answers what the first
    // answered and does nothing again (protocol §2).
    const fresh = await run<{ nonce: Uint8Array }>(
      `INSERT INTO nonces (session_id, nonce, route, status, response)
       VALUES ($1, $2, 'POST /away', 200, 'null'::jsonb)
       ON CONFLICT DO NOTHING RETURNING nonce`,
      [caller.sessionId, given],
    );
    if (fresh.length === 0) {
      const [kept] = await run<{ route: string; response: { until?: number } | null }>(
        `SELECT route, response FROM nonces WHERE session_id = $1 AND nonce = $2`, [caller.sessionId, given]);
      if (kept && kept.route !== "POST /away") {
        return refuse("invalid_body", "this nonce was used on another route", 409);
      }
      inc("relay_nonce_replay_total", { route: "POST /away" });
      return json(kept?.response ?? {}, 200, sunsetHeader());
    }

    // The counters of everyone whose phrase one liked, and one's own, locked
    // in one order — the order the like and the take-back use (likes.ts), or
    // the two deadlock on the same people. Then the liked phrases' rows, so
    // the expiry sweep (which holds a phrase and cascades into its likes)
    // cannot meet us the other way round.
    const guess = await run<{ author: string }>(
      `SELECT DISTINCT f.author_identity AS author
         FROM likes l JOIN feed_messages f ON f.id = l.feed_message_id
        WHERE l.liker_identity = $1 AND f.author_identity IS NOT NULL`,
      [me],
    );
    const lockedAuthors = new Set(guess.map((g) => g.author));
    await run(`SET LOCAL lock_timeout = '2s'`);
    await run(
      `SELECT 1 FROM identity_stats WHERE identity = ANY($1::uuid[]) ORDER BY identity FOR UPDATE`,
      [[me, ...lockedAuthors]],
    );
    await run(
      // Live ones only: an expired phrase the sweep has not taken yet is the
      // sweep's to lock, in its own order, and its likes go with it by cascade
      // — locking it here met the sweep the other way round (panel, data lens).
      `SELECT 1 FROM feed_messages
        WHERE id IN (SELECT feed_message_id FROM likes WHERE liker_identity = $1) AND expires_at > now()
        ORDER BY id FOR UPDATE`,
      [me],
    );

    // The likes one gave, taken back with their counts — counted from what the
    // DELETE itself removed, not from the list read before the locks: a like
    // or a take-back from one's other device between the two used to be
    // counted wrong for somebody else (review panel 23.09.2026, both lenses).
    const liked = await run<{ feed_message_id: string; author: string | null }>(
      `WITH gone AS (DELETE FROM likes WHERE liker_identity = $1 RETURNING feed_message_id)
       SELECT g.feed_message_id, f.author_identity AS author
         FROM gone g JOIN feed_messages f ON f.id = g.feed_message_id`,
      [me],
    );
    if (liked.some((l) => l.author !== null && !lockedAuthors.has(l.author))) {
      // A like on a new author landed between the guess and the lock: that
      // author's counter is not held. Start again rather than write it unheld.
      throw new AwayRetry();
    }
    if (liked.length > 0) {
      await run(
        `UPDATE feed_messages SET like_count = greatest(like_count - 1, 0) WHERE id = ANY($1::uuid[])`,
        [liked.map((l) => l.feed_message_id)],
      );
      const byAuthor = new Map<string, number>();
      for (const l of liked) if (l.author) byAuthor.set(l.author, (byAuthor.get(l.author) ?? 0) + 1);
      for (const [author, n] of byAuthor) {
        await run(
          `UPDATE identity_stats SET likes_received = greatest(likes_received - $2, 0), updated_at = now()
            WHERE identity = $1`,
          [author, n],
        );
      }
      await run(
        `UPDATE identity_stats SET likes_given = greatest(likes_given - $2, 0), updated_at = now()
          WHERE identity = $1`,
        [me, liked.length],
      );
    }

    // One's phrases, published or waiting for the queue; the likes on them go
    // with them by cascade.
    await run(`DELETE FROM feed_messages WHERE author_identity = $1`, [me]);

    // One's matches, put out as a phrase's expiry puts them out: the inbox and
    // the consent read `expires_at > now()`, and the sweeper takes the rest.
    // A match that already became a conversation is left: the conversation
    // lives by its own clocks.
    await run(
      // A second back: a consent that started before this transaction checks
      // `expires_at > now()` with its own, earlier now() (review panel).
      `UPDATE matches SET expires_at = least(expires_at, now() - interval '1 second')
        WHERE chat_id IS NULL AND id IN (SELECT match_id FROM match_participants WHERE identity = $1)`,
      [me],
    );

    // Every live conversation of one's own: the mark, and one line to the other side.
    const chats = await run<{ chat_id: string }>(
      `UPDATE chat_participants SET away_marked = true
        WHERE identity = $1 AND gone_at IS NULL RETURNING chat_id`,
      [me],
    );
    // Not to one's own rooms: another device of the same person has the
    // conversation open too, and must not be told its own person stepped
    // away. The node drops `except` before the frame leaves (chat/relay.ts).
    const sessions = (await run<{ id: string }>(`SELECT id FROM sessions WHERE identity = $1`, [me])).map((s) => s.id);
    for (const { chat_id } of chats) {
      await run(`SELECT pg_notify('chat_sys', $1)`, [
        `${chat_id}|${JSON.stringify({ kind: "peer_stepped_away", except: sessions })}`,
      ]);
    }

    const [until] = await run<{ until: string }>(
      `UPDATE identities SET stepped_away_until = now() + ($2 * interval '1 minute') WHERE id = $1
       RETURNING floor(extract(epoch from stepped_away_until))::bigint::text AS until`,
      [me, minutes],
    );
    const answer = { until: Number(until.until) };
    await run(`UPDATE nonces SET response = $3::text::jsonb WHERE session_id = $1 AND nonce = $2`, [
      caller.sessionId,
      given,
      JSON.stringify(answer),
    ]);
    inc("relay_away_total", { span: body.span as string });
    return json(answer, 200, sunsetHeader());
  }).catch((error) => {
    if (error instanceof AwayRetry) throw error;
    log("error", "stepping away failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
}

async function comeBack(req: Request): Promise<Response> {
  // One of the four routes a time away lets through (protocol §4.9).
  const caller = await callerOf(req, { allowSteppedAway: true });
  if (caller instanceof Response) return caller;
  return await transaction(async (run) => {
    const back = await run<{ id: string }>(
      `UPDATE identities SET stepped_away_until = now()
        WHERE id = $1 AND stepped_away_until > now() RETURNING id`,
      [caller.identityId],
    );
    // The rooms left open while away were handed nothing; they get what waited
    // now (src/chat/relay.ts; the owner's decision of 2026-09-24). Only on a
    // real return, and only to sessions that can hold a room (panel 2026-09-24).
    if (back.length > 0) {
      await run(
        `SELECT pg_notify('chat_message', cp.chat_id || '::' || s.id)
           FROM chat_participants cp JOIN sessions s ON s.identity = cp.identity
          WHERE cp.identity = $1 AND cp.gone_at IS NULL AND s.frozen_at IS NULL`,
        [caller.identityId],
      );
    }
    return new Response(null, { status: 204, headers: sunsetHeader() });
  }).catch((error) => {
    log("error", "coming back failed", { error: String(error) });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
}

route("POST", "/away", (c) => stepAway(c.req));
route("DELETE", "/away", (c) => comeBack(c.req));

export { comeBack, stepAway };
