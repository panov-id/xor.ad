// What the queue is for, so far: keeping the page-view objects inside their
// retention window without anyone remembering to.
//
// The job re-arms itself — it enqueues tomorrow's run as its last act — so the
// schedule lives in the same table as the work and needs no second mechanism to
// stay in step with it. A node that never comes back leaves the row claimable by
// whichever one does.

import { enqueue, enqueueOnce, handle } from "./jobs.ts";
import { log } from "./log.ts";
import { prunePageviews } from "../../tools/prune_pageviews.ts";

export const PRUNE_PAGEVIEWS = "prune_pageviews";
const A_DAY_MS = 24 * 60 * 60 * 1000;

export function registerScheduledJobs(): void {
  handle(PRUNE_PAGEVIEWS, async (payload) => {
    const days = typeof payload.days === "number" ? payload.days : undefined;
    const result = await prunePageviews({ days, apply: true });
    log("info", "pruned page views", { ...result });
    // Tomorrow's run is scheduled after this one succeeded. A failure retries on
    // the queue's own backoff instead of skipping a day.
    await enqueue(PRUNE_PAGEVIEWS, payload, new Date(Date.now() + A_DAY_MS));
  });
}

// Called once at start-up. `enqueueOnce` rather than `enqueue`: every node in
// the pool runs this line, and a standing intention does not want one copy per
// node.
export async function armScheduledJobs(): Promise<void> {
  await enqueueOnce(PRUNE_PAGEVIEWS, {}, new Date(Date.now() + A_DAY_MS));
}
