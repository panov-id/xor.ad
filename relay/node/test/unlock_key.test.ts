// The unlock key (db/063; chat spec §8.2, web.2026-09-26.coldunlock): a
// session may carry a second public key, and the node accepts a signature by
// it on POST /vault/share — the exchange a cold start makes before the sealed
// keys can sign — and on nothing else. What is read back is the node's
// answer on each route, for each key, and the column itself.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "unlock-key-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "unlock-key-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "unlock-key-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");

const KEY_ID = "ak_pub_unlockkeytest0001";
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
        "x-origin-token": "unlock-key-origin-token",
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
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: { "x-identity-session": sessionId, "x-identity-time": String(time), "x-identity-sign": auth.bytesToBase64url(signature) },
  });
}

const spki = async (key: CryptoKey) => auth.bytesToBase64url(new Uint8Array(await crypto.subtle.exportKey("spki", key)));

// A registration, with or without an unlock key. The PIN's auth is kept, so
// /vault/share can be asked with the right proof.
async function register(withUnlock: boolean) {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const unlock = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]);
  const authBytes = crypto.getRandomValues(new Uint8Array(32));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: await spki(pair.publicKey),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      ...(withUnlock ? { unlock_pub: await spki(unlock.publicKey) } : {}),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(authBytes),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, JSON.stringify(answer.body));
  const { identity_id, session_id } = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { identityId: identity_id, sessionId: session_id, session: pair.privateKey, unlock: unlock.privateKey, auth: auth.bytesToBase64url(authBytes) };
}

Deno.test("the unlock key is kept with the session, and absent for a face without one", async () => {
  const withKey = await register(true);
  const without = await register(false);
  const rows = await database.queryOrThrow<{ id: string; unlock_public_key: string | null }>(
    `SELECT id, unlock_public_key FROM sessions WHERE id = ANY($1::uuid[])`,
    [[withKey.sessionId, without.sessionId]],
  );
  const byId = new Map(rows.map((r) => [r.id, r.unlock_public_key]));
  assert(byId.get(withKey.sessionId), "the unlock key was not written");
  assertEquals(byId.get(without.sessionId), null);
});

Deno.test("the unlock key signs POST /vault/share and gets the share", async () => {
  const me = await register(true);
  const bySession = await signedCall(me.session, me.sessionId, "POST", "/vault/share", { auth: me.auth });
  assertEquals(bySession.status, 200, JSON.stringify(bySession.body));
  const byUnlock = await signedCall(me.unlock, me.sessionId, "POST", "/vault/share", { auth: me.auth });
  assertEquals(byUnlock.status, 200, JSON.stringify(byUnlock.body));
  assertEquals((byUnlock.body as { share: string }).share, (bySession.body as { share: string }).share);
});

Deno.test("the unlock key signs nothing else: the feed answers 401 as to a stranger", async () => {
  const me = await register(true);
  const feed = await signedCall(me.unlock, me.sessionId, "GET", "/feed?lat=41.9&lon=12.5&radius=1000");
  assertEquals(feed.status, 401, JSON.stringify(feed.body));
  assertEquals((feed.body as { error: { code: string } }).error.code, "unauthorized");
  const said = await signedCall(me.unlock, me.sessionId, "POST", "/feed", { text: "привет", mode: "alone", lat: 41.9, lon: 12.5, area_radius: 1000 });
  assertEquals(said.status, 401);
  const me2 = await signedCall(me.unlock, me.sessionId, "GET", "/identities/me");
  assertEquals(me2.status, 401);
  // And the session's own key still does: the guard did not lose its first path.
  assertEquals((await signedCall(me.session, me.sessionId, "GET", "/feed?lat=41.9&lon=12.5&radius=1000")).status, 200);
});

Deno.test("a session without an unlock key admits no second key anywhere, /vault/share included", async () => {
  const me = await register(false);
  const stranger = await crypto.subtle.generateKey(P256, false, ["sign", "verify"]);
  const share = await signedCall(stranger.privateKey, me.sessionId, "POST", "/vault/share", { auth: me.auth });
  assertEquals(share.status, 401, JSON.stringify(share.body));
  // The wrong PIN through the unlock path is still the node's counter: a
  // session with the key, a wrong proof — pin_mismatch, not 401.
  const other = await register(true);
  const wrong = await signedCall(other.unlock, other.sessionId, "POST", "/vault/share", { auth: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))) });
  assertEquals(wrong.status, 409, JSON.stringify(wrong.body));
  assertEquals((wrong.body as { error: { code: string } }).error.code, "pin_mismatch");
});

Deno.test("an unlock_pub the node cannot import is refused at registration", async () => {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: await spki(pair.publicKey),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      unlock_pub: "not-a-key",
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 400, JSON.stringify(answer.body));
  assert(String((answer.body as { error: { message: string } }).error.message).includes("unlock_pub"));
});
