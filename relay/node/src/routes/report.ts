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
import { isTenantDenied, resolveTenant } from "../lib/tenant.ts";
import { sendNoticeReceipt } from "../lib/mailer.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";
import { captureTarget } from "../lib/dsa_snapshot.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { check, REPORT_HOURLY } from "../lib/rate_limit.ts";

const KINDS = new Set(["feed_message", "offer", "chat", "other"]);

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
  const verdict = check(REPORT_HOURLY, ip);
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

  const source = text(body.source, 120);
  const tenant = await resolveTenant(req, source);
  if (isTenantDenied(tenant)) {
    inc("relay_report_total", { result: "no_tenant" });
    return tenant.response;
  }

  const targetId = text(body.target_id, 200);

  // The copy is taken now, before anything else: the feed deletes a message four
  // hours and twenty minutes after it was posted, and a notice examined tomorrow
  // would otherwise be examined against nothing. The capture reports which of
  // three things happened — copied, expired, or never reachable — because
  // telling a notifier "it expired" when we simply never looked would be a lie.
  const { snapshot, status } = await captureTarget(kind, targetId, tenant.brand.key);

  const rows = await query<{ id: string }>(
    `INSERT INTO dsa_notices
       (brand, target_kind, target_id, snapshot, reason_text,
        notifier_name, notifier_email, bona_fide, status, acknowledged_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, now())
     RETURNING id`,
    [
      tenant.brand.key,
      kind,
      targetId,
      snapshot ? JSON.stringify(snapshot) : null,
      reason,
      name,
      email,
      status,
    ],
  );

  if (!rows) {
    // The database is the record of the obligation. Losing a notice silently is
    // the one outcome that must not look like success.
    inc("relay_report_total", { result: "storage_failed" });
    log("error", "notice not stored", { kind, brand: tenant.brand.key });
    return json({ error: "could not store the notice" }, 503);
  }

  const id = rows[0]?.id ?? null;
  inc("relay_report_total", { result: "accepted", kind });
  log("info", "notice accepted", { id, kind, brand: tenant.brand.key, snapshot: snapshot !== null });

  // Article 16(4): confirmation without undue delay, when we have somewhere to
  // send it. Best-effort — a mail failure must not lose the notice itself.
  if (email) {
    await sendNoticeReceipt(email, { id, brand: tenant.brand.key, lang: text(body.lang, 8) ?? undefined });
  }

  return json({ ok: true, id, acknowledged: Boolean(email) }, 202);
}
