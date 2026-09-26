import { config } from "../config.ts";

// Reflect the origin only when it's in the allowlist; otherwise send no ACAO.
function allowOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (config.allowedOrigins.length === 0) return origin; // dev convenience
  return config.allowedOrigins.includes(origin) ? origin : null;
}

// What a browser may put on a request to us: the panel's key and token, and
// the four a signed call carries (lib/identity_auth.ts: x-protocol-version,
// and the session, the time and the signature). Named here once, as a list,
// so a test can hold the list to what the node actually reads.
export const SIGNED_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "x-api-key",
  "x-protocol-version",
  "x-identity-session",
  "x-identity-time",
  "x-identity-sign",
];

// What a browser may read off our answers, beyond the safelist.
export const EXPOSED_RESPONSE_HEADERS = [
  "x-total-count",
  "x-platform-count",
  "x-request-id",
  "retry-after",
  "x-protocol-sunset",
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowOrigin(origin);
  if (!allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    // The browser drops x-api-key on the preflight without this — and, until
    // 2026-09-26, every signed call: a person's request carries the protocol's
    // major and the session's three (lib/identity_auth.ts), so a web face on
    // its own origin could not call the node at all; the first one (W1) had to
    // forward through its own server to be heard (web/vite.config.ts).
    "access-control-allow-headers": SIGNED_REQUEST_HEADERS.join(", "),
    // Without this the browser hands the page a response with the custom headers
    // stripped, and every reader of them silently falls back. The panel's data
    // provider reads x-total-count and had been getting null across origins
    // since it was written — so "how many notices are there" was answering "how
    // many were on this page". Found by a review lens, 2026-09-08. A person's
    // client reads two more: retry-after on 429 and 503 (protocol §6,
    // depth/core/client.ts) and x-protocol-sunset (protocol §3).
    "access-control-expose-headers": EXPOSED_RESPONSE_HEADERS.join(", "),
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

export function handlePreflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
