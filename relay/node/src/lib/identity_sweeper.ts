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

import { queryOrThrow } from "./db.ts";
import { log } from "./log.ts";

// docs/facts/limits.tsv, by name. Written as numbers here and as intervals in
// SQL below, so a change is one edit in one file.
export const UNFINISHED_SIGNUP_HOURS = 1; // signup.unfinished.ttl
export const INACTIVE_DAYS = 365; // identity.inactive.retention
export const DELETION_DELAY_DAYS = 30; // identity.deletion.delay

export interface SweepResult {
  unfinished: number;
  closed: number;
  deleted: number;
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
  const rows = await queryOrThrow<{ count: string }>(
    `WITH stale AS (
       SELECT i.id FROM identities i
        WHERE i.closed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM sessions s
             WHERE s.identity = i.id
               AND s.last_seen_at > now() - interval '${INACTIVE_DAYS} days'
          )
     ), shut AS (
       UPDATE identities SET closed_at = now(),
              recovery_auth_hash = NULL, recovery_wrapped_key = NULL,
              first_pin_grant_at = NULL
        WHERE id IN (SELECT id FROM stale) RETURNING id
     ), frozen AS (
       UPDATE sessions SET frozen_at = now(), frozen_reason = 'closed'
        WHERE identity IN (SELECT id FROM shut) AND frozen_at IS NULL RETURNING id
     ), burned AS (
       UPDATE vault_shares SET share_enc = NULL, burned_at = now()
        WHERE session IN (SELECT id FROM sessions WHERE identity IN (SELECT id FROM shut))
          AND share_enc IS NOT NULL RETURNING session
     ), faces AS (
       DELETE FROM identity_appearance WHERE identity IN (SELECT id FROM shut) RETURNING identity
     )
     SELECT count(*)::text AS count FROM shut`,
  );
  return Number(rows[0]?.count ?? 0);
}

// One pass. Returns what it did, so the caller can log a line only when there is
// something to say — a nightly "0, 0, 0" is how a log stops being read.
export async function sweepIdentities(): Promise<SweepResult> {
  // An identity that never finished its registration is swept whole rather than
  // closed: there is nothing to keep. It has no paper code, so no notice can be
  // attached to it and nothing has to outlive it.
  const unfinished = await queryOrThrow<{ count: string }>(
    `WITH gone AS (
       DELETE FROM identities
        WHERE signup_completed_at IS NULL
          AND created_at < now() - interval '${UNFINISHED_SIGNUP_HOURS} hours'
        RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );

  const closed = await closeIdentities();

  // And the last step, thirty days after closing. The cascades carry sessions,
  // shares, appearance and acceptances with the row.
  const deleted = await queryOrThrow<{ count: string }>(
    `WITH gone AS (
       DELETE FROM identities
        WHERE closed_at IS NOT NULL
          AND closed_at < now() - interval '${DELETION_DELAY_DAYS} days'
        RETURNING 1
     )
     SELECT count(*)::text AS count FROM gone`,
  );

  const result = {
    unfinished: Number(unfinished[0]?.count ?? 0),
    closed,
    deleted: Number(deleted[0]?.count ?? 0),
  };
  if (result.unfinished || result.closed || result.deleted) {
    log("info", "swept identities", { ...result });
  }
  return result;
}
