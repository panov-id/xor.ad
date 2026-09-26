// takeDownLive (a time away, a close) against sweepExpiredPhrases, at once, on
// the same phrases and likes (B39).
//
// lib/take_down.ts takes the counters, then the live liked phrases, then
// deletes the likes and writes like_count, then deletes the person's own live
// phrases; the expiry sweep deletes expired phrases and their likes go by
// cascade. Two orders over the same rows are a deadlock waiting for its moment,
// and in one process the moment rarely comes, so the case makes many of them:
// one person who liked many phrases and wrote some, half of each already past
// their term and waiting for the sweep, both run together, round after round.
// Two pairs of locks meet: the liked phrases against the sweep, and the
// person's own phrases against the sweep (review panel H7, B54, 2026-09-26).
// Postgres answers a cycle with 40P01 and take_down's own lock_timeout with
// 55P03; either one is the failure this case exists for.

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
// The liker's own phrases, each liked by one of the authors; even ones past
// their term.
const OWN = 20;

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

async function phrase(author: string, past: boolean, minutesAgo = 1): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
       lat_published, lon_published, visible_at, expires_at, like_count)
     VALUES ($1, 'sosed', $2, 'стресс', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33,
             now() - interval '4 hours', now() + CASE WHEN $3 THEN $4::int * interval '-1 minute' ELSE interval '1 hour' END, 1)`,
    [id, author, past, minutesAgo],
  );
  return id;
}

type Arranged = { liker: string; authors: string[]; live: string[]; expired: string[]; ownLive: string[]; ownExpired: string[] };

// One liker, AUTHORS authors with a phrase each, every phrase liked by the
// liker; even ones already past their term, odd ones alive. And OWN phrases
// of the liker's, each liked by an author, even ones past their term — each
// expired a minute before the one written before it. The sweep takes expired
// phrases by feed_expiry (expires_at), a take-down takes one's phrases by
// feed_by_author (the order they were written in): so the two walk the
// liker's expired phrases in opposite orders, the worst case, which is what
// deleting them from the take-down would meet. With terms in the order of
// writing both walk one way, and that break never went red (B54).
async function arrange(): Promise<Arranged> {
  const liker = await person();
  const a: Arranged = { liker, authors: [], live: [], expired: [], ownLive: [], ownExpired: [] };
  for (let i = 0; i < AUTHORS; i++) {
    const author = await person();
    a.authors.push(author);
    const past = i % 2 === 0;
    const id = await phrase(author, past);
    await database.queryOrThrow(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [liker, id]);
    await database.queryOrThrow(`UPDATE identity_stats SET likes_received = 1 WHERE identity = $1`, [author]);
    (past ? a.expired : a.live).push(id);
  }
  for (let i = 0; i < OWN; i++) {
    const past = i % 2 === 0;
    const id = await phrase(liker, past, 1 + i);
    await database.queryOrThrow(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [a.authors[i], id]);
    await database.queryOrThrow(`UPDATE identity_stats SET likes_given = 1 WHERE identity = $1`, [a.authors[i]]);
    (past ? a.ownExpired : a.ownLive).push(id);
  }
  await database.queryOrThrow(`UPDATE identity_stats SET likes_given = $2, likes_received = $3 WHERE identity = $1`, [liker, AUTHORS, OWN]);
  return a;
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
    const { liker, authors, live, expired, ownLive, ownExpired } = await arrange();
    const results = await Promise.allSettled([takeDown(liker), sweepExpiredPhrases({ batch: 7 })]);
    for (const [i, r] of results.entries()) {
      if (r.status === "rejected") failures.push(`round ${round}, ${i === 0 ? "takeDownLive" : "sweepExpiredPhrases"}: ${code(r.reason)} ${String(r.reason).slice(0, 160)}`);
    }
    if (failures.length > 0) break;
    // The counts. takeDownLive takes back the likes on live phrases only and
    // lowers likes_given by exactly what its DELETE removed; a like on an
    // expired phrase is the sweep's, which takes it by cascade and leaves the
    // counter, as it always does. So whichever of the two came first, the
    // liker's likes_given is the expired ones, exactly.
    const [given] = await database.queryOrThrow<{ likes_given: number }>(
      `SELECT likes_given FROM identity_stats WHERE identity = $1`, [liker]);
    assertEquals(given.likes_given, expired.length, `round ${round}: the liker's likes_given`);
    // The liker's own live phrases went with the take-down, before any sweep
    // below; the likes on them by cascade, and the fans' likes_given kept.
    const [ownGone] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM feed_messages WHERE id = ANY($1::uuid[])`, [ownLive]);
    assertEquals(ownGone.n, 0, `round ${round}: the liker's own live phrases outlived the take-down`);
    const fans = await database.queryOrThrow<{ likes_given: number }>(
      `SELECT likes_given FROM identity_stats WHERE identity = ANY($1::uuid[])`, [authors.slice(0, OWN)]);
    assert(fans.every((f) => f.likes_given === 1), `round ${round}: a fan's likes_given moved with the liker's phrase`);
    const [left] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM likes WHERE liker_identity = $1`, [liker]);
    assertEquals(left.n, 0, `round ${round}: likes of the liker survived`);
    const counts = await database.queryOrThrow<{ like_count: number; likes_received: number }>(
      `SELECT f.like_count, s.likes_received FROM feed_messages f JOIN identity_stats s ON s.identity = f.author_identity
        WHERE f.id = ANY($1::uuid[])`, [live]);
    assertEquals(counts.length, live.length, `round ${round}: a live phrase went missing`);
    assert(counts.every((c) => c.like_count === 0 && c.likes_received === 0), `round ${round}: a live phrase or its author kept the like`);
    // The expired ones, liked and own, are the sweep's, and it took them with
    // their likes.
    await sweepExpiredPhrases({ batch: 7 });
    const [stale] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM feed_messages WHERE id = ANY($1::uuid[])`, [[...expired, ...ownExpired]]);
    assertEquals(stale.n, 0, `round ${round}: expired phrases outlived the sweep`);
    const [onOwn] = await database.queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM likes WHERE feed_message_id = ANY($1::uuid[])`, [[...ownLive, ...ownExpired]]);
    assertEquals(onOwn.n, 0, `round ${round}: likes on the liker's own phrases survived them`);
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
