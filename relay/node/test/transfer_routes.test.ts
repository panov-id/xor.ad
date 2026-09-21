// Moving an identity between two devices, end to end, against a real Postgres.
//
// The flow is the one screen 13 shows and §8.2 describes: the old device opens
// a window with a proof of its PIN, the new one types nine characters and
// leaves an envelope, the old one sees the claim and says "it is me", and only
// then does anything move. The envelopes here are opaque bytes, because that is
// what they are to the node — this suite never pretends to be able to open one.
//
// `GET /sessions/:lookup_id` is why the rest of it can exist at all: until
// 2026-09-21 neither device had any way to learn what happened, and the only
// call that could have served as a poll is the one that cancels the transfer
// (open-work G15, closed by the owner's decision).

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "transfer-routes-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "transfer-routes-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "transfer-routes-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/transfer.ts");

const KEY_ID = "ak_pub_transferroutestest";
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

async function device() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { pair, signPub: auth.bytesToBase64url(spki) };
}

let addresses = 0;
const nextAddress = () => `198.51.100.${++addresses % 250}`;

async function call(method: string, path: string, init: {
  body?: unknown;
  headers?: Record<string, string>;
  address?: string;
} = {}) {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "transfer-routes-origin-token",
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
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

async function signedCall(key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown) {
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

const PIN = crypto.getRandomValues(new Uint8Array(32));
const envelope = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(96)));

// A finished registration on one device, which is what a transfer starts from.
async function device_with_identity(pin: Uint8Array = PIN) {
  const { pair, signPub } = await device();
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(pin),
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
  return { ...created, pair };
}

const lookup = () => `lookup-${crypto.randomUUID()}`;
const proof = (pin: Uint8Array) => ({ auth: auth.bytesToBase64url(pin) });

Deno.test("an identity moves to another device, and the old one goes quiet", async () => {
  const old = await device_with_identity();
  const lookupId = lookup();

  // 1. The old device opens a window — with its PIN, because handing an
  //    identity over is one of the three irreversible things (§8.2).
  const invited = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookupId,
    ...proof(PIN),
  });
  assertEquals(invited.status, 200, JSON.stringify(invited.body));

  // 2. Nobody has typed it yet, and both sides can see exactly that.
  const waiting = await call("GET", `/sessions/${lookupId}`);
  assertEquals(waiting.status, 200);
  assertEquals((waiting.body as { state: string }).state, "waiting");

  // 3. The new device types the nine characters and leaves its envelope.
  const fresh = await device();
  const claimEnvelope = envelope();
  const claimed = await call("POST", "/sessions/claim", {
    body: { lookup_id: lookupId, envelope: claimEnvelope },
  });
  assertEquals(claimed.status, 200, JSON.stringify(claimed.body));

  // 4. The old device learns a claim arrived and gets the envelope it needs to
  //    show the four check characters. This is the step that had no route.
  const seen = await call("GET", `/sessions/${lookupId}`);
  assertEquals((seen.body as { state: string }).state, "claimed");
  assertEquals((seen.body as { claim_envelope: string }).claim_envelope, claimEnvelope);

  // 5. "It is me."
  const reply = envelope();
  const approved = await signedCall(
    old.pair.privateKey, old.session_id, "POST", `/sessions/${lookupId}/approve`,
    { reply, sign_pub: fresh.signPub, wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))), label: "a new phone" },
  );
  assertEquals(approved.status, 200, JSON.stringify(approved.body));
  const newSession = (approved.body as { session_id: string }).session_id;

  // 6. The new device collects the reply and its session id.
  const done = await call("GET", `/sessions/${lookupId}`);
  assertEquals((done.body as { state: string }).state, "approved");
  assertEquals((done.body as { reply_envelope: string }).reply_envelope, reply);
  assertEquals((done.body as { session_id: string }).session_id, newSession);

  // And what §8.2 says a move does to the device left behind: it goes quiet,
  // and its half of the vault key is gone.
  const [left] = await database.queryOrThrow<{ frozen_reason: string | null }>(
    `SELECT frozen_reason FROM sessions WHERE id = $1`,
    [old.session_id],
  );
  assertEquals(left.frozen_reason, "transfer");
  const [share] = await database.queryOrThrow<{ share_enc: Uint8Array | null; burned_at: Date | null }>(
    `SELECT share_enc, burned_at FROM vault_shares WHERE session = $1`,
    [old.session_id],
  );
  assertEquals(share.share_enc, null, "the old device kept its share");
  assert(share.burned_at, "the burn was not recorded");

  // The arriving device has no PIN yet, so it is left the one-time right.
  const [identity] = await database.queryOrThrow<{ first_pin_grant_at: Date | null }>(
    `SELECT first_pin_grant_at FROM identities WHERE id = $1`,
    [old.identity_id],
  );
  assert(identity.first_pin_grant_at, "no first-PIN grant for the arriving device");

  // The old device's signature opens nothing any more.
  const stale = await signedCall(old.pair.privateKey, old.session_id, "GET", "/identities/me");
  assertEquals(stale.status, 401);
});

Deno.test("without a PIN the window does not open", async () => {
  // A stolen signing key alone must not start a transfer (§8.2, 2026-09-11).
  const old = await device_with_identity();
  const wrong = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookup(),
    auth: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
  });
  assertEquals(wrong.status, 409);
  assertEquals((wrong.body as { error: { code: string } }).error.code, "unauthorized");
});

Deno.test("a second claim cancels the transfer, and both sides are told", async () => {
  // §8.2, 2026-09-15 (SEC-5): somebody who read the code over a shoulder and
  // typed it first must not win silently. The invitation dies instead.
  const old = await device_with_identity();
  const lookupId = lookup();
  await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookupId,
    ...proof(PIN),
  });

  const first = await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } });
  assertEquals(first.status, 200);
  const second = await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } });
  assertEquals(second.status, 409, "a second claim was allowed to stand");

  const state = await call("GET", `/sessions/${lookupId}`);
  assertEquals((state.body as { state: string }).state, "cancelled");

  // And approving it afterwards moves nothing.
  const late = await signedCall(
    old.pair.privateKey, old.session_id, "POST", `/sessions/${lookupId}/approve`,
    { reply: envelope(), sign_pub: (await device()).signPub, wrap_pub: auth.bytesToBase64url(new Uint8Array(91)) },
  );
  assertEquals(late.status, 409);
  const [session] = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE id = $1`,
    [old.session_id],
  );
  assertEquals(session.frozen_at, null, "a cancelled transfer still froze the old device");
});

Deno.test("only the session that issued the invitation can decide it", async () => {
  const old = await device_with_identity();
  const stranger = await device_with_identity(crypto.getRandomValues(new Uint8Array(32)));
  const lookupId = lookup();
  await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookupId,
    ...proof(PIN),
  });
  await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } });

  const theirs = await signedCall(
    stranger.pair.privateKey, stranger.session_id, "POST", `/sessions/${lookupId}/approve`,
    { reply: envelope(), sign_pub: (await device()).signPub, wrap_pub: auth.bytesToBase64url(new Uint8Array(91)) },
  );
  assertEquals(theirs.status, 404, "another identity approved somebody's transfer");
  // And it is still claimable by its owner afterwards: a stranger's attempt
  // must not consume the invitation either.
  const state = await call("GET", `/sessions/${lookupId}`);
  assertEquals((state.body as { state: string }).state, "claimed");
});

Deno.test("a refusal kills the code and moves nothing", async () => {
  const old = await device_with_identity();
  const lookupId = lookup();
  await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookupId,
    ...proof(PIN),
  });
  await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } });

  const rejected = await signedCall(
    old.pair.privateKey, old.session_id, "POST", `/sessions/${lookupId}/reject`,
  );
  assertEquals(rejected.status, 204);

  const state = await call("GET", `/sessions/${lookupId}`);
  assertEquals((state.body as { state: string }).state, "rejected");
  const [session] = await database.queryOrThrow<{ frozen_at: Date | null }>(
    `SELECT frozen_at FROM sessions WHERE id = $1`,
    [old.session_id],
  );
  assertEquals(session.frozen_at, null, "a refused transfer still froze the old device");
});

Deno.test("an expired invitation cannot be claimed, and says so like a wrong code", async () => {
  const old = await device_with_identity();
  const lookupId = lookup();
  await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookupId,
    ...proof(PIN),
  });
  // Two minutes, aged rather than waited out.
  await database.queryOrThrow(
    `UPDATE session_invites SET expires_at = now() - interval '1 second' WHERE lookup_id = $1`,
    [lookupId],
  );

  const late = await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } });
  assertEquals(late.status, 404);
  const wrong = await call("POST", "/sessions/claim", { body: { lookup_id: lookup(), envelope: envelope() } });
  assertEquals(
    (late.body as { error: { code: string } }).error.code,
    (wrong.body as { error: { code: string } }).error.code,
    "an expired code and a wrong one are told apart",
  );
  const state = await call("GET", `/sessions/${lookupId}`);
  assertEquals((state.body as { state: string }).state, "expired");
});

Deno.test("a second window closes the first, rather than racing it", async () => {
  // One invitation in flight per identity: two live codes would mean two
  // devices racing to become the single live session.
  const old = await device_with_identity();
  const first = lookup();
  const second = lookup();
  await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: first,
    ...proof(PIN),
  });
  const again = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: second,
    ...proof(PIN),
  });
  assertEquals(again.status, 200, JSON.stringify(again.body));

  assertEquals((((await call("GET", `/sessions/${first}`)).body) as { state: string }).state, "cancelled");
  assertEquals((((await call("GET", `/sessions/${second}`)).body) as { state: string }).state, "waiting");
});

addEventListener("unload", () => {
  database.closePool();
});
