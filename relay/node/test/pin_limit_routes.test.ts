
// The tenth PIN miss on the doors B70 did not walk to the end, and the two
// failures it faked or did not meet (B80, from the verifier's open items on
// B70, 2026-09-26).
//
// checkPin (lib/pin_attempts.ts) guards four doors. transfer_routes.test.ts
// walks POST /sessions/invite only to the sixth attempt, and no case took
// POST /vault/pin to the tenth: here both go to the end — locked, frozen,
// what is live taken down, the freeze counted once.
//
// And two failures of the freeze itself, each a real one from the database,
// not a promise rejected in JavaScript: 57014, the freeze's statement cancelled
// (pg_cancel_backend — what a statement timeout sends), and 40P01, the freeze
// the victim of a deadlock with a holder that wants the share the miss holds.
// Either way the tenth miss stands and only the freeze goes back; the minute's
// job freezes the session after. The harness is pin_limit_rollback.test.ts's.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "pin-routes-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
// Believed x-client-ip, so each request comes from an address of its own and
// no case meets a per-address ceiling it is not about.
Deno.env.set("ORIGIN_TOKEN", "pin-routes-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "pin-routes-vault-key");
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
await import("../src/routes/transfer.ts");

const KEY_ID = "ak_pub_pinlimitroutes01";
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
          "x-origin-token": "pin-routes-origin-token",
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

// The body of a PIN change whose old PIN is wrong.
const wrongChange = async () => ({
  nonce: nonce16(),
  current_auth: wrongPin(),
  next_auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
  next_share: b64(crypto.getRandomValues(new Uint8Array(32))),
});

type Me = Awaited<ReturnType<typeof onTheLastAttempt>>;

// The whole tenth miss: locked, frozen, the live phrase gone, the freeze
// counted once — nothing held, nothing failing.
async function toTheEnd(door: string, send: (me: Me) => Promise<{ status: number; body: unknown }>) {
  const me = await onTheLastAttempt();
  const frozenBefore = pinLimitFreezes();
  const answer = await send(me);
  const state = await stateOf(me);
  assertCounted(state, answer, door);
  assertEquals(state.frozen, "pin_limit", `${door}: the tenth miss did not freeze the session`);
  assertEquals(state.live, false, `${door}: the tenth miss left the live phrase up`);
  assertEquals(pinLimitFreezes() - frozenBefore, 1, `${door}: the tenth miss's freeze was counted other than once`);
}

Deno.test({ name: "the tenth miss at the transfer window locks, freezes and takes down (B80)", ...pooled }, async () => {
  await toTheEnd("POST /sessions/invite", (me) =>
    signedCall(me.key, me.session_id, "POST", "/sessions/invite", { lookup_id: `lookup-${crypto.randomUUID()}`, auth: wrongPin() }));
});

Deno.test({ name: "the tenth miss on a PIN change locks, freezes and takes down (B80)", ...pooled }, async () => {
  await toTheEnd("POST /vault/pin", async (me) => signedCall(me.key, me.session_id, "POST", "/vault/pin", await wrongChange()));
});

// The backend queued behind this transaction's locks, by its pid.
async function queuedPid(tx: Tx): Promise<number> {
  const [{ p }] = await tx.unsafe(`SELECT pg_backend_pid() AS p`) as { p: number }[];
  const rows = await tx.unsafe(
    `SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))`, [p],
  ) as { pid: number }[];
  assertEquals(rows.length, 1, `expected one backend queued behind the holder, found ${rows.length}`);
  return rows[0].pid;
}

Deno.test({ name: "the tenth miss stands when its freeze is cancelled by the database (B80, 57014)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  const frozenBefore = pinLimitFreezes();
  let cancelled = false;
  const { answer, waited } = await tenthMissAgainst(
    async () => signedCall(me.key, me.session_id, "POST", "/vault/pin", await wrongChange()),
    async (tx) => { await tx.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`, [me.session_id]); },
    // What a statement timeout sends the waiting statement: a cancel, 57014.
    async (tx) => {
      const [{ ok }] = await tx.unsafe(`SELECT pg_cancel_backend($1) AS ok`, [await queuedPid(tx)]) as { ok: boolean }[];
      cancelled = ok;
    },
  );
  assert(cancelled, "the queued freeze could not be cancelled — the case never ran");
  assert(waited.startsWith("UPDATE sessions SET frozen_at"), `the statement that waited was not the freeze: ${waited}`);
  const state = await stateOf(me);
  assertCounted(state, answer, "a freeze cancelled");
  assertEquals(state.frozen, null, "the session froze, though its freeze was cancelled");
  assertEquals(pinLimitFreezes() - frozenBefore, 0, "a cancelled freeze was counted");
  await takeDownLeftByPinLimit();
  const after = await stateOf(me);
  assertEquals(after.frozen, "pin_limit", "the minute's job left the session live under a locked share");
  assertEquals(after.live, false, "the minute's job left the live phrase under the frozen name");
});

Deno.test({ name: "the tenth miss stands when its freeze loses a deadlock (B80, 40P01)", ...pooled }, async () => {
  const me = await onTheLastAttempt();
  const frozenBefore = pinLimitFreezes();
  // The holder takes the session first; the miss, holding its share, queues
  // on the session by its freeze; then the holder asks for the share. The
  // miss waited first, so its deadlock check runs first and its freeze is the
  // one cancelled. The holder asks inside a savepoint and keeps its outcome.
  let holderGotShare = false;
  let holderLost = "";
  const { answer, waited } = await tenthMissAgainst(
    () => signedCall(me.key, me.session_id, "POST", "/vault/share", { auth: wrongPin() }),
    async (tx) => { await tx.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`, [me.session_id]); },
    async (tx) => {
      try {
        // deno-lint-ignore no-explicit-any
        await (tx as any).savepoint((sp: Tx) => sp.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [me.session_id]));
        holderGotShare = true;
      } catch (error) {
        holderLost = (error as { code?: string })?.code ?? String(error);
        if (holderLost !== "40P01") throw error;
      }
    },
  );
  assert(waited.startsWith("UPDATE sessions SET frozen_at"), `the statement that waited was not the freeze: ${waited}`);
  assert(holderGotShare, `the holder, not the freeze, lost the deadlock (${holderLost || "waiting"}) — the freeze's 40P01 never happened`);
  const state = await stateOf(me);
  assertCounted(state, answer, "a freeze that lost a deadlock");
  assertEquals(state.frozen, null, "the session froze, though its freeze lost the deadlock");
  assertEquals(pinLimitFreezes() - frozenBefore, 0, "a freeze that lost a deadlock was counted");
  await takeDownLeftByPinLimit();
  const after = await stateOf(me);
  assertEquals(after.frozen, "pin_limit", "the minute's job left the session live under a locked share");
  assertEquals(after.live, false, "the minute's job left the live phrase under the frozen name");
});

addEventListener("unload", () => {
  database.closePool();
});
