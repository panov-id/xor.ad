// Freezing a session: the one write, and the signal that has to ride with it.
//
// Chat spec §8.2 gives three ways a session stops being live — the device was
// transferred away, the identity was closed, and the tenth PIN mistake — and
// the same sentence for all three: the session "loses access immediately,
// including the delivery subscription". Two different things have to happen for
// that sentence to be true, and only one of them is a row.
//
// The row is `frozen_at`. Every signed request reads it (lib/identity_guard.ts)
// and a frozen session is refused everywhere, so new requests stop at once.
//
// The signal is `NOTIFY session_frozen`. A socket is checked when it is opened
// and then lives on by itself, so without a signal "immediately" means "until
// the TCP connection drops" — the tab keeps receiving, and keeps its signing
// key. The notification is emitted inside the caller's transaction, which is
// what makes it safe: Postgres delivers it on COMMIT and discards it on
// ROLLBACK, so there is no ordering in which a listener is told about a freeze
// that did not happen.
//
// Nothing listens yet. The chat relay is a stub (src/chat/relay.ts) and step 5
// of the build order owns the socket side; this is the half that can exist
// before it, so that the half that comes later has something to subscribe to
// rather than a freeze to discover by polling.
//
// One more reason it lives here rather than inline: there are three callers to
// come and a forgotten NOTIFY is invisible — nothing fails, a tab just goes on
// receiving. A caller that freezes a session by hand is the defect this
// function exists to make hard to write.

import { inc } from "./metrics.ts";

// Exists at zero from the start: an alert reads it, and a series born at 1
// hides its first event from rate() (B42, 2026-09-26; alerts.yml).
inc("relay_sessions_frozen_total", { reason: "pin_limit" }, 0);

export type FreezeReason = "transfer" | "closed" | "pin_limit";

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

// The freezes one transaction wrote, counted when it commits and only then
// (review panel 3, S2, B64, 2026-09-26). freezeSession() used to count inside
// the caller's transaction, before COMMIT: a close that froze its sessions and
// then met a lock timeout on the rows after them rolled back and was counted
// anyway, and a close retried after a deadlock counted every freeze twice. A
// caller makes one of these per attempt, hands it to every freezeSession() in
// the transaction and chains `.then(freezes.count)` on the transaction's
// promise, so a rolled-back attempt never reaches it. Required, so a new caller
// cannot freeze without saying where the count goes.
//
// A savepoint that can be rolled back on its own gets a Freezes of its own and
// hands it on with take() once released: this one knows nothing of savepoints,
// and a freeze undone by ROLLBACK TO SAVEPOINT would otherwise be counted when
// the outer transaction commits (the B64 quorum's trap, pin_attempts.ts).
//
// The shares burnShare() burns ride along, for the same reason: every burn
// sits next to a freeze, inside the same transaction (B68).
//
// The rule for the node's other counters (B68, 2026-09-26): a count that has
// statements after it in its transaction is counted after COMMIT — the chats a
// close ends, the sweep's skips, freezes and burns, a profile edit. A count
// written as the last thing before `return` from the transaction's body stays
// where it is: only a failed COMMIT can undo what it counts, and a retried
// transaction (away.ts, closeOnce, support.ts) is retried for an error thrown
// before it. About fifty-five such places; moving them all would be churn for
// a COMMIT that fails.
export class Freezes {
  #reasons: FreezeReason[] = [];
  #burned = 0;

  note(reason: FreezeReason): void {
    this.#reasons.push(reason);
  }

  burned(): void {
    this.#burned++;
  }

  take(from: Freezes): void {
    this.#reasons.push(...from.#reasons.splice(0));
    this.#burned += from.#burned;
    from.#burned = 0;
  }

  // An arrow, so it can be handed to .then() as it is; the answer passes through.
  count = <T>(answer: T): T => {
    for (const reason of this.#reasons.splice(0)) inc("relay_sessions_frozen_total", { reason });
    if (this.#burned > 0) inc("relay_vault_shares_burned_total", {}, this.#burned);
    this.#burned = 0;
    return answer;
  };
}

// Returns true when this call is the one that froze the session. A second
// freeze of an already-frozen session writes nothing and signals nothing: the
// `frozen_at IS NULL` guard is what keeps the first reason — and the first
// moment — from being overwritten by a later one.
export async function freezeSession(
  run: Run,
  sessionId: string,
  reason: FreezeReason,
  freezes: Freezes,
): Promise<boolean> {
  // A move leaves this session's private halves on the device being frozen:
  // the halves it published for matches not yet a chat go back, with their
  // consent, and a new device consents with a half of its own (db/048;
  // open.tsv chat.queue.epk-session). Only a move: a PIN-limit freeze is lifted
  // on the same device by the paper code, halves and all, and a closed
  // identity has no match left to open (panel 2026-09-24, data lens).
  //
  // The match rows first, then the session: a consent of the other side takes
  // the match row and then reads the participants, and without this lock it
  // counted a consent this freeze was taking back and opened the chat on a
  // half nobody can derive with (panel 2026-09-24, data lens, reproduced). The
  // same order a consent takes them — the match, then the session.
  const takesHalves = reason === "transfer";
  if (takesHalves) {
    await run(
      `SELECT 1 FROM matches
        WHERE chat_id IS NULL
          AND id IN (SELECT match_id FROM match_participants WHERE ephemeral_session = $1)
        ORDER BY id FOR UPDATE`,
      [sessionId],
    );
  }
  const frozen = await run<{ id: string }>(
    `UPDATE sessions SET frozen_at = now(), frozen_reason = $2
      WHERE id = $1 AND frozen_at IS NULL
      RETURNING id`,
    [sessionId, reason],
  );
  if (frozen.length === 0) return false;

  // pg_notify() rather than NOTIFY: the channel is a literal but the payload is
  // a session id, and NOTIFY takes no parameters — building that statement by
  // hand is string concatenation into SQL, on an identifier that arrives in a
  // header.
  await run(`SELECT pg_notify('session_frozen', $1)`, [sessionId]);
  if (takesHalves) {
    await run(
      `UPDATE match_participants
          SET ephemeral_public_key = NULL, ephemeral_signature = NULL,
              ephemeral_session = NULL, accepted_at = NULL
        WHERE ephemeral_session = $1
          AND match_id IN (SELECT id FROM matches WHERE chat_id IS NULL)`,
      [sessionId],
    );
  }
  // Noted here rather than at each caller: a freeze is a freeze whoever asks
  // for it, and the reason is the label that tells a spike of stolen-key
  // lockouts (`pin_limit`) from a wave of closures. Counted by the caller once
  // its transaction commits — see Freezes.
  freezes.note(reason);
  return true;
}

// Burning the device's half of the vault key. §8.2, 2026-09-11: **any move of an
// identity burns the old device's share** — a recovery by paper code and a
// voluntary transfer alike.
//
// It is deliberately not part of freezeSession(), even though every move also
// freezes. Freezing and burning answer different questions, and the tenth PIN
// mistake is the proof: it freezes and must **not** burn (§8.2, 2026-09-14),
// because a stolen signing key would otherwise erase somebody's history from
// afar. So the caller that knows the identity has moved says so.
//
// What it closes when it is called, and what stayed open without it: frozen_at
// only stops the network half — the node stops accepting the old device's
// signature. The local half lived on, because vault_shares hangs off a session
// that is marked rather than deleted, so the old phone went on decrypting
// everything it had accumulated with its own PIN. Somebody who lost a device and
// raised the identity from paper believed they had shut the door.
export async function burnShare(run: Run, sessionId: string, freezes: Freezes): Promise<void> {
  // The column pair is written together or not at all — the table's own CHECK
  // says so, and a burn that wrote only one of them would be refused outright.
  const burned = await run<{ session: string }>(
    `UPDATE vault_shares SET share_enc = NULL, burned_at = now()
      WHERE session = $1 AND share_enc IS NOT NULL
      RETURNING session`,
    [sessionId],
  );
  // Only a burn that happened is counted. Burning what is already burned is
  // ordinary — a move of an identity touches every session it has — and
  // counting it would make the number describe the sweep rather than the loss.
  // Counted by the caller once it commits, with the freeze it rides with (B68).
  if (burned.length > 0) freezes.burned();
}

// A frame for every live session of one identity, through their open rooms
// (chat/relay.ts listens on `session_frame`): the node has no socket of a
// session's own, so a frame meant for "the author's session" goes to each room
// that session holds. The name's verdict first (protocol §4.4, `name_verdict`;
// loop plan A10, 2026-09-24). In the caller's transaction: sent on commit.
export async function frameSessions(run: Run, identityId: string, type: string, data: unknown): Promise<void> {
  await run(
    `SELECT pg_notify('session_frame', s.id || '|' || $2) FROM sessions s
      WHERE s.identity = $1 AND s.frozen_at IS NULL`,
    [identityId, JSON.stringify({ type, data })],
  );
}
