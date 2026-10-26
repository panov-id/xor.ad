// The pure part of the paper-code gate (w4_restore): what is typed into the sixteen cells and the six PIN cells,
// when "Open" opens, and how the node's answer is said. No React, no node, no crypto — tested in lists.test.ts.
// The path, not @sdk: node:test (run-app-unit-tests.sh) has no aliases.
import { readPaperText } from "../../../../depth/core/paper_text.ts";
import { PIN_LENGTH } from "../../../../depth/core/register.ts";

export const CODE_LENGTH = 16;
export { PIN_LENGTH };

/** What the sixteen cells hold: the paper's own reading (any case, dashes and spaces dropped, I L O read as digits), at most sixteen. */
export const codeChars = (typed: string): string => readPaperText(typed).replace(/[^0-9A-Z]/g, "").slice(0, CODE_LENGTH);

/** The new PIN's cells: digits only, at most six. */
export const newPinDigits = (typed: string): string => typed.replace(/\D/g, "").slice(0, PIN_LENGTH);

/** "Open" is open when all sixteen characters and all six digits are in, and nothing is being sent. */
export const restoreReady = (code: string, pin: string, busy: boolean): boolean => !busy && code.length === CODE_LENGTH && pin.length === PIN_LENGTH;

/** The node's refusal of a code, as the words (a key of the dictionary and its values). */
export type Refusal = { reason: string; retryAfter?: number; status?: number };
export function refusalLine(o: Refusal): { key: string; values: Record<string, string> } {
  if (o.reason === "no_match") return { key: "restore.noMatch", values: {} };
  if (o.reason === "rate_limited") return { key: "restore.wait", values: { n: String(o.retryAfter ?? "?") } };
  return { key: "restore.refused", values: { status: String(o.status ?? o.reason ?? "?") } };
}

/** Runs `work`, then zeroes every buffer `held()` names, whether `work` returned or threw (a refused first PIN included):
 *  the private keys the raise handed over never outlive the gate. */
export async function zeroAfter<T>(held: () => (Uint8Array | null | undefined)[], work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } finally {
    for (const b of held()) b?.fill(0);
  }
}
