// What a person takes down with them when they stop being there: a time away
// (routes/away.ts, chat spec §8.2), closing the identity (routes/identity.ts,
// the same list, "exactly as the PIN-limit freeze does") and the tenth PIN
// mistake itself (lib/pin_attempts.ts, chat_RU.md:1301 — "снимает живое, как
// отлучка"; it froze the session and left the rest until B51, 2026-09-26).
// One list, written once: two copies of a rule is how one of them stops being
// kept.
//
// Inside the caller's transaction. It locks in the order the like and the
// take-back use (likes.ts), and throws TakeDownRetry when a like on a new
// author raced it; the caller starts the whole transaction again.

import { queryOrThrow, transaction } from "./db.ts";
import { log } from "./log.ts";

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

export class TakeDownRetry extends Error {}

// For a caller whose transaction must commit whatever the take-down meets:
// the tenth PIN mistake has spent the attempt and frozen the session in it,
// and those two are the lock. The take-down alone goes back to a savepoint and
// runs again, three times as away.ts and identity.ts do; past that it gives up
// in place — only its own savepoint is rolled back — and answers false, and
// takeDownLeftByPinLimit below finishes it within the minute.
//
// It used to throw after the third retry, and the whole transaction of the
// tenth miss rolled back with it: the attempt uncounted, the session not
// frozen. Whoever guesses the PIN holds the tab, and a like on a new author
// from that same identity is what raises TakeDownRetry — so they could keep
// the take-down failing and get a tenth attempt without the lock, again and
// again (coordinator, after the observer's reading, B51, 2026-09-26).
export async function takeDownLiveInPlace(run: Run, me: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await run(`SAVEPOINT take_down`);
    try {
      await takeDownLive(run, me);
      await run(`RELEASE SAVEPOINT take_down`);
      return true;
    } catch (error) {
      if (!(error instanceof TakeDownRetry)) throw error;
      await run(`ROLLBACK TO SAVEPOINT take_down`);
    }
  }
  return false;
}

// What the tenth PIN mistake froze and could not take down in place: an
// identity whose sessions are all frozen, one of them by the PIN limit, and
// that still has something live under its name — a phrase, waiting ones too,
// a like on a live phrase, a match that did not become a chat. Each in its own
// transaction, started again on TakeDownRetry or a deadlock as away.ts does;
// one that keeps failing waits for the next minute. Runs every minute
// (lib/scheduled.ts, take_down_pin_limit).
export async function takeDownLeftByPinLimit(): Promise<number> {
  const left = await queryOrThrow<{ id: string }>(
    `SELECT i.id FROM identities i
      WHERE i.closed_at IS NULL
        AND EXISTS (SELECT 1 FROM sessions s WHERE s.identity = i.id AND s.frozen_reason = 'pin_limit')
        AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.identity = i.id AND s.frozen_at IS NULL)
        AND (EXISTS (SELECT 1 FROM feed_messages f
                      WHERE f.author_identity = i.id AND (f.visible_at IS NULL OR f.expires_at > now()))
          OR EXISTS (SELECT 1 FROM likes l JOIN feed_messages f ON f.id = l.feed_message_id
                      WHERE l.liker_identity = i.id AND f.expires_at > now())
          OR EXISTS (SELECT 1 FROM match_participants p JOIN matches m ON m.id = p.match_id
                      WHERE p.identity = i.id AND m.chat_id IS NULL AND m.expires_at > now()))
      ORDER BY i.id LIMIT 100`,
  );
  let done = 0;
  for (const { id } of left) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await transaction((run) => takeDownLive(run, id));
        done++;
        break;
      } catch (error) {
        const again = error instanceof TakeDownRetry || (error as { code?: string })?.code === "40P01";
        if (!again) throw error;
        if (attempt === 2) log("warn", "a take-down left by the PIN limit waits for the next minute", { identity: id });
      }
    }
  }
  return done;
}

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
  const held = (await run<{ id: string }>(
    // Live ones only: an expired phrase the sweep has not taken yet is the
    // sweep's to lock, in its own order, and its likes go with it by cascade
    // — locking it here met the sweep the other way round (panel, data lens).
    `SELECT id FROM feed_messages
      WHERE id IN (SELECT feed_message_id FROM likes WHERE liker_identity = $1) AND expires_at > now()
      ORDER BY id FOR UPDATE`,
    [me],
  )).map((r) => r.id);

  // The likes one gave, taken back with their counts — counted from what the
  // DELETE itself removed, not from the list read before the locks: a like
  // or a take-back from one's other device between the two used to be
  // counted wrong for somebody else (review panel 23.09.2026, both lenses).
  //
  // And only the likes on the phrases held above, for the reason written
  // there, which the lock alone did not keep: deleting every like of one's
  // took the likes on expired phrases too, and writing their like_count took
  // those phrases' rows — after their likes, while the sweep takes a phrase's
  // row and then its likes by cascade. The two met the other way round: 40P01
  // in five runs of five under load (relay/node/test/take_down_stress.test.ts,
  // B39, 2026-09-26). The likes on an expired phrase go with it at the sweep's
  // next minute; likes_given does not count them back, as it never does for a
  // like the sweep takes.
  const liked = await run<{ feed_message_id: string; author: string | null }>(
    `WITH gone AS (DELETE FROM likes WHERE liker_identity = $1 AND feed_message_id = ANY($2::uuid[])
                   RETURNING feed_message_id)
     SELECT g.feed_message_id, f.author_identity AS author
       FROM gone g JOIN feed_messages f ON f.id = g.feed_message_id`,
    [me, held],
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
  // with them by cascade. Live and waiting ones only, for the same reason: an
  // expired one is the sweep's, which deletes it within the minute (chat spec
  // §8.2 takes down what is live — "фразы, и ждущие проверки тоже").
  await run(
    `DELETE FROM feed_messages WHERE author_identity = $1 AND (visible_at IS NULL OR expires_at > now())`,
    [me],
  );

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

// The other half of the same line. A like or a phrase checks the identity in
// the guard, before its transaction, and then waits on the counters row a
// close or a time away holds (takeDownLive locks it first). When the wait ends
// the close has committed, and the request must see it: asked again here,
// after the lock, under READ COMMITTED it does (verifier, 2026-09-24 — a like
// that passed the guard landed on a closed identity). null means go on.
export async function stillHere(run: Run, me: string): Promise<{ closed: boolean; awayUntil: Date | null } | null> {
  const [row] = await run<{ closed: boolean; away_until: Date | null }>(
    `SELECT closed_at IS NOT NULL AS closed,
            CASE WHEN stepped_away_until > now() THEN stepped_away_until END AS away_until
       FROM identities WHERE id = $1`,
    [me],
  );
  if (!row) return { closed: true, awayUntil: null };
  if (row.closed || row.away_until) return { closed: row.closed, awayUntil: row.away_until };
  return null;
}
