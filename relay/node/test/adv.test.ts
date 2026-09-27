// The advertising cabinet on the node (routes/adv.ts, db/067, db/068): a
// sign-in link of two halves, venues bounded by their owner, the envelope and
// its counted attempts, "this is not us" without a session, and an offer that
// only a verified venue publishes, with the §6.1 checks that refuse it.

import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "adv-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "adv-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "adv-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([
    { key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" },
    { key: "beta", name: "Beta", domain: "beta.test", from: "b <b@beta.test>" },
  ]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const { reset } = await import("../src/lib/rate_limit.ts");
const { linkHash } = await import("../src/lib/adv.ts");
const { lettersSettled } = await import("../src/routes/adv.ts");

// The pool keeps its connection open across tests (test/batch_counts.test.ts).
const pooled = { sanitizeOps: false, sanitizeResources: false };
let addresses = 0;
// deno-lint-ignore no-explicit-any -- JSON of many shapes, read field by field below
type Answer = { status: number; body: any; cookies: Record<string, string>; headers: Headers };

async function call(
  method: string, path: string, opts: { body?: unknown; origin?: string | null; cookies?: Record<string, string> } = {},
): Promise<Answer> {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const headers: Record<string, string> = {
    "x-origin-token": "adv-origin-token",
    "x-client-ip": `198.51.100.${++addresses % 250}`,
  };
  const origin = opts.origin === undefined ? "https://adv.alpha.test" : opts.origin;
  if (origin) headers.origin = origin;
  if (opts.cookies) headers.cookie = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const response = await found.h({
    req: new Request(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    params: found.params,
    url,
  });
  const cookies: Record<string, string> = {};
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [name, ...value] = pair.split("=");
    cookies[name] = value.join("=");
  }
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, cookies, headers: response.headers };
}

// Signs up and in: the letter's token is written as the node would write it,
// under the half the node left in the browser.
async function signedIn(email: string, origin = "https://adv.alpha.test"): Promise<Record<string, string>> {
  const up = await call("POST", "/adv/signup", { origin, body: { email, contact: "+357 00 000000" } });
  assertEquals(up.status, 204);
  const half = up.cookies["__Host-adv-link"];
  assertMatch(half, /^[0-9a-f]{64}$/);
  const token = crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");
  await database.queryOrThrow(
    `INSERT INTO advertiser_links (link_hash, advertiser_id, expires_at)
       SELECT $1, id, now() + interval '15 minutes' FROM advertisers WHERE lower(email) = lower($2)
          AND brand = $3`,
    [await linkHash(token, half), email, new URL(origin).host.replace(/^adv\./, "").split(".")[0]],
  );
  // Somebody else's browser — the letter without the half — opens nothing.
  const stranger = await call("POST", "/adv/session", { origin, body: { token }, cookies: { "__Host-adv-link": "0".repeat(64) } });
  assertEquals(stranger.status, 401);
  const opened = await call("POST", "/adv/session", { origin, body: { token }, cookies: { "__Host-adv-link": half } });
  assertEquals(opened.status, 204);
  const session = opened.cookies["__Host-adv"];
  assertMatch(session, /^[0-9a-f]{64}$/);
  // Spent on first use.
  const again = await call("POST", "/adv/session", { origin, body: { token }, cookies: { "__Host-adv-link": half } });
  assertEquals(again.status, 401);
  return { "__Host-adv": session };
}

Deno.test({ name: "the cabinet: sign-in, a venue proved by its envelope, an offer, and nobody else's rows", ...pooled, fn: async () => {
  reset();
  await lettersSettled();
  const email = `bakery-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const me = await signedIn(email);
  const who = await call("GET", "/adv/me", { cookies: me });
  assertEquals(who.status, 200);
  assertEquals(who.body.email_confirmed, true, "the first sign-in confirms the address");

  // The cookie is refused from another origin, and from none.
  assertEquals((await call("GET", "/adv/me", { cookies: me, origin: "https://adv.beta.test" })).status, 401);
  assertEquals((await call("GET", "/adv/me", { cookies: me, origin: null })).status, 401);
  // A second sign-up of the same address is not a second account and says nothing.
  assertEquals((await call("POST", "/adv/signup", { body: { email, contact: "x" } })).status, 204);
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM advertisers WHERE lower(email) = lower($1)`, [email])).length, 1,
  );

  const made = await call("POST", "/adv/venues", { cookies: me, body: { name: "Кофейня на Макариу", address: "Makariou 1, Nicosia" } });
  assertEquals(made.status, 201);
  assertEquals(made.body.verification_status, "unverified");
  assertEquals(made.headers.get("location"), `/adv/venues/${made.body.id}`);
  const venue = made.body.id as string;

  const offer = (over: Record<string, unknown> = {}) => ({
    venue_id: venue, offer_text: "второй кофе бесплатно", discount_value: "1+1",
    discount_until: new Date(Date.now() + 7 * 86_400_000).toISOString(), external_url: "https://cafe.example/menu",
    ...over,
  });
  // Not verified yet: no offer.
  assertEquals((await call("POST", "/adv/offers", { cookies: me, body: offer() })).status, 409);

  // The envelope, and a wrong code spends an attempt.
  const ordered = await call("POST", `/adv/venues/${venue}/envelope`, { cookies: me });
  assertEquals(ordered.status, 202);
  const [{ code }] = await database.queryOrThrow<{ code: string }>(
    `SELECT code FROM venue_envelopes WHERE venue_id = $1 AND used_at IS NULL AND burned_at IS NULL`, [venue],
  );
  const wrong = await call("POST", `/adv/venues/${venue}/verify`, { cookies: me, body: { code: "222222-222222" } });
  assertEquals(wrong.status, 422);
  assertEquals(wrong.body.error.attempts_left, 4);

  // Another advertiser sees none of it and cannot touch it.
  const other = await signedIn(`other-${crypto.randomUUID().slice(0, 8)}@example.test`);
  assertEquals((await call("GET", "/adv/venues", { cookies: other })).body.items.length, 0);
  assertEquals((await call("POST", `/adv/venues/${venue}/verify`, { cookies: other, body: { code } })).status, 404);
  assertEquals((await call("PATCH", `/adv/venues/${venue}`, { cookies: other, body: { name: "угнано" } })).status, 404);

  const right = await call("POST", `/adv/venues/${venue}/verify`, { cookies: me, body: { code: code.toLowerCase() } });
  assertEquals(right.status, 200);
  assertEquals(right.body.verification_status, "verified");
  assertEquals((await call("POST", `/adv/venues/${venue}/verify`, { cookies: me, body: { code } })).status, 409,
    "a used envelope is spent");

  // §6.1 and the term, each refused with its reason.
  const shortener = await call("POST", "/adv/offers", { cookies: me, body: offer({ external_url: "https://bit.ly/x" }) });
  assertEquals([shortener.status, shortener.body.error.reason], [422, "link_refused"]);
  const far = await call("POST", "/adv/offers", {
    cookies: me, body: offer({ discount_until: new Date(Date.now() + 91 * 86_400_000).toISOString() }),
  });
  assertEquals([far.status, far.body.error.reason], [422, "discount_until_out_of_range"]);

  const published = await call("POST", "/adv/offers", { cookies: me, body: offer() });
  assertEquals(published.status, 201, JSON.stringify(published.body));
  assertEquals(published.body.status, "active");
  assertMatch(published.body.link, /^https:\/\/alpha\.test\/o\/[0-9a-f]{16}$/);
  const twin = await call("POST", "/adv/offers", { cookies: me, body: offer() });
  assertEquals([twin.status, twin.body.error.reason], [422, "duplicate"]);
  // "Show again" is not for a live offer.
  assertEquals((await call("POST", "/adv/offers", {
    cookies: me, body: offer({ offer_text: "другой текст", repeated_from: published.body.id }),
  })).status, 409);

  // The card's life ends; the list says expired, and it may be shown again.
  await database.queryOrThrow(`UPDATE offers SET expires_at = now() - interval '1 minute' WHERE id = $1`, [published.body.id]);
  const mine = await call("GET", "/adv/offers", { cookies: me });
  assertEquals(mine.body.items.map((o: { id: string; status: string; redirect_hits: number }) => [o.id, o.status, o.redirect_hits]), [[published.body.id, "expired", 0]]);
  assertEquals((await call("GET", "/adv/offers", { cookies: other })).body.items.length, 0);
  const repeated = await call("POST", "/adv/offers", { cookies: me, body: offer({ repeated_from: published.body.id }) });
  assertEquals(repeated.status, 201);
  assertEquals(repeated.body.repeated_from_offer_id, published.body.id);

  // A new address is proved again.
  const moved = await call("PATCH", `/adv/venues/${venue}`, { cookies: me, body: { address: "Ledras 5, Nicosia" } });
  assertEquals(moved.status, 200);
  assertEquals(moved.body.verification_status, "unverified");

  // Signing out ends the session on the next request.
  await lettersSettled();
  assertEquals((await call("POST", "/adv/sign-out", { cookies: me })).status, 204);
  assertEquals((await call("GET", "/adv/me", { cookies: me })).status, 401);
} });

Deno.test({ name: "an envelope burns after five wrong codes, and 'not us' suspends by the code alone", ...pooled, fn: async () => {
  reset();
  await lettersSettled();
  const me = await signedIn(`venue-${crypto.randomUUID().slice(0, 8)}@example.test`);
  const venue = (await call("POST", "/adv/venues", { cookies: me, body: { name: "Пекарня", address: "Larnaca 2" } })).body.id;
  await call("POST", `/adv/venues/${venue}/envelope`, { cookies: me });
  for (let left = 4; left >= 0; left--) {
    const wrong = await call("POST", `/adv/venues/${venue}/verify`, { cookies: me, body: { code: "333333-333333" } });
    assertEquals([wrong.status, wrong.body.error.attempts_left], [422, left]);
  }
  assertEquals((await call("POST", `/adv/venues/${venue}/verify`, { cookies: me, body: { code: "333333-333333" } })).status, 409,
    "the fifth wrong code burned the envelope");

  await call("POST", `/adv/venues/${venue}/envelope`, { cookies: me });
  const [{ code }] = await database.queryOrThrow<{ code: string }>(
    `SELECT code FROM venue_envelopes WHERE venue_id = $1 AND used_at IS NULL AND burned_at IS NULL`, [venue],
  );
  assertEquals((await call("POST", "/adv/venues/not-us", { origin: null, body: { code: "444444-444444" } })).status, 422);
  assertEquals((await call("POST", "/adv/venues/not-us", { origin: null, body: { code } })).status, 204);
  const [row] = await database.queryOrThrow<{ verification_status: string }>(
    `SELECT verification_status FROM venues WHERE id = $1`, [venue],
  );
  assertEquals(row.verification_status, "suspended");
  assertEquals((await call("POST", "/adv/venues/not-us", { origin: null, body: { code } })).status, 422, "spent");
  await lettersSettled();
} });
