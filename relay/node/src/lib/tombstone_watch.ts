// Watchdog С3, the letter half: a tombstone of a job whose period the privacy
// policy promises is news to a person, not a row for someone to find.
//
// A job that runs out of attempts becomes a tombstone (lib/jobs.ts) and stops.
// The re-arm (scheduled.ts, rearmPass) starts the chain again; this says that
// it had stopped. The rows are taken the way watchdog С1 takes notices — FOR
// UPDATE SKIP LOCKED — and the stamp is written only after the letter left.
import { enabled as databaseEnabled, transaction } from "./db.ts";
import { escalationAddresses } from "./dsa_watchdog.ts";
import { log } from "./log.ts";
import { sendJobTombstone } from "./mailer.ts";

export type Tombstone = { id: string; kind: string; attempts: number };
type Send = (to: string, tombstone: Tombstone) => Promise<boolean>;

// The rows are taken FOR UPDATE SKIP LOCKED inside one transaction, the
// letters go while they are held, and the stamp goes on only after a letter
// left — then the transaction commits. The first cut stamped first and took
// the stamp back on failure through `query`, which swallows its own errors: a
// database that blinked between the two left the stamp, and the letter never
// went (review panel, 23.09.2026). Now nothing is stamped that was not sent; a
// node that dies mid-pass rolls back and the next pass sends again. A second
// copy is the price, as in watchdog С1.
export async function reportTombstones(
  kind: string,
  send: Send = sendJobTombstone,
): Promise<{ reported: number; unsent: number }> {
  if (!databaseEnabled()) throw new Error("no database to read the tombstones from");
  const to = escalationAddresses();
  const result = await transaction(async (run) => {
    const tombstones = await run<Tombstone>(
      `SELECT id::text AS id, kind, attempts FROM jobs
        WHERE kind = $1 AND locked_until = 'infinity' AND reported_at IS NULL
        ORDER BY id
        LIMIT 50
        FOR UPDATE SKIP LOCKED`,
      [kind],
    );
    let reported = 0, unsent = 0;
    for (const tombstone of tombstones) {
      let failed = to.length === 0;
      // Every address again next time if one failed, including any that got it.
      for (const address of to) {
        if (!await send(address, tombstone)) failed = true;
      }
      if (failed) {
        unsent++;
        continue;
      }
      await run(`UPDATE jobs SET reported_at = now() WHERE id = $1 AND reported_at IS NULL`, [tombstone.id]);
      reported++;
    }
    return { reported, unsent };
  });
  if (result.unsent) {
    log("error", "a job gave up and nobody could be told", { kind, ...result });
  } else if (result.reported) {
    log("info", "told people a job gave up", { kind, reported: result.reported });
  }
  return result;
}
