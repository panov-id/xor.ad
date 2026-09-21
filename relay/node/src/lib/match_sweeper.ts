// Matches whose term ran out (chat spec §8.5: a match lives as long as the
// earlier of its two phrases). Nothing swept them until 2026-09-21, and each
// expired row kept two snapshots of other people's phrases with no term at all
// — found by the likes review panel of that day. The participants go by cascade.
//
// Only matches that never became a chat: a chat outlives its match, and when
// `chats` exists (step 5) its row will hold what it needs; until then chat_id is
// always NULL and the condition costs nothing.
//
// In batches, as the other sweepers are: one DELETE over a backlog would hold
// its locks for as long as the backlog is long.

import { queryOrThrow } from "./db.ts";
import { inc } from "./metrics.ts";

const BATCH = 2000;
const MAX_BATCHES = 500;

export async function sweepExpiredMatches(): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await queryOrThrow<{ count: string }>(
      `WITH gone AS (
         DELETE FROM matches
          WHERE id IN (SELECT id FROM matches
                        WHERE expires_at <= now() AND chat_id IS NULL
                        LIMIT ${BATCH})
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM gone`,
    );
    const took = Number(rows[0]?.count ?? 0);
    total += took;
    if (took < BATCH) break;
  }
  if (total > 0) inc("relay_match_swept_total", {}, total);
  return total;
}
