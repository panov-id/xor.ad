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

Deno.test("a quiet pass says nothing and changes nothing", async () => {
  const live = await identity();
  const result = await sweeper.sweepIdentities();
  assertEquals(result.closed, 0);
  assertEquals(result.unfinished, 0);
  assertEquals((await identityRow(live.identityId)).closed_at, null);
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
