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

import { brake } from "./shared_misses.ts";

// The two brakes the canon names, built from one implementation
// (lib/shared_misses.ts) rather than written twice.
//
// `recovery.miss.shared` / `recovery.miss.pause`: fifty wrong paper codes in an
// hour across the node, then fifteen minutes in which a genuine code waits too.
export const RECOVERY = brake(50, 15);
// `claim.miss.shared` / `claim.miss.pause`: the same numbers for the transfer
// code, and separate counters on purpose — a flood against one must not close
// the other, because the other may be how somebody gets back in.
export const TRANSFER = brake(50, 15);

export const SHARED_MISS_MAX = RECOVERY.max;
export const PAUSE_MS = RECOVERY.pauseMs;

export const pausedFor = (now?: number): number => RECOVERY.pausedFor(now);
export const countMiss = (now?: number): boolean => RECOVERY.countMiss(now);
export const reset = (): void => {
  RECOVERY.reset();
  TRANSFER.reset();
};
