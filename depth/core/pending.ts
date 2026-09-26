// What the first to press "talk" writes before the second does (chat spec
// §8.5, the owner's decision of 2026-09-18, chat_RU.md:2131).
//
// The conversation opens for the first at once and waits for the second; the
// first may write, and the lines wait without a ✓. They wait **here, on the
// device**, and nowhere else: the conversation's key is born of both consents
// (§8.13), so before the second there is nothing to seal them with, and the
// node takes neither the lines nor the fact that there are any. On the
// second's consent they are sealed and go by ordinary delivery, in the order
// they were written.
//
// depth has no volume, so "the device" is this process: quitting drops the
// queue, as the spec says changing device does. The ceiling is the node's own
// for delivery, chat.pending.max (docs/facts/limits.tsv, 200 lines), and past
// it the oldest line goes **silently** (chat_RU.md:2373-2376): a refusal would
// be a signal of its own. The queue dies with the match — "not now" on either
// side, or the match running out (docs/facts/open.tsv chat.queue.ceiling).

export const PENDING_MAX = 200; // limits.tsv chat.pending.max

export class PendingQueue {
  #lines = new Map<string, string[]>();

  // A line for the match whose second has not agreed yet. Past the ceiling the
  // oldest line of that match leaves without a word.
  push(matchId: string, text: string): void {
    const lines = this.#lines.get(matchId) ?? [];
    lines.push(text);
    while (lines.length > PENDING_MAX) lines.shift();
    this.#lines.set(matchId, lines);
  }

  // The lines in the order they were written, still held.
  peek(matchId: string): readonly string[] {
    return this.#lines.get(matchId) ?? [];
  }

  size(matchId: string): number {
    return this.#lines.get(matchId)?.length ?? 0;
  }

  // The first `n` lines went out: they leave, the rest keep their order.
  sent(matchId: string, n: number): void {
    const lines = this.#lines.get(matchId);
    if (!lines) return;
    lines.splice(0, n);
    if (lines.length === 0) this.#lines.delete(matchId);
  }

  // "Not now", or the match ran out: the queue goes with it.
  drop(matchId: string): void {
    this.#lines.delete(matchId);
  }

  clear(): void {
    this.#lines.clear();
  }
}
