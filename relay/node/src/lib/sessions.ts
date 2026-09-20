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

export type FreezeReason = "transfer" | "closed" | "pin_limit";

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

// Returns true when this call is the one that froze the session. A second
// freeze of an already-frozen session writes nothing and signals nothing: the
// `frozen_at IS NULL` guard is what keeps the first reason — and the first
// moment — from being overwritten by a later one.
export async function freezeSession(
  run: Run,
  sessionId: string,
  reason: FreezeReason,
): Promise<boolean> {
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
  return true;
}
