// Notices and statements of reasons live one year, then go.
//
//   deno run --allow-env --allow-net tools/prune_dsa_records.ts [--apply]
//
// A year is not a number picked for comfort: complaints about offers already
// keep exactly that window, and two different periods for records of the same
// kind would be two things to remember. Beyond a year a notice serves neither
// purpose it was kept for — establishing a pattern, or defending the decision.
//
// What survives is a count without people in it: how many notices there were,
// not who sent them. That is enough to answer "is this growing?" and not enough
// to identify anyone.

import { query, transaction } from "../src/lib/db.ts";

const YEAR_DAYS = 365;

// How many notices one transaction takes. Small enough that the locks and the
// snapshot it holds are measured in a fraction of a second even on a table that
// has been accumulating for a year; large enough that a year's worth does not
// become tens of thousands of round trips.
const BATCH = 5000;

export interface PruneResult {
  notices: number;
  statements: number;
  applied: boolean;
}

export async function pruneDsaRecords(
  // `batch` is here for the probe: seeding tens of thousands of rows to cross
  // the real boundary would make the suite slow for no extra truth.
  opts: { apply?: boolean; days?: number; batch?: number } = {},
): Promise<PruneResult> {
  const days = opts.days ?? YEAR_DAYS;
  const apply = opts.apply ?? false;
  const batch = Math.max(1, opts.batch ?? BATCH);
  const cutoff = `now() - interval '${days} days'`;

  if (!apply) {
    const notices = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM dsa_notices WHERE created_at < ${cutoff}`,
    );
    // The same condition the delete below uses, and it has to be: the preview is
    // the only look anybody gets before legal records go. Counting statements by
    // their own age alone said "0" for exactly the case this tool was fixed to
    // handle — a year-old notice with a young statement — and then --apply
    // removed it.
    const statements = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM dsa_statements
        WHERE created_at < ${cutoff}
           OR notice_id IN (SELECT id FROM dsa_notices WHERE created_at < ${cutoff})`,
    );
    return {
      notices: Number(notices?.[0]?.count ?? 0),
      statements: Number(statements?.[0]?.count ?? 0),
      applied: false,
    };
  }

  // Batches, and inside each one a transaction. Statements chosen by the age of
  // their notice.
  //
  // Why by the notice's age: two separate deletes on their own ages looked like
  // "the pair goes together" and was not. `dsa_statements.notice_id` is ON
  // DELETE SET NULL (db/005), so a statement younger than a year survived the
  // first delete and then had its link quietly nulled by the second — leaving an
  // Article 17 statement that cannot name the notice that produced it, which is
  // the record kept for defending a decision with the decision's cause removed.
  //
  // Why batches: the first fix put the whole year in one transaction, and a
  // year's worth is not a unit of work. It held row locks on both tables until
  // the last row was gone, kept a quarter of the four-connection pool for that
  // whole time, and held back autovacuum across the entire database — a long
  // transaction pins the horizon everywhere, not just where it is deleting. A
  // failure at the end threw away all of it. Each batch commits on its own, so
  // an interrupted prune is a prune that got part way, which is the honest shape
  // for work that is idempotent by construction: what is deleted stays deleted.
  //
  // The order inside a batch is the invariant, not the batching: statements
  // first, then the notices they belonged to. Reversing it would null the links
  // before the statements are read.
  let notices = 0;
  let statements = 0;

  for (;;) {
    const done = await transaction(async (tx) => {
      // The batch is chosen by notice, and the statements follow it. Picking
      // statements independently would let a batch delete a statement whose
      // notice lands in the next one — briefly leaving the orphan this tool
      // exists to prevent, and permanently if the run stops in between.
      const doomed = await tx<{ id: string }>(
        `SELECT id FROM dsa_notices WHERE created_at < ${cutoff} LIMIT ${batch}`,
      );
      const ids = doomed.map((row) => row.id);

      // Statements old enough on their own, taken in the same bounded step so a
      // long tail of them cannot make one batch unbounded.
      const aged = await tx<{ count: string }>(
        `WITH doomed AS (
           SELECT id FROM dsa_statements WHERE created_at < ${cutoff} LIMIT ${batch}
         )
         DELETE FROM dsa_statements WHERE id IN (SELECT id FROM doomed)
         RETURNING 1 AS count`,
      );
      statements += aged.length;

      if (ids.length === 0) return aged.length === 0;

      const attached = await tx<{ count: string }>(
        `DELETE FROM dsa_statements WHERE notice_id = ANY($1) RETURNING 1 AS count`,
        [ids],
      );
      statements += attached.length;

      const gone = await tx<{ count: string }>(
        `DELETE FROM dsa_notices WHERE id = ANY($1) RETURNING 1 AS count`,
        [ids],
      );
      notices += gone.length;

      // A short batch means this was the last one: nothing is left to take.
      return ids.length < batch;
    });
    if (done) break;
  }

  return { notices, statements, applied: true };
}

if (import.meta.main) {
  const result = await pruneDsaRecords({ apply: Deno.args.includes("--apply") });
  console.log(
    result.applied
      ? `deleted: ${result.notices} notices, ${result.statements} statements`
      : `would delete: ${result.notices} notices, ${result.statements} statements`,
  );
}
