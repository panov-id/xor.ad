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

import { queryOrThrow, savepoint, transaction } from "./db.ts";
import { log } from "./log.ts";
import { inc } from "./metrics.ts";
import { Freezes, freezeSession } from "./sessions.ts";
import { leaveTable } from "./tables.ts";

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

// What the minute's job did, by outcome (review panel 4, К5, B74,
// 2026-09-26): a freeze or a take-down it finished, one it put off to the next
// minute, and a person the paper code raised before it came. The put-off ones
// were a warn line and nothing else, so a take-down kept waiting for hours on
// a lock looked like a quiet job; TakeDownPinLimitDeferred reads them. Each at
// zero from the start: an alert reads the series, and one born at 1 hides its
// first event from increase() (B42). "failed" is one person's pass that met
// something other than a lock and was logged and passed over (B93).
for (const result of ["frozen", "freeze_deferred", "taken", "deferred", "raised", "failed"]) {
  inc("relay_take_down_pin_limit_total", { result }, 0);
}

// The code a deferral is logged with: the database's, or the race's own name.
const codeOf = (error: unknown) =>
  error instanceof TakeDownRetry ? "take_down_retry" : (error as { code?: string })?.code ?? "unknown";

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
//
// And the same for what the take-down waits on: its own two-second lock
// timeout on the counters (55P03), the statement timeout (57014), a deadlock
// against a consent to a match that takes the counters first and the session
// after (40P01). Each of them let out took the tenth miss back whole, attempt
// and lock and freeze, and the PIN could be tried again as often as the lock
// could be made to time out (review panel 4, B70). None of the three is tried
// again: a timeout would wait on the same row for as long, and a deadlock
// would meet the same cycle — rolled back to its own savepoint, the take-down
// lets go of the counters but not of the session, which the freeze before it
// holds, so a second try made the consent the victim, and the consent has no
// retry and answers 503 (review panel 5, D2; quorum 3:0, B88). The minute's
// job finishes it. Only a race — TakeDownRetry, a like on a new author — is
// tried again: that one is gone by the next try.
//
// On lib/db.ts savepoint(): a raw SAVEPOINT holds a JavaScript throw, but not
// a failed statement — postgres.js rejects the whole transaction once one
// failed, rolled back to the savepoint or not (B69).
export async function takeDownLiveInPlace(run: Run, me: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await savepoint(run, (inner) => takeDownLive(inner, me));
      return true;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (error instanceof TakeDownRetry) continue;
      if (code === "55P03" || code === "57014" || code === "40P01") return false;
      throw error;
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
// (lib/scheduled.ts, take_down_pin_limit). An identity raised by the paper
// code before this ran has a live session again and is not taken: what is
// live stays with the person who has a way in again.
export async function takeDownLeftByPinLimit(): Promise<number> {
  // First the freezes the tenth miss could not write (pin_attempts.ts, B59):
  // a share locked by the PIN limit under a session still live. The share
  // first, then the session — the order every path takes them — and the lock
  // asked again under it: the paper code may have lifted it meanwhile.
  const unfrozen = await queryOrThrow<{ id: string }>(
    `SELECT s.id FROM sessions s JOIN vault_shares v ON v.session = s.id
      WHERE v.locked_at IS NOT NULL AND s.frozen_at IS NULL
      ORDER BY s.id LIMIT 100`,
  );
  for (const { id } of unfrozen) {
    const freezes = new Freezes();
    try {
      const froze = await transaction(async (run) => {
        // Two seconds for any lock, as the route's freeze has (B81): without it
        // a held session row kept this pass and a pooled connection waiting for
        // the whole statement timeout, fifteen seconds a person (panel 5, H6; B89).
        await run(`SET LOCAL lock_timeout = '2s'`);
        const [share] = await run<{ locked: boolean }>(
          `SELECT locked_at IS NOT NULL AS locked FROM vault_shares WHERE session = $1 FOR UPDATE`, [id]);
        return share?.locked ? await freezeSession(run, id, "pin_limit", freezes) : false;
      }).then(freezes.count);
      if (froze) inc("relay_take_down_pin_limit_total", { result: "frozen" });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "55P03" && code !== "57014" && code !== "40P01") {
        // Anything else is this one person's, and the rest of the list is not
        // held back by it: logged, counted, tried again next minute (panel 5,
        // H11; B93). It used to end the whole pass, and the job's attempts with it.
        inc("relay_take_down_pin_limit_total", { result: "failed" });
        log("error", "a freeze left by the PIN limit failed; the next minute tries again", { session: id, error: String(error) });
        continue;
      }
      inc("relay_take_down_pin_limit_total", { result: "freeze_deferred" });
      log("warn", "a freeze left by the PIN limit waits for the next minute", { session: id, code });
    }
  }

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
                      WHERE p.identity = i.id AND m.chat_id IS NULL AND m.expires_at > now())
          -- And what the tables and the chats' games hold (GC1b): without these
          -- a person with only a game or a seat live was never picked.
          OR EXISTS (SELECT 1 FROM chat_participants p JOIN chat_games g ON g.chat_id = p.chat_id
                      WHERE p.identity = i.id)
          OR EXISTS (SELECT 1 FROM table_seats ts WHERE ts.identity = i.id AND ts.left_at IS NULL)
          OR EXISTS (SELECT 1 FROM table_lines tl WHERE tl.author_identity = i.id AND tl.visible_at IS NULL))
      ORDER BY i.id LIMIT 100`,
  );
  let done = 0;
  for (const { id } of left) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const taken = await transaction(async (run) => {
          // Two seconds for the shares as well: a claim or a close holding one
          // kept this pass on it for the statement timeout (the observer on
          // B73; B89). takeDownLive sets its own for the counters after.
          await run(`SET LOCAL lock_timeout = '2s'`);
          // Asked again under the shares (review panel 4, К11, B73): the list
          // above was read without a lock, and a paper-code claim that raised
          // a session since then — or is raising one now — gives the person a
          // way in again, and what is live stays theirs. The shares first, in
          // session order, as everything that seats or raises a session takes
          // them (identity.lock.order, chat_RU.md:1127); a claim in flight
          // holds one, so this waits for it and then sees its session.
          await run(
            `SELECT v.session FROM vault_shares v JOIN sessions s ON s.id = v.session
              WHERE s.identity = $1 ORDER BY v.session FOR UPDATE OF v`, [id]);
          const [raised] = await run<{ n: number }>(
            `SELECT count(*)::int AS n FROM sessions WHERE identity = $1 AND frozen_at IS NULL`, [id]);
          if (raised.n > 0) return false;
          await takeDownLive(run, id);
          return true;
        });
        if (taken) done++;
        inc("relay_take_down_pin_limit_total", { result: taken ? "taken" : "raised" });
        break;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        // A lock that timed out is not waited on again this minute, and one
        // identity's lock does not take the rest of the pass with it (B70).
        const timedOut = code === "55P03" || code === "57014";
        const again = error instanceof TakeDownRetry || code === "40P01";
        if (!again && !timedOut) {
          // One person's error is theirs alone (B93, as in the first pass).
          inc("relay_take_down_pin_limit_total", { result: "failed" });
          log("error", "a take-down left by the PIN limit failed; the next minute tries again", { identity: id, error: String(error) });
          break;
        }
        if (timedOut || attempt === 2) {
          inc("relay_take_down_pin_limit_total", { result: "deferred" });
          log("warn", "a take-down left by the PIN limit waits for the next minute", { identity: id, code: codeOf(error) });
          break;
        }
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

  // The games of one's chats (chat spec §8.2 «отошёл», :1301; GC1b): the chat
  // outlives a step away, its game does not, and nobody but its two sides can
  // play it. Their rooms learn the board is gone. Then the table: one's lines
  // still waiting for the queue, and one's seat (§6.1, leave_table).
  const games = await run<{ chat_id: string }>(
    `DELETE FROM chat_games WHERE chat_id IN (SELECT chat_id FROM chat_participants WHERE identity = $1)
     RETURNING chat_id`,
    [me],
  );
  for (const { chat_id } of games) await run(`SELECT pg_notify('chat_game', $1)`, [`${chat_id}|board`]);
  await run(`DELETE FROM table_lines WHERE author_identity = $1 AND visible_at IS NULL`, [me]);
  await leaveTable(run, me);
}

// The other half of the same line. A like or a phrase checks the identity in
// the guard, before its transaction, and then waits on the counters row a
// close or a time away holds (takeDownLive locks it first). When the wait ends
// the close has committed, and the request must see it: asked again here,
// after the lock, under READ COMMITTED it does (verifier, 2026-09-24 — a like
// that passed the guard landed on a closed identity). null means go on.
//
// And the session itself, as the guard asks it (B75): not frozen, and its
// share not locked by the tenth PIN miss (review panel 6, B108). The tenth
// miss holds the same counters row while it locks the share and takes down
// what is live; a phrase, a profile edit, a time away or a block that waited
// on it wrote, after its commit, in the name of a session whose entry was just
// closed — a profile change for good. `closed` covers it: the request is not
// signed by a live session, and the answer is the guard's 401.
export async function stillHere(
  run: Run,
  me: string,
  sessionId: string,
): Promise<{ closed: boolean; awayUntil: Date | null } | null> {
  const [row] = await run<{ closed: boolean; away_until: Date | null }>(
    `SELECT i.closed_at IS NOT NULL
              OR NOT EXISTS (
                SELECT 1 FROM sessions s
                 WHERE s.id = $2 AND s.identity = i.id AND s.frozen_at IS NULL
                   AND NOT EXISTS (SELECT 1 FROM vault_shares v WHERE v.session = s.id AND v.locked_at IS NOT NULL))
              AS closed,
            CASE WHEN i.stepped_away_until > now() THEN i.stepped_away_until END AS away_until
       FROM identities i WHERE i.id = $1`,
    [me, sessionId],
  );
  if (!row) return { closed: true, awayUntil: null };
  if (row.closed || row.away_until) return { closed: row.closed, awayUntil: row.away_until };
  return null;
}

// For a route that wrote before the wait stillHere follows (a nonce, a block):
// thrown, so those writes go back with the transaction, and answered 401.
export class NoLongerLive extends Error {}
