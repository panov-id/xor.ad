// Step 3 of the build order: a like, and the match a mutual one makes.
//
// Chat spec §8.4 and §8.5, in the order they happen inside one transaction:
// a pair lock and the two identity_stats rows first (DATA-1..3, the three races
// reproduced in the container on 2026-09-15), then the like itself as an
// INSERT … SELECT that carries every rule, then the counters — only when a row
// actually went in — and last the match query.
//
// The answer is {state: 'liked'} whenever the like did not count for a reason
// the caller must not learn: one's own phrase, an author who blocked or was
// blocked, another age band, a phrase that is gone or never was. Telling those
// apart would be an oracle, and §8.9 promises that nobody learns about a block.
//
// Not here yet, and said so: the one-sided match of an offer (§8.5), which also
// has to send an unchecked name through the queue first (S7, 2026-09-14). An
// offer's like counts; its match is the next piece.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { sha256hex, sunsetHeader } from "../lib/identity_auth.ts";
import { band } from "../lib/feed_geo.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";
import { checkAll, FEED_READ_LIMITS, LIKE_LIMITS } from "../lib/rate_limit.ts";
import { SOON_MINUTES } from "./feed.ts";

const UUID = /^[0-9a-fA-F-]{36}$/;
// A ceiling for "no ceiling": the band above 20 is open upwards (feed_geo.band),
// and SQL wants a number on both sides of BETWEEN.
const NO_CEILING = 1000;

async function pairKey(a: string, b: string): Promise<string> {
  const [low, high] = a < b ? [a, b] : [b, a];
  return await sha256hex(new TextEncoder().encode(`${low}:${high}`));
}

const liked = () => json({ state: "liked" }, 200, sunsetHeader());
// Not in the contract's enum before 2026-09-21: it named liked, matched and
// spent, and a take-back had no word of its own — answering "liked" to it
// would say the opposite of what happened.
const unliked = () => json({ state: "unliked" }, 200, sunsetHeader());

async function likePhrase(req: Request, target: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const allowed = checkAll(LIKE_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many likes this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  if (!UUID.test(target)) return refuse("invalid_body", "that is not a phrase id", 400);
  const me = caller.identityId;

  const answer = await transaction<Response>(async (run) => {
    const [mine] = await run<{ age: number }>(
      `SELECT age FROM identities WHERE id = $1 AND closed_at IS NULL`, [me],
    );
    if (!mine) return refuse("unauthorized", "the request is not signed by a live session", 401);

    const [phrase] = await run<{ author: string; offer: boolean }>(
      `SELECT author_identity AS author, discount_value IS NOT NULL AS offer
         FROM feed_messages WHERE id = $1`,
      [target],
    );

    // §8.4: a like needs a live phrase of one's own, except on an offer. The
    // refusal depends only on the caller's own state and on the target being an
    // offer, which is public — it tells nothing about the author.
    if (!phrase?.offer) {
      const [own] = await run<{ n: number }>(
        `SELECT count(*)::int AS n FROM feed_messages
          WHERE author_identity = $1 AND visible_at IS NOT NULL AND expires_at > now()`,
        [me],
      );
      if (own.n === 0) {
        inc("relay_like_total", { result: "no_own_phrase" });
        return refuse("refused", "a like needs a live phrase of your own", 409);
      }
    }
    if (!phrase) {
      inc("relay_like_total", { result: "not_counted" });
      return liked();
    }

    // The two locks of §8.4, in this order and as separate statements. The pair
    // lock is what makes two crossing likes see each other; the ordered row
    // locks keep the counters and the publishing limits in one queue.
    //
    // Not proven by this node's tests, and said so: a test that fires crossing
    // likes through this route (sixty pairs at once) stayed green with both
    // locks removed — in one process the two transactions never overlap in the
    // window that matters. The races were reproduced in the container with two
    // hand-driven connections (§8.4, 2026-09-15); a test that drives two
    // connections step by step is what would prove these lines, and it is open.
    // Two seconds for any lock, then 503 (likes panel, 2026-09-21): a flood of
    // likes on one author must fail while the pool of four is still free,
    // rather than hold every connection for the fifteen-second statement cap.
    await run(`SET LOCAL lock_timeout = '2s'`);
    const pk = await pairKey(me, phrase.author);
    await run(`SELECT pg_advisory_xact_lock(hashtext($1))`, [pk]);
    await run(
      `SELECT 1 FROM identity_stats WHERE identity = ANY($1::uuid[]) ORDER BY identity FOR UPDATE`,
      [[me, phrase.author]],
    );

    const mineBand = band(mine.age);
    const inserted = await run<{ feed_message_id: string }>(
      `INSERT INTO likes (liker_identity, feed_message_id)
       SELECT $1, f.id
         FROM feed_messages f
         JOIN identities author ON author.id = f.author_identity
        WHERE f.id = $2
          AND f.author_identity <> $1
          AND f.visible_at IS NOT NULL AND f.expires_at > now()
          AND author.closed_at IS NULL
          AND author.age BETWEEN $3 AND $4
          AND $5 BETWEEN (CASE WHEN author.age <= 20 THEN greatest(13, author.age - 2)
                                                    ELSE least(21, author.age - 2) END)
                     AND (CASE WHEN author.age <= 20 THEN author.age + 2 ELSE ${NO_CEILING} END)
          AND NOT EXISTS (SELECT 1 FROM blocks b
                           WHERE (b.blocker_identity = $1 AND b.blocked_identity = author.id)
                              OR (b.blocker_identity = author.id AND b.blocked_identity = $1))
       ON CONFLICT DO NOTHING
       RETURNING feed_message_id`,
      [me, target, mineBand.low, mineBand.high ?? NO_CEILING, mine.age],
    );
    if (inserted.length === 0) {
      inc("relay_like_total", { result: "not_counted" });
      return liked();
    }

    await run(`UPDATE feed_messages SET like_count = like_count + 1 WHERE id = $1`, [target]);
    await run(
      `UPDATE identity_stats
          SET likes_given    = likes_given    + (identity = $1)::int,
              likes_received = likes_received + (identity = $2)::int,
              updated_at     = now()
        WHERE identity = ANY(ARRAY[$1, $2]::uuid[])`,
      [me, phrase.author],
    );

    if (phrase.offer) {
      inc("relay_like_total", { result: "liked" });
      return liked();
    }

    // §8.5: a match counts only while both phrases are alive, both names stand
    // and both ages are still inside each other's band — checked now, not at
    // the moment of the first like.
    const [pairing] = await run<{
      mine_id: string; mine_text: string; mine_mode: string;
      their_text: string; their_mode: string; expires_at: Date;
    }>(
      `SELECT my_msg.id AS mine_id, my_msg.text AS mine_text, my_msg.mode AS mine_mode,
              their_msg.text AS their_text, their_msg.mode AS their_mode,
              least(my_msg.expires_at, their_msg.expires_at) AS expires_at
         FROM feed_messages their_msg
         JOIN likes his_like ON his_like.liker_identity = their_msg.author_identity
         JOIN feed_messages my_msg ON my_msg.id = his_like.feed_message_id
         JOIN identities them ON them.id = their_msg.author_identity
         JOIN identities me   ON me.id   = $1
        WHERE their_msg.id = $2
          AND my_msg.author_identity = $1
          AND their_msg.visible_at IS NOT NULL AND their_msg.expires_at > now()
          AND my_msg.visible_at   IS NOT NULL AND my_msg.expires_at   > now()
          AND them.closed_at IS NULL AND me.closed_at IS NULL
          AND them.name_state = 'accepted' AND me.name_state = 'accepted'
        ORDER BY his_like.created_at DESC
        LIMIT 1`,
      [me, target],
    );
    if (!pairing) {
      inc("relay_like_total", { result: "liked" });
      return liked();
    }

    // §8.6: while the pair's chat lives, no match is made — the like counts and
    // goes no further. Without this a mutual like took over the pair's match row
    // and lost its chat, and agreeing then failed on chats.pair_key (step 5
    // panel, 2026-09-21, data lens). The phrase joining the chat's header
    // (§8.7) is not built yet.
    const [chatLives] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM chats c
        WHERE c.pair_key = $1
          AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)`,
      [pk],
    );
    if (chatLives.n > 0) {
      inc("relay_like_total", { result: "liked" });
      return liked();
    }

    // DATA-5: an expired match nobody swept must not stand in the way of a new one.
    await run(
      `DELETE FROM match_participants p USING matches m
        WHERE p.match_id = m.id AND m.pair_key = $1 AND m.expires_at <= now()`,
      [pk],
    );
    const [made] = await run<{ id: string }>(
      `INSERT INTO matches (id, pair_key, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (pair_key) DO UPDATE
          SET id = EXCLUDED.id, created_at = now(), expires_at = EXCLUDED.expires_at, chat_id = NULL
        WHERE matches.expires_at <= now()
       RETURNING id`,
      [crypto.randomUUID(), pk, pairing.expires_at],
    );
    if (!made) {
      // A live match already stands for this pair: the like counted, nothing new.
      inc("relay_like_total", { result: "liked" });
      return liked();
    }
    await run(
      `INSERT INTO match_participants (match_id, identity, message_id, text_snapshot, mode)
       VALUES ($1, $2, $3, $4, $5), ($1, $6, $7, $8, $9)`,
      [made.id, me, pairing.mine_id, pairing.mine_text, pairing.mine_mode,
       phrase.author, target, pairing.their_text, pairing.their_mode],
    );
    await run(
      `UPDATE identity_stats SET matches = matches + 1, updated_at = now()
        WHERE identity = ANY(ARRAY[$1, $2]::uuid[])`,
      [me, phrase.author],
    );
    inc("relay_like_total", { result: "matched" });
    return json({ state: "matched", match_id: made.id }, 200, sunsetHeader());
  }).catch((error) => {
    log("error", "like failed", { error: String(error) });
    inc("relay_like_total", { result: "storage_failed" });
    return refuse("unavailable", "the node cannot write right now", 503);
  });

  return answer;
}

// DELETE /feed/:id/like — §8.4: a like is taken back only while no match came
// of it. Under the same two locks as the like, so a take-back and a crossing
// like of the same pair queue behind each other instead of each reading the
// other's old snapshot (DATA-2). The spec's second condition, no row in
// `chats`, waits for step 5: there is no `chats` table yet, and a pair cannot
// have a chat without first having the match this already checks.
//
// Nothing to take back answers the same as a take-back: whether this person
// liked that phrase is their own business, but the phrase being gone or never
// existing is not something to confirm.
async function unlikePhrase(req: Request, target: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const allowed = checkAll(LIKE_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many likes this hour", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }
  if (!UUID.test(target)) return refuse("invalid_body", "that is not a phrase id", 400);
  const me = caller.identityId;

  const answer = await transaction<Response>(async (run) => {
    const [phrase] = await run<{ author: string; offer: boolean }>(
      `SELECT author_identity AS author, discount_value IS NOT NULL AS offer
         FROM feed_messages WHERE id = $1`, [target],
    );
    if (!phrase) return unliked();
    // §8.4 and screens 5 and 25: a like on an offer makes its match at once
    // and is not taken back. The one-sided match is not built yet; the rule is.
    if (phrase.offer) {
      inc("relay_unlike_total", { result: "spent" });
      return json({ state: "spent" }, 200, sunsetHeader());
    }
    // Two seconds for any lock, then 503 (likes panel, 2026-09-21): a flood of
    // likes on one author must fail while the pool of four is still free,
    // rather than hold every connection for the fifteen-second statement cap.
    await run(`SET LOCAL lock_timeout = '2s'`);
    const pk = await pairKey(me, phrase.author);
    await run(`SELECT pg_advisory_xact_lock(hashtext($1))`, [pk]);
    await run(
      `SELECT 1 FROM identity_stats WHERE identity = ANY($1::uuid[]) ORDER BY identity FOR UPDATE`,
      [[me, phrase.author]],
    );
    const [matched] = await run<{ n: number }>(
      // Live matches only: nothing sweeps matches yet, and an expired row left
      // behind held every later like of the pair for ever (review panel,
      // 2026-09-21) — while the like route already treats it as gone (DATA-5).
      // Per phrase, owner's decision of 2026-09-21 (screen 25): the like on the
      // phrase a live match came from is spent; the pair's other likes are not.
      `SELECT count(*)::int AS n
         FROM matches m JOIN match_participants p ON p.match_id = m.id
        WHERE m.pair_key = $1 AND m.expires_at > now() AND p.message_id = $2`, [pk, target],
    );
    if (matched.n > 0) {
      inc("relay_unlike_total", { result: "spent" });
      return json({ state: "spent" }, 200, sunsetHeader());
    }
    const gone = await run<{ feed_message_id: string }>(
      `DELETE FROM likes WHERE liker_identity = $1 AND feed_message_id = $2 RETURNING feed_message_id`,
      [me, target],
    );
    if (gone.length > 0) {
      await run(`UPDATE feed_messages SET like_count = greatest(like_count - 1, 0) WHERE id = $1`, [target]);
      await run(
        `UPDATE identity_stats
            SET likes_given    = greatest(likes_given    - (identity = $1)::int, 0),
                likes_received = greatest(likes_received - (identity = $2)::int, 0),
                updated_at     = now()
          WHERE identity = ANY(ARRAY[$1, $2]::uuid[])`,
        [me, phrase.author],
      );
    }
    inc("relay_unlike_total", { result: gone.length > 0 ? "taken_back" : "nothing" });
    return unliked();
  }).catch((error) => {
    log("error", "unlike failed", { error: String(error) });
    inc("relay_unlike_total", { result: "storage_failed" });
    return refuse("unavailable", "the node cannot write right now", 503);
  });
  return answer;
}

// GET /likes — what this identity liked that is still alive (chat spec §8.4,
// protocol §4.3; screen 25 of the storefronts, depth-client §4.10). Since
// 17.09.2026 a liked phrase leaves the feed, so this list is the only place a
// like can be taken back from.
//
// Cards of the feed's own shape, plus `state` and `liked_at`, in the order of
// the like, newest first. `matched` when a live match came out of this phrase
// with me in it — then DELETE /feed/:id/like answers `spent`, and the card is
// an offer to talk. An offer's one-sided match is not built (see the top of
// this file), so an offer is `liked` here until it is.
//
// It goes by itself, as the feed does: an expired or taken-down phrase, and
// the phrases of anyone on either side of a block (§8.9). Counted against the
// same per-identity reads as the feed — it is reading the feed by another door.
const LIKES_PAGE = 30; // limits.tsv feed.page.size

interface LikedRow {
  id: string;
  text: string;
  mode: string;
  lang: string;
  lat_published: number;
  lon_published: number;
  area_radius: number;
  like_count: number;
  visible_at: Date;
  discount_value: string | null;
  conditions: string | null;
  liked_at: Date;
  liked_at_cursor: string;
  matched: boolean;
  soon: boolean;
}

async function myLikes(req: Request, url: URL): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const allowed = checkAll(FEED_READ_LIMITS, caller.identityId);
  if (!allowed.allowed) {
    return refuse("rate_limited", "too many reads of the feed", 429, {}, {
      "retry-after": String(allowed.retryAfterSeconds),
    });
  }

  // The feed's cursor, for the feed's reasons (routes/feed.ts): microseconds as
  // digits — never a Date, never a timestamp-looking string — and the id to
  // split likes made in the same microsecond.
  const after = url.searchParams.get("after");
  let cursorAt: string | null = null;
  let cursorId: string | null = null;
  if (after) {
    const cut = after.lastIndexOf("_");
    const at = cut < 0 ? "" : after.slice(0, cut);
    const id = cut < 0 ? "" : after.slice(cut + 1);
    // Sixteen digits of microseconds reach the year 2286; nineteen passed the
    // test and overflowed bigint in the database, which answered 503 and wrote
    // a "query failed" line for a caller's typo (review panel 23.09.2026).
    if (!/^[0-9]{1,16}$/.test(at) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return refuse("invalid_body", "after is not a cursor from this list", 400);
    }
    cursorAt = at;
    cursorId = id;
  }

  const rows = await query<LikedRow>(
    `SELECT f.id, f.text, f.mode, f.lang, f.lat_published, f.lon_published, f.area_radius,
            f.like_count, f.visible_at, f.discount_value, f.conditions,
            l.created_at AS liked_at,
            (extract(epoch from l.created_at) * 1000000)::bigint::text AS liked_at_cursor,
            f.expires_at <= now() + (${SOON_MINUTES} * interval '1 minute') AS soon,
            EXISTS (SELECT 1 FROM matches m
                      JOIN match_participants p ON p.match_id = m.id AND p.message_id = f.id
                      JOIN match_participants q ON q.match_id = m.id AND q.identity = $1
                     WHERE m.expires_at > now()) AS matched
       FROM likes l
       JOIN feed_messages f ON f.id = l.feed_message_id
      WHERE l.liker_identity = $1
        AND f.visible_at IS NOT NULL AND f.expires_at > now()
        AND NOT EXISTS (SELECT 1 FROM blocks b
                         WHERE (b.blocker_identity = $1 AND b.blocked_identity = f.author_identity)
                            OR (b.blocker_identity = f.author_identity AND b.blocked_identity = $1))
        AND ($2::bigint IS NULL OR (l.created_at, f.id) <
              (timestamptz 'epoch' + $2::bigint * interval '1 microsecond', $3::uuid))
      ORDER BY l.created_at DESC, f.id DESC
      LIMIT ${LIKES_PAGE}`,
    [caller.identityId, cursorAt, cursorId],
  );
  if (rows === null) {
    inc("relay_likes_list_total", { result: "unavailable" });
    return refuse("unavailable", "the node cannot answer right now", 503);
  }
  inc("relay_likes_list_total", { result: "served" });
  const last = rows[rows.length - 1];
  return json({
    items: rows.map((row) => ({
      kind: "phrase",
      id: row.id,
      text: row.text,
      mode: row.mode,
      lang: row.lang,
      lat: row.lat_published,
      lon: row.lon_published,
      area_radius: row.area_radius,
      like_count: row.like_count,
      // No created_at: the span is fixed, so another person's start to the second
      // is their end to the second (§8.11; the owner's decision of 2026-09-24).
      ...(row.discount_value ? { offer: { discount_value: row.discount_value, conditions: row.conditions } } : {}),
      state: row.matched ? "matched" : "liked",
      ...(row.soon ? { soon: true } : {}),
      liked_at: Math.floor(row.liked_at.getTime() / 1000),
    })),
    next: rows.length === LIKES_PAGE && last ? `${last.liked_at_cursor}_${last.id}` : null,
  }, 200, sunsetHeader());
}

route("GET", "/likes", (c) => myLikes(c.req, c.url));
route("POST", "/feed/:id/like", (c) => likePhrase(c.req, c.params.id));
route("DELETE", "/feed/:id/like", (c) => unlikePhrase(c.req, c.params.id));

export { likePhrase, myLikes, unlikePhrase };
