// A node-wide brake: N misses in an hour, then a pause for everyone.
//
// Two routes need one and the canon gives them separate numbers — the paper
// code (`recovery.miss.shared` / `recovery.miss.pause`) and the transfer code
// (`claim.miss.shared` / `claim.miss.pause`). They are separate on purpose: a
// flood against one must not close the other, because the other may be the way
// somebody gets back in.
//
// This was lib/recovery_misses.ts with the recovery numbers written into it. It
// became a factory when the transfer arrived, so the second brake is a call
// rather than a copy — a copied one drifts, and the drift is silent.
//
// It is explicitly **not** a defence against guessing: sixteen Crockford base32
// characters are 80 bits for the paper code and nine are 45 for the transfer,
// and each guess costs an Argon2id on the device. It is a brake on a flood into
// a public route that does a database lookup per call, and the price is the
// spec's: while the brake is on, somebody holding a real code waits too.
//
// In memory, like lib/rate_limit.ts, and with the same trade: a restart forgets
// the count. A node that came back up is a node no longer under the load that
// tripped it — and on a pool of N nodes the threshold is N times higher, which
// is named in the open-work item rather than hidden here.

const HOUR = 60 * 60 * 1000;

export interface Brake {
  /** Seconds left of the pause, or 0 when the route is accepting. */
  pausedFor(now?: number): number;
  /** Counts one miss. True when this miss is the one that started the pause. */
  countMiss(now?: number): boolean;
  /** For tests and for a node that has just started. */
  reset(): void;
  readonly max: number;
  readonly pauseMs: number;
}

export function brake(max: number, pauseMinutes: number): Brake {
  let misses: number[] = [];
  let pausedUntil = 0;
  const pauseMs = pauseMinutes * 60 * 1000;

  return {
    max,
    pauseMs,
    pausedFor(now = Date.now()): number {
      if (pausedUntil <= now) return 0;
      return Math.ceil((pausedUntil - now) / 1000);
    },
    countMiss(now = Date.now()): boolean {
      misses = misses.filter((at) => at > now - HOUR);
      misses.push(now);
      if (misses.length < max || pausedUntil > now) return false;
      pausedUntil = now + pauseMs;
      // The hour's misses go with the pause rather than being kept: keeping
      // them would make every miss after the pause trip it again, and fifteen
      // minutes would become for ever.
      misses = [];
      return true;
    },
    reset(): void {
      misses = [];
      pausedUntil = 0;
    },
  };
}
