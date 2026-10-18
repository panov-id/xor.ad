// Limits and text counting shared by the web face and the Ink screens (one
// copy; before this each face carried its own).

// Away spans offered from "me", in minutes.
export const AWAY_MINUTES = { short: 20, hour: 60, long: 240 } as const;
export type AwaySpan = keyof typeof AWAY_MINUTES;
// Their order on the screens (short, hour, long).
export const AWAY_ORDER: AwaySpan[] = ["short", "hour", "long"];

// The band the node lets an age filter move within (relay identities.ts; moved here from web AgeFilter.tsx on
// 18.10.2026, one copy for both faces): up to 20 it is age ± 2, from 13; from 21 the bottom is at most 21 and the
// top is open (null).
export function ageBand(age: number): { low: number; high: number | null } {
  if (age <= 20) return { low: Math.max(13, age - 2), high: age + 2 };
  return { low: Math.min(21, age - 2), high: null };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Graphemes as the node counts them (an emoji or a flag is one, not two UTF-16 units).
export const graphemeCount = (text: string): number => [...segmenter.segment(text)].length;

// The first `max` graphemes of `text`, never half of an emoji.
export const graphemes = (text: string, max: number): string =>
  [...segmenter.segment(text)].slice(0, max).map((s) => s.segment).join("");
