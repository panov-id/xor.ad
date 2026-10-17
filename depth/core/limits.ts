// Limits and text counting shared by the web face and the Ink screens (one
// copy; before this each face carried its own).

// Away spans offered from "me", in minutes.
export const AWAY_MINUTES = { short: 20, hour: 60, long: 240 } as const;
export type AwaySpan = keyof typeof AWAY_MINUTES;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Graphemes as the node counts them (an emoji or a flag is one, not two UTF-16 units).
export const graphemeCount = (text: string): number => [...segmenter.segment(text)].length;

// The first `max` graphemes of `text`, never half of an emoji.
export const graphemes = (text: string, max: number): string =>
  [...segmenter.segment(text)].slice(0, max).map((s) => s.segment).join("");
