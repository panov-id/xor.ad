// The year of a support request (chat spec §13: "a year from created_at";
// the storefronts' privacy policy: "A support message: 1 year"). Before
// 2026-09-22 the promise had no executor — the open item support.sweeper.
//
// Daily, in batches so a backlog does not hold one long transaction. The
// team's daily summary of §13 is not here: support_requests carries no brand,
// so the node cannot tell which storefront's mailbox a request belongs to —
// an open question for the owner, recorded in docs/facts/open.tsv.

import { queryOrThrow } from "./db.ts";
import { inc } from "./metrics.ts";

const BATCH = 1000;
const MAX_BATCHES = 100;

export async function sweepSupport(): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const [gone] = await queryOrThrow<{ n: string }>(
      `WITH doomed AS (
         SELECT id FROM support_requests
          WHERE created_at < now() - interval '1 year'
          ORDER BY created_at
          LIMIT ${BATCH}
       ), gone AS (
         DELETE FROM support_requests WHERE id IN (SELECT id FROM doomed) RETURNING id
       )
       SELECT count(*)::text AS n FROM gone`,
    );
    const n = Number(gone?.n ?? 0);
    total += n;
    if (n < BATCH) break;
  }
  if (total > 0) inc("relay_support_swept_total", {}, total);
  return total;
}
