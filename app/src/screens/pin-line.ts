// A refusal of the PIN as one line, in the terminal's words (depth/ink/locales pin.*, shared with the web). What the
// refusal means is the SDK's (depth/core/pin_gate.ts pinRefusal); this is only the words.
import type { PinRefusal } from "@sdk/pin_gate.ts";
import { say } from "../i18n";

/** `other` is the line for a refusal the SDK has no name for (a status, the web's «PIN wrong»). */
export function pinLine(r: PinRefusal, other: string): string {
  if (r.kind === "mismatch") {
    const line = say("pin.mismatch", { n: r.left === undefined ? "?" : String(r.left) });
    // With the second sentence of §8.2 on the last three attempts (the web's pinWords.ts).
    return r.last ? `${line} ${say("pin.mismatchLast")}` : line;
  }
  if (r.kind === "locked") return say("pin.locked");
  if (r.kind === "wait") return say("pin.wait", { n: r.seconds ?? "?" });
  return other;
}
