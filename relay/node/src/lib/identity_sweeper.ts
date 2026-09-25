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
// A year without a session, decided under the rows it is decided about. The
// guard writes last_seen_at in a commit of its own (lib/identity_guard.ts), and
// the statement that closed used its snapshot: a person back after a year, whose
// bump committed while the statement ran, was closed in the middle of their
// own request — irreversibly (eighth quorum, 2026-09-25). So the candidates'
// rows are locked and the year is asked again by a new statement, which in
// READ COMMITTED sees whatever committed while the locks were waited for.
//
// The locks in the order every route that moves a session takes them: the
// shares, then the sessions, then the identity's row (identity.lock.order).
// Starting from the identity's row, the sweeper met a claim from a new device
// the other way round — the claim held the frozen session and its INSERT
// needed a key-share on the identity — and the verifier's probe deadlocked
// nine times in nine, the sweeper the victim each time, so the catch-up pass
// and the thirty-day deletion waited another hour (2026-09-25). The
// candidates are therefore picked without a lock; a claim or a close that
// commits while the locks are waited for is what the second question sees.
async function closeInactive(): Promise<number> {
  let total = 0;
  let after = "00000000-0000-0000-0000-000000000000";
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { picked, closed, last } = await transaction(async (run) => {
      // Keyed past the last batch rather than skipping what is locked: nothing
      // is locked at this point, so a candidate that survives the second
      // question would otherwise come back first in every batch.
      const doomed = await run<{ id: string }>(
        `SELECT id FROM identities
          WHERE closed_at IS NULL AND id > $1
            AND NOT EXISTS (
              SELECT 1 FROM sessions s
               WHERE s.identity = identities.id
                 AND s.last_seen_at > now() - interval '${INACTIVE_DAYS} days')
          ORDER BY id LIMIT ${BATCH}`,
        [after],
      );
      if (doomed.length === 0) return { picked: 0, closed: 0, last: after };
      const last = doomed[doomed.length - 1].id;
      // The shares without waiting, and an identity with any share somebody
      // holds is left for the next pass. Waiting in order was not enough while
      // a close took its own share first and burned the others last — a
      // deadlock of the sweep's own making (reproduced 2026-09-25); the close
      // now takes them all in order too, and skipping still keeps the sweep
      // from waiting on anyone. Whoever holds a share is moving the identity,
      // and the year is theirs to decide.
      const candidates = doomed.map((d) => d.id);
      const count = (rows: { identity: string }[]) => {
        const by = new Map<string, number>();
        for (const row of rows) by.set(row.identity, (by.get(row.identity) ?? 0) + 1);
        return by;
      };
      const want = count(await run<{ identity: string }>(
        `SELECT s.identity FROM vault_shares v JOIN sessions s ON s.id = v.session
          WHERE s.identity = ANY($1::uuid[])`, [candidates]));
      // Only identities whose every share was free keep their locks. The
      // shares of an identity left out used to stay locked until the batch
      // committed, and a batch waiting on another candidate's session kept a
      // close of that identity past its lock_timeout — a 503 after two seconds
      // for a person who was not even being swept (sweeper.batch.shareheld,
      // 2026-09-25). A row lock goes only with the transaction or the
      // savepoint it was taken under, so each attempt is a savepoint: short of
      // any share, it is rolled back — every lock it took with it — and tried
      // again without the identities that were short. The set shrinks on every
      // retry, so the loop ends; the ceiling only bounds a pathological churn.
      // The rows the same way, and for the same reason: a batch that got every
      // share and then waited on a session somebody held — the guard's bump of
      // last_seen_at, a claim, a freeze — kept the shares of every identity it
      // was closing, and a close of one of them hit its lock_timeout and
      // answered 503 (verifier, 2026-09-25, probe P1: 2032 ms). Whoever holds
      // a session or the identity's row is using it, so the year is not up for
      // them this pass either. NO KEY UPDATE and not UPDATE: nothing here
      // deletes a row or changes a key, and the full lock also conflicts with
      // the key-share every INSERT referencing the row takes — a paper-code
      // reissue (identities, then a nonce on the session) and a support request
      // met the sweep the other way round and deadlocked (review panel
      // 2026-09-25, data lens, reproduced).
      const sessionsWanted = count(await run<{ identity: string }>(
        `SELECT identity FROM sessions WHERE identity = ANY($1::uuid[])`, [candidates]));
      let ids = candidates;
      let shortOfRows = 0;
      for (let attempt = 0; ids.length > 0; attempt++) {
        await run(`SAVEPOINT sweep_shares`);
        const got = count(await run<{ identity: string }>(
          `SELECT s.identity FROM vault_shares v JOIN sessions s ON s.id = v.session
            WHERE s.identity = ANY($1::uuid[]) ORDER BY v.session FOR UPDATE OF v SKIP LOCKED`, [ids]));
        // At least as many as were counted: a share written in between is locked
        // here too and is no reason to wait.
        const shares = ids.filter((id) => (got.get(id) ?? 0) >= (want.get(id) ?? 0));
        const rows = count(await run<{ identity: string }>(
          `SELECT identity FROM sessions WHERE identity = ANY($1::uuid[])
            ORDER BY id FOR NO KEY UPDATE SKIP LOCKED`, [shares]));
        const own = new Set((await run<{ id: string }>(
          `SELECT id FROM identities WHERE id = ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE SKIP LOCKED`,
          [shares])).map((r) => r.id));
        const whole = shares.filter((id) => (rows.get(id) ?? 0) >= (sessionsWanted.get(id) ?? 0) && own.has(id));
        if (whole.length === ids.length) {
          await run(`RELEASE SAVEPOINT sweep_shares`);
          break;
        }
        shortOfRows += shares.length - whole.length;
        await run(`ROLLBACK TO SAVEPOINT sweep_shares`);
        await run(`RELEASE SAVEPOINT sweep_shares`);
        ids = attempt < 4 ? whole : [];
      }
      // Somebody holding a share or a row is visible, or an identity kept from
      // its year by a lock that never lets go would look like a quiet night
      // (review panel 2026-09-25, operations lens). The two reasons apart:
      // share_held is what the alert watches.
      const skipped = candidates.length - ids.length;
      const rowHeld = Math.min(shortOfRows, skipped);
      if (skipped - rowHeld > 0) {
        inc("relay_identity_sweeper_skipped_total", { reason: "share_held" }, skipped - rowHeld);
      }
      if (rowHeld > 0) inc("relay_identity_sweeper_skipped_total", { reason: "row_held" }, rowHeld);
      if (ids.length === 0) return { picked: doomed.length, closed: 0, last };
      const shut = await run<{ id: string }>(
        `UPDATE identities SET closed_at = now(),
                recovery_auth_hash = NULL, recovery_wrapped_key = NULL,
                first_pin_grant_at = NULL
          WHERE id = ANY($1::uuid[]) AND closed_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM sessions s
               WHERE s.identity = identities.id
                 AND s.last_seen_at > clock_timestamp() - interval '${INACTIVE_DAYS} days')
          RETURNING id`,
        [ids],
      );
      if (ids.length > shut.length) {
        inc("relay_identity_sweeper_skipped_total", { reason: "came_back" }, ids.length - shut.length);
      }
      return { picked: doomed.length, closed: shut.length, last };
    });
    total += closed;
    after = last;
    if (picked < BATCH) break;
  }
  return total;
}

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
  // second one works on every closed identity **inside the deletion window**
  // that still has something undone, which makes it idempotent and
  // self-healing: whatever a race leaves behind is picked up on the next pass
  // an hour later, rather than surviving until the row is deleted thirty days
  // on. Outside that window there is nothing left to finish — the third pass
  // deletes the row itself (the window was added 2026-09-21; before it, this
  // statement read every identity ever closed, hourly, to find nothing). The
  // race itself is closed by closeInactive's locks (2026-09-25); this pass stays
  // as the net under anything a later writer leaves half-done.
  // **In batches, like the other two passes, and for the reason written at
  // BATCH above.** This one was the exception until 2026-09-21: one UPDATE
  // over the whole table, then one CTE over every closed identity, then a
  // round trip per frozen session. On the first night after a year of use that
  // is tens of thousands of rows in a single transaction — a row lock on each,
  // the tables bloated, and the pass outliving the ten-minute lease so a second
  // node picks the job up while the first is still inside it. The comment
  // arguing against exactly that was sitting forty lines above the code doing
  // it. Found by the data and operations lenses of the review panel.
  const shut = await closeInactive();

  // The consequences, also in batches, and **bounded by the deletion window**.
  // The set used to be every closed identity there has ever been, which is the
  // same predicate as the partial index db/023 built for this pass — so the
  // index excluded nothing and the statement read the whole backlog hourly to
  // find, almost always, nothing to do. Anything closed longer ago than
  // DELETION_DELAY_DAYS is deleted outright by the third pass, so there is
  // nothing for this one to finish there.
  //
  // The set is also narrowed to identities that still have something undone.
  // Without that, a LIMIT would keep handing back the same finished rows and
  // the unfinished ones would never come up.
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const frozen = await transaction(async (run) => {
      // `burned` filters by identity and **must not** filter by `frozen_at`.
      // Data-modifying CTEs share one snapshot and cannot see one another's
      // writes (PostgreSQL 16 §7.8.2, checked in a container on 2026-09-20), so
      // `WHERE session IN (SELECT id FROM frozen)` or `AND frozen_at IS NOT NULL`
      // would silently stop burning anything at all: the first loses the sessions
      // that were already frozen, the second sees the old snapshot where none of
      // them are. Neither would fail. The statement would run, return the same
      // count, and the tests would stay green while shares quietly survived.
      // The batch first, then its shares, then the statement that freezes the
      // sessions — the order every
      // route that touches a session takes them (identity.lock.order). The
      // statement below freezes sessions before it burns shares, and the order
      // of a statement's CTEs is not ours to set: a first PIN queued on its
      // share and then asking for its session under FOR SHARE met this pass
      // the other way round, three deadlocks in three, and the closed identity
      // kept a live session with an unburned share until the job's retry
      // (verifier, 2026-09-25; review panel, data lens).
      const picked = await run<{ id: string }>(
        `SELECT i.id FROM identities i
            WHERE i.closed_at IS NOT NULL
              AND i.closed_at > now() - interval '${DELETION_DELAY_DAYS} days'
              AND (
                EXISTS (SELECT 1 FROM sessions s
                         WHERE s.identity = i.id AND s.frozen_at IS NULL)
                OR EXISTS (SELECT 1 FROM vault_shares v
                            JOIN sessions s2 ON s2.id = v.session
                           WHERE s2.identity = i.id AND v.share_enc IS NOT NULL)
                OR EXISTS (SELECT 1 FROM identity_appearance a WHERE a.identity = i.id)
                OR EXISTS (SELECT 1 FROM support_requests r WHERE r.identity = i.id)
              )
            ORDER BY i.id LIMIT ${BATCH}`,
      );
      if (picked.length === 0) return 0;
      const batchIds = picked.map((p) => p.id);
      await run(
        `SELECT v.session FROM vault_shares v JOIN sessions s ON s.id = v.session
          WHERE s.identity = ANY($1::uuid[]) ORDER BY v.session FOR UPDATE OF v`,
        [batchIds],
      );
      const rows = await run<{ frozen: string[]; burned: number; faces: number }>(
        `WITH closed AS (
           SELECT unnest($1::uuid[]) AS id
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
         ), unlinked AS (
           -- Screen 14 promises the tie between a person and their requests
           -- goes at the press, not after the thirty days of ON DELETE SET NULL
           -- (chat spec §8.2, 2026-09-14). The table came with db/039.
           UPDATE support_requests SET identity = NULL WHERE identity IN (SELECT id FROM closed)
           RETURNING id
         )
         SELECT coalesce((SELECT array_agg(id::text) FROM frozen), '{}') AS frozen,
                (SELECT count(*)::int FROM burned) AS burned,
                (SELECT count(*)::int FROM faces) AS faces`,
        [batchIds],
      );

      // One statement for the whole batch rather than one round trip per
      // session. A pass that closes ten thousand identities used to make ten
      // thousand separate calls to pg_notify inside its transaction.
      const ids = rows[0]?.frozen ?? [];
      if (ids.length > 0) {
        await run(
          `SELECT pg_notify('session_frozen', id) FROM unnest($1::text[]) AS id`,
          [ids],
        );
      }

      // The counters the routes keep, kept here too. This pass does by hand
      // what lib/sessions.ts does for one session — one statement for all of
      // them, which is right for a sweep — and so it also has to say so by
      // hand. It did not: the dashboard panel that splits freezes by reason
      // exists to tell a wave of closures from somebody attacking open tabs,
      // and the series reason="closed" had never once been written. Same for
      // burned shares, which read zero on a night that burned a thousand.
      if (ids.length > 0) {
        inc("relay_sessions_frozen_total", { reason: "closed" }, ids.length);
      }
      const burned = rows[0]?.burned ?? 0;
      if (burned > 0) inc("relay_vault_shares_burned_total", {}, burned);
      return ids.length + burned + (rows[0]?.faces ?? 0);
    });
    if (frozen === 0) break;
  }

  return shut;
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
