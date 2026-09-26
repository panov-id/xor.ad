// takeDownLive (a time away, a close) against sweepExpiredPhrases, at once, on
// the same phrases and likes (B39).
//
// lib/take_down.ts takes the counters, then the live liked phrases, then
// deletes the likes and writes like_count; the expiry sweep deletes expired
// phrases and their likes go by cascade. Two orders over the same rows are a
// deadlock waiting for its moment, and in one process the moment rarely comes,
// so the case makes many of them: one person who liked many phrases, half of
// them already past their term and waiting for the sweep, both run together,
// round after round. Postgres answers a cycle with 40P01 and take_down's own
// lock_timeout with 55P03; either one is the failure this case exists for.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const { takeDownLive, TakeDownRetry } = await import("../src/lib/take_down.ts");
const { sweepExpiredPhrases } = await import("../src/lib/feed_verdict.ts");

await database.queryOrThrow("SELECT 1");

const ROUNDS = Number(Deno.env.get("B39_ROUNDS") ?? 20);
const AUTHORS = 60;

async function person(): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, signup_completed_at)
     VALUES ($1, 'take-down-stress', 30, 'not-a-real-key', now())`,
    [id],
  );
  await database.queryOrThrow(`INSERT INTO identity_stats (identity) VALUES ($1)`, [id]);
  return id;
}

// One liker, AUTHORS authors with a phrase each, every phrase liked by the
// liker; even ones already past their term, odd ones alive.
async function arrange(): Promise<{ liker: string; live: string[]; expired: string[] }> {
  const liker = await person();
  const live: string[] = [];
  const expired: string[] = [];
  for (let i = 0; i < AUTHORS; i++) {
    const author = await person();
    const phrase = crypto.randomUUID();
    const past = i % 2 === 0;
    await database.queryOrThrow(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at, like_count)
       VALUES ($1, 'sosed', $2, 'стресс', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33,
               now() - interval '4 hours', now() + CASE WHEN $3 THEN interval '-1 minute' ELSE interval '1 hour' END, 1)`,
      [phrase, author, past],
    );
    await database.queryOrThrow(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [liker, phrase]);
    await database.queryOrThrow(`UPDATE identity_stats SET likes_received = 1 WHERE identity = $1`, [author]);
    (past ? expired : live).push(phrase);
  }
  await database.queryOrThrow(`UPDATE identity_stats SET likes_given = $2 WHERE identity = $1`, [liker, AUTHORS]);
  return { liker, live, expired };
}

// As routes/away.ts and routes/identity.ts call it: its own transaction,
// started again on TakeDownRetry.
async function takeDown(liker: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await database.transaction((run) => takeDownLive(run, liker));
      return;
    } catch (error) {
      if (!(error instanceof TakeDownRetry)) throw error;
    }
  }
  throw new Error("takeDownLive asked for a retry three times");
}

const code = (error: unknown) => (error as { code?: string })?.code ?? String(error);

// The pool opens a second connection for the two running at once and keeps it:
// the same leak every database suite here lets through.
Deno.test({ name: "a take-down and the expiry sweep on the same phrases and likes do not deadlock, and the counts add up", sanitizeOps: false, sanitizeResources: false }, async () => {
  const failures: string[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const { liker, live, expired } = await arrange();
    const results = await Promise.allSettled([takeDown(liker), sweepExpiredPhrases({ batch: 7 })]);
    for (const [i, r] of results.entries()) {
      if (r.status === "rejected") failures.push(`round ${round}, ${i === 0 ? "takeDownLive" : "sweepExpiredPhrases"}: ${code(r.reason)} ${String(r.reason).slice(0, 160)}`);
    }
    if (failures.length > 0) break;
    // The counts: every like of the liker gone, and each live phrase and its
    // author one like lighter. likes_given is history, not the live likes: the
    // sweep takes an expired phrase's likes by cascade and leaves the counter
    // (only a take-back and a take-down lower it) — so every live like came
    // off it, and the expired ones the sweep reached first did not.
    const [given] = await database.queryOrThrow<{ likes_given: number }>(
      `SELECT likes_given FROM identity_stats WHERE identity = $1`, [liker]);
    assert(given.likes_given >= 0 && given.likes_given <= AUTHORS - live.length,
      `round ${round}: likes_given ${given.likes_given} is outside 0..${AUTHORS - live.length}`);
    const [left] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM likes WHERE liker_identity = $1`, [liker]);
    assertEquals(left.n, 0, `round ${round}: likes of the liker survived`);
    const counts = await database.queryOrThrow<{ like_count: number; likes_received: number }>(
      `SELECT f.like_count, s.likes_received FROM feed_messages f JOIN identity_stats s ON s.identity = f.author_identity
        WHERE f.id = ANY($1::uuid[])`, [live]);
    assertEquals(counts.length, live.length, `round ${round}: a live phrase went missing`);
    assert(counts.every((c) => c.like_count === 0 && c.likes_received === 0), `round ${round}: a live phrase or its author kept the like`);
    // The expired ones are the sweep's, and it took them.
    await sweepExpiredPhrases({ batch: 7 });
    const [stale] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM feed_messages WHERE id = ANY($1::uuid[])`, [expired]);
    assertEquals(stale.n, 0, `round ${round}: expired phrases outlived the sweep`);
  }
  assertEquals(failures, [], "the two met the other way round");
  // Two hundred at a time: one DELETE over a thousand identities fires thirteen
  // foreign-key checks per row and outlives statement_timeout under load (B23).
  for (;;) {
    const [gone] = await database.queryOrThrow<{ n: string }>(
      `WITH doomed AS (SELECT id FROM identities WHERE name = 'take-down-stress' LIMIT 200),
            gone AS (DELETE FROM identities WHERE id IN (SELECT id FROM doomed) RETURNING 1)
       SELECT count(*)::text AS n FROM gone`,
    );
    if (Number(gone.n) < 200) break;
  }
});

addEventListener("unload", () => {
  database.closePool();
});
