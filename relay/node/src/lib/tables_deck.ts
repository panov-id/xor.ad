// The deck-and-hand class (chat spec §6: "whose turn, that the card is from
// the hand, the end of the deal, the score by deals won"; the rules of beating
// stay with the people — there are too many variants). The node shuffles and
// deals (§6: "shuffling is the node's, and it sees the deal"), and the board
// it hands out carries one's own hand and only the size of the others' and of
// the stock (§6.1, "your own hand, the backs of others'").
//
// 36 cards, "6".."A" of S H D C; six each. A move plays a card from one's hand
// ({play: "QS"}) or draws from the stock ({draw: true}); whoever empties their
// hand wins the deal, and the game is over.

export interface Deck {
  stock: string[];
  hands: Record<string, string[]>;
  played: string[];
}

const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["S", "H", "D", "C"];

export function newDeck(seats: number[]): Deck {
  const cards = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`));
  // Fisher–Yates with the platform's CSPRNG: an honest shuffle is the reason
  // the node shuffles at all (§6).
  for (let i = cards.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  const hands: Record<string, string[]> = {};
  for (const seat of seats) hands[seat] = cards.splice(0, 6);
  return { stock: cards, hands, played: [] };
}

export type DeckResult = { refused: string } | { won: boolean };

export function playDeck(deck: Deck, move: unknown, seat: number): DeckResult {
  const hand = deck.hands[seat];
  if (!hand) return { refused: "no hand at this seat" };
  const m = (typeof move === "object" && move !== null ? move : {}) as { play?: unknown; draw?: unknown };
  if (m.draw === true) {
    const card = deck.stock.shift();
    if (!card) return { refused: "the stock is empty" };
    hand.push(card);
    return { won: false };
  }
  if (typeof m.play !== "string") return { refused: "a move is {play: card} or {draw: true}" };
  const at = hand.indexOf(m.play);
  if (at < 0) return { refused: "the card is not in your hand" };
  hand.splice(at, 1);
  deck.played.push(m.play);
  return { won: hand.length === 0 };
}

// What one seat may see: its own hand, the others' sizes, the stock's size.
export function deckFor(deck: Deck, viewer: number | null) {
  const hands: Record<string, string[] | { count: number }> = {};
  for (const [seat, cards] of Object.entries(deck.hands)) {
    hands[seat] = String(viewer) === seat ? [...cards] : { count: cards.length };
  }
  return { hands, stock: { count: deck.stock.length }, played: deck.played };
}
