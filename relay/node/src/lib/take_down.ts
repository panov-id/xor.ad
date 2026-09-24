// What a person takes down with them when they stop being there: a time away
// (routes/away.ts, chat spec §8.2) and closing the identity (routes/identity.ts,
// the same list, "exactly as the PIN-limit freeze does"). One list, written
// once: two copies of a rule is how one of them stops being kept.
//
// Inside the caller's transaction. It locks in the order the like and the
// take-back use (likes.ts), and throws TakeDownRetry when a like on a new
// author raced it; the caller starts the whole transaction again.

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

export class TakeDownRetry extends Error {}

export async function takeDownLive(run: Run, me: string): Promise<void> {
  // The counters of everyone whose phrase one liked, and one's own, locked
  // in one order — the order the like and the take-back use (likes.ts), or
  // the two deadlock on the same people. Then the liked phrases' rows, so
  // the expiry sweep (which holds a phrase and cascades into its likes)
  // cannot meet us the other way round.
  const guess = await run<{ author: string }>(
    `SELECT DISTINCT f.author_identity AS author
       FROM likes l JOIN feed_messages f ON f.id = l.feed_message_id
      WHERE l.liker_identity = $1 AND f.author_identity IS NOT NULL`,
    [me],
  );
  const lockedAuthors = new Set(guess.map((g) => g.author));
  await run(`SET LOCAL lock_timeout = '2s'`);
  await run(
    `SELECT 1 FROM identity_stats WHERE identity = ANY($1::uuid[]) ORDER BY identity FOR UPDATE`,
    [[me, ...lockedAuthors]],
  );
  await run(
    // Live ones only: an expired phrase the sweep has not taken yet is the
    // sweep's to lock, in its own order, and its likes go with it by cascade
    // — locking it here met the sweep the other way round (panel, data lens).
    `SELECT 1 FROM feed_messages
      WHERE id IN (SELECT feed_message_id FROM likes WHERE liker_identity = $1) AND expires_at > now()
      ORDER BY id FOR UPDATE`,
    [me],
  );

  // The likes one gave, taken back with their counts — counted from what the
  // DELETE itself removed, not from the list read before the locks: a like
  // or a take-back from one's other device between the two used to be
  // counted wrong for somebody else (review panel 23.09.2026, both lenses).
  const liked = await run<{ feed_message_id: string; author: string | null }>(
    `WITH gone AS (DELETE FROM likes WHERE liker_identity = $1 RETURNING feed_message_id)
     SELECT g.feed_message_id, f.author_identity AS author
       FROM gone g JOIN feed_messages f ON f.id = g.feed_message_id`,
    [me],
  );
  if (liked.some((l) => l.author !== null && !lockedAuthors.has(l.author))) {
    // A like on a new author landed between the guess and the lock: that
    // author's counter is not held. Start again rather than write it unheld.
    throw new TakeDownRetry();
  }
  if (liked.length > 0) {
    await run(
      `UPDATE feed_messages SET like_count = greatest(like_count - 1, 0) WHERE id = ANY($1::uuid[])`,
      [liked.map((l) => l.feed_message_id)],
    );
    const byAuthor = new Map<string, number>();
    for (const l of liked) if (l.author) byAuthor.set(l.author, (byAuthor.get(l.author) ?? 0) + 1);
    for (const [author, n] of byAuthor) {
      await run(
        `UPDATE identity_stats SET likes_received = greatest(likes_received - $2, 0), updated_at = now()
          WHERE identity = $1`,
        [author, n],
      );
    }
    await run(
      `UPDATE identity_stats SET likes_given = greatest(likes_given - $2, 0), updated_at = now()
        WHERE identity = $1`,
      [me, liked.length],
    );
  }

  // One's phrases, published or waiting for the queue; the likes on them go
  // with them by cascade.
  await run(`DELETE FROM feed_messages WHERE author_identity = $1`, [me]);

  // One's matches, put out as a phrase's expiry puts them out: the inbox and
  // the consent read `expires_at > now()`, and the sweeper takes the rest.
  // A match that already became a conversation is left: the conversation
  // lives by its own clocks.
  await run(
    // A second back: a consent that started before this transaction checks
    // `expires_at > now()` with its own, earlier now() (review panel).
    `UPDATE matches SET expires_at = least(expires_at, now() - interval '1 second')
      WHERE chat_id IS NULL AND id IN (SELECT match_id FROM match_participants WHERE identity = $1)`,
    [me],
  );
}
