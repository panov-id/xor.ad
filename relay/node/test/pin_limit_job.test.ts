
// The minute's job asks again, under the shares, whether the person has a way
// in (review panel 4, К11/Н2, B73, 2026-09-26).
//
// takeDownLeftByPinLimit (lib/take_down.ts) finishes what the tenth PIN miss
// could not take down: an identity whose sessions are all frozen, one of them
// by the PIN limit. The list is read without a lock. A paper-code claim from
// the same device raises the frozen session and gives the person their way in
// back — and what is live is theirs again. Raced here for real: the claim
// holds the share and has raised the session, a second connection keeps it
// from committing by holding the identity's row it writes last, and the job
// runs in that moment. Without the question asked again, it took the live
// phrase down under a person who had just come back.
//
// The harness is pin_limit_rollback.test.ts's (B70).

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "pin-job-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
// Believed x-client-ip, so each request comes from an address of its own and
// no case meets a per-address ceiling it is not about.
Deno.env.set("ORIGIN_TOKEN", "pin-job-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "pin-job-vault-key");
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
// What the job did, by outcome (B74).
const jobCount = (result: string) =>
  Number(render().match(new RegExp(`relay_take_down_pin_limit_total\\{result="${result}"\\} (\\d+)`))?.[1] ?? 0);
await import("../src/routes/identity.ts"); // registers the routes as a side effect

const KEY_ID = "ak_pub_pinlimitjobrace01";
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
          "x-origin-token": "pin-job-origin-token",
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

// Registered and finished, the paper code kept, frozen by the tenth miss as it
// leaves a person — entry locked, the session frozen for pin_limit — with a
// live phrase the take-down could not take.
async function frozenByTheTenthMiss() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const lookupId = crypto.randomUUID();
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: b64(spki),
      wrap_pub: b64(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(PIN),
      share: b64(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: lookupId,
    },
  });
  assert(answer.status >= 200 && answer.status < 300, `registration answered ${answer.status}: ${JSON.stringify(answer.body)}`);
  const me = { ...(answer.body as { identity_id: string; session_id: string }), key: pair.privateKey, lookupId };
  const confirmed = await signedCall(me.key, me.session_id, "POST", "/recovery/confirm",
    { recovery_wrapped_key: b64(crypto.getRandomValues(new Uint8Array(48))) });
  assertEquals(confirmed.status, 204, "the registration was not finished");
  const phrase = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
       lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'sosed', $2, 'вернулась', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '1 hour')`,
    [phrase, me.identity_id],
  );
  await database.queryOrThrow(`UPDATE vault_shares SET attempts_left = 0, locked_at = now() WHERE session = $1`, [me.session_id]);
  await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
  return { ...me, phrase };
}

type Tx = { unsafe: (q: string, args?: unknown[]) => Promise<unknown> };

// Backends queued on a lock whose statement matches, other than the asker.
async function queuedOn(tx: Tx, pattern: string): Promise<number> {
  await tx.unsafe(`SELECT pg_stat_clear_snapshot()`);
  const [{ n }] = await tx.unsafe(
    `SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query LIKE $1 AND pid <> pg_backend_pid()`, [pattern]) as { n: number }[];
  return n;
}

Deno.test({ name: "the minute's job leaves what is live to a person a paper-code claim is raising (B73)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me = await frozenByTheTenthMiss();
  const raisedBefore = jobCount("raised");
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  let claim: { status: number; body: unknown } | null = null;
  let taken: number | string | null = null;
  let jobWaited = false;
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM identities WHERE id = $1 FOR UPDATE`, [me.identity_id]);
      // The claim: takes the share, raises the session, then waits on the
      // identity's row this connection holds.
      signedCall(me.key, me.session_id, "POST", "/recovery/claim", { lookup_id: me.lookupId })
        .then((r) => (claim = r));
      for (let i = 0; i < 250 && (await queuedOn(tx, "%UPDATE identities SET first_pin_grant_at%")) === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assertEquals(await queuedOn(tx, "%UPDATE identities SET first_pin_grant_at%"), 1,
        "the claim never reached the identity's row — the race never ran");
      // The job, in that moment: it either finishes on its stale list, or
      // waits on the share the claim holds.
      takeDownLeftByPinLimit().then((n) => (taken = n), (e) => (taken = String(e)));
      for (let i = 0; i < 250 && taken === null; i++) {
        if ((await queuedOn(tx, "%FOR UPDATE OF v%")) > 0) {
          jobWaited = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      // Committing lets the claim through, and the job after it.
    });
    for (let i = 0; i < 250 && (claim === null || taken === null); i++) await new Promise((r) => setTimeout(r, 20));
  } finally {
    await sql.end();
  }
  assert(claim, "the claim never answered");
  assertEquals((claim as { status: number }).status, 200, `the claim answered ${JSON.stringify(claim)}`);
  assert(typeof taken === "number", `the job failed: ${taken}`);
  const [session] = await database.queryOrThrow<{ live: boolean }>(
    `SELECT frozen_at IS NULL AS live FROM sessions WHERE id = $1`, [me.session_id]);
  assert(session.live, "the claim did not raise the session");
  const live = (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [me.phrase])).length === 1;
  assert(live, `the job took the phrase down under a person the claim was raising (the job ${jobWaited ? "waited on the share" : "did not wait on the share"})`);
  assert(jobWaited, "the job did not wait on the share the claim held");
  assertEquals(jobCount("raised") - raisedBefore, 1, "the person the claim raised was not counted as raised once");
});

// A take-down the job puts off is counted, and one it does is (B74): the
// counters row held past takeDownLive's two seconds, then let go.
Deno.test({ name: "a take-down the job puts off is counted deferred, and the next one taken (B74)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me = await frozenByTheTenthMiss();
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  const [deferredBefore, takenBefore] = [jobCount("deferred"), jobCount("taken")];
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [me.identity_id]);
      await takeDownLeftByPinLimit();
    });
  } finally {
    await sql.end();
  }
  assertEquals(jobCount("deferred") - deferredBefore, 1, "a take-down put off on a held counter was not counted deferred once");
  const live = async () => (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [me.phrase])).length === 1;
  assert(await live(), "the take-down went through under a held counter — the case never ran");
  await takeDownLeftByPinLimit();
  assertEquals(await live(), false, "the next pass did not take down");
  assert(jobCount("taken") - takenBefore >= 1, "a take-down the job did was not counted taken");
});

addEventListener("unload", () => {
  database.closePool();
});

// B89 (panel 5, H6, and the observer on B73): each of the job's transactions
// waits two seconds for a lock, as the route's does, not the statement
// timeout. The row held here past that; the pass must give up well before the
// fifteen seconds a statement may take.
Deno.test({ name: "the job's freeze gives up on a held session row within its lock timeout (B89)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me = await frozenByTheTenthMiss();
  // Entry locked, the freeze not written: what the first pass is for.
  await database.queryOrThrow(`UPDATE sessions SET frozen_at = NULL, frozen_reason = NULL WHERE id = $1`, [me.session_id]);
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  const before = jobCount("freeze_deferred");
  let took = 0;
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE`, [me.session_id]);
      const start = Date.now();
      await takeDownLeftByPinLimit();
      took = Date.now() - start;
    });
  } finally {
    await sql.end();
  }
  assertEquals(jobCount("freeze_deferred") - before, 1, "the freeze behind a held session row was not put off once");
  assert(took < 8000, `the job waited ${took} ms on a held session row — no lock timeout of its own`);
});

Deno.test({ name: "the job's take-down gives up on a held share within its lock timeout (B89)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const me = await frozenByTheTenthMiss();
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  const before = jobCount("deferred");
  let took = 0;
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [me.session_id]);
      const start = Date.now();
      await takeDownLeftByPinLimit();
      took = Date.now() - start;
    });
  } finally {
    await sql.end();
  }
  assertEquals(jobCount("deferred") - before, 1, "the take-down behind a held share was not put off once");
  assert(took < 8000, `the job waited ${took} ms on a held share — no lock timeout of its own`);
});

// B93 (panel 5, H11): one person's pass that meets anything but a lock is
// logged, counted failed and passed over; the rest of the list is done. It
// used to throw out of the whole pass. The failure is a real one: a trigger
// refuses the first person's phrase.
Deno.test({ name: "one person's failed take-down does not stop the job for the rest (B93)", sanitizeOps: false, sanitizeResources: false }, async () => {
  const two = [await frozenByTheTenthMiss(), await frozenByTheTenthMiss()]
    .sort((a, b) => a.identity_id < b.identity_id ? -1 : 1);
  const [first, second] = two;
  await database.queryOrThrow(`
    CREATE OR REPLACE FUNCTION b93_refuse() RETURNS trigger AS $$
    BEGIN
      IF OLD.author_identity = '${first.identity_id}' THEN RAISE EXCEPTION 'refused for the test'; END IF;
      RETURN OLD;
    END $$ LANGUAGE plpgsql`);
  await database.queryOrThrow(`CREATE TRIGGER b93_refuse BEFORE DELETE ON feed_messages FOR EACH ROW EXECUTE FUNCTION b93_refuse()`);
  const before = jobCount("failed");
  let outcome = "";
  try {
    await takeDownLeftByPinLimit().then(() => (outcome = "done"), (e) => (outcome = String(e)));
  } finally {
    await database.queryOrThrow(`DROP TRIGGER IF EXISTS b93_refuse ON feed_messages`);
    await database.queryOrThrow(`DROP FUNCTION IF EXISTS b93_refuse()`);
  }
  assertEquals(outcome, "done", "one person's failure threw out of the whole pass");
  assertEquals(jobCount("failed") - before, 1, "the failed take-down was not counted once");
  const live = async (phrase: string) => (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [phrase])).length === 1;
  assert(await live(first.phrase), "the refused take-down went through — the case never ran");
  assertEquals(await live(second.phrase), false, "the person after the failed one was not taken down");
});
