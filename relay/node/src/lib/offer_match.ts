// The match of an offer (chat spec §8.5, offers spec §2): a like on a phrase
// with a discount makes the match at once, without a like back. The usual rule
// breaks on its own meaning here — to take the chairs a neighbour gives away,
// one would have to wait for that neighbour to like some phrase of one's own.
//
// The same machine after that: two match_participants rows, the disclaimer,
// double consent (routes/matches.ts). The one who came to the offer has no
// phrase: message_id and text_snapshot NULL (db/062), mode the offer's, so the
// chat's header has a mode. The reason is one for both — the offer — and the
// match lives as long as it does: expires_at is the offer's.
//
// Both names must stand (S7, 2026-09-14): a like on an offer passes by the
// publication that would send an unchecked name through the queue, so the
// author would see a name nobody checked. With the liker's name pending the
// like counts and waits; settleOfferLikes() makes the match once the verdict
// has accepted the name — called where a name becomes accepted.
//
// A venue's offer (offers table, db/050) has no like at all, so it never comes
// here: the target is always a feed_messages row.

import type { Query } from "./db.ts";
import { sha256hex } from "./identity_auth.ts";
import { livePhraseOf } from "./feed_limits.ts";

// sha256(min(a,b) ‖ ':' ‖ max(a,b)) — the pair's one key (db/030 matches.pair_key).
export async function pairKey(a: string, b: string): Promise<string> {
  const [low, high] = a < b ? [a, b] : [b, a];
  return await sha256hex(new TextEncoder().encode(`${low}:${high}`));
}

export type OfferMatch =
  | { state: "matched"; matchId: string }
  // The like counts; the match waits for the liker's name to pass the queue.
  | { state: "name_pending" }
  // Nothing to make: the offer is gone or not an offer, a name does not stand,
  // a block, a live chat or a live match of the pair — the like stays a like.
  | { state: "none" };

// Under the pair lock and the two identity_stats rows, as the like takes them
// (routes/likes.ts): the caller has both before calling.
export async function makeOfferMatch(run: Query, me: string, offerId: string, pk: string): Promise<OfferMatch> {
  const [offer] = await run<{
    author: string; text: string; mode: string; expires_at: Date; my_name: string; their_name: string;
  }>(
    `SELECT f.author_identity AS author, f.text, f.mode, f.expires_at,
            me.name_state AS my_name, them.name_state AS their_name
       FROM feed_messages f
       JOIN identities them ON them.id = f.author_identity
       JOIN identities me   ON me.id = $1
      WHERE f.id = $2 AND f.discount_value IS NOT NULL AND f.author_identity <> $1
        AND ${livePhraseOf("f")}
        AND them.closed_at IS NULL AND me.closed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks b
                         WHERE (b.blocker_identity = $1 AND b.blocked_identity = f.author_identity)
                            OR (b.blocker_identity = f.author_identity AND b.blocked_identity = $1))`,
    [me, offerId],
  );
  if (!offer) return { state: "none" };
  if (offer.their_name !== "accepted") return { state: "none" };
  if (offer.my_name !== "accepted") return { state: "name_pending" };

  // §8.6: while the pair's chat lives, no match is made (routes/likes.ts,
  // chatLives — the same rule, the same reason).
  const [chatLives] = await run<{ n: number }>(
    `SELECT count(*)::int AS n FROM chats c
      WHERE c.pair_key = $1
        AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.chat_id = c.id AND p.gone_at IS NULL)`,
    [pk],
  );
  if (chatLives.n > 0) return { state: "none" };

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
    [crypto.randomUUID(), pk, offer.expires_at],
  );
  // A live match already stands for this pair: a second like of the pair makes
  // no new one (§8.5, "pair_key is unique").
  if (!made) return { state: "none" };
  // The reason is one for both — the offer — and both cards show it (§8.5):
  // the liker's row carries the offer's text and mode too, so the author's
  // inbox and the chat's header read it from either row. message_id stays
  // NULL on the liker's row: that is what says "came to the offer" — the
  // inbox's offer_interest and the header's single starter go by it.
  await run(
    `INSERT INTO match_participants (match_id, identity, message_id, text_snapshot, mode)
     VALUES ($1, $2, NULL, $6, $5), ($1, $3, $4, $6, $5)`,
    [made.id, me, offer.author, offerId, offer.mode, offer.text],
  );
  await run(
    `UPDATE identity_stats SET matches = matches + 1, updated_at = now()
      WHERE identity = ANY(ARRAY[$1, $2]::uuid[])`,
    [me, offer.author],
  );
  return { state: "matched", matchId: made.id };
}

// The likes that waited on this identity's name: the ones it left on live
// offers, and the ones others left on ITS live offers — the author's name
// gates the match as much as the liker's (makeOfferMatch, their_name), and
// settling the liker's side alone left a like on an offer "liked" for good
// once the author's name passed (open.tsv offer.match.authorname, W13-OM).
// Once the name is accepted, each becomes the match it would have been (S7:
// "the like waits as a phrase would"). Its own transaction per pair, under
// the same locks the like takes, so it can run beside likes and consents;
// makeOfferMatch is always called as the liker, so the pair's locks and rows
// are the ones a like takes, whichever side's name was the one waiting.
export async function settleOfferLikes(
  transaction: <T>(run: (query: Query) => Promise<T>) => Promise<T>,
  identity: string,
): Promise<string[]> {
  const waiting = await transaction((run) =>
    run<{ offer: string; liker: string; author: string }>(
      `SELECT f.id AS offer, l.liker_identity AS liker, f.author_identity AS author
         FROM likes l JOIN feed_messages f ON f.id = l.feed_message_id
        WHERE (l.liker_identity = $1 OR f.author_identity = $1)
          AND f.discount_value IS NOT NULL AND ${livePhraseOf("f")}
        ORDER BY l.created_at`,
      [identity],
    )
  );
  const made: string[] = [];
  for (const row of waiting) {
    const pk = await pairKey(row.liker, row.author);
    const result = await transaction<OfferMatch>(async (run) => {
      await run(`SET LOCAL lock_timeout = '2s'`);
      await run(`SELECT pg_advisory_xact_lock(hashtext($1))`, [pk]);
      await run(
        `SELECT 1 FROM identity_stats WHERE identity = ANY($1::uuid[]) ORDER BY identity FOR UPDATE`,
        [[row.liker, row.author]],
      );
      return await makeOfferMatch(run, row.liker, row.offer, pk);
    });
    if (result.state === "matched") made.push(result.matchId);
  }
  return made;
}
