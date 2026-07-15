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
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

export function handlePreflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
