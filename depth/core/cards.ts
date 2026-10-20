// Playing cards as the node writes them (relay/node/src/lib/tables_deck.ts, tables_poker.ts): rank then suit, "6H", "10S",
// "QD", "AC"; shared by both faces' boards.

export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];
export const isRed = (suit: Suit): boolean => suit === "H" || suit === "D";

/** The rank ("6".."10", "J".."A") and the suit of a card; null for a string that is no card. */
export function cardParts(card: string): { rank: string; suit: Suit } | null {
  const m = /^(10|[2-9TJQKA])([SHDC])$/.exec(card);
  return m ? { rank: m[1] === "T" ? "10" : m[1], suit: m[2] as Suit } : null;
}
