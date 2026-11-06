// What stops a person from filling the feed, and why each part of it is shaped
// the way it is (chat spec §8.3).
//
// There are four rules and they answer different things:
//
//   one at a time   while your own phrase is being checked, the next cannot be
//                   sent. Held by a partial unique index (db/025), not by a
//                   count — a count races a SELECT that looked empty a moment
//                   ago, and the index refuses the second insert outright.
//   four an hour    counted from **moments**, not from a number: an integer
//                   cannot drop out after an hour, and once phrases began to be
//                   deleted — a take-down, a step-away — a counter had nothing
//                   left to count from (2026-09-14, D4/D5/S7).
//   the pause       five refusals inside an hour ending at the last refusal
//                   buys fifteen minutes of nothing.
//   the hold        outside a pause, if something of yours is already being
//                   checked and together with the hour's refusals it makes five
//                   or more, the send waits for the verdicts. Seconds, not
//                   minutes — and deliberately not the same thing as a pause:
//                   the earlier wording held a send until the end of the hour
//                   on an empty queue (experiment in postgres:16).
//
// All of it reads and writes one row, `identity_stats`, and every caller takes
// it `FOR UPDATE` first. That is not tidiness: moments are written at the
// verdict, so without the lock two parallel sends both passed the limit before
// either verdict landed (review panel 2026-09-14).

import { inc } from "./metrics.ts";

// docs/facts/limits.tsv, by name: `feed.live.slots`, `feed.publications.hour`,
// `moderation.refusals.pause.count` and `moderation.refusals.pause`. The last
// two were added to the registry on 2026-09-21 — until this file needed them
// they lived only in the prose of §8.3, where no gate could see them.
export const LIVE_MAX = 4;
export const PUBLISH_PER_HOUR = 4;
export const REFUSALS_BEFORE_PAUSE = 5;
export const PAUSE_MINUTES = 15;
// One live lost per identity (owner, 30.10.2026; db/089). Its own slot, not
// one of the four: a lost thing is not a phrase about one's evening, and it
// must not cost the evening.
export const LIVE_LOST_MAX = 1;
// Three counting complaints end a lost (routes/lost.ts). The author waits this
// long before the next one: otherwise the same notice comes back as a new id at
// once and outlives the people who complained (review panel, 02.11.2026).
export const TAKEDOWN_COMPLAINTS = 3;
export const AFTER_TAKEDOWN = "3 days";

// A row the queue let through and whose time has not run out — **of any
// kind** (db/089: phrase, lost, found). One wording for the refusal below and
// for the quota GET /identities/me shows (B5, 2026-09-26), so the count a
// person sees is the count that refuses them. A condition on `feed_messages`,
// unqualified.
//
// Why the kind is not in here (decided 30.10.2026, with db/089): this
// condition is also "the phrase a like needs" and "the phrase a like lands
// on" (routes/likes.ts, §8.4), "both phrases alive" of a match (§8.5), what
// the feed delivers and what the density counts (routes/feed.ts), what a
// hidden phrase may come back from (routes/hidden.ts), and the offers' settle
// (lib/offer_match.ts). A lost must be delivered and must take a like — that
// is how a neighbour says "I saw it" — and a lost of one's own is as good a
// reason to like as a phrase. Narrowing LIVE_PHRASE to kind = 'phrase' would
// have cut the lost out of every one of those in one stroke. So LIVE_PHRASE
// stays "alive", and only the two **slot** counts below name a kind:
// LIVE_SLOT for the four, LIVE_LOST for the one. The quota in
// routes/identity.ts still counts LIVE_PHRASE and so shows a live lost as a
// used slot: one of four on the screen, not one of five on the node. Noted,
// not fixed here — that file is outside this change.
export const LIVE_PHRASE = `visible_at IS NOT NULL AND expires_at > now()`;
// What takes one of the LIVE_MAX slots: a live row of kind 'phrase'.
export const LIVE_SLOT = `${LIVE_PHRASE} AND kind = 'phrase'`;
// A live row still of kind 'lost': what /extend and /found act on.
export const LIVE_LOST = `${LIVE_PHRASE} AND kind = 'lost'`;
// What takes the one lost slot: a live lost or a live found. A found keeps the
// slot for its one day — were it free, lost → found → lost … would keep a found
// per hour in the feed beside the four phrases (review panel 30.10.2026).
export const LOST_SLOT = `${LIVE_PHRASE} AND kind IN ('lost', 'found')`;

// The kinds a send may name (db/089). 'found' is not one: it is made out of a
// live lost by POST /feed/:id/found, never sent.
export type SendKind = "phrase" | "lost";

// The same condition on an aliased `feed_messages` (`f`, `their_msg`), made from
// LIVE_PHRASE rather than written again: the like's "a live phrase of one's
// own" (§8.4) and the match's "both phrases alive" (§8.5) held third and fourth
// copies as text, and a change in one place would have let the like and the
// quota part ways (B8, 2026-09-26).
export function livePhraseOf(alias: string): string {
  return LIVE_PHRASE.replace(/\b(visible_at|expires_at)\b/g, `${alias}.$1`);
}

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

export interface StatsRow {
  rejected_at_recent: Date[];
  published_at_recent: Date[];
}

export type Refusal =
  | { kind: "paused"; until: Date }
  | { kind: "hold"; checking: number }
  | { kind: "hourly"; nextSlot: Date }
  | { kind: "live"; live: number }
  // A live lost already up (db/089): the one lost slot is taken.
  | { kind: "lost"; live: number }
  | { kind: "lost_wait"; until: Date };

// Reads the row under a lock and answers what, if anything, refuses this send.
// Null means "go ahead".
//
// The queue is counted as part of the limit on purpose: a phrase waiting for a
// verdict is a phrase that may yet be published, and leaving it out let a
// parallel pair of sends pass the ceiling before the first verdict (§8.3).
//
// `kind` is what the send is (db/089): a phrase meets the four live slots, a
// lost meets its own single one. The pause, the hold and the hour are the
// same for both — they are about the person sending, not about the row.
export async function refusalFor(
  run: Run,
  identityId: string,
  now: Date = new Date(),
  kind: SendKind = "phrase",
): Promise<Refusal | null> {
  // The row is created if it is not there, and that is not a convenience: the
  // counters row is written by registration (routes/identity.ts) and by
  // nothing else, so an identity that predates db/025 — or arrives by any
  // future path whose author forgets the fourth INSERT — has none. Refusing
  // such an identity for ever, which is what the code below used to do, is a
  // silent permanent ban delivered as "four live phrases already". And
  // `SELECT … FOR UPDATE` over a row that does not exist takes no lock at all,
  // so the whole of §8.3's protection against two parallel sends rested on the
  // row being there. Found by the data lens of the review panel, 2026-09-21;
  // the refuter confirmed no contour has such identities today, which makes
  // this a mine rather than a fire — and the time to defuse one is before it
  // is stepped on.
  await run(
    `INSERT INTO identity_stats (identity) VALUES ($1) ON CONFLICT DO NOTHING`,
    [identityId],
  );
  const [stats] = await run<StatsRow>(
    `SELECT rejected_at_recent, published_at_recent FROM identity_stats
      WHERE identity = $1 FOR UPDATE`,
    [identityId],
  );
  // Still nothing: the insert above cannot fail quietly, so this means the
  // database answered something unexpected. Refuse rather than let the ceiling
  // be uncountable.
  if (!stats) return { kind: "live", live: LIVE_MAX };

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const refusals = stats.rejected_at_recent.filter((at) => at > hourAgo);
  const published = stats.published_at_recent.filter((at) => at > hourAgo);

  // The pause, and its window is not "the last hour" but "the hour ending at
  // the last refusal" — otherwise a burst at 12:00 and one more at 12:55 would
  // stop counting together the moment 13:00 passed.
  const lastRefusal = stats.rejected_at_recent.reduce<Date | null>(
    (latest, at) => (latest === null || at > latest ? at : latest),
    null,
  );
  if (lastRefusal) {
    const windowStart = new Date(lastRefusal.getTime() - 60 * 60 * 1000);
    const inThatHour = stats.rejected_at_recent.filter((at) => at > windowStart).length;
    const until = new Date(lastRefusal.getTime() + PAUSE_MINUTES * 60 * 1000);
    if (inThatHour >= REFUSALS_BEFORE_PAUSE && now < until) {
      inc("relay_feed_total", { result: "paused" });
      return { kind: "paused", until };
    }
  }

  // Waiting for a verdict, from the feed's own table: one at a time.
  const [waiting] = await run<{ n: string }>(
    `SELECT count(*)::text AS n FROM feed_messages
      WHERE author_identity = $1 AND visible_at IS NULL`,
    [identityId],
  );
  const checking = Number(waiting?.n ?? 0);
  if (checking > 0) {
    // The hold: something of yours is being checked, and together with the
    // hour's refusals it is five or more. Seconds of waiting, not a pause.
    if (checking + refusals.length >= REFUSALS_BEFORE_PAUSE) {
      inc("relay_feed_total", { result: "held" });
      return { kind: "hold", checking };
    }
    inc("relay_feed_total", { result: "one_at_a_time" });
    return { kind: "hold", checking };
  }

  // Four an hour, counted as published moments plus the one that would be
  // waiting. The next slot is the earliest moment in the window plus an hour.
  if (published.length + 1 > PUBLISH_PER_HOUR) {
    const earliest = published.reduce((a, b) => (a < b ? a : b));
    inc("relay_feed_total", { result: "hourly_limit" });
    return { kind: "hourly", nextSlot: new Date(earliest.getTime() + 60 * 60 * 1000) };
  }

  // One live lost (db/089): its own slot, counted the same way as the four.
  if (kind === "lost") {
    const [lost] = await run<{ n: string }>(
      `SELECT count(*)::text AS n FROM feed_messages
        WHERE author_identity = $1 AND ${LOST_SLOT}`,
      [identityId],
    );
    const lostCount = Number(lost?.n ?? 0);
    if (lostCount >= LIVE_LOST_MAX) {
      inc("relay_feed_total", { result: "lost_limit" });
      return { kind: "lost", live: lostCount };
    }
    // Nothing is live here, so "one at a time" would be false: its own answer.
    const [waiting] = await run<{ until: Date | null }>(
      `SELECT max(f.expires_at + interval '${AFTER_TAKEDOWN}') AS until FROM feed_messages f
        WHERE f.author_identity = $1 AND f.kind = 'lost' AND f.expires_at > now() - interval '${AFTER_TAKEDOWN}'
          AND (SELECT count(*) FROM lost_complaints c WHERE c.lost_id = f.id AND c.counts) >= ${TAKEDOWN_COMPLAINTS}`,
      [identityId],
    );
    if (waiting?.until) {
      inc("relay_feed_total", { result: "lost_limit" });
      return { kind: "lost_wait", until: waiting.until };
    }
    return null;
  }

  // Four live phrases. Counted from the table rather than from a moment: a
  // phrase can be taken down, and a take-down frees the slot at once while the
  // hour's moment stays where it is (§8.3, "why phrases have two numbers").
  // Of kind 'phrase' only: a live lost is on its own slot (LIVE_SLOT, db/089).
  const [live] = await run<{ n: string }>(
    `SELECT count(*)::text AS n FROM feed_messages
      WHERE author_identity = $1 AND ${LIVE_SLOT}`,
    [identityId],
  );
  const liveCount = Number(live?.n ?? 0);
  if (liveCount >= LIVE_MAX) {
    inc("relay_feed_total", { result: "live_limit" });
    return { kind: "live", live: liveCount };
  }

  return null;
}
