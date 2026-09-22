// What a verdict does, in one transaction, and why it is one.
//
// A phrase is read before it is published (§8.3). When the reading is done,
// two things have to happen together: the row becomes visible or stops
// existing, and the moment goes into the author's counters. Apart, they are a
// hole — a send arriving between them sees the queue already empty and the
// moment not yet written, and slips past "four an hour" (review panel
// 2026-09-14). So both verdicts start by taking the same `identity_stats` row
// `FOR UPDATE` that a send takes, and finish in the same transaction.
//
// **There is no moderator here yet, and this file does not pretend otherwise.**
// The model is chosen — translate, then classify, by the measurement of §8.14 —
// and it is not wired. Until it is, nothing calls `publish()` on its own: the
// queue is worked by hand or by a caller that knows what it is doing, and what
// runs unattended is the sweeper below, which deletes a row that waited past
// `moderation.queue.wait` rather than letting it through unread. Publishing
// what nobody has read would be the one thing §8.3 forbids by name, and it
// would be indistinguishable, from outside, from a moderator that works.

import { queryOrThrow, transaction } from "./db.ts";
import { inc } from "./metrics.ts";
import { log } from "./log.ts";

// docs/facts/limits.tsv, by name.
export const PHRASE_SPAN = "4 hours 20 minutes"; // feed.phrase.span
export const QUEUE_WAIT_MINUTES = 10; // moderation.queue.wait
// The arrays are cut to their last moments on write; the lengths are §8.3's.
const KEEP_PUBLISHED = 4;
const KEEP_REFUSED = 6;

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

// Appends `now()` to one of the moment arrays, dropping what has fallen out of
// the hour and keeping only the last few.
//
// The trimming lives in the expression rather than in a CHECK on purpose: a
// constraint would make the verdict write fail, and a verdict that cannot be
// written is worse than an array one element too long (§8.3).
async function rememberMoment(
  run: Run,
  identityId: string,
  column: "published_at_recent" | "rejected_at_recent",
  keep: number,
): Promise<void> {
  await run(
    `UPDATE identity_stats
        SET ${column} = (
              SELECT (x)[greatest(1, cardinality(x) - ${keep - 1}):]
                FROM (
                  SELECT ARRAY(
                    SELECT t FROM unnest(${column}) t
                     WHERE t > now() - interval '1 hour' ORDER BY t
                  ) || now() AS x
                ) s
            ),
            updated_at = now()
      WHERE identity = $1`,
    [identityId],
  );
}

export interface Verdict {
  applied: boolean;
  identityId: string | null;
  // The name is no longer the one the moderator saw; nothing was written.
  nameChanged?: boolean;
  // The name stands refused; the phrase waits for a new one.
  nameRejected?: boolean;
}

// Passed. The row becomes visible and gets its term in the same UPDATE — they
// were a single NOT NULL column derived from each other once, which cannot both
// be true at insert time (§8.3, and db/025 for the experiment).
// `scope` is what the caller may decide: a brand for a tenant's moderator,
// null for the platform. It is checked inside the transaction, on the locked
// row, as the DSA verdict does — a fence checked before the lock is a fence
// checked against a row that may have changed (security lens, 2026-09-22).
//
// `nameSeen` is the name the moderator read beside the phrase. The verdict
// accepts the name only if it is still that string: a name changed between
// the read and the click would otherwise be accepted unread (same lens).
export interface VerdictScope {
  brand?: string | null;
  nameSeen?: string;
}

export async function publishPhrase(id: string, scope: VerdictScope = {}): Promise<Verdict> {
  return await transaction<Verdict>(async (run) => {
    const [row] = await run<{ author_identity: string | null }>(
      `SELECT author_identity FROM feed_messages
        WHERE id = $1 AND visible_at IS NULL AND ($2::text IS NULL OR brand = $2)
        FOR UPDATE`,
      [id, scope.brand ?? null],
    );
    // Already decided, already swept, or never existed: a verdict arriving
    // twice must not publish twice or write a second moment.
    if (!row) return { applied: false, identityId: null };
    if (row.author_identity) {
      await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [row.author_identity]);
      // The identity row too: the name is read and written under this lock.
      const [who] = await run<{ name: string; name_pending: string | null; name_state: string }>(
        `SELECT name, name_pending, name_state FROM identities WHERE id = $1 FOR UPDATE`,
        [row.author_identity],
      );
      const goesOut = who?.name_pending ?? who?.name;
      if (scope.nameSeen !== undefined && who && goesOut !== scope.nameSeen) {
        return { applied: false, identityId: row.author_identity, nameChanged: true };
      }
      // Both must be accepted (§8.2, 2026-08-26): a phrase whose name was
      // refused waits for a new name, and does not go out with the old one.
      if (who?.name_state === "rejected") {
        return { applied: false, identityId: row.author_identity, nameRejected: true };
      }
    }
    await run(
      `UPDATE feed_messages
          SET visible_at = now(), expires_at = now() + interval '${PHRASE_SPAN}'
        WHERE id = $1 AND visible_at IS NULL`,
      [id],
    );
    if (row.author_identity) {
      // The name goes out with the phrase, so the same verdict covers both
      // (§8.2: the name passes the queue at first publication and at every
      // change; owner's decision of 2026-09-22 — one Publish, not two). A name
      // waiting in name_pending becomes the name; a rejected one is accepted
      // again, since the moderator has just read it beside the phrase.
      // Only a name that was waiting: a rejected one has no name_pending and
      // would come back as it was, which is not what "accepted" means.
      await run(
        `UPDATE identities
            SET name = name_pending, name_pending = NULL, name_state = 'accepted'
          WHERE id = $1 AND name_state = 'pending'`,
        [row.author_identity],
      );
      await rememberMoment(run, row.author_identity, "published_at_recent", KEEP_PUBLISHED);
      // The first accepted publication, as a UTC date. It serves one rule only
      // — "the reporter has been publishing for a while" (offers spec §10.1) —
      // and is written once, which is what the IS NULL is for.
      await run(
        `UPDATE identity_stats
            SET first_published_at = (now() AT TIME ZONE 'UTC')::date
          WHERE identity = $1 AND first_published_at IS NULL`,
        [row.author_identity],
      );
    }
    inc("relay_feed_verdict_total", { verdict: "published" });
    return { applied: true, identityId: row.author_identity };
  });
}

// Refused. The row is deleted rather than marked: a refused phrase is not a
// phrase with a flag, and leaving it would hold the author's single waiting
// slot for ever. The moment is what the refusal leaves behind, and it is what
// the pause of §8.3 counts.
export async function refusePhrase(id: string, scope: VerdictScope = {}): Promise<Verdict> {
  return await transaction<Verdict>(async (run) => {
    const [row] = await run<{ author_identity: string | null }>(
      `SELECT author_identity FROM feed_messages
        WHERE id = $1 AND visible_at IS NULL AND ($2::text IS NULL OR brand = $2)
        FOR UPDATE`,
      [id, scope.brand ?? null],
    );
    if (!row) return { applied: false, identityId: null };
    if (row.author_identity) {
      await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [row.author_identity]);
    }
    await run(`DELETE FROM feed_messages WHERE id = $1 AND visible_at IS NULL`, [id]);
    if (row.author_identity) {
      await rememberMoment(run, row.author_identity, "rejected_at_recent", KEEP_REFUSED);
    }
    inc("relay_feed_verdict_total", { verdict: "refused" });
    return { applied: true, identityId: row.author_identity };
  });
}

// The name is refused, not the phrase (§8.2): name_state becomes rejected, a
// pending name is dropped, and the phrase stays in the queue — it waits for a
// new name and goes out with it (2026-08-26). Nothing is deleted and no moment
// is written: the pause of §8.3 counts refused phrases, and this is not one.
// The queue shows the phrase with "name rejected" until the author sends
// another name, which makes it pending again. Applies once: a name already
// rejected, or not the one the moderator saw, answers as not applied.
export async function refuseName(id: string, scope: VerdictScope = {}): Promise<Verdict> {
  return await transaction<Verdict>(async (run) => {
    const [row] = await run<{ author_identity: string | null }>(
      `SELECT author_identity FROM feed_messages
        WHERE id = $1 AND visible_at IS NULL AND ($2::text IS NULL OR brand = $2)
        FOR UPDATE`,
      [id, scope.brand ?? null],
    );
    if (!row || !row.author_identity) return { applied: false, identityId: null };
    await run(`SELECT 1 FROM identity_stats WHERE identity = $1 FOR UPDATE`, [row.author_identity]);
    const [who] = await run<{ name: string; name_pending: string | null; name_state: string }>(
      `SELECT name, name_pending, name_state FROM identities WHERE id = $1 FOR UPDATE`,
      [row.author_identity],
    );
    if (!who || who.name_state === "rejected") return { applied: false, identityId: row.author_identity };
    const goesOut = who.name_pending ?? who.name;
    if (scope.nameSeen !== undefined && goesOut !== scope.nameSeen) {
      return { applied: false, identityId: row.author_identity, nameChanged: true };
    }
    await run(
      `UPDATE identities SET name_state = 'rejected', name_pending = NULL WHERE id = $1`,
      [row.author_identity],
    );
    inc("relay_feed_verdict_total", { verdict: "name_refused" });
    return { applied: true, identityId: row.author_identity };
  });
}

// A phrase that waited past `moderation.queue.wait` is deleted, and **no moment
// is written** — neither a publication nor a refusal happened. §8.3 says it in
// one line: "a row whose checking wait expired is deleted and not counted as
// queued". Which means the author's slot frees and their pause does not grow
// because the node was slow.
//
// This is the only part of the verdict that runs unattended, and that is the
// honest shape while there is no moderator: a phrase nobody read does not
// become visible by default, it goes away, and the number below says how often
// that happens.
export async function sweepStaleQueue(): Promise<number> {
  const rows = await queryOrThrow<{ count: string }>(
    `WITH gone AS (
       DELETE FROM feed_messages f
        WHERE f.visible_at IS NULL
          AND f.created_at < now() - interval '${QUEUE_WAIT_MINUTES} minutes'
          -- A phrase whose name was refused is not waiting on the node; it is
          -- waiting on its author, and stays until a new name comes (§8.2).
          AND NOT EXISTS (SELECT 1 FROM identities a
                           WHERE a.id = f.author_identity AND a.name_state = 'rejected')
        RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );
  const swept = Number(rows[0]?.count ?? 0);
  if (swept > 0) {
    // Worth a line every time, not only when it is large: while no moderator is
    // wired this number is the whole rate of the feed, and somebody reading the
    // logs should see that phrases are being dropped rather than published.
    log("warn", "phrases dropped after waiting for a verdict", {
      swept,
      waited_minutes: QUEUE_WAIT_MINUTES,
    });
    inc("relay_feed_verdict_total", { verdict: "expired_unread" }, swept);
  }
  return swept;
}

// Phrases whose term ran out. They stop being delivered the moment
// `expires_at` passes — the feed's query says so — but the row has to go too,
// and §8.10 says what "gone" means: the text is deleted, the likes follow by
// cascade, and what survives is a copy in other tables rather than the phrase.
//
// A separate sweeper from the queue's: that one is about a verdict that never
// came, this one about a life that ended. They have different periods and
// different meanings, and one job doing both would report one number for two
// unrelated facts.
export async function sweepExpiredPhrases(): Promise<number> {
  const rows = await queryOrThrow<{ count: string }>(
    `WITH gone AS (
       DELETE FROM feed_messages
        WHERE visible_at IS NOT NULL AND expires_at <= now()
        RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );
  const swept = Number(rows[0]?.count ?? 0);
  if (swept > 0) inc("relay_feed_verdict_total", { verdict: "expired" }, swept);
  return swept;
}
