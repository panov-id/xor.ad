// Protocol §2, verbatim: the signature that stands in for a session cookie.
//
//   signed       <method>\n<path>\n<sha256 of body>\n<unix time>
//   headers      x-identity-session   uuid of a live session
//                x-identity-time      the same time as in the string
//                x-identity-sign      the signature, base64url
//   window       ±5 minutes
//   algorithm    ECDSA, namedCurve P-256, hash SHA-256
//
// Nothing here touches the database: a signature is either well-formed against a
// given public key or it is not, and that question has to be answerable in a test
// without Postgres. Looking the session up, freezing, rate limits and the nonce
// table live above this, in the route.
//
// Two shapes the canon does not spell out, decided here on 2026-09-20 and written
// down so the terminal client and the web face agree:
//
//   public key   base64url of the SPKI export (WebCrypto `exportKey("spki")`).
//       The raw export is shorter — 65 bytes against 91 — but it is a bare point:
//       the curve is whatever the reader assumes. SPKI carries the curve's OID, so
//       a key for another curve is refused by import rather than misread.
//   signature    base64url of the raw r‖s pair WebCrypto `sign` returns, 64 bytes
//       for P-256. Not DER: WebCrypto neither produces nor accepts DER here, and a
//       node that re-encoded would be doing work for no reader.

import { config } from "../config.ts";

// ±5 minutes, protocol §2. Seconds, because x-identity-time is unix seconds.
export const TIME_WINDOW_SECONDS = 5 * 60;

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

// A detached signature by the identity's long key over raw bytes — the
// ephemeral half of §8.13 is published this way. False on any malformed input.
export async function verifyByLongKey(spkiBase64url: string, bytes: Uint8Array, signatureBase64url: string): Promise<boolean> {
  const key = await importSignPublicKey(spkiBase64url);
  const signature = base64urlToBytes(signatureBase64url);
  if (!key || !signature) return false;
  try {
    return await crypto.subtle.verify(SIGN, key, signature as BufferSource, bytes as BufferSource);
  } catch {
    return false;
  }
}

export type AuthFailure =
  | "missing_headers"
  | "malformed_time"
  | "time_out_of_window"
  | "malformed_signature"
  | "malformed_key"
  | "bad_signature";

export interface SignedRequest {
  sessionId: string;
  time: number;
  signature: Uint8Array;
}

export function base64urlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The exact five lines that get signed. Kept as one function because both the
// node and the clients have to build the same bytes, and a test that builds them
// a second way tests the test.
//
// **It became five on 2026-09-21, by the owner's decision (open-work G18).** It
// was four — method, path, body hash, time — and the protocols lens of the
// review panel named what the two missing ones cost:
//
//   *authority*. Nothing in the signature said which node or which face the
//   request was addressed to, so one signed request was accepted by every node
//   of the pool where that session lives, and by api.sosed as readily as by
//   api.neighbro, for the whole ±5 minute window. RFC 9421 keeps `@authority`
//   in the covered components for exactly this.
//
//   *query*. §2 argued the query out of the signature for reproducibility and
//   never named the price: `GET /feed?after=<cursor>` and `GET /inbox` carry a
//   cursor there, and anything that can rewrite a request in flight could move
//   it while the signature stayed valid. Reproducibility is a real problem and
//   the answer is normalisation, not omission.
//
// The change was made while it was free: measured the same day, the signature
// is implemented by this node and its tests and by nothing else — there is no
// client in sosed.place or neighbro.place, and `depth` does not exist. The
// major version stays 1 because there is no version 1 in anybody's hands to
// stay compatible with.
export function signedPayload(
  method: string,
  authority: string,
  path: string,
  bodySha256: string,
  time: number,
): string {
  return `${method}\n${authority}\n${path}\n${bodySha256}\n${time}`;
}

// The host the request was addressed to, lowercased, with a default port
// dropped. `api.sosed.place` and `api.sosed.place:443` are one authority;
// `API.SOSED.PLACE` is the same one shouting.
export function signedAuthority(url: string | URL): string {
  const parsed = new URL(url);
  const port = parsed.port === "" || (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ? ""
    : `:${parsed.port}`;
  return `${parsed.hostname.toLowerCase()}${port}`;
}

// The path **with** its query, normalised so that the same request always
// produces the same line whoever serialised it.
//
// Normalisation is the whole difficulty, and it is why §2 left the query out in
// the first place: `?b=2&a=1` and `?a=1&b=2` are the same request and different
// strings. So the parameters are sorted — by name, then by value, both compared
// as the code units they are — and re-encoded by one encoder rather than
// whichever the client happened to use. A parameter repeated twice keeps both
// of its values, in sorted order, because dropping one would make two different
// requests sign the same.
//
// An empty query signs as a bare path, not as a path with a trailing `?`: a
// client that builds `/feed` and one that builds `/feed?` mean the same thing.
export function signedPath(url: string | URL): string {
  const parsed = new URL(url);
  const pairs = [...parsed.searchParams.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  if (pairs.length === 0) return parsed.pathname;
  const query = pairs
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${parsed.pathname}?${query}`;
}

// The three headers, shape-checked and nothing more. A missing session is not a
// 401 here — the caller decides, because some routes answer 404 on purpose.
export function readSignedHeaders(req: Request): SignedRequest | AuthFailure {
  const sessionId = req.headers.get("x-identity-session");
  const rawTime = req.headers.get("x-identity-time");
  const rawSign = req.headers.get("x-identity-sign");
  if (!sessionId || !rawTime || !rawSign) return "missing_headers";
  if (!/^[0-9]{1,15}$/.test(rawTime)) return "malformed_time";
  const time = Number(rawTime);
  const signature = base64urlToBytes(rawSign);
  // P-256 r‖s: exactly 64 bytes. A DER signature arrives 70-ish and is refused
  // here rather than by a verify that would simply return false.
  if (!signature || signature.length !== 64) return "malformed_signature";
  return { sessionId, time, signature };
}

// Inside ±5 minutes of now. `now` is a parameter so a test can name the moment
// instead of sleeping.
export function withinWindow(time: number, now = Math.floor(Date.now() / 1000)): boolean {
  return Math.abs(now - time) <= TIME_WINDOW_SECONDS;
}

export async function importSignPublicKey(base64urlSpki: string): Promise<CryptoKey | null> {
  const bytes = base64urlToBytes(base64urlSpki);
  if (!bytes) return null;
  try {
    return await crypto.subtle.importKey("spki", bytes, P256, true, ["verify"]);
  } catch {
    return null;
  }
}

export interface VerifyInput {
  method: string;
  url: string | URL;
  body: Uint8Array;
  signPublicKey: string;
  now?: number;
}

// The whole check in one call: headers, window, key, signature. Returns the
// verified session id, or which of the four failed — the caller turns that into
// a status, because the same failure is 401 on one route and 404 on another.
export async function verifySignedRequest(
  req: Request,
  input: VerifyInput,
): Promise<{ sessionId: string; time: number } | AuthFailure> {
  const headers = readSignedHeaders(req);
  if (typeof headers === "string") return headers;
  if (!withinWindow(headers.time, input.now)) return "time_out_of_window";
  const key = await importSignPublicKey(input.signPublicKey);
  if (!key) return "malformed_key";
  const payload = signedPayload(
    input.method,
    signedAuthority(input.url),
    signedPath(input.url),
    await sha256hex(input.body),
    headers.time,
  );
  const ok = await crypto.subtle.verify(
    SIGN,
    key,
    headers.signature as BufferSource,
    new TextEncoder().encode(payload),
  );
  return ok ? { sessionId: headers.sessionId, time: headers.time } : "bad_signature";
}

// Protocol §3: the integer major version, required on every request, not signed.
// Forging it only refuses this request, so it is read and compared, not trusted.
export function protocolVersion(req: Request): number | null {
  const raw = req.headers.get("x-protocol-version");
  if (!raw || !/^[0-9]{1,4}$/.test(raw)) return null;
  const version = Number(raw);
  return version >= 1 ? version : null;
}

export const PROTOCOL_MAJOR = 1;

export function versionSupported(version: number | null): boolean {
  return version === PROTOCOL_MAJOR;
}

// Protocol §3: present on every answer once a sunset date is set, absent before.
// Reading config here rather than in each route keeps "every answer" honest.
export function sunsetHeader(): Record<string, string> {
  const at = config.protocolSunsetAt;
  return at ? { "x-protocol-sunset": String(at) } : {};
}
