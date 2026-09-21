// The PIN attempt, in one place, because two routes ask for the same proof and
// only one of them was counting.
//
// §8.2 asks for a proof of the PIN on the three irreversible actions, and the
// counter behind that proof is the whole of its strength: ten attempts, the
// delays of chat_RU.md:1275 between the last five, and the tenth mistake
// closing entry and freezing the session. POST /vault/share had all of it.
// POST /sessions/invite had none of it — it read `auth_hash, locked_at` and
// compared, so a stolen signing key could be walked through a million PINs
// with no delay, no attempt spent and no trace but a counter of wrong guesses.
// The comment above that route promised the opposite in so many words: "A
// stolen signing key alone must not be able to start a transfer." Found by the
// security lens of the review panel, 2026-09-21.
//
// Two routes copying one rule is how the rule dies. This is the rule.

import { refuse } from "./identity_guard.ts";
import { freezeSession } from "./sessions.ts";

type Run = <R>(text: string, args?: unknown[]) => Promise<R[]>;

export interface VaultRow {
  auth_hash: string;
  share_enc: Uint8Array | null;
  attempts_left: number;
  next_attempt_at: Date | null;
  locked_at: Date | null;
}

// Constant time over the hex, because a comparison that returns early tells the
// caller how many leading characters were right, and a million PINs is few
// enough that the leak is worth something.
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

// The whole attempt: the row under SELECT … FOR UPDATE, the lock, the delay,
// the comparison, the spent attempt and the freeze. A `Response` means the
// caller is refused and must return it unchanged; a row means the PIN was
// right and the caller may go on with the row it was going to read anyway.
//
// `meter` is how each route names the outcome in its own counter — the caller
// keeps its metric, the rule stays here.
export async function checkPin(
  run: Run,
  sessionId: string,
  presented: string,
  meter: (result: string) => void,
): Promise<Response | VaultRow> {
  const [row] = await run<VaultRow>(
    `SELECT auth_hash, share_enc, attempts_left, next_attempt_at, locked_at
       FROM vault_shares WHERE session = $1 FOR UPDATE`,
    [sessionId],
  );
  if (!row) return refuse("not_found", "this session has no share", 404);

  // Locked and too-early are answered before the hash is looked at, and a
  // correct PIN is refused here too — otherwise waiting out the delay would
  // itself be a way to test one.
  if (row.locked_at) {
    // No Retry-After: there is no time to give. Entry is closed until a piece
    // of paper is found, and a header promising a moment to come back would be
    // a lie in seconds (RFC 9110 asks for a date or a delay, and neither
    // exists here). The wording carries the answer instead.
    return refuse("pin_locked", "entry is closed until the paper code", 409, {
      attempts_left: 0,
    });
  }
  if (row.next_attempt_at && row.next_attempt_at.getTime() > Date.now()) {
    const seconds = Math.ceil((row.next_attempt_at.getTime() - Date.now()) / 1000);
    return refuse("rate_limited", "too soon after the last attempt", 429, {
      attempts_left: row.attempts_left,
    }, { "retry-after": String(seconds) });
  }

  if (!sameHash(presented, row.auth_hash)) {
    // The delays of §8.2, by their own numbers: the sixth attempt waits 30
    // seconds, the tenth four hours, and the tenth miss closes entry without
    // burning the share — a stolen signing key must not be able to erase
    // somebody's history from afar.
    await run(
      `UPDATE vault_shares
          SET attempts_left   = attempts_left - 1,
              next_attempt_at = now() + CASE attempts_left - 1
                  WHEN 5 THEN interval '30 seconds' WHEN 4 THEN interval '2 minutes'
                  WHEN 3 THEN interval '10 minutes' WHEN 2 THEN interval '1 hour'
                  WHEN 1 THEN interval '4 hours' ELSE interval '0' END,
              locked_at       = CASE WHEN attempts_left - 1 = 0 THEN now() END
        WHERE session = $1`,
      [sessionId],
    );
    const left = row.attempts_left - 1;
    if (left === 0) {
      // The same transaction freezes the session, and §8.2 is explicit about
      // why (2026-09-14, SEC3/SEC-A): refusing the three irreversible actions
      // is not enough, because an unlocked tab holds the signing key in memory
      // — whoever holds the tab would go on publishing, writing in
      // conversations, complaining and asking support in this person's name,
      // all the way until the paper code. Closing the PIN alone leaves exactly
      // that open, so the two are one write or they are a hole.
      //
      // Freezing carries its own notification; lib/sessions.ts says why that is
      // not optional and why it is not written inline here.
      await freezeSession(run, sessionId, "pin_limit");
    }
    meter(left === 0 ? "locked" : "wrong_pin");
    return refuse(
      // Its own code, not `unauthorized`: that one belongs to 401 and a bad
      // signature (openapi.yaml), and a client that reads the code to decide
      // between "sign again" and "ask for the PIN again" was told the wrong
      // one. Second review panel, 2026-09-21, task 8.
      left === 0 ? "pin_locked" : "pin_mismatch",
      left === 0 ? "entry is closed until the paper code" : "that PIN does not match",
      409,
      { attempts_left: Math.max(left, 0) },
    );
  }

  return row;
}
