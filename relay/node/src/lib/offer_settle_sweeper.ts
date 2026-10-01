// The likes on offers that waited on a name and were never settled (open.tsv
// offer.match.settle.retry, W13-OR). settleAfterVerdict() runs after the
// verdict's commit with no retry: a process that died between the commit and
// the settlement, or an error the catch in feed_verdict.ts only logged, left
// the like "liked" until the offer expired — with both names standing and
// nothing in the way. Every minute this finds such likes and settles them
// through the same settleOfferLikes(), under the like's own locks; what a
// live match, a live chat or a block stops stays a like, as it would.
//
// The identities, not the likes: settleOfferLikes() takes an identity and
// walks every live offer like of its own and on its own offers, so one call
// per liker covers the pair. The pair's live match is skipped here by the
// same key the matches table carries — sha256(min ‖ ':' ‖ max), in SQL — so
// a settled pair costs no transaction a minute; were the key ever to differ,
// settleOfferLikes() would still refuse the second match on its own.

import { queryOrThrow, transaction } from "./db.ts";
import { livePhraseOf } from "./feed_limits.ts";
import { inc } from "./metrics.ts";
import { log } from "./log.ts";
import { settleOfferLikes } from "./offer_match.ts";

const BATCH = 200;

// The pair's key as lib/offer_match.ts pairKey() makes it, for the two uuids
// given as text columns.
const PAIR_KEY_SQL = (a: string, b: string) =>
  `encode(sha256(convert_to(least(${a}::text, ${b}::text) || ':' || greatest(${a}::text, ${b}::text), 'UTF8')), 'hex')`;

export async function sweepOfferLikes(): Promise<number> {
  const likers = await queryOrThrow<{ identity: string }>(
    `SELECT DISTINCT l.liker_identity AS identity
       FROM likes l
       JOIN feed_messages f ON f.id = l.feed_message_id
       JOIN identities me   ON me.id = l.liker_identity
       JOIN identities them ON them.id = f.author_identity
      WHERE f.discount_value IS NOT NULL AND ${livePhraseOf("f")}
        AND me.name_state = 'accepted' AND them.name_state = 'accepted'
        AND me.closed_at IS NULL AND them.closed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM blocks b
                         WHERE (b.blocker_identity = me.id AND b.blocked_identity = them.id)
                            OR (b.blocker_identity = them.id AND b.blocked_identity = me.id))
        AND NOT EXISTS (SELECT 1 FROM matches m
                         WHERE m.pair_key = ${PAIR_KEY_SQL("me.id", "them.id")} AND m.expires_at > now())
        AND NOT EXISTS (SELECT 1 FROM chats c JOIN chat_participants p ON p.chat_id = c.id
                         WHERE c.pair_key = ${PAIR_KEY_SQL("me.id", "them.id")} AND p.gone_at IS NULL)
      LIMIT ${BATCH}`,
  );
  let made = 0;
  for (const { identity } of likers) {
    try {
      made += (await settleOfferLikes(transaction, identity)).length;
    } catch (error) {
      // The next minute tries again; named in the log, not hidden.
      log("error", "an offer like left behind was not settled", { identity, error: String(error) });
    }
  }
  if (made > 0) {
    inc("relay_like_total", { result: "matched" }, made);
    inc("relay_offer_like_settled_total", { by: "sweeper" }, made);
  }
  return made;
}
