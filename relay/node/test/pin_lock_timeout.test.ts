// The PIN routes bound what they wait on (B81, from the verifier on B70).
//
// POST /vault/share, POST /vault/pin and POST /sessions/invite ran checkPin
// with no lock timeout of their own. The tenth miss's freeze waits on the
// session's row, which a consent to a match holds FOR SHARE, and it waited the
// whole statement timeout — fifteen seconds of a pooled connection, a quarter
// of the pool — before the miss was counted. Each now sets two seconds, as
// closeOnce does: the freeze gives up under its savepoint, the miss stands,
// and the minute's job freezes the session.
//
// And checkPin refuses a wrapper around a transaction's query function on the
// first attempt, not at the tenth, where savepoint() refusing it took the miss
// back whole (lib/db.ts inTransaction).

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "pin-lock-timeout-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
// Believed x-client-ip, so each request comes from an address of its own and
// no case meets a per-address ceiling it is not about.
Deno.env.set("ORIGIN_TOKEN", "pin-lock-timeout-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "pin-lock-timeout-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const postgres = (await import("npm:postgres@3.4.4")).default;
const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { takeDownLeftByPinLimit } = await import("../src/lib/take_down.ts");
await import("../src/routes/identity.ts"); // registers the routes as a side effect
await import("../src/routes/transfer.ts");

const KEY_ID = "ak_pub_pinlocktimeout01";
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
const b64 = (bytes: Uint8Array) => auth.bytesToBase64url(bytes);

let addresses = 0;
async function call(
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  let response: Response;
  try {
    response = await found.h({
      req: new Request(url, {
        method,
        headers: {
          "x-protocol-version": String(auth.PROTOCOL_MAJOR),
          "x-origin-token": "pin-lock-timeout-origin-token",
          "x-client-ip": `198.51.100.${++addresses % 250}`,
          ...(raw === undefined ? {} : { "content-type": "application/json" }),
          ...(init.headers ?? {}),
        },
        body: raw,
      }),
      params: found.params,
      url,
    });
  } catch (error) {
    // A route that lets the error out answers 500 through the server's own
    // handler; here the error itself is the answer worth reading.
    return { status: 500, body: { thrown: (error as { code?: string })?.code ?? String(error) } };
  }
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
    headers: { "x-identity-session": sessionId, "x-identity-time": String(time), "x-identity-sign": b64(signature) },
  });
}

const PIN = crypto.getRandomValues(new Uint8Array(32));
const wrongPin = () => b64(crypto.getRandomValues(new Uint8Array(32)));
const nonce16 = () => b64(crypto.getRandomValues(new Uint8Array(16)));

// Registered, finished by the paper code, one attempt left, and one live
// phrase for the take-down to take.
async function onTheLastAttempt() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: b64(spki),
      wrap_pub: b64(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(PIN),
      share: b64(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assert(answer.status >= 200 && answer.status < 300, `registration answered ${answer.status}: ${JSON.stringify(answer.body)}`);
  const me = { ...(answer.body as { identity_id: string; session_id: string }), key: pair.privateKey };
  const confirmed = await signedCall(me.key, me.session_id, "POST", "/recovery/confirm",
    { recovery_wrapped_key: b64(crypto.getRandomValues(new Uint8Array(48))) });
  assertEquals(confirmed.status, 204, "the registration was not finished");
  await database.queryOrThrow(`UPDATE vault_shares SET attempts_left = 1, next_attempt_at = NULL WHERE session = $1`,
    [me.session_id]);
  const phrase = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
       lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'sosed', $2, 'десятая', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '1 hour')`,
    [phrase, me.identity_id],
  );
  return { ...me, phrase };
}

async function stateOf(me: { session_id: string; phrase: string }) {
  const [row] = await database.queryOrThrow<{ attempts_left: number; locked: boolean; frozen: string | null }>(
    `SELECT v.attempts_left, v.locked_at IS NOT NULL AS locked, s.frozen_reason AS frozen
       FROM vault_shares v JOIN sessions s ON s.id = v.session WHERE s.id = $1`, [me.session_id]);
  const live = (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [me.phrase])).length === 1;
  return { ...row, live };
}

type Tx = { unsafe: (q: string, args?: unknown[]) => Promise<unknown> };

// Waits until a statement of another backend is queued on a lock this
// transaction holds, and returns its text: the witness that the step under
// test met the held row, not something else.
async function waitingOn(tx: Tx, what: string): Promise<string> {
  const [{ p }] = await tx.unsafe(`SELECT pg_backend_pid() AS p`) as { p: number }[];
  for (let i = 0; i < 250; i++) {
    await tx.unsafe(`SELECT pg_stat_clear_snapshot()`);
    const rows = await tx.unsafe(
      `SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))`, [p],
    ) as { query: string }[];
    if (rows.length > 0) return rows[0].query.replace(/\s+/g, " ").slice(0, 160);
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`${what}: nothing queued on the held row after five seconds — the case never ran`);
}

// The tenth miss sent while `hold` keeps rows of its own in a second
// connection; `then` runs on that connection once the miss is queued behind
// them. Answers what the route said and which statement waited.
async function tenthMissAgainst(
  send: () => Promise<{ status: number; body: unknown }>,
  hold: (tx: Tx) => Promise<void>,
  then: (tx: Tx) => Promise<void> = async () => {},
) {
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  let answer: { status: number; body: unknown } | null = null;
  let waited = "";
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await hold(tx);
      const pending = send();
      waited = await waitingOn(tx, "the tenth miss");
      await then(tx);
      answer = await pending;
    });
  } finally {
    await sql.end();
  }
  assert(answer, "the tenth miss never answered");
  return { answer: answer as { status: number; body: unknown }, waited };
}

const pooled = { sanitizeOps: false, sanitizeResources: false };

// A consent's hold on the session: FOR SHARE, which the route's own reads of
// the session pass and the freeze's UPDATE waits on.
const consentHolds = (me: { session_id: string }) => async (tx: Tx) => {
  await tx.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR SHARE`, [me.session_id]);
};

type Me = Awaited<ReturnType<typeof onTheLastAttempt>>;

async function boundedTenthMiss(route: string, send: (me: Me) => Promise<{ status: number; body: unknown }>) {
  const me = await onTheLastAttempt();
  const started = Date.now();
  const { answer, waited } = await tenthMissAgainst(() => send(me), consentHolds(me));
  const took = Date.now() - started;
  assert(waited.startsWith("UPDATE sessions SET frozen_at"), `${route}: the statement that waited was not the freeze: ${waited}`);
  assert(took < 5000,
    `${route}: the tenth miss waited ${took} ms on a session a consent holds — no lock timeout of its own, a pooled connection held for the statement timeout`);
  const state = await stateOf(me);
  assertEquals(state.attempts_left, 0, `${route}: the tenth miss was not counted (${answer.status} ${JSON.stringify(answer.body)})`);
  assert(state.locked, `${route}: the tenth miss did not close entry`);
  assertEquals(answer.status, 409, `${route}: answered ${answer.status} ${JSON.stringify(answer.body)}`);
  assertEquals(state.frozen, null, `${route}: the session froze under a held row`);
  await takeDownLeftByPinLimit();
  assertEquals((await stateOf(me)).frozen, "pin_limit", `${route}: the minute's job did not freeze the session`);
}

Deno.test({ name: "POST /vault/share bounds the tenth miss's wait on a held session (B81)", ...pooled }, async () => {
  await boundedTenthMiss("/vault/share", (me) => signedCall(me.key, me.session_id, "POST", "/vault/share", { auth: wrongPin() }));
});

Deno.test({ name: "POST /vault/pin bounds the tenth miss's wait on a held session (B81)", ...pooled }, async () => {
  await boundedTenthMiss("/vault/pin", (me) => signedCall(me.key, me.session_id, "POST", "/vault/pin", {
    nonce: nonce16(),
    current_auth: wrongPin(),
    next_auth_hash: "0".repeat(64),
    next_share: b64(crypto.getRandomValues(new Uint8Array(32))),
  }));
});

Deno.test({ name: "POST /sessions/invite bounds the tenth miss's wait on a held session (B81)", ...pooled }, async () => {
  await boundedTenthMiss("/sessions/invite", (me) => signedCall(me.key, me.session_id, "POST", "/sessions/invite", {
    lookup_id: `b81-${crypto.randomUUID()}`,
    auth: wrongPin(),
  }));
});

Deno.test({ name: "checkPin refuses a wrapper around a transaction's run on the first attempt, and spends nothing (B81)", ...pooled }, async () => {
  const { checkPin } = await import("../src/lib/pin_attempts.ts");
  const { Freezes } = await import("../src/lib/sessions.ts");
  const me = await onTheLastAttempt();
  await database.queryOrThrow(`UPDATE vault_shares SET attempts_left = 10 WHERE session = $1`, [me.session_id]);
  let refused = "";
  try {
    await database.transaction((run) => {
      // What a log or a metric around the route's run would look like.
      const logged = (<R>(text: string, args?: unknown[]) => run<R>(text, args)) as typeof run;
      return checkPin(logged, me.session_id, "0".repeat(64), () => {}, new Freezes());
    });
  } catch (error) {
    refused = String(error);
  }
  assert(refused.includes("checkPin() takes the query function of a transaction()"),
    `a wrapper around the transaction's run went through checkPin on the first attempt (${refused || "no refusal"}): it would be refused only at the tenth, by savepoint(), and take the miss back whole`);
  assertEquals((await stateOf(me)).attempts_left, 10, "the refused attempt was spent");
});

addEventListener("unload", () => {
  database.closePool();
});
