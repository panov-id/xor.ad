// A limit per address, held in the node's memory.
//
// Why in memory and not in the database: the point of this limiter is to refuse
// a flood, and a flood that costs a database round trip per request has already
// won half the argument. The cost of keeping it local is that N nodes allow N
// times the limit — which for a threshold measured in a handful per hour is
// noise, and for a threshold that mattered would be the wrong design anyway.
//
// Why not the daily key quota that already exists: that quota counts per key,
// and every visitor to a landing shares one key. A bot that burns it in a minute
// does not get refused — it closes signups for everyone for a day. That is not a
// limit, it is a lever for denial of service, and this exists to take it away.

import { log } from "./log.ts";

interface Bucket {
  hits: number[];
}

// Address -> the timestamps of its recent hits, per named limit.
const buckets = new Map<string, Bucket>();

// Every window ever seen, by limit name. The sweep above decides "expired" per
// bucket, and a bucket belongs to whichever limit named it — using the current
// call's window for all of them would evict a day-long counter on a minute's
// evidence.
const WINDOWS = new Map<string, number>();

// And every ceiling, by the same names. Eviction weighs buckets against their
// own limit, so it needs to know what that limit is for a bucket it is not
// currently checking.
const MAXIMA = new Map<string, number>();

// Left unbounded, the map is itself a way to exhaust the node: one entry per
// address. It used to be cleared wholesale — cheap to rebuild, and one less
// thing to get wrong — until a review panel pointed out on 2026-09-08 what a
// wholesale clear is from outside: whoever fills the map decides when every
// counter on the node resets, including the ones on the waitlist and on notices
// of illegal content. Sweeping the expired entries instead keeps the eviction
// from being a lever.
const MAX_TRACKED = 50_000;

export interface Limit {
  name: string;
  max: number;
  windowMs: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Two windows rather than one, because they answer different questions. The
// hourly one stops a burst; the daily one stops a patient script that stays just
// under it and grinds all day.
//
// The numbers assume the address is shared. Behind carrier-grade NAT a single
// address can carry a whole cell tower, so a threshold tuned to one person would
// refuse the sixth neighbour on the same operator and look like a broken site.
// Twenty in an hour is no longer "a few people signing up" — it is a script.
export const WAITLIST_LIMITS: Limit[] = [
  { name: "waitlist", max: 20, windowMs: HOUR },
  { name: "waitlist-day", max: 60, windowMs: DAY },
];

// Higher on purpose: refusing a report of illegal content is refusing a legal
// obligation, so the cost of a false refusal here is not an annoyed visitor.
export const REPORT_LIMITS: Limit[] = [
  { name: "report", max: 10, windowMs: HOUR },
  { name: "report-day", max: 40, windowMs: DAY },
];

// The two routes that answer 200 whatever happens had no per-address limit at
// all, which made them the cheapest way to spend somebody else's storage: no
// key needed on one of them, and on the other a key anyone can read out of a
// landing page. The limit does not change the answer — both routes still say
// "fine" — it decides whether the record is kept.
//
// Counted per address AND key, so a noisy visitor on one storefront cannot mute
// that same address for another. The numbers are generous on purpose: a session
// browsing a few pages is nowhere near them, and behind carrier-grade NAT one
// address can be a whole neighbourhood.
export const PAGEVIEW_LIMITS: Limit[] = [
  { name: "pageview", max: 600, windowMs: HOUR },
  { name: "pageview-day", max: 3000, windowMs: DAY },
];

// Lower, because an honest page reports an error rarely and a broken one
// reports the same error in a loop.
export const CLIENT_ERROR_LIMITS: Limit[] = [
  { name: "client-error", max: 60, windowMs: HOUR },
  { name: "client-error-day", max: 300, windowMs: DAY },
];

export interface Verdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function check(limit: Limit, address: string, now = Date.now()): Verdict {
  if (buckets.size > MAX_TRACKED) {
    // Two passes, and neither of them is a wholesale clear.
    //
    // First the expired: a bucket whose every hit is outside its own window
    // holds nothing worth keeping.
    let swept = 0;
    for (const [name, held] of buckets) {
      const window = WINDOWS.get(name.slice(0, name.indexOf(":"))) ?? limit.windowMs;
      if (held.hits.every((at) => at <= now - window)) {
        buckets.delete(name);
        swept += 1;
      }
    }

    // Then, if the map is still full, the quietest — fewest hits first. A flood
    // is made of buckets with one hit each; a caller who is actually at their
    // limit has the most hits in the map and is evicted last. Clearing wholesale
    // did the opposite: it freed exactly the counters worth keeping, and let
    // whoever filled the map choose when that happened.
    if (buckets.size > MAX_TRACKED) {
      // Fullness, not raw hits — and this is the second version of this line.
      //
      // Sorting by `hits.length` compared buckets across limits, and the limits
      // are not comparable: `report` allows ten an hour, `pageview` six hundred.
      // A bucket at its report limit holds ten hits and a half-idle pageview
      // bucket holds twenty, so flooding /pageview evicted every Article 16
      // counter first — the same prize `buckets.clear()` used to hand out, just
      // more slowly. Fullness is the share of a bucket's own limit, so "about to
      // be refused" means the same number whatever the limit. Caught by a review
      // panel on 2026-09-08, hours after the eviction replaced the clear.
      const fullness = (name: string, held: Bucket): number => {
        const max = MAXIMA.get(name.slice(0, name.indexOf(":"))) ?? limit.max;
        return held.hits.length / max;
      };
      const byWeight = [...buckets.entries()].sort((a, b) => {
        const spread = fullness(a[0], a[1]) - fullness(b[0], b[1]);
        // Ties go to whoever was quiet longest: a bucket nobody has touched
        // recently is cheaper to lose than one still being written to.
        if (spread !== 0) return spread;
        return (a[1].hits[a[1].hits.length - 1] ?? 0) - (b[1].hits[b[1].hits.length - 1] ?? 0);
      });
      const target = buckets.size - Math.floor(MAX_TRACKED / 2);
      for (let i = 0; i < target && i < byWeight.length; i++) {
        buckets.delete(byWeight[i][0]);
        swept += 1;
      }
      log("warn", "rate limiter evicted the emptiest buckets", { tracked: buckets.size, swept });
    } else {
      log("info", "rate limiter swept expired buckets", { tracked: buckets.size, swept });
    }
  }

  WINDOWS.set(limit.name, limit.windowMs);
  MAXIMA.set(limit.name, limit.max);
  const key = `${limit.name}:${address}`;
  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - limit.windowMs;
  const hits = bucket.hits.filter((at) => at > cutoff);

  if (hits.length >= limit.max) {
    buckets.set(key, { hits });
    const oldest = hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + limit.windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits });
  return { allowed: true, remaining: limit.max - hits.length, retryAfterSeconds: 0 };
}

// Every window must allow it; the first refusal is the one reported, because
// that is the one the caller has to wait out.
export function checkAll(limits: Limit[], address: string, now = Date.now()): Verdict {
  let allowed: Verdict = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, retryAfterSeconds: 0 };
  for (const limit of limits) {
    const verdict = check(limit, address, now);
    if (!verdict.allowed) return verdict;
    // Report the tightest remaining, so a caller that surfaces it tells the truth
    // about which window runs out first.
    if (verdict.remaining < allowed.remaining) allowed = verdict;
  }
  return allowed;
}

// For tests, and for nothing else: a limiter that cannot be reset is a limiter
// whose tests depend on each other.
export function reset(): void {
  buckets.clear();
}
