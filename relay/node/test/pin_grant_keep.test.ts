// The first-PIN grant after "I remember my PIN" (W13-PG, open.tsv
// pin.grant.after-keep): a raise by the paper code on the same device leaves
// first_pin_grant_at, so that a new PIN can be set without the old one (§8.2,
// depth.pin.forgot.samedevice). The person who remembers their PIN never
// spends it — and until now it lived on for FIRST_PIN_TTL_HOURS: whoever sat
// at the device within the hour could set a PIN by the grant, knowing nothing.
// Now a share handed out for the old PIN (POST /vault/share 200) and a PIN
// changed with the old one (POST /vault/pin 200) put the grant out: the old
// PIN proved is the person, and the grant was for the one who forgot it.
// The grant stays for the device that takes the other way — a new PIN by
// POST /vault/init — and that way still works.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh");
}
Deno.env.set("SESSION_SECRET", "pin-grant-keep-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "pin-grant-keep-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "pin-grant-keep-vault-key");
Deno.env.set("BRANDS", JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]));

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts");

const KEY_ID = "ak_pub_pingrantkeeptest01";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper) VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA') ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(`INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`, [KEY_ID]);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
const b64 = (bytes: Uint8Array) => auth.bytesToBase64url(bytes);
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;
const pooled = { sanitizeOps: false, sanitizeResources: false };

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
        "x-origin-token": "pin-grant-keep-origin-token",
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
    headers: { "x-identity-session": sessionId, "x-identity-time": String(time), "x-identity-sign": b64(signature) },
  });
}

// A finished registration with a PIN, as identity_routes.test.ts makes one.
async function person() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const pin = random(32);
  const lookupId = crypto.randomUUID();
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: b64(spki), wrap_pub: b64(random(91)), name: "Аня", age: 30,
      auth_hash: await auth.sha256hex(pin), share: b64(random(32)), recovery_lookup_id: lookupId,
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", { recovery_wrapped_key: b64(random(48)) });
  assertEquals(confirmed.status, 204, "the registration was not finished");
  const me = { pair, pin, lookupId, ...created };
  // The raise on the same device: signed by its own session, no keys — the
  // branch that leaves the grant (identity.ts same_device).
  const raised = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/claim", { lookup_id: lookupId });
  assertEquals(raised.status, 200, `the same-device raise was refused: ${JSON.stringify(raised.body)}`);
  assert(await grantOf(me.identity_id), "the raise left no grant");
  return me;
}

const grantOf = async (identityId: string) =>
  (await database.queryOrThrow<{ first_pin_grant_at: Date | null }>(`SELECT first_pin_grant_at FROM identities WHERE id = $1`, [identityId]))[0].first_pin_grant_at;
const clearDelay = (sessionId: string) => database.queryOrThrow(`UPDATE vault_shares SET next_attempt_at = NULL WHERE session = $1`, [sessionId]);
const share = (me: { pair: CryptoKeyPair; session_id: string }, pin: Uint8Array) =>
  signedCall(me.pair.privateKey, me.session_id, "POST", "/vault/share", { auth: b64(pin) });
const init = (me: { pair: CryptoKeyPair; session_id: string }) =>
  signedCall(me.pair.privateKey, me.session_id, "POST", "/vault/init", { auth_hash: "hash-of-a-new-pin", share: b64(random(32)) });

Deno.test({
  name: "the old PIN proved after a same-device raise puts the first-PIN grant out, and /vault/init no longer takes one",
  ...pooled,
  async fn() {
    const me = await person();
    const given = await share(me, me.pin);
    assertEquals(given.status, 200, `the old PIN did not open the share: ${JSON.stringify(given.body)}`);
    assertEquals(await grantOf(me.identity_id), null, "the grant lived on after the old PIN was proved");
    const taken = await init(me);
    assertEquals(taken.status, 409, "a new PIN was set by a grant the old PIN should have put out");
    assertEquals((taken.body as { error: { code: string } }).error.code, "no_first_pin_grant");
  },
});

Deno.test({
  name: "a wrong PIN does not touch the grant, and the other way — a new PIN by the grant — still works",
  ...pooled,
  async fn() {
    const me = await person();
    const wrong = await share(me, random(32));
    assertEquals(wrong.status, 409, JSON.stringify(wrong.body));
    assert(await grantOf(me.identity_id), "a wrong PIN put the grant out");
    await clearDelay(me.session_id);
    const taken = await init(me);
    assertEquals(taken.status, 204, `the grant did not take the new PIN: ${JSON.stringify(taken.body)}`);
    assertEquals(await grantOf(me.identity_id), null, "the grant was not spent by /vault/init");
  },
});

Deno.test({
  name: "a PIN changed with the old one puts the grant out as well",
  ...pooled,
  async fn() {
    const me = await person();
    const changed = await signedCall(me.pair.privateKey, me.session_id, "POST", "/vault/pin", {
      nonce: b64(random(16)), current_auth: b64(me.pin), next_auth_hash: await auth.sha256hex(random(32)), next_share: b64(random(32)),
    });
    assertEquals(changed.status, 200, `the PIN was not changed: ${JSON.stringify(changed.body)}`);
    assertEquals(await grantOf(me.identity_id), null, "the grant lived on after the PIN was changed with the old one");
  },
});
