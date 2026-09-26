// The tenth PIN miss must stand whatever the freeze and the take-down after it
// meet (B70, from B69 and review panel 4, 2026-09-26).
//
// checkPin (lib/pin_attempts.ts) counts the tenth miss and locks entry, then
// freezes the session and takes down what is live. The freeze and the
// take-down each wait on rows other paths hold, under a lock timeout of two
// seconds (POST /identities/close; takeDownLive's own), and in an order a
// consent to a match takes the other way round. Whatever they meet — 55P03,
// 40P01, 57014 — only they may go back: the attempt stays counted and entry
// stays closed, and the minute's job (take_down.ts, takeDownLeftByPinLimit)
// finishes the freeze and the take-down. Otherwise the tenth attempt is not
// spent and the PIN can be tried again, as many times as the lock can be made
// to time out.
//
// Until B70 the two were wrapped in raw SAVEPOINTs, and postgres.js 3.4.4
// rejects the whole sql.begin once any statement in it failed, a caught one
// rolled back to a savepoint included (measured in a throwaway postgres:16,
// B69). The test for B59 (identity_routes.test.ts) rejected a promise in
// JavaScript instead of failing a statement, so it passed. Here every failure
// is a real one: a second connection holds the row the step needs.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "pin-rollback-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
// Believed x-client-ip, so each request comes from an address of its own and
// no case meets a per-address ceiling it is not about.
Deno.env.set("ORIGIN_TOKEN", "pin-rollback-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "pin-rollback-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const postgres = (await import("npm:postgres@3.4.4")).default;
const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { takeDownLeftByPinLimit } = await import("../src/lib/take_down.ts");
const { render } = await import("../src/lib/metrics.ts");
// Counted once the route's transaction commits, and only for a freeze whose
// savepoint survived (lib/sessions.ts Freezes; pin_attempts.ts, B64).
const pinLimitFreezes = () =>
  Number(render().match(/relay_sessions_frozen_total\{reason="pin_limit"\} (\d+)/)?.[1] ?? 0);
await import("../src/routes/identity.ts"); // registers the routes as a side effect

const KEY_ID = "ak_pub_pinlimitrollback1";
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
          "x-origin-token": "pin-rollback-origin-token",
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

function assertCounted(state: { attempts_left: number; locked: boolean }, answer: { status: number; body: unknown }, how: string) {
  assertEquals(state.attempts_left, 0,
    `${how}: the tenth miss went back whole — attempts_left ${state.attempts_left}, the route answered ${answer.status} ${JSON.stringify(answer.body)}; the PIN can be tried again`);
  assert(state.locked, `${how}: the tenth miss did not close entry`);
  assertEquals(answer.status, 409, `${how}: the tenth miss answered ${answer.status} ${JSON.stringify(answer.body)}, not pin_locked`);
  assertEquals((answer.body as { error?: { code?: string } })?.error?.code, "pin_locked", `${how}: not pin_locked`);
}

Deno.test({ name: "the tenth miss stands when its freeze times out on the close route (B70, 55P03)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  const frozenBefore = pinLimitFreezes();
  const { answer, waited } = await tenthMissAgainst(
    () => signedCall(me.key, me.session_id, "POST", "/identities/close", { nonce: nonce16(), auth: wrongPin() }),
    async (tx) => { await tx.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`, [me.session_id]); },
  );
  assert(waited.startsWith("UPDATE sessions SET frozen_at"), `the statement that waited was not the freeze: ${waited}`);
  const state = await stateOf(me);
  assertCounted(state, answer, "a freeze that timed out");
  assertEquals(state.frozen, null, "the session froze, though its freeze timed out");
  assertEquals(pinLimitFreezes() - frozenBefore, 0, "a freeze that went back was counted");
  await takeDownLeftByPinLimit();
  const after = await stateOf(me);
  assertEquals(after.frozen, "pin_limit", "the minute's job left the session live under a locked share");
  assertEquals(after.live, false, "the minute's job left the live phrase under the frozen name");
});

Deno.test({ name: "the tenth miss stands when its take-down times out on a counter (B70, 55P03)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  const frozenBefore = pinLimitFreezes();
  const { answer, waited } = await tenthMissAgainst(
    () => signedCall(me.key, me.session_id, "POST", "/vault/share", { auth: wrongPin() }),
    async (tx) => { await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [me.identity_id]); },
  );
  assert(waited.includes("FROM identity_stats"), `the statement that waited was not the take-down's counters: ${waited}`);
  const state = await stateOf(me);
  assertCounted(state, answer, "a take-down that timed out");
  assertEquals(state.frozen, "pin_limit", "the freeze went back with the take-down that timed out after it");
  assertEquals(pinLimitFreezes() - frozenBefore, 1, "a freeze that stood, under a take-down that went back, was not counted once");
  await takeDownLeftByPinLimit();
  assertEquals((await stateOf(me)).live, false, "the minute's job left the live phrase under the frozen name");
});

Deno.test({ name: "the tenth miss stands when its take-down loses a deadlock (B70, 40P01)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  // The other order, as a consent to a match takes it (routes/matches.ts):
  // the counters first, then the session. The tenth miss holds the session by
  // its freeze and waits on the counters; the holder then asks for the
  // session, and one of the two is the deadlock's victim. The miss waited
  // first, so its check runs first and it is the one cancelled.
  //
  // Then the take-down gives up in place, as it does on a lock timeout, and
  // the minute's job finishes it (take_down.ts; quorum 3:0, B88). Tried again,
  // it would wait on the counters once more with the freeze still holding the
  // session, and the second cycle's victim would be the holder — the consent,
  // which has no retry of its own and answers 503 (routes/matches.ts; review
  // panel 5, D2: this comment used to say it retried). So the holder asks
  // inside a savepoint and keeps its outcome: it must get the session, once the
  // miss has committed, and not lose a deadlock (D3: both used to pass).
  let holderGotSession = false;
  let holderLost = "";
  const frozenBefore = pinLimitFreezes();
  const { answer, waited } = await tenthMissAgainst(
    () => signedCall(me.key, me.session_id, "POST", "/vault/share", { auth: wrongPin() }),
    async (tx) => { await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [me.identity_id]); },
    async (tx) => {
      try {
        // deno-lint-ignore no-explicit-any
        await (tx as any).savepoint((sp: Tx) => sp.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR SHARE`, [me.session_id]));
        holderGotSession = true;
      } catch (error) {
        holderLost = (error as { code?: string })?.code ?? String(error);
        if (holderLost !== "40P01") throw error;
      }
    },
  );
  assert(waited.includes("FROM identity_stats"), `the statement that waited was not the take-down's counters: ${waited}`);
  assertEquals(holderLost, "",
    "the consent lost a second deadlock: the take-down tried again after 40P01 instead of giving up in place, and the consent has no retry");
  assert(holderGotSession, "the holder never got the session: the miss's take-down and the consent did not meet in a cycle");
  const state = await stateOf(me);
  assertCounted(state, answer, "a take-down that lost a deadlock");
  assertEquals(state.frozen, "pin_limit", "the freeze went back with the take-down that lost the deadlock");
  assertEquals(pinLimitFreezes() - frozenBefore, 1, "a freeze that stood, under a take-down that went back, was not counted once");
  await takeDownLeftByPinLimit();
  assertEquals((await stateOf(me)).live, false, "the minute's job left the live phrase under the frozen name");
});

Deno.test({ name: "the minute's job passes over an identity whose counters it cannot take in time, and does the rest (B70, 55P03)", ...pooled }, async () => {
  // Two identities the tenth miss froze and left live, as a take-down given up
  // in place leaves them. The job takes them in id order; the first one's
  // counters are held past takeDownLive's two seconds.
  const two = [await onTheLastAttempt(), await onTheLastAttempt()].sort((a, b) => a.identity_id < b.identity_id ? -1 : 1);
  for (const me of two) {
    await database.queryOrThrow(`UPDATE vault_shares SET attempts_left = 0, locked_at = now() WHERE session = $1`, [me.session_id]);
    await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
  }
  const [held, free] = two;
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  let pass: unknown = null;
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [held.identity_id]);
      try {
        await takeDownLeftByPinLimit();
      } catch (error) {
        pass = (error as { code?: string })?.code ?? String(error);
      }
    });
  } finally {
    await sql.end();
  }
  assertEquals(pass, null, `the job's whole pass went down on one identity's lock (${pass})`);
  assertEquals((await stateOf(free)).live, false, "one identity's lock kept the job from the next identity");
  assertEquals((await stateOf(held)).live, true, "the held identity was taken down under its held counters");
  await takeDownLeftByPinLimit();
  assertEquals((await stateOf(held)).live, false, "the next pass did not take down the identity it had to pass over");
});

// B72 (panel 4, K3): a move, a paper-code raise or a close holds the share —
// each takes it before the session (transfer.ts:397 → :448, identity.ts:677 →
// :692, identity.ts:1114 → :1172, identity_sweeper.ts:347 → :354) — and
// freezes the session while the tenth miss waits on that share. Asked again
// under the share, the session is frozen: the miss is refused as a stranger's
// signature, before the PIN, and spends nothing; the live phrase stays with
// the identity that has a live session again.
Deno.test({ name: "the tenth miss behind a move that froze its session is refused before the PIN (B72)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  // Unlike tenthMissAgainst, the holder commits while the miss still waits:
  // the move is over before the miss gets the share.
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  const sent: { answer?: Promise<{ status: number; body: unknown }> } = {};
  let waited = "";
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [me.session_id]);
      sent.answer = signedCall(me.key, me.session_id, "POST", "/vault/share", { auth: wrongPin() });
      waited = await waitingOn(tx, "the tenth miss");
      await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`, [me.session_id]);
    });
  } finally {
    await sql.end();
  }
  assert(sent.answer, "the tenth miss was never sent");
  const answer = await sent.answer;
  assert(waited.includes("FROM vault_shares"), `the statement that waited was not the share: ${waited}`);
  assertEquals(answer.status, 401, `the miss behind a move answered ${answer.status} ${JSON.stringify(answer.body)}`);
  assertEquals((answer.body as { error?: { code?: string } })?.error?.code, "unauthorized");
  const state = await stateOf(me);
  assertEquals(state.attempts_left, 1, "a device that had moved away spent an attempt");
  assertEquals(state.locked, false, "a device that had moved away closed entry");
  assertEquals(state.live, true, "the miss took down what was live under an identity that had moved on");
});

// B72: a freeze that goes back still closes the session's open sockets. The
// NOTIFY leaves with the tenth miss's commit, from outside the savepoint the
// freeze was rolled back to, so every node closes the rooms at once rather
// than when the minute's job comes round.
Deno.test({ name: "a tenth miss whose freeze times out still announces session_frozen (B72)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  const listener = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  const heard: string[] = [];
  try {
    await listener.listen("session_frozen", (payload: string) => { heard.push(payload); });
    const { answer, waited } = await tenthMissAgainst(
      () => signedCall(me.key, me.session_id, "POST", "/identities/close", { nonce: nonce16(), auth: wrongPin() }),
      async (tx) => { await tx.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`, [me.session_id]); },
    );
    assert(waited.startsWith("UPDATE sessions SET frozen_at"), `the statement that waited was not the freeze: ${waited}`);
    const state = await stateOf(me);
    assertCounted(state, answer, "a freeze that timed out");
    assertEquals(state.frozen, null, "the case needs the freeze gone back");
    for (let i = 0; i < 100 && !heard.includes(me.session_id); i++) await new Promise((r) => setTimeout(r, 20));
    assert(heard.includes(me.session_id), "the tenth miss whose freeze went back said nothing on session_frozen");
  } finally {
    await listener.end();
  }
});

addEventListener("unload", () => {
  database.closePool();
});

// Panel 4, K3 (B88): the tenth miss's take-down belongs to this miss's freeze
// only. A move that froze the session after checkPin read it live — its UPDATE
// already holding the row when the freeze asks for it — leaves the freeze
// nothing to write: freezeSession answers false, and what is live under the
// identity is now the new device's, not this miss's to take down. With the
// answer ignored ("frozen = true" whatever happened) the take-down took the
// new device's phrase.
Deno.test({ name: "a tenth miss whose session a move froze under it takes down nothing of the new device (B88, K3)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  const frozenBefore = pinLimitFreezes();
  const fresh = crypto.randomUUID();
  // The move, as the B72 case above does it: its transaction holds the
  // session's row while the miss is sent, and commits while the miss waits —
  // so checkPin's plain re-read saw the session live, and the freeze's UPDATE,
  // let go, finds it frozen and writes nothing. (Held to the answer, as
  // tenthMissAgainst holds, the freeze would time out instead, and `frozen`
  // would be false from the catch, not from freezeSession.)
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  const sent: { answer?: Promise<{ status: number; body: unknown }> } = {};
  let waited = "";
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`, [me.session_id]);
      await tx.unsafe(
        `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key) VALUES ($1, $2, 'not-a-key', 'not-a-key')`,
        [fresh, me.identity_id]);
      sent.answer = signedCall(me.key, me.session_id, "POST", "/vault/share", { auth: wrongPin() });
      waited = await waitingOn(tx, "the tenth miss");
    });
  } finally {
    await sql.end();
  }
  assert(sent.answer, "the tenth miss was never sent");
  const answer = await sent.answer;
  assert(waited.startsWith("UPDATE sessions SET frozen_at"), `the statement that waited was not the freeze: ${waited}`);
  const state = await stateOf(me);
  assertEquals(state.attempts_left, 0, `the tenth miss was not counted (${answer.status} ${JSON.stringify(answer.body)})`);
  assertEquals(state.frozen, "transfer", "the move's freeze was overwritten by the tenth miss's");
  assertEquals(pinLimitFreezes() - frozenBefore, 0, "a freeze the move wrote was counted as the PIN limit's");
  assertEquals(state.live, true,
    "the tenth miss took down what is live under an identity a move has handed to a new device: its freeze wrote nothing, and the take-down went ahead anyway");
  const [newDevice] = await database.queryOrThrow<{ frozen_at: Date | null }>(`SELECT frozen_at FROM sessions WHERE id = $1`, [fresh]);
  assertEquals(newDevice.frozen_at, null, "the new device's session was frozen by the old one's tenth miss");
});
