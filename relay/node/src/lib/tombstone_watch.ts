// Watchdog С3, the letter half: a tombstone of a job whose period the privacy
// policy promises is news to a person, not a row for someone to find.
//
// A job that runs out of attempts becomes a tombstone (lib/jobs.ts) and stops.
// The re-arm (scheduled.ts, rearmPass) starts the chain again; this says that
// it had stopped.
//
// The rows are leased, the way the queue leases jobs: one short statement marks
// them taken for ten minutes (FOR UPDATE SKIP LOCKED, so two nodes never take
// one), the letters go outside any transaction, and short statements write what
// happened. The first cut held a transaction open while the letters went, and
// the pool closes a session idle in a transaction after RELAY_DB_TIMEOUT_MS —
// fifteen seconds; a slow provider rolled the whole pass back, every time
// (review panel С2, 23.09.2026). A pass that dies leaves a lease that runs out.
import { enabled as databaseEnabled, query } from "./db.ts";
import { escalationAddresses } from "./dsa_watchdog.ts";
import { log } from "./log.ts";
import { sendJobTombstone } from "./mailer.ts";

export type Tombstone = { id: string; kind: string; attempts: number };
type Send = (to: string, tombstone: Tombstone) => Promise<boolean>;

const LEASE = "10 minutes";

export async function reportTombstones(
  kind: string,
  send: Send = sendJobTombstone,
): Promise<{ reported: number; unsent: number }> {
  if (!databaseEnabled()) throw new Error("no database to read the tombstones from");
  const tombstones = await query<Tombstone>(
    `UPDATE jobs SET report_leased_until = now() + $2::interval
      WHERE id IN (
        SELECT id FROM jobs
         WHERE kind = $1 AND locked_until = 'infinity' AND reported_at IS NULL
           AND (report_leased_until IS NULL OR report_leased_until < now())
         ORDER BY id
         LIMIT 50
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id::text AS id, kind, attempts`,
    [kind, LEASE],
  );
  if (tombstones === null) throw new Error("could not read the tombstones");
  const to = escalationAddresses();
  let reported = 0, unsent = 0;
  for (const tombstone of tombstones) {
    // Told if anyone was told: one address refusing must not send it again to
    // the ones who got it, every pass, for ever (review panel С2, 23.09.2026).
    let told = false;
    for (const address of to) {
      if (await send(address, tombstone)) told = true;
    }
    if (told) {
      await query(`UPDATE jobs SET reported_at = now(), report_leased_until = NULL WHERE id = $1`, [tombstone.id]);
      reported++;
    } else {
      unsent++;
      await query(`UPDATE jobs SET report_leased_until = NULL WHERE id = $1`, [tombstone.id]);
    }
  }
  if (unsent) {
    log("error", "a job gave up and nobody could be told", { kind, reported, unsent });
  } else if (reported) {
    log("info", "told people a job gave up", { kind, reported });
  }
  return { reported, unsent };
}
