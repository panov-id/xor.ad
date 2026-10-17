// The PIN's words on the web face (W14-WP), one place for every screen that
// shows a refused or a weak PIN, as depth/ink/screens.ts pinMismatch is for
// the terminal: the node's "that PIN does not match" with the attempts left,
// and on the last three the second sentence of chat spec §8.2 (:1331) — what
// the tenth miss does, said while it can still be avoided. Words are the
// terminal's dictionary (pin.mismatch, pin.mismatchLast), so both faces say
// the same. The obvious-PIN list is the core's (depth/core/pin.ts
// obviousPin): the two faces warn about the same PINs, by one list.

import { isLastAttempts } from "../../depth/core/pin_gate.ts";
import { say } from "./locales/say.ts";

export { obviousPin } from "../../depth/core/pin.ts";

// Which attempts count as the last ones is the core's (depth/core/pin_gate.ts), shared with the app shell.
export { LAST_ATTEMPTS } from "../../depth/core/pin_gate.ts";

export function pinMismatch(attemptsLeft: number | undefined): string {
  const n = attemptsLeft === undefined ? "?" : String(attemptsLeft);
  const line = say("pin.mismatch", { n });
  return isLastAttempts(attemptsLeft) ? `${line} ${say("pin.mismatchLast")}` : line;
}
