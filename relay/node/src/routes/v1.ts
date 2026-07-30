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
import { acceptPageview } from "./pageview.ts";
import { acceptClientError } from "./client_error.ts";
import { brandByKey } from "../lib/brand_registry.ts";
import { inc } from "../lib/metrics.ts";
import { EVENTS, exceeded, record, secondsUntilReset } from "../lib/quota.ts";

// One error shape for every answer under /v1. `code` is what a client branches
// on and never changes; `message` is for a human reading a log and may.
export function apiError(
  code: string,
  message: string,
  status: number,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: { code, message, ...extra } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
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

// The daily allowance, on this path too. It was checked only for publishable keys
// (lib/tenant.ts), so a limit set in the panel governed a landing's traffic and
// silently ignored the tenant's own server — the caller most likely to run a loop.
//
// Counted here rather than after the work, and counted whether or not the work
// succeeds: what a limit measures is requests admitted, so a caller retrying our
// own failure is not charged twice. `/v1/me` is deliberately outside this: it
// writes nothing, and charging a caller for asking how its key is configured
// would spend the allowance on the one call that exists to check the others.
async function overAllowance(caller: SecretKey, route: string): Promise<Response | null> {
  if (await exceeded(caller.id, caller.quota_events_per_day ?? null)) {
    const retryAfter = secondsUntilReset();
    inc("relay_v1_total", { route, result: "rate_limited" });
    return apiError(
      "rate_limited",
      "daily quota exceeded",
      429,
      { limit: caller.quota_events_per_day, retry_after: retryAfter },
      { "retry-after": String(retryAfter) },
    );
  }
  record(caller.id, EVENTS);
  return null;
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
  const over = await overAllowance(caller, "waitlist");
  if (over) return over;

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

// A tenant counting its own traffic. Worth exposing precisely because of what it
// refuses to record: no address, no user agent, nothing that survives the
// request — so the caller owes their visitors no consent banner for it.
//
// No idempotency here, unlike the waitlist. A repeated view is a view: two
// identical reports a second apart are two people, or one person twice, and
// collapsing them would make the counter lie in the one direction that matters.
route("POST", "/v1/pageview", async ({ req }) => {
  const caller = await authenticate(req);
  if (caller instanceof Response) return caller;
  if (!can({ scopes: caller.scopes, brand: caller.brand }, "pageviews.write")) {
    inc("relay_v1_total", { route: "pageview", result: "forbidden" });
    return denied(caller, "pageviews.write");
  }
  const over = await overAllowance(caller, "pageview");
  if (over) return over;

  const raw = await req.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return apiError("invalid_body", "the body is not JSON", 422);
  }
  if (!parsed || typeof parsed !== "object") {
    return apiError("invalid_body", "expected a JSON object", 422);
  }

  inc("relay_v1_total", { route: "pageview", result: "ok" });
  return acceptPageview(caller.brand, parsed);
});

// A tenant's own front-end reporting its own breakage. The unversioned route
// stays as it is — it never refuses, because a page whose key went stale must
// still be able to say so, and it keeps the report unattributed rather than
// dropping it. Here the key is a credential and the tenant is known, so the
// usual refusals apply and nothing lands unattributed.
//
// No idempotency, as with the counter: two identical reports are two failures, or
// one failure twice, and collapsing them would hide how often it happens.
route("POST", "/v1/client-error", async ({ req }) => {
  const caller = await authenticate(req);
  if (caller instanceof Response) return caller;
  if (!can({ scopes: caller.scopes, brand: caller.brand }, "client_errors.write")) {
    inc("relay_v1_total", { route: "client-error", result: "forbidden" });
    return denied(caller, "client_errors.write");
  }
  const over = await overAllowance(caller, "client-error");
  if (over) return over;

  const raw = await req.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return apiError("invalid_body", "the body is not JSON", 422);
  }
  if (!parsed || typeof parsed !== "object") {
    return apiError("invalid_body", "expected a JSON object", 422);
  }

  inc("relay_v1_total", { route: "client-error", result: "ok" });
  return acceptClientError(caller.brand, parsed);
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
