// One's own span of a conversation (chat spec §8.6): the four values the node
// keeps, the end as the screen counts it, and the silence counter that lives
// in the last quarter of one's own span. The node sends nothing while the
// clock runs — the inbox row gives chat_expires_at (one's own last message or
// the chat's birth, plus one's own span) and my_span; the page counts from
// there, as depth/ink/rooms.ts does. The other side's span is never known.

export const SPANS = [10, 30, 60, 260] as const;
export type Span = (typeof SPANS)[number];

export const isSpan = (n: unknown): n is Span => typeof n === "number" && (SPANS as readonly number[]).includes(n);

// What the node reported, or an hour: a string, a 0 or a NaN would hide the
// end or paint it red at once (security lens, 23.09.2026).
export function spanOf(given: unknown): Span {
  return isSpan(given) ? given : 60;
}

export function endsAtOf(given: unknown, span: Span, nowSeconds: number): number {
  return typeof given === "number" && Number.isFinite(given) && given > 0 ? given : nowSeconds + span * 60;
}

// A new span moves the end from the same last own message: the start stays,
// the length changes.
export function shiftEnd(endsAt: number, from: Span, to: Span): number {
  return endsAt - from * 60 + to * 60;
}

// My own message is what resets my silence (§8.6): a fresh end from now.
export const resetEnd = (span: Span, nowSeconds: number): number => nowSeconds + span * 60;

// The counter: shown only once the silence has reached a quarter of the span;
// `left` is what remains until the end, never negative.
export function silence(endsAt: number, span: Span, nowSeconds: number): { left: number; counting: boolean; clock: string } {
  const left = Math.max(0, Math.floor(endsAt - nowSeconds));
  const counting = left <= (span * 60) / 4;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return { left, counting, clock };
}
