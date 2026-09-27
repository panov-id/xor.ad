// The live step in the feed's header — "рядом десятки" — changes without a
// reload as the radius moves and people come and go, and nothing told a
// screen reader (open.tsv design.nearby.live, the accessibility panel of
// 2026-09-19). Two things fix that, both here so they can be tested apart
// from the screen:
//
// - the words for each step of GET /feed/density, as design-system-app_RU.md
//   names the header ("здесь пока никого", "рядом мало людей", "десятки",
//   "сотни"; the chat spec's "около десятка" for the step between);
// - the announcement rule: the header line is `aria-live="polite"`, and what
//   reaches it changes only when the step changes, and not more often than
//   once in ANNOUNCE_MS — a handle dragged across five radii in a second is one
//   announcement, the last, not five.

import { say } from "../locales/say.ts";

export type Step = "none" | "few" | "about_ten" | "tens" | "hundreds";

export const NEARBY: Record<Step, string> = {
  none: say("web.nearby.none"),
  few: say("web.nearby.few"),
  about_ten: say("web.nearby.about_ten"),
  tens: say("web.nearby.tens"),
  hundreds: say("web.nearby.hundreds"),
};

export const isStep = (s: unknown): s is Step => typeof s === "string" && s in NEARBY;

// Not more often than this: a polite region that changes twice a second is a
// reader talking over itself.
export const ANNOUNCE_MS = 4000;

// What the live region says next, given what it says now and the step just
// read. `now` is the clock, so the rule is testable without waiting.
export function announce(
  state: { said: Step | null; at: number },
  step: Step,
  now: number,
): { say: Step | null; state: { said: Step | null; at: number } } {
  if (state.said === step) return { say: null, state };
  if (state.said !== null && now - state.at < ANNOUNCE_MS) return { say: null, state };
  return { say: step, state: { said: step, at: now } };
}
