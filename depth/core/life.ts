// What is left of a phrase in a match, for both faces' inbox rows and the
// web's match screen alike (sheets 23 and 24). The node tells the other's end to its match
// partner only (relay routes/inbox.ts, §8.11), and that end is never printed
// as a number (decision 19.09.2026): the other's phrase is a bar, and in its
// last fifth the word «скоро исчезнет». One's own phrase may say its minutes.

// A phrase lives 4 h 20 min in the feed (limits feed.phrase.span; relay
// lib/feed_verdict.ts PHRASE_SPAN): the bar is the share of that left.
export const PHRASE_LIFE_SECONDS = (4 * 60 + 20) * 60;

export interface Life {
  // Share of the phrase's life still ahead, 0…1.
  left: number;
  // In its last fifth, as the conversations' «скоро» is (inbox.ts ENDING_SOON).
  soon: boolean;
  // Whole minutes ahead, rounded up: 0 only once the end has come.
  minutes: number;
}

// No end — the phrase has left the feed — no life to show.
export function lifeOf(end: number | undefined, nowSeconds = Date.now() / 1000): Life | null {
  if (end === undefined || !Number.isFinite(end)) return null;
  const ahead = Math.max(0, end - nowSeconds);
  const left = Math.min(1, ahead / PHRASE_LIFE_SECONDS);
  return { left, soon: left <= 0.2, minutes: Math.ceil(ahead / 60) };
}
