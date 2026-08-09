// The half of the node that only exists when there is a database: secret keys
// compared by hash, quotas that add rather than overwrite, daily aggregates, and
// a queue that hands a job to exactly one worker.
//
// Every other suite runs on file storage with DATABASE_URL unset, which means the
// branches below are not merely untested — they are skipped, and a test that
// skips looks exactly like a test that passes. That gap is how a broken foreign
// key reached a live box: the code path that inserts a key never ran in CI at
// all. Run: scripts/run-relay-database-tests.sh
//
// Requires a throwaway Postgres with the migrations applied. The script does
// both; this file refuses to pretend it can run without one.
//
// Almost every test here disables the sanitizers, for reasons the code under test
// chose deliberately: a route writes its audit entry fire-and-forget (as the
// tenancy suite already works around), the counters arm a flush interval that
// outlives whichever test happened to arm it, and the connection pool keeps its
// socket open for the process, not for one test.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const SECRET = "database-test-secret";
const ENV_NAME = "test";
const storageDir = await Deno.makeTempDir();

// Env before the first import: config.ts captures it at module load.
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", SECRET);
Deno.env.set("NODE_ENV_NAME", ENV_NAME);
Deno.env.set("MAIL_TRANSPORT", "none");
// Both brands live in the environment and in no table — the shape that broke the
// live stand, where `api_keys.brand` referenced `brands.key` and the platform's
// own storefronts had never been written there.
Deno.env.set(
  "BRANDS",
  JSON.stringify([
    { key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" },
    { key: "beta", name: "Beta", domain: "beta.test", from: "b <b@beta.test>" },
  ]),
);

const { match } = await import("../src/lib/router.ts");
const { sign } = await import("../src/lib/jwt.ts");
const database = await import("../src/lib/db.ts");
const secretKeys = await import("../src/lib/secret_key.ts");
const quota = await import("../src/lib/quota.ts");
const aggregate = await import("../src/lib/pageview_daily.ts");
const jobs = await import("../src/lib/jobs.ts");
await import("../src/routes/admin.ts"); // registers the routes as a side effect
await import("../src/routes/v1.ts"); // the public API, on the same router

// deno-lint-ignore no-explicit-any
type Body = any;

// A local copy rather than a shared helper: tenancy.test.ts builds its own from
// its own secret and brands, and one shared fixture would have to serve two sets
// of environment variables that are captured at import.
async function callAs(
  subject: { role: string; brand: string | null },
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Body }> {
  const token = await sign({
    sub: `boss@${subject.brand ?? "platform"}.test`,
    role: subject.role,
    brand: subject.brand,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }, SECRET);
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: found.params,
    url,
  });
  return { status: response.status, body: await response.json() };
}

// The same dispatch, authenticated as a machine rather than a person: `/v1` reads
// a secret key from the Authorization header and never a session.
async function callWithKey(
  secret: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Body; headers: Headers }> {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params: found.params,
    url,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    headers: response.headers,
  };
}

const ALPHA = { role: "tenant_admin", brand: "alpha" } as const;
const PLATFORM = { role: "admin", brand: null } as const;

// Unique per test, so a leftover row from one cannot decide another's outcome —
// these tests share a database and say nothing about the order they run in.
let counter = 0;
const uniqueId = () => `test-key-${Date.now()}-${counter++}`;

// --- secret keys ---------------------------------------------------------------

Deno.test({
  name: "a secret key resolves by its hash, and the wrong secret resolves to nothing",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey(
      "alpha",
      "importer",
      ["waitlist.write"],
      "boss@alpha.test",
    );
    assert(minted.secret.startsWith(`${minted.key.id}.`), "the wire format is <id>.<secret>");

    const resolved = await secretKeys.resolveSecretKey(minted.secret);
    assert(resolved, "the minted key must resolve");
    assertEquals(resolved.brand, "alpha");
    assertEquals(resolved.scopes, ["waitlist.write"]);

    // Right id, wrong secret: the row is found by id and rejected by hash, which
    // is the only reason storing the hash is worth anything.
    const forged = `${minted.key.id}.${"0".repeat(64)}`;
    assertEquals(await secretKeys.resolveSecretKey(forged), null);
  },
});

Deno.test({
  name: "the stored secret is a hash, not the secret",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "hash check", ["waitlist.write"], null);
    const presented = minted.secret.slice(minted.key.id.length + 1);
    const rows = await database.queryOrThrow<{ secret_hash: string }>(
      `SELECT secret_hash FROM api_keys WHERE id = $1`,
      [minted.key.id],
    );
    assertEquals(rows.length, 1);
    assert(rows[0].secret_hash !== presented, "the secret itself must never be in the row");
    assertEquals(rows[0].secret_hash.length, 64); // sha256, hex
  },
});

Deno.test({
  name: "a revoked key stops resolving, and stays on the record",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "to revoke", ["waitlist.write"], null);
    assert(await secretKeys.resolveSecretKey(minted.secret));

    const revoked = await secretKeys.revokeSecretKey(minted.key.id);
    assert(revoked?.revoked_at, "revoking stamps the row");
    assertEquals(await secretKeys.resolveSecretKey(minted.secret), null);

    // Revoking twice is not an error and does not move the timestamp: when we
    // stopped trusting a key happened once.
    assertEquals(await secretKeys.revokeSecretKey(minted.key.id), null);
    const rows = await database.queryOrThrow(
      `SELECT revoked_at FROM api_keys WHERE id = $1`,
      [minted.key.id],
    );
    assertEquals(rows.length, 1, "the row survives revocation");
  },
});

// --- issuing them through the panel --------------------------------------------

Deno.test({
  name: "a tenant issues a key for its own server with the key-only scopes",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { status, body } = await callAs(ALPHA, "POST", "/admin/secret-keys", {
      name: "own importer",
      scopes: ["waitlist.write", "pageviews.write", "client_errors.write"],
    });
    assertEquals(status, 201, `expected 201, got ${status}: ${JSON.stringify(body)}`);
    assertEquals(body.brand, "alpha");
    assertEquals(body.shown_once, true);
    assert(typeof body.secret === "string" && body.secret.length > 40);
  },
});

Deno.test({
  name: "the exception is the key-only scopes and nothing else",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { status, body } = await callAs(ALPHA, "POST", "/admin/secret-keys", {
      name: "overreach",
      scopes: ["logs.server.read"],
    });
    assertEquals(status, 403, `a tenant must not grant what it does not hold: ${JSON.stringify(body)}`);
  },
});

Deno.test({
  name: "a tenant issues only for its own brand, whatever the body says",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { status, body } = await callAs(ALPHA, "POST", "/admin/secret-keys", {
      brand: "beta",
      name: "for someone else",
      scopes: ["waitlist.write"],
    });
    assertEquals(status, 201);
    assertEquals(body.brand, "alpha");
  },
});

Deno.test({
  name: "the list carries the key and never the secret",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await callAs(ALPHA, "POST", "/admin/secret-keys", {
      name: "listed",
      scopes: ["waitlist.write"],
    });
    const { status, body } = await callAs(ALPHA, "GET", "/admin/secret-keys");
    assertEquals(status, 200);
    assert(body.length > 0);
    for (const key of body) {
      assertEquals(key.brand, "alpha");
      assertEquals(key.secret, undefined, "a listed key must not carry its secret");
    }
  },
});

// The regression that cost a live debugging session: `api_keys.brand` referenced
// `brands.key`, while the schema's own comment said a brand may live in the
// BRANDS environment alone. Both brands here are environment-seeded and have no
// row, so an insert proves the constraint is gone rather than merely unnoticed.
Deno.test({
  name: "a key can be issued for a brand that lives only in the environment",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const rows = await database.queryOrThrow<{ count: string }>(
      `SELECT count(*)::text AS count FROM brands WHERE key = 'alpha'`,
    );
    assertEquals(rows[0].count, "0", "this test is only meaningful with no row for the brand");

    const { status, body } = await callAs(PLATFORM, "POST", "/admin/api-keys", {
      brand: "alpha",
      origins: ["https://alpha.test"],
    });
    assertEquals(status, 201, `issuing for a seeded brand must work: ${JSON.stringify(body)}`);
    assertEquals(body.brand, "alpha");
  },
});

// --- quotas --------------------------------------------------------------------

Deno.test({
  name: "quota increments add up instead of overwriting each other",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const keyId = uniqueId();
    for (let index = 0; index < 3; index++) quota.record(keyId);
    await quota.flush();
    // A second batch, as a second node's flush would be: assignment would leave 2.
    for (let index = 0; index < 2; index++) quota.record(keyId);
    await quota.flush();

    assertEquals(await quota.usedToday(keyId), 5);
  },
});

Deno.test({
  name: "a key over its allowance is refused, and one under it is not",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const keyId = uniqueId();
    for (let index = 0; index < 5; index++) quota.record(keyId);
    await quota.flush();

    assertEquals(await quota.exceeded(keyId, 10), false);
    assertEquals(await quota.exceeded(keyId, 5), true, "at the limit is over it");
    assertEquals(await quota.exceeded(keyId, null), false, "no limit is no refusal");
  },
});

Deno.test({
  name: "what a node has not flushed still counts against the limit",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const keyId = uniqueId();
    for (let index = 0; index < 4; index++) quota.record(keyId);
    await quota.flush();
    // Not flushed: a burst on this node must be caught by this node, not only
    // after the next interval.
    quota.record(keyId);
    assertEquals(await quota.exceeded(keyId, 5), true);
    assertEquals(await quota.usedToday(keyId), 5);
    await quota.flush();
  },
});

// --- the allowance on the public API -------------------------------------------
//
// The limit was enforced only for publishable keys, so a number set in the panel
// governed a landing and ignored the tenant's own server. These tests exist
// because nothing else here calls /v1 at all.

Deno.test({
  name: "a resolved key carries its allowance",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "limited", ["pageviews.write"], null);
    assertEquals(minted.key.quota_events_per_day ?? null, null, "a new key is unlimited");

    const { status } = await callAs(
      PLATFORM,
      "PATCH",
      `/admin/secret-keys/${minted.key.id}/quota`,
      { quota_events_per_day: 2 },
    );
    assertEquals(status, 200, "the platform sets a limit on a secret key");

    const resolved = await secretKeys.resolveSecretKey(minted.secret);
    assertEquals(resolved?.quota_events_per_day, 2, "and the resolver reads it back");
  },
});

Deno.test({
  name: "a secret key over its allowance is refused, with something to retry after",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "burst", ["pageviews.write"], null);
    await callAs(PLATFORM, "PATCH", `/admin/secret-keys/${minted.key.id}/quota`, {
      quota_events_per_day: 2,
    });

    const view = { path: "/", lang: "en" };
    assertEquals((await callWithKey(minted.secret, "POST", "/v1/pageview", view)).status, 200);
    assertEquals((await callWithKey(minted.secret, "POST", "/v1/pageview", view)).status, 200);

    const third = await callWithKey(minted.secret, "POST", "/v1/pageview", view);
    assertEquals(third.status, 429, "the third is over the limit");
    assertEquals(third.body.error.code, "rate_limited");
    assertEquals(third.body.error.limit, 2);
    // "Try again later" without a number is not an answer.
    assert(Number(third.headers.get("retry-after")) > 0);
  },
});

Deno.test({
  name: "asking how a key is configured is free",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "me only", ["pageviews.write"], null);
    await callAs(PLATFORM, "PATCH", `/admin/secret-keys/${minted.key.id}/quota`, {
      quota_events_per_day: 1,
    });

    // Several times over the limit: /v1/me writes nothing, and spending the
    // allowance on the call that checks the others would be a trap.
    for (let attempt = 0; attempt < 3; attempt++) {
      assertEquals((await callWithKey(minted.secret, "GET", "/v1/me")).status, 200);
    }
    const write = await callWithKey(minted.secret, "POST", "/v1/pageview", { path: "/", lang: "en" });
    assertEquals(write.status, 200, "the allowance was not spent by /v1/me");
  },
});

Deno.test({
  name: "an unlimited key is not refused, however much it sends",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "unlimited", ["pageviews.write"], null);
    for (let attempt = 0; attempt < 5; attempt++) {
      const { status } = await callWithKey(minted.secret, "POST", "/v1/pageview", {
        path: "/",
        lang: "en",
      });
      assertEquals(status, 200);
    }
  },
});

Deno.test({
  name: "a tenant cannot raise its own limit",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const minted = await secretKeys.createSecretKey("alpha", "self-serve", ["pageviews.write"], null);
    const { status } = await callAs(
      ALPHA,
      "PATCH",
      `/admin/secret-keys/${minted.key.id}/quota`,
      { quota_events_per_day: 1_000_000 },
    );
    assertEquals(status, 403, "an allowance a tenant can raise is not an allowance");
  },
});

// --- daily page-view aggregate -------------------------------------------------

Deno.test({
  name: "page views land in a daily row, and the row sums",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const brand = `agg-${Date.now()}`;
    aggregate.record(brand, "/", "en", true);
    aggregate.record(brand, "/", "en", false);
    await aggregate.flush();
    aggregate.record(brand, "/", "en", false);
    await aggregate.flush();

    assertEquals(await aggregate.lifetimeTotals([brand]), { views: 3, first_views: 1 });
  },
});

Deno.test({
  name: "a day's total is per path and language, not one lump",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const brand = `agg-split-${Date.now()}`;
    aggregate.record(brand, "/", "en", true);
    aggregate.record(brand, "/de/", "de", true);
    await aggregate.flush();

    const rows = await database.queryOrThrow<{ path: string; lang: string; views: string }>(
      `SELECT path, lang, views::text FROM pageview_daily WHERE brand = $1 ORDER BY path`,
      [brand],
    );
    assertEquals(rows.map((row) => [row.path, row.lang, row.views]), [
      ["/", "en", "1"],
      ["/de/", "de", "1"],
    ]);

    const today = aggregate.utcDay();
    const byDay = await aggregate.totalsByDay([brand], today, today);
    assertEquals(byDay?.length, 1);
    assertEquals(Number(byDay?.[0].views), 2, "the histogram sums the paths of a day");
  },
});

Deno.test({
  name: "a view with no path or language is still counted",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const brand = `agg-unknown-${Date.now()}`;
    aggregate.record(brand, null, null, false);
    await aggregate.flush();
    assertEquals((await aggregate.lifetimeTotals([brand]))?.views, 1);
  },
});

// --- the queue -----------------------------------------------------------------

Deno.test({
  name: "a job goes to exactly one worker",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const kind = `test-once-${Date.now()}`;
    let ran = 0;
    jobs.handle(kind, () => {
      ran += 1;
      return Promise.resolve();
    });
    await jobs.enqueue(kind);

    // Both workers reach for the queue at the same time; SKIP LOCKED decides.
    const claimed = await Promise.all([jobs.runOnce(), jobs.runOnce()]);
    assertEquals(claimed.filter(Boolean).length, 1, "two workers, one job, one run");
    assertEquals(ran, 1);

    const left = await database.queryOrThrow<{ count: string }>(
      `SELECT count(*)::text AS count FROM jobs WHERE kind = $1`,
      [kind],
    );
    assertEquals(left[0].count, "0", "a finished job leaves no row");
  },
});

Deno.test({
  name: "a failed job keeps its row, its error and a later run_at",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const kind = `test-fail-${Date.now()}`;
    jobs.handle(kind, () => Promise.reject(new Error("nope")));
    await jobs.enqueue(kind);

    assertEquals(await jobs.runOnce(), true);

    const rows = await database.queryOrThrow<
      { attempts: number; last_error: string; later: boolean }
    >(
      `SELECT attempts, last_error, run_at > now() AS later FROM jobs WHERE kind = $1`,
      [kind],
    );
    assertEquals(rows.length, 1, "a failure is not a deletion");
    assertEquals(rows[0].attempts, 1);
    assert(rows[0].last_error.includes("nope"), "the reason is kept, not just the fact");
    assertEquals(rows[0].later, true, "the retry is backed off, not immediate");

    await database.queryOrThrow(`DELETE FROM jobs WHERE kind = $1`, [kind]);
  },
});

Deno.test({
  name: "a standing intention is enqueued once, however many nodes ask",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const kind = `test-standing-${Date.now()}`;
    const tomorrow = new Date(Date.now() + 86_400_000);
    await jobs.enqueueOnce(kind, {}, tomorrow);
    await jobs.enqueueOnce(kind, {}, tomorrow);

    const rows = await database.queryOrThrow<{ count: string }>(
      `SELECT count(*)::text AS count FROM jobs WHERE kind = $1`,
      [kind],
    );
    assertEquals(rows[0].count, "1");

    await database.queryOrThrow(`DELETE FROM jobs WHERE kind = $1`, [kind]);
  },
});

Deno.test({
  // The failure this guards was invisible from every direction: the notice was
  // stored, acknowledged under Article 16(4), and absent from the only screen a
  // moderator has. It happened because the snapshot outcome was written into
  // `status`, and the queue is `status IN ('received','in_review')` — so every
  // report about a chat, and every feed message that expired before anyone
  // looked, waited where nobody could see it. See db/006.
  name: "a notice we could not copy still reaches the moderator's queue",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const marker = `queue-test-${Date.now()}`;
    const inserted = await database.queryOrThrow<{ id: string }>(
      `INSERT INTO dsa_notices
         (brand, target_kind, target_id, reason_text, bona_fide,
          status, snapshot_state, acknowledged_at)
       VALUES ('neighbro', 'chat', null, $1, true, 'received', 'not_accessible', now())
       RETURNING id`,
      [marker],
    );
    const id = inserted[0].id;

    // Exactly the query the queue route runs.
    const open = await database.queryOrThrow<{ id: string }>(
      `SELECT id FROM dsa_notices
        WHERE status = ANY($1) AND id = $2`,
      [["received", "in_review"], id],
    );
    assertEquals(
      open.length,
      1,
      "a report about a chat can never be copied, and must still be examined",
    );

    // And the reason it could not be copied is kept, because the letter to the
    // author has to say which of the two it was.
    const stored = await database.queryOrThrow<{ snapshot_state: string }>(
      `SELECT snapshot_state FROM dsa_notices WHERE id = $1`,
      [id],
    );
    assertEquals(stored[0].snapshot_state, "not_accessible");

    // And the shape that caused it is now unrepresentable: the column that decides
    // the queue no longer accepts a snapshot outcome. A widened constraint would
    // bring the whole failure back, silently, so it is asserted rather than
    // trusted to a comment.
    let rejected = false;
    try {
      await database.queryOrThrow(
        `INSERT INTO dsa_notices
           (brand, target_kind, reason_text, bona_fide, status, acknowledged_at)
         VALUES ('neighbro', 'chat', $1, true, 'not_accessible', now())`,
        [`${marker}-old-shape`],
      );
    } catch {
      rejected = true;
    }
    assertEquals(rejected, true, "status must not accept a snapshot outcome again");

    await database.queryOrThrow(`DELETE FROM dsa_notices WHERE id = $1`, [id]);
  },
});

// The pool holds connections open, and nothing else in a test process will close
// them.
addEventListener("unload", () => void database.closePool());
