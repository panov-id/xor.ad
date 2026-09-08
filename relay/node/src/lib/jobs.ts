// The job queue, and the worker that drains it.
//
// The `jobs` table was created with the schema and left empty: the work it was
// meant to carry — pruning page views — kept being done by a human running a
// script, which is another way of saying it kept not being done. A queue in the
// database rather than a timer in the process, because several nodes share one
// database and only one of them may run a given job.
//
// Claiming is a single UPDATE with SKIP LOCKED: whoever wins the row runs it,
// and the lease (`locked_until`) is what makes a node dying mid-job survivable —
// the row becomes claimable again instead of being lost with the process.

import { enabled as databaseEnabled, query, queryOrThrow } from "./db.ts";
import { log } from "./log.ts";

const POLL_INTERVAL_MS = 60_000;
// Long enough for a prune over a real collection, short enough that a dead node
// does not hold a job for an hour.
const LEASE_MS = 10 * 60_000;

export interface Job {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  // Which claim this is. Written by claim(), required by every write in
  // finish(): a worker that lost its lease to another node must not act on the
  // row any more (db/020).
  lease: string | null;
}

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, Handler>();

export function handle(kind: string, handler: Handler): void {
  handlers.set(kind, handler);
}

// Schedule one. `at` in the future is how a recurring job re-arms itself: the
// handler enqueues its own next run, so there is no separate scheduler to keep
// in step with the queue.
export async function enqueue(
  kind: string,
  payload: Record<string, unknown> = {},
  at: Date = new Date(),
): Promise<void> {
  if (!databaseEnabled()) return;
  await query(
    `INSERT INTO jobs (kind, payload, run_at) VALUES ($1, $2::jsonb, $3)`,
    [kind, JSON.stringify(payload), at.toISOString()],
  );
}

// The same insert, but the caller learns if the database refused it. `query`
// swallows errors by design — most callers cannot do anything about a failed
// insert — and enqueueOnce is the one that can: a unique-index violation there
// means another node armed the job first, which is success, not failure.
async function enqueueOrThrow(
  kind: string,
  payload: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await queryOrThrow(
    `INSERT INTO jobs (kind, payload, run_at) VALUES ($1, $2::jsonb, $3)`,
    [kind, JSON.stringify(payload), at.toISOString()],
  );
}

// Enqueue unless one of this kind is already waiting — for jobs that are a
// standing intention ("prune daily") rather than an event, where a second copy
// would only do the same work twice.
//
// "Waiting" excludes a job that gave up. `fail()` leaves such a row in place
// with `locked_until = 'infinity'` on purpose — it is the only record that the
// work never succeeded — but it is a headstone, not a job that is coming. This
// used to ask merely whether a row of the kind existed, and the headstone then
// answered "one is already waiting" at every start-up for ever. Since the daily
// chain re-arms itself only from inside a successful handler, one job running
// out of attempts (storage unreachable for a couple of hours is enough) ended
// the pruning permanently, and the only trace was a single "job gave up" line.
// Found 2026-09-07 by a review panel; the suite covers it in
// "a job that gave up does not block the next arming".
//
// A row merely leased right now still counts: a node is working on it.
export async function enqueueOnce(
  kind: string,
  payload: Record<string, unknown> = {},
  at: Date = new Date(),
): Promise<void> {
  if (!databaseEnabled()) return;
  const rows = await query<{ id: number }>(
    `SELECT id FROM jobs
      WHERE kind = $1 AND locked_until IS DISTINCT FROM 'infinity'
      LIMIT 1`,
    [kind],
  );
  if (rows === null || rows.length > 0) return;
  // The read above is a courtesy, not the guarantee: two nodes starting together
  // both see nothing and both insert. Since db/018 the database refuses the
  // second one through a partial unique index, and a refusal here means somebody
  // else armed the same job a moment ago — which is exactly the outcome wanted,
  // so it is not an error to report.
  try {
    await enqueueOrThrow(kind, payload, at);
  } catch (error) {
    if (String(error).includes("jobs_standing")) {
      log("info", "another node armed this job first", { kind });
      return;
    }
    throw error;
  }
}

async function claim(): Promise<Job | null> {
  // The lease token, not just the deadline. Ten minutes is ordinary to overrun —
  // the object prunes walk storage one delete at a time — and when it happens
  // another node claims the same row. Without a token the loser of that race
  // still deletes the row and re-arms tomorrow's job, so the day ends with two
  // chains and one of them invisible.
  const rows = await query<Job>(
    `UPDATE jobs SET locked_until = now() + $1::interval, attempts = attempts + 1,
            lease = gen_random_uuid()
      WHERE id = (
        SELECT id FROM jobs
         WHERE run_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, kind, payload, attempts, max_attempts, lease`,
    [`${Math.round(LEASE_MS / 1000)} seconds`],
  );
  return rows?.[0] ?? null;
}

async function finish(job: Job, error?: unknown): Promise<void> {
  // Every write names the lease this worker holds. A worker whose lease expired
  // and was taken by another node changes nothing: the row belongs to whoever
  // holds it now, and finishing somebody else's job is how one prune became two.
  if (error === undefined) {
    await query(`DELETE FROM jobs WHERE id = $1 AND lease = $2`, [job.id, job.lease]);
    return;
  }
  const message = String(error).slice(0, 1000);
  if (job.attempts >= job.max_attempts) {
    // Out of attempts: the row stays, unclaimable, as the record of a job that
    // never worked. Deleting it would erase the only evidence.
    await query(
      `UPDATE jobs SET locked_until = 'infinity', last_error = $2
        WHERE id = $1 AND lease = $3`,
      [job.id, message, job.lease],
    );
    log("error", "job gave up", { kind: job.kind, id: job.id, attempts: job.attempts });
    return;
  }
  // Back off on the square of the attempt: a database that is unwell should not
  // be asked the same question every minute.
  const delaySeconds = Math.min(3600, 30 * job.attempts * job.attempts);
  await query(
    `UPDATE jobs SET run_at = now() + $2::interval, locked_until = NULL, last_error = $3
      WHERE id = $1 AND lease = $4`,
    [job.id, `${delaySeconds} seconds`, message, job.lease],
  );
  log("warn", "job failed, will retry", {
    kind: job.kind,
    id: job.id,
    attempts: job.attempts,
    in_seconds: delaySeconds,
  });
}

export async function runOnce(): Promise<boolean> {
  const job = await claim();
  if (!job) return false;
  const handler = handlers.get(job.kind);
  if (!handler) {
    await finish(job, `no handler for "${job.kind}"`);
    return true;
  }
  try {
    await handler(job.payload ?? {});
    await finish(job);
  } catch (error) {
    await finish(job, error);
  }
  return true;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startWorker(): void {
  if (!databaseEnabled() || timer !== null) return;
  const drain = async () => {
    // Keep going while there is work: one job per minute would take an hour to
    // clear an hour's backlog.
    try {
      while (await runOnce()) { /* next */ }
    } catch (error) {
      log("error", "job worker stumbled", { error: String(error) });
    }
  };
  timer = setInterval(() => void drain(), POLL_INTERVAL_MS);
  Deno.unrefTimer(timer as unknown as number);
  void drain();
}
