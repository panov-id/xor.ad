// Article 24(3) DSA: how many active recipients, on average over six months
// (dsa.art24-3; db/053).
//
// The method, decided by quorum 2026-09-24 (five of five): an active recipient
// of a month is an identity that finished signing up and had a session seen in
// that month. The node knows no country, so all of them count as in the Union —
// an estimate from above, which is the safe side of an obligation to report.
// Page views of the storefronts without an identity are not counted: there is
// no counter for them, and the method says so rather than guessing.
//
// sessions.last_seen_at is overwritten, at most once a day, so a month cannot
// be counted after it is over. The daily pass counts the month so far and keeps
// the larger of that and what the row already holds: the number only grows
// within a month, and a pass missed on its last day costs at most a day.
import { query } from "./db.ts";

export async function countActiveRecipients(): Promise<number | null> {
  const rows = await query<{ active: number }>(
    `INSERT INTO dsa_monthly_recipients (month, active)
     SELECT date_trunc('month', now())::date, count(DISTINCT s.identity)::int
       FROM sessions s JOIN identities i ON i.id = s.identity
      WHERE s.last_seen_at >= date_trunc('month', now()) AND i.signup_completed_at IS NOT NULL
     ON CONFLICT (month) DO UPDATE
       SET active = GREATEST(dsa_monthly_recipients.active, EXCLUDED.active), taken_at = now()
     RETURNING active`,
  );
  return rows === null ? null : rows[0].active;
}

// The six complete months before this one, newest first, and their average.
// Fewer than six is said, not padded: `complete` is false until there are six.
export async function averageRecipients(): Promise<
  { months: { month: string; active: number }[]; average: number | null; complete: boolean } | null
> {
  const rows = await query<{ month: string; active: number }>(
    `SELECT to_char(month, 'YYYY-MM') AS month, active FROM dsa_monthly_recipients
      WHERE month < date_trunc('month', now())::date
      ORDER BY month DESC LIMIT 6`,
  );
  if (rows === null) return null;
  const average = rows.length === 0 ? null : Math.round(rows.reduce((sum, r) => sum + r.active, 0) / rows.length);
  return { months: rows, average, complete: rows.length === 6 };
}
