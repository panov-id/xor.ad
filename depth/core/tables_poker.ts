// Texas hold'em on chips as the node deals it (relay/node/src/lib/tables_poker.ts, state key `poker`): my two cards whole, the
// others' as a number, the board, the pot, each seat's stack and bet, who is to act. A move is {fold: true}, {check: true},
// {call: true}, {raise: N} (N the whole bet on this street after the raise) or {allin: true}; the node keeps every rule.
// This says what a seat may be offered, for both faces' boards.

export interface Poker {
  chips: Record<string, number>;
  button: number;
  hand: number;
  street: "preflop" | "flop" | "turn" | "river";
  board: string[];
  holes: Record<string, string[] | { count: number }>;
  bets: Record<string, number>;
  pot: number;
  current: number;
  min_raise: number;
  folded: number[];
  to_act: number | null;
  last: { hand: number; board: string[]; shown: Record<string, string[]>; won: Record<string, number> } | null;
}

export function pokerOf(state: Record<string, unknown> | null | undefined): Poker | null {
  const p = state?.poker as Poker | undefined;
  return p && typeof p === "object" && p.chips && p.bets && Array.isArray(p.board) ? p : null;
}

export type PokerSeat = { seat: number; chips: number; bet: number; folded: boolean; dealer: boolean; turn: boolean; mine: boolean };
export type PokerView = {
  /** The seats round the table, mine first when I play, then in the order of the deal. */
  seats: PokerSeat[];
  hole: string[] | null;
  /** Chips still owed to stay in; what a call costs (never more than my stack). */
  owe: number;
  toCall: number;
  acts: boolean;
  minRaise: number;
};

export function pokerView(p: Poker, seat: number, myTurn: boolean): PokerView {
  const ids = Object.keys(p.chips).map(Number).sort((a, b) => a - b);
  const at = ids.indexOf(seat);
  const round = at < 0 ? ids : [...ids.slice(at), ...ids.slice(0, at)];
  const hole = p.holes[String(seat)];
  const owe = Math.max(0, p.current - (p.bets[String(seat)] ?? 0));
  return {
    seats: round.map((s) => ({ seat: s, chips: p.chips[String(s)], bet: p.bets[String(s)] ?? 0, folded: p.folded.includes(s), dealer: p.button === s, turn: p.to_act === s, mine: s === seat })),
    hole: Array.isArray(hole) ? hole : null,
    owe,
    toCall: Math.min(owe, p.chips[String(seat)] ?? 0),
    acts: myTurn && p.to_act === seat,
    minRaise: p.min_raise,
  };
}
