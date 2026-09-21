// The three deadlines an identity has, and the only thing that enforces them.
//
// Nothing about an identity expires by itself. The node cannot learn that a
// browser was cleared or a phone thrown away, so without this file a signup
// abandoned on the second screen, and a person who stopped coming two years ago,
// both keep their name, their age, their public key, the hash of their paper
// code and their log of acceptances for ever. The deadlines are in
// docs/facts/limits.tsv with `identity.sweeper` named as what enforces them, and
// until now that name pointed at nothing.
//
//   signup.unfinished.ttl      1 hour    the registration never reached the
//                                        paper code: §8.2 says such an identity
//                                        "passes no membership check at all",
//                                        and it is swept whole.
//   identity.inactive.retention 365 days  no session has been seen for a year:
//                                        the identity is closed, exactly the way
//                                        "start again" closes one.
//   identity.deletion.delay     30 days   after closing: the row goes, and the
//                                        cascades take the rest.
//
// Why closing and deleting are two steps and not one is decided in §8.2: the
// thirty days are not a change of mind — there is no way back, the recovery
// index does not even look at closed identities — they are for the paperwork. A
// notice under Article 16, or a statement of reasons, attached to an identity
// has to outlive the moment it is closed, or there is nothing left to answer it
// with.

import { queryOrThrow, transaction } from "./db.ts";
import { log } from "./log.ts";
import { inc, setGauge } from "./metrics.ts";

// docs/facts/limits.tsv, by name. Written as numbers here and as intervals in
// SQL below, so a change is one edit in one file.
export const UNFINISHED_SIGNUP_HOURS = 1; // signup.unfinished.ttl
export const INACTIVE_DAYS = 365; // identity.inactive.retention
export const DELETION_DELAY_DAYS = 30; // identity.deletion.delay

// How many rows one pass takes at a time, and how many bites it takes before
// leaving the rest for the next hour.
//
// Copied in shape from the idempotency prune in lib/scheduled.ts, and for the
// reason written there: the first pass on a table that has grown without a
// ceiling is the largest delete it will ever do, and one statement doing it
// holds a row lock per row, bloats the table, and outlives the ten-minute lease
// — so a second node claims the job while the first is still working. An
// abandoned-signup sweep is exactly that shape: every registration that never
// reached the paper code is a row here, and a flood of them is one request each.
//
// Each batch commits on its own, so an interruption keeps the work already
// done. The ceiling on batches means a pass ends in minutes rather than running
// for an hour on the first night; what is left waits an hour, which is the
// right trade for rows that are already past their deadline.
export const BATCH = 2000;
const MAX_BATCHES = 500;

export interface SweepResult {
  unfinished: number;
  closed: number;
  deleted: number;
}

// Runs one statement over and over until it stops finding work, or until the
// ceiling. The statement is expected to carry its own LIMIT and to answer with
// the number of rows it took.
async function inBatches(statement: string): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await queryOrThrow<{ count: string }>(statement);
    const took = Number(rows[0]?.count ?? 0);
    total += took;
    // Short of a full batch means the work ran out; asking again would cost a
    // statement to learn nothing.
    if (took < BATCH) break;
  }
  return total;
}

// Closing does to an identity what screen 12's "start again" does, and §8.2
// lists it: the recovery columns are emptied, the sessions are frozen and their
// shares burned, and the appearance rows go.
//
// The list in the spec is longer than this, and the rest of it is not written
// here because the tables do not exist yet — phrases and their likes, seats at
// tables, matches, chat games, undelivered messages. Step 1 is the identity and
// its sessions; each of the others joins this statement in the step that creates
// its table, and the spec paragraph is the checklist for doing so.
async function closeIdentities(): Promise<number> {
  // In a transaction, and the reason is the notification rather than the
  // writes: freezing a session has to announce itself on `session_frozen`
  // (lib/sessions.ts), or a tab whose socket is already open keeps receiving
  // until the TCP connection drops. The statement below froze sessions in a CTE
  // and said nothing — exactly the defect the comment on freezeSession() warns
  // about, written by the same hand two hours earlier and found by the
  // operations lens of the review panel on 2026-09-20.
  //
  // **Two statements, not one, and that is the fix for a race the data lens
  // found in the same panel.** Closing used to do everything in a single pass
  // over identities that were still open, which meant anything created while
  // that pass ran was missed for good: a `POST /vault/init` committing a share
  // a moment after the sweeper's snapshot left a closed identity with a live,
  // unburned share, and the sweeper never came back because its own condition
  // is `closed_at IS NULL`.
  //
  // So the transition is one statement and the consequences are another. The
  // second one works on **every** closed identity that still has something
  // undone, which makes it idempotent and self-healing: whatever a race leaves
  // behind is picked up on the next pass an hour later, rather than surviving
  // until the row is deleted thirty days on. It does not remove the race — two
  // writers still need a lock for that, and that is written up as a task — it
  // stops the race from being permanent.
  return await transaction(async (run) => {
    const shut = await run<{ id: string }>(
      `UPDATE identities SET closed_at = now(),
              recovery_auth_hash = NULL, recovery_wrapped_key = NULL,
              first_pin_grant_at = NULL
        WHERE closed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM sessions s
             WHERE s.identity = identities.id
               AND s.last_seen_at > now() - interval '${INACTIVE_DAYS} days'
          )
        RETURNING id`,
    );

    // Everything closing owes, over every closed identity — the ones just shut
    // above and any left half-done by an earlier pass.
    //
    // `burned` filters by identity and **must not** filter by `frozen_at`.
    // Data-modifying CTEs share one snapshot and cannot see one another's
    // writes (PostgreSQL 16 §7.8.2, checked in a container on 2026-09-20), so
    // `WHERE session IN (SELECT id FROM frozen)` or `AND frozen_at IS NOT NULL`
    // would silently stop burning anything at all: the first loses the sessions
    // that were already frozen, the second sees the old snapshot where none of
    // them are. Neither would fail. The statement would run, return the same
    // count, and the tests would stay green while shares quietly survived.
    const rows = await run<{ frozen: string[]; burned: number }>(
      `WITH closed AS (
         SELECT id FROM identities WHERE closed_at IS NOT NULL
       ), frozen AS (
         UPDATE sessions SET frozen_at = now(), frozen_reason = 'closed'
          WHERE identity IN (SELECT id FROM closed) AND frozen_at IS NULL
          RETURNING id
       ), burned AS (
         UPDATE vault_shares SET share_enc = NULL, burned_at = now()
          WHERE session IN (
                  SELECT id FROM sessions WHERE identity IN (SELECT id FROM closed)
                )
            AND share_enc IS NOT NULL
          RETURNING session
       ), faces AS (
         DELETE FROM identity_appearance WHERE identity IN (SELECT id FROM closed)
         RETURNING identity
       )
       SELECT coalesce((SELECT array_agg(id::text) FROM frozen), '{}') AS frozen,
              (SELECT count(*)::int FROM burned) AS burned`,
    );

    for (const sessionId of rows[0]?.frozen ?? []) {
      await run(`SELECT pg_notify('session_frozen', $1)`, [sessionId]);
    }

    // The counters the routes keep, kept here too. This pass does by hand what
    // lib/sessions.ts does for one session — one statement for all of them,
    // which is right for a sweep — and so it also has to say so by hand. It did
    // not: the dashboard panel that splits freezes by reason exists to tell a
    // wave of closures from somebody attacking open tabs, and the series
    // reason="closed" had never once been written, so half of that panel was a
    // legend with no line. Same for burned shares, which read zero on a night
    // that burned a thousand. Found by the operations lens of the review panel,
    // 2026-09-21.
    const frozen = rows[0]?.frozen?.length ?? 0;
    if (frozen > 0) inc("relay_sessions_frozen_total", { reason: "closed" }, frozen);
    const burned = rows[0]?.burned ?? 0;
    if (burned > 0) inc("relay_vault_shares_burned_total", {}, burned);
    return shut.length;
  });
}

// One pass. Returns what it did, so the caller can log a line only when there is
// something to say — a nightly "0, 0, 0" is how a log stops being read.
export async function sweepIdentities(): Promise<SweepResult> {
  // An identity that never finished its registration is swept whole rather than
  // closed: there is nothing to keep. It has no paper code, so no notice can be
  // attached to it and nothing has to outlive it.
  const unfinished = await inBatches(
    `WITH doomed AS (
       SELECT id FROM identities
        WHERE signup_completed_at IS NULL
          AND created_at < now() - interval '${UNFINISHED_SIGNUP_HOURS} hours'
        LIMIT ${BATCH}
     ), gone AS (
       DELETE FROM identities WHERE id IN (SELECT id FROM doomed) RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );

  // No index serves this one, and that is deliberate: its condition matches
  // nearly every row, so an index over it would be read more slowly than the
  // table (db/023 says the same from the other side). The two passes that are
  // selective — the catch-up and the deletion — use `identities_closed`.
  const closed = await closeIdentities();

  // And the last step, thirty days after closing. The cascades carry sessions,
  // shares, appearance and acceptances with the row.
  const deleted = await inBatches(
    `WITH doomed AS (
       SELECT id FROM identities
        WHERE closed_at IS NOT NULL
          AND closed_at < now() - interval '${DELETION_DELAY_DAYS} days'
        LIMIT ${BATCH}
     ), gone AS (
       DELETE FROM identities WHERE id IN (SELECT id FROM doomed) RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );

  const result = { unfinished, closed, deleted };
  // Three counters rather than one, because the three deadlines fail
  // differently: a signup sweep that stops means registrations are finishing
  // that should not, a closing sweep that jumps means a year's worth of people
  // went quiet at once, and a deletion sweep that stays at zero while closures
  // grow means the thirty days are not running. One number would hide all three.
  inc("relay_identity_sweeper_total", { deadline: "unfinished_signup" }, result.unfinished);
  inc("relay_identity_sweeper_total", { deadline: "inactive_closed" }, result.closed);
  inc("relay_identity_sweeper_total", { deadline: "deleted" }, result.deleted);
  // When the sweeper last finished a pass. The counters above say what it did;
  // this says that it ran at all, which is the thing that goes silently wrong —
  // a job that exhausts its attempts becomes a tombstone and never re-arms
  // (lib/queue_metrics.ts).
  setGauge("relay_identity_sweeper_last_pass_seconds", Math.round(Date.now() / 1000));
  if (result.unfinished || result.closed || result.deleted) {
    log("info", "swept identities", { ...result });
  }
  return result;
}
