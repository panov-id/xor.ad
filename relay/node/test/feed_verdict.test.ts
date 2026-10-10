// The first tier of §8.3 on the route: a phrase the rules find nothing in is
// published in the transaction that wrote it and answered 200 with its term; a
// phrase they flag waits for a person, 202, exactly as every phrase did before
// (P1, 2026-09-26). Both outcomes are read back from the rows and the
// counters, not from the answer alone.
//
// The node's default is `rules` — nothing sets FEED_VERDICT here, so the
// default is what the first cases run under; one case sets `queue` and puts it
// back.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "feed-verdict-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "feed-verdict-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "feed-verdict-vault-key");
Deno.env.delete("FEED_VERDICT");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const metrics = await import("../src/lib/metrics.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");
await import("../src/routes/profile.ts");
await import("../src/routes/feed_queue.ts");

const KEY_ID = "ak_pub_feedverdicttest001";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;

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
        "x-origin-token": "feed-verdict-origin-token",
        "x-client-ip": nextAddress(),
        ...(raw === undefined ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      body: raw,
    }),
    params: found.params,
    url,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

async function signedCall(key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: {
      "x-identity-session": sessionId,
      "x-identity-time": String(time),
      "x-identity-sign": auth.bytesToBase64url(signature),
    },
  });
}

async function author(age = 30) {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age,
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, "the registration failed");
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair, say: (over: Record<string, unknown> = {}) => signedCall(pair.privateKey, created.session_id, "POST", "/feed", phrase(over)) };
}

const phrase = (over: Record<string, unknown> = {}) => ({
  text: "гуляю у реки, если кто рядом",
  mode: "alone",
  lat: 41.9,
  lon: 12.5,
  area_radius: 1000,
  ...over,
});

interface Row { visible_at: Date | null; expires_at: Date | null }
const rowOf = async (id: string) =>
  (await database.queryOrThrow<Row>(`SELECT visible_at, expires_at FROM feed_messages WHERE id = $1`, [id]))[0];

const counter = (name: string, labels: string): number => {
  const line = metrics.render().split("\n").find((l) => l.startsWith(`${name}{${labels}}`));
  return line ? Number(line.split(" ").pop()) : 0;
};

Deno.test("a clean phrase is published in the request, with its term, under the default mode", async () => {
  assertEquals(Deno.env.get("FEED_VERDICT"), undefined);
  const me = await author();
  const before = {
    rules: counter("relay_feed_rules_total", 'result="published"'),
    queue: counter("relay_feed_verdict_total", 'verdict="published"'),
  };
  const sent = await me.say();
  assertEquals(sent.status, 200, JSON.stringify(sent.body));
  const answer = sent.body as { id: string; state: string; visible_at: number; expires_at: number };
  assertEquals(answer.state, "published");
  // Seconds, and the term is the phrase's span (feed.phrase.span, 4:20).
  assertEquals(answer.expires_at - answer.visible_at, 4 * 3600 + 20 * 60);

  const row = await rowOf(answer.id);
  assertNotEquals(row.visible_at, null, "the answer said published and the row is still waiting");
  assertEquals(Math.floor(row.visible_at!.getTime() / 1000), answer.visible_at);
  assertEquals(Math.floor(row.expires_at!.getTime() / 1000), answer.expires_at);

  // The moment went into the author's counters in the same transaction: the
  // hourly ceiling counts it (§8.3).
  const [stats] = await database.queryOrThrow<{ n: number; first: string | null }>(
    `SELECT cardinality(published_at_recent) AS n, first_published_at::text AS first
       FROM identity_stats WHERE identity = $1`,
    [me.identity_id],
  );
  assertEquals(stats.n, 1);
  assertNotEquals(stats.first, null);

  // Counted as the rules' publication, not the queue's: the alert on a queue
  // nobody decides reads the queue's counter.
  assertEquals(counter("relay_feed_rules_total", 'result="published"'), before.rules + 1);
  assertEquals(counter("relay_feed_verdict_total", 'verdict="published"'), before.queue);

  // And the slot is free: the next clean phrase is not held behind "still
  // being checked".
  const next = await me.say({ text: "а потом кофе" });
  assertEquals(next.status, 200, JSON.stringify(next.body));
});

Deno.test("the hourly ceiling counts what the rules published", async () => {
  const me = await author();
  for (const text of ["раз", "два", "три", "четыре"]) {
    assertEquals((await me.say({ text })).status, 200, text);
  }
  const fifth = await me.say({ text: "пять" });
  assertEquals(fifth.status, 429, JSON.stringify(fifth.body));
  assertEquals((fifth.body as { error: { code: string } }).error.code, "rate_limited");
});

Deno.test("with no model, a link, a contact or an offer is refused with the rules' reason, and nothing waits", async () => {
  // WP-4 (owner, 09.10.2026): nobody but the model reads a phrase. With the
  // model off, what the rules flag is refused with their reason — not left in
  // a queue nobody reads. An offer is flagged whole (a promo code is not a
  // shape a rule can tell), so with no model an offer does not go out.
  const flagged: Array<[Record<string, unknown>, string]> = [
    [{ text: "заходи на example.com/party" }, "link"],
    [{ text: "пиши @anyone_here" }, "contact"],
    [{ text: "звони +7 999 123-45-67" }, "contact"],
    [{ text: "две табуретки", discount_value: "50%" }, "offer"],
  ];
  for (const [over, reason] of flagged) {
    const me = await author();
    const before = counter("relay_feed_rules_total", `reason="${reason}",result="queued"`);
    const sent = await me.say(over);
    assertEquals(sent.status, 422, `${reason}: ${JSON.stringify(sent.body)}`);
    const error = (sent.body as { error: { code: string; message: string } }).error;
    assertEquals(error.code, "moderation_refused");
    assertEquals(error.message, `the phrase was not published: ${reason}`);
    assertEquals(counter("relay_feed_rules_total", `reason="${reason}",result="queued"`), before + 1, reason);
    const [left] = await database.queryOrThrow(
      `SELECT 1 FROM feed_messages WHERE author_identity = $1`, [me.identity_id],
    );
    assertEquals(left, undefined, `${reason}: a refused phrase stayed`);
  }
});

Deno.test("the same phrase again, while the first is up, is refused as a repeat, and the next one does not wait", async () => {
  const me = await author();
  assertEquals((await me.say({ text: "Продам табуретку" })).status, 200);
  const again = await me.say({ text: "продам   табуретку" });
  assertEquals(again.status, 422, JSON.stringify(again.body));
  assertEquals((again.body as { error: { message: string } }).error.message, "the phrase was not published: repeat");
  // Nothing holds the author's waiting slot: the next phrase goes on its own.
  assertEquals((await me.say({ text: "продам две табуретки" })).status, 200);
});

Deno.test("a clean new name passes the rules when it is changed, and a doubtful one is refused while the old name stands", async () => {
  // Clean: the rules read the name when it changes and it is the name at once
  // (WP-1, 2026-10-09) — it no longer waits for a phrase to carry it out.
  const me = await author();
  const renamed = await signedCall(me.pair.privateKey, me.session_id, "PATCH", "/identities/me", { name: "Оля" });
  assertEquals(renamed.status, 200, JSON.stringify(renamed.body));
  const sent = await me.say();
  assertEquals(sent.status, 200, JSON.stringify(sent.body));
  const [who] = await database.queryOrThrow<{ name: string; name_state: string; name_pending: string | null }>(
    `SELECT name, name_state, name_pending FROM identities WHERE id = $1`,
    [me.identity_id],
  );
  assertEquals([who.name, who.name_state, who.name_pending], ["Оля", "accepted", null]);

  // Doubtful: a name that is a handle is refused with the reason (WP-4); the
  // old name stands, nothing pending, and a phrase goes out under it.
  const other = await author();
  const refused = await signedCall(other.pair.privateKey, other.session_id, "PATCH", "/identities/me", { name: "@anyone" });
  assertEquals(refused.status, 422, JSON.stringify(refused.body));
  assertEquals((refused.body as { error: { code: string } }).error.code, "name_refused");
  assertEquals((await other.say()).status, 200);
  const [still] = await database.queryOrThrow<{ name: string; name_state: string; name_pending: string | null }>(
    `SELECT name, name_state, name_pending FROM identities WHERE id = $1`,
    [other.identity_id],
  );
  assertEquals([still.name, still.name_state, still.name_pending], ["Аня", "accepted", null]);
});

Deno.test("under FEED_VERDICT=queue every phrase waits, as before", async () => {
  Deno.env.set("FEED_VERDICT", "queue");
  try {
    const me = await author();
    const sent = await me.say();
    assertEquals(sent.status, 202, JSON.stringify(sent.body));
    assertEquals((sent.body as { state: string }).state, "checking");
    assertEquals((await rowOf((sent.body as { id: string }).id)).visible_at, null);
  } finally {
    Deno.env.delete("FEED_VERDICT");
  }
});
