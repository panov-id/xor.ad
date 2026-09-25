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

async function signedCall(
  key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown, address?: string,
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
    address,
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
  const paper = crypto.randomUUID();
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(pin),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: paper,
    },
  });
  assertEquals(answer.status, 200, "the registration failed");
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair, paper };
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

// An approval that passed the guard before a close committed must not seat a
// new session in the closed identity (review panel 2026-09-24, security lens).
// Another connection holds the vault row a close takes first; the identity is
// closed there while the approval waits on it.
Deno.test("an approval waiting on a close moves nothing into the closed identity", async () => {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const old = await device_with_identity();
  const lookupId = lookup();
  assertEquals((await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite",
    { lookup_id: lookupId, ...proof(PIN) })).status, 200);
  const fresh = await device();
  assertEquals((await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } })).status, 200);
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
  const got: { approved?: { status: number; body: unknown } } = {};
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [old.session_id]);
      const pending = signedCall(old.pair.privateKey, old.session_id, "POST", `/sessions/${lookupId}/approve`,
        { reply: envelope(), sign_pub: fresh.signPub, wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))), label: "x" })
        .then((r) => (got.approved = r));
      await new Promise((r) => setTimeout(r, 300));
      await tx.unsafe(`UPDATE identities SET closed_at = now() WHERE id = (SELECT identity FROM sessions WHERE id = $1)`, [old.session_id]);
      void pending;
    });
    for (let i = 0; i < 150 && !got.approved; i++) await new Promise((r) => setTimeout(r, 20));
    assert(got.approved, "the approval never answered");
    const [seated] = await database.queryOrThrow<{ n: string }>(
      `SELECT count(*)::text AS n FROM sessions WHERE identity = (SELECT identity FROM sessions WHERE id = $1) AND id <> $1`,
      [old.session_id]);
    assertEquals(seated.n, "0", `a new session was seated in a closed identity (answer ${got.approved.status})`);
  } finally {
    await sql.end();
  }
});

// An approval waiting on its own share while the paper code raised the
// identity elsewhere (verifier, 2026-09-25, reproduced): the claim froze the
// old session and seated the owner's new one; the approval, let through after,
// froze the owner and seated the invited device — the lost phone taking the
// identity back past the paper code. The approval must find its own session
// frozen and move nothing.
Deno.test("an approval waiting while the paper code raised the identity moves nothing", async () => {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const old = await device_with_identity();
  const lookupId = lookup();
  assertEquals((await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite",
    { lookup_id: lookupId, ...proof(PIN) })).status, 200);
  const fresh = await device();
  assertEquals((await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } })).status, 200);
  const owner = crypto.randomUUID();
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
  const got: { approved?: { status: number; body: unknown } } = {};
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [old.session_id]);
      const pending = signedCall(old.pair.privateKey, old.session_id, "POST", `/sessions/${lookupId}/approve`,
        { reply: envelope(), sign_pub: fresh.signPub, wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))), label: "x" })
        .then((r) => (got.approved = r));
      await new Promise((r) => setTimeout(r, 300));
      // What a claim by the paper code does: the old device frozen and burned,
      // the owner's new one seated.
      await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`, [old.session_id]);
      await tx.unsafe(`UPDATE vault_shares SET share_enc = NULL, burned_at = now() WHERE session = $1`, [old.session_id]);
      await tx.unsafe(
        `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key)
         VALUES ($1, $2, 'owner-key', 'owner-key')`, [owner, old.identity_id]);
      void pending;
    });
    for (let i = 0; i < 150 && !got.approved; i++) await new Promise((r) => setTimeout(r, 20));
    assert(got.approved, "the approval never answered");
    const rows = await database.queryOrThrow<{ id: string; frozen: boolean }>(
      `SELECT id, frozen_at IS NOT NULL AS frozen FROM sessions WHERE identity = $1 AND id <> $2`,
      [old.identity_id, old.session_id]);
    assertEquals(rows.map((r) => ({ id: r.id, frozen: r.frozen })), [{ id: owner, frozen: false }],
      `the approval froze the owner raised by the paper code, or seated the invited device (answer ${got.approved.status}): ${JSON.stringify(rows)}`);
    assertEquals(got.approved.status, 401);
  } finally {
    await sql.end();
  }
});

Deno.test("without a PIN the window does not open", async () => {
  // A stolen signing key alone must not start a transfer (§8.2, 2026-09-11).
  const old = await device_with_identity();
  const wrong = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookup(),
    auth: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
  });
  assertEquals(wrong.status, 409);
  assertEquals((wrong.body as { error: { code: string } }).error.code, "pin_mismatch");
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

Deno.test("guessing the PIN at the transfer window costs what guessing costs", async () => {
  // The window asks for a proof of the PIN because a stolen signing key must
  // not be enough to hand the identity away. Until 2026-09-21 it checked that
  // proof by hand — one comparison, one metric — while the counter, the
  // delays and the freeze on the tenth all lived in POST /vault/share alone.
  // So the most irreversible of the three actions was the one place where a
  // PIN could be searched without limit. Found by the security lens of the
  // review panel.
  const old = await device_with_identity();
  const wrongPin = () => ({ auth: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))) });

  // Five misses: the counter goes down, and it is the node saying so.
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    const miss = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
      lookup_id: lookup(),
      ...wrongPin(),
    });
    assertEquals(miss.status, 409, JSON.stringify(miss.body));
    seen.push((miss.body as { error: { attempts_left?: number } }).error.attempts_left ?? -1);
  }
  assertEquals(seen, [9, 8, 7, 6, 5], "the transfer window is not spending attempts");

  // And the sixth waits, by §8.2's own numbers, instead of answering at once.
  const early = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookup(),
    ...wrongPin(),
  });
  assertEquals(early.status, 429, JSON.stringify(early.body));
  assert(early.headers.get("retry-after"), "the delay was not given as a header");
});

Deno.test("opening transfer windows is limited per address, as typing a code is", async () => {
  // Open-work P2. The window spends a PIN attempt against its own device, but
  // that counter is per device: an address with many stolen signing keys could
  // open windows without end. The paper code's numbers, because the act is the
  // same kind — a person does it once or twice (limits.tsv transfer.invite.*).
  const address = "203.0.113.77";
  const old = await device_with_identity();
  for (let i = 0; i < 10; i++) {
    const open = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
      lookup_id: lookup(),
      ...proof(PIN),
    }, address);
    assertEquals(open.status, 200, `window ${i + 1} of 10 was refused: ${JSON.stringify(open.body)}`);
  }
  const eleventh = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookup(),
    ...proof(PIN),
  }, address);
  assertEquals(eleventh.status, 429, `the eleventh window in an hour opened: ${JSON.stringify(eleventh.body)}`);
  assert(eleventh.headers.get("retry-after"), "the limit did not say when to come back");

  // Another address is not held up by this one.
  const elsewhere = await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", {
    lookup_id: lookup(),
    ...proof(PIN),
  });
  assertEquals(elsewhere.status, 200, "one address's limit closed the route for another");
});

// The approval against the routes that move the same identity
// (identity.lock.order; the verifier's probes, 2026-09-25). A rival transaction
// holds the row the first of the two needs; the second is sent behind it; the
// hold is let go and both must finish without Postgres choosing a victim.
const deadlocks = async () => (await database.queryOrThrow<{ n: number }>(
  `SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`))[0].n;
async function behind(hold: string, arg: string, first: () => Promise<unknown>, second: () => Promise<unknown>) {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
  const done: unknown[] = [];
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(hold, [arg]);
      first().then((r) => (done[0] = r));
      await new Promise((r) => setTimeout(r, 300));
      second().then((r) => (done[1] = r));
      await new Promise((r) => setTimeout(r, 300));
    });
    for (let i = 0; i < 250 && (done[0] === undefined || done[1] === undefined); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
  } finally {
    await sql.end();
  }
}
async function claimed(old: Awaited<ReturnType<typeof device_with_identity>>) {
  const lookupId = lookup();
  assertEquals((await signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite",
    { lookup_id: lookupId, ...proof(PIN) })).status, 200);
  assertEquals((await call("POST", "/sessions/claim", { body: { lookup_id: lookupId, envelope: envelope() } })).status, 200);
  return { lookupId, invited: await device() };
}
const approval = (old: Awaited<ReturnType<typeof device_with_identity>>, lookupId: string, signPub: string) =>
  signedCall(old.pair.privateKey, old.session_id, "POST", `/sessions/${lookupId}/approve`, {
    reply: envelope(), sign_pub: signPub,
    wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))), label: "new phone",
  });

Deno.test({ name: "an approval and a new invitation from the same session queue on the share instead of deadlocking", sanitizeOps: false, sanitizeResources: false }, async () => {
  const old = await device_with_identity();
  const { lookupId, invited } = await claimed(old);
  const got: Record<string, { status: number; body: unknown }> = {};
  const before = await deadlocks();
  // The approval waits on the invitation; the new window is sent behind it.
  // Before: the approval took the invitation and wanted the share, the window
  // held the share and wanted the invitations — deadlock three in three.
  await behind(`SELECT 1 FROM session_invites WHERE lookup_id = $1 FOR UPDATE`, lookupId,
    () => approval(old, lookupId, invited.signPub).then((r) => (got.approve = r)),
    () => signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite", { lookup_id: lookup(), ...proof(PIN) })
      .then((r) => (got.invite = r)));
  assertEquals((await deadlocks()) - before, 0,
    `approve ${got.approve?.status} and invite ${got.invite?.status} deadlocked`);
  assertEquals(got.approve?.status, 200, `the approval answered ${got.approve?.status} ${JSON.stringify(got.approve?.body)}`);
  // The window came second and found its session frozen by the move.
  assertEquals(got.invite?.status, 401,
    `the frozen session's window answered ${got.invite?.status} ${JSON.stringify(got.invite?.body)}`);
});

Deno.test({ name: "a paper-code claim behind an approval seats the owner, not a 503", sanitizeOps: false, sanitizeResources: false }, async () => {
  const misses = await import("../src/lib/recovery_misses.ts");
  misses.reset();
  const old = await device_with_identity();
  const { lookupId, invited } = await claimed(old);
  const owner = await device();
  const got: Record<string, { status: number; body: unknown }> = {};
  const before = await deadlocks();
  // The approval gets the old share first and seats the invited device; the
  // claim read the old session as the live one before it waited. Before: the
  // claim froze a session already frozen, met the invited one on the
  // one-live-session index, and answered 503 to the person with the paper.
  await behind(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, old.session_id,
    () => approval(old, lookupId, invited.signPub).then((r) => (got.approve = r)),
    () => call("POST", "/recovery/claim", { body: { lookup_id: old.paper, sign_pub: owner.signPub,
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))) } }).then((r) => (got.claim = r)));
  try {
    assertEquals((await deadlocks()) - before, 0, `approve ${got.approve?.status} and claim ${got.claim?.status} deadlocked`);
    assertEquals(got.approve?.status, 200, `the approval answered ${got.approve?.status}`);
    assertEquals(got.claim?.status, 200, `the paper-code claim answered ${got.claim?.status} ${JSON.stringify(got.claim?.body)}`);
    const live = await database.queryOrThrow<{ sign: string }>(
      `SELECT sign_public_key AS sign FROM sessions WHERE identity = $1 AND frozen_at IS NULL`, [old.identity_id]);
    assertEquals(live.map((r) => r.sign), [owner.signPub], "the paper code did not leave the owner's device the only live one");
  } finally {
    misses.reset();
  }
});

// A frozen phone's wrong PIN on a new invitation (review panel 2026-09-25,
// security and operations lenses). The session is asked again before the PIN:
// asked after it, a wrong PIN spent an attempt on the burned row and answered
// 409 where a right one answered 401 — whether a PIN was right, told to a
// device that no longer holds the identity.
Deno.test({ name: "a session frozen while its invitation waited is refused before its PIN is looked at", sanitizeOps: false, sanitizeResources: false }, async () => {
  const old = await device_with_identity();
  const { lookupId, invited } = await claimed(old);
  const got: Record<string, { status: number; body: unknown }> = {};
  await behind(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, old.session_id,
    () => approval(old, lookupId, invited.signPub).then((r) => (got.approve = r)),
    () => signedCall(old.pair.privateKey, old.session_id, "POST", "/sessions/invite",
      { lookup_id: lookup(), auth: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))) })
      .then((r) => (got.invite = r)));
  assertEquals(got.approve?.status, 200, `the approval answered ${got.approve?.status}`);
  assertEquals(got.invite?.status, 401, `the frozen session's wrong PIN answered ${got.invite?.status} ${JSON.stringify(got.invite?.body)}`);
  const [row] = await database.queryOrThrow<{ attempts_left: number }>(
    `SELECT attempts_left FROM vault_shares WHERE session = $1`, [old.session_id]);
  assertEquals(row.attempts_left, 10, "the frozen session's wrong PIN spent an attempt");
});

// A first PIN or a new invitation queued on the share while the sweeper closes
// the identity and its catch-up pass runs (verifier, 2026-09-25). The pass
// froze sessions before burning shares in one statement; the route held the
// share and asked for the session — three deadlocks in three, the sweep the
// victim, and the closed identity kept a live session with an unburned share.
for (const which of ["vault/init", "invite"] as const) {
  Deno.test({ name: `the catch-up pass waits on a ${which} holding the share, and leaves nothing live`, sanitizeOps: false, sanitizeResources: false }, async () => {
    const sweep = await import("../src/lib/identity_sweeper.ts");
    for (let round = 0; round < 3; round++) {
      const me = await device_with_identity();
      assertEquals((await signedCall(me.pair.privateKey, me.session_id, "POST", "/recovery/claim",
        { lookup_id: me.paper })).status, 200, "the same-device claim that leaves a grant");
      const got: { status: number; body: unknown }[] = [];
      let sweepError = "";
      let swept: Promise<unknown> | undefined;
      const firstPin = {
        auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
        share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      };
      const before = await deadlocks();
      await behind(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, me.session_id,
        () => (which === "vault/init"
          ? signedCall(me.pair.privateKey, me.session_id, "POST", "/vault/init", firstPin)
          : signedCall(me.pair.privateKey, me.session_id, "POST", "/sessions/invite", { lookup_id: lookup(), ...proof(PIN) }))
          .then((r) => (got[0] = r)),
        async () => {
          // closeInactive's commit, in its effect on the row, then the pass.
          await database.queryOrThrow(`UPDATE identities SET closed_at = now(), recovery_auth_hash = NULL,
            recovery_wrapped_key = NULL, first_pin_grant_at = NULL WHERE id = $1`, [me.identity_id]);
          swept = sweep.sweepIdentities().catch((e) => { sweepError = String(e); });
          return "sent";
        });
      await swept;
      for (let i = 0; i < 250 && got[0] === undefined; i++) await new Promise((r) => setTimeout(r, 20));
      assertEquals((await deadlocks()) - before, 0, `round ${round}: ${which} and the catch-up pass deadlocked (sweep: ${sweepError || "ok"})`);
      assertEquals(sweepError, "", `round ${round}: the pass failed: ${sweepError}`);
      assert(got[0] && got[0].status !== 200 && got[0].status !== 204 && got[0].status !== 503,
        `round ${round}: ${which} on a closed identity answered ${got[0]?.status} ${JSON.stringify(got[0]?.body)}`);
      const [left] = await database.queryOrThrow<{ live: number; unburned: number }>(
        `SELECT (SELECT count(*)::int FROM sessions WHERE identity = $1 AND frozen_at IS NULL) AS live,
                (SELECT count(*)::int FROM vault_shares v JOIN sessions s ON s.id = v.session
                  WHERE s.identity = $1 AND v.share_enc IS NOT NULL) AS unburned`, [me.identity_id]);
      assertEquals([left.live, left.unburned], [0, 0], `round ${round}: the closed identity kept a live session or share`);
    }
  });
}

// A claim from a new device while the only session is frozen by the tenth
// wrong PIN, racing a same-device claim by the same code (verifier,
// 2026-09-25). Nothing was live, so the new-device claim locked nothing and
// met the raised session on the one-live-session index: 503, three in three.
Deno.test({ name: "a new-device claim behind a same-device claim on a PIN-locked identity seats, not a 503", sanitizeOps: false, sanitizeResources: false }, async () => {
  const misses = await import("../src/lib/recovery_misses.ts");
  try {
    for (let round = 0; round < 3; round++) {
      misses.reset();
      const me = await device_with_identity();
      await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
      await database.queryOrThrow(`UPDATE vault_shares SET attempts_left = 0, locked_at = now() WHERE session = $1`, [me.session_id]);
      const fresh = await device();
      const got: Record<string, { status: number; body: unknown }> = {};
      await behind(`SELECT id FROM identities WHERE id = $1 FOR UPDATE`, me.identity_id,
        () => signedCall(me.pair.privateKey, me.session_id, "POST", "/recovery/claim", { lookup_id: me.paper })
          .then((r) => (got.same = r)),
        () => call("POST", "/recovery/claim", { body: { lookup_id: me.paper, sign_pub: fresh.signPub,
          wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))) } }).then((r) => (got.fresh = r)));
      assertEquals(got.same?.status, 200, `round ${round}: the same-device claim answered ${got.same?.status}`);
      assertEquals(got.fresh?.status, 200, `round ${round}: the new-device claim answered ${got.fresh?.status} ${JSON.stringify(got.fresh?.body)}`);
      const live = await database.queryOrThrow<{ sign: string }>(
        `SELECT sign_public_key AS sign FROM sessions WHERE identity = $1 AND frozen_at IS NULL`, [me.identity_id]);
      assertEquals(live.map((r) => r.sign), [fresh.signPub], `round ${round}: the later claim's device is not the only live one`);
    }
  } finally {
    misses.reset();
  }
});

// A close against a paper-code claim from a new device, when the identity also
// has a session frozen by the tenth wrong PIN, its share unburned, sorting
// before the closer (verifier, 2026-09-25). The claim takes every share of the
// identity in order; the close held its own and burned the frozen one's last —
// each held what the other wanted, and the person with the code got a 503.
// The state is built by the routes alone.
// The same state against a same-device claim from the frozen sibling (review
// panel 2026-09-25, data lens; identity.close.lockorder): it holds its own
// share and raises its session, which waits on the one-live index for the
// close — while the close, holding its own share, burned the sibling's last.
for (const from of ["a new device", "the frozen sibling"] as const) {
Deno.test({ name: `a close and a claim from ${from} over a PIN-locked sibling queue on the shares instead of deadlocking`, sanitizeOps: false, sanitizeResources: false }, async () => {
  const misses = await import("../src/lib/recovery_misses.ts");
  const wrap = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91)));
  let rounds = 0;
  try {
    for (let tried = 0; rounds < 3 && tried < 20; tried++) {
      misses.reset();
      const me = await device_with_identity();
      await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
      await database.queryOrThrow(`UPDATE vault_shares SET attempts_left = 0, locked_at = now() WHERE session = $1`, [me.session_id]);
      const a = await device();
      const seated = await call("POST", "/recovery/claim", { body: { lookup_id: me.paper, sign_pub: a.signPub, wrap_pub: wrap() } });
      assertEquals(seated.status, 200, "the claim that seats the closer");
      const closer = (seated.body as { session_id: string }).session_id;
      // The frozen sibling must sort first, or the claim takes the closer's
      // share before the sibling's and the two never cross.
      if (!(me.session_id < closer)) continue;
      const pin = crypto.getRandomValues(new Uint8Array(32));
      assertEquals((await signedCall(a.pair.privateKey, closer, "POST", "/vault/init", {
        auth_hash: await auth.sha256hex(pin), share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      })).status, 204, "the closer's first PIN");
      const fresh = await device();
      const got: Record<string, { status: number; body: unknown }> = {};
      const before = await deadlocks();
      await behind(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, me.identity_id,
        () => signedCall(a.pair.privateKey, closer, "POST", "/identities/close",
          { nonce: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16))), auth: auth.bytesToBase64url(pin) })
          .then((r) => (got.close = r)),
        () => (from === "a new device"
          ? call("POST", "/recovery/claim", { body: { lookup_id: me.paper, sign_pub: fresh.signPub, wrap_pub: wrap() } })
          : signedCall(me.pair.privateKey, me.session_id, "POST", "/recovery/claim", { lookup_id: me.paper }))
          .then((r) => (got.claim = r)));
      assertEquals((await deadlocks()) - before, 0,
        `round ${rounds}: the close and the claim deadlocked: close ${got.close?.status}, claim ${got.claim?.status} ${JSON.stringify(got.claim?.body)}`);
      assertEquals(got.close?.status, 200, `round ${rounds}: the close answered ${got.close?.status}`);
      // The close went first: the code is gone, and the claim is told so.
      assertEquals(got.claim?.status, 404, `round ${rounds}: the claim after the close answered ${got.claim?.status} ${JSON.stringify(got.claim?.body)}`);
      rounds++;
    }
    assertEquals(rounds, 3, "the ids never sorted the frozen sibling first");
  } finally {
    misses.reset();
  }
});
}
