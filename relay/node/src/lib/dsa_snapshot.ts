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

// Six different things arrive at `not_accessible`, and from the outside they
// were indistinguishable: a chat that is carried and never stored, a kind this
// file was never taught, a surface not built yet, a notice with no tenant to
// scope the lookup to, and a lookup that broke. Answering the notifier is the
// same in all six — we could not look — but deciding what to fix is not, and
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
  // Which face the copied row is attributed to. Null when nothing was copied.
  //
  // Taking the copy by the target (2026-09-07) means the row may belong to a
  // face other than the one the notice was filed through, and the caller has to
  // know that to route the notice: examined by its owner's moderators or by the
  // platform, never by whoever chose to send it. Attribution, not a filter — the
  // lookup above has already happened by the time this is read.
  owner: string | null;
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
// `tenant` is the column that says whose row it is. Whether a lookup is scoped
// by it is `visibility`, and that is the boundary question, decided 2026-09-07:
//
//   the snapshot is bounded by what the notifier could see.
//
// One rule, and it lands differently per surface because the surfaces differ:
//
//   world      the feed and the tables. `brand` there is attribution only and
//              takes no part in what is shown (docs/chat §8.3), so a phrase is
//              visible to everyone whichever face they arrived through. The
//              notifier saw it, so the notice follows the target and the lookup
//              is not scoped. This deliberately lets a moderator read a row
//              attributed to another tenant — that row was public to the whole
//              world before the notice, and refusing to examine it would mean
//              telling a person we cannot look at what they are looking at.
//   per_brand  the venue offer. docs/offers/SPEC makes `brand` the thing every
//              search is bounded by, so an offer does not exist for someone who
//              arrived through another face. A notice about it is `out_of_scope`,
//              which is the truth: under that face there was nothing to see.
//
// Until this was decided the code scoped everything by tenant — not by choice
// but because the snapshots were written before the question was answered
// (2026-09-01). It closed the cross-tenant hole and, on the feed, closed it by
// refusing to examine phrases the notifier had plainly seen.
export type Visibility = "world" | "per_brand";

export const SNAPSHOTTABLE: Record<
  string,
  {
    table: string;
    columns: string;
    posted: string;
    tenant: string;
    visibility: Visibility;
    // The column that says the row is public. Null where the surface has no such
    // step. A row where this is NULL was seen by nobody and is never copied:
    // "what the notifier could see" is bounded by time as well as by face.
    published: string | null;
    quote: string;
  }
> = {
  feed_message: {
    table: "feed_messages",
    columns: "id, text, mode, created_at, author_identity",
    posted: "created_at",
    tenant: "brand",
    visibility: "world",
    published: "visible_at",
    quote: "text",
  },
  offer: {
    table: "offers",
    columns: "id, offer_text, discount_value, conditions, published_at, venue_id",
    posted: "published_at",
    tenant: "brand",
    visibility: "per_brand",
    published: "published_at",
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
    visibility: "world",
    published: "visible_at",
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
    return { snapshot: null, status: "not_accessible", reason: "chat_not_stored", owner: null };
  }

  // Free-form reports carry no identifier. Nothing to copy, and nothing wrong
  // with that — a person still gets an answer.
  if (!targetId) return { snapshot: null, status: "received", reason: null, owner: null };

  // Object.hasOwn rather than `in`: "constructor" is in every object, and the
  // only thing keeping that unreachable is the KINDS list one file away.
  //
  // A kind we do not know is not "no copy was needed" — it is a surface nobody
  // taught this file about, which is a failure to look. Saying "received" would
  // file such a notice as examined against nothing, silently, on the day a fifth
  // kind is added to KINDS without a line here.
  if (!Object.hasOwn(SNAPSHOTTABLE, kind)) {
    log("info", "notice about a kind with no snapshot rule", { kind });
    return { snapshot: null, status: "not_accessible", reason: "unknown_kind", owner: null };
  }

  const { table, columns, tenant, visibility, published } = SNAPSHOTTABLE[kind];
  const scoped = visibility === "per_brand";

  // An unattributed notice belongs to no tenant, so there is no scope to look
  // within. Looking anyway — which is what an unscoped lookup did — would copy
  // whichever tenant's row happened to carry that identifier.
  //
  // This is checked before the surface exists, and the order matters: having no
  // tenant is a property of the notice, while a missing surface is a property of
  // the deployment. With the surface check first, every unattributed notice on a
  // box without product tables was filed as "surface_absent" — the product's
  // fault rather than the notice's — and the reason could never appear at all.
  //
  // It only applies where the face is the boundary. On a world surface there is
  // nothing to scope to in the first place: the phrase was public, and a notice
  // that names no face is still about something its sender could see.
  if (scoped && !brand) {
    log("info", "unattributed notice: no tenant to scope the copy to", { kind, table });
    return { snapshot: null, status: "not_accessible", reason: "unattributed", owner: null };
  }

  if (!(await tableExists(table))) {
    log("info", "notice about a surface that is not built yet", { kind, table, brand });
    return { snapshot: null, status: "not_accessible", reason: "surface_absent", owner: null };
  }

  // The face of the row comes back with it, always: on a world surface it is what
  // routes the notice, and asking for it separately would be a second lookup
  // answering about a row we already hold.
  const selected = columns.split(",").map((column) => column.trim()).includes(tenant)
    ? columns
    : `${columns}, ${tenant}`;

  // "What the notifier could see" is not only a matter of face. A phrase waiting
  // in the moderation queue has `visible_at IS NULL` and was public to nobody, so
  // copying it would break the rule this file exists to keep — in the direction
  // that is worse, since the copy would then be examined and answered as though
  // the notifier had seen it. Surfaces that publish in one step say `published`
  // is null and are read as always visible.
  const visible = published ? ` AND ${published} IS NOT NULL` : "";

  const rows = scoped
    ? await query<Record<string, unknown>>(
      `SELECT ${selected} FROM ${table} WHERE id = $1 AND ${tenant} = $2${visible} LIMIT 1`,
      [targetId, brand],
    )
    : await query<Record<string, unknown>>(
      `SELECT ${selected} FROM ${table} WHERE id = $1${visible} LIMIT 1`,
      [targetId],
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
    return { snapshot: null, status: "not_accessible", reason: "lookup_failed", owner: null };
  }
  if (rows.length === 0) {
    // On a world surface the lookup was not scoped, so an empty answer has only
    // one meaning: the row is not there at all. The phrase ran out its 4:20.
    if (!scoped) return { snapshot: null, status: "target_gone", reason: null, owner: null };

    // Nothing under this face. Two very different things look identical from
    // here: the offer expired, or it exists under a face the notifier did not
    // arrive through — and there it was never visible to them.
    // Answering "target_gone" for the second is not a gap in the copy, it is an
    // untrue statement in an Article 16 reply: the offer is alive.
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
      return { snapshot: null, status: "not_accessible", reason: "lookup_failed", owner: null };
    }
    if (anywhere.length > 0) {
      log("info", "notice about a target that lives under another face", { kind, table, brand });
      return { snapshot: null, status: "not_accessible", reason: "out_of_scope", owner: null };
    }
    return { snapshot: null, status: "target_gone", reason: null, owner: null };
  }

  const row = rows[0];
  return {
    snapshot: { table, captured_at: new Date().toISOString(), row },
    status: "received",
    reason: null,
    owner: typeof row[tenant] === "string" ? row[tenant] as string : null,
  };
}
