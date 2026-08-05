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

// Left unbounded, the map is itself a way to exhaust the node: one entry per
// address. Cleared wholesale rather than swept, because the entries are cheap to
// rebuild and a sweep is one more thing to get wrong.
const MAX_TRACKED = 50_000;

export interface Limit {
  name: string;
  max: number;
  windowMs: number;
}

export const WAITLIST_HOURLY: Limit = { name: "waitlist", max: 5, windowMs: 60 * 60 * 1000 };
export const REPORT_HOURLY: Limit = { name: "report", max: 10, windowMs: 60 * 60 * 1000 };

export interface Verdict {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function check(limit: Limit, address: string, now = Date.now()): Verdict {
  if (buckets.size > MAX_TRACKED) {
    log("info", "rate limiter reset: too many tracked addresses", { tracked: buckets.size });
    buckets.clear();
  }

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

// For tests, and for nothing else: a limiter that cannot be reset is a limiter
// whose tests depend on each other.
export function reset(): void {
  buckets.clear();
}
