// The PIN's words on the web face (W14-WP), one place for every screen that
// shows a refused or a weak PIN, as depth/ink/screens.ts pinMismatch is for
// the terminal: the node's "that PIN does not match" with the attempts left,
// and on the last three the second sentence of chat spec §8.2 (:1331) — what
// the tenth miss does, said while it can still be avoided. Words are the
// terminal's dictionary (pin.mismatch, pin.mismatchLast), so both faces say
// the same. The obvious-PIN list is the core's (depth/core/pin.ts
// obviousPin): the two faces warn about the same PINs, by one list.

import { say } from "./locales/say.ts";

export { obviousPin } from "../../depth/core/pin.ts";

export const LAST_ATTEMPTS = 3;

export function pinMismatch(attemptsLeft: number | undefined): string {
  const n = attemptsLeft === undefined ? "?" : String(attemptsLeft);
  const line = say("pin.mismatch", { n });
  return attemptsLeft !== undefined && attemptsLeft <= LAST_ATTEMPTS ? `${line} ${say("pin.mismatchLast")}` : line;
}
