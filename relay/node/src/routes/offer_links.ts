// GET /o/:code and GET /o/:code/go — an offer's link through our own redirect
// (offers/SPEC_RU.md §6.2, §6.3; protocol §4.6).
//
// The venue's address is never in the feed: the card carries
// <storefront>/o/<code>, the exit screen asks this node for the full domain and
// whether the link is off, and /go sends the person on with a 302. The link can
// be switched off at once (redirect_disabled_at) without touching the offer.
//
// Only the number of hits is kept — not who, not when, not from where. HEAD and
// the known link-preview agents get the same 302 and are not counted: a chat
// that unfurls a pasted link is not a person going to the venue (review panel
// 2026-09-19). Cache-Control: no-store, so no cache replays a link after it is
// switched off; Referrer-Policy: no-referrer, so the venue never learns the code.
//
// An offer with no external_url has nowhere to send anyone; its code answers
// 404, as a code that names nothing does.

import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { callerOf, refuse } from "../lib/identity_guard.ts";
import { brandByKey } from "../lib/brand_registry.ts";
import { sendAdvLetter } from "../lib/adv.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { checkAll, OFFER_LINK_LIMITS } from "../lib/rate_limit.ts";
import { inc } from "../lib/metrics.ts";
import { log } from "../lib/log.ts";

// The contract's minLength is 10; the upper bound and the alphabet are ours, so
// a probe of junk never reaches the database.
const CODE = /^[A-Za-z0-9_-]{10,64}$/;

// Link previewers that announce themselves. A previewer that pretends to be a
// browser is counted; §6.2 accepts the counter as a signal, not a measure.
const PREVIEWERS = [
  "facebookexternalhit", "facebot", "twitterbot", "slackbot", "slack-imgproxy", "telegrambot",
  "whatsapp", "discordbot", "linkedinbot", "skypeuripreview", "vkshare", "viber", "redditbot",
  "iframely", "embedly", "pinterestbot", "mastodon", "bluesky", "signal", "applebot",
];

export function isPreviewer(req: Request): boolean {
  if (req.method === "HEAD") return true;
  const agent = (req.headers.get("user-agent") ?? "").toLowerCase();
  return PREVIEWERS.some((name) => agent.includes(name));
}

// Only http and https leave through a Location header; anything else stored in
// external_url is a publishing bug, and sending a person there is worse than 404.
function webTarget(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

// §10.1: two counting reports from different people switch the link off.
export const LINK_REPORTS_TO_DISABLE = 2;
// Per identity: a person reports a handful of links, not a page of them.
const LINK_REPORT_LIMITS = [{ name: "offer-link-report", max: 20, windowMs: 60 * 60 * 1000 }];

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };

function limited(req: Request): Response | null {
  // The address alone. These routes take no key, and callerBucket names a
  // bucket by any well-formed one: a made-up key per request was a fresh
  // allowance per request (verifier, 2026-09-24).
  const verdict = checkAll(OFFER_LINK_LIMITS, `${clientAddress(req).ip}|offer-link`);
  if (verdict.allowed) return null;
  return json({ error: "rate_limited", retry_after: verdict.retryAfterSeconds }, 429,
    { "retry-after": String(verdict.retryAfterSeconds) });
}

type Row = { external_url: string | null; disabled: boolean };

// A link is live while nobody switched it off, the offer is not hidden by
// complaints and its discount still holds. A card gone from the feed by
// expires_at keeps it: the card lives 4:20, the discount to its own term
// (offers spec §6.2, decided by quorum 2026-09-24).
const LIVE = `redirect_disabled_at IS NULL AND status <> 'hidden' AND discount_until > now()`;

async function find(code: string): Promise<Row | null | "unavailable"> {
  const rows = await query<Row>(
    `SELECT external_url, NOT (${LIVE}) AS disabled FROM offers WHERE redirect_code = $1`,
    [code],
  );
  if (rows === null) return "unavailable";
  return rows[0] ?? null;
}

async function exit(req: Request, code: string): Promise<Response> {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  if (!CODE.test(code)) return refuse("not_found", "no such link", 404);
  const row = await find(code);
  if (row === "unavailable") return refuse("unavailable", "the node cannot read right now", 503);
  const target = webTarget(row?.external_url ?? null);
  if (!row || !target) return refuse("not_found", "no such link", 404);
  return json({ domain: target.hostname, disabled: row.disabled }, 200, NO_STORE);
}

async function go(req: Request, code: string): Promise<Response> {
  const tooMany = limited(req);
  if (tooMany) return tooMany;
  if (!CODE.test(code)) return refuse("not_found", "no such link", 404, {}, NO_STORE);
  let row: Row | null | "unavailable";
  if (isPreviewer(req)) {
    row = await find(code);
  } else {
    // Counted in the same statement that reads the target: a hit is one row
    // written, never a read and a write a switch-off could fall between. Only
    // a web address counts; anything else answers 404 below and sent nobody.
    const hit = await query<{ external_url: string | null }>(
      `UPDATE offers SET redirect_hits = redirect_hits + 1
        WHERE redirect_code = $1 AND ${LIVE} AND external_url ~* '^https?://'
        RETURNING external_url`,
      [code],
    );
    if (hit === null) row = "unavailable";
    else if (hit[0]) row = { external_url: hit[0].external_url, disabled: false };
    else row = await find(code);
  }
  if (row === "unavailable") return refuse("unavailable", "the node cannot read right now", 503, {}, NO_STORE);
  if (!row || !row.external_url) return refuse("not_found", "no such link", 404, {}, NO_STORE);
  if (row.disabled) {
    inc("relay_offer_link_total", { result: "disabled" });
    return refuse("gone", "this link was switched off", 410, {}, NO_STORE);
  }
  const target = webTarget(row.external_url);
  if (!target) {
    log("error", "an offer's link is not a web address", { code });
    return refuse("not_found", "no such link", 404, {}, NO_STORE);
  }
  inc("relay_offer_link_total", { result: isPreviewer(req) ? "previewed" : "followed" });
  return new Response(null, { status: 302, headers: { location: target.href, ...NO_STORE } });
}

route("GET", "/o/:code", (c) => exit(c.req, c.params.code));
route("GET", "/o/:code/go", (c) => go(c.req, c.params.code));

// POST /o/:code/report — "this link is bad" from the exit screen (offers spec
// §10.1). Signed by an identity, no email. A report counts when the reporter's
// first accepted phrase came out on a UTC day no later than the day before
// yesterday and before the offer's day; the second counting report from a
// different person switches the link off at once, and the venue hears of it by
// mail. The offer lives on. The answer is 202 whatever the count, so a reporter
// cannot learn whether theirs was the one that counted.
async function report(req: Request, code: string): Promise<Response> {
  const caller = await callerOf(req);
  if (caller instanceof Response) return caller;
  const limited = checkAll(LINK_REPORT_LIMITS, caller.identityId);
  if (!limited.allowed) {
    return refuse("rate_limited", "too many reports this hour", 429, {}, {
      "retry-after": String(limited.retryAfterSeconds),
    });
  }
  if (!CODE.test(code)) return refuse("not_found", "no such link", 404);
  const outcome = await transaction(async (run) => {
    // The lock first: two reports at once must not both read one counting row.
    const [offer] = await run<{ id: string; disabled: boolean; published_at: Date }>(
      `SELECT id, redirect_disabled_at IS NOT NULL AS disabled, published_at
         FROM offers WHERE redirect_code = $1 AND ($2::text IS NULL OR brand = $2) FOR UPDATE`,
      [code, caller.brand],
    );
    if (!offer) return "not_found" as const;
    const [made] = await run<{ counts: boolean }>(
      `INSERT INTO offer_link_reports (offer_id, reporter, counts)
         SELECT $1, $2, coalesce(
           (SELECT first_published_at <= (now() AT TIME ZONE 'UTC')::date - 2
                   AND first_published_at < ($3::timestamptz AT TIME ZONE 'UTC')::date
              FROM identity_stats WHERE identity = $2), false)
       ON CONFLICT DO NOTHING RETURNING counts`,
      [offer.id, caller.identityId, offer.published_at],
    );
    if (!made?.counts || offer.disabled) return null;
    const [{ n }] = await run<{ n: number }>(
      `SELECT count(*)::int AS n FROM offer_link_reports WHERE offer_id = $1 AND counts`, [offer.id],
    );
    if (n < LINK_REPORTS_TO_DISABLE) return null;
    await run(`UPDATE offers SET redirect_disabled_at = now() WHERE id = $1`, [offer.id]);
    const [owner] = await run<{ email: string; venue: string; brand: string }>(
      `SELECT a.email, v.name AS venue, o.brand FROM offers o JOIN venues v ON v.id = o.venue_id
         JOIN advertisers a ON a.id = v.advertiser_id WHERE o.id = $1`,
      [offer.id],
    );
    return owner ?? null;
  }).catch((error) => {
    log("error", "a link report failed", { error: String(error) });
    return "unavailable" as const;
  });
  if (outcome === "unavailable") return refuse("unavailable", "the node cannot write right now", 503);
  if (outcome === "not_found") return refuse("not_found", "no such link", 404);
  if (outcome) {
    inc("relay_offer_link_total", { result: "switched_off" });
    const brand = await brandByKey(outcome.brand);
    if (brand) {
      // Articles 17(1)(a), 17(3) DSA: what was restricted, on what ground, how
      // it was decided and how to contest it (§10.1).
      sendAdvLetter(outcome.email, brand, "A link of your offer was switched off", "The offer's link is off", [
        { kind: "text", value: `The link of an offer of ${outcome.venue} no longer sends anyone on.` },
        {
          kind: "text",
          value: "Why: two people who had written in the feed before the offer came out, their first phrase " +
            "more than a day old, reported that it leads to a phishing or malicious site (agreement §10). " +
            "The decision was automatic; the offer itself stays in the feed.",
        },
        {
          kind: "text",
          value: "To contest it, answer this letter and a person will look; you may also turn to the Digital " +
            "Services Coordinator or to a court.",
        },
      ]).catch(() => {});
    }
  }
  return json({ state: "received" }, 202);
}

route("POST", "/o/:code/report", (c) => report(c.req, c.params.code));

export { exit, go, report };
