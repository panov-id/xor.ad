// The rules of registration, as the person meets them (chat spec §8.2; web
// screen 02, the app's register-1..3): what the name and the age must be, what
// stops "next" and which reason is said first, what a PIN pair must be, how the
// two groups of the paper code typed back are laid out and compared, and what a
// node's refusal means. No React, no DOM, no words: a rule answers with a code
// (`name`, `young`, `pin_differ` …), and each face says it in its own
// language — web/src/locales "web.register.why_<code>". Imports nothing that
// needs a package, so a face's unit tests run it as it is.
import { graphemeCount } from "./limits.ts";
import { readPaperText } from "./paper_text.ts";

export const NAME_MAX = 24;
export const AGE_MIN = 13;
export const AGE_DIGITS = 3;
export const PIN_LENGTH = 6;
/** One group of the paper code is four characters, and the code has four groups. */
export const CODE_GROUP = 4;
export const CODE_GROUPS = 4;

/** What a person may type in the age field: digits, at most three. */
export const ageDigits = (raw: string): string => raw.replace(/\D/g, "").slice(0, AGE_DIGITS);

/** A PIN field takes digits only, six at most (a paste is read whole). */
export const pinDigits = (raw: string): string => raw.replace(/\D/g, "").slice(0, PIN_LENGTH);

/** A given age under the minimum: said under its own field, apart from "next". */
export const isYoung = (age: string): boolean => age !== "" && Number(age) < AGE_MIN;

/** The letters still free in the name, as the node counts them (graphemes). */
export const lettersLeft = (name: string): number => Math.max(0, NAME_MAX - graphemeCount(name));

export type WhyNext = "name" | "age" | "young" | "consent";
/** Step one: the first thing missing before "next" opens, or null when nothing is. */
export function whyNext(f: { name: string; age: string; consent: boolean }): WhyNext | null {
  const age = Number(f.age);
  if (f.name.trim().length === 0 || graphemeCount(f.name) > NAME_MAX) return "name";
  if (f.age === "" || !Number.isInteger(age)) return "age";
  if (isYoung(f.age)) return "young";
  if (!f.consent) return "consent";
  return null;
}

const full = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
export const pinsMatch = (pin: string, again: string): boolean => full(pin) && pin === again;
/** Both full and different: said on the second field. */
export const pinsDiffer = (pin: string, again: string): boolean => full(pin) && full(again) && pin !== again;

export type WhyPin = "pin" | "pin_differ";
/** Step two: why "create" stays shut. Both full and different says so; anything less is the general line. */
export function whyPin(pin: string, again: string): WhyPin | null {
  if (pinsMatch(pin, again)) return null;
  return pinsDiffer(pin, again) ? "pin_differ" : "pin";
}

/**
 * Step three: the second and fourth groups are both given, or the reason. The web opens "done" once both
 * hold anything and says "the groups do not match" on a press; `complete` (the app's sheet draws "done"
 * dimmed until the last cell is filled) waits for all four characters of each.
 */
export const whyGroups = (second: string, fourth: string, complete = false): "groups" | null =>
  (complete ? cleanGroup(second).length === CODE_GROUP && cleanGroup(fourth).length === CODE_GROUP : second && fourth) ? null : "groups";

/** The typed second and fourth groups against the code's groups, read as depth/core/paper.ts reads a code. */
export const groupsMatch = (groups: readonly string[], second: string, fourth: string): boolean =>
  readPaperText(second) === groups[1] && readPaperText(fourth) === groups[3];

/** A typed or pasted piece reduced to what a group may hold: read as a paper code, digits and capitals only. */
export const cleanGroup = (raw: string): string => readPaperText(raw).replace(/[^0-9A-Z]/g, "");

/**
 * The shown groups after `raw` was typed or pasted into the group at `index`
 * (`places` are the groups' places on the paper, [2, 4] for the two asked):
 * one group's worth or less goes into that group, and the group's fourth
 * character moves on to the next; a whole code pasted anywhere is laid out over
 * the shown groups by their place on the paper; anything else fills on from
 * `index`. `focus` is the group to put the caret in, or null to stay.
 */
export function layOutGroups(value: readonly string[], index: number, raw: string, places: readonly number[]): { next: string[]; focus: number | null } {
  const text = cleanGroup(raw);
  const next = [...value];
  if (text.length <= CODE_GROUP) {
    next[index] = text;
    return { next, focus: text.length === CODE_GROUP && index < places.length - 1 ? index + 1 : null };
  }
  let last = index;
  if (text.length === CODE_GROUP * CODE_GROUPS) {
    places.forEach((place, i) => { next[i] = text.slice((place - 1) * CODE_GROUP, place * CODE_GROUP); });
    last = places.length - 1;
  } else {
    for (let i = index; i < places.length; i++) {
      const chunk = text.slice((i - index) * CODE_GROUP, (i - index + 1) * CODE_GROUP);
      if (!chunk) break;
      next[i] = chunk;
      last = i;
    }
  }
  return { next, focus: last };
}

export type Refusal = { kind: "limit" } | { kind: "refused"; status: string } | { kind: "failed" };
/**
 * What the node's refusal means to the person: the address limit (429) says what
 * happened and what to do; any other status says its number; a call that never
 * got an answer (offline, a dropped connection) and anything else say that it
 * did not work. The core's message is "registration refused: <status> …"
 * (client.ts register).
 */
export function refusalOf(e: unknown): Refusal {
  const status = /registration refused: (\d{3})/.exec(e instanceof Error ? e.message : "")?.[1];
  if (status === "429") return { kind: "limit" };
  if (status) return { kind: "refused", status };
  return { kind: "failed" };
}
