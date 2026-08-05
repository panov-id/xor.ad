// Taking the copy a notice will be examined against.
//
// The feed deletes a message four hours and twenty minutes after it was posted,
// so a notice that arrives in the evening is about something that no longer
// exists by morning. The copy is therefore taken the moment the notice arrives —
// not before (that would keep every message forever, against the whole point of
// the product) and not later (there would be nothing left).
//
// Three outcomes, and telling them apart matters more than it looks:
//
//   captured        we hold a copy; the notice can be examined
//   gone            the surface exists and the thing is not in it — expired
//   not_accessible  we could never have had it (a chat) or cannot yet (a surface
//                   that is not built), which is not the same as "expired"
//
// Marking the third as "gone" would tell a notifier their report died of old age
// when in truth we never looked.

import { query } from "./db.ts";
import { log } from "./log.ts";

export type CaptureStatus = "received" | "target_gone" | "not_accessible";

export interface Capture {
  snapshot: Record<string, unknown> | null;
  status: CaptureStatus;
}

// Surfaces whose content lives in the database and can therefore be copied.
// A surface missing from here is not an oversight to fix silently — it means the
// product has not built it yet, and the notice needs a human either way.
const SNAPSHOTTABLE: Record<string, { table: string; columns: string }> = {
  feed_message: { table: "feed_messages", columns: "id, body, zone, created_at, identity_id" },
  offer: { table: "offers", columns: "id, offer_text, discount_value, conditions, created_at, business_profile_id" },
};

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [name],
  );
  return Boolean(rows?.[0]?.exists);
}

export async function captureTarget(
  kind: string,
  targetId: string | null,
  brand: string,
): Promise<Capture> {
  // A chat is carried, never stored: there is nothing on our side to copy, and
  // saying so plainly is the answer the notifier gets.
  if (kind === "chat") return { snapshot: null, status: "not_accessible" };

  // Free-form reports carry no identifier. Nothing to copy, and nothing wrong
  // with that — a person still gets an answer.
  if (!targetId || !(kind in SNAPSHOTTABLE)) return { snapshot: null, status: "received" };

  const { table, columns } = SNAPSHOTTABLE[kind];
  if (!(await tableExists(table))) {
    log("info", "notice about a surface that is not built yet", { kind, table, brand });
    return { snapshot: null, status: "not_accessible" };
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT ${columns} FROM ${table} WHERE id = $1 LIMIT 1`,
    [targetId],
  );
  if (rows === null) return { snapshot: null, status: "received" };
  if (rows.length === 0) return { snapshot: null, status: "target_gone" };

  return { snapshot: { table, captured_at: new Date().toISOString(), row: rows[0] }, status: "received" };
}
