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
import { query } from "../lib/db.ts";
import { refuse } from "../lib/identity_guard.ts";
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

async function find(code: string): Promise<Row | null | "unavailable"> {
  const rows = await query<Row>(
    `SELECT external_url, redirect_disabled_at IS NOT NULL AS disabled FROM offers WHERE redirect_code = $1`,
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
        WHERE redirect_code = $1 AND redirect_disabled_at IS NULL AND external_url ~* '^https?://'
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

export { exit, go };
