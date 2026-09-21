// Queued chat messages past their term (limits.tsv chat.pending.ttl, 260
// minutes — the longest a conversation can last, §8.8). The row is ciphertext
// nobody on the node can read, and a row past its term is one nobody will
// collect either: the conversation it belonged to is over for at least one
// side, and with it the chat key (§8.13).
//
// In batches, as the other sweepers are.

import { queryOrThrow } from "./db.ts";
import { inc } from "./metrics.ts";

const TTL_MINUTES = 260;
const BATCH = 2000;
const MAX_BATCHES = 500;

export async function sweepExpiredPending(): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await queryOrThrow<{ count: string }>(
      `WITH gone AS (
         DELETE FROM pending_deliveries
          WHERE (chat, recipient_session, local_id) IN (
            SELECT chat, recipient_session, local_id FROM pending_deliveries
             WHERE created_at <= now() - interval '${TTL_MINUTES} minutes'
             LIMIT ${BATCH})
          RETURNING 1
       )
       SELECT count(*)::text AS count FROM gone`,
    );
    const took = Number(rows[0]?.count ?? 0);
    total += took;
    if (took < BATCH) break;
  }
  if (total > 0) inc("relay_pending_swept_total", {}, total);
  // Socket tickets past their thirty seconds (limits.tsv ticket.lifetime): a
  // spent one is deleted on use, an unused one here.
  await queryOrThrow(`DELETE FROM socket_tickets WHERE expires_at <= now()`);
  return total;
}
