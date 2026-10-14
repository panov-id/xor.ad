// The deck-and-hand class. The node shuffles and deals (§6: "shuffling is the
// node's, and it sees the deal"), and the board it hands out carries one's own
// hand and only the size of the others' and of the stock (§6.1, "your own
// hand, the backs of others'"). Two games: durak on 36 cards, here, and Texas
// hold'em on 52, in lib/tables_poker.ts (set "poker").
//
// Durak (owner, 13.10.2026: every set but "poker" — "36", "durak36" — is
// durak, its rules kept by the node; before, the deck took any card from the
// hand). Podkidnoy for 2–6: 36 cards "6".."A" of S H D C, six each, the last
// card of the stock face up and its suit the trump. The first seat attacks
// first. The attacker leads {play: card}; the defender beats the oldest card
// not yet beaten with {play: card} — higher of its suit, or a trump on a plain
// card — or gives up with {take: true} and takes the table. Once everything is
// beaten the attacker throws in {play: card} of a rank already on the table, or
// ends the attack with {done: true} and the table goes to the discard. Never
// more cards unbeaten than the defender holds, never more than six attacks.
// After the round hands are filled to six from the stock, the attacker first,
// the defender last. A beaten-off defender attacks next; one who took is
// skipped. With the stock empty, an empty hand is out; the last one holding
// cards is the durak — the game is over, and each of the others scores a point.
// Only the main attacker throws in (others at the table wait their turn as
// attacker): turns at a table are one seat at a time.
//
// Perevodnoy (set "transfer", owner 14.10.2026: both durak variants in the
// alpha): the same, and while nothing on the table is beaten yet the defender
// may pass the attack on with {transfer: card} of the rank already led. The
// card joins the attacks, the next seat holding cards defends, and the one who
// passed it on becomes the attacker. The new defender must hold at least as
// many cards as lie unbeaten, never more than six attacks.

export interface Deck {
  stock: string[];
  hands: Record<string, string[]>;
  played: string[]; // the cards on the table now, in the order they came
  trump?: string; // the face-up card; its suit is trump
  table?: { attack: string; beat: string | null }[];
  attacker?: number;
  defender?: number;
  discard?: number;
  out?: number[]; // seats out of cards, in the order they went
  durak?: number | null;
  transfer?: boolean; // perevodnoy: the defender may pass the attack on
}

const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["S", "H", "D", "C"];

const suitOf = (card: string) => card.slice(-1);
const rankOf = (card: string) => RANKS.indexOf(card.slice(0, -1));

// Fisher–Yates with the platform's CSPRNG: an honest shuffle is the reason the
// node shuffles at all (§6).
export function shuffle(cards: string[]): string[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function newDeck(seats: number[], transfer = false): Deck {
  const cards = shuffle(SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`)));
  const hands: Record<string, string[]> = {};
  for (const seat of seats) hands[seat] = cards.splice(0, 6);
  // The bottom card of the stock lies face up; with six at the table the
  // stock is empty, and the node draws a suit rather than show a card of a hand.
  const trump = cards.length > 0 ? cards[cards.length - 1] : SUITS[crypto.getRandomValues(new Uint32Array(1))[0] % 4];
  return {
    stock: cards,
    hands,
    played: [],
    trump,
    table: [],
    attacker: seats[0],
    defender: seats[1],
    discard: 0,
    out: [],
    durak: null,
    ...(transfer ? { transfer: true } : {}),
  };
}

export type DeckResult = { refused: string } | { over: boolean; next: number; winners: number[] };

// Whether `card` beats `attack` with `trump` the trump suit.
export function beats(card: string, attack: string, trump: string): boolean {
  if (suitOf(card) === suitOf(attack)) return rankOf(card) > rankOf(attack);
  return suitOf(card) === trump && suitOf(attack) !== trump;
}

// The seats still holding cards (or able to draw), in order after `from`.
function after(deck: Deck, from: number, live: number[]): number[] {
  const at = live.indexOf(from);
  const ring = at < 0 ? live : [...live.slice(at + 1), ...live.slice(0, at + 1)];
  return ring.filter((s) => !(deck.out ?? []).includes(s));
}

// The round is over: fill the hands, see who is out, name the next pair.
function endRound(deck: Deck, took: boolean, live: number[]): DeckResult {
  const attacker = deck.attacker!;
  const defender = deck.defender!;
  const draw = [attacker, ...live.filter((s) => s !== attacker && s !== defender), defender];
  for (const seat of draw) {
    const hand = deck.hands[seat];
    if (!hand) continue;
    while (hand.length < 6 && deck.stock.length > 0) hand.push(deck.stock.shift()!);
  }
  deck.table = [];
  deck.played = [];
  if (deck.stock.length === 0) {
    for (const seat of live) {
      if ((deck.hands[seat]?.length ?? 0) === 0 && !deck.out!.includes(seat)) deck.out!.push(seat);
    }
  }
  const holding = live.filter((s) => !deck.out!.includes(s));
  if (holding.length <= 1) {
    deck.durak = holding[0] ?? null;
    return { over: true, next: attacker, winners: live.filter((s) => s !== deck.durak) };
  }
  // A beaten-off defender attacks next; one who took is passed over.
  const ring = after(deck, attacker, live);
  let next = took ? after(deck, defender, live)[0] : (holding.includes(defender) ? defender : ring[0]);
  if (next === undefined) next = holding[0];
  deck.attacker = next;
  deck.defender = after(deck, next, live).find((s) => s !== next) ?? next;
  return { over: false, next: deck.attacker, winners: [] };
}

export function playDeck(deck: Deck, move: unknown, seat: number, live: number[]): DeckResult {
  const hand = deck.hands[seat];
  if (!hand) return { refused: "no hand at this seat" };
  const table = deck.table!;
  const trump = suitOf(deck.trump!);
  const m = (typeof move === "object" && move !== null ? move : {}) as { play?: unknown; take?: unknown; done?: unknown; transfer?: unknown };
  const unbeaten = table.filter((p) => p.beat === null);
  if (seat === deck.defender) {
    if (m.take === true) {
      if (table.length === 0) return { refused: "there is nothing to take" };
      for (const p of table) hand.push(p.attack, ...(p.beat ? [p.beat] : []));
      return endRound(deck, true, live);
    }
    if (m.transfer !== undefined) {
      if (!deck.transfer) return { refused: "this table plays podkidnoy: no passing the attack on" };
      if (typeof m.transfer !== "string") return { refused: "pass the attack on with {transfer: card}" };
      const at = hand.indexOf(m.transfer);
      if (at < 0) return { refused: "the card is not in your hand" };
      if (table.length === 0) return { refused: "there is nothing to pass on" };
      if (table.some((p) => p.beat !== null)) return { refused: "a beaten attack cannot be passed on" };
      if (table.some((p) => rankOf(p.attack) !== rankOf(m.transfer as string))) {
        return { refused: "pass on only with the rank on the table" };
      }
      if (table.length >= 6) return { refused: "no more than six attacks a round" };
      const next = after(deck, seat, live).find((s) => s !== seat && (deck.hands[s]?.length ?? 0) > 0);
      if (next === undefined) return { refused: "there is no one to pass the attack on to" };
      if ((deck.hands[next]?.length ?? 0) < table.length + 1) return { refused: "the next seat has too few cards to beat it all" };
      hand.splice(at, 1);
      table.push({ attack: m.transfer, beat: null });
      deck.played.push(m.transfer);
      deck.attacker = seat;
      deck.defender = next;
      return { over: false, next, winners: [] };
    }
    if (typeof m.play !== "string") return { refused: "the defender moves {play: card} or {take: true}" };
    const at = hand.indexOf(m.play);
    if (at < 0) return { refused: "the card is not in your hand" };
    const target = unbeaten[0];
    if (!target) return { refused: "there is nothing to beat" };
    if (!beats(m.play, target.attack, trump)) return { refused: "the card does not beat the attack" };
    hand.splice(at, 1);
    target.beat = m.play;
    deck.played.push(m.play);
    // After a transfer more than one attack may lie unbeaten: the defender goes on.
    const left = table.some((p) => p.beat === null);
    return { over: false, next: left ? seat : deck.attacker!, winners: [] };
  }
  if (seat !== deck.attacker) return { refused: "only the attacker and the defender move" };
  if (m.done === true) {
    if (table.length === 0) return { refused: "lead a card first" };
    if (unbeaten.length > 0) return { refused: "the defender has not beaten everything yet" };
    deck.discard = (deck.discard ?? 0) + table.length * 2;
    return endRound(deck, false, live);
  }
  if (typeof m.play !== "string") return { refused: "the attacker moves {play: card} or {done: true}" };
  const at = hand.indexOf(m.play);
  if (at < 0) return { refused: "the card is not in your hand" };
  if (unbeaten.length > 0) return { refused: "wait for the defender" };
  if (table.length > 0) {
    const ranks = new Set(table.flatMap((p) => [p.attack, p.beat ?? p.attack]).map(rankOf));
    if (!ranks.has(rankOf(m.play))) return { refused: "throw in only a rank already on the table" };
  }
  if (table.length >= 6) return { refused: "no more than six attacks a round" };
  if ((deck.hands[deck.defender!]?.length ?? 0) < 1) return { refused: "the defender has no card left to beat with" };
  hand.splice(at, 1);
  table.push({ attack: m.play, beat: null });
  deck.played.push(m.play);
  return { over: false, next: deck.defender!, winners: [] };
}

// A turn let run out: the defender takes, an attacker with everything beaten
// ends the attack, and one to lead leads their lowest card.
export function passDeck(deck: Deck, seat: number, live: number[]): DeckResult | null {
  const table = deck.table ?? [];
  if (seat === deck.defender && table.length > 0) return playDeck(deck, { take: true }, seat, live);
  if (seat !== deck.attacker) return null;
  if (table.length > 0) return playDeck(deck, { done: true }, seat, live);
  const lowest = [...(deck.hands[seat] ?? [])].sort((a, b) => rankOf(a) - rankOf(b))[0];
  return lowest ? playDeck(deck, { play: lowest }, seat, live) : null;
}

// What one seat may see: its own hand, the others' sizes, the stock's size and
// its face-up trump; the table and the discard's size are public.
export function deckFor(deck: Deck, viewer: number | null) {
  const hands: Record<string, string[] | { count: number }> = {};
  for (const [seat, cards] of Object.entries(deck.hands)) {
    hands[seat] = String(viewer) === seat ? [...cards] : { count: cards.length };
  }
  return {
    hands,
    stock: { count: deck.stock.length },
    played: deck.played,
    trump: deck.trump ?? null,
    table: deck.table ?? [],
    attacker: deck.attacker ?? null,
    defender: deck.defender ?? null,
    discard: { count: deck.discard ?? 0 },
    out: deck.out ?? [],
    durak: deck.durak ?? null,
    transfer: deck.transfer === true,
  };
}
