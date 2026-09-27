// POST /o/:code/report (offers spec §10.1; routes/offer_links.ts, db/069): a
// report from somebody who has not written in the feed long enough before the
// offer does not count, one person counts once, and the second counting report
// switches the link off while the offer stays.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "offer-report-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "offer-report-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "offer-report-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { reset } = await import("../src/lib/rate_limit.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/offer_links.ts");
await import("../src/routes/offer_complaints.ts");
await import("../src/routes/adv.ts");
const { sha256hex } = await import("../src/lib/hash.ts");

const KEY_ID = "ak_pub_offerreporttest01";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA') ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`, [KEY_ID],
);

// The pool keeps its connection open across tests (test/batch_counts.test.ts).
const pooled = { sanitizeOps: false, sanitizeResources: false };
const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;

async function call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "offer-report-origin-token",
        "x-client-ip": `203.0.113.${++addresses % 250}`,
        ...(raw === undefined ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      body: raw,
    }),
    params: found.params,
    url,
  });
  const text = await response.text();
  return { status: response.status, body: text && text.startsWith("{") ? JSON.parse(text) : null };
}

type Person = { identity_id: string; session_id: string; pair: CryptoKeyPair };

async function signedCall(who: Person, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: { "x-api-key": KEY_ID, "x-identity-session": who.session_id, "x-identity-time": String(time), "x-identity-sign": auth.bytesToBase64url(signature) },
  });
}

// A person whose first accepted phrase came out `daysAgo` UTC days ago, or never.
async function person(daysAgo: number | null): Promise<Person> {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const who = { ...created, pair };
  assertEquals((await signedCall(who, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  })).status, 204);
  if (daysAgo !== null) {
    await database.queryOrThrow(
      `INSERT INTO identity_stats (identity, first_published_at)
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date - $2::int)
       ON CONFLICT (identity) DO UPDATE SET first_published_at = EXCLUDED.first_published_at`,
      [created.identity_id, daysAgo],
    );
  }
  return who;
}

async function seedOffer(): Promise<{ id: string; code: string; advertiser: string }> {
  const advertiser = crypto.randomUUID();
  const venue = crypto.randomUUID();
  const offer = crypto.randomUUID();
  const code = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  await database.queryOrThrow(
    `INSERT INTO advertisers (id, email, contact, brand, email_confirmed_at) VALUES ($1, $2, 'c', 'alpha', now())`,
    [advertiser, `${advertiser}@example.test`],
  );
  await database.queryOrThrow(
    `INSERT INTO venues (id, advertiser_id, name, address, verification_status, verified_at)
       VALUES ($1, $2, 'Кофейня', 'Makariou 1', 'verified', now())`,
    [venue, advertiser],
  );
  await database.queryOrThrow(
    `INSERT INTO offers (id, brand, venue_id, offer_text, discount_value, external_url, redirect_code,
                         discount_until, status, expires_at)
       VALUES ($1, 'alpha', $2, 'второй кофе бесплатно', '1+1', 'https://cafe.example/', $3,
               now() + interval '7 days', 'active', now() + interval '4 hours')`,
    [offer, venue, code],
  );
  return { id: offer, code, advertiser };
}

const disabled = async (id: string) =>
  (await database.queryOrThrow<{ off: boolean }>(`SELECT redirect_disabled_at IS NOT NULL AS off FROM offers WHERE id = $1`, [id]))[0].off;

Deno.test({ name: "two counting reports from two people switch the link off; the rest wait for a moderator", ...pooled, fn: async () => {
  reset();
  const offer = await seedOffer();
  const fresh = await person(1); // yesterday: not long enough
  const never = await person(null);
  const first = await person(3);
  const second = await person(5);

  for (const who of [fresh, never]) {
    const answer = await signedCall(who, "POST", `/o/${offer.code}/report`);
    assertEquals(answer.status, 202);
  }
  assertEquals(await disabled(offer.id), false, "reports that do not count switch nothing off");

  assertEquals((await signedCall(first, "POST", `/o/${offer.code}/report`)).status, 202);
  assertEquals((await signedCall(first, "POST", `/o/${offer.code}/report`)).status, 202);
  assertEquals(await disabled(offer.id), false, "one person counts once, however often they report");

  assertEquals((await signedCall(second, "POST", `/o/${offer.code}/report`)).status, 202);
  assertEquals(await disabled(offer.id), true, "the second counting report switches the link off");
  assertEquals((await call("GET", `/o/${offer.code}/go`)).status, 410);
  const [row] = await database.queryOrThrow<{ status: string }>(`SELECT status FROM offers WHERE id = $1`, [offer.id]);
  assertEquals(row.status, "active", "the offer itself stays");

  const counted = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM offer_link_reports WHERE offer_id = $1`, [offer.id],
  );
  assertEquals(counted[0].n, 4);

  // Unsigned is refused; an unknown code is 404.
  assertEquals((await call("POST", `/o/${offer.code}/report`)).status, 401);
  assertEquals((await signedCall(first, "POST", `/o/nosuchcode00/report`)).status, 404);
} });

// The cabinet's own session, as POST /adv/session would leave it.
// deno-lint-ignore no-explicit-any -- JSON of many shapes, read field by field
async function cabinetOf(advertiser: string): Promise<(method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>> {
  const secret = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  await database.queryOrThrow(
    `INSERT INTO advertiser_sessions (session_hash, advertiser_id, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
    [await sha256hex(secret), advertiser],
  );
  return async (method, path, body) => {
    const url = new URL(`https://relay.test${path}`);
    const found = match(method, url.pathname);
    assert(found, `no route for ${method} ${url.pathname}`);
    const response = await found.h({
      req: new Request(url, {
        method,
        headers: {
          origin: "https://adv.alpha.test",
          cookie: `__Host-adv=${secret}`,
          "x-origin-token": "offer-report-origin-token",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      params: found.params,
      url,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

Deno.test({ name: "a complaint that the discount was not given: filed, counted once per person, three hide the offer, the venue answers once", ...pooled, fn: async () => {
  reset();
  const offer = await seedOffer();
  const complain = (who: Person, body: unknown) => signedCall(who, "POST", `/offers/${offer.id}/complaints`, body);
  const [a, b, c] = [await person(3), await person(4), await person(5)];
  const fresh = await person(1);

  // §10.2: no e-mail, no complaint.
  assertEquals((await complain(a, { text: "не дали" })).status, 422);
  assertEquals((await call("POST", `/offers/${offer.id}/complaints`, { body: { email: "x@example.test" } })).status, 401);

  const first = await complain(a, { email: "a@example.test", text: "скидку не дали" });
  assertEquals([first.status, first.body.counts_towards_autohide], [202, true]);
  const again = await complain(a, { email: "a@example.test", text: "и снова" });
  assertEquals([again.status, again.body.counts_towards_autohide], [202, false], "the same person counts once");
  const tooNew = await complain(fresh, { email: "f@example.test" });
  assertEquals([tooNew.status, tooNew.body.counts_towards_autohide], [202, false], "a day-old writer does not count");
  assertEquals((await complain(b, { email: "b@example.test" })).body.counts_towards_autohide, true);
  const status = async () =>
    (await database.queryOrThrow<{ status: string }>(`SELECT status FROM offers WHERE id = $1`, [offer.id]))[0].status;
  assertEquals(await status(), "active", "two counting complaints hide nothing");
  assertEquals((await complain(c, { email: "c@example.test" })).body.counts_towards_autohide, true);
  assertEquals(await status(), "hidden", "the third counting complaint from a third person hides the offer");

  // The cabinet reads them by text and date, and answers one of them once.
  const cabinet = await cabinetOf(offer.advertiser);
  const listed = await cabinet("GET", "/adv/complaints");
  assertEquals(listed.status, 200);
  assertEquals(listed.body.items.length, 5);
  for (const item of listed.body.items) {
    assertEquals(Object.keys(item).sort(), ["date", "id", "offer_id", "response", "status", "text"], "no complainant, address or time");
  }
  assertEquals((await cabinet("GET", "/adv/offers")).body.items.map((o: { complaints: number }) => o.complaints), [5]);
  const target = first.body.id as string;
  assertEquals((await cabinet("POST", `/adv/complaints/${target}/response`, { text: "условие было в тексте" })).status, 204);
  assertEquals((await cabinet("POST", `/adv/complaints/${target}/response`, { text: "передумали" })).status, 409,
    "one answer, never rewritten");
  const rival = await cabinetOf((await seedOffer()).advertiser);
  assertEquals((await rival("GET", "/adv/complaints")).body.items.length, 0);
  assertEquals((await rival("POST", `/adv/complaints/${target}/response`, { text: "чужой" })).status, 404);
} });
