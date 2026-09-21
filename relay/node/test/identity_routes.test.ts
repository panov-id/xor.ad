// Step 1's routes against a real database: an identity is born, its registration
// is finished by the paper code, and the profile answers only after that.
//
// These cannot run on file storage. Three rows in one transaction, a UPDATE …
// RETURNING that must find nothing the second time, and a sealed share read back
// out of a bytea column are all things Postgres does or does not do — testing
// them against a stub would test the stub. Run through
// scripts/run-relay-database-tests.sh, which brings its own throwaway Postgres.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "identity-routes-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
// The per-address ceiling on registrations is 10 an hour, and this suite makes
// more than that: without a way to say which address a request came from, the
// eleventh case would fail on the limit and look like a broken route. It cost an
// afternoon to find once. With the token set, x-client-ip is believed, so each
// case can register from an address of its own — and one case below uses a
// single address on purpose, to hold the ceiling itself.
Deno.env.set("ORIGIN_TOKEN", "identity-routes-origin-token");
// A key of its own rather than the live one: the share sealed under it is read
// back in this file, so the suite has to know the key it was sealed with.
Deno.env.set("VAULT_SHARE_KEY", "identity-routes-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { config } = await import("../src/config.ts");
const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const { openShare } = await import("../src/lib/vault_share.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts"); // registers the routes as a side effect

const KEY_ID = "ak_pub_identityroutestest01";

// The brand row and the key: api_keys.brand references brands(key), and the
// platform's own storefronts had never been written there once before.
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}')
     ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

async function device() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { pair, signPub: auth.bytesToBase64url(spki) };
}

function newShareBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

let addresses = 0;
// A fresh address per call unless the case names one: the limiter counts by
// address, and cases must not spend each other's allowance.
const nextAddress = () => `198.51.100.${++addresses % 250}`;

async function call(
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string>; address?: string } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "identity-routes-origin-token",
        "x-client-ip": init.address ?? nextAddress(),
        ...(raw === undefined ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      body: raw,
    }),
    params: found.params,
    url,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    headers: response.headers,
  };
}

// What a client does: sign the four lines of §2 and send the three headers.
async function signedCall(
  key: CryptoKey,
  sessionId: string,
  method: string,
  path: string,
  body?: unknown,
) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  // The same URL `call` will build, because the signature covers the authority
  // and the query since 2026-09-21 — a client that signs a bare path signs
  // something the node will not reproduce.
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(
    method,
    auth.signedAuthority(target),
    auth.signedPath(target),
    await auth.sha256hex(raw),
    time,
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)),
  );
  return await call(method, path, {
    body,
    headers: {
      "x-identity-session": sessionId,
      "x-identity-time": String(time),
      "x-identity-sign": auth.bytesToBase64url(signature),
    },
  });
}

async function register(overrides: Record<string, unknown> = {}, address?: string) {
  const { pair, signPub } = await device();
  const share = newShareBytes();
  const lookupId = crypto.randomUUID();
  const answer = await call("POST", "/identities", {
    address,
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: "hash-of-the-auth-half",
      share: auth.bytesToBase64url(share),
      recovery_lookup_id: lookupId,
      ...overrides,
    },
  });
  return { answer, pair, share, lookupId };
}

Deno.test("a registration writes the identity, its session and its share at once", async () => {
  const { answer, share } = await register();
  assertEquals(answer.status, 200);
  const created = answer.body as { identity_id: string; session_id: string };
  assert(created.identity_id, "no identity_id in the answer");

  const [identity] = await database.queryOrThrow<
    { signup_completed_at: Date | null; recovery_wrapped_key: Uint8Array | null; age: number }
  >(
    `SELECT signup_completed_at, recovery_wrapped_key, age FROM identities WHERE id = $1`,
    [created.identity_id],
  );
  // The registration is not over: the paper code has not come back yet.
  assertEquals(identity.signup_completed_at, null);
  assertEquals(identity.recovery_wrapped_key, null);
  assertEquals(identity.age, 30);

  const [session] = await database.queryOrThrow<{ identity: string }>(
    `SELECT identity FROM sessions WHERE id = $1`,
    [created.session_id],
  );
  assertEquals(session.identity, created.identity_id);

  // The share is sealed: the bytes in the column are not the bytes that arrived,
  // and only the node's key turns one into the other.
  const [vault] = await database.queryOrThrow<{ share_enc: Uint8Array }>(
    `SELECT share_enc FROM vault_shares WHERE session = $1`,
    [created.session_id],
  );
  assert(vault.share_enc.length > share.length, "the stored share is not longer than the plain one");
  assertEquals(auth.bytesToBase64url(vault.share_enc).includes(auth.bytesToBase64url(share)), false);
  assertEquals(await openShare(vault.share_enc), share);
});

Deno.test("under 13 is refused by its own code, and nothing is written", async () => {
  const before = await countIdentities();
  const { answer } = await register({ age: 12 });
  assertEquals(answer.status, 422);
  assertEquals((answer.body as { error: { code: string } }).error.code, "too_young");
  assertEquals(await countIdentities(), before);
});

Deno.test("an age past the column's range is a bad field, not a broken node", async () => {
  // There is no product ceiling on age (2026-08-28) and this is not one: the
  // column is an `integer`, and a number past its range failed the whole
  // registration with `22003`, which the catch turned into 503 "the node cannot
  // write right now" and a storage-failure metric. Anybody could report the
  // node as broken by typing a long number (review panel 2026-09-20, data lens).
  const before = await countIdentities();
  const huge = await register({ age: 3_000_000_000 });
  assertEquals(huge.answer.status, 400);
  assertEquals((huge.answer.body as { error: { code: string } }).error.code, "invalid_body");
  assertEquals(await countIdentities(), before, "a refused age still wrote a row");

  // And the neighbouring value is still fine: this is the type's edge, not a
  // judgement about people.
  const old = await register({ age: 120 });
  assertEquals(old.answer.status, 200, "a plausible old age was refused");
});

Deno.test("a key the node cannot import is refused before anything is written", async () => {
  const before = await countIdentities();
  const { answer } = await register({ sign_pub: auth.bytesToBase64url(new Uint8Array(65)) });
  assertEquals(answer.status, 400);
  assertEquals(await countIdentities(), before);
});

Deno.test("a name is measured in graphemes, the way a person sees it", async () => {
  // docs/facts/limits.tsv names the node as what holds `name.length` = 24
  // graphemes; it counted bytes only, so a hundred visible characters passed
  // (review panel 2026-09-20, consistency lens).
  const before = await countIdentities();

  // A flag is one grapheme and two code points — eight bytes, so twenty-four of
  // them stay inside the DDL's 400 and the count is the only thing deciding.
  //
  // A heavier grapheme would not: twenty-four family emoji are 432 bytes, and
  // the byte ceiling refuses them before the grapheme one is consulted. That is
  // a real conflict between the product's limit and the schema's, and it is
  // recorded in open-work rather than papered over here.
  const flag = "\u{1F1E6}\u{1F1E9}";
  const twentyFour = await register({ name: flag.repeat(24) });
  assertEquals(twentyFour.answer.status, 200, "24 graphemes were refused");

  const twentyFive = await register({ name: flag.repeat(25) });
  assertEquals(twentyFive.answer.status, 400, "25 graphemes were accepted");

  // And the plain case the old check let through: a hundred ordinary letters
  // is 100 bytes, well under the DDL's 400, and far over the product's 24.
  const hundred = await register({ name: "a".repeat(100) });
  assertEquals(hundred.answer.status, 400, "a hundred letters passed as a name");

  // The other ceiling, and the refusal has to say which one was met. 24 graphemes
  // of a four-person family emoji are 600 bytes (measured 2026-09-21), so this
  // name is inside the product's limit and outside the schema's — the owner's
  // decision of that day was to say so rather than move the schema.
  const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}";
  const heavy = await register({ name: family.repeat(24) });
  assertEquals(heavy.answer.status, 400, "600 bytes of name were accepted");
  const said = (heavy.answer.body as { error: { message: string } }).error.message;
  assert(said.includes("bytes"), `the refusal did not name the ceiling it met: "${said}"`);
  assert(
    !said.includes("longer than 24 characters"),
    `the refusal blamed the wrong ceiling: "${said}"`,
  );

  assertEquals(await countIdentities(), before + 1, "a refused name still wrote a row");
});

Deno.test("a share of the wrong length is refused", async () => {
  const { answer } = await register({
    share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16))),
  });
  assertEquals(answer.status, 400);
});

Deno.test("without a sealing key the node refuses rather than storing in the clear", async () => {
  // The only way to reach this branch without a second process: config captures
  // the environment once, at import, and the route reads the field on each call.
  const mutable = config as unknown as { vaultShareKey: string };
  const held = mutable.vaultShareKey;
  mutable.vaultShareKey = "";
  try {
    const before = await countIdentities();
    const { answer } = await register();
    assertEquals(answer.status, 503);
    assertEquals((answer.body as { error: { code: string } }).error.code, "unavailable");
    assertEquals(await countIdentities(), before);
  } finally {
    mutable.vaultShareKey = held;
  }
});

Deno.test("an unfinished registration passes no membership check", async () => {
  const { answer, pair } = await register();
  const created = answer.body as { session_id: string };
  const me = await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  // The same answer an unknown session gets: screen 2 promises there is no
  // identity yet, and saying "yours is unfinished" would contradict it.
  assertEquals(me.status, 401);
});

Deno.test("the paper code finishes the registration, and only once", async () => {
  const { answer, pair } = await register();
  const created = answer.body as { identity_id: string; session_id: string };
  const wrapped = auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48)));

  const first = await signedCall(
    pair.privateKey, created.session_id, "POST", "/recovery/confirm",
    { recovery_wrapped_key: wrapped },
  );
  assertEquals(first.status, 204);

  const [row] = await database.queryOrThrow<
    { signup_completed_at: Date | null; recovery_wrapped_key: Uint8Array | null }
  >(
    `SELECT signup_completed_at, recovery_wrapped_key FROM identities WHERE id = $1`,
    [created.identity_id],
  );
  assert(row.signup_completed_at, "the registration was not marked finished");
  assertEquals(auth.bytesToBase64url(row.recovery_wrapped_key!), wrapped);

  // A second call finds nothing to update and says so rather than succeeding
  // quietly over a row the sweeper may already have taken.
  const second = await signedCall(
    pair.privateKey, created.session_id, "POST", "/recovery/confirm",
    { recovery_wrapped_key: wrapped },
  );
  assertEquals(second.status, 409);
});

Deno.test("nothing this node answers may be stored by a cache", async () => {
  // Measured on the live edge on 2026-09-20: it answers `cache-control: public,
  // max-age=0` when the origin says nothing — `public` being exactly the word
  // that lets a shared cache keep a response carrying somebody's vault share.
  // The origin says it now, and this holds the saying.
  const { answer, pair } = await register();
  const created = answer.body as { session_id: string };
  assertEquals(answer.headers.get("cache-control"), "no-store");

  const vary = answer.headers.get("vary") ?? "";
  assert(vary.includes("x-identity-session"), `vary was "${vary}"`);

  // The refusals too: a 401 body is small, but a cache that keeps one hands the
  // next caller somebody else's refusal for the same path.
  const bare = await call("GET", "/identities/me", {
    headers: { "x-identity-session": created.session_id },
  });
  assertEquals(bare.status, 401);
  assertEquals(bare.headers.get("cache-control"), "no-store");

  // And the one that actually carries a secret.
  await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  const me = await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(me.status, 200);
  assertEquals(me.headers.get("cache-control"), "no-store");
});

Deno.test("the profile answers a finished registration and refuses an unsigned request", async () => {
  const { answer, pair } = await register();
  const created = answer.body as { session_id: string };
  await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });

  const me = await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(me.status, 200);
  const profile = me.body as { name: string; age: number; languages: string[] };
  assertEquals(profile.name, "Аня");
  assertEquals(profile.age, 30);
  assertEquals(profile.languages, []);

  // No signature at all, and the session id alone is not one.
  const bare = await call("GET", "/identities/me", {
    headers: { "x-identity-session": created.session_id },
  });
  assertEquals(bare.status, 401);
});

Deno.test("a signed request marks the session as seen, at most once a day", async () => {
  // The identity sweeper counts a year of disuse from `sessions.last_seen_at`,
  // and until 2026-09-20 nothing wrote that column: the year ran from the
  // session's creation, so somebody using the product every day would have been
  // closed on the anniversary of their registration. Found by the data lens of
  // the review panel; this is the case that would have caught it.
  const { answer, pair } = await register();
  const created = answer.body as { session_id: string };
  await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });

  const seen = async () =>
    (await database.queryOrThrow<{ last_seen_at: Date }>(
      `SELECT last_seen_at FROM sessions WHERE id = $1`,
      [created.session_id],
    ))[0].last_seen_at;

  // Old enough to be worth writing: a day is the promised floor, so the row is
  // aged past it rather than the test waiting one out.
  await database.queryOrThrow(
    `UPDATE sessions SET last_seen_at = now() - interval '2 days' WHERE id = $1`,
    [created.session_id],
  );
  const stale = await seen();

  const me = await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(me.status, 200);
  const fresh = await seen();
  assert(
    fresh.getTime() > stale.getTime(),
    "a signed request did not mark the session as seen",
  );

  // And not again on the next request: the column is written at most once a
  // day, so a read does not turn into a write on every call.
  await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(
    (await seen()).getTime(),
    fresh.getTime(),
    "the second request wrote last_seen_at again within the same day",
  );
});

Deno.test("another device's signature does not open this session", async () => {
  const { answer } = await register();
  const created = answer.body as { session_id: string };
  const stranger = await device();
  const me = await signedCall(stranger.pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(me.status, 401);
});

Deno.test("an unsupported protocol version is refused before the signature is read", async () => {
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID, "x-protocol-version": String(auth.PROTOCOL_MAJOR + 1) },
    body: {},
  });
  assertEquals(answer.status, 400);
  assertEquals(
    (answer.body as { error: { code: string } }).error.code,
    "protocol_version_unsupported",
  );
});


// The proof of the PIN: auth is what the device derives and sends, auth_hash is
// the sha256 of it that the node stored at registration.
const AUTH = crypto.getRandomValues(new Uint8Array(32));

async function registerWithPin(auth: Uint8Array = AUTH) {
  const authHash = await (await import("../src/lib/identity_auth.ts")).sha256hex(auth);
  return await register({ auth_hash: authHash });
}

function proof(auth: Uint8Array) {
  return { auth: auth.length ? authBase64(auth) : "" };
}
const authBase64 = (bytes: Uint8Array) => auth.bytesToBase64url(bytes);

// How many tries are left, straight from the row — the answer's own number is
// what is under test, so it cannot also be the witness.
async function attemptsLeft(sessionId: string) {
  const [row] = await database.queryOrThrow<
    { attempts_left: number; locked_at: Date | null; next_attempt_at: Date | null }
  >(
    `SELECT attempts_left, locked_at, next_attempt_at FROM vault_shares WHERE session = $1`,
    [sessionId],
  );
  return row;
}

// The delay is the node's and is written into the row; waiting it out in a test
// would cost four hours, so it is cleared explicitly where a later try is the
// point of the case.
async function clearDelay(sessionId: string) {
  await database.queryOrThrow(
    `UPDATE vault_shares SET next_attempt_at = NULL WHERE session = $1`,
    [sessionId],
  );
}

Deno.test("the right PIN hands over the share and resets the counter", async () => {
  const { answer, pair, share } = await registerWithPin();
  const created = answer.body as { session_id: string };
  // Spend one try first, so the reset is visible rather than assumed.
  await signedCall(pair.privateKey, created.session_id, "POST", "/vault/share", {
    auth: authBase64(crypto.getRandomValues(new Uint8Array(32))),
  });
  await clearDelay(created.session_id);

  const given = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(AUTH),
  );
  assertEquals(given.status, 200);
  assertEquals((given.body as { share: string }).share, authBase64(share));
  const row = await attemptsLeft(created.session_id);
  assertEquals(row.attempts_left, 10);
  assertEquals(row.next_attempt_at, null);
});

Deno.test("a wrong PIN spends one try and says how many are left", async () => {
  const { answer, pair } = await registerWithPin();
  const created = answer.body as { session_id: string };
  const refused = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share",
    { auth: authBase64(crypto.getRandomValues(new Uint8Array(32))) },
  );
  assertEquals(refused.status, 409);
  const error = (refused.body as { error: { code: string; attempts_left: number } }).error;
  assertEquals(error.code, "unauthorized");
  assertEquals(error.attempts_left, 9);
  assertEquals((await attemptsLeft(created.session_id)).attempts_left, 9);
});

Deno.test("the delay starts after the fifth miss, and waiting is not a way to test a PIN", async () => {
  const { answer, pair } = await registerWithPin();
  const created = answer.body as { session_id: string };
  const wrong = { auth: authBase64(crypto.getRandomValues(new Uint8Array(32))) };

  for (let i = 0; i < 5; i++) {
    await signedCall(pair.privateKey, created.session_id, "POST", "/vault/share", wrong);
    await clearDelay(created.session_id);
  }
  // Five gone, none of them delayed.
  assertEquals((await attemptsLeft(created.session_id)).attempts_left, 5);

  // The sixth miss arms the wait.
  await signedCall(pair.privateKey, created.session_id, "POST", "/vault/share", wrong);
  const armed = await attemptsLeft(created.session_id);
  assertEquals(armed.attempts_left, 4);
  assert(armed.next_attempt_at, "the sixth miss did not arm a delay");

  // Too soon: refused, and the counter is not spent — the right PIN too.
  const early = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(AUTH),
  );
  assertEquals(early.status, 429);
  assert(early.headers.get("retry-after"), "no retry-after on an early attempt");
  assertEquals((await attemptsLeft(created.session_id)).attempts_left, 4);
});

Deno.test("the tenth miss closes entry and leaves the share intact", async () => {
  const { answer, pair } = await registerWithPin();
  const created = answer.body as { session_id: string };
  const wrong = { auth: authBase64(crypto.getRandomValues(new Uint8Array(32))) };

  let last;
  for (let i = 0; i < 10; i++) {
    last = await signedCall(pair.privateKey, created.session_id, "POST", "/vault/share", wrong);
    await clearDelay(created.session_id);
  }
  const error = (last!.body as { error: { code: string; attempts_left: number } }).error;
  assertEquals(error.code, "pin_locked");
  assertEquals(error.attempts_left, 0);

  const row = await attemptsLeft(created.session_id);
  assertEquals(row.attempts_left, 0);
  assert(row.locked_at, "the tenth miss did not close entry");

  // And the session is frozen in the same breath: leaving the PIN closed while
  // the tab keeps its signing key would let whoever holds the tab go on acting
  // as this person until the paper code.
  const [session] = await database.queryOrThrow<
    { frozen_at: Date | null; frozen_reason: string | null }
  >(
    `SELECT frozen_at, frozen_reason FROM sessions WHERE id = $1`,
    [created.session_id],
  );
  assert(session.frozen_at, "the tenth miss did not freeze the session");
  assertEquals(session.frozen_reason, "pin_limit");

  // A frozen session is refused everywhere, not only at the vault.
  const profile = await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(profile.status, 401);

  // The share is whole: ten mistakes stop entry, they do not erase a history —
  // a stolen signing key must not be able to do that from afar.
  const [vault] = await database.queryOrThrow<{ share_enc: Uint8Array | null }>(
    `SELECT share_enc FROM vault_shares WHERE session = $1`,
    [created.session_id],
  );
  assert(vault.share_enc, "the share was burned");

  // And the right PIN does not open it any more — refused by the guard now,
  // before the vault is even reached, because the session itself is frozen.
  await clearDelay(created.session_id);
  const correct = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(AUTH),
  );
  assertEquals(correct.status, 401);
});

Deno.test("another session's share cannot be reached from this one", async () => {
  const mine = await registerWithPin();
  const theirs = await registerWithPin();
  const myId = (mine.answer.body as { session_id: string }).session_id;
  const theirId = (theirs.answer.body as { session_id: string }).session_id;
  assert(myId !== theirId);
  // My key against their session: the guard reads their public key and refuses.
  const attempt = await signedCall(mine.pair.privateKey, theirId, "POST", "/vault/share", proof(AUTH));
  assertEquals(attempt.status, 401);
});


Deno.test("two sessions of one identity hold two different shares", async () => {
  // Test map 3.5 — "a share belongs to a device, not to an identity" — was
  // marked as held by the case above it, which uses two *different* identities
  // and therefore proves the guard, not this. Caught by the consistency lens of
  // the review panel, 2026-09-20. This is the case the row actually asks for:
  // one identity, two of its own sessions, and no way for the second to reach
  // what belongs to the first.
  const pin = crypto.getRandomValues(new Uint8Array(32));
  const { created, pair, lookupId } = await registered(pin);

  // The device moves: the old session keeps its row, the new one arrives with
  // no share at all and sets its own PIN through the grant recovery left.
  const fresh = await device();
  const raised = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: fresh.signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  const second = (raised.body as { session_id: string }).session_id;
  const newPin = crypto.getRandomValues(new Uint8Array(32));
  const newShare = newShareBytes();
  const set = await signedCall(fresh.pair.privateKey, second, "POST", "/vault/init", {
    auth_hash: await auth.sha256hex(newPin),
    share: authBase64(newShare),
  });
  assertEquals(set.status, 204);

  // The new device's PIN returns the new device's share — not the old one's,
  // which the move burned, and not some property of the identity.
  await clearDelay(second);
  const handed = await signedCall(fresh.pair.privateKey, second, "POST", "/vault/share", proof(newPin));
  assertEquals(handed.status, 200);
  assertEquals((handed.body as { share: string }).share, authBase64(newShare));

  // And the old device's PIN, which is a different PIN, is not what opens it:
  // the row is keyed by session, so the first device's proof means nothing to
  // the second one's row.
  await clearDelay(second);
  const crossed = await signedCall(fresh.pair.privateKey, second, "POST", "/vault/share", proof(pin));
  assertEquals(crossed.status, 409, "the other device's PIN opened this device's share");

  // The rows are two, and they are not the same row.
  const shares = await database.queryOrThrow<{ session: string }>(
    `SELECT session FROM vault_shares WHERE session IN ($1, $2)`,
    [created.session_id, second],
  );
  assertEquals(shares.length, 2, "one identity's two devices share one row");
});

Deno.test("the first PIN needs a grant, spends it, and works only once", async () => {
  const { answer, pair } = await registerWithPin();
  const created = answer.body as { identity_id: string; session_id: string };
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  const freshAuth = crypto.getRandomValues(new Uint8Array(32));
  const freshHash = await auth.sha256hex(freshAuth);
  const payload = { auth_hash: freshHash, share: authBase64(fresh) };

  // Without a grant: a signing key alone never replaces a PIN.
  const ungranted = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/init", payload,
  );
  assertEquals(ungranted.status, 409);
  assertEquals((ungranted.body as { error: { code: string } }).error.code, "unauthorized");

  // What an approved transfer or a recovery leaves behind.
  await database.queryOrThrow(
    `UPDATE identities SET first_pin_grant_at = now() WHERE id = $1`,
    [created.identity_id],
  );

  const granted = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/init", payload,
  );
  assertEquals(granted.status, 204);

  // The grant is gone, and a second call cannot take a second first PIN.
  const [row] = await database.queryOrThrow<{ first_pin_grant_at: Date | null }>(
    `SELECT first_pin_grant_at FROM identities WHERE id = $1`,
    [created.identity_id],
  );
  assertEquals(row.first_pin_grant_at, null);
  const again = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/init", payload,
  );
  assertEquals(again.status, 409);

  // And the new PIN is the one that opens the new share; the old one does not.
  const opened = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", { auth: authBase64(freshAuth) },
  );
  assertEquals(opened.status, 200);
  assertEquals((opened.body as { share: string }).share, authBase64(fresh));

  const old = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(AUTH),
  );
  assertEquals(old.status, 409);
});

// Forgot the PIN as well as losing the device: the paper code reopens the
// session, and the first PIN then takes the share over with a new one. The two
// UPDATEs that used to stand in for POST /recovery/claim here are gone — the
// route exists, and a test that arranges its own preconditions by hand proves
// only that the SQL beneath it works.
Deno.test("a first-PIN grant older than an hour is no longer a grant", async () => {
  // `vault.first_pin.ttl` — an hour, the owner's decision of 2026-09-21 after
  // the security lens of the review panel. Without a term "one-time" meant "for
  // ever, until spent": somebody recovers, never reaches /vault/init, and six
  // months later whoever steals that session's signing key sets a PIN of their
  // own and overwrites the owner's share — which is exactly what the route
  // promises cannot happen.
  const { created, pair, lookupId } = await registered();
  const raised = await signedCall(
    pair.privateKey, created.session_id, "POST", "/recovery/claim", { lookup_id: lookupId },
  );
  assertEquals(raised.status, 200);

  // The grant is real right now.
  const [before] = await database.queryOrThrow<{ first_pin_grant_at: Date | null }>(
    `SELECT first_pin_grant_at FROM identities WHERE id = $1`,
    [created.identity_id],
  );
  assert(before.first_pin_grant_at, "recovery left no grant to expire");

  // Age it past the hour rather than wait one out.
  await database.queryOrThrow(
    `UPDATE identities SET first_pin_grant_at = now() - interval '61 minutes' WHERE id = $1`,
    [created.identity_id],
  );
  const late = await signedCall(pair.privateKey, created.session_id, "POST", "/vault/init", {
    auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
    share: authBase64(newShareBytes()),
  });
  assertEquals(late.status, 409, "an hour-old grant still set a PIN");
  assertEquals((late.body as { error: { code: string } }).error.code, "unauthorized");

  // And inside the hour it still works — the term is a term, not a closure.
  await database.queryOrThrow(
    `UPDATE identities SET first_pin_grant_at = now() - interval '59 minutes' WHERE id = $1`,
    [created.identity_id],
  );
  const inTime = await signedCall(pair.privateKey, created.session_id, "POST", "/vault/init", {
    auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
    share: authBase64(newShareBytes()),
  });
  assertEquals(inTime.status, 204, "a grant inside the hour was refused");
});

Deno.test("a first PIN takes over a share whose session was locked out", async () => {
  const { created, pair, lookupId: lookup_id } = await registered();
  const wrong = { auth: authBase64(crypto.getRandomValues(new Uint8Array(32))) };
  for (let i = 0; i < 10; i++) {
    await signedCall(pair.privateKey, created.session_id, "POST", "/vault/share", wrong);
    await clearDelay(created.session_id);
  }
  assert((await attemptsLeft(created.session_id)).locked_at, "entry was not closed");

  const raised = await signedCall(
    pair.privateKey, created.session_id, "POST", "/recovery/claim", { lookup_id },
  );
  assertEquals(raised.status, 200, "the paper code did not reopen the device");

  const freshAuth = crypto.getRandomValues(new Uint8Array(32));
  const set = await signedCall(pair.privateKey, created.session_id, "POST", "/vault/init", {
    auth_hash: await auth.sha256hex(freshAuth),
    share: authBase64(crypto.getRandomValues(new Uint8Array(32))),
  });
  assertEquals(set.status, 204);

  // The paper code is the way out of a lock, and this is what the way out leaves.
  const row = await attemptsLeft(created.session_id);
  assertEquals(row.locked_at, null);
  assertEquals(row.attempts_left, 10);
});

Deno.test("the eleventh registration from one address is refused", async () => {
  const address = "203.0.113.7";
  for (let i = 0; i < 10; i++) {
    const { answer } = await register({}, address);
    assertEquals(answer.status, 200, `registration ${i + 1} was refused`);
  }
  const eleventh = await register({}, address);
  assertEquals(eleventh.answer.status, 429);
  assertEquals(
    (eleventh.answer.body as { error: { code: string } }).error.code,
    "rate_limited",
  );
  assert(eleventh.answer.headers.get("retry-after"), "no retry-after on the refusal");
});

// ---------------------------------------------------------------------------
// POST /recovery/claim — the way back, and the only one there is.

const misses = await import("../src/lib/recovery_misses.ts");

// A finished registration: the paper code has been written down, which is what
// makes the identity raisable at all.
async function registered(pin: Uint8Array = AUTH) {
  const { answer, pair, lookupId, share } = await registerWithPin(pin);
  const created = answer.body as { identity_id: string; session_id: string };
  const wrapped = auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48)));
  const confirmed = await signedCall(
    pair.privateKey, created.session_id, "POST", "/recovery/confirm",
    { recovery_wrapped_key: wrapped },
  );
  assertEquals(confirmed.status, 204, "the registration was not finished");
  return { created, pair, lookupId, wrapped, share };
}

Deno.test("the node stores a hash of the paper code's half, not the half itself", async () => {
  // A read-only copy of `identities` must not be a set of keys. Until
  // 2026-09-20 the column held exactly what the device presents, so a dump was
  // one POST away from taking over every identity on the node — found by the
  // security lens of the review panel. The PIN never worked that way, and this
  // is the same rule applied to the other half.
  const { created, lookupId, wrapped } = await registered();

  const [row] = await database.queryOrThrow<{ recovery_auth_hash: string }>(
    `SELECT recovery_auth_hash FROM identities WHERE id = $1`,
    [created.identity_id],
  );
  assert(
    row.recovery_auth_hash !== lookupId,
    "the presented half of the paper code is stored verbatim",
  );
  assertEquals(row.recovery_auth_hash, await auth.sha256hex(new TextEncoder().encode(lookupId)));

  // What the dump holds does not work as a code: presenting the stored value
  // finds nothing, because the node hashes what it is given.
  const withStolen = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: row.recovery_auth_hash,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(withStolen.status, 404, "the stored value worked as a paper code");

  // And the real half still raises the identity.
  const honest = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(honest.status, 200);
  assertEquals((honest.body as { recovery_wrapped_key: string }).recovery_wrapped_key, wrapped);
});

Deno.test("the paper code raises the identity on a clean device", async () => {
  const { created, pair, lookupId, wrapped } = await registered();
  const fresh = await device();

  const raised = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: fresh.signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      label: "a clean phone",
    },
  });
  assertEquals(raised.status, 200);
  const answer = raised.body as {
    identity_id: string;
    session_id: string;
    recovery_wrapped_key: string;
  };
  assertEquals(answer.identity_id, created.identity_id);
  // The wrapped long key comes back untouched: the node stores it and cannot
  // open it, so handing it over is the whole of what it can do here.
  assertEquals(answer.recovery_wrapped_key, wrapped);
  assert(answer.session_id !== created.session_id, "the old session was handed back");

  // One live session per identity: the lost device is frozen, and the reason is
  // `transfer` — the support exception of §8.2 belongs to `pin_limit` alone.
  const [old] = await database.queryOrThrow<{ frozen_at: Date | null; frozen_reason: string }>(
    `SELECT frozen_at, frozen_reason FROM sessions WHERE id = $1`,
    [created.session_id],
  );
  assert(old.frozen_at, "the old session is still live");
  assertEquals(old.frozen_reason, "transfer");

  // And it is refused everywhere, immediately.
  const stale = await signedCall(pair.privateKey, created.session_id, "GET", "/identities/me");
  assertEquals(stale.status, 401);

  // The share of the device left behind is burned, not merely unreachable.
  // §8.2 (2026-09-11): freezing stops the node from accepting the old device's
  // signature, and nothing more — the old phone went on opening its own history
  // with its own PIN, while the person who typed sixteen characters believed
  // they had shut the door.
  const [burned] = await database.queryOrThrow<
    { share_enc: Uint8Array | null; burned_at: Date | null }
  >(
    `SELECT share_enc, burned_at FROM vault_shares WHERE session = $1`,
    [created.session_id],
  );
  assertEquals(burned.share_enc, null, "the lost device's share was left intact");
  assert(burned.burned_at, "the share is gone but the burn was not recorded");

  // The new device has no PIN yet, so it is left the one-time right to set one.
  const [identity] = await database.queryOrThrow<{ first_pin_grant_at: Date | null }>(
    `SELECT first_pin_grant_at FROM identities WHERE id = $1`,
    [created.identity_id],
  );
  assert(identity.first_pin_grant_at, "no first-PIN grant was left for the new device");

  // The old paper code is still good: §8.2 moved its death to the moment the
  // *new* code is confirmed, so that nobody is left holding an identity no code
  // can raise.
  const again = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(again.status, 200);
});

Deno.test("the paper code reopens the device the tenth PIN mistake closed", async () => {
  const pin = crypto.getRandomValues(new Uint8Array(32));
  const { created, pair, lookupId } = await registered(pin);
  const wrong = { auth: authBase64(crypto.getRandomValues(new Uint8Array(32))) };
  for (let i = 0; i < 10; i++) {
    await clearDelay(created.session_id);
    await signedCall(pair.privateKey, created.session_id, "POST", "/vault/share", wrong);
  }
  const locked = await attemptsLeft(created.session_id);
  assertEquals(locked.attempts_left, 0);
  assert(locked.locked_at, "the tenth miss did not close entry");

  // Signed by the frozen session itself: §8.2 names recovery as the one
  // exception to "a frozen session is refused everywhere", and without it the
  // tenth mistake would have no way out at all.
  const raised = await signedCall(
    pair.privateKey, created.session_id, "POST", "/recovery/claim", { lookup_id: lookupId },
  );
  assertEquals(raised.status, 200);
  const answer = raised.body as { session_id: string };
  assertEquals(answer.session_id, created.session_id, "the same device was given a new session");

  const [session] = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE id = $1`,
    [created.session_id],
  );
  assertEquals(session.frozen_at, null, "the session is still frozen");

  // The counter-case to the burn above: a lock is not a move. The tenth mistake
  // keeps the share (§8.2, 2026-09-14) precisely so that a stolen signing key
  // cannot erase a history from afar, and raising the same device must not do
  // what the lock refused to do.
  const [kept] = await database.queryOrThrow<{ share_enc: Uint8Array | null }>(
    `SELECT share_enc FROM vault_shares WHERE session = $1`,
    [created.session_id],
  );
  assert(kept.share_enc, "raising the same device burned its share");

  // The promise of §8.2 in full: the old PIN opens this device's history again.
  await clearDelay(created.session_id);
  const opened = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(pin),
  );
  assertEquals(opened.status, 200);
  const after = await attemptsLeft(created.session_id);
  assertEquals(after.attempts_left, 10);
  assertEquals(after.locked_at, null);
});

Deno.test("the paper code raises an identity that has no live session left", async () => {
  // §14 asks for this one twice over, and the second half is the one the canon
  // had to correct: "when no live sessions remain" contradicted itself, because
  // there is nothing to freeze then. This is that half — the browser was
  // cleared, so the identity's only session was already frozen and nothing at
  // all is live when the code arrives.
  const { created, lookupId, wrapped } = await registered();
  await database.queryOrThrow(
    `UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`,
    [created.session_id],
  );

  const raised = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(raised.status, 200, "a dead identity could not be raised");
  const answer = raised.body as { session_id: string; recovery_wrapped_key: string };
  assertEquals(answer.recovery_wrapped_key, wrapped);

  // And the new session is live: the partial unique index would have refused it
  // if the frozen one had been left in the way.
  const [fresh] = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE id = $1`,
    [answer.session_id],
  );
  assertEquals(fresh.frozen_at, null);
});

Deno.test("a device left behind cannot open its history even with the right PIN", async () => {
  // Test map 4.7 and §14: the disk is not wiped and the files are still there,
  // but the move burned the node's half, so the old device opens nothing —
  // proved with the PIN that used to work, not by reading the column.
  const pin = crypto.getRandomValues(new Uint8Array(32));
  const { created, pair, lookupId } = await registered(pin);

  // It worked before the move.
  const before = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(pin),
  );
  assertEquals(before.status, 200, "the PIN did not work before the move");

  const moved = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  const raised = moved.body as { session_id: string };

  // Unfreeze the abandoned device by hand: being refused by the guard is a
  // different refusal, and the one under test is the burned share. This is the
  // strongest form of the claim — even a device that somehow speaks again gets
  // nothing back.
  //
  // The new session has to go quiet first. One live session per identity is
  // held by a partial unique index rather than by code, and it refuses the
  // second — which is how this test first failed, and is itself the thing test
  // map 4.1 asks for.
  await database.queryOrThrow(
    `UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`,
    [raised.session_id],
  );
  await database.queryOrThrow(
    `UPDATE sessions SET frozen_at = NULL, frozen_reason = NULL WHERE id = $1`,
    [created.session_id],
  );
  await clearDelay(created.session_id);
  const after = await signedCall(
    pair.privateKey, created.session_id, "POST", "/vault/share", proof(pin),
  );
  assertEquals(after.status, 404, "the abandoned device still had a share to collect");
  assertEquals((after.body as { error: { code: string } }).error.code, "not_found");
});

Deno.test("a code that matches nothing says one thing and touches nothing", async () => {
  const { created } = await registered();
  const before = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE identity = $1`,
    [created.identity_id],
  );

  const missed = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: crypto.randomUUID(),
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(missed.status, 404);
  assertEquals((missed.body as { error: { code: string } }).error.code, "not_found");

  const after = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE identity = $1`,
    [created.identity_id],
  );
  assertEquals(after.length, before.length, "a miss changed the sessions of an identity");
  assertEquals(after[0].frozen_at, before[0].frozen_at);
});

Deno.test("a bare lookup_id cannot tell a hit from a miss", async () => {
  // The refusal must not be an oracle. With the key checks below the search, a
  // request carrying nothing but a lookup_id got 404 for a wrong code and 400
  // for a right one — a free, silent confirmation of a photographed code, while
  // the real path costs the owner their session and their share. Found by the
  // security lens of the review panel, 2026-09-20.
  const { lookupId } = await registered();

  const hit = await call("POST", "/recovery/claim", { body: { lookup_id: lookupId } });
  const miss = await call("POST", "/recovery/claim", { body: { lookup_id: crypto.randomUUID() } });
  assertEquals(
    hit.status,
    miss.status,
    "a right code and a wrong one are told apart by the status of a bare request",
  );
  assertEquals(
    (hit.body as { error: { code: string } }).error.code,
    (miss.body as { error: { code: string } }).error.code,
    "a right code and a wrong one are told apart by the error code",
  );
});

Deno.test("an unfinished registration cannot be raised by its own code", async () => {
  // No POST /recovery/confirm: the code was shown and never written down, so
  // `recovery_wrapped_key` is NULL and there is nothing to hand over. §8.2 says
  // such an identity passes no membership check at all.
  const { lookupId } = await registerWithPin();
  const missed = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(missed.status, 404);
});

Deno.test("fifty wrong codes across the node pause the route for everyone", async () => {
  misses.reset();
  const { lookupId } = await registered();

  // Under the threshold the route is still answering. Each call comes from an
  // address of its own: the per-address ceiling is a different mechanism and
  // must not be what this case measures.
  //
  // Every miss carries real keys, because a request without them is refused
  // before the lookup (that refusal is what keeps a bare request from being an
  // oracle) and therefore is not a miss at all. One key pair for all fifty: a
  // fresh P-256 pair per call would make this case a benchmark of WebCrypto.
  const guesser = await device();
  const wrapPub = auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91)));
  const guess = () =>
    call("POST", "/recovery/claim", {
      body: { lookup_id: crypto.randomUUID(), sign_pub: guesser.signPub, wrap_pub: wrapPub },
    });
  for (let i = 0; i < misses.SHARED_MISS_MAX - 1; i++) {
    const answer = await guess();
    assertEquals(answer.status, 404, `the route paused after ${i + 1} misses`);
  }
  const last = await guess();
  assertEquals(last.status, 404, "the fiftieth miss was not answered as a miss");

  // And now a real code waits too. The price is named in §8.2: while the brake
  // is on, somebody holding a genuine paper code is refused as well.
  const honest = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(honest.status, 429);
  assertEquals((honest.body as { error: { code: string } }).error.code, "rate_limited");
  const retry = Number(honest.headers.get("retry-after"));
  assert(retry > 0 && retry <= 15 * 60, `retry-after was ${retry}, not the fifteen-minute pause`);

  misses.reset();
  const afterPause = await call("POST", "/recovery/claim", {
    body: {
      lookup_id: lookupId,
      sign_pub: (await device()).signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
    },
  });
  assertEquals(afterPause.status, 200, "the route did not come back after the pause");
});

async function countIdentities(): Promise<number> {
  const [row] = await database.queryOrThrow<{ n: bigint }>(`SELECT count(*) AS n FROM identities`);
  return Number(row.n);
}
