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
