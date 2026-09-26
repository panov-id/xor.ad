// Two sweeps that delete in batches, each batch its own committed statement,
// count what they deleted batch by batch: a batch that throws after others
// went through must not take their count with it. Rows already gone cannot be
// counted again by a retry, so a count made after the loop undercounts for
// good (review panel 2, G18 — pruneInvites, B47; review panel 3, D4 —
// sweepExpiredPhrases, B62). Until B66 both were held by reading alone.
//
// The failing batch is made by a trigger in the throwaway database: it lets a
// set number of rows go and raises on the next one, so the first batch
// commits and the second throws. A sequence counts, because a sequence is not
// rolled back with the statement that raised.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const { render } = await import("../src/lib/metrics.ts");
const { sweepExpiredPhrases } = await import("../src/lib/feed_verdict.ts");
const { pruneInvites } = await import("../src/lib/scheduled.ts");

await database.queryOrThrow("SELECT 1");

// The pool keeps its connections between cases: the same leak every database
// suite here lets through (take_down_stress.test.ts).
const pooled = { sanitizeOps: false, sanitizeResources: false };

const counter = (name: string, label: string) =>
  Number(render().match(new RegExp(`${name}\\{${label}\\} (\\d+)`))?.[1] ?? 0);

// Lets `allowed` rows of `table` be deleted, then raises on every next one,
// until dropped.
async function failAfter(table: string, allowed: number): Promise<() => Promise<void>> {
  await database.queryOrThrow(`DROP SEQUENCE IF EXISTS b66_gone`);
  await database.queryOrThrow(`CREATE SEQUENCE b66_gone`);
  await database.queryOrThrow(
    `CREATE OR REPLACE FUNCTION b66_fail_after() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       IF nextval('b66_gone') > TG_ARGV[0]::int THEN
         RAISE EXCEPTION 'b66: batch failed on purpose';
       END IF;
       RETURN OLD;
     END $$`,
  );
  await database.queryOrThrow(
    `CREATE TRIGGER b66_fail_after BEFORE DELETE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION b66_fail_after(${allowed})`,
  );
  return async () => {
    await database.queryOrThrow(`DROP TRIGGER IF EXISTS b66_fail_after ON ${table}`);
    await database.queryOrThrow(`DROP FUNCTION IF EXISTS b66_fail_after()`);
    await database.queryOrThrow(`DROP SEQUENCE IF EXISTS b66_gone`);
  };
}

async function person(): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, signup_completed_at)
     VALUES ($1, 'batch-counts', 30, 'not-a-real-key', now())`,
    [id],
  );
  await database.queryOrThrow(`INSERT INTO identity_stats (identity) VALUES ($1)`, [id]);
  return id;
}

Deno.test({ name: "the expiry sweep counts the batches that went before one that failed (D4)", ...pooled }, async () => {
  // Whatever earlier suites left past its term goes first, so every row due
  // below is this case's own.
  await sweepExpiredPhrases();
  const author = await person();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at, like_count)
       VALUES ($1, 'sosed', $2, 'пачка', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33,
               now() - interval '4 hours', now() - interval '1 minute', 0)`,
      [id, author],
    );
    ids.push(id);
  }
  const drop = await failAfter("feed_messages", 2);
  const before = counter("relay_feed_verdict_total", `verdict="expired"`);
  try {
    await assertRejects(() => sweepExpiredPhrases({ batch: 2 }), Error, "b66: batch failed on purpose");
  } finally {
    await drop();
  }
  const [{ n }] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM feed_messages WHERE id = ANY($1::uuid[])`, [ids]);
  assertEquals(n, 3, `the first batch of two did not commit before the second failed (${5 - n} of 5 gone)`);
  assertEquals(counter("relay_feed_verdict_total", `verdict="expired"`) - before, 2,
    "two phrases are gone and committed, and relay_feed_verdict_total{verdict=\"expired\"} did not count them: the count is taken after the loop again");
  // The rest goes on the next pass, and is counted then.
  assertEquals(await sweepExpiredPhrases(), 3, "the pass after the failure did not take the three left");
});

Deno.test({ name: "the invitation sweep counts the unacknowledged replies of batches before one that failed (G18)", ...pooled }, async () => {
  // As above: earlier suites' due invitations first. INVITE_BATCH is 2000 and
  // not a parameter, so the case lays out one batch and one row more.
  await pruneInvites();
  const who = await person();
  const session = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key, frozen_at, frozen_reason)
     VALUES ($1, $2, 'not-a-key', 'not-a-key', now(), 'transfer')`,
    [session, who],
  );
  await database.queryOrThrow(
    `INSERT INTO session_invites (lookup_id, identity, session, expires_at, decided_at, decision, reply_envelope)
     SELECT 'b66-batch-counts-' || lpad(g::text, 6, '0'), $1, $2, now() - interval '2 hours',
            now() - interval '2 hours', 'approved', '\\x00'::bytea
       FROM generate_series(1, 2001) g`,
    [who, session],
  );
  const drop = await failAfter("session_invites", 2000);
  const before = counter("relay_transfer_total", `result="reply_unacknowledged"`);
  try {
    await assertRejects(() => pruneInvites(), Error, "b66: batch failed on purpose");
  } finally {
    await drop();
  }
  const [{ n }] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM session_invites WHERE identity = $1`, [who]);
  assertEquals(n, 1, `the first batch of 2000 did not commit before the second failed (${2001 - n} of 2001 gone)`);
  assertEquals(counter("relay_transfer_total", `result="reply_unacknowledged"`) - before, 2000,
    "2000 unacknowledged replies are gone and committed, and relay_transfer_total{result=\"reply_unacknowledged\"} did not count them: the count is taken after the loop again");
  const next = await pruneInvites();
  assert(next.unacknowledged >= 1, "the pass after the failure did not take the one left");
});

addEventListener("unload", () => {
  database.closePool();
});
