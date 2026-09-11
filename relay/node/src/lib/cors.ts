import { config } from "../config.ts";

// Reflect the origin only when it's in the allowlist; otherwise send no ACAO.
function allowOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (config.allowedOrigins.length === 0) return origin; // dev convenience
  return config.allowedOrigins.includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowOrigin(origin);
  if (!allowed) return {};
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    // The browser drops x-api-key on the preflight without this.
    "access-control-allow-headers": "authorization, content-type, x-api-key",
    // Without this the browser hands the page a response with the custom headers
    // stripped, and every reader of them silently falls back. The panel's data
    // provider reads x-total-count and had been getting null across origins
    // since it was written — so "how many notices are there" was answering "how
    // many were on this page". Found by a review lens, 2026-09-08.
    "access-control-expose-headers": "x-total-count, x-platform-count, x-request-id",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

export function handlePreflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
