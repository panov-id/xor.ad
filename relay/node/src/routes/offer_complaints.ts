// POST /offers/:id/complaints — "the discount was not given" (offers spec §3,
// §4, §10, §10.2; db/071).
//
// Signed by an identity, and the e-mail is required: it is the only way to send
// the complainant the decision (§10.2). Every complaint is accepted and kept;
// whether it counts towards hiding the offer is frozen at the moment it is made.
// It counts when the complainant's first accepted phrase came out on a UTC day
// no later than the day before yesterday and before the offer's day (the same
// test as the link report, §10.1), when it is not beyond the monthly limit, and
// when this identity has not complained about this offer before. Three counting
// complaints from different people hide the offer (AUTOHIDE_COMPLAINTS); the
// venue is told by mail that one arrived, never by whom or when.

import { route } from "../lib/router.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { checkAll } from "../lib/rate_limit.ts";
import { hasInvisible } from "../lib/names.ts";
import { brandByKey } from "../lib/brand_registry.ts";
import { sendOfferComplaint, withoutAddresses } from "../lib/mailer.ts";
import { cabinetUrl } from "../lib/adv.ts";
import { log } from "../lib/log.ts";

export const AUTOHIDE_COMPLAINTS = 3;
export const COMPLAINT_MONTHLY_LIMIT = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Per identity: a handful an hour is a person; the monthly limit is the rule,
// this only stops a script.
const COMPLAINT_LIMITS = [{ name: "offer-complaint", max: 10, windowMs: 60 * 60 * 1000 }];

type Outcome =
  | { kind: "not_found" }
  | { kind: "made"; id: string; counts: boolean; owner: { email: string; venue: string; brand: string } | null };

async function complain(req: Request, offerId: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const limited = checkAll(COMPLAINT_LIMITS, caller.identityId);
  if (!limited.allowed) {
    return refuse("rate_limited", "too many complaints this hour", 429, {}, {
      "retry-after": String(limited.retryAfterSeconds),
    });
  }
  if (!UUID.test(offerId)) return refuse("not_found", "no such offer", 404);
  const body = await readJson<{ notifier_email?: unknown; text?: unknown }>(req);
  // §10.2: no address, no answer — the form names this reason.
  // The field is notifier_email, as the spec names it (offers spec §3) and the
  // contract carries it; the node read `email` until 27.09.2026 and refused
  // every complaint a client built from the contract.
  if (!isEmail(body?.notifier_email)) {
    return refuse("invalid_body", "an e-mail is needed: it is the only way to send you the decision", 422);
  }
  const email = (body!.notifier_email as string).trim();
  const text = typeof body?.text === "string" && body.text.trim() ? body.text.trim() : null;
  if (text && text.length > 1000) return refuse("invalid_body", "the complaint is 1000 characters at most", 400);
  if (text && hasInvisible(text)) return refuse("invalid_body", "the complaint has characters nobody can see", 400);

  const outcome = await transaction<Outcome>(async (run) => {
    // The lock first: two complaints at once must not both miss the third.
    const [offer] = await run<{ id: string; published_at: Date }>(
      `SELECT id, published_at FROM offers WHERE id = $1 AND ($2::text IS NULL OR brand = $2) FOR UPDATE`,
      [offerId, caller.brand],
    );
    if (!offer) return { kind: "not_found" };
    const [{ counts }] = await run<{ counts: boolean }>(
      `SELECT coalesce(
                (SELECT first_published_at <= (now() AT TIME ZONE 'UTC')::date - 2
                        AND first_published_at < ($3::timestamptz AT TIME ZONE 'UTC')::date
                   FROM identity_stats WHERE identity = $2), false)
          AND NOT EXISTS (SELECT 1 FROM offer_complaints WHERE offer_id = $1 AND user_id = $2)
          AND (SELECT count(*) FROM offer_complaints
                WHERE user_id = $2 AND counts_towards_autohide
                  AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') < $4
          AS counts`,
      [offer.id, caller.identityId, offer.published_at, COMPLAINT_MONTHLY_LIMIT],
    );
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO offer_complaints (id, offer_id, user_id, notifier_email, text, counts_towards_autohide)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, offer.id, caller.identityId, email, text, counts],
    );
    if (counts) {
      await run(
        `UPDATE offers SET status = 'hidden'
          WHERE id = $1 AND status = 'active'
            AND (SELECT count(DISTINCT user_id) FROM offer_complaints
                  WHERE offer_id = $1 AND counts_towards_autohide) >= $2`,
        [offer.id, AUTOHIDE_COMPLAINTS],
      );
    }
    const [owner] = await run<{ email: string; venue: string; brand: string }>(
      `SELECT a.email, v.name AS venue, o.brand FROM offers o JOIN venues v ON v.id = o.venue_id
         JOIN advertisers a ON a.id = v.advertiser_id WHERE o.id = $1`,
      [offer.id],
    );
    return { kind: "made", id, counts, owner: owner ?? null };
  }).catch((error) => {
    log("error", "an offer complaint failed", { error: withoutAddresses(String(error)) });
    return null;
  });
  if (outcome === null) return refuse("unavailable", "the node cannot write right now", 503);
  if (outcome.kind === "not_found") return refuse("not_found", "no such offer", 404);
  if (outcome.owner) {
    const brand = await brandByKey(outcome.owner.brand);
    if (brand) await sendOfferComplaint(outcome.owner.email, brand, outcome.owner.venue, cabinetUrl(brand));
  }
  return json({ id: outcome.id, counts_towards_autohide: outcome.counts }, 202);
}

route("POST", "/offers/:id/complaints", (c) => complain(c.req, c.params.id));

export { complain };
