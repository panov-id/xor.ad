// The PIN gate as the person meets it, after a reload (the unlock screen) and after the idle lock (the
// locked screen): what a refusal of the node's means, when the last attempts are said, how long a "too
// soon" lasts on the screen. No React, no DOM, no words: a rule answers with a kind, and each face says it in
// its own language (the terminal's pin.* lines, shared by both faces). The counter itself is the node's, not
// the page's (chat spec §8.2: the node checks the proof and counts the misses; ten close entry until the paper
// code) — so nothing here counts attempts, it reads what the node counted.
//
// Imports nothing, so a face's unit tests run it as it is.

/** On the last three attempts the screen adds the second sentence of §8.2: what the tenth miss does. */
export const LAST_ATTEMPTS = 3;

/** The attempts left, when the line must say what the last one does. */
export const isLastAttempts = (attemptsLeft: number | undefined): boolean => attemptsLeft !== undefined && attemptsLeft <= LAST_ATTEMPTS;

export type PinRefusal =
  /** The PIN did not match: `left` attempts remain (undefined: the node did not say), `last` — say what the tenth does. */
  | { kind: "mismatch"; left: number | undefined; last: boolean }
  /** Entry is closed until the paper code (the tenth miss, or a session the tenth miss froze). */
  | { kind: "locked" }
  /** Too soon after the last attempt: the PIN was not checked, no attempts are named. */
  | { kind: "wait"; seconds: number | undefined }
  /** Anything else: the node's code, or a bare status. */
  | { kind: "other"; code: string | undefined; status: number | undefined };

/**
 * A refusal of POST /vault/share (or of the lock's own unlock). `code` is the node's error code, or
 * "status_<n>" when the answer carried none (the reload's route); 401 is a session the tenth miss froze — the
 * guard answers before the PIN is checked — and reads as the lock; 429 ("rate_limited") is "too soon".
 */
export function pinRefusal(a: { code?: string; status?: number; attemptsLeft?: number; retryAfter?: number }): PinRefusal {
  if (a.code === "pin_mismatch") return { kind: "mismatch", left: a.attemptsLeft, last: isLastAttempts(a.attemptsLeft) };
  if (a.code === "pin_locked" || a.code === "unauthorized" || a.code === "status_401" || a.status === 401) return { kind: "locked" };
  if (a.code === "rate_limited") return { kind: "wait", seconds: a.retryAfter };
  return { kind: "other", code: a.code, status: a.status };
}

/** The PIN's open button: six digits, nothing in flight, entry not closed. */
export const canOpen = (pin: string, busy: boolean, closed = false): boolean => /^\d{6}$/.test(pin) && !busy && !closed;

/** The moment a "too soon" ends, from the seconds the node gave; null when it gave none. */
export const untilOf = (now: number, retryAfter: number | undefined): number | null =>
  typeof retryAfter === "number" ? now + retryAfter * 1000 : null;

/** Whole seconds still to wait (rounded up), 0 once the moment has passed or there is none. */
export const secondsLeft = (until: number | null, now: number): number => (until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)));

/** mm:ss of a number of seconds. */
export const clockText = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
