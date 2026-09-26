// takeDownLive (lib/take_down.ts) against the race its TakeDownRetry exists
// for: a like on a new author lands between the guess of whose counters to
// lock and the lock itself. That author's counter is then not held, and the
// take-down must start again rather than write it unheld (B38, the quorum's
// pick of 26.09.2026 — no test had reached this path).
//
// The window is opened on cue, not hoped for: takeDownLive takes its query
// function from the caller, so the test hands it one that, right after the
// guess, lets a second connection put the like in and commit — the like the
// route (likes.ts) would have written, counters and all.

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const database = await import("../src/lib/db.ts");
const { takeDownLive, TakeDownRetry } = await import("../src/lib/take_down.ts");

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

async function person(): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO identities (id, identity_public_key, name, age) VALUES ($1, 'k', 'п', 30)`, [id]);
  await database.queryOrThrow(`INSERT INTO identity_stats (identity) VALUES ($1)`, [id]);
  return id;
}

async function phrase(author: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'xor', $2, 'фраза', 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now(), now() + interval '3 hours')`,
    [id, author],
  );
  return id;
}

// A like as likes.ts writes it: the row, the phrase's count, both counters.
async function like(sql: postgres.Sql, liker: string, phraseId: string, author: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [liker, phraseId]);
    await tx.unsafe(`UPDATE feed_messages SET like_count = like_count + 1 WHERE id = $1`, [phraseId]);
    await tx.unsafe(`UPDATE identity_stats SET likes_received = likes_received + 1 WHERE identity = $1`, [author]);
    await tx.unsafe(`UPDATE identity_stats SET likes_given = likes_given + 1 WHERE identity = $1`, [liker]);
  });
}

async function stats(id: string): Promise<{ given: number; received: number }> {
  const [row] = await database.queryOrThrow<{ likes_given: number; likes_received: number }>(
    `SELECT likes_given, likes_received FROM identity_stats WHERE identity = $1`, [id]);
  return { given: Number(row.likes_given), received: Number(row.likes_received) };
}

// Is this counters row held by somebody right now? Asked from a connection of
// its own, without waiting.
async function held(sql: postgres.Sql, id: string): Promise<boolean> {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE NOWAIT`, [id]);
    });
    return false;
  } catch (error) {
    if ((error as { code?: string }).code === "55P03") return true; // lock_not_available
    throw error;
  }
}

Deno.test({
  name: "a like on a new author between the guess and the lock makes the take-down start again, and the retry counts everyone",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1 });
    try {
      const me = await person();
      const oldAuthor = await person();
      const newAuthor = await person();
      const oldPhrase = await phrase(oldAuthor);
      const newPhrase = await phrase(newAuthor);
      await like(sql, me, oldPhrase, oldAuthor);

      // The first attempt, with the like on the new author put in right after
      // the guess, and the counters' locks looked at just before the likes go.
      let calls = 0;
      let newHeld: boolean | null = null;
      let oldHeld: boolean | null = null;
      const first = database.transaction((run: Run) =>
        takeDownLive(async <R>(text: string, args?: unknown[]) => {
          if (text.includes("DELETE FROM likes")) {
            newHeld = await held(sql, newAuthor);
            oldHeld = await held(sql, oldAuthor);
          }
          const rows = await run<R>(text, args);
          if (++calls === 1) await like(sql, me, newPhrase, newAuthor);
          return rows;
        }, me)
      );
      await assertRejects(() => first, TakeDownRetry, undefined,
        "a like on a new author raced the take-down and it went on with that author's counter unheld");
      assertEquals(oldHeld, true, "the guessed author's counter was not held");
      assertEquals(newHeld, false, "the race was not reached: the new author's counter was held anyway");
      // Rolled back: nothing of the first attempt stayed.
      assertEquals(await stats(me), { given: 2, received: 0 });
      assertEquals(await stats(newAuthor), { given: 0, received: 1 });

      // The caller's retry (routes/away.ts, routes/identity.ts start the whole
      // transaction again): now both authors are guessed and held.
      await database.transaction((run: Run) => takeDownLive(run, me));
      assertEquals(await stats(me), { given: 0, received: 0 }, "the leaver's own count of likes given");
      assertEquals(await stats(oldAuthor), { given: 0, received: 0 }, "the author guessed from the start");
      assertEquals(await stats(newAuthor), { given: 0, received: 0 }, "the author whose like raced the take-down");
      const [left] = await database.queryOrThrow<{ n: number }>(
        `SELECT count(*)::int AS n FROM likes WHERE liker_identity = $1`, [me]);
      assertEquals(left.n, 0, "likes of the leaver survived");
      const counts = await database.queryOrThrow<{ like_count: number }>(
        `SELECT like_count FROM feed_messages WHERE id = ANY($1::uuid[]) ORDER BY id`, [[oldPhrase, newPhrase]]);
      assert(counts.every((c) => Number(c.like_count) === 0), `phrase counts left behind: ${JSON.stringify(counts)}`);
    } finally {
      await sql.end();
    }
  },
});
