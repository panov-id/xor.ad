// The advertiser's door (offers/SPEC_RU.md §2.1; db/067).
//
// The cabinet lives on adv.<storefront>, and the storefront is read from the
// request's Origin: a cookie route without an Origin of one of ours is refused,
// which is also what keeps another site from riding the cookie.
//
// Sign-in is a link by mail made of two halves. The request leaves a secret in
// the asking browser (cookie __Host-adv-link) and mails a token; only the hash
// of both is stored, so the letter alone opens nothing. The link lives fifteen
// minutes and is spent on first use. The session is a row (advertiser_sessions)
// named by a cookie __Host-adv — HttpOnly, Secure, SameSite=Lax, Path=/, no
// Domain — and every request reads it, so signing out or losing the account
// ends it at once.

import type { Brand } from "../config.ts";
import { allBrands } from "./brand_registry.ts";
import { query } from "./db.ts";
import { sha256hex } from "./hash.ts";
import type { Limit } from "./rate_limit.ts";

export const LINK_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const SESSION_COOKIE = "__Host-adv";
export const LINK_COOKIE = "__Host-adv-link";

const HOUR = 60 * 60 * 1000;
// The asker's own ceiling, and the mailbox's: without the second a flood into
// one inbox costs nothing but fresh addresses (§2.1 «Безопасность»).
export const ADV_LINK_LIMITS: Limit[] = [
  { name: "adv-link", max: 20, windowMs: HOUR },
  { name: "adv-link-day", max: 60, windowMs: 24 * HOUR },
];
export const ADV_MAILBOX_LIMITS: Limit[] = [{ name: "adv-mailbox", max: 6, windowMs: HOUR }];
// Entering an envelope code, in the cabinet and on the "not us" page alike.
export const ENVELOPE_CODE_LIMITS: Limit[] = [
  { name: "envelope-code", max: 10, windowMs: HOUR },
  { name: "envelope-code-day", max: 30, windowMs: 24 * HOUR },
];

export function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function cookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

const SAFE_METHODS = new Set(["GET", "HEAD"]);

// The storefront whose cabinet this request came from, or null.
//
// A browser sends no Origin on a same-origin GET (Chromium 129, measured
// 27.09.2026: GET origin=null, POST origin set), so a cabinet served from the
// node's own address answered 401 to every read. A read names its storefront
// by the address it was sent to — X-Forwarded-Host from the cabinet's proxy,
// else Host. Naming another one gains nothing: the session must belong to the
// storefront named. A request that changes something must carry an Origin of
// ours, which is what keeps another site from riding the cookie (CSRF); and an
// Origin that is present and not ours is refused on any method.
export async function brandOfCabinet(req: Request): Promise<Brand | null> {
  const origin = req.headers.get("origin");
  let host: string;
  if (origin) {
    try {
      host = new URL(origin).host;
    } catch {
      return null;
    }
  } else if (SAFE_METHODS.has(req.method)) {
    host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  } else {
    return null;
  }
  host = host.toLowerCase();
  if (!host) return null;
  return (await allBrands()).find((brand) => `adv.${brand.domain.toLowerCase()}` === host) ?? null;
}

export const linkHash = (token: string, half: string) => sha256hex(`${token}.${half}`);

export interface Advertiser {
  id: string;
  email: string;
  brand: string;
  confirmed: boolean;
}

// The advertiser behind the session cookie, on the storefront the request came
// from. A session of another storefront is not a session here.
export async function advertiserOf(req: Request, brand: Brand): Promise<Advertiser | null | "unavailable"> {
  const raw = cookie(req, SESSION_COOKIE);
  if (!raw || !/^[0-9a-f]{64}$/.test(raw)) return null;
  const rows = await query<Advertiser>(
    `SELECT a.id, a.email, a.brand, a.email_confirmed_at IS NOT NULL AS confirmed
       FROM advertiser_sessions s JOIN advertisers a ON a.id = s.advertiser_id
      WHERE s.session_hash = $1 AND s.expires_at > now() AND a.brand = $2`,
    [await sha256hex(raw), brand.key],
  );
  if (rows === null) return "unavailable";
  return rows[0] ?? null;
}

export const cabinetUrl = (brand: Brand) => `https://adv.${brand.domain}`;
