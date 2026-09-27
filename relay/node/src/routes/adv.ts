// The advertising cabinet on the node: sign-in, venues, envelopes, offers
// (offers/SPEC_RU.md §2.1, §6, §8, §11; protocol §4.13).
//
// Every route but the two that start a sign-in and the "not us" page needs the
// session cookie, and every query is bounded by the advertiser it names:
// holding the role is not owning the row, so a venue or an offer of somebody
// else answers 404, as one that does not exist.

import { route } from "../lib/router.ts";
import { isEmail, json, readJson } from "../lib/http.ts";
import { query, transaction } from "../lib/db.ts";
import { refuse } from "../lib/identity_guard.ts";
import { clientAddress } from "../lib/client_ip.ts";
import { checkAll } from "../lib/rate_limit.ts";
import { sha256hex } from "../lib/hash.ts";
import { addressHmac } from "../lib/advertiser_sweeper.ts";
import { log } from "../lib/log.ts";
import type { Brand } from "../config.ts";
import {
  ADV_LINK_LIMITS, ADV_MAILBOX_LIMITS, type Advertiser, advertiserOf, brandOfCabinet, cabinetUrl, cookie,
  ENVELOPE_CODE_LIMITS, LINK_COOKIE, LINK_TTL_MS, linkHash, randomToken, SESSION_COOKIE, SESSION_TTL_MS,
  setCookie,
} from "../lib/adv.ts";
import { sendAdvertiserLink, withoutAddresses } from "../lib/mailer.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_MAX = 256;
// offers spec §4, §5: the card lives as a phrase does, 4:20; the discount at
// most 90 days from publication.
export const OFFER_LIFETIME_MINUTES = 260;
export const DISCOUNT_MAX_DAYS = 90;
export const ENVELOPE_TTL_DAYS = 30; // ACTIVATION_CODE_TTL
export const ENVELOPE_ATTEMPTS = 5;
// §6.1: a shortener hides the real domain and defeats both the reputation
// check and the exit screen. Not negotiable; the list is the known ones.
const SHORTENERS = new Set([
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rb.gy", "shorturl.at",
  "rebrand.ly", "tiny.cc", "bl.ink", "short.io", "s.id", "t.ly", "v.gd", "clck.ru", "vk.cc", "lnkd.in",
]);

const noContent = (headers: Record<string, string> = {}) => new Response(null, { status: 204, headers });
const unavailable = () => refuse("unavailable", "the node cannot answer right now", 503);
const notFound = () => refuse("not_found", "no such thing here", 404);
const bad = (message: string) => refuse("invalid_body", message, 400);

function tooMany(limits: Parameters<typeof checkAll>[0], key: string): Response | null {
  const verdict = checkAll(limits, key);
  if (verdict.allowed) return null;
  return refuse("rate_limited", "too many requests — try later", 429, {}, {
    "retry-after": String(verdict.retryAfterSeconds),
  });
}

const text = (value: unknown, max = TEXT_MAX): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

type Ctx = { brand: Brand; me: Advertiser };

// The cabinet's own origin and a live session of it, or the refusal.
async function session(req: Request): Promise<Ctx | Response> {
  const brand = await brandOfCabinet(req);
  if (!brand) return refuse("unauthorized", "not from a cabinet of ours", 401);
  const me = await advertiserOf(req, brand);
  if (me === "unavailable") return unavailable();
  if (!me) return refuse("unauthorized", "sign in again", 401);
  return { brand, me };
}

// --- sign-in ------------------------------------------------------------------

// Mails a link when the account exists, and answers the same when it does not:
// 204 and a fresh browser half either way, so the answer says nothing about who
// is registered. The mailbox's ceiling is charged only for a real account.
async function mailLink(brand: Brand, email: string, half: string): Promise<void> {
  const [account] = await query<{ id: string }>(
    `SELECT id FROM advertisers WHERE brand = $1 AND lower(email) = lower($2)`, [brand.key, email],
  ) ?? [];
  if (!account) return;
  if (!checkAll(ADV_MAILBOX_LIMITS, await sha256hex(`${brand.key}|${email.toLowerCase()}`)).allowed) {
    log("warn", "advertiser sign-in mail withheld: mailbox over its ceiling", { brand: brand.key });
    return;
  }
  const token = randomToken();
  const stored = await query(
    `INSERT INTO advertiser_links (link_hash, advertiser_id, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
    [await linkHash(token, half), account.id, LINK_TTL_MS / 1000],
  );
  if (stored === null) return;
  await sendAdvertiserLink(email, brand, `${cabinetUrl(brand)}/enter#${token}`);
}

// Links still being mailed after their answer left; a test waits for them.
const inFlight = new Set<Promise<unknown>>();
export const lettersSettled = () => Promise.all([...inFlight]);

async function startSignIn(req: Request, signup: boolean): Promise<Response> {
  const brand = await brandOfCabinet(req);
  if (!brand) return refuse("unauthorized", "not from a cabinet of ours", 401);
  const limited = tooMany(ADV_LINK_LIMITS, `${clientAddress(req).ip}|adv-link`);
  if (limited) return limited;
  const body = await readJson<{ email?: unknown; contact?: unknown }>(req);
  if (!isEmail(body?.email)) return bad("an email address is needed");
  const email = (body!.email as string).trim();
  if (signup) {
    const contact = text(body?.contact);
    if (!contact) return bad("a contact is needed: who do we talk to");
    // An address already registered is not an error and not a second account.
    const made = await query(
      `INSERT INTO advertisers (id, email, contact, brand) VALUES ($1, $2, $3, $4)
         ON CONFLICT (brand, lower(email)) DO NOTHING`,
      [crypto.randomUUID(), email, contact, brand.key],
    );
    if (made === null) return unavailable();
  }
  const half = randomToken();
  // Not awaited: the letter's timing must not say who is registered.
  const sending = mailLink(brand, email, half)
    .catch((error) => log("error", "advertiser link failed", { error: withoutAddresses(String(error)) }))
    .finally(() => inFlight.delete(sending));
  inFlight.add(sending);
  return noContent({ "set-cookie": setCookie(LINK_COOKIE, half, LINK_TTL_MS / 1000) });
}

route("POST", "/adv/signup", ({ req }) => startSignIn(req, true));
route("POST", "/adv/sign-in", ({ req }) => startSignIn(req, false));

// The cabinet page posts the token from the link; the half is in the cookie of
// the browser that asked. Spent on the first try, right or wrong.
route("POST", "/adv/session", async ({ req }) => {
  const brand = await brandOfCabinet(req);
  if (!brand) return refuse("unauthorized", "not from a cabinet of ours", 401);
  const body = await readJson<{ token?: unknown }>(req);
  const token = typeof body?.token === "string" ? body.token : "";
  const half = cookie(req, LINK_COOKIE) ?? "";
  if (!/^[0-9a-f]{64}$/.test(token) || !/^[0-9a-f]{64}$/.test(half)) {
    return refuse("unauthorized", "invalid or expired link", 401);
  }
  const secret = randomToken();
  const opened = await transaction(async (run) => {
    const [link] = await run<{ advertiser_id: string }>(
      `DELETE FROM advertiser_links l USING advertisers a
        WHERE l.link_hash = $1 AND a.id = l.advertiser_id AND a.brand = $2 AND l.expires_at > now()
        RETURNING l.advertiser_id`,
      [await linkHash(token, half), brand.key],
    );
    if (!link) return false;
    // The first sign-in is what confirms the address (§2.1).
    await run(`UPDATE advertisers SET email_confirmed_at = coalesce(email_confirmed_at, now()) WHERE id = $1`,
      [link.advertiser_id]);
    await run(
      `INSERT INTO advertiser_sessions (session_hash, advertiser_id, expires_at)
         VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [await sha256hex(secret), link.advertiser_id, SESSION_TTL_MS / 1000],
    );
    return true;
  }).catch(() => null);
  if (opened === null) return unavailable();
  if (!opened) return refuse("unauthorized", "invalid or expired link", 401);
  const headers = new Headers();
  headers.append("set-cookie", setCookie(SESSION_COOKIE, secret, SESSION_TTL_MS / 1000));
  headers.append("set-cookie", setCookie(LINK_COOKIE, "", 0));
  return new Response(null, { status: 204, headers });
});

route("POST", "/adv/sign-out", async ({ req }) => {
  const raw = cookie(req, SESSION_COOKIE);
  if (raw && /^[0-9a-f]{64}$/.test(raw)) {
    await query(`DELETE FROM advertiser_sessions WHERE session_hash = $1`, [await sha256hex(raw)]);
  }
  return noContent({ "set-cookie": setCookie(SESSION_COOKIE, "", 0) });
});

route("GET", "/adv/me", async ({ req }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  return json({ email: ctx.me.email, email_confirmed: ctx.me.confirmed, brand: ctx.brand.key });
});

// --- venues -------------------------------------------------------------------

type VenueRow = { id: string; name: string; address: string; verification_status: string; verified_at: Date | null };

const venueJson = (v: VenueRow & { envelope_expires_at?: Date | null }) => ({
  id: v.id,
  name: v.name,
  address: v.address,
  verification_status: v.verification_status,
  verified_at: v.verified_at,
  envelope_expires_at: v.envelope_expires_at ?? null,
});

route("GET", "/adv/venues", async ({ req }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  const rows = await query<VenueRow & { envelope_expires_at: Date | null }>(
    `SELECT v.id, v.name, v.address, v.verification_status, v.verified_at, e.expires_at AS envelope_expires_at
       FROM venues v
       LEFT JOIN venue_envelopes e ON e.venue_id = v.id AND e.used_at IS NULL AND e.burned_at IS NULL
                                  AND e.expires_at > now()
      WHERE v.advertiser_id = $1 ORDER BY v.created_at, v.id`,
    [ctx.me.id],
  );
  if (rows === null) return unavailable();
  return json({ items: rows.map(venueJson) });
});

// An address suspended for complaints stays suspended for a year after its
// venue is gone (db/056): writing it again is not a fresh start.
async function suspendedAddress(address: string): Promise<boolean | null> {
  const hmac = await addressHmac(address);
  if (!hmac) return false;
  const rows = await query(`SELECT 1 FROM venue_suspensions WHERE address_hmac = $1 AND keep_until > now()`, [hmac]);
  return rows === null ? null : rows.length > 0;
}

route("POST", "/adv/venues", async ({ req }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  const body = await readJson<{ name?: unknown; address?: unknown }>(req);
  const name = text(body?.name, 128);
  const address = text(body?.address);
  if (!name || !address) return bad("a venue needs a name and an address");
  const held = await suspendedAddress(address);
  if (held === null) return unavailable();
  const id = crypto.randomUUID();
  const status = held ? "suspended" : "unverified";
  const made = await query<VenueRow>(
    `INSERT INTO venues (id, advertiser_id, name, address, verification_status) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, address, verification_status, verified_at`,
    [id, ctx.me.id, name, address, status],
  );
  if (made === null) return unavailable();
  return json(venueJson(made[0]), 201, { location: `/adv/venues/${id}` });
});

route("PATCH", "/adv/venues/:id", async ({ req, params }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  if (!UUID.test(params.id)) return notFound();
  const body = await readJson<{ name?: unknown; address?: unknown }>(req);
  const name = body?.name === undefined ? undefined : text(body.name, 128);
  const address = body?.address === undefined ? undefined : text(body.address);
  if (name === null || address === null || (name === undefined && address === undefined)) {
    return bad("change the name, the address, or both");
  }
  const held = address === undefined ? false : await suspendedAddress(address);
  if (held === null) return unavailable();
  const updated = await transaction(async (run) => {
    const [venue] = await run<VenueRow>(
      `SELECT id, name, address, verification_status, verified_at FROM venues
        WHERE id = $1 AND advertiser_id = $2 FOR UPDATE`,
      [params.id, ctx.me.id],
    );
    if (!venue) return null;
    const moved = address !== undefined && address !== venue.address;
    // A new address is proved by its own envelope; the old envelope went to
    // the old one and is burned. A suspended venue stays suspended.
    const status = held ? "suspended" : moved && venue.verification_status === "verified"
      ? "unverified"
      : venue.verification_status;
    if (moved) {
      await run(`UPDATE venue_envelopes SET burned_at = now(), code = NULL
                  WHERE venue_id = $1 AND used_at IS NULL AND burned_at IS NULL`, [venue.id]);
    }
    const [row] = await run<VenueRow>(
      `UPDATE venues SET name = $2, address = $3, verification_status = $4,
                         verified_at = CASE WHEN $4 = 'verified' THEN verified_at END
        WHERE id = $1 RETURNING id, name, address, verification_status, verified_at`,
      [venue.id, name ?? venue.name, address ?? venue.address, status],
    );
    return row;
  }).catch(() => "unavailable" as const);
  if (updated === "unavailable") return unavailable();
  if (!updated) return notFound();
  return json(venueJson(updated));
});

// Ten letters of an alphabet without look-alikes and two groups of five: ~60
// bits against thirty days of guessing and five attempts per envelope.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function envelopeCode(): string {
  const raw = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(raw, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 6)}-${chars.slice(6)}`;
}
const normalCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const bare = value.toUpperCase().replace(/[\s-]/g, "");
  return /^[2-9A-HJ-NP-Z]{12}$/.test(bare) ? `${bare.slice(0, 6)}-${bare.slice(6)}` : null;
};
const codeHash = (code: string) => sha256hex(`envelope|${code}`);

// Ordering an envelope supersedes the live one. The code is kept for the
// operator who prints it; the cabinet never sees it.
route("POST", "/adv/venues/:id/envelope", async ({ req, params }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  if (!ctx.me.confirmed) return refuse("refused", "confirm the email address first", 409);
  if (!UUID.test(params.id)) return notFound();
  const code = envelopeCode();
  const hash = await codeHash(code);
  const ordered = await transaction(async (run) => {
    const [venue] = await run<{ id: string; verification_status: string }>(
      `SELECT id, verification_status FROM venues WHERE id = $1 AND advertiser_id = $2 FOR UPDATE`,
      [params.id, ctx.me.id],
    );
    if (!venue) return null;
    if (venue.verification_status === "verified") return "verified" as const;
    await run(`UPDATE venue_envelopes SET burned_at = now(), code = NULL
                WHERE venue_id = $1 AND used_at IS NULL AND burned_at IS NULL`, [venue.id]);
    const [row] = await run<{ expires_at: Date }>(
      `INSERT INTO venue_envelopes (id, venue_id, code, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING expires_at`,
      [crypto.randomUUID(), venue.id, code, hash, ENVELOPE_TTL_DAYS],
    );
    return row;
  }).catch(() => "unavailable" as const);
  if (ordered === "unavailable") return unavailable();
  if (!ordered) return notFound();
  if (ordered === "verified") return refuse("refused", "this venue is already verified", 409);
  return json({ envelope_expires_at: ordered.expires_at }, 202);
});

// A wrong code spends an attempt of the live envelope; the last wrong one burns
// it. Wrong — 422, spent or none — 409 (protocol §4.13).
route("POST", "/adv/venues/:id/verify", async ({ req, params }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  if (!UUID.test(params.id)) return notFound();
  const limited = tooMany(ENVELOPE_CODE_LIMITS, `${clientAddress(req).ip}|envelope-code`);
  if (limited) return limited;
  const code = normalCode((await readJson<{ code?: unknown }>(req))?.code);
  const hash = code ? await codeHash(code) : null;
  const outcome = await transaction(async (run) => {
    const [venue] = await run<{ id: string }>(
      `SELECT id FROM venues WHERE id = $1 AND advertiser_id = $2 FOR UPDATE`, [params.id, ctx.me.id],
    );
    if (!venue) return "not_found" as const;
    const [envelope] = await run<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM venue_envelopes
        WHERE venue_id = $1 AND used_at IS NULL AND burned_at IS NULL AND expires_at > now()`,
      [venue.id],
    );
    if (!envelope) return "spent" as const;
    if (hash !== envelope.code_hash) {
      const left = ENVELOPE_ATTEMPTS - envelope.attempts - 1;
      await run(
        `UPDATE venue_envelopes SET attempts = attempts + 1,
                burned_at = CASE WHEN $2 THEN now() END, code = CASE WHEN $2 THEN NULL ELSE code END
          WHERE id = $1`,
        [envelope.id, left <= 0],
      );
      return { left: Math.max(left, 0) };
    }
    await run(`UPDATE venue_envelopes SET used_at = now(), code = NULL WHERE id = $1`, [envelope.id]);
    await run(`UPDATE venues SET verification_status = 'verified', verified_at = now() WHERE id = $1`, [venue.id]);
    return "verified" as const;
  }).catch(() => "unavailable" as const);
  if (outcome === "unavailable") return unavailable();
  if (outcome === "not_found") return notFound();
  if (outcome === "spent") return refuse("refused", "no live envelope: order a new one", 409);
  if (outcome === "verified") return json({ verification_status: "verified" });
  return refuse("invalid_body", "that code is not the one in the envelope", 422, { attempts_left: outcome.left });
});

// "This is not us": whoever holds an envelope they never ordered. No session —
// the real owner has no account — so the address's ceiling is the whole
// barrier, and a right code suspends the venue and spends the envelope.
route("POST", "/adv/venues/not-us", async ({ req }) => {
  const limited = tooMany(ENVELOPE_CODE_LIMITS, `${clientAddress(req).ip}|envelope-code`);
  if (limited) return limited;
  const code = normalCode((await readJson<{ code?: unknown }>(req))?.code);
  // Always 204, right code or wrong: the answer must not tell whether a code exists (review panel 2026-09-19).
  if (!code) return noContent();
  const done = await transaction(async (run) => {
    const [envelope] = await run<{ venue_id: string }>(
      `UPDATE venue_envelopes SET burned_at = now(), code = NULL
        WHERE code_hash = $1 AND used_at IS NULL AND burned_at IS NULL AND expires_at > now()
        RETURNING venue_id`,
      [await codeHash(code)],
    );
    if (!envelope) return false;
    await run(`UPDATE venues SET verification_status = 'suspended', verified_at = NULL WHERE id = $1`,
      [envelope.venue_id]);
    return true;
  }).catch(() => null);
  if (done === null) return unavailable();
  if (!done) return noContent();
  return noContent();
});

// --- offers -------------------------------------------------------------------

type OfferRow = {
  id: string; venue_id: string; offer_text: string; discount_value: string; conditions: string | null;
  promo_code: string | null; external_url: string | null; redirect_code: string; redirect_disabled_at: Date | null;
  redirect_hits: number; repeated_from_offer_id: string | null; discount_until: Date; status: string;
  published_at: Date; expires_at: Date; complaints: number;
};

const OFFER_COLUMNS = `o.id, o.venue_id, o.offer_text, o.discount_value, o.conditions, o.promo_code, o.external_url,
  o.redirect_code, o.redirect_disabled_at, o.redirect_hits, o.repeated_from_offer_id, o.discount_until,
  CASE WHEN o.status = 'active' AND o.expires_at <= now() THEN 'expired' ELSE o.status END AS status,
  o.published_at, o.expires_at,
  (SELECT count(*)::int FROM offer_complaints c WHERE c.offer_id = o.id) AS complaints`;

const offerJson = (o: OfferRow, brand: Brand) => ({
  ...o,
  link: `https://${brand.domain}/o/${o.redirect_code}`,
  link_disabled: o.redirect_disabled_at !== null,
});

// Mine only, live and expired; of the numbers only the hits (§2.1).
route("GET", "/adv/offers", async ({ req }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  const rows = await query<OfferRow>(
    `SELECT ${OFFER_COLUMNS} FROM offers o JOIN venues v ON v.id = o.venue_id
      WHERE v.advertiser_id = $1 AND o.brand = $2 ORDER BY o.published_at DESC, o.id`,
    [ctx.me.id, ctx.brand.key],
  );
  if (rows === null) return unavailable();
  return json({ items: rows.map((o) => offerJson(o, ctx.brand)) });
});

// The §6.1 checks this node can make by itself. The reputation lists and the
// stop words are not here yet; a refusal names its reason (§6 step 2).
function urlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "the link is not a web address";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "the link is not a web address";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (SHORTENERS.has(host)) return "a link shortener hides where the link goes";
  return null;
}

route("POST", "/adv/offers", async ({ req }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  if (!ctx.me.confirmed) return refuse("refused", "confirm the email address first", 409);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return bad("an offer is a JSON object");
  const venueId = typeof body.venue_id === "string" && UUID.test(body.venue_id) ? body.venue_id : null;
  const offerText = text(body.offer_text, 128);
  const discount = text(body.discount_value, 32);
  if (!venueId || !offerText || !discount) return bad("an offer needs a venue, a text and a discount");
  const conditions = body.conditions == null || body.conditions === "" ? null : text(body.conditions, 128);
  if (conditions === null && body.conditions != null && body.conditions !== "") {
    return refuse("refused", "conditions are 128 characters at most", 422, { reason: "conditions_too_long" });
  }
  const promo = body.promo_code == null || body.promo_code === "" ? null : text(body.promo_code, 64);
  const external = body.external_url == null || body.external_url === "" ? null : text(body.external_url, 2048);
  if (external) {
    const problem = urlProblem(external);
    if (problem) return refuse("refused", problem, 422, { reason: "link_refused" });
  }
  const until = typeof body.discount_until === "string" ? Date.parse(body.discount_until) : NaN;
  if (Number.isNaN(until)) return bad("the discount needs its end: discount_until");
  if (until <= Date.now() || until > Date.now() + DISCOUNT_MAX_DAYS * 86_400_000) {
    return refuse("refused", `the discount ends in the future and within ${DISCOUNT_MAX_DAYS} days`, 422, {
      reason: "discount_until_out_of_range",
    });
  }
  const repeatedFrom = typeof body.repeated_from === "string" && UUID.test(body.repeated_from)
    ? body.repeated_from
    : null;

  const result = await transaction(async (run) => {
    const [venue] = await run<{ verification_status: string }>(
      `SELECT verification_status FROM venues WHERE id = $1 AND advertiser_id = $2 FOR UPDATE`,
      [venueId, ctx.me.id],
    );
    if (!venue) return "not_found" as const;
    if (venue.verification_status !== "verified") return "not_verified" as const;
    if (repeatedFrom) {
      // §8: again from one's own expired or cleared offer, never from a live one.
      const [source] = await run<{ live: boolean }>(
        `SELECT (o.status = 'active' AND o.expires_at > now()) AS live FROM offers o JOIN venues v ON v.id = o.venue_id
          WHERE o.id = $1 AND v.advertiser_id = $2`,
        [repeatedFrom, ctx.me.id],
      );
      if (!source) return "not_found" as const;
      if (source.live) return "source_live" as const;
    }
    const [twin] = await run(
      `SELECT 1 FROM offers o JOIN venues v ON v.id = o.venue_id
        WHERE v.advertiser_id = $1 AND o.status = 'active' AND o.expires_at > now()
          AND lower(o.offer_text) = lower($2)`,
      [ctx.me.id, offerText],
    );
    if (twin) return "duplicate" as const;
    const [row] = await run<OfferRow>(
      `INSERT INTO offers AS o (id, brand, venue_id, offer_text, discount_value, conditions, promo_code, external_url,
                          redirect_code, repeated_from_offer_id, discount_until, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', now() + make_interval(mins => $12))
         RETURNING ${OFFER_COLUMNS}`,
      [crypto.randomUUID(), ctx.brand.key, venueId, offerText, discount, conditions, promo, external,
        randomToken(8), repeatedFrom, new Date(until), OFFER_LIFETIME_MINUTES],
    );
    return row;
  }).catch((error) => {
    log("error", "offer publication failed", { error: withoutAddresses(String(error)) });
    return "unavailable" as const;
  });
  if (result === "unavailable") return unavailable();
  if (result === "not_found") return notFound();
  if (result === "not_verified") return refuse("refused", "only a verified venue publishes", 409);
  if (result === "source_live") return refuse("refused", "that offer is still live", 409);
  if (result === "duplicate") {
    return refuse("refused", "the same text is already live", 422, { reason: "duplicate" });
  }
  return json(offerJson(result, ctx.brand), 201, { location: `/adv/offers/${result.id}` });
});

// --- complaints ----------------------------------------------------------------

// Complaints on one's own offers (offers spec §10): text and the UTC date,
// never the complainant, the address or the time — a time next to a small
// venue's day is often enough to name the person.
route("GET", "/adv/complaints", async ({ req }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  const rows = await query<{ id: string; offer_id: string; text: string | null; date: string; status: string; response: string | null }>(
    `SELECT c.id, c.offer_id, c.text, to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, c.status,
            r.text AS response
       FROM offer_complaints c
       JOIN offers o ON o.id = c.offer_id
       JOIN venues v ON v.id = o.venue_id
       LEFT JOIN business_responses r ON r.offer_complaint_id = c.id
      WHERE v.advertiser_id = $1 AND o.brand = $2
      ORDER BY c.created_at DESC, c.id`,
    [ctx.me.id, ctx.brand.key],
  );
  if (rows === null) return unavailable();
  return json({ items: rows });
});

// The venue's answer, privately to the moderator (§10.3). One per complaint,
// and it cannot be taken back: an answer rewritten after the decision would
// be the same "what it said yesterday" argument §3.1 closes for offers.
route("POST", "/adv/complaints/:id/response", async ({ req, params }) => {
  const ctx = await session(req);
  if (ctx instanceof Response) return ctx;
  if (!UUID.test(params.id)) return notFound();
  const answer = text((await readJson<{ text?: unknown }>(req))?.text, 1000);
  if (!answer) return bad("an answer needs its text, up to 1000 characters");
  const made = await transaction(async (run) => {
    const [complaint] = await run<{ id: string }>(
      `SELECT c.id FROM offer_complaints c JOIN offers o ON o.id = c.offer_id JOIN venues v ON v.id = o.venue_id
        WHERE c.id = $1 AND v.advertiser_id = $2 AND o.brand = $3 FOR UPDATE OF c`,
      [params.id, ctx.me.id, ctx.brand.key],
    );
    if (!complaint) return "not_found" as const;
    const [row] = await run(
      `INSERT INTO business_responses (id, offer_complaint_id, text) VALUES ($1, $2, $3)
         ON CONFLICT (offer_complaint_id) DO NOTHING RETURNING id`,
      [crypto.randomUUID(), complaint.id, answer],
    );
    return row ? "made" as const : "answered" as const;
  }).catch((error) => {
    log("error", "a complaint answer failed", { error: withoutAddresses(String(error)) });
    return "unavailable" as const;
  });
  if (made === "unavailable") return unavailable();
  if (made === "not_found") return notFound();
  if (made === "answered") return refuse("refused", "this complaint already has its answer", 409);
  return noContent();
});
