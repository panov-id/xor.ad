// What the queue is for, so far: keeping the page-view objects inside their
// retention window without anyone remembering to.
//
// A job re-arms itself by RETURNING tomorrow's time, so the schedule lives in the
// same table as the work and needs no second mechanism to stay in step with it. A
// node that never comes back leaves the row claimable by whichever one does.
//
// It returns rather than enqueues, and that is not a style choice: enqueueing
// happens while the handler's own row is still in the table, `jobs_standing`
// (db/020) refuses the second standing job of that kind, and `enqueue` swallows
// the refusal. The chain then died after one successful pass, with no error
// anywhere — found by a review panel on 2026-09-08 and reproduced against a live
// Postgres before this was changed.

import { enqueueOnce, handle } from "./jobs.ts";
import { queryOrThrow } from "./db.ts";
import { log } from "./log.ts";
import { prunePageviews } from "../../tools/prune_pageviews.ts";
import { pruneObjects } from "../../tools/prune_objects.ts";
import { pruneDsaRecords } from "../../tools/prune_dsa_records.ts";
import { pruneMagicLinks } from "./auth.ts";

export const PRUNE_PAGEVIEWS = "prune_pageviews";
// Everything else the policy promises a window for. Page views keep their own job
// because their window is argued separately.
export const PRUNE_OBJECTS = "prune_objects";
// Notices under Article 16 and the statements of reasons that answer them.
// The window is a year, and it is promised in the privacy policy — which makes
// forgetting to run this a broken promise rather than untidiness.
export const PRUNE_DSA = "prune_dsa_records";
// Idempotency rows outlive their purpose by a lot: a key exists so a retry a few
// minutes later gets the same answer, and after a day nobody will ever look one
// up again. Nothing deleted them until 2026-09-08, so the table only grew — one
// row with a whole response in it per unique keyed request.
export const PRUNE_IDEMPOTENCY = "prune_idempotency";
// Sign-in links that were never clicked. Written by every request to
// /auth/request-link and deleted only by a redemption, so an unclicked one — a
// mistyped address, a change of mind, every request in a flood — stayed for
// ever, holding an operator's email address in clear.
export const PRUNE_MAGIC = "prune_magic_links";
// Jobs that gave up. Kept as evidence, but not for ever: nothing removed them,
// and the standing-job index deliberately ignores them, so one kind could hold
// any number. Found by a review lens, 2026-09-08.
export const PRUNE_TOMBSTONES = "prune_job_tombstones";
const TOMBSTONE_DAYS = 30;
const IDEMPOTENCY_DAYS = 1;
// Big enough that an ordinary night is one batch, small enough that the lock a
// batch holds is not worth noticing.
const IDEMPOTENCY_BATCH = 5000;
// A pass deletes at most this many batches and then waits for tomorrow rather
// than running for an hour on the first night. Twenty-five million rows is well
// past anything this table can honestly reach in a day.
const IDEMPOTENCY_BATCHES = 5000;
const A_DAY_MS = 24 * 60 * 60 * 1000;
const A_MINUTE_MS = 60 * 1000;

export function registerScheduledJobs(): void {
  handle(PRUNE_OBJECTS, async (payload) => {
    const result = await pruneObjects({ apply: true, only: payload.only as string | undefined });
    log("info", "pruned stored objects", { ...result, skipped: result.skipped.join(",") });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_DSA, async () => {
    const result = await pruneDsaRecords({ apply: true });
    log("info", "pruned DSA records", { ...result });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_IDEMPOTENCY, async () => {
    // In batches, not one statement. The table this sweeps is the one that had
    // grown without a ceiling, so the very first run on a busy node is the
    // largest delete it will ever do — one transaction holding a row lock per
    // row, bloating the table, and outliving the ten-minute lease so another
    // node claims the job while it is still running. Found by a review lens,
    // 2026-09-08. Each batch commits on its own, so an interruption keeps the
    // work already done.
    let deleted = 0;
    for (let batch = 0; batch < IDEMPOTENCY_BATCHES; batch++) {
      const rows = await queryOrThrow<{ count: string }>(
        `WITH doomed AS (
           SELECT key FROM idempotency
            WHERE created_at < now() - interval '${IDEMPOTENCY_DAYS} days'
            LIMIT ${IDEMPOTENCY_BATCH}
         ), gone AS (
           DELETE FROM idempotency WHERE key IN (SELECT key FROM doomed) RETURNING 1
         )
         SELECT count(*)::text AS count FROM gone`,
      );
      const went = Number(rows[0]?.count ?? 0);
      deleted += went;
      if (went < IDEMPOTENCY_BATCH) break;
    }
    log("info", "pruned idempotency keys", { deleted });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_TOMBSTONES, async () => {
    // A job that ran out of attempts stays as `locked_until = 'infinity'`, on
    // purpose: it is the only record that something never worked, and deleting
    // it would erase the evidence (db/001, jobs.ts). But the partial index
    // excludes tombstones, so there is no ceiling on how many of one kind can
    // pile up, and nothing ever removed them. A month is long enough that
    // anybody who was going to look has looked.
    const rows = await queryOrThrow<{ count: string }>(
      `WITH gone AS (
         DELETE FROM jobs
          WHERE locked_until = 'infinity'
            AND run_at < now() - interval '${TOMBSTONE_DAYS} days'
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM gone`,
    );
    const deleted = Number(rows[0]?.count ?? 0);
    // Only worth a line when there was something to say: a nightly "deleted: 0"
    // is how a log stops being read.
    if (deleted > 0) log("info", "pruned job tombstones", { deleted });
    return new Date(Date.now() + A_DAY_MS);
  });

  handle(PRUNE_MAGIC, async () => {
    const result = await pruneMagicLinks();
    // Come straight back while there is more, rather than leaving the rest for
    // tomorrow: a backlog that only shrinks by one pass a day never shrinks.
    return new Date(Date.now() + (result.more ? A_MINUTE_MS : A_DAY_MS));
  });

  handle(PRUNE_PAGEVIEWS, async (payload) => {
    const days = typeof payload.days === "number" ? payload.days : undefined;
    const result = await prunePageviews({ days, apply: true });
    log("info", "pruned page views", { ...result });
    // Tomorrow's run is asked for only after this one succeeded. A failure
    // retries on the queue's own backoff instead of skipping a day.
    return new Date(Date.now() + A_DAY_MS);
  });
}

// Called once at start-up. `enqueueOnce` rather than `enqueue`: every node in
// the pool runs this line, and a standing intention does not want one copy per
// node.
export async function armScheduledJobs(): Promise<void> {
  await enqueueOnce(PRUNE_PAGEVIEWS, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_OBJECTS, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_DSA, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_IDEMPOTENCY, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_MAGIC, {}, new Date(Date.now() + A_DAY_MS));
  await enqueueOnce(PRUNE_TOMBSTONES, {}, new Date(Date.now() + A_DAY_MS));
}
