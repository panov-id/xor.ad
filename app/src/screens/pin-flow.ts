// The PIN of registration in two screens (NEWDESIGN_PLAN §7 step 5; sheets register-2 and register-2b): the PIN, then
// the same PIN again on a screen of its own. The sixth digit moves on by itself: to the repeat, or, repeated, to the
// creation; a repeat that differs is cleared and typed again, the third miss goes back to the first screen (docs/newdesign4
// SCREENS_spec §4). The pair of paper code groups asked back (§5a). Free of React for node:test.
import { PIN_LENGTH } from "../../../depth/core/register.ts";

export type PinStage = "pin" | "again";
export type PinState = { stage: PinStage; pin: string; again: string; mismatch: boolean; misses?: number };
export type PinMove = PinState & { create: boolean };
/** docs/newdesign4 SCREENS_spec §4: a repeat that differs clears and is typed again; the third miss in a row goes back to the PIN. */
export const MISSES_BACK = 3;

export function afterDigits(s: PinState): PinMove {
  if (s.stage === "pin") {
    return s.pin.length === PIN_LENGTH ? { ...s, stage: "again", again: "", misses: 0, create: false } : { ...s, create: false };
  }
  if (s.again.length < PIN_LENGTH) return { ...s, create: false };
  if (s.again === s.pin) return { ...s, create: true };
  const misses = (s.misses ?? 0) + 1;
  if (misses >= MISSES_BACK) return { stage: "pin", pin: "", again: "", mismatch: true, misses: 0, create: false };
  return { stage: "again", pin: s.pin, again: "", mismatch: true, misses, create: false };
}

/** The six pairs of the paper code's four groups (0-based), SCREENS_spec §5a: two asked each time. */
export const PAIRS: readonly (readonly [number, number])[] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
/** A pair of groups to ask, never the one asked last. */
export function pickPair(last: readonly [number, number] | null, random: () => number = Math.random): readonly [number, number] {
  const left = PAIRS.filter((p) => !last || p[0] !== last[0] || p[1] !== last[1]);
  return left[Math.min(left.length - 1, Math.floor(random() * left.length))];
}

/** A key of the pad: a digit appends (up to the length), «back» takes the last one off. */
export function pressed(value: string, key: string): string {
  if (key === "back") return value.slice(0, -1);
  return /^[0-9]$/.test(key) && value.length < PIN_LENGTH ? value + key : value;
}
