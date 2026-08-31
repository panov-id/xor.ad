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

// Five different things arrive at `not_accessible`, and from the outside they
// were indistinguishable: a chat that is carried and never stored, a kind this
// file was never taught, a surface not built yet, a notice with no tenant to
// scope the lookup to, and a lookup that broke. Answering the notifier is the
// same in all five — we could not look — but deciding what to fix is not, and
// the night's review had nothing to sort them by.
export type CaptureReason =
  | "chat_not_stored"
  | "unknown_kind"
  | "surface_absent"
  | "unattributed"
  | "out_of_scope"
  | "lookup_failed";

export interface Capture {
  snapshot: Record<string, unknown> | null;
  status: CaptureStatus;
  // Null whenever the status speaks for itself: a copy was taken, the target
  // was gone, or the report carried no identifier to look for.
  reason: CaptureReason | null;
}

// Surfaces whose content lives in the database and can therefore be copied.
// A surface missing from here is not an oversight to fix silently — it means the
// product has not built it yet, and the notice needs a human either way.
// The column names are the ones the specs define, and a test holds them there
// (test/dsa_snapshot_columns.test.ts). They had drifted into `body`, `zone`,
// `identity_id` and `business_profile_id` — none of which exist anywhere — and
// the drift was invisible because the surfaces are not built yet.
//
// The area is deliberately not copied. A notice asks whether a text is illegal,
// and the text is what answers it; where the phrase was shown says nothing about
// that, while a snapshot is kept for a year. Copying coordinates would keep a
// year of locations for no examining value.
//
// `tenant` is the column that says whose row it is, and every lookup is scoped
// by it. Without that, a notice naming another tenant's identifier copied their
// row into the reporter's notice, where the reporter's own moderator could read
// it — the notice is filed under the brand that sent it, so the usual brand
// filter was already pointing at the wrong tenant by the time it ran. It never
// fired only because these tables do not exist yet, which is the worst kind of
// safe: it would have opened silently on the day they were created.
export const SNAPSHOTTABLE: Record<
  string,
  { table: string; columns: string; posted: string; tenant: string; quote: string }
> = {
  feed_message: {
    table: "feed_messages",
    columns: "id, text, mode, created_at, author_identity",
    posted: "created_at",
    tenant: "brand",
    quote: "text",
  },
  offer: {
    table: "offers",
    columns: "id, offer_text, discount_value, conditions, published_at, venue_id",
    posted: "published_at",
    tenant: "brand",
    quote: "offer_text",
  },
  // A line at a table is public, unencrypted and moderated like the feed, so it
  // is copied like the feed — unlike a chat, where there is nothing on our side
  // to copy. Added 2026-08-30 together with the kind itself; the table does not
  // exist yet, and until it does the lookup above answers `not_accessible`.
  table_line: {
    table: "table_lines",
    columns: "id, text, created_at, author_identity, table_id",
    posted: "created_at",
    tenant: "brand",
    quote: "text",
  },
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
  // What the copy is scoped to, not a log field. Nullable because a notice may
  // arrive unattributed (lib/tenant.ts) — and an unattributed notice names no
  // tenant, so there is no scope to look within and nothing is copied.
  brand: string | null,
): Promise<Capture> {
  // A chat is carried, never stored: there is nothing on our side to copy, and
  // saying so plainly is the answer the notifier gets.
  if (kind === "chat") {
    return { snapshot: null, status: "not_accessible", reason: "chat_not_stored" };
  }

  // Free-form reports carry no identifier. Nothing to copy, and nothing wrong
  // with that — a person still gets an answer.
  if (!targetId) return { snapshot: null, status: "received", reason: null };

  // Object.hasOwn rather than `in`: "constructor" is in every object, and the
  // only thing keeping that unreachable is the KINDS list one file away.
  //
  // A kind we do not know is not "no copy was needed" — it is a surface nobody
  // taught this file about, which is a failure to look. Saying "received" would
  // file such a notice as examined against nothing, silently, on the day a fifth
  // kind is added to KINDS without a line here.
  if (!Object.hasOwn(SNAPSHOTTABLE, kind)) {
    log("info", "notice about a kind with no snapshot rule", { kind });
    return { snapshot: null, status: "not_accessible", reason: "unknown_kind" };
  }

  const { table, columns, tenant } = SNAPSHOTTABLE[kind];
  if (!(await tableExists(table))) {
    log("info", "notice about a surface that is not built yet", { kind, table, brand });
    return { snapshot: null, status: "not_accessible", reason: "surface_absent" };
  }

  // An unattributed notice belongs to no tenant, so there is no scope to look
  // within. Looking anyway — which is what an unscoped lookup did — would copy
  // whichever tenant's row happened to carry that identifier.
  if (!brand) {
    log("info", "unattributed notice: no tenant to scope the copy to", { kind, table });
    return { snapshot: null, status: "not_accessible", reason: "unattributed" };
  }

  const rows = await query<Record<string, unknown>>(
    `SELECT ${columns} FROM ${table} WHERE id = $1 AND ${tenant} = $2 LIMIT 1`,
    [targetId, brand],
  );
  // `query` answers null both for "no database" and for "the query failed", but
  // the table check above has already ruled out the first. So this is a broken
  // query — a wrong column, a renamed table — and calling it "received" would
  // file the notice as "no copy was needed" and examine it against nothing. It
  // is a failure to look, which is exactly what not_accessible means.
  if (rows === null) {
    log("error", "snapshot query failed — the notice will say we could not look", {
      kind,
      table,
      columns,
    });
    return { snapshot: null, status: "not_accessible", reason: "lookup_failed" };
  }
  if (rows.length === 0) {
    // Nothing under this face. Two very different things look identical from
    // here: the phrase expired, or it belongs to a person who arrived through
    // another face — the world is one, the notice comes in under a brand.
    // Answering "target_gone" for the second is not a gap in the copy, it is an
    // untrue statement in an Article 16 reply: the phrase is alive.
    //
    // So we ask whether the id exists at all — existence only, no columns, no
    // copy. What we learn is that something with this id lives elsewhere; what
    // the notifier is told is that we did not find it under this face, without
    // naming another one.
    const anywhere = await query<{ one: number }>(
      `SELECT 1 AS one FROM ${table} WHERE id = $1 LIMIT 1`,
      [targetId],
    );
    if (anywhere === null) {
      log("error", "existence check failed after an empty scoped lookup", { kind, table });
      return { snapshot: null, status: "not_accessible", reason: "lookup_failed" };
    }
    if (anywhere.length > 0) {
      log("info", "notice about a target that lives under another face", { kind, table, brand });
      return { snapshot: null, status: "not_accessible", reason: "out_of_scope" };
    }
    return { snapshot: null, status: "target_gone", reason: null };
  }

  return {
    snapshot: { table, captured_at: new Date().toISOString(), row: rows[0] },
    status: "received",
    reason: null,
  };
}
