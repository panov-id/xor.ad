// The second pair of locks between a take-down and the expiry sweep: one's
// own phrases (review panel H7, B54, 2026-09-26). lib/take_down.ts deletes
// one's live and waiting phrases and leaves the expired ones to the sweep
// (chat spec §8.2, cbda02a). Deleting them too puts the take-down on rows the
// sweep holds mid-batch, in its own order (feed_by_author) against the
// sweep's (feed_expiry) — the edge the deadlock needs.
//
// take_down_stress.test.ts runs the two together and never went red on that
// break: ten runs, no cycle (B54), because the sweep skips what is locked and
// the moment is rare. So this case does not wait for the moment, it makes the
// edge itself: one connection holds an expired phrase of the person's the way
// a sweep batch does, and the take-down must finish without waiting on it.
// Then the take-down alone, and the expired phrase must still be there.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error(
    "DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh",
  );
}

const database = await import("../src/lib/db.ts");
const { takeDownLive } = await import("../src/lib/take_down.ts");
const { sweepExpiredPhrases } = await import("../src/lib/feed_verdict.ts");

await database.queryOrThrow("SELECT 1");

// The pool keeps its connections between cases, and a second one is opened
// for the holder: the same leak every database suite here lets through.
const pooled = { sanitizeOps: false, sanitizeResources: false };

async function person(): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, name, age, identity_public_key, signup_completed_at)
     VALUES ($1, 'take-down-own-expired', 30, 'not-a-real-key', now())`,
    [id],
  );
  await database.queryOrThrow(`INSERT INTO identity_stats (identity) VALUES ($1)`, [id]);
  return id;
}

async function phrase(author: string, past: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
       lat_published, lon_published, visible_at, expires_at, like_count)
     VALUES ($1, 'sosed', $2, 'своя', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33,
             now() - interval '4 hours', now() + CASE WHEN $3 THEN interval '-1 minute' ELSE interval '1 hour' END, 1)`,
    [id, author, past],
  );
  return id;
}

// A person with one live and one expired phrase of their own, each liked by a fan.
async function arrange(): Promise<{ me: string; fan: string; live: string; expired: string }> {
  const me = await person();
  const fan = await person();
  const live = await phrase(me, false);
  const expired = await phrase(me, true);
  for (const id of [live, expired]) {
    await database.queryOrThrow(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [fan, id]);
  }
  await database.queryOrThrow(`UPDATE identity_stats SET likes_given = 2 WHERE identity = $1`, [fan]);
  await database.queryOrThrow(`UPDATE identity_stats SET likes_received = 2 WHERE identity = $1`, [me]);
  return { me, fan, live, expired };
}

const exists = async (id: string) =>
  (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id])).length === 1;

Deno.test({ name: "a take-down does not wait on one's expired phrase a sweep batch holds (B54)", ...pooled }, async () => {
  const { me, live, expired } = await arrange();
  // The sweep's batch, stood still: its row lock on the expired phrase, held
  // until the take-down has had its go.
  let release!: () => void;
  const released = new Promise<void>((resolve) => release = resolve);
  let holding!: () => void;
  const held = new Promise<void>((resolve) => holding = resolve);
  const holder = database.transaction(async (run) => {
    await run(`SELECT 1 FROM feed_messages WHERE id = $1 FOR UPDATE`, [expired]);
    holding();
    await released;
  });
  await held;
  let failure: unknown = null;
  const started = Date.now();
  try {
    await database.transaction((run) => takeDownLive(run, me));
  } catch (error) {
    failure = error;
  } finally {
    release();
    await holder;
  }
  const code = (failure as { code?: string })?.code;
  assertEquals(failure, null,
    `the take-down waited on an expired phrase of one's own that the sweep holds and gave up (${code ?? failure}): it deletes one's phrases with the expired ones again, the second pair of locks against the sweep (B54)`);
  assert(Date.now() - started < 1500, `the take-down took ${Date.now() - started} ms under a held expired phrase: it waited on it`);
  assertEquals(await exists(live), false, "one's live phrase outlived the take-down");
});

Deno.test({ name: "a take-down leaves one's expired phrases and their likes to the sweep (B54)", ...pooled }, async () => {
  const { me, fan, live, expired } = await arrange();
  await database.transaction((run) => takeDownLive(run, me));
  assertEquals(await exists(live), false, "one's live phrase outlived the take-down");
  assertEquals(await exists(expired), true,
    "the take-down deleted an expired phrase of one's own: that row is the sweep's, taken in its own order (B54, chat spec §8.2)");
  const [likes] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM likes WHERE feed_message_id = $1`, [expired]);
  assertEquals(likes.n, 1, "the like on one's expired phrase went with the take-down, not with the sweep");
  // And the sweep takes it, with its like, at its next pass.
  await sweepExpiredPhrases();
  assertEquals(await exists(expired), false, "the sweep left one's expired phrase after the take-down");
  const [given] = await database.queryOrThrow<{ likes_given: number }>(
    `SELECT likes_given FROM identity_stats WHERE identity = $1`, [fan]);
  assertEquals(given.likes_given, 2, "a fan's likes_given moved with the author's phrases");
});

addEventListener("unload", () => {
  database.closePool();
});
