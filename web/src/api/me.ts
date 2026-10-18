// The "me" screens' words and readings (W4, 2026-09-26). The words are the
// terminal's, through the web's one lookup (locales/say.ts, W13), which also
// picks the language. Nothing here draws; the screens in screens/Me.tsx do.

import type { Answer } from "../../../depth/core/client.ts";
import { say } from "../locales/say.ts";
import { refusalText } from "./actions.ts";

export { say };

// How the node refuses a proof of the PIN, as one line (§8.2): the same
// counter answers "change the PIN" and "start again" (depth/ink/rooms.ts).
export function pinRefusal(answer: Answer<unknown>): string | null {
  const error = (answer.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
  if (error?.code === "pin_mismatch") return say("pin.mismatch", { n: String(error.attempts_left ?? "?") });
  if (error?.code === "pin_locked") return say("pin.locked");
  if (error?.code === "rate_limited") return say("pin.wait", { n: String(answer.retryAfter ?? "?") });
  return null;
}

const hhmm = (seconds: unknown) =>
  typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toTimeString().slice(0, 5) : "?";

// The node's refusal of a profile edit, in the owner's words
// (refusal-wordings §5, 2026-09-23), or null for a refusal with no words.
export function profileRefusal(answer: Answer<unknown>): string | null {
  const error = (answer.body as { error?: { code?: string; until?: number } } | null)?.error;
  if (error?.code === "name_frozen") return say("profile.nameFrozen");
  if (error?.code === "age_step_down") return say("profile.ageDown");
  if (error?.code === "paused") return say("write.paused", { time: hhmm(error.until) });
  // The model or the rules refused the new name (WP-4), and the old name
  // stands. The reason is a phrase of the dictionary, not the node's text.
  if (error?.code === "name_refused") {
    const message = (answer.body as { error?: { message?: string } } | null)?.error?.message;
    return refusalText("name", error.code, answer.status, message);
  }
  if (error?.code === "rate_limited") {
    const hours = Math.min(24, Math.max(1, Math.ceil((answer.retryAfter ?? 24 * 3600) / 3600)));
    return say("profile.patchDay", { n: String(hours) });
  }
  return null;
}

export { AWAY_MINUTES, type AwaySpan, graphemes } from "../../../depth/core/limits.ts";
// What a step away and a start-again cost, counted on the spot as the terminal counts them: one copy for
// both faces (depth/core/me.ts, 18.10.2026).
export { AWAY_ORDER, awayCounts, resetCounts } from "../../../depth/core/me.ts";

export const NAME_MAX = 24;
