// A lost beyond the feed card (routes/lost.ts, db/090; LOST_SPOTS §2, §4, §5):
// marks "I saw it", the public page /l/<id>, the complaint that takes a lost
// down by count. No model here (MODERATOR_URL unset): the rules judge a note
// as they judge a phrase, so a clean line is kept and a phone number is not.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "lost-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "lost-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "lost-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { reset, LOST_PAGE_LIMITS, LOST_ANON_REFUSALS } = await import("../src/lib/rate_limit.ts");
const lostRoutes = await import("../src/routes/lost.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");

const KEY_ID = "ak_pub_losttest0000000001";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA') ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`, [KEY_ID],
);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;

type Answer = { status: number; body: Record<string, unknown> | null; headers: Headers };

async function call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Answer> {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "lost-origin-token",
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
  return { status: response.status, body: text && text.startsWith("{") ? JSON.parse(text) : null, headers: response.headers };
}

type Person = { identity_id: string; session_id: string; pair: CryptoKeyPair };

async function signed(who: Person, method: string, path: string, body?: unknown): Promise<Answer> {
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

// A person; with `daysAgo`, one whose first accepted phrase came out that many
// UTC days ago (what makes a complaint count, as in offer_report.test.ts).
async function person(daysAgo: number | null = null): Promise<Person> {
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
  const who = { ...(answer.body as { identity_id: string; session_id: string }), pair };
  assertEquals((await signed(who, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  })).status, 204);
  if (daysAgo !== null) {
    await database.queryOrThrow(
      `INSERT INTO identity_stats (identity, first_published_at)
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date - $2::int)
       ON CONFLICT (identity) DO UPDATE SET first_published_at = EXCLUDED.first_published_at`,
      [who.identity_id, daysAgo],
    );
  }
  return who;
}

const body = (over: Record<string, unknown> = {}) => ({
  text: "потерял ключи у реки, синий брелок", mode: "alone", lat: 41.9, lon: 12.5, area_radius: 1000, kind: "lost", ...over,
});

async function sendLost(who: Person, over: Record<string, unknown> = {}): Promise<string> {
  const sent = await signed(who, "POST", "/feed", body(over));
  assertEquals(sent.status, 200, `the lost was not published: ${JSON.stringify(sent.body)}`);
  return (sent.body as { id: string }).id;
}
async function sendPhrase(who: Person): Promise<string> {
  const sent = await signed(who, "POST", "/feed", body({ kind: undefined, text: "гуляю у реки, если кто рядом" }));
  assertEquals(sent.status, 200, `the phrase was not published: ${JSON.stringify(sent.body)}`);
  return (sent.body as { id: string }).id;
}

const mark = (who: Person, id: string, where = "у ларька на углу, под лавкой", when = "15m") =>
  signed(who, "POST", `/feed/${id}/seen`, { where, when });
const marks = (who: Person, id: string) => signed(who, "GET", `/feed/${id}/seen`);
const complain = (who: Person, id: string) => signed(who, "POST", `/feed/${id}/complaints`);
const page = (id: string, ip = nextAddress()) => call("GET", `/l/${id}`, { headers: { "x-client-ip": ip } });
// A visitor not signed in: one address and browser, so one daily key; `as`
// names a different one (another address, another browser, another language).
type Visitor = { ip: string; ua: string; lang: string };
const visitor = (over: Partial<Visitor> = {}): Visitor => ({ ip: nextAddress(), ua: "Mozilla/5.0 (Android 14; Mobile) Firefox/130", lang: "ru", ...over });
const markAnon = (v: Visitor, id: string, where = "у ларька на углу, под лавкой", when = "15m") =>
  call("POST", `/l/${id}/seen`, { body: { where, when }, headers: { "x-client-ip": v.ip, "user-agent": v.ua, "accept-language": v.lang } });
const anonHashes = async (id: string) =>
  (await database.queryOrThrow<{ anon_hash: string | null; author_identity: string | null }>(
    `SELECT anon_hash, author_identity FROM lost_seen_marks WHERE lost_id = $1 ORDER BY created_at`, [id]));
const isLive = async (id: string) => {
  const [row] = await database.queryOrThrow<{ live: boolean }>(`SELECT expires_at > now() AS live FROM feed_messages WHERE id = $1`, [id]);
  return row.live;
};
const marksOf = async (id: string) => {
  const [{ n }] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM lost_seen_marks WHERE lost_id = $1`, [id]);
  return n;
};

// The pool keeps its connection open across tests (test/batch_counts.test.ts).
const pooled = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ ...pooled, name: "a new User-Agent per request does not get past the address limit on anonymous marks", fn: async () => {
  reset();
  const ip = nextAddress();
  const id = crypto.randomUUID();
  const codes: number[] = [];
  for (let n = 0; n < 31; n++) codes.push((await markAnon({ ip, ua: `ua-${n}`, lang: "ru" }, id)).status);
  assertEquals(codes.slice(0, 30).includes(429), false);
  assertEquals(codes[30], 429);
} });

Deno.test({ ...pooled, name: "addresses inside one IPv6 /64 share the address limit on anonymous marks", fn: async () => {
  reset();
  const id = crypto.randomUUID();
  const net = `2001:db8:${(++addresses).toString(16)}:1`;
  const codes: number[] = [];
  for (let n = 0; n < 31; n++) codes.push((await markAnon({ ip: `${net}::${(n + 1).toString(16)}`, ua: `ua-${n}`, lang: "ru" }, id)).status);
  assertEquals(codes.slice(0, 30).includes(429), false);
  assertEquals(codes[30], 429, `the 31st mark from one /64: ${codes.join(",")}`);
} });

Deno.test({ ...pooled, name: "one notice takes at most 100 anonymous marks a day, and the refusal comes before the model", fn: async () => {
  reset();
  const owner = await person();
  const id = await sendLost(owner);
  await database.queryOrThrow(
    `INSERT INTO lost_seen_marks (id, lost_id, anon_hash, where_text, when_step)
       SELECT gen_random_uuid(), $1, md5(n::text) || md5(n::text), 'у ларька', '15m' FROM generate_series(1, 100) n`, [id]);
  const full = await markAnon(visitor(), id);
  assertEquals(full.status, 429, `mark 101: ${JSON.stringify(full.body)}`);
  assertEquals(await marksOf(id), 100);
} });

// ── marks ────────────────────────────────────────────────────────────────────

Deno.test({ ...pooled, name: "a neighbour marks a live lost with where (words) and when (a step); the author reads it whole, a stranger only that it exists" }, async () => {
  reset();
  const owner = await person();
  const seer = await person();
  const stranger = await person();
  const id = await sendLost(owner);

  const made = await mark(seer, id, "у ларька на углу, под лавкой", "15m");
  assertEquals(made.status, 200, JSON.stringify(made.body));
  assertEquals(made.body!.lost_id, id);
  assertEquals(made.body!.when, "15m");

  const whole = await marks(owner, id);
  assertEquals(whole.status, 200, JSON.stringify(whole.body));
  assertEquals(whole.body!.mine, true);
  const own = whole.body!.items as Array<Record<string, unknown>>;
  assertEquals(own.length, 1);
  assertEquals(own[0].where, "у ларька на углу, под лавкой");
  assertEquals(own[0].when, "15m");
  assertEquals(own[0].dim, false);
  assert(!JSON.stringify(whole.body).includes(seer.identity_id), "a mark names its author to the lost's owner");

  const dots = await marks(stranger, id);
  assertEquals(dots.status, 200, JSON.stringify(dots.body));
  assertEquals(dots.body!.mine, false);
  const seen = dots.body!.items as Array<Record<string, unknown>>;
  assertEquals(seen.length, 1, "a stranger does not see that a mark exists");
  assertEquals(seen[0].when, "15m");
  assert(!("where" in seen[0]), `a stranger reads where: ${JSON.stringify(seen[0])}`);
  assert(!JSON.stringify(dots.body).includes("ларька"), "the where leaked to a stranger");
});

Deno.test({ ...pooled, name: "a mark passes the verdict as a phrase does: a phone number is refused with the reason, nothing kept" }, async () => {
  const owner = await person();
  const seer = await person();
  const id = await sendLost(owner);
  const refused = await mark(seer, id, "видел, звони +357 99 123456", "now");
  assertEquals(refused.status, 422, `a note with a phone was kept: ${JSON.stringify(refused.body)}`);
  const message = (refused.body!.error as { message: string }).message;
  assert(message.includes("note"), `the reason does not name a note: ${message}`);
  assertEquals(await marksOf(id), 0, "a refused note was written");
});

Deno.test({ ...pooled, name: "a mark's body: where in words and when one of four steps, no coordinates; a person marks one lost three times at most" }, async () => {
  const owner = await person();
  const seer = await person();
  const id = await sendLost(owner);
  for (const [sent, why] of [
    [{ where: "у реки", when: "yesterday" }, "a step nobody named"],
    [{ where: "у реки", when: 15 }, "a number for a step"],
    [{ where: "", when: "now" }, "an empty where"],
    [{ where: "у".repeat(lostRoutes.WHERE_MAX_GRAPHEMES + 1), when: "now" }, "a where over the limit"],
    [{ where: "у реки​", when: "now" }, "an invisible character"],
    [{ lat: 41.9, lon: 12.5, when: "now" }, "coordinates instead of words"],
  ] as const) {
    const answer = await signed(seer, "POST", `/feed/${id}/seen`, sent);
    assertEquals(answer.status, 400, `${why} was taken: ${JSON.stringify(answer.body)}`);
  }
  assertEquals(await marksOf(id), 0, "a refused body was written");
  for (let n = 1; n <= lostRoutes.MARKS_PER_PERSON; n++) {
    assertEquals((await mark(seer, id, `место ${n}`)).status, 200, `mark ${n} of ${lostRoutes.MARKS_PER_PERSON}`);
  }
  const over = await mark(seer, id);
  assertEquals(over.status, 409, `mark ${lostRoutes.MARKS_PER_PERSON + 1} by one person was taken: ${JSON.stringify(over.body)}`);
  assertEquals(await marksOf(id), lostRoutes.MARKS_PER_PERSON);
});

Deno.test({ ...pooled, name: "a stranger's probe: a phrase, an expired lost, an unknown id and a junk id are all 'no such phrase'; one's own is refused" }, async () => {
  const owner = await person();
  const seer = await person();
  const id = await sendLost(owner);
  const phraseId = await sendPhrase(owner);
  const expired = await sendLost(await person());
  await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [expired]);

  for (const [target, what] of [[phraseId, "a phrase"], [expired, "an expired lost"], [crypto.randomUUID(), "an unknown id"], ["not-an-id", "junk"]] as const) {
    for (const [verb, answer] of [["mark", await mark(seer, target)], ["read", await marks(seer, target)]] as const) {
      assertEquals(answer.status, 404, `${verb} on ${what}: ${JSON.stringify(answer.body)}`);
      assertEquals((answer.body!.error as { message: string }).message, "no such phrase", `${verb} on ${what} says more than the extend does`);
    }
  }
  const own = await mark(owner, id);
  assertEquals(own.status, 409, `the author marked their own lost: ${JSON.stringify(own.body)}`);
});

Deno.test({ ...pooled, name: "a mark dims after three days, and the author still reads the marks of a found" }, async () => {
  const owner = await person();
  const seer = await person();
  const id = await sendLost(owner);
  assertEquals((await mark(seer, id)).status, 200);
  await database.queryOrThrow(
    `UPDATE lost_seen_marks SET created_at = now() - interval '3 days 1 minute' WHERE lost_id = $1`, [id],
  );
  const aged = await marks(owner, id);
  assertEquals((aged.body!.items as Array<{ dim: boolean }>)[0].dim, true, "a three-day-old mark is still bright");
  assertEquals((await signed(owner, "POST", `/feed/${id}/found`)).status, 200);
  const afterFound = await marks(owner, id);
  assertEquals(afterFound.status, 200, `the author lost the marks on finding: ${JSON.stringify(afterFound.body)}`);
  assertEquals(afterFound.body!.kind, "found");
  // But a found takes no new mark: it is not lost any more.
  assertEquals((await mark(await person(), id)).status, 404);
});

// ── the public page ──────────────────────────────────────────────────────────

Deno.test({ ...pooled, name: "GET /l/:id without a key: live with the text and the count of marks, found after /found, gone after the term — and no author data" }, async () => {
  reset();
  const owner = await person();
  const id = await sendLost(owner);
  assertEquals((await mark(await person(), id)).status, 200);

  const live = await page(id);
  assertEquals(live.status, 200, JSON.stringify(live.body));
  assertEquals(live.body!.state, "live");
  assertEquals(live.body!.text, "потерял ключи у реки, синий брелок");
  assertEquals(live.body!.marks, 1);
  assertEquals(live.headers.get("cache-control"), "no-store");
  const printed = JSON.stringify(live.body);
  for (const secret of [owner.identity_id, owner.session_id, "Аня", "author", "age", "lat", "lon"]) {
    assert(!printed.includes(secret), `the public page carries ${secret}: ${printed}`);
  }

  assertEquals((await signed(owner, "POST", `/feed/${id}/found`)).status, 200);
  const found = await page(id);
  assertEquals(found.body!.state, "found", JSON.stringify(found.body));
  assert(!("text" in found.body!), "a found page still prints the text");

  await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);
  assertEquals((await page(id)).body!.state, "gone");
});

Deno.test({ ...pooled, name: "GET /l/:id: an unknown id and a phrase answer gone as an expired lost does; junk is 404" }, async () => {
  const phraseId = await sendPhrase(await person());
  const unknown = await page(crypto.randomUUID());
  assertEquals(unknown.status, 200);
  assertEquals(unknown.body!.state, "gone");
  assertEquals((await page(phraseId)).body!.state, "gone", "a phrase has a public page");
  assertEquals((await page("not-an-id")).status, 404);
});

Deno.test({ ...pooled, name: "GET /l/:id is rate limited by address as /o/:code is" }, async () => {
  reset();
  const id = await sendLost(await person());
  const ip = "198.51.100.77";
  const ceiling = Math.min(...LOST_PAGE_LIMITS.map((limit) => limit.max));
  for (let i = 0; i < ceiling; i++) assertEquals((await page(id, ip)).status, 200, `page ${i + 1} of ${ceiling}`);
  const over = await page(id, ip);
  assertEquals(over.status, 429, `the ${ceiling + 1}th page from one address was served`);
  assert(over.headers.get("retry-after"), "429 without retry-after");
  // Another address is not in that bucket.
  assertEquals((await page(id, "198.51.100.78")).status, 200);
  reset();
});

// ── complaints ───────────────────────────────────────────────────────────────

Deno.test({ ...pooled, name: "three counting complaints from different people end a lost; a newcomer's and a repeat do not count; every answer is 202" }, async () => {
  reset();
  const owner = await person(10);
  const id = await sendLost(owner);
  const newcomer = await person(null);
  const today = await person(0);
  const [a, b, c] = [await person(10), await person(10), await person(10)];

  for (const [who, why] of [[newcomer, "never published"], [today, "published today"], [owner, "the author"]] as const) {
    const answer = await complain(who, id);
    assertEquals(answer.status, 202, `${why}: ${JSON.stringify(answer.body)}`);
    assertEquals(answer.body!.state, "received");
  }
  assertEquals((await complain(a, id)).status, 202);
  assertEquals((await complain(a, id)).status, 202, "a repeat is not 202");
  assertEquals((await complain(b, id)).status, 202);
  assertEquals(await isLive(id), true, "two counting complaints (and a repeat) ended the lost");
  const [{ n }] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM lost_complaints WHERE lost_id = $1 AND counts`, [id]);
  assertEquals(n, 2, "a newcomer's, today's or a repeat complaint counted");

  const third = await complain(c, id);
  assertEquals(third.status, 202, "the third complaint answers differently: a complainant learns it was theirs");
  assertEquals(await isLive(id), false, "the third counting complaint did not end the lost");
  // Ended means gone from the public page and from the author's hands alike.
  assertEquals((await page(id)).body!.state, "gone");
  assertEquals((await signed(owner, "POST", `/feed/${id}/extend`)).status, 404);
});

Deno.test({ ...pooled, name: "a complaint on an unknown id, a phrase or an expired lost is 202 too, and writes nothing" }, async () => {
  const who = await person(10);
  const phraseId = await sendPhrase(await person());
  const expired = await sendLost(await person());
  await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [expired]);
  for (const target of [crypto.randomUUID(), phraseId, expired]) {
    assertEquals((await complain(who, target)).status, 202);
  }
  assertEquals((await complain(who, "junk")).status, 404);
  const [{ n }] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM lost_complaints WHERE user_id = $1`, [who.identity_id]);
  assertEquals(n, 0, "a complaint on something that is not a live lost was written");
});

Deno.test({ ...pooled, name: "a taken-down lost does not come straight back: the author's next one waits" }, async () => {
  const owner = await person();
  const id = await sendLost(owner);
  for (let i = 0; i < 3; i++) assertEquals((await complain(await person(10), id)).status, 202);
  assertEquals(await isLive(id), false, "the third counting complaint did not end the lost");
  const again = await signed(owner, "POST", "/feed", body());
  assertEquals(again.status, 409, "the author reposted a taken-down lost at once");
  assert(typeof (again.body as { error: { until?: number } }).error.until === "number", "the refusal does not say until when");
  const me = (await signed(owner, "GET", "/identities/me")).body as unknown as { phrases: Array<{ kind?: string }> };
  assert(me.phrases.every((p) => p.kind), "the profile does not say each row's kind");
});

Deno.test({ ...pooled, name: "a neighbour the author blocked can neither mark nor count against the lost" }, async () => {
  const owner = await person();
  const id = await sendLost(owner);
  const blocked = await person(10);
  await database.queryOrThrow(`INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [owner.identity_id, blocked.identity_id]);
  assertEquals((await mark(blocked, id)).status, 404, "a blocked neighbour left a mark");
  assertEquals((await complain(blocked, id)).status, 202);
  const [{ n }] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM lost_complaints WHERE lost_id = $1`, [id]);
  assertEquals(n, 0, "a blocked neighbour's complaint was written");
});

// ── the mark from somebody not signed in (POST /l/:id/seen; db/091) ──────────

Deno.test({ ...pooled, name: "a visitor with no key marks a live lost from its page; the author reads it as any mark, the page counts it, and no address or browser is stored" }, async () => {
  reset();
  const owner = await person();
  const neighbour = await person();
  const id = await sendLost(owner);
  const v = visitor();
  const marked = await markAnon(v, id, "у входа в метро, на скамейке", "1h");
  assertEquals(marked.status, 200, JSON.stringify(marked.body));
  assertEquals(marked.headers.get("cache-control"), "no-store");
  assertEquals((await mark(neighbour, id)).status, 200);

  const list = await marks(owner, id);
  assertEquals(list.status, 200);
  const items = (list.body as { items: Array<{ where?: string; when: string }> }).items;
  assertEquals(items.map((i) => [i.where, i.when]).sort(), [["у входа в метро, на скамейке", "1h"], ["у ларька на углу, под лавкой", "15m"]].sort(),
    "the author's list does not show the anonymous mark as any mark");
  assertEquals((await page(id)).body?.marks, 2, "the page does not count the anonymous mark");

  const rows = await anonHashes(id);
  const anon = rows.find((r) => r.author_identity === null);
  assert(anon?.anon_hash && /^[0-9a-f]{64}$/.test(anon.anon_hash), `the anonymous row has no hash: ${JSON.stringify(rows)}`);
  const [{ raw }] = await database.queryOrThrow<{ raw: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM lost_seen_marks WHERE lost_id = $1
        AND (where_text LIKE '%' || $2 || '%' OR anon_hash LIKE '%' || $2 || '%' OR anon_hash LIKE '%Firefox%')) AS raw`, [id, v.ip]);
  assertEquals(raw, false, "the raw address or browser reached the table");
  reset();
});

Deno.test({ ...pooled, name: "an anonymous mark is judged as a signed one: a phone number is refused with the reason, and the third refusal closes the marks for a day by the daily key — the page stays open, another browser is another key" }, async () => {
  reset();
  const owner = await person();
  const id = await sendLost(owner);
  const v = visitor();
  for (let i = 0; i < 3; i++) {
    const refused = await markAnon(v, id, `звоните +357 99 12345${i}`);
    assertEquals(refused.status, 422, `refusal ${i + 1}: ${JSON.stringify(refused.body)}`);
    assert(String((refused.body as { error: { message: string } }).error.message).length > 0, "a refusal with no reason");
  }
  const blocked = await markAnon(v, id);
  assertEquals(blocked.status, 429, `a clean mark after three refusals was not blocked: ${JSON.stringify(blocked.body)}`);
  const retry = Number(blocked.headers.get("retry-after"));
  assert(retry > 23 * 3600 && retry <= 24 * 3600, `the block is not a day: retry-after ${retry}`);
  assertEquals(LOST_ANON_REFUSALS.windowMs, 24 * 60 * 60 * 1000);
  assertEquals(LOST_ANON_REFUSALS.max, 3);
  assertEquals((await page(id, v.ip)).body?.state, "live", "the page closed with the marks");
  assertEquals((await markAnon(visitor({ ip: v.ip, ua: "Mozilla/5.0 (X11; Linux) Chrome/130", lang: v.lang }), id)).status, 200, "another browser on the same address shares the block");
  assertEquals(await marksOf(id), 1, "a refused note was kept");
  reset();
});

Deno.test({ ...pooled, name: "one daily key marks one notice three times at most, in the INSERT itself; another key on the same notice starts at zero" }, async () => {
  reset();
  const owner = await person();
  const id = await sendLost(owner);
  const v = visitor({ ip: "2001:db8:1:2:aaaa:bbbb:cccc:dddd" });
  for (let i = 0; i < 3; i++) assertEquals((await markAnon(v, id, `видел тут ${i + 1}`)).status, 200);
  const fourth = await markAnon(v, id, "и ещё раз");
  assertEquals(fourth.status, 409, JSON.stringify(fourth.body));
  assertEquals((fourth.body as { error: { marks?: number } }).error.marks, 3, JSON.stringify(fourth.body));
  // The same /64 with another interface id is the same household, the same key.
  const sameHome = await markAnon(visitor({ ip: "2001:db8:1:2:1111:2222:3333:4444", ua: v.ua, lang: v.lang }), id);
  assertEquals(sameHome.status, 409, `another interface id in the same /64 got a fresh ceiling: ${JSON.stringify(sameHome.body)}`);
  assertEquals((await markAnon(visitor({ ip: "2001:db8:1:3::1", ua: v.ua, lang: v.lang }), id)).status, 200, "a neighbouring /64 shares the ceiling");
  const keys = new Set((await anonHashes(id)).map((r) => r.anon_hash));
  assertEquals(keys.size, 2, "the two households did not make two keys");
  // The INSERT counts, not the read before it: a row slipped in between is still counted.
  const [{ n }] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM lost_seen_marks WHERE lost_id = $1`, [id]);
  assertEquals(n, 4);
  reset();
});

Deno.test({ ...pooled, name: "an anonymous mark on a phrase, an expired lost, an unknown id or junk is 'no such page' and writes nothing; its body is read as a signed one" }, async () => {
  reset();
  const owner = await person();
  const phrase = await sendPhrase(owner);
  const expired = await sendLost(owner);
  await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [expired]);
  for (const target of [phrase, expired, crypto.randomUUID()]) {
    const r = await markAnon(visitor(), target);
    assertEquals(r.status, 404, `${target}: ${JSON.stringify(r.body)}`);
    assertEquals((r.body as { error: { message: string } }).error.message, "no such page");
  }
  assertEquals((await markAnon(visitor(), "not-an-id")).status, 404);
  assertEquals(await marksOf(phrase) + await marksOf(expired), 0, "a miss wrote a mark");
  const live = await sendLost(await person());
  assertEquals((await markAnon(visitor(), live, "", "now")).status, 400);
  assertEquals((await markAnon(visitor(), live, "у реки", "tomorrow")).status, 400);
  assertEquals((await markAnon(visitor(), live, "x".repeat(141), "now")).status, 400);
  reset();
});

Deno.test({ ...pooled, name: "a hash older than a day is cleared when the next anonymous mark is written; the mark itself stays" }, async () => {
  reset();
  const owner = await person();
  const id = await sendLost(owner);
  const v = visitor();
  assertEquals((await markAnon(v, id)).status, 200);
  await database.queryOrThrow(`UPDATE lost_seen_marks SET created_at = now() - interval '25 hours' WHERE lost_id = $1`, [id]);
  for (let i = 0; i < 3; i++) assertEquals((await markAnon(v, id, `снова ${i}`)).status, 200, "yesterday's marks still count against today's ceiling");
  const rows = await anonHashes(id);
  assertEquals(rows.length, 4);
  assertEquals(rows[0].anon_hash, null, "yesterday's hash was kept past the day");
  assertEquals(rows.slice(1).every((r) => r.anon_hash !== null), true);
  reset();
});
