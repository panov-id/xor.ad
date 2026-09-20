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

function newShare(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function call(
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string> } = {},
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
  const payload = auth.signedPayload(method, path, await auth.sha256hex(raw), time);
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

async function register(overrides: Record<string, unknown> = {}) {
  const { pair, signPub } = await device();
  const share = newShare();
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: "hash-of-the-auth-half",
      share: auth.bytesToBase64url(share),
      recovery_lookup_id: crypto.randomUUID(),
      ...overrides,
    },
  });
  return { answer, pair, share };
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

Deno.test("a key the node cannot import is refused before anything is written", async () => {
  const before = await countIdentities();
  const { answer } = await register({ sign_pub: auth.bytesToBase64url(new Uint8Array(65)) });
  assertEquals(answer.status, 400);
  assertEquals(await countIdentities(), before);
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

async function countIdentities(): Promise<number> {
  const [row] = await database.queryOrThrow<{ n: bigint }>(`SELECT count(*) AS n FROM identities`);
  return Number(row.n);
}
