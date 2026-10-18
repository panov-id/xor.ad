// Durak as the node deals it (relay/node/src/lib/tables_deck.ts deckFor, state key `deck`): my hand whole, the others' as
// a number, the stock as a number, the face-up trump card (or just its suit with the stock gone), the pairs on the table and
// who attacks and who defends. A move is {play: card}, {take: true}, {done: true} or, in perevodnoy, {transfer: card}. The
// node keeps every rule; this says only what a seat may be offered, for both faces' boards.

export type HandData = string[] | { count: number };
export interface DurakPair { attack: string; beat: string | null }
export interface DeckState {
  hands: Record<string, HandData>;
  stock: { count: number };
  played: string[];
  trump?: string | null;
  table?: DurakPair[];
  attacker?: number | null;
  defender?: number | null;
  thrower?: number | null;
  /** perevodnoy: the defender may pass an unbeaten attack on with a card of its rank */
  transfer?: boolean;
}

export function deckOf(state: Record<string, unknown> | null | undefined): DeckState | null {
  const d = state?.deck as DeckState | undefined;
  return d && typeof d === "object" && d.hands && d.stock ? d : null;
}

export const handCount = (h: HandData | undefined): number => (Array.isArray(h) ? h.length : h?.count ?? 0);
/** Durak (not the old generic deck): a trump and a table. */
export const isDurak = (d: DeckState): boolean => typeof d.trump === "string" && Array.isArray(d.table);

/**
 * What a seat in turn may be offered besides playing a card from its hand: take (the defender with something on the table),
 * transfer (perevodnoy, nothing beaten yet: the lowest non-trump card of the led rank), done (whoever holds the window to
 * throw in, everything beaten).
 */
export function durakActions(d: DeckState, seat: number, myTurn: boolean): { take: boolean; transfer: string | undefined; done: boolean } {
  const pairs = d.table ?? [];
  const mine = d.hands[String(seat)];
  const trump = d.trump ?? "";
  const show = myTurn && isDurak(d) && pairs.length > 0;
  const rank = (c: string) => c.slice(0, -1);
  const transfer = show && d.transfer === true && d.defender === seat && pairs.every((p) => p.beat === null) && Array.isArray(mine)
    ? [...mine].filter((c) => rank(c) === rank(pairs[0].attack)).sort((a, b) => Number(a.slice(-1) === trump.slice(-1)) - Number(b.slice(-1) === trump.slice(-1)))[0]
    : undefined;
  return {
    take: show && d.defender === seat,
    transfer,
    done: show && (d.thrower ?? d.attacker) === seat && pairs.every((p) => p.beat !== null),
  };
}
