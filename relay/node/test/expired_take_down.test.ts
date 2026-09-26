// What a take-down leaves alone, on the routes themselves, and a count that
// waits for COMMIT (B77, 2026-09-26).
//
// chat_RU.md:874 — "taking down what is live does not touch what expired": a
// close and a time away take down one's live phrases and the likes on live
// phrases; an expired phrase and the likes on it are the minute's sweep's
// (sweepExpiredPhrases), as for everybody. The observer marked this uncovered
// on the routes (B66): the stress case drives takeDownLive() directly.
//
// And relay_profile_patch_total, counted once the edit commits (B68): no case
// held it at all.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("SESSION_SECRET", "expired-take-down-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "expired-take-down-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "expired-take-down-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { render } = await import("../src/lib/metrics.ts");
const { sweepExpiredPhrases } = await import("../src/lib/feed_verdict.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/profile.ts");
await import("../src/routes/away.ts");

const KEY_ID = "ak_pub_expiredtakedown001";
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
        "x-origin-token": "expired-take-down-origin-token",
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function signedCall(key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target),
    await auth.sha256hex(raw), time);
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

// A finished registration, with the PIN's proof kept: a close asks for it.
async function person() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const pin = crypto.getRandomValues(new Uint8Array(32));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(pin),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair, pin };
}
type Person = Awaited<ReturnType<typeof person>>;

const nonce = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));

async function phrase(author: string, expired: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'alpha', $2, 'фраза', 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now() - interval '4 hours',
             CASE WHEN $3 THEN now() - interval '1 minute' ELSE now() + interval '3 hours' END)`,
    [id, author, expired],
  );
  return id;
}

// A like as likes.ts writes it: the row, the phrase's count, both counters.
async function like(liker: string, phraseId: string, author: string): Promise<void> {
  await database.transaction(async (run) => {
    await run(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [liker, phraseId]);
    await run(`UPDATE feed_messages SET like_count = like_count + 1 WHERE id = $1`, [phraseId]);
    await run(`UPDATE identity_stats SET likes_received = likes_received + 1 WHERE identity = $1`, [author]);
    await run(`UPDATE identity_stats SET likes_given = likes_given + 1 WHERE identity = $1`, [liker]);
  });
}

const exists = async (id: string) =>
  (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id])).length === 1;
const liked = async (liker: string, id: string) =>
  (await database.queryOrThrow(`SELECT 1 FROM likes WHERE liker_identity = $1 AND feed_message_id = $2`,
    [liker, id])).length === 1;
const likeCount = async (id: string) => Number((await database.queryOrThrow<{ n: number }>(
  `SELECT like_count AS n FROM feed_messages WHERE id = $1`, [id]))[0].n);

// Four phrases, four likes: mine and theirs, live and expired, each liked by
// the other side.
async function scene() {
  const me = await person();
  const other = await person();
  const mine = { live: await phrase(me.identity_id, false), expired: await phrase(me.identity_id, true) };
  const theirs = { live: await phrase(other.identity_id, false), expired: await phrase(other.identity_id, true) };
  await like(other.identity_id, mine.live, me.identity_id);
  await like(other.identity_id, mine.expired, me.identity_id);
  await like(me.identity_id, theirs.live, other.identity_id);
  await like(me.identity_id, theirs.expired, other.identity_id);
  return { me, other, mine, theirs };
}

async function leftAlone(s: Awaited<ReturnType<typeof scene>>, how: string) {
  // What is live went — the positive control: without it, a route that took
  // nothing down would pass every line below.
  assertEquals(await exists(s.mine.live), false, `${how}: my live phrase stayed up`);
  assertEquals(await liked(s.me.identity_id, s.theirs.live), false, `${how}: my like on a live phrase stayed`);
  // What expired stayed for the sweep.
  assert(await exists(s.mine.expired), `${how} took my expired phrase down`);
  assert(await liked(s.other.identity_id, s.mine.expired), `${how} took the like on my expired phrase`);
  assert(await liked(s.me.identity_id, s.theirs.expired), `${how} took my like on an expired phrase`);
  assertEquals(await likeCount(s.theirs.expired), 1, `${how} moved the count of an expired phrase I liked`);
  assertEquals(await likeCount(s.mine.expired), 1, `${how} moved the count of my expired phrase`);
  // And the sweep takes it, likes and all: left alone, not stranded.
  await sweepExpiredPhrases();
  assertEquals(await exists(s.mine.expired), false, `after ${how}, the sweep left my expired phrase`);
  assertEquals(await exists(s.theirs.expired), false, `after ${how}, the sweep left the expired phrase I liked`);
  assertEquals(await liked(s.other.identity_id, s.mine.expired), false, `after ${how}, a like outlived its expired phrase`);
}

Deno.test({ name: "a close takes down what is live and leaves what expired to the sweep", sanitizeOps: false, sanitizeResources: false }, async () => {
  const s = await scene();
  const closed = await signedCall(s.me.pair.privateKey, s.me.session_id, "POST", "/identities/close",
    { nonce: nonce(), auth: auth.bytesToBase64url(s.me.pin) });
  assertEquals(closed.status, 200, `the close answered ${closed.status}: ${JSON.stringify(closed.body)}`);
  await leftAlone(s, "the close");
});

Deno.test({ name: "a time away takes down what is live and leaves what expired to the sweep", sanitizeOps: false, sanitizeResources: false }, async () => {
  const s = await scene();
  const away = await signedCall(s.me.pair.privateKey, s.me.session_id, "POST", "/away", { span: "short", nonce: nonce() });
  assertEquals(away.status, 200, `the time away answered ${away.status}: ${JSON.stringify(away.body)}`);
  await leftAlone(s, "the time away");
});

// relay_profile_patch_total, counted after COMMIT (B68). A deferred trigger
// made for the case refuses the edit at COMMIT, in this throwaway database
// only: the edit did not happen and must not be counted.
const patched = () => Number(render().match(/relay_profile_patch_total\{result="applied"\} (\d+)/)?.[1] ?? 0);

Deno.test({ name: "a profile edit is counted once it commits, and one refused at COMMIT is not", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me: Person = await person();
  const before = patched();
  const done = await signedCall(me.pair.privateKey, me.session_id, "PATCH", "/identities/me", { age: 31 });
  assertEquals(done.status, 200, `the edit answered ${done.status}: ${JSON.stringify(done.body)}`);
  assertEquals(patched() - before, 1, "a committed profile edit was counted other than once");

  await database.queryOrThrow(
    `CREATE OR REPLACE FUNCTION b77_refuse() RETURNS trigger LANGUAGE plpgsql
       AS $$ BEGIN RAISE EXCEPTION 'b77: refused on cue'; END $$`);
  await database.queryOrThrow(
    `CREATE CONSTRAINT TRIGGER b77_refuse_commit AFTER UPDATE ON identities
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
       WHEN (NEW.id = '${me.identity_id}' AND NEW.age = 32)
       EXECUTE FUNCTION b77_refuse()`);
  try {
    const middle = patched();
    // Answered 503, as a write the database would not take (B90); it was let
    // out as a 500 before.
    const refused = await signedCall(me.pair.privateKey, me.session_id, "PATCH", "/identities/me", { age: 32 })
      .then((r) => `answered ${r.status} ${JSON.stringify(r.body)}`, (e) => `thrown ${e}`);
    assert(refused.startsWith("answered 503"), `the edit refused at COMMIT was not answered 503: ${refused}`);
    const [row] = await database.queryOrThrow<{ age: number }>(`SELECT age FROM identities WHERE id = $1`, [me.identity_id]);
    assertEquals(row.age, 31, "the refused edit reached the table");
    assertEquals(patched() - middle, 0, "a profile edit refused at COMMIT was counted in relay_profile_patch_total");
  } finally {
    await database.queryOrThrow(`DROP TRIGGER IF EXISTS b77_refuse_commit ON identities`);
    await database.queryOrThrow(`DROP FUNCTION IF EXISTS b77_refuse()`);
  }
});

// The age filters have an age's bounds (B98): past 2^31 one reached the integer
// column and came back a 503.
Deno.test({ name: "an age filter outside an age's bounds is refused 400, and one inside is taken (B98)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me: Person = await person();
  for (const [k, v] of [["filter_age_min", 2 ** 31], ["filter_age_max", 2 ** 31], ["filter_age_min", 12], ["filter_age_max", 151]] as const) {
    const answer = await signedCall(me.pair.privateKey, me.session_id, "PATCH", "/identities/me", { [k]: v });
    assertEquals(answer.status, 400, `${k} = ${v} answered ${answer.status} ${JSON.stringify(answer.body)}`);
    assertEquals((answer.body as { error?: { code?: string } })?.error?.code, "invalid_body", `${k} = ${v} was not invalid_body`);
  }
  // Inside the person's own band (30 is in 21+): the upper bound itself is taken.
  const taken = await signedCall(me.pair.privateKey, me.session_id, "PATCH", "/identities/me", { filter_age_min: 30, filter_age_max: 150 });
  assertEquals(taken.status, 200, `the upper bound itself was refused: ${JSON.stringify(taken.body)}`);
});

// A database error answered 503 is logged as the route's, scrubbed of
// addresses as dispatch scrubs its own line (B98); an error of the code is not
// the database's and goes on to dispatch.
Deno.test({ name: "a profile edit the database refuses is logged by route with no address in it (B98)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { fromTheDatabase } = await import("../src/routes/profile.ts");
  const real = await database.queryOrThrow(`SELECT 1 / 0`).then(() => null, (e) => e);
  assert(fromTheDatabase(real), `a real database error was not taken for one: ${real}`);
  assertEquals(fromTheDatabase(new TypeError("x is undefined")), false, "a fault of the code was taken for the database's");
  assertEquals(fromTheDatabase(null), false, "null was taken for the database's error");

  const me: Person = await person();
  await database.queryOrThrow(
    `CREATE OR REPLACE FUNCTION b98_refuse() RETURNS trigger LANGUAGE plpgsql
       AS $$ BEGIN RAISE EXCEPTION 'b98: refused for someone@example.org'; END $$`);
  await database.queryOrThrow(
    `CREATE CONSTRAINT TRIGGER b98_refuse_commit AFTER UPDATE ON identities
       DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
       WHEN (NEW.id = '${me.identity_id}' AND NEW.age = 33)
       EXECUTE FUNCTION b98_refuse()`);
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    const answer = await signedCall(me.pair.privateKey, me.session_id, "PATCH", "/identities/me", { age: 33 });
    assertEquals(answer.status, 503, `the refused edit answered ${answer.status}`);
  } finally {
    console.error = original;
    await database.queryOrThrow(`DROP TRIGGER IF EXISTS b98_refuse_commit ON identities`);
    await database.queryOrThrow(`DROP FUNCTION IF EXISTS b98_refuse()`);
  }
  const line = lines.find((l) => l.includes("profile edit failed"));
  assert(line, `no "profile edit failed" line was logged: ${lines.join(" | ")}`);
  assert(line.includes("PATCH /identities/me"), `the line does not name its route: ${line}`);
  assert(line.includes("P0001"), `the line does not carry the database's code: ${line}`);
  assert(!line.includes("someone@example.org"), `the line carries an address: ${line}`);
});

addEventListener("unload", () => {
  database.closePool();
});
