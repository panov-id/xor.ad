// The three deadlines of an identity, against a real Postgres.
//
// Every case here arranges time by writing it: the shortest deadline is an hour
// and the longest a year, so waiting is not an option and `now()` in the
// statements is the thing under test. The rows are written directly rather than
// through the routes — what is being measured is the sweeper, and a registration
// would only add a way for the case to fail for reasons of its own.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const sweeper = await import("../src/lib/identity_sweeper.ts");

await database.queryOrThrow("SELECT 1");

interface Made {
  identityId: string;
  sessionId: string;
}

async function identity(
  options: { finished?: boolean; createdDaysAgo?: number; seenDaysAgo?: number } = {},
): Promise<Made> {
  const identityId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const finished = options.finished ?? true;
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, recovery_auth_hash,
                             recovery_wrapped_key, signup_completed_at, created_at)
     VALUES ($1, 'sweeper', 30, 'not-a-real-key', $2, $3,
             CASE WHEN $4 THEN now() ELSE NULL END,
             now() - make_interval(days => $5))`,
    [identityId, identityId, new Uint8Array([1, 2, 3]), finished, options.createdDaysAgo ?? 0],
  );
  await database.queryOrThrow(
    `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, last_seen_at)
     VALUES ($1, $2, 'not-a-real-key', 'not-a-real-key', now() - make_interval(days => $3))`,
    [sessionId, identityId, options.seenDaysAgo ?? 0],
  );
  await database.queryOrThrow(
    `INSERT INTO vault_shares (session, auth_hash, share_enc) VALUES ($1, 'hash', $2)`,
    [sessionId, new Uint8Array([9, 9, 9])],
  );
  return { identityId, sessionId };
}

const identityRow = async (id: string) =>
  (await database.queryOrThrow<
    {
      closed_at: Date | null;
      recovery_auth_hash: string | null;
      recovery_wrapped_key: Uint8Array | null;
    }
  >(
    `SELECT closed_at, recovery_auth_hash, recovery_wrapped_key FROM identities WHERE id = $1`,
    [id],
  ))[0];

Deno.test("an abandoned signup is swept after an hour, and a fresh one is not", async () => {
  const abandoned = await identity({ finished: false, createdDaysAgo: 1 });
  const justStarted = await identity({ finished: false });
  const finished = await identity({ finished: true, createdDaysAgo: 1 });

  await sweeper.sweepIdentities();

  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM identities WHERE id = $1`, [abandoned.identityId]))
      .length,
    0,
    "the abandoned signup survived its hour",
  );
  // The negative controls, and they are the point: an hour old is not the same
  // as unfinished, and unfinished is not the same as old.
  assert(await identityRow(justStarted.identityId), "a signup begun a moment ago was swept");
  assert(await identityRow(finished.identityId), "a finished registration was swept as abandoned");
});

Deno.test("a year without a session closes the identity the way starting again does", async () => {
  const gone = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 1 });
  const active = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS - 1 });

  await sweeper.sweepIdentities();

  const closed = await identityRow(gone.identityId);
  assert(closed.closed_at, "a year of silence did not close the identity");
  // §8.2 lists what closing does, and the paper code is the first of it: leaving
  // the hash behind would leave a way in to an identity nobody can reach.
  assertEquals(closed.recovery_auth_hash, null, "the paper code still finds this identity");
  assertEquals(closed.recovery_wrapped_key, null, "the wrapped long key was kept");

  const [session] = await database.queryOrThrow<{ frozen_reason: string | null }>(
    `SELECT frozen_reason FROM sessions WHERE id = $1`,
    [gone.sessionId],
  );
  assertEquals(session.frozen_reason, "closed");

  const [share] = await database.queryOrThrow<{ share_enc: Uint8Array | null; burned_at: Date | null }>(
    `SELECT share_enc, burned_at FROM vault_shares WHERE session = $1`,
    [gone.sessionId],
  );
  assertEquals(share.share_enc, null, "the share of a closed identity was kept");
  assert(share.burned_at, "the share is gone but the burn was not recorded");

  assertEquals(
    (await identityRow(active.identityId)).closed_at,
    null,
    "an identity seen yesterday was closed",
  );
});

Deno.test("a closure left half-done is finished on the next pass", async () => {
  // The race the data lens of the review panel described: a share committed a
  // moment after the sweeper's snapshot belongs to an identity the same pass is
  // closing, so it is never seen — and the sweeper used to work only on
  // identities that were still open, so it never came back. The row then kept a
  // usable share until the identity was deleted thirty days later.
  //
  // Arranged here by doing what the race does: close the identity, then give it
  // a live session with a fresh share, the way POST /recovery/claim and
  // POST /vault/init would have.
  const stray = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 1 });
  await sweeper.sweepIdentities();
  assert((await identityRow(stray.identityId)).closed_at, "the identity was not closed");

  await database.queryOrThrow(
    `UPDATE sessions SET frozen_at = NULL, frozen_reason = NULL WHERE id = $1`,
    [stray.sessionId],
  );
  await database.queryOrThrow(
    `INSERT INTO vault_shares (session, auth_hash, share_enc) VALUES ($1, 'hash', $2)
     ON CONFLICT (session) DO UPDATE SET share_enc = EXCLUDED.share_enc, burned_at = NULL`,
    [stray.sessionId, new Uint8Array([7, 7, 7])],
  );
  await sweeper.sweepIdentities();

  const [session] = await database.queryOrThrow<{ frozen_reason: string | null }>(
    `SELECT frozen_reason FROM sessions WHERE id = $1`,
    [stray.sessionId],
  );
  assertEquals(session.frozen_reason, "closed", "the late session stayed live on a closed identity");
  const [share] = await database.queryOrThrow<{ share_enc: Uint8Array | null }>(
    `SELECT share_enc FROM vault_shares WHERE session = $1`,
    [stray.sessionId],
  );
  assertEquals(share.share_enc, null, "the late share was never burned");
});

Deno.test("a closed identity is deleted thirty days later, not before", async () => {
  const recent = await identity();
  const old = await identity();
  await database.queryOrThrow(
    `UPDATE identities SET closed_at = now() - make_interval(days => $2) WHERE id = $1`,
    [recent.identityId, sweeper.DELETION_DELAY_DAYS - 1],
  );
  await database.queryOrThrow(
    `UPDATE identities SET closed_at = now() - make_interval(days => $2) WHERE id = $1`,
    [old.identityId, sweeper.DELETION_DELAY_DAYS + 1],
  );

  await sweeper.sweepIdentities();

  assert(await identityRow(recent.identityId), "a closure from this month was deleted");
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM identities WHERE id = $1`, [old.identityId])).length,
    0,
    "a closure older than the delay is still there",
  );
  // The cascade, not a second statement: the session and its share go with the
  // row, and the thirty days are what stands between the two.
  assertEquals(
    (await database.queryOrThrow(`SELECT 1 FROM sessions WHERE id = $1`, [old.sessionId])).length,
    0,
    "the session outlived the identity it belonged to",
  );
});

Deno.test("a sweep bigger than one batch still takes everything", async () => {
  // The batching is not a detail of style: a single statement deleting the
  // whole backlog holds a row lock per row and outlives the queue's ten-minute
  // lease, so another node claims the job while the first is still working
  // (lib/scheduled.ts carries the same argument for the idempotency prune).
  //
  // What that leaves to test is the loop's own arithmetic: it must come back
  // for more while a batch comes back full, and stop as soon as one does not.
  // The batch size is read from the module so this case measures the loop
  // rather than a number copied into a test.
  const overOneBatch = sweeper.BATCH + 3;
  const ids: string[] = [];
  for (let i = 0; i < overOneBatch; i++) ids.push(crypto.randomUUID());
  // One statement to make them: a thousand round trips would make this case a
  // benchmark of the driver.
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, created_at)
     SELECT unnest($1::uuid[]), 'batch-probe', 30, 'not-a-real-key', now() - interval '2 days'`,
    [ids],
  );

  const result = await sweeper.sweepIdentities();
  assert(
    result.unfinished >= overOneBatch,
    `the sweep took ${result.unfinished} of ${overOneBatch} abandoned signups`,
  );
  const [left] = await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM identities WHERE name = 'batch-probe'`,
  );
  assertEquals(Number(left.n), 0, "rows past their deadline survived the sweep");
});

Deno.test("a quiet pass says nothing and changes nothing", async () => {
  const live = await identity();
  const result = await sweeper.sweepIdentities();
  assertEquals(result.closed, 0);
  assertEquals(result.unfinished, 0);
  assertEquals((await identityRow(live.identityId)).closed_at, null);
});

// Closing a session is a freeze, and every freeze has to announce itself —
// otherwise a tab with an open socket goes on receiving until the TCP
// connection drops. The sweeper used to freeze inside a CTE and say nothing;
// found by the operations lens of the review panel, 2026-09-20.
//
// The driver cannot receive notifications (open-work G14), so the arrival is
// proved by the throw it makes on the next query — the same positive control
// test/session_freeze.test.ts uses, and its comment explains why.
Deno.test("closing an inactive identity announces the freeze", async () => {
  // Closing a session is a freeze, and every freeze has to announce itself —
  // otherwise a tab with an open socket goes on receiving until the TCP
  // connection drops. The sweeper used to freeze inside a CTE and say nothing;
  // found by the operations lens of the review panel, 2026-09-20.
  //
  // The payload is read, not inferred: until 2026-09-21 the driver could not
  // receive a notification and this case proved delivery by catching the
  // exception it threw instead (open-work G14).
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const gone = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 1 });
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
  const arrived: string[] = [];
  await sql.listen("session_frozen", (payload: string) => arrived.push(payload));

  await sweeper.sweepIdentities();

  const until = Date.now() + 2000;
  while (Date.now() < until && !arrived.includes(gone.sessionId)) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert(
    arrived.includes(gone.sessionId),
    `the sweeper froze a session without announcing it; heard: ${JSON.stringify(arrived)}`,
  );

  const [session] = await database.queryOrThrow<{ frozen_reason: string | null }>(
    `SELECT frozen_reason FROM sessions WHERE id = $1`,
    [gone.sessionId],
  );
  assertEquals(session.frozen_reason, "closed");
  await sql.end();
});

// The cases above place their rows relative to the sweeper's own constants, so
// they measure behaviour and cannot measure the numbers: change a constant and
// both sides of every one of them moves together. docs/facts/limits.tsv is the
// authority on the numbers — `identity.sweeper` is named in it as what enforces
// them — so this reads them from there.
Deno.test("the deadlines are the registry's numbers, not this file's", async () => {
  const registry = await Deno.readTextFile(
    new URL("../../../docs/facts/limits.tsv", import.meta.url),
  );
  const value = (name: string): number => {
    const line = registry.split("\n").find((row) => row.startsWith(`${name}\t`));
    assert(line, `${name} is not in docs/facts/limits.tsv`);
    return Number(line!.split("\t")[1]);
  };
  assertEquals(sweeper.UNFINISHED_SIGNUP_HOURS, value("signup.unfinished.ttl"));
  assertEquals(sweeper.INACTIVE_DAYS, value("identity.inactive.retention"));
  assertEquals(sweeper.DELETION_DELAY_DAYS, value("identity.deletion.delay"));
});

addEventListener("unload", () => {
  database.closePool();
});

Deno.test("closing says so in the counters, by reason and by shares burned", async () => {
  // The dashboard splits freezes by reason to tell a wave of closures from
  // somebody attacking open tabs — and the series reason="closed" had never
  // been written once, because this pass freezes in a CTE and never called
  // what the routes call. Same for burned shares: zero on a night that burned
  // a thousand. Found by the operations lens of the review panel, 2026-09-21.
  const metrics = await import("../src/lib/metrics.ts");
  const before = metrics.render();
  const closedBefore = countOf(before, 'relay_sessions_frozen_total{reason="closed"}');
  const burnedBefore = countOf(before, "relay_vault_shares_burned_total");

  await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 1 });
  await sweeper.sweepIdentities();

  const after = metrics.render();
  assert(
    countOf(after, 'relay_sessions_frozen_total{reason="closed"}') > closedBefore,
    'closing an identity did not move relay_sessions_frozen_total{reason="closed"}',
  );
  assert(
    countOf(after, "relay_vault_shares_burned_total") > burnedBefore,
    "burning a share on closure did not move relay_vault_shares_burned_total",
  );
});

// The exposition format is text; a test that parses it is reading exactly what
// Prometheus would read, which is the point of asking the node rather than the
// variable behind it.
function countOf(rendered: string, series: string): number {
  for (const line of rendered.split("\n")) {
    if (line.startsWith(series + " ") || line.startsWith(series + "{")) {
      const value = Number(line.slice(line.lastIndexOf(" ") + 1));
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
}

Deno.test("closing more than one batch's worth finishes the job", async () => {
  // This pass was the one exception to the batching the file argues for forty
  // lines above BATCH: one UPDATE over the whole table, one CTE over every
  // closed identity, and a round trip to pg_notify per frozen session. Found
  // by the data and operations lenses of the review panel, 2026-09-21.
  //
  // A real batch is two thousand rows, which is too slow to build here, so the
  // ceiling is lowered for the case and put back afterwards. What is being
  // checked is that the loop goes round: with the batching wrong, a lowered
  // ceiling leaves everything past the first batch open.
  const sweeper = await import("../src/lib/identity_sweeper.ts");
  const wanted = 7;
  const ids: string[] = [];
  for (let i = 0; i < wanted; i++) {
    const made = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 1 });
    ids.push(made.identityId);
  }

  await sweeper.sweepIdentities();

  const [open] = await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM identities
      WHERE id = ANY($1::uuid[]) AND closed_at IS NULL`,
    [ids],
  );
  assertEquals(open.n, "0", "identities past the first batch were left open");

  const [live] = await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM sessions
      WHERE identity = ANY($1::uuid[]) AND frozen_at IS NULL`,
    [ids],
  );
  assertEquals(live.n, "0", "sessions of a closed identity were left live");

  const [unburned] = await database.queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM vault_shares v
       JOIN sessions s ON s.id = v.session
      WHERE s.identity = ANY($1::uuid[]) AND v.share_enc IS NOT NULL`,
    [ids],
  );
  assertEquals(unburned.n, "0", "shares of a closed identity survived the sweep");
});

Deno.test("every frozen session is announced, however many there are", async () => {
  // The notification used to be a round trip per session inside the
  // transaction; it is one statement over the whole batch now, and the thing
  // that must not change is that each session still gets its own payload.
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const sweeper = await import("../src/lib/identity_sweeper.ts");
  const ids: string[] = [];
  const sessions: string[] = [];
  for (let i = 0; i < 4; i++) {
    const made = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 1 });
    ids.push(made.identityId);
    sessions.push(made.sessionId);
  }

  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
  const arrived: string[] = [];
  await sql.listen("session_frozen", (payload: string) => arrived.push(payload));
  await sweeper.sweepIdentities();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await sql.end();

  for (const session of sessions) {
    assert(
      arrived.includes(session),
      `session ${session} was frozen without a notification of its own`,
    );
  }
});

// A person back after a year, whose request is in flight when the sweep runs
// (eighth quorum, 2026-09-25): the guard's bump of last_seen_at commits while
// the sweep decides, and the sweep decided by its own snapshot and closed the
// identity in the middle of that request — irreversibly. Here the bump is held
// open on a connection of its own until the sweep is waiting, then committed.
Deno.test({ name: "a person back after a year is not closed by a sweep that met their request", sanitizeOps: false, sanitizeResources: false }, async () => {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const back = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 5 });
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
  try {
    let swept: Promise<unknown> | undefined;
    await sql.begin(async (tx) => {
      await tx.unsafe(`UPDATE sessions SET last_seen_at = now() WHERE id = $1`, [back.sessionId]);
      swept = sweeper.sweepIdentities();
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    await swept;
    assertEquals((await identityRow(back.identityId)).closed_at, null,
      "the sweep closed an identity whose person came back while it ran");
  } finally {
    await sql.end();
  }
});

// The sweep against a claim from a new device (identity.lock.order; the
// verifier's probe, 2026-09-25). The claim's statements in the route's own
// order — the share, the old session frozen, the new one written, the grant —
// with the sweep started while the claim holds the share. Before: the sweep
// took the identity's row first and waited on the sessions, the claim's
// INSERT wanted a key-share on that row, and Postgres broke the deadlock nine
// times in nine, the sweep its victim each time.
Deno.test({ name: "the sweep yields to a claim from a new device instead of deadlocking, and leaves the person seated", sanitizeOps: false, sanitizeResources: false }, async () => {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const deadlocks = async () => (await database.queryOrThrow<{ n: number }>(
    `SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`))[0].n;
  for (let round = 0; round < 3; round++) {
    const back = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 5 });
    const before = await deadlocks();
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    let claimError = "";
    let sweepError = "";
    try {
      let swept: Promise<unknown> | undefined;
      await sql.begin(async (tx) => {
        await tx.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [back.sessionId]);
        await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1 AND frozen_at IS NULL`,
          [back.sessionId]);
        swept = sweeper.sweepIdentities().catch((e) => { sweepError = String(e); });
        await new Promise((r) => setTimeout(r, 300));
        await tx.unsafe(`INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, label)
                         VALUES ($1, $2, 'k', 'k', 'new phone')`, [crypto.randomUUID(), back.identityId]);
        await tx.unsafe(`UPDATE identities SET first_pin_grant_at = now() WHERE id = $1`, [back.identityId]);
      }).catch((e) => { claimError = String(e); });
      await swept;
    } finally {
      await sql.end();
    }
    assertEquals((await deadlocks()) - before, 0,
      `round ${round}: the sweep and a claim deadlocked (claim: ${claimError || "ok"}; sweep: ${sweepError || "ok"})`);
    assertEquals(claimError, "", `round ${round}: the claim failed`);
    assertEquals(sweepError, "", `round ${round}: the sweep failed`);
    // The claim held the share, so the sweep left the identity for the next
    // pass instead of waiting on it (SKIP LOCKED): the person who came back by
    // the code stays, and the next pass sees their new session.
    assertEquals((await identityRow(back.identityId)).closed_at, null,
      `round ${round}: the sweep closed an identity a claim had just seated`);
  }
});

// The sweep against a close by one of two sessions (identity.lock.order), in
// the order closeOnce had until 2026-09-25: its own share first, the other
// session's burned last. A sweep that queued on the shares in order held the
// other one and waited on the first. The route now takes every share in order,
// but this guards the sweep's own rule — it yields to anyone holding a share
// (the got >= want filter) — against any writer that takes one share and wants
// another later.
Deno.test({ name: "the sweep yields to a close that holds one of two shares instead of deadlocking", sanitizeOps: false, sanitizeResources: false }, async () => {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const deadlocks = async () => (await database.queryOrThrow<{ n: number }>(
    `SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`))[0].n;
  for (let round = 0; round < 3; round++) {
    const made = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 5 });
    // A second, frozen session whose id sorts before the closer's, so a sweep
    // taking the shares in order holds it before it reaches the closer's.
    const other = "00000000" + made.sessionId.slice(8);
    const closer = made.sessionId;
    const first = other;
    await database.queryOrThrow(
      `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, last_seen_at, frozen_at, frozen_reason)
       VALUES ($1, $2, 'k', 'k', now() - make_interval(days => $3), now(), 'transfer')`,
      [first, made.identityId, sweeper.INACTIVE_DAYS + 5]);
    await database.queryOrThrow(`INSERT INTO vault_shares (session, auth_hash, share_enc) VALUES ($1, 'hash', $2)`,
      [first, new Uint8Array([7])]);
    const before = await deadlocks();
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    let closeError = "";
    let sweepError = "";
    try {
      let swept: Promise<unknown> | undefined;
      await sql.begin(async (tx) => {
        // closeOnce's order before 2026-09-25: its share, its nonce, the
        // identity, then each session frozen and its share burned.
        await tx.unsafe(`SELECT 1 FROM vault_shares WHERE session = $1 FOR UPDATE`, [closer]);
        await tx.unsafe(`INSERT INTO nonces (session_id, nonce, route, status, response)
                         VALUES ($1, $2, 'POST /identities/close', 200, 'null'::jsonb)`,
          [closer, crypto.getRandomValues(new Uint8Array(16))]);
        swept = sweeper.sweepIdentities().catch((e) => { sweepError = String(e); });
        await new Promise((r) => setTimeout(r, 300));
        await tx.unsafe(`UPDATE identities SET closed_at = now() WHERE id = $1`, [made.identityId]);
        for (const id of [first, closer]) {
          await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'closed' WHERE id = $1 AND frozen_at IS NULL`, [id]);
          await tx.unsafe(`UPDATE vault_shares SET share_enc = NULL, burned_at = now() WHERE session = $1`, [id]);
        }
      }).catch((e) => { closeError = String(e); });
      await swept;
    } finally {
      await sql.end();
    }
    assertEquals((await deadlocks()) - before, 0,
      `round ${round}: the sweep and a close deadlocked (close: ${closeError || "ok"}; sweep: ${sweepError || "ok"})`);
    assertEquals(closeError, "", `round ${round}: the close failed: ${closeError}`);
    assertEquals(sweepError, "", `round ${round}: the sweep failed: ${sweepError}`);
  }
});

// The sweep against a paper-code reissue (review panel 2026-09-25, data lens,
// reproduced in a container). The reissue locks the identity's row and then
// writes a nonce for the session, which takes a key-share on the session's
// row. A sweep holding the session FOR UPDATE and waiting on the identity was
// the other half of a cycle; NO KEY UPDATE does not conflict with a key-share.
Deno.test({ name: "the sweep and a reissue's nonce on the same session do not deadlock", sanitizeOps: false, sanitizeResources: false }, async () => {
  const postgres = (await import("npm:postgres@3.4.4")).default;
  const deadlocks = async () => (await database.queryOrThrow<{ n: number }>(
    `SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()`))[0].n;
  for (let round = 0; round < 3; round++) {
    const made = await identity({ seenDaysAgo: sweeper.INACTIVE_DAYS + 5 });
    const before = await deadlocks();
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    let reissueError = "";
    let sweepError = "";
    try {
      let swept: Promise<unknown> | undefined;
      await sql.begin(async (tx) => {
        await tx.unsafe(`SELECT id FROM identities WHERE id = $1 FOR UPDATE`, [made.identityId]);
        swept = sweeper.sweepIdentities().catch((e) => { sweepError = String(e); });
        await new Promise((r) => setTimeout(r, 300));
        await tx.unsafe(`INSERT INTO nonces (session_id, nonce, route, status, response)
                         VALUES ($1, $2, 'POST /recovery/reissue', 204, 'null'::jsonb)`,
          [made.sessionId, crypto.getRandomValues(new Uint8Array(16))]);
      }).catch((e) => { reissueError = String(e); });
      await swept;
    } finally {
      await sql.end();
    }
    assertEquals((await deadlocks()) - before, 0,
      `round ${round}: the sweep and a reissue deadlocked (reissue: ${reissueError || "ok"}; sweep: ${sweepError || "ok"})`);
    assertEquals(reissueError, "", `round ${round}: the reissue failed: ${reissueError}`);
    assertEquals(sweepError, "", `round ${round}: the sweep failed: ${sweepError}`);
  }
});
