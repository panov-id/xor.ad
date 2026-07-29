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

import { enabled as databaseEnabled, query } from "./db.ts";
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

// Enqueue unless one of this kind is already waiting — for jobs that are a
// standing intention ("prune daily") rather than an event, where a second copy
// would only do the same work twice.
export async function enqueueOnce(
  kind: string,
  payload: Record<string, unknown> = {},
  at: Date = new Date(),
): Promise<void> {
  if (!databaseEnabled()) return;
  const rows = await query<{ id: number }>(
    `SELECT id FROM jobs WHERE kind = $1 LIMIT 1`,
    [kind],
  );
  if (rows === null || rows.length > 0) return;
  await enqueue(kind, payload, at);
}

async function claim(): Promise<Job | null> {
  const rows = await query<Job>(
    `UPDATE jobs SET locked_until = now() + $1::interval, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM jobs
         WHERE run_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, kind, payload, attempts, max_attempts`,
    [`${Math.round(LEASE_MS / 1000)} seconds`],
  );
  return rows?.[0] ?? null;
}

async function finish(job: Job, error?: unknown): Promise<void> {
  if (error === undefined) {
    await query(`DELETE FROM jobs WHERE id = $1`, [job.id]);
    return;
  }
  const message = String(error).slice(0, 1000);
  if (job.attempts >= job.max_attempts) {
    // Out of attempts: the row stays, unclaimable, as the record of a job that
    // never worked. Deleting it would erase the only evidence.
    await query(
      `UPDATE jobs SET locked_until = 'infinity', last_error = $2 WHERE id = $1`,
      [job.id, message],
    );
    log("error", "job gave up", { kind: job.kind, id: job.id, attempts: job.attempts });
    return;
  }
  // Back off on the square of the attempt: a database that is unwell should not
  // be asked the same question every minute.
  const delaySeconds = Math.min(3600, 30 * job.attempts * job.attempts);
  await query(
    `UPDATE jobs SET run_at = now() + $2::interval, locked_until = NULL, last_error = $3
      WHERE id = $1`,
    [job.id, `${delaySeconds} seconds`, message],
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
