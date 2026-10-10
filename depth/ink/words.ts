// What the terminal says in words where the node gives it an id, a number or a
// code (text walkthrough 10.10.2026, Т1–Т12). The same readings as the web's
// (web/src/api/tables.ts classWord/setWord, web/src/locales/duration.ts,
// web/src/api/actions.ts refusalText), on the same dictionary lines: each is a
// key of depth/ink/locales in all seventeen languages. An id the dictionary
// has no word for shows as itself, a code with no phrase shows the generic
// line — never an English sentence of the node, never an HTTP number.

import type { Say } from "./strings.ts";

// A span of minutes as a person says it: 260 → «4 ч 20 мин», 60 → «1 ч», 45 →
// «45 мин». The units are "duration.h" and "duration.min", which take no plural
// form in any of the seventeen languages.
export function duration(say: Say, minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(say("duration.h", { n: hours }));
  if (rest > 0 || hours === 0) parts.push(say("duration.min", { n: rest }));
  return parts.join(" ");
}

// A span of seconds, the same way: 298 → «4 мин 58 с», 45 → «45 с», 3600 → «1 ч».
export function durationSeconds(say: Say, seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(duration(say, minutes));
  if (rest > 0 || minutes === 0) parts.push(`${rest} ${say("table.seconds")}`);
  return parts.join(" ");
}

const word = (say: Say, key: string, id: string): string => {
  const text = say(key);
  return text === key ? id : text;
};

// The class of a table by its dictionary name («точки»), never its id («dots»).
export const classWord = (say: Say, klass: string): string => word(say, `class.${klass}`, klass);

// The set by its name («поле 3×3»), never its id («3x3»).
export function setWord(say: Say, set: string): string {
  const square = /^(\d+)x\1$/.exec(set);
  if (square) return say("set.field", { n: square[1] });
  return word(say, `set.${set}`, set);
}

// «класс · набор» — a set that is its own class (chess in a game of «checkers
// and chess») is said once.
export function gameWords(say: Say, klass: string | undefined, set: string | undefined): string {
  return [klass ? classWord(say, klass) : "", set ? setWord(say, set) : ""].filter(Boolean).join(" · ");
}

// The circle's radius in words: 300 → «300 м», 3000 → «3 км».
export const radiusWord = (say: Say, meters: number): string =>
  meters >= 1000 ? say("feed.km", { n: meters / 1000 }) : say("feed.m", { n: meters });

export type RefusalKind = "phrase" | "name" | "like" | "table";
// What a table call was for: only a player proposes, answers or resigns; only a
// watcher applies (relay routes/tables.ts answers both with 409 `refused`).
export type TableAction = "play" | "apply" | "other";

// A refusal as one line in the interface's words (the same rule as the web's
// refusalText, quorum 2/2 on 2026-10-10): a phrase of the dictionary for each
// code the node gives; the node's free text (error.message, error.reason —
// English, or the model's own) is never shown, and a status is never a word.
export function refusalWords(
  say: Say,
  answer: { status: number; body: unknown },
  kind: RefusalKind,
  action: TableAction = "other",
): string {
  const error = (answer.body as { error?: { code?: string } } | null)?.error;
  const code = typeof error?.code === "string" ? error.code : undefined;
  if (code === "moderation_refused") return say("refuse.phrase");
  if (code === "name_refused") return say("refuse.name");
  if (code === "stepped_away") return say("away.line");
  if (code === "rate_limited" || answer.status === 429) return say("write.rapid");
  if (kind === "like" && answer.status === 409) return say("refuse.likeNeedsPhrase");
  if (code === "not_your_turn") return say("table.notYourTurn");
  if (code === "stale_seq") return say("table.stale");
  if (code === "illegal_move") return say("refuse.illegalMove");
  if (kind === "table" && code === "refused") return say(action === "apply" ? "refuse.applyOnce" : "refuse.onlyPlayer");
  return say("refuse.generic");
}
