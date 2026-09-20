// The node-wide miss counter for the paper code, and the pause it triggers.
//
// Chat spec §8.2 counts recovery misses in two places, and they answer different
// questions. Per address is the ordinary public-route limit and lives in
// lib/rate_limit.ts. This is the other one: fifty wrong paper codes in an hour
// across the whole node, then the route stops accepting codes for fifteen
// minutes (`recovery.miss.shared`, `recovery.miss.pause` in docs/facts/limits.tsv).
//
// It is explicitly **not** a defence against guessing — the arithmetic already
// forbids that: sixteen Crockford base32 characters are 80 bits, and a miss
// costs an Argon2id on the device. It is a brake on a flood into a public route
// that does a database lookup per call, and the price is named in the spec: while
// the brake is on, somebody holding a real paper code waits too.
//
// In memory on purpose, like the rest of lib/rate_limit.ts. A restart forgets the
// count, and that is the right trade for a brake: a node that came back up is a
// node that is no longer under the load that tripped it.

const HOUR = 60 * 60 * 1000;

export const SHARED_MISS_MAX = 50; // recovery.miss.shared
export const PAUSE_MS = 15 * 60 * 1000; // recovery.miss.pause

let misses: number[] = [];
let pausedUntil = 0;

// Seconds left of the pause, or 0 when codes are being accepted. Called before
// the body is read: a paused route does no lookup at all, which is the whole
// point of the brake.
export function pausedFor(now = Date.now()): number {
  if (pausedUntil <= now) return 0;
  return Math.ceil((pausedUntil - now) / 1000);
}

// Counts one wrong code. Returns true when this miss is the one that started the
// pause — the caller logs and measures that, because "the brake came on" is a
// thing an operator wants to see once, not fifty times.
export function countMiss(now = Date.now()): boolean {
  misses = misses.filter((at) => at > now - HOUR);
  misses.push(now);
  if (misses.length < SHARED_MISS_MAX || pausedUntil > now) return false;
  pausedUntil = now + PAUSE_MS;
  // The hour's misses are dropped with the pause, not kept: keeping them would
  // make every single miss after the pause trip it again, and fifteen minutes
  // would become for ever.
  misses = [];
  return true;
}

// For tests and for a node that has just started; nothing in the routes calls it.
export function reset(): void {
  misses = [];
  pausedUntil = 0;
}
