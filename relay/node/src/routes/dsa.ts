// The moderator's side of Article 16: the queue of notices, and the act of
// deciding one.
//
// Deciding is not an edit. It either removes somebody's content or refuses
// somebody's report, and both outcomes owe a written reason — to the author
// under Article 17, to the notifier under Article 16(5). So the endpoint does
// not take a status: it takes the reasons, and writes the status from them.
//
// What it will never do is hand the notifier's name to the author. Article
// 17(3)(b) would permit that where strictly necessary; the offers spec forbids
// it outright for complaints, and keeping one rule for both is worth more than
// the exception.

import { route } from "../lib/router.ts";
import { json, readJson } from "../lib/http.ts";
import { isDenied, requirePermission } from "../lib/access_guard.ts";
import { query, queryOrThrow, transaction } from "../lib/db.ts";
import { recordAuditEvent } from "../lib/audit.ts";
import { sendNoticeDecision, sendStatementOfReasons } from "../lib/mailer.ts";
import { log } from "../lib/log.ts";

interface NoticeRow {
  id: string;
  // Nullable since migration 007: a notice can arrive naming no storefront.
  // The type said `string` and the compiler believed it, which is why the
  // statement insert below was written as if a brand were always there.
  //
  // Since 2026-09-07 there is a second way to be null: the copy belongs to a
  // face other than the one the notice was filed through, so the platform
  // examines it instead of that face (db/015). Null therefore no longer means
  // "nobody knows whose this is" — it means "the platform's", for one of two
  // reasons, and `received_via` is what tells them apart.
  brand: string | null;
  // The face it arrived through. Attribution: never filtered on, and shown so a
  // platform moderator can see whose storefront the reporter was using.
  received_via: string | null;
  target_kind: string;
  target_id: string | null;
  snapshot: unknown;
  reason_text: string;
  notifier_name: string | null;
  notifier_email: string | null;
  status: string;
  snapshot_state: string;
  snapshot_reason: string | null;
  created_at: string;
  decided_at: string | null;
}

const OPEN = ["received", "in_review"];

// The queue: oldest first, because a notice that waits is the one that matters.
route("GET", "/admin/dsa-notices", async ({ req, url }) => {
  const access = await requirePermission(req, "dsa_notices.read");
  if (isDenied(access)) return access.response;

  // A tenant reads its own notices and nothing else. The permission alone was
  // the whole check here, and a notice carries the notifier's name and email —
  // so every reader who had `dsa_notices.read` was reading every tenant's. Not
  // reachable through today's roles, since `tenant_admin` lacks the permission;
  // reachable in one step, because a tenant admin may hand somebody under their
  // own brand the `moderator` role, which carries read and decide both.
  //
  // An unattributed notice (brand IS NULL, see db/007) stays with the platform.
  // It arrived without a usable key, so which tenant it concerns is precisely
  // what nobody knows, and handing it to a guess would be worse than holding it.
  const mine = access.user.brand;
  const open = url.searchParams.get("state") !== "all";
  const conditions: string[] = [];
  const args: unknown[] = [];
  if (open) {
    args.push(OPEN);
    conditions.push(`status = ANY($${args.length})`);
  }
  if (mine) {
    args.push(mine);
    conditions.push(`brand = $${args.length}`);
  }
  const rows = await query<NoticeRow>(
    `SELECT id, brand, received_via, target_kind, target_id, snapshot, snapshot_state, snapshot_reason,
            reason_text, notifier_name, notifier_email, status, created_at, decided_at
       FROM dsa_notices
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY created_at ASC
      LIMIT 200`,
    args,
  );
  if (rows === null) return json({ error: "database unavailable" }, 503);

  // How many there really are, and how many of those the platform must decide
  // itself. Counted here rather than over the page: the panel used to count the
  // rows it had been given, so `x-total-count` was the size of the slice and the
  // queue picker's number was "how many of the first two hundred" — which shrinks
  // as the queue overflows and reads as good news. Found by a review lens on
  // 2026-09-08.
  const totals = await query<{ total: string; platform: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE brand IS NULL)::text AS platform
       FROM dsa_notices
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`,
    args,
  );
  const total = totals?.[0]?.total ?? String(rows.length);
  const platform = totals?.[0]?.platform ?? "0";

  // A plain array plus the count headers: what the panel's data provider reads.
  return json(rows, 200, {
    "x-total-count": total,
    "x-platform-count": platform,
  });
});

interface DecisionBody {
  decision?: unknown; // "upheld" | "rejected"
  facts?: unknown;
  ground_kind?: unknown; // "legal" | "contractual"
  ground_text?: unknown;
  restriction?: unknown; // required when upheld
  recipient_identity?: unknown; // required when upheld
}

const RESTRICTIONS = new Set(["removed", "hidden", "offer_taken_down", "access_restricted"]);

const trimmed = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

// Article 18: informing law enforcement, and leaving something behind that says
// it happened.
//
// The obligation is on the provider — where information gives rise to a
// suspicion of a criminal offence involving a threat to life or safety, inform
// the authorities promptly and give all relevant information available. The
// judgement is a person's: a notice carries no label saying it is that one, by
// design (SPEC §5.1), so nothing here decides anything on its own.
//
// What this route does is the part a person cannot do reliably: record that it
// happened. Until 2026-09-08 the fact of such a report existed nowhere, which
// means it could not be shown afterwards. The recipient is written down rather
// than assumed, because the article names more than one — the Member State
// concerned first, and Cyprus or Europol only when that State cannot be
// identified.
const RECIPIENTS = new Set(["cy_police_cybercrime", "europol", "other_member_state"]);

route("POST", "/admin/dsa-notices/:id/escalate", async ({ req, params }) => {
  const access = await requirePermission(req, "dsa_notices.escalate");
  if (isDenied(access)) return access.response;

  const body = await readJson<{ recipient?: unknown; sent_at?: unknown; note?: unknown }>(req);
  if (!body) return json({ error: "invalid body" }, 422);

  const recipient = typeof body.recipient === "string" ? body.recipient : "";
  if (!RECIPIENTS.has(recipient)) {
    // A free-text recipient would fill up with "reported" and prove nothing. The
    // set is small on purpose and matches the article's own list.
    return json({
      error: "recipient must be one of: " + [...RECIPIENTS].join(", "),
    }, 422);
  }

  // Which authority, and — when it is another Member State — which one. The
  // article asks for the State concerned, and "some other country" is not an
  // answer anybody can act on a year later.
  const note = trimmed(body.note, 2000);
  if (recipient === "other_member_state" && !note) {
    return json({ error: "name the Member State and the channel in `note`" }, 422);
  }

  const rows = await query<NoticeRow>(
    `SELECT id, brand, target_kind, target_id, status FROM dsa_notices WHERE id = $1`,
    [params.id],
  );
  if (rows === null) return json({ error: "database unavailable" }, 503);
  const notice = rows[0];
  if (!notice) return json({ error: "no such notice" }, 404);
  // Same rule as deciding: another tenant's notice is answered as if it did not
  // exist, and an unattributed one belongs to the platform.
  if (access.user.brand && notice.brand !== access.user.brand) {
    return json({ error: "no such notice" }, 404);
  }

  recordAuditEvent({
    actor: access.user,
    action: "dsa_notice.escalated",
    target: notice.id,
    outcome: "applied",
    after: {
      recipient,
      note,
      // What was reported about, without repeating the report itself into a
      // second store: the audit log keeps who and when, the notice keeps what.
      target_kind: notice.target_kind,
      target_id: notice.target_id,
      brand: notice.brand,
    },
  });
  log("info", "article 18 report recorded", { id: notice.id, recipient });

  return json({ ok: true, id: notice.id, recipient });
});

route("POST", "/admin/dsa-notices/:id/decide", async ({ req, params }) => {
  const access = await requirePermission(req, "dsa_notices.decide");
  if (isDenied(access)) return access.response;

  const body = await readJson<DecisionBody>(req);
  if (!body) return json({ error: "invalid body" }, 422);

  const decision = body.decision === "upheld" || body.decision === "rejected" ? body.decision : null;
  if (!decision) return json({ error: "decision must be upheld or rejected" }, 422);

  // Article 17(3)(b): the facts and circumstances the decision rests on. Without
  // them there is no statement of reasons, only a verdict.
  const facts = trimmed(body.facts, 4000);
  if (!facts) return json({ error: "facts are required — they are the statement of reasons" }, 422);

  const rows = await query<NoticeRow>(
    // decided_at has to be selected, or the guard below reads undefined and a
    // notice can be decided twice — which sends a second pair of letters and
    // silently replaces the first decision. Found by deciding one twice on dev.
    // target_kind and the snapshot come along so the author can be told which of
    // their posts this is about. Without them the letter opens with "something
    // you posted has been restricted" and never says which — useless to anybody
    // with more than one.
    `SELECT id, brand, target_kind, target_id, snapshot, snapshot_state, snapshot_reason,
            notifier_email, status, decided_at
       FROM dsa_notices WHERE id = $1`,
    [params.id],
  );
  if (rows === null) return json({ error: "database unavailable" }, 503);
  const notice = rows[0];
  if (!notice) return json({ error: "no such notice" }, 404);
  // Owned by somebody else — answered as if it did not exist. 404 rather than
  // 403 for the same reason the operator list uses: whether another tenant has a
  // notice with this id is not this tenant's business. An unattributed notice is
  // the platform's, so a tenant never decides one either.
  if (access.user.brand && notice.brand !== access.user.brand) {
    return json({ error: "no such notice" }, 404);
  }
  if (notice.decided_at) return json({ error: "already decided" }, 409);

  let statementId: string | null = null;

  if (decision === "upheld") {
    // Upholding means something was restricted, and a restriction has an
    // addressee. Both the ground and who it lands on are required here rather
    // than optional, because Article 17 has no version of them that is blank.
    const restriction = typeof body.restriction === "string" ? body.restriction : "";
    if (!RESTRICTIONS.has(restriction)) {
      return json({ error: "restriction must be one of: " + [...RESTRICTIONS].join(", ") }, 422);
    }
    const groundKind = body.ground_kind === "legal" || body.ground_kind === "contractual"
      ? body.ground_kind
      : null;
    const groundText = trimmed(body.ground_text, 2000);
    if (!groundKind || !groundText) {
      return json({ error: "ground_kind and ground_text are required for an upheld notice" }, 422);
    }
    const recipient = trimmed(body.recipient_identity, 200);
    if (!recipient) {
      return json({ error: "recipient_identity is required — a statement of reasons has an addressee" }, 422);
    }

    // One transaction: the statement and the decision are one fact. They had
    // been two writes with letters in between, so a failure after the first left
    // a statement attached to a notice the queue still offered — and two
    // operators pressing at once wrote two statements and two pairs of letters.
    //
    // The row is claimed with FOR UPDATE and re-read inside, because the check
    // near the top of this handler ran before anything was locked: both callers
    // passed it, and the second UPDATE silently replaced the first decision.
    const claimed = await transaction(async (tx) => {
      const rows = await tx<{ decided_at: string | null }>(
        `SELECT decided_at FROM dsa_notices WHERE id = $1 FOR UPDATE`,
        [notice.id],
      );
      if (!rows[0]) return { ok: false as const, reason: "gone" as const };
      if (rows[0].decided_at) return { ok: false as const, reason: "already" as const };

      const created = await tx<{ id: string }>(
        // `automated_used` is written, not defaulted. Article 17(3)(c) asks
        // whether automated means were used to reach this decision, and the
        // answer is a statement we make rather than a column nobody touched:
        // until 2026-09-08 the DEFAULT supplied it, and an exported statement
        // could not tell "we say no" from "nobody considered it". The value
        // itself is unchanged and matches the letter — a person decides every
        // notice (lib/mailer.ts). The day a decision is ever made by anything
        // else, this is the line that has to change, and it is findable.
        `INSERT INTO dsa_statements
           (brand, notice_id, target_id, recipient_identity, restriction,
            facts, ground_kind, ground_text, automated_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         RETURNING id`,
        [notice.brand, notice.id, notice.target_id ?? "", recipient, restriction,
         facts, groundKind, groundText],
      );
      await tx(
        `UPDATE dsa_notices SET status = $1, decided_at = now(), automated_used = false
          WHERE id = $2`,
        [decision, notice.id],
      );
      return { ok: true as const, id: created[0]?.id ?? null };
    });

    if (!claimed.ok) {
      return claimed.reason === "gone"
        ? json({ error: "no such notice" }, 404)
        : json({ error: "already decided" }, 409);
    }
    statementId = claimed.id;

    // Delivery is attempted, and the row records whether it happened. A
    // statement written and never delivered discharges nothing, so the two are
    // not allowed to look the same in the table.
    const delivered = await sendStatementOfReasons(recipient, {
      brand: notice.brand,
      restriction,
      facts,
      groundKind,
      groundText,
      targetKind: notice.target_kind,
      snapshot: notice.snapshot,
      snapshotState: notice.snapshot_state,
      snapshotReason: notice.snapshot_reason ?? undefined,
    });
    if (delivered && statementId) {
      await queryOrThrow(`UPDATE dsa_statements SET delivered_at = now() WHERE id = $1`, [statementId]);
    }
  } else {
    // A rejection writes no statement, so its only write is the decision — and
    // it needs the same claim, or two rejections send the notifier two letters.
    const claimed = await queryOrThrow<{ id: string }>(
      `UPDATE dsa_notices SET status = $1, decided_at = now()
        WHERE id = $2 AND decided_at IS NULL
        RETURNING id`,
      [decision, notice.id],
    );
    if (!claimed[0]) return json({ error: "already decided" }, 409);
  }

  // Article 16(5): the notifier is told what was decided and how to contest it.
  if (notice.notifier_email) {
    await sendNoticeDecision(notice.notifier_email, {
      id: notice.id,
      brand: notice.brand,
      decision,
      facts,
      // Article 16(5) asks what was decided, and "we disagreed" is the wrong
      // answer when the content had expired before anyone looked.
      snapshotState: notice.snapshot_state,
      snapshotReason: notice.snapshot_reason ?? undefined,
    });
  }

  recordAuditEvent({
    actor: access.user,
    action: `dsa_notices.${decision}`,
    target: notice.id,
  });
  log("info", "notice decided", { id: notice.id, decision, statement: statementId });

  return json({ ok: true, id: notice.id, decision, statement_id: statementId });
});
