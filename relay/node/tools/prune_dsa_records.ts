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

import { query, queryOrThrow } from "../src/lib/db.ts";

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
    const statements = await query<{ count: string }>(
      `SELECT count(*)::text AS count FROM dsa_statements WHERE created_at < ${cutoff}`,
    );
    return {
      notices: Number(notices?.[0]?.count ?? 0),
      statements: Number(statements?.[0]?.count ?? 0),
      applied: false,
    };
  }

  // Statements first: one points at a notice, and dropping the notice first
  // would only null the link rather than remove the pair together.
  const statements = await queryOrThrow<{ id: string }>(
    `DELETE FROM dsa_statements WHERE created_at < ${cutoff} RETURNING id`,
  );
  const notices = await queryOrThrow<{ id: string }>(
    `DELETE FROM dsa_notices WHERE created_at < ${cutoff} RETURNING id`,
  );

  return { notices: notices.length, statements: statements.length, applied: true };
}

if (import.meta.main) {
  const result = await pruneDsaRecords({ apply: Deno.args.includes("--apply") });
  console.log(
    result.applied
      ? `deleted: ${result.notices} notices, ${result.statements} statements`
      : `would delete: ${result.notices} notices, ${result.statements} statements`,
  );
}
