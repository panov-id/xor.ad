// The public API, versioned. Everything a third party is meant to call lives
// under /v1 and answers in one shape.
//
// The unversioned `POST /waitlist` and `POST /client-error` stay exactly as they
// are: live landings call them, and a public API is not a reason to break the
// callers that predate it. They are the same handlers, reachable by two paths.
//
// Authentication here is a secret key, never a publishable one. A publishable
// key is an identifier that ships inside a web page — accepting it on a
// server-to-server route would mean anyone who read a landing's source could
// call the API as that tenant.

import { route } from "../lib/router.ts";
import { readJson } from "../lib/http.ts";
import { can } from "../access/index.ts";
import { resolveSecretKey, type SecretKey } from "../lib/secret_key.ts";
import { recall, remember } from "../lib/idempotency.ts";
import { acceptLead } from "./waitlist.ts";
import { brandByKey } from "../lib/brand_registry.ts";
import { inc } from "../lib/metrics.ts";

// One error shape for every answer under /v1. `code` is what a client branches
// on and never changes; `message` is for a human reading a log and may.
export function apiError(
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message, ...extra } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Resolve the caller, or the refusal to send back. A missing key and a wrong one
// answer the same way: distinguishing them tells a guesser they got the format
// right.
async function authenticate(req: Request): Promise<SecretKey | Response> {
  const header = req.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();
  if (!presented) {
    return apiError("unauthorized", "a secret key is required: Authorization: Bearer ak_live_…", 401);
  }
  const key = await resolveSecretKey(presented);
  if (!key) return apiError("unauthorized", "unknown or revoked key", 401);
  return key;
}

const denied = (key: SecretKey, permission: string): Response =>
  apiError(
    "forbidden",
    `this key is not scoped for ${permission}`,
    403,
    { scopes: key.scopes },
  );

route("POST", "/v1/waitlist", async ({ req }) => {
  const caller = await authenticate(req);
  if (caller instanceof Response) return caller;
  if (!can({ scopes: caller.scopes, brand: caller.brand }, "waitlist.write")) {
    inc("relay_v1_total", { route: "waitlist", result: "forbidden" });
    return denied(caller, "waitlist.write");
  }

  // Read once: the body is needed twice — to fingerprint the request and to hand
  // to the handler — and a Request body cannot be read twice.
  const raw = await req.text();
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const seen = await recall(caller.brand, idempotencyKey, raw);
    if (seen) {
      inc("relay_v1_total", { route: "waitlist", result: "replayed" });
      return new Response(JSON.stringify(seen.body), {
        status: seen.status,
        headers: { "content-type": "application/json", "idempotent-replay": "true" },
      });
    }
  }

  // The tenant is the key's, and it is handed over directly. Forging a request
  // for the public route to re-resolve would mean the brand is decided twice, by
  // two rules, and the second one does not know about secret keys at all.
  const brand = await brandByKey(caller.brand);
  if (!brand) return apiError("unknown_brand", "the key names a brand that no longer exists", 409);

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return apiError("invalid_body", "the body is not JSON", 422);
  }
  if (!parsed || typeof parsed !== "object") {
    return apiError("invalid_body", "expected a JSON object", 422);
  }

  const response = await acceptLead(brand, parsed);
  const body = await response.clone().json().catch(() => ({}));

  if (idempotencyKey && response.ok) {
    await remember(caller.brand, idempotencyKey, raw, { status: response.status, body });
  }
  inc("relay_v1_total", { route: "waitlist", result: response.ok ? "ok" : "rejected" });
  return response;
});

// A caller's own view of the key it is holding: which tenant, which scopes. The
// cheapest way to answer "is my integration configured right" without writing
// anything.
route("GET", "/v1/me", async ({ req }) => {
  const caller = await authenticate(req);
  if (caller instanceof Response) return caller;
  return new Response(
    JSON.stringify({
      id: caller.id,
      brand: caller.brand,
      name: caller.name,
      scopes: caller.scopes,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
