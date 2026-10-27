// The PIN of registration in two screens (NEWDESIGN_PLAN §7 step 5; sheets register-2 and register-2b): the PIN, then
// the same PIN again on a screen of its own. The sixth digit moves on by itself: to the repeat, or, repeated, to the
// creation; a repeat that differs goes back to the first screen, both cleared, and says so. Free of React for node:test.
import { PIN_LENGTH } from "../../../depth/core/register.ts";

export type PinStage = "pin" | "again";
export type PinState = { stage: PinStage; pin: string; again: string; mismatch: boolean };
export type PinMove = PinState & { create: boolean };

export function afterDigits(s: PinState): PinMove {
  if (s.stage === "pin") {
    return s.pin.length === PIN_LENGTH ? { ...s, stage: "again", again: "", create: false } : { ...s, create: false };
  }
  if (s.again.length < PIN_LENGTH) return { ...s, create: false };
  if (s.again === s.pin) return { ...s, create: true };
  return { stage: "pin", pin: "", again: "", mismatch: true, create: false };
}

/** A key of the pad: a digit appends (up to the length), «back» takes the last one off. */
export function pressed(value: string, key: string): string {
  if (key === "back") return value.slice(0, -1);
  return /^[0-9]$/.test(key) && value.length < PIN_LENGTH ? value + key : value;
}
