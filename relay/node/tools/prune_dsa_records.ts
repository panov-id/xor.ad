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

export interface PruneResult {
  notices: number;
  statements: number;
  applied: boolean;
}

export async function pruneDsaRecords(opts: { apply?: boolean; days?: number } = {}): Promise<PruneResult> {
  const days = opts.days ?? YEAR_DAYS;
  const apply = opts.apply ?? false;
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

  // One transaction, and statements chosen by the age of their notice.
  //
  // Two separate deletes on their own ages looked like "the pair goes together"
  // and was not: `dsa_statements.notice_id` is ON DELETE SET NULL (db/005), so a
  // statement younger than a year survived the first delete and then had its
  // link quietly nulled by the second. What is left is an Article 17 statement
  // that cannot say which notice produced it — the record kept for defending a
  // decision, with the decision's cause removed. A year-old notice takes its
  // statement with it now, whatever the statement's own age.
  //
  // The transaction is the other half: without it a failure between the two
  // deletes left statements gone and notices in place, and nothing rolled back.
  return await transaction(async (tx) => {
    const statements = await tx<{ id: string }>(
      `DELETE FROM dsa_statements
        WHERE created_at < ${cutoff}
           OR notice_id IN (SELECT id FROM dsa_notices WHERE created_at < ${cutoff})
        RETURNING id`,
    );
    const notices = await tx<{ id: string }>(
      `DELETE FROM dsa_notices WHERE created_at < ${cutoff} RETURNING id`,
    );
    return { notices: notices.length, statements: statements.length, applied: true };
  });
}

if (import.meta.main) {
  const result = await pruneDsaRecords({ apply: Deno.args.includes("--apply") });
  console.log(
    result.applied
      ? `deleted: ${result.notices} notices, ${result.statements} statements`
      : `would delete: ${result.notices} notices, ${result.statements} statements`,
  );
}
