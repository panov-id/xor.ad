// POST /report — a notice under Article 16 DSA: anyone, user or authority, tells
// us that something here is illegal. Not a complaint. A complaint on a card is a
// vote against showing something and is counted; a notice is an accusation of
// illegality, and it obliges us to confirm receipt, examine it by hand, and
// answer with reasons. See docs/dsa/SPEC_RU.md.
//
// Body: { target_kind, target_id?, reason_text, notifier_name?, notifier_email?,
//         bona_fide, brand?, source? }

import { isEmail, json, readJson } from "../lib/http.ts";
import { query } from "../lib/db.ts";
import { resolveTenantSoft } from "../lib/tenant.ts";
import { sendNoticeReceipt } from "../lib/mailer.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";
import { captureTarget } from "../lib/dsa_snapshot.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { checkAll, REPORT_LIMITS } from "../lib/rate_limit.ts";

// The table and screen 19 were added on 2026-08-26; `table_line` reached the DSA
// specification on 2026-08-28 (191eb9e) and this set on 2026-08-30: for two days
// a line at a table was the one public, unencrypted, moderated surface in the
// product that the notice route answered with 422. Article 16(1) asks the
// mechanism to accept a notice about any content the notifier considers illegal,
// and this one refused a whole surface. The dates were wrong here until
// 2026-08-31 — this comment said the specification had it from 2026-08-26, and
// docs/chat_EN.md had copied that from here.
//
// Accepting it was not enough: the CHECK in db/005 did not list the kind, so the
// INSERT was refused and the reporter got 503 where Article 16(4) requires a
// receipt. Closed by db/012 on 2026-08-31; dsa_kinds.test.ts now holds the
// specification, this set and the database together.
export const KINDS = new Set(["feed_message", "offer", "table_line", "chat", "other"]);

// Long enough to say why something is illegal, short enough that the field is
// not a place to paste a novel into the database.
const REASON_MAX = 4000;

interface Body {
  target_kind?: unknown;
  target_id?: unknown;
  reason_text?: unknown;
  notifier_name?: unknown;
  notifier_email?: unknown;
  bona_fide?: unknown;
  brand?: unknown;
  lang?: unknown;
  source?: unknown;
}

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

export async function report(req: Request): Promise<Response> {
  // A limit here is more delicate than on a signup: refusing a report of illegal
  // content is refusing a legal obligation. So it sits high — ten an hour from
  // one address is a script, not a diligent neighbour — and it refuses with 429
  // and a retry-after rather than silently.
  const { ip } = clientAddress(req);
  const verdict = checkAll(REPORT_LIMITS, ip);
  if (!verdict.allowed) {
    inc("relay_report_total", { result: "rate_limited" });
    return json(
      { error: "too many reports from here — try later, or write to support" },
      429,
      { "retry-after": String(verdict.retryAfterSeconds) },
    );
  }

  const body = await readJson<Body>(req);
  if (!body) {
    inc("relay_report_total", { result: "invalid" });
    return json({ error: "invalid body" }, 422);
  }

  const kind = typeof body.target_kind === "string" ? body.target_kind : "";
  if (!KINDS.has(kind)) {
    inc("relay_report_total", { result: "invalid_kind" });
    return json({ error: "invalid target_kind" }, 422);
  }

  // Article 16(2)(a). An unsubstantiated notice creates no actual knowledge
  // under 16(3) and leaves nothing to examine, so it is refused rather than
  // stored — refusing is honest, storing it and never answering is not.
  const reason = text(body.reason_text, REASON_MAX);
  if (!reason) {
    inc("relay_report_total", { result: "no_reason" });
    return json({ error: "reason_text is required" }, 422);
  }

  // Article 16(2)(d). The declaration is the notifier's, so it is recorded as
  // given rather than assumed; without it the notice is incomplete.
  if (body.bona_fide !== true) {
    inc("relay_report_total", { result: "no_bona_fide" });
    return json({ error: "bona_fide is required" }, 422);
  }

  // Article 16(2)(c) allows exactly one exception to naming yourself, and it is
  // the one where insisting would silence the report. We do not enforce a name
  // here: the form asks, and a notice about child sexual abuse may arrive
  // without one. What we must never do is refuse it for that.
  const name = text(body.notifier_name, 200);
  const email = isEmail(body.notifier_email) ? body.notifier_email : null;

  // The key says which face this came through, and that is all it says here: a
  // notice is never refused for it. It used to be — an unknown, revoked or
  // out-of-quota key answered 401 or 429 before the snapshot was taken and
  // before anything was written, so the notice simply did not exist and nobody
  // could be told. Since the daily allowance is shared with page views, a
  // storefront passed around in a chat could stop accepting reports of illegal
  // content for the rest of the day. See lib/tenant.ts.
  const source = text(body.source, 120);
  const brand = await resolveTenantSoft(req, source);
  if (!brand) inc("relay_report_total", { result: "unattributed" });

  // Not truncated. A cut identifier finds nothing, and "found nothing" is
  // recorded as target_gone — telling a notifier their report died of old age
  // when in fact they sent something that was never an identifier. Over the
  // limit it is kept out of the lookup entirely, so the notice reads as
  // free-form, which is what it is.
  const rawTargetId = text(body.target_id, 400);
  const targetId = rawTargetId && rawTargetId.length <= 200 ? rawTargetId : null;

  // The copy is taken now, before anything else: the feed deletes a message four
  // hours and twenty minutes after it was posted, and a notice examined tomorrow
  // would otherwise be examined against nothing. The capture reports which of
  // three things happened — copied, expired, or never reachable — because
  // telling a notifier "it expired" when we simply never looked would be a lie.
  // `reason` above is the notifier's own text; this one is why we could not
  // take a copy. Two different things, and one line held both names until the
  // second silently took the first one's place in the insert.
  const { snapshot, status, reason: snapshotReason } = await captureTarget(
    kind,
    targetId,
    brand?.key ?? null,
  );

  const rows = await query<{ id: string }>(
    // The capture outcome goes in its own column. It used to be written into
    // `status`, and since the moderator's queue is `status IN ('received',
    // 'in_review')`, every notice we could not copy — every chat report, and any
    // feed message that had already expired — landed outside the queue and was
    // never examined. See db/006.
    `INSERT INTO dsa_notices
       (brand, target_kind, target_id, snapshot, reason_text,
        notifier_name, notifier_email, bona_fide, status, snapshot_state,
        snapshot_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'received', $8, $9)
     RETURNING id`,
    [
      brand?.key ?? null,
      kind,
      targetId,
      snapshot ? JSON.stringify(snapshot) : null,
      reason,
      name,
      email,
      status,
      snapshotReason,
    ],
  );

  if (!rows) {
    // The database is the record of the obligation. Losing a notice silently is
    // the one outcome that must not look like success.
    inc("relay_report_total", { result: "storage_failed" });
    log("error", "notice not stored", { kind, brand: brand?.key ?? null });
    return json({ error: "could not store the notice" }, 503);
  }

  // An INSERT … RETURNING with no row means nothing was stored, whatever the
  // absence of an error suggests. It used to fall through to a receipt carrying
  // `id: null` and a 202, telling the notifier their report was accepted and
  // giving them nothing to quote back.
  const id = rows[0]?.id ?? null;
  if (!id) {
    inc("relay_report_total", { result: "storage_failed" });
    log("error", "notice insert returned no row", { kind, brand: brand?.key ?? null });
    return json({ error: "could not store the notice" }, 503);
  }
  inc("relay_report_total", { result: "accepted", kind });
  log("info", "notice accepted", { id, kind, brand: brand?.key ?? null, snapshot: snapshot !== null });

  // Article 16(4): confirmation without undue delay, when we have somewhere to
  // send it. Best-effort — a mail failure must not lose the notice itself, which
  // is why this is caught rather than allowed to answer 500 over a notice that
  // is already stored.
  //
  // `acknowledged` is the fact, not the intention. It used to be Boolean(email)
  // — "an address was supplied" — under a name that reads as "the confirmation
  // required by Article 16(4) was sent". For our own form the difference never
  // showed; for anyone else's client it is a trap, and for a regulator reading
  // the row it was simply untrue.
  let acknowledged = false;
  if (email) {
    try {
      // Without a brand the letter goes out in the platform's own face rather
      // than not at all: Article 16(4) asks for a confirmation of receipt, not
      // for a confirmation in the right colours.
      acknowledged = await sendNoticeReceipt(email, {
        id,
        brand: brand?.key,
        lang: text(body.lang, 8) ?? undefined,
      });
    } catch (error) {
      log("error", "notice receipt not sent", { id, error: String(error) });
    }
  }

  // The column follows the same rule: it used to be set to now() by the INSERT
  // itself, so every notice claimed an acknowledgement — including the ones with
  // nobody to acknowledge to. Now it is written when, and only when, a letter
  // actually left.
  if (acknowledged) {
    await query("UPDATE dsa_notices SET acknowledged_at = now() WHERE id = $1", [id]);
  }

  return json({ ok: true, id, acknowledged }, 202);
}
