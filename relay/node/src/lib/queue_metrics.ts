// What the queue looks like from outside, at the moment of a scrape.
//
// The queue is the node's only way of doing anything nobody asked for: pruning
// the things the privacy policy promises windows for, sweeping identities that
// stopped coming, cleaning up after itself. Every one of those is a promise,
// and until now not one number said whether any of them still ran.
//
// The failure that makes this worth a file, from lib/jobs.ts and
// lib/scheduled.ts read together: a job re-arms itself by returning the next
// time from its own handler, so a handler that never succeeds never re-arms. A
// job that runs out of attempts becomes a tombstone — `locked_until =
// 'infinity'`, kept on purpose as the only evidence it ever failed — and
// `enqueueOnce` will not replace it, because the standing-job index ignores
// tombstones. So a database outage long enough to exhaust the attempts ends the
// sweep for good, silently, and the only sign is a log line from weeks ago.
// After this file there are three: depth, the age of the oldest due job, and
// the count of tombstones. The last one is the one that catches it.
//
// Read at scrape time rather than kept in memory: these are properties of a
// table shared by every node in the pool, and a counter in one process would
// describe that process rather than the queue.
//
// **There is no depth here, and the name says so.** The review panel asked for
// `relay_jobs_queue_depth`; the schema refuses to give one — `jobs_standing`
// (db/020) is a unique index admitting at most one non-tombstone row per kind,
// so a "depth" could only ever read 0 or 1, and a gauge that can only be 0 or 1
// is a state, not a size. It is published as `relay_jobs_standing`, and read
// that way it is the sharpest of the three: **0 means the chain is gone**, and
// a chain is gone exactly when a kind has a tombstone and nothing standing.

import { query } from "./db.ts";
import { clearGauge, setGauge } from "./metrics.ts";

interface DepthRow {
  kind: string;
  waiting: string;
  oldest_due_seconds: string | null;
  tombstones: string;
}

// Kinds seen on a previous scrape, so a queue that empties reports nothing
// rather than its last known depth for ever. A gauge that stops being written
// keeps its value until the process restarts — which is how a drained queue
// would go on looking full.
let seen = new Set<string>();

export async function collectQueueMetrics(): Promise<void> {
  await collectDsaQueue();
  const rows = await query<DepthRow>(
    `SELECT kind,
            count(*) FILTER (
              WHERE locked_until IS NULL OR locked_until <> 'infinity'
            )::text AS waiting,
            EXTRACT(EPOCH FROM (now() - min(run_at) FILTER (
              WHERE run_at <= now()
                AND (locked_until IS NULL OR locked_until <> 'infinity')
            )))::text AS oldest_due_seconds,
            count(*) FILTER (WHERE locked_until = 'infinity')::text AS tombstones
       FROM jobs GROUP BY kind`,
  );
  // `query` answers null when the database is unreachable or off. Leaving the
  // gauges as they were is the right answer to "we could not look": zeroing
  // them would report an empty queue, which is the opposite of what is known.
  if (rows === null) return;

  const present = new Set<string>();
  for (const row of rows) {
    present.add(row.kind);
    setGauge("relay_jobs_standing", Number(row.waiting), { kind: row.kind });
    setGauge("relay_jobs_tombstones", Number(row.tombstones), { kind: row.kind });
    // Nothing due is not the same as "due nought seconds ago", so the gauge is
    // removed rather than set to zero — otherwise an idle queue and a queue
    // whose oldest job came due this instant read the same.
    if (row.oldest_due_seconds === null) {
      clearGauge("relay_jobs_oldest_due_seconds", { kind: row.kind });
    } else {
      setGauge(
        "relay_jobs_oldest_due_seconds",
        Math.max(0, Math.round(Number(row.oldest_due_seconds))),
        { kind: row.kind },
      );
    }
  }
  for (const kind of seen) {
    if (present.has(kind)) continue;
    for (const name of ["relay_jobs_standing", "relay_jobs_tombstones", "relay_jobs_oldest_due_seconds"]) {
      clearGauge(name, { kind });
    }
  }
  seen = present;
}

// The queue with a legal clock on it, rather than an operational one.
//
// Article 16 notices wait for a person, and the only thing that says whether
// anybody is working through them is the count of undecided ones next to the
// rate of decisions. Both were missing, and an alert on "the queue is not being
// worked" had nothing to stand on — it was written against two metric names
// that did not exist, which is how this got noticed (2026-09-20).
async function collectDsaQueue(): Promise<void> {
  const rows = await query<{ brand: string; open: string; oldest_seconds: string | null }>(
    `SELECT coalesce(brand, 'unattributed') AS brand,
            count(*)::text AS open,
            EXTRACT(EPOCH FROM (now() - min(created_at)))::text AS oldest_seconds
       FROM dsa_notices WHERE decided_at IS NULL GROUP BY 1`,
  );
  if (rows === null) return;
  const present = new Set<string>();
  for (const row of rows) {
    present.add(row.brand);
    setGauge("relay_dsa_queue_open", Number(row.open), { brand: row.brand });
    setGauge(
      "relay_dsa_queue_oldest_seconds",
      Math.max(0, Math.round(Number(row.oldest_seconds ?? 0))),
      { brand: row.brand },
    );
  }
  for (const brand of seenBrands) {
    if (present.has(brand)) continue;
    clearGauge("relay_dsa_queue_open", { brand });
    clearGauge("relay_dsa_queue_oldest_seconds", { brand });
  }
  seenBrands = present;
}

let seenBrands = new Set<string>();

// Tests only: the set of kinds outlives a suite otherwise.
export function forget(): void {
  seen = new Set<string>();
  seenBrands = new Set<string>();
}
