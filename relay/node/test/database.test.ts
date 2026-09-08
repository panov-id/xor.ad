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

const { config } = await import("../src/config.ts");
const { match } = await import("../src/lib/router.ts");
const { sign } = await import("../src/lib/jwt.ts");
const database = await import("../src/lib/db.ts");
const secretKeys = await import("../src/lib/secret_key.ts");
const quota = await import("../src/lib/quota.ts");
const aggregate = await import("../src/lib/pageview_daily.ts");
const jobs = await import("../src/lib/jobs.ts");
await import("../src/routes/admin.ts"); // registers the routes as a side effect
await import("../src/routes/v1.ts"); // the public API, on the same router
await import("../src/routes/dsa.ts"); // the moderator's queue and decision

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
    env: config.envName,
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
  // Found 2026-09-07 by a review panel, not by a failure: nothing about this is
  // visible while it happens. A job out of attempts keeps its row with
  // `locked_until = 'infinity'` as the record of work that never succeeded —
  // deliberate, and right. What was wrong is that `enqueueOnce` asked only
  // whether a row of that kind exists, so the tombstone answered "one is already
  // waiting" for ever. The daily chain lives inside the successful handler, so
  // once a job gave up nothing re-armed it: every later restart of every node
  // quietly enqueued nothing, and the retention windows the privacy policy
  // promises stopped being kept with one line in the log.
  //
  // Storage being unreachable for long enough is all it takes: prune_objects
  // throws "storage is not configured", eight attempts pass in about two hours,
  // and the pruning is over until somebody deletes the row by hand.
  name: "a job that gave up does not block the next arming",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const kind = `test-gaveup-${Date.now()}`;
    // The state a job is left in by `fail()` once attempts run out.
    await database.queryOrThrow(
      `INSERT INTO jobs (kind, payload, attempts, max_attempts, locked_until, last_error)
       VALUES ($1, '{}'::jsonb, 8, 8, 'infinity', 'storage is not configured')`,
      [kind],
    );

    await jobs.enqueueOnce(kind, {}, new Date(Date.now() + 86_400_000));

    const rows = await database.queryOrThrow<{ count: string }>(
      `SELECT count(*)::text AS count FROM jobs
        WHERE kind = $1 AND locked_until IS DISTINCT FROM 'infinity'`,
      [kind],
    );
    assertEquals(
      rows[0].count,
      "1",
      "the tombstone must not be mistaken for a job that is still coming",
    );

    // And the tombstone itself stays: it is the only evidence of what broke.
    const dead = await database.queryOrThrow<{ count: string }>(
      `SELECT count(*)::text AS count FROM jobs
        WHERE kind = $1 AND locked_until = 'infinity'`,
      [kind],
    );
    assertEquals(dead[0].count, "1", "a job that gave up is not deleted by re-arming");

    await database.queryOrThrow(`DELETE FROM jobs WHERE kind = $1`, [kind]);
  },
});

Deno.test({
  // The other half of the same question: a row that is merely leased right now
  // (a node is running it) is still a job that is coming, and re-arming must not
  // add a second one beside it.
  name: "a leased job still counts as enqueued",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const kind = `test-leased-${Date.now()}`;
    await database.queryOrThrow(
      `INSERT INTO jobs (kind, payload, locked_until)
       VALUES ($1, '{}'::jsonb, now() + interval '10 minutes')`,
      [kind],
    );

    await jobs.enqueueOnce(kind, {}, new Date(Date.now() + 86_400_000));

    const rows = await database.queryOrThrow<{ count: string }>(
      `SELECT count(*)::text AS count FROM jobs WHERE kind = $1`,
      [kind],
    );
    assertEquals(rows[0].count, "1", "a job in flight is not a job that is missing");

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

Deno.test({
  // Two functions were named brandByKey: one in config.ts reading the seed baked
  // into the image, one in the registry reading the database. The mail imported
  // the first, so a brand renamed through the panel kept signing its letters with
  // the old identity — and the rename looked like it had simply not worked.
  name: "a brand renamed in the registry is the one the letters use",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const key = "sosed";
    const before = await database.queryOrThrow<{ name: string; upper: string }>(
      `SELECT name, upper FROM brands WHERE key = $1`,
      [key],
    );
    if (before.length === 0) return; // no registry row here: nothing this can prove

    await database.queryOrThrow(
      `UPDATE brands SET name = 'RegistryName', upper = 'REGISTRYNAME' WHERE key = $1`,
      [key],
    );
    try {
      const { brandByKey } = await import("../src/lib/brand_registry.ts");
      const brand = await brandByKey(key);
      assertEquals(brand?.name, "RegistryName", "the registry row is what a letter must read");
      assertEquals(brand?.upper, "REGISTRYNAME");
    } finally {
      await database.queryOrThrow(
        `UPDATE brands SET name = $2, upper = $3 WHERE key = $1`,
        [key, before[0].name, before[0].upper],
      );
    }
  },
});

// The pool holds connections open, and nothing else in a test process will close
// them.
addEventListener("unload", () => void database.closePool());

// --- article 16 queue: a tenant reads its own notices and no one else's -------

// A notice carries the notifier's name and email, and deciding one restricts a
// stranger's content. The queue had no brand condition at all — every reader
// with `dsa_notices.read` saw every tenant's notices, and the decision route
// fetched by id alone. It is not reachable through the roles as they stand,
// because `tenant_admin` lacks the permission; it is reachable in one step,
// because a tenant admin may give a `moderator` role to somebody under their own
// brand, and `moderator` carries both read and decide.
const MODERATOR_ALPHA = { role: "moderator", brand: "alpha" } as const;

async function seedNotice(brand: string | null, reason: string): Promise<string> {
  const rows = await database.queryOrThrow<{ id: string }>(
    `INSERT INTO dsa_notices
       (brand, target_kind, target_id, reason_text, bona_fide, status, snapshot_state, acknowledged_at)
     VALUES ($1, 'feed_message', NULL, $2, true, 'received', 'received', now())
     RETURNING id`,
    [brand, reason],
  );
  return rows[0].id;
}

Deno.test({
  name: "the article 16 queue shows a tenant its own notices only",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mine = await seedNotice("alpha", `alpha notice ${uniqueId()}`);
    const theirs = await seedNotice("beta", `beta notice ${uniqueId()}`);
    const nobodys = await seedNotice(null, `unattributed notice ${uniqueId()}`);

    const seen = await callAs(MODERATOR_ALPHA, "GET", "/admin/dsa-notices");
    assertEquals(seen.status, 200);
    const ids = seen.body.map((row: Body) => row.id);
    assert(ids.includes(mine), "a tenant cannot see its own notice");
    assert(!ids.includes(theirs), "a tenant is reading another tenant's notice");
    // Unattributed notices belong to the platform: the key was missing or spent,
    // and which tenant the content belonged to is exactly what nobody knows.
    assert(!ids.includes(nobodys), "a tenant is reading an unattributed notice");

    const all = await callAs(PLATFORM, "GET", "/admin/dsa-notices");
    const allIds = all.body.map((row: Body) => row.id);
    for (const id of [mine, theirs, nobodys]) {
      assert(allIds.includes(id), "the platform cannot see every notice");
    }
  },
});

// A notice held by the platform says why it is held there.
//
// Since 2026-09-07 `brand IS NULL` has two meanings: the notice arrived with no
// usable key, or its copy belongs to a face other than the one it was filed
// through. The queue is the only place a person sees the difference, and the
// difference is `received_via` — which the list route did not return at all,
// so a platform moderator got a row with an empty brand cell and no way to tell
// the two apart.
Deno.test({
  name: "a notice the platform holds names the face it came through",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const rows = await database.queryOrThrow<{ id: string }>(
      `INSERT INTO dsa_notices
         (brand, received_via, target_kind, target_id, reason_text, bona_fide,
          status, snapshot_state, acknowledged_at)
       VALUES (NULL, 'beta', 'feed_message', NULL, $1, true, 'received', 'received', now())
       RETURNING id`,
      [`routed notice ${uniqueId()}`],
    );
    const routed = rows[0].id;
    const ownedByAlpha = await seedNotice("alpha", `alpha notice ${uniqueId()}`);

    const seen = await callAs(PLATFORM, "GET", "/admin/dsa-notices");
    assertEquals(seen.status, 200);
    const row = seen.body.find((r: Body) => r.id === routed);
    assert(row, "the platform cannot see a notice routed to it");
    assertEquals(row.brand, null, "a routed notice belongs to the platform queue");
    assertEquals(
      row.received_via,
      "beta",
      "without this the moderator sees an empty cell and cannot tell why it is here",
    );

    // A tenant's own notice still names its own queue, and beta — whose face the
    // routed notice came through — must not get it back through that column.
    const mine = seen.body.find((r: Body) => r.id === ownedByAlpha);
    assertEquals(mine.brand, "alpha");

    const beta = await callAs({ role: "moderator", brand: "beta" }, "GET", "/admin/dsa-notices");
    const betaIds = beta.body.map((r: Body) => r.id);
    assert(
      !betaIds.includes(routed),
      "the face a notice was filed through must not read the copy it was routed away from",
    );
  },
});

// Nothing walked the upheld path — the word did not appear in this directory at
// all — and it was broken at the one place a test would have caught for free:
// dsa_statements.brand was still NOT NULL while a notice's brand had been made
// nullable one migration earlier. Deciding an unattributed notice in the
// notifier's favour threw on the insert, after the point of no return: no
// statement, no decided_at, no letter, and a 500 handed to an operator who had
// in fact decided it.
Deno.test({
  name: "the platform can uphold a notice that names no storefront",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const nobodys = await seedNotice(null, `unattributed notice ${uniqueId()}`);

    const decision = await callAs(PLATFORM, "POST", `/admin/dsa-notices/${nobodys}/decide`, {
      decision: "upheld",
      facts: "The phrase names a person and tells others where to find them.",
      restriction: "removed",
      ground_kind: "legal",
      ground_text: "Article 16 notice, unlawful under national law.",
      recipient_identity: "someone@example.test",
    });
    assertEquals(decision.status, 200, JSON.stringify(decision.body));
    assert(decision.body.statement_id, "no statement of reasons was written");

    // Decided means decided: the row has to say so, or the queue keeps handing
    // the same notice back and the notifier is owed an answer that never comes.
    const after = await callAs(PLATFORM, "GET", "/admin/dsa-notices?state=all");
    const row = after.body.find((entry: Body) => entry.id === nobodys);
    assert(row, "an upheld notice is missing from its own status listing");
    assert(row.decided_at, "the notice was answered but never marked decided");

    // And the statement carries no storefront, rather than a label that would sit
    // in the column the panel filters tenants by.
    const statements = await database.query<{ brand: string | null }>(
      "SELECT brand FROM dsa_statements WHERE notice_id = $1",
      [nobodys],
    );
    assertEquals(statements?.length, 1);
    assertEquals(statements?.[0].brand, null);
  },
});

// The ordinary case, which was equally untested: a notice that does name a
// storefront keeps naming it on the statement.
Deno.test({
  name: "an upheld notice passes its storefront to the statement",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const mine = await seedNotice("alpha", `alpha notice ${uniqueId()}`);
    const decision = await callAs(PLATFORM, "POST", `/admin/dsa-notices/${mine}/decide`, {
      decision: "upheld",
      facts: "Removed on the ground given.",
      restriction: "hidden",
      ground_kind: "contractual",
      ground_text: "Clause 4 of the Terms.",
      recipient_identity: "author@example.test",
    });
    assertEquals(decision.status, 200, JSON.stringify(decision.body));
    const statements = await database.query<{ brand: string | null }>(
      "SELECT brand FROM dsa_statements WHERE notice_id = $1",
      [mine],
    );
    assertEquals(statements?.[0].brand, "alpha");
  },
});

// Two operators pressing at once. The guard near the top of the handler read
// decided_at before anything was locked, and the write did not repeat the
// condition — so both callers passed, both wrote a statement, both sent a pair
// of letters, and the second decision silently replaced the first. The comment
// above that guard said this was fixed; only the sequential case was.
Deno.test({
  name: "two simultaneous decisions produce one decision",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const id = await seedNotice("alpha", `race notice ${uniqueId()}`);
    const decide = (facts: string) =>
      callAs(PLATFORM, "POST", `/admin/dsa-notices/${id}/decide`, {
        decision: "upheld",
        facts,
        restriction: "removed",
        ground_kind: "legal",
        ground_text: "Unlawful.",
        recipient_identity: "author@example.test",
      });

    const [first, second] = await Promise.all([decide("first reading"), decide("second reading")]);
    const codes = [first.status, second.status].sort();
    assertEquals(codes, [200, 409], JSON.stringify([first.body, second.body]));

    // One notice, one statement of reasons — and therefore one letter to the
    // author, which is the part a person would have noticed.
    // count(*) arrives as a BigInt from this driver, so it is normalised rather
    // than compared to a string that would never match.
    const statements = await database.query<{ count: bigint }>(
      "SELECT count(*) AS count FROM dsa_statements WHERE notice_id = $1",
      [id],
    );
    assertEquals(Number(statements?.[0].count), 1);
  },
});

// A rejection writes no statement, so its only write is the decision — and it
// needed the same claim, or the notifier gets two letters saying the same thing.
Deno.test({
  name: "two simultaneous rejections produce one decision",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const id = await seedNotice("alpha", `race rejection ${uniqueId()}`);
    const reject = () =>
      callAs(PLATFORM, "POST", `/admin/dsa-notices/${id}/decide`, {
        decision: "rejected",
        facts: "Not unlawful in our reading.",
      });
    const [first, second] = await Promise.all([reject(), reject()]);
    assertEquals([first.status, second.status].sort(), [200, 409]);
  },
});

Deno.test({
  name: "a tenant cannot decide another tenant's notice",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const theirs = await seedNotice("beta", `beta notice ${uniqueId()}`);
    const decision = await callAs(MODERATOR_ALPHA, "POST", `/admin/dsa-notices/${theirs}/decide`, {
      decision: "rejected",
      facts: "Not illegal in my reading of it.",
    });
    // 404 rather than 403: whether another tenant has a notice with this id is
    // not this tenant's business — the same rule the operator list follows.
    assertEquals(decision.status, 404);

    const still = await database.queryOrThrow<{ decided_at: string | null }>(
      "SELECT decided_at FROM dsa_notices WHERE id = $1",
      [theirs],
    );
    assertEquals(still[0].decided_at, null, "the notice was decided by a stranger");
  },
});

// --- article 16(4): acknowledged is a fact, not an intention -------------------

Deno.test({
  name: "a notice nobody can be acknowledged to is not recorded as acknowledged",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { report } = await import("../src/routes/report.ts");
    const marker = `no-address-${uniqueId()}`;
    const response = await report(
      new Request("https://relay.test/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_kind: "other",
          reason_text: `[${marker}] no address supplied, so nothing can be sent`,
          bona_fide: true,
        }),
      }),
    );
    const body = await response.json();
    assertEquals(response.status, 202);
    // The flag used to be Boolean(email) under a name that reads as "the
    // Article 16(4) confirmation went out".
    assertEquals(body.acknowledged, false);

    const rows = await database.queryOrThrow<{ acknowledged_at: string | null }>(
      "SELECT acknowledged_at FROM dsa_notices WHERE id = $1",
      [body.id],
    );
    // And the column, which used to be set to now() by the INSERT itself — so
    // every notice claimed an acknowledgement, including the ones with nobody to
    // acknowledge to.
    assertEquals(rows[0].acknowledged_at, null);

    await database.queryOrThrow("DELETE FROM dsa_notices WHERE id = $1", [body.id]);
  },
});

// Every kind the route accepts has to survive the INSERT, not just the route's own
// check. Added 2026-08-31: `table_line` passed KINDS and died on the CHECK in
// db/005, which listed four kinds and not that one, so lib/db.ts swallowed the
// PostgresError and the reporter got 503 where Article 16(4) requires a receipt.
// The suite had no test that sent it — the three notices below used 'chat',
// 'feed_message' and 'other', which is why five days of green proved nothing.
//
// Looping over KINDS rather than naming the kinds keeps the next one honest: a
// value added to the set with no migration behind it fails here.
Deno.test({
  name: "every kind the route accepts reaches the database",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { report, KINDS } = await import("../src/routes/report.ts");
    for (const kind of KINDS) {
      const marker = `kind-${kind}-${uniqueId()}`;
      const response = await report(
        new Request("https://relay.test/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target_kind: kind,
            reason_text: `[${marker}] a notice about ${kind}, filed to prove it is storable`,
            bona_fide: true,
          }),
        }),
      );
      const body = await response.json();
      assertEquals(
        response.status,
        202,
        `a notice about ${kind} was refused with ${response.status}: ${JSON.stringify(body)}`,
      );
      const rows = await database.queryOrThrow<{ target_kind: string }>(
        "SELECT target_kind FROM dsa_notices WHERE id = $1",
        [body.id],
      );
      assertEquals(rows.length, 1, `a notice about ${kind} answered 202 and stored nothing`);
      assertEquals(rows[0].target_kind, kind);
      await database.queryOrThrow("DELETE FROM dsa_notices WHERE id = $1", [body.id]);
    }
  },
});

// --- a native key is a different kind of key ----------------------------------
//
// The terminal client ships one publishable key inside its image, shared by every
// container in the world. Two things follow that a browser key does not need, and
// both used to be absent: it has no Origin, because there is no page it came
// from; and a per-key daily counter would be one bucket for everyone, so a single
// script could lock the client out for the rest of the day for people who did
// nothing. Recorded in depth-client §2.5 before it was built.

Deno.test({
  name: "a native key carries no origins and is refused if given any",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const refused = await callAs(PLATFORM, "POST", "/admin/api-keys", {
      brand: "alpha",
      client_type: "native",
      origins: ["https://example.test"],
    });
    assertEquals(refused.status, 422, JSON.stringify(refused.body));

    const made = await callAs(PLATFORM, "POST", "/admin/api-keys", {
      brand: "alpha",
      client_type: "native",
    });
    assertEquals(made.status, 201, JSON.stringify(made.body));
    assertEquals(made.body.client_type, "native");
    assertEquals(made.body.origins.length, 0);
  },
});

Deno.test({
  name: "a native key is not metered per key, a browser key is",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const tenant = await import("../src/lib/tenant.ts");
    const apiKey = await import("../src/lib/api_key.ts");

    const native = await apiKey.createPublishableKey("alpha", [], "native");
    const browser = await apiKey.createPublishableKey("alpha", ["https://alpha.test"]);
    // One request each is all the allowance either of them gets.
    await database.queryOrThrow(
      "UPDATE api_keys SET quota_events_per_day = 1 WHERE id = ANY($1)",
      [[native.id, browser.id]],
    );

    const ask = async (id: string, origin: string | null) => {
      const headers: Record<string, string> = { "x-api-key": id };
      if (origin) headers.origin = origin;
      const result = await tenant.resolveTenant(
        new Request("https://relay.test/pageview", { method: "POST", headers }),
      );
      return tenant.isTenantDenied(result) ? result.response.status : 200;
    };

    // The browser key spends its allowance and is then refused — unchanged.
    assertEquals(await ask(browser.id, "https://alpha.test"), 200);
    await quota.flush();
    assertEquals(await ask(browser.id, "https://alpha.test"), 429);

    // The native key sends no Origin at all, and its allowance is never spent:
    // the same three calls that would have exhausted a browser key change
    // nothing.
    for (let i = 0; i < 3; i++) assertEquals(await ask(native.id, null), 200);
    await quota.flush();
    assertEquals(await ask(native.id, null), 200);
  },
});

// The boundary, exercised where it actually decides something: a database.
//
// Since 2026-09-07 the snapshot is bounded by what the notifier could see, and
// the feed is one world — `brand` there is attribution and takes no part in what
// is shown. So a notice that arrives through one face about a phrase attributed
// to another is examined, not refused: the person reporting it was looking at
// it. The offer is the other half of the same rule and is checked below.
//
// Only a database can tell an empty scoped lookup from a missing row, so this is
// the one suite where the branch actually runs. It builds the surface it needs —
// feed_messages does not exist yet, and the day it does, this test stops
// building and starts using it.
Deno.test({
  name: "a phrase attributed to another face is still examined, because the world is one",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { query } = await import("../src/lib/db.ts");
    const { captureTarget } = await import("../src/lib/dsa_snapshot.ts");

    const built = await query(
      // The columns are the ones SNAPSHOTTABLE asks for, not a plausible
      // guess: the first version of this probe omitted created_at and
      // author_identity, and the branch under test answered lookup_failed —
      // which is what a wrong column is supposed to produce.
      `CREATE TABLE IF NOT EXISTS feed_messages (
         id uuid PRIMARY KEY,
         brand text,
         text text,
         mode text,
         created_at timestamptz DEFAULT now(),
         visible_at timestamptz,
         author_identity uuid
       )`,
      [],
    );
    assert(built !== null, "the probe surface could not be created");

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO feed_messages (id, brand, text, visible_at)
       VALUES ($1, 'alpha', 'фраза из альфы', now())`,
      [id],
    );

    // Waiting in the moderation queue: public to nobody, so no notifier could
    // have seen it, so it is never copied — the boundary is time as well as face.
    const unpublished = crypto.randomUUID();
    await query(
      `INSERT INTO feed_messages (id, brand, text, visible_at)
       VALUES ($1, 'alpha', 'ещё не пропущена', NULL)`,
      [unpublished],
    );

    try {
      const elsewhere = await captureTarget("feed_message", id, "beta");
      assertEquals(elsewhere.status, "received");
      assertEquals(elsewhere.reason, null);
      assertEquals(
        (elsewhere.snapshot?.row as Record<string, unknown>)?.text,
        "фраза из альфы",
        "the copy has to be the phrase itself, not an empty shell",
      );

      const home = await captureTarget("feed_message", id, "alpha");
      assertEquals(home.status, "received");
      assertEquals(home.reason, null);

      // A notice that names no face at all: on a world surface there is nothing
      // to scope to, and refusing would mean refusing to look at something
      // public.
      const faceless = await captureTarget("feed_message", id, null);
      assertEquals(faceless.status, "received");
      assertEquals(faceless.reason, null);

      // The face of the row comes back with the copy: that is what routes the
      // notice away from whoever chose to send it.
      assertEquals(elsewhere.owner, "alpha");
      assertEquals(home.owner, "alpha");

      const waiting = await captureTarget("feed_message", unpublished, "alpha");
      assertEquals(waiting.status, "target_gone");
      assertEquals(
        waiting.snapshot,
        null,
        "a phrase nobody could see must never be copied, not even for its own face",
      );

      const missing = await captureTarget("feed_message", crypto.randomUUID(), "alpha");
      assertEquals(missing.status, "target_gone");
      assertEquals(missing.reason, null);
    } finally {
      await query(`DROP TABLE IF EXISTS feed_messages`, []);
    }
  },
});

// The other half of the same rule. An offer exists only under the face it was
// published through, so a notice arriving through another face is about
// something that was never visible to its sender — `out_of_scope`, and never
// `target_gone`, which would say the offer had expired while it is alive.
Deno.test({
  name: "an offer under another face is out_of_scope, because it was never visible",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { query } = await import("../src/lib/db.ts");
    const { captureTarget } = await import("../src/lib/dsa_snapshot.ts");

    const built = await query(
      `CREATE TABLE IF NOT EXISTS offers (
         id uuid PRIMARY KEY,
         brand text,
         offer_text text,
         discount_value text,
         conditions text,
         published_at timestamptz DEFAULT now(),
         venue_id uuid
       )`,
      [],
    );
    assert(built !== null, "the probe surface could not be created");

    const id = crypto.randomUUID();
    await query(
      `INSERT INTO offers (id, brand, offer_text) VALUES ($1, 'alpha', 'кофе за полцены')`,
      [id],
    );

    try {
      const elsewhere = await captureTarget("offer", id, "beta");
      assertEquals(elsewhere.status, "not_accessible");
      assertEquals(elsewhere.reason, "out_of_scope");

      const home = await captureTarget("offer", id, "alpha");
      assertEquals(home.status, "received");
      assertEquals(home.reason, null);

      const faceless = await captureTarget("offer", id, null);
      assertEquals(faceless.status, "not_accessible");
      assertEquals(faceless.reason, "unattributed");

      const missing = await captureTarget("offer", crypto.randomUUID(), "alpha");
      assertEquals(missing.status, "target_gone");
      assertEquals(missing.reason, null);
    } finally {
      await query(`DROP TABLE IF EXISTS offers`, []);
    }
  },
});

// The whole route, end to end: who ends up examining a notice about a row that
// belongs to another face.
//
// The two suites above hold the copy — what may be taken. This one holds the
// consequence decided with it on 2026-09-07: the notice is filed for the
// platform, not for the face that sent it. Without this, a tenant could name
// another tenant's identifiers and read the copies in their own queue, which is
// the exact hole the pre-boundary code closed by refusing to look at all.
//
// The face is set through the `source` hint rather than a key: publishable keys
// live in object storage, which this suite does not have, while the hint is the
// transitional path the storefronts still use (lib/tenant.ts). Either way it is
// the sender who chooses it, which is the whole reason routing cannot trust it.
Deno.test({
  name: "a notice about another face's row is filed for the platform, not the sender",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { query } = await import("../src/lib/db.ts");
    const { report } = await import("../src/routes/report.ts");

    const built = await query(
      `CREATE TABLE IF NOT EXISTS feed_messages (
         id uuid PRIMARY KEY,
         brand text,
         text text,
         mode text,
         created_at timestamptz DEFAULT now(),
         visible_at timestamptz,
         author_identity uuid
       )`,
      [],
    );
    assert(built !== null, "the probe surface could not be created");

    const filed = async (targetId: string, source: string) => {
      const response = await report(
        new Request("https://node.test/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target_kind: "feed_message",
            target_id: targetId,
            reason_text: "This phrase names a private address and invites people to go there.",
            bona_fide: true,
            source,
          }),
        }),
      );
      assertEquals(response.status, 202, "a report of illegal content is never refused");
      const body = await response.json();
      const rows = await query<
        { brand: string | null; received_via: string | null; snapshot: unknown }
      >(
        `SELECT brand, received_via, snapshot FROM dsa_notices WHERE id = $1`,
        [body.id],
      );
      assert(rows !== null && rows.length === 1, "the notice was not stored");
      return rows[0];
    };

    const theirs = crypto.randomUUID();
    await query(
      `INSERT INTO feed_messages (id, brand, text, visible_at)
       VALUES ($1, 'beta', 'фраза, живущая под бетой', now())`,
      [theirs],
    );
    const mine = crypto.randomUUID();
    await query(
      `INSERT INTO feed_messages (id, brand, text, visible_at)
       VALUES ($1, 'alpha', 'своя фраза', now())`,
      [mine],
    );

    try {
      // Sent through alpha, about a row belonging to beta.
      const foreign = await filed(theirs, "alpha.test");
      assertEquals(
        foreign.brand,
        null,
        "alpha must not examine a row belonging to beta — the platform does",
      );
      assertEquals(
        foreign.received_via,
        "alpha",
        "the face it arrived through is kept: an Article 16 reply is sent from somewhere",
      );
      assert(
        foreign.snapshot !== null,
        "the copy is still taken — the notifier saw the phrase, the world is one",
      );

      // Same face on both sides: nothing to route away, and a tenant keeps
      // seeing complaints about its own rows.
      const own = await filed(mine, "alpha.test");
      assertEquals(own.brand, "alpha", "a tenant still examines its own rows");
      assertEquals(own.received_via, "alpha");
    } finally {
      await query(`DROP TABLE IF EXISTS feed_messages`, []);
    }
  },
});

// A malformed identifier is not a failure to look — it is not an identifier.
//
// This needs a database, and that is the whole point: without one the surface
// check answers first and a broken id looks exactly like a fixed one. With the
// surface built, anything that is not a uuid used to reach Postgres, break the
// query, and be filed `lookup_failed` — "we could not look", a statement about
// our code — while writing an error-level line a stranger could produce at will.
Deno.test({
  name: "a target id that is not an identifier is free-form, not a failed lookup",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { query } = await import("../src/lib/db.ts");
    const { report } = await import("../src/routes/report.ts");

    const built = await query(
      `CREATE TABLE IF NOT EXISTS feed_messages (
         id uuid PRIMARY KEY,
         brand text,
         text text,
         mode text,
         created_at timestamptz DEFAULT now(),
         visible_at timestamptz,
         author_identity uuid
       )`,
      [],
    );
    assert(built !== null, "the probe surface could not be created");

    try {
      const response = await report(
        new Request("https://node.test/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            target_kind: "feed_message",
            target_id: "не помню, где-то в ленте",
            reason_text: "This phrase names a private address and invites people to go there.",
            bona_fide: true,
            source: "alpha.test",
          }),
        }),
      );
      assertEquals(response.status, 202, "a report of illegal content is never refused");
      const body = await response.json();

      const rows = await query<
        { target_id: string | null; snapshot_state: string; snapshot_reason: string | null }
      >(
        `SELECT target_id, snapshot_state, snapshot_reason FROM dsa_notices WHERE id = $1`,
        [body.id],
      );
      assert(rows !== null && rows.length === 1, "the notice was not stored");
      assertEquals(
        rows[0].snapshot_reason,
        null,
        "a typo must not be recorded as our failure to look",
      );
      assertEquals(rows[0].snapshot_state, "received");
      assertEquals(rows[0].target_id, null, "what was sent was never an identifier");
    } finally {
      await query(`DROP TABLE IF EXISTS feed_messages`, []);
    }
  },
});

// A year-old notice takes its statement with it.
//
// The two deletes used to run on their own ages, and `dsa_statements.notice_id`
// is ON DELETE SET NULL (db/005): a statement younger than a year survived the
// first delete and had its link nulled by the second. What remained was an
// Article 17 statement that could not name the notice that produced it — the
// record kept for defending a decision, with the decision's cause gone.
Deno.test({
  name: "pruning a year-old notice removes its statement rather than orphaning it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { pruneDsaRecords } = await import("../tools/prune_dsa_records.ts");

    // Old notice, young statement: the exact pair that used to come apart.
    const old = await database.queryOrThrow<{ id: string }>(
      `INSERT INTO dsa_notices
         (brand, target_kind, target_id, reason_text, bona_fide, status, snapshot_state,
          created_at)
       VALUES ('alpha', 'feed_message', NULL, $1, true, 'upheld', 'received',
               now() - interval '400 days')
       RETURNING id`,
      [`aged notice ${uniqueId()}`],
    );
    const noticeId = old[0].id;
    const statement = await database.queryOrThrow<{ id: string }>(
      `INSERT INTO dsa_statements
         (brand, notice_id, target_id, recipient_identity, restriction, facts,
          ground_kind, ground_text, created_at)
       VALUES ('alpha', $1, 'x', 'someone', 'removed', 'facts', 'legal', 'ground', now())
       RETURNING id`,
      [noticeId],
    );
    const statementId = statement[0].id;

    // A young pair that must survive untouched.
    const fresh = await database.queryOrThrow<{ id: string }>(
      `INSERT INTO dsa_notices
         (brand, target_kind, target_id, reason_text, bona_fide, status, snapshot_state)
       VALUES ('alpha', 'feed_message', NULL, $1, true, 'received', 'received')
       RETURNING id`,
      [`fresh notice ${uniqueId()}`],
    );

    try {
      await pruneDsaRecords({ apply: true });

      const survived = await database.queryOrThrow<{ id: string; notice_id: string | null }>(
        `SELECT id, notice_id FROM dsa_statements WHERE id = $1`,
        [statementId],
      );
      assertEquals(
        survived.length,
        0,
        "the statement of a pruned notice must go with it, not stay with a null link",
      );

      const gone = await database.queryOrThrow<{ id: string }>(
        `SELECT id FROM dsa_notices WHERE id = $1`,
        [noticeId],
      );
      assertEquals(gone.length, 0, "the year-old notice itself must be gone");

      const kept = await database.queryOrThrow<{ id: string }>(
        `SELECT id FROM dsa_notices WHERE id = $1`,
        [fresh[0].id],
      );
      assertEquals(kept.length, 1, "a notice younger than a year must survive");
    } finally {
      await database.queryOrThrow(`DELETE FROM dsa_notices WHERE id = $1`, [fresh[0].id]);
    }
  },
});

// The other half of the health probe: with a database, it must say so.
//
// The suite without one covers "off"; this covers "ok", and together they are
// what makes the field worth reading. A balancer rule written against "down"
// is only as good as the two states it can tell apart.
Deno.test({
  name: "health reports the database it can actually reach",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { health, ready } = await import("../src/routes/health.ts");

    const body = await (await health()).json();
    assertEquals(body.status, "ok");
    assertEquals(body.database, "ok", "with DATABASE_URL set and answering, this is 'ok'");

    const readiness = await ready();
    assertEquals(readiness.status, 200);
    assertEquals((await readiness.json()).status, "ready");
  },
});
