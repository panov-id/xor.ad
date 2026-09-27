// Step 8: what the first tier of rules flagged at a table waits for a person,
// as a phrase does (chat spec §6.1, §8.3): a line with visible_at NULL, and a
// table's name in name_pending. Without this the flagged waited for ever.
//
// Publishing a line stamps visible_at; refusing deletes it. Publishing a name
// moves it into `name`; refusing clears it — the table lives on without a
// name (§6.1). The moderator sees the text and the table's brand, never an
// identity, and a tenant's moderator only their own brand.

import { query, transaction } from "./db.ts";
import { tableEvent } from "./tables.ts";

// What waits, for the queue and for the watchdog: one row per item, with its
// brand and the moment it began to wait.
export const TABLE_WAITING = `
  SELECT 'line' AS kind, l.id, l.brand, l.text, l.created_at
    FROM table_lines l
   WHERE l.visible_at IS NULL AND l.kind IN ('line', 'application', 'refusal')
  UNION ALL
  SELECT 'name', t.id, t.brand, t.name_pending, t.created_at
    FROM tables t
   WHERE t.name_pending IS NOT NULL AND t.closed_at IS NULL`;

export interface TableQueueItem {
  kind: "line" | "name";
  id: string;
  brand: string;
  text: string;
  waiting_seconds: number;
}

export async function tableQueue(brand: string | null): Promise<TableQueueItem[] | null> {
  const rows = await query<{ kind: "line" | "name"; id: string; brand: string; text: string; waiting: string }>(
    `SELECT w.kind, w.id, w.brand, w.text, floor(extract(epoch from now() - w.created_at))::bigint::text AS waiting
       FROM (${TABLE_WAITING}) w
      WHERE $1::text IS NULL OR w.brand = $1
      ORDER BY w.created_at LIMIT 200`,
    [brand],
  );
  return rows?.map((r) => ({ kind: r.kind, id: r.id, brand: r.brand, text: r.text, waiting_seconds: Number(r.waiting) })) ??
    null;
}

// One verdict, once: false when it was decided already, swept, of another
// brand, or never existed — one answer for all four.
export async function decideTable(
  kind: "line" | "name",
  id: string,
  verdict: "publish" | "refuse",
  brand: string | null,
): Promise<string | null> {
  const fence = `AND ($2::text IS NULL OR brand = $2)`;
  const sql = kind === "line"
    ? verdict === "publish"
      ? `UPDATE table_lines SET visible_at = now() WHERE id = $1 AND visible_at IS NULL ${fence} RETURNING brand, table_id`
      : `DELETE FROM table_lines WHERE id = $1 AND visible_at IS NULL ${fence} RETURNING brand, table_id`
    : verdict === "publish"
    ? `UPDATE tables SET name = name_pending, name_pending = NULL
        WHERE id = $1 AND name_pending IS NOT NULL ${fence} RETURNING brand, id AS table_id, created_by`
    : `UPDATE tables SET name_pending = NULL WHERE id = $1 AND name_pending IS NOT NULL ${fence}
       RETURNING brand, id AS table_id, created_by`;
  // The face it was decided for, or null when nothing applied: the watchdog
  // counts a decision by face (lib/moderation_watch.ts, db/078).
  return await transaction(async (run) => {
    const [done] = await run<{ brand: string; table_id: string; created_by?: string | null }>(sql, [id, brand]);
    if (!done) return null;
    // The frames (protocol §4.4): a published line to the table's rooms; the
    // name's verdict to the author's own sessions, `name_verdict` with
    // `table`, as a profile name's goes (lib/sessions.ts, session_frame).
    if (kind === "line" && verdict === "publish") await tableEvent(run, done.table_id, "line", id);
    if (kind === "name" && done.created_by) {
      const sessions = await run<{ id: string }>(`SELECT id FROM sessions WHERE identity = $1`, [done.created_by]);
      const body = JSON.stringify({ type: "name_verdict", data: { accepted: verdict === "publish", table: done.table_id } });
      for (const s of sessions) await run(`SELECT pg_notify('session_frame', $1)`, [`${s.id}|${body}`]);
    }
    return done.brand;
  });
}
