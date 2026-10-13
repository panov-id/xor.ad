// Texas hold'em — the deck class's set "poker" (owner, 13.10.2026). Chips
// only: no money anywhere, no buy-ins, no rebuys; every seat starts with the
// same stack and the blinds never grow. 2–6 seats, 52 cards. The node shuffles
// and deals, keeps the betting, splits the pots and finds the hands at the
// showdown; the game is over when one seat holds every chip, and that seat
// scores a point.
//
// A move is one action of the seat the node names: {fold: true}, {check: true},
// {call: true}, {raise: N} — N the seat's whole bet on this street after the
// raise (a bet when nothing is bet yet) — or {allin: true}. A raise is at least
// the last full raise (the big blind at first) unless it is all the seat has;
// a short all-in does not count as a full raise. A turn let run out checks when
// it can and folds otherwise.
//
// Hidden (§6.1, cut in pokerFor): the stock, always; the two cards of a hand
// but to their own seat. At a showdown the hands still in are shown in `last`,
// as they are turned over at a real table; a hand that folded is never shown.

export const START_CHIPS = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

const RANKS = "23456789TJQKA";
const SUITS = "SHDC";
const value = (card: string) => RANKS.indexOf(card[0]) + 2;

export interface Poker {
  chips: Record<string, number>;
  button: number;
  hand: number;
  stock: string[];
  holes: Record<string, string[]>;
  board: string[];
  street: "preflop" | "flop" | "turn" | "river";
  bets: Record<string, number>; // this street
  put: Record<string, number>; // this hand, all streets
  dealt: number[]; // the seats in this hand, in seat order
  folded: number[];
  acted: number[];
  current: number; // the highest bet of this street
  raise: number; // the last full raise
  to_act: number;
  last: { hand: number; board: string[]; shown: Record<string, string[]>; won: Record<string, number> } | null;
  winner: number | null;
}

function shuffled(): string[] {
  const cards = [...SUITS].flatMap((s) => [...RANKS].map((r) => `${r}${s}`));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// The seats of `ring` after `from`, going round once, `from` last.
function round(ring: number[], from: number): number[] {
  const at = ring.indexOf(from);
  if (at < 0) {
    const later = ring.filter((s) => s > from);
    return [...later, ...ring.filter((s) => s <= from)];
  }
  return [...ring.slice(at + 1), ...ring.slice(0, at + 1)];
}

const canAct = (p: Poker, s: number) => p.dealt.includes(s) && !p.folded.includes(s) && p.chips[s] > 0;
const needs = (p: Poker, s: number) => canAct(p, s) && (!p.acted.includes(s) || p.bets[s] < p.current);

function post(p: Poker, seat: number, amount: number) {
  const paid = Math.min(amount, p.chips[seat]);
  p.chips[seat] -= paid;
  p.bets[seat] += paid;
  p.put[seat] += paid;
}

function startHand(p: Poker, live: number[]) {
  const seats = live.filter((s) => p.chips[s] > 0).sort((a, b) => a - b);
  p.hand += 1;
  if (p.hand > 1) p.button = round(seats, p.button)[0];
  else p.button = seats[0];
  p.stock = shuffled();
  p.dealt = seats;
  p.holes = Object.fromEntries(seats.map((s) => [String(s), p.stock.splice(0, 2)]));
  p.board = [];
  p.street = "preflop";
  p.bets = Object.fromEntries(seats.map((s) => [String(s), 0]));
  p.put = { ...p.bets };
  p.folded = [];
  p.acted = [];
  // Heads-up the button posts the small blind and acts first before the flop.
  const order = round(seats, p.button);
  const small = seats.length === 2 ? p.button : order[0];
  const big = round(seats, small)[0];
  post(p, small, SMALL_BLIND);
  post(p, big, BIG_BLIND);
  p.current = Math.max(...seats.map((s) => p.bets[s]));
  p.raise = BIG_BLIND;
  const first = round(seats, big).find((s) => needs(p, s));
  if (first === undefined) return settle(p, live);
  p.to_act = first;
}

export function newPoker(seats: number[]): Poker {
  const p: Poker = {
    chips: Object.fromEntries(seats.map((s) => [String(s), START_CHIPS])),
    button: seats[0],
    hand: 0,
    stock: [],
    holes: {},
    board: [],
    street: "preflop",
    bets: {},
    put: {},
    dealt: [],
    folded: [],
    acted: [],
    current: 0,
    raise: BIG_BLIND,
    to_act: seats[0],
    last: null,
    winner: null,
  };
  startHand(p, seats);
  return p;
}

// --- hands -----------------------------------------------------------------

// A five-card hand as a comparable list: category first, then the ranks that
// break ties.
function rank5(cards: string[]): number[] {
  const vs = cards.map(value).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const unique = [...new Set(vs)];
  let straight = 0;
  if (unique.length === 5 && vs[0] - vs[4] === 4) straight = vs[0];
  if (unique.join() === "14,5,4,3,2") straight = 5;
  const counts = unique.map((v) => [vs.filter((x) => x === v).length, v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const byCount = counts.map(([, v]) => v);
  if (straight && flush) return [8, straight];
  if (counts[0][0] === 4) return [7, ...byCount];
  if (counts[0][0] === 3 && counts[1][0] === 2) return [6, ...byCount];
  if (flush) return [5, ...vs];
  if (straight) return [4, straight];
  if (counts[0][0] === 3) return [3, ...byCount];
  if (counts[0][0] === 2 && counts[1][0] === 2) return [2, ...byCount];
  if (counts[0][0] === 2) return [1, ...byCount];
  return [0, ...vs];
}

export function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// The best five of seven.
export function best(cards: string[]): number[] {
  if (cards.length !== 7) return rank5(cards.slice(0, 5));
  let top: number[] = [-1];
  for (let a = 0; a < 7; a++) {
    for (let b = a + 1; b < 7; b++) {
      const r = rank5(cards.filter((_, i) => i !== a && i !== b));
      if (compare(r, top) > 0) top = r;
    }
  }
  return top;
}

// --- the end of a hand -----------------------------------------------------

function settle(p: Poker, live: number[]) {
  const contenders = p.dealt.filter((s) => !p.folded.includes(s));
  const showdown = contenders.length > 1;
  if (showdown) while (p.board.length < 5) p.board.push(p.stock.shift()!);
  const strength = Object.fromEntries(contenders.map((s) => [s, showdown ? best([...p.holes[s], ...p.board]) : [0]]));
  const won: Record<string, number> = {};
  const left: Record<string, number> = { ...p.put };
  const total = () => Object.values(left).reduce((a, b) => a + b, 0);
  const afterButton = round(p.dealt, p.button);
  while (total() > 0) {
    const eligible = contenders.filter((s) => left[s] > 0);
    if (eligible.length === 0) {
      // Money no contender matched goes back to whoever put it in.
      for (const s of Object.keys(left)) if (left[s] > 0) won[s] = (won[s] ?? 0) + left[s];
      break;
    }
    const level = Math.min(...eligible.map((s) => left[s]));
    let pot = 0;
    for (const s of Object.keys(left)) {
      const part = Math.min(left[s], level);
      left[s] -= part;
      pot += part;
    }
    const top = eligible.reduce((a, s) => (compare(strength[s], a) > 0 ? strength[s] : a), [-1] as number[]);
    const winners = afterButton.filter((s) => eligible.includes(s) && compare(strength[s], top) === 0);
    const share = Math.floor(pot / winners.length);
    winners.forEach((s, i) => (won[s] = (won[s] ?? 0) + share + (i < pot - share * winners.length ? 1 : 0)));
  }
  for (const [s, amount] of Object.entries(won)) p.chips[s] += amount;
  p.last = {
    hand: p.hand,
    board: [...p.board],
    shown: showdown ? Object.fromEntries(contenders.map((s) => [String(s), [...p.holes[s]]])) : {},
    won,
  };
  const standing = live.filter((s) => p.chips[s] > 0);
  if (standing.length <= 1) {
    p.winner = standing[0] ?? null;
    p.holes = {};
    p.stock = [];
    return;
  }
  startHand(p, live);
}

function nextStreet(p: Poker, live: number[]) {
  const acting = p.dealt.filter((s) => canAct(p, s));
  if (p.street === "river" || acting.length <= 1) return settle(p, live);
  p.street = p.street === "preflop" ? "flop" : p.street === "flop" ? "turn" : "river";
  p.board.push(...p.stock.splice(0, p.street === "flop" ? 3 : 1));
  for (const s of p.dealt) p.bets[s] = 0;
  p.current = 0;
  p.raise = BIG_BLIND;
  p.acted = [];
  p.to_act = round(p.dealt, p.button).find((s) => canAct(p, s))!;
}

function afterAction(p: Poker, seat: number, live: number[]) {
  const contenders = p.dealt.filter((s) => !p.folded.includes(s));
  if (contenders.length === 1) return settle(p, live);
  const acting = p.dealt.filter((s) => canAct(p, s));
  const lone = acting.length === 1 && p.bets[acting[0]] >= p.current;
  const next = round(p.dealt, seat).find((s) => needs(p, s));
  if (next === undefined || acting.length === 0 || lone) {
    // Nobody left to answer: the street is over, perhaps the hand.
    nextStreet(p, live);
    while (p.winner === null && p.street !== "preflop" && !p.dealt.some((s) => needs(p, s))) nextStreet(p, live);
    return;
  }
  p.to_act = next;
}

export type PokerResult = { refused: string } | { over: boolean; next: number; winner: number | null };

export function playPoker(p: Poker, move: unknown, seat: number, live: number[]): PokerResult {
  if (p.winner !== null) return { refused: "the game is over" };
  // A seat that left the table folds where it stood.
  for (const s of p.dealt) if (!live.includes(s) && !p.folded.includes(s)) p.folded.push(s);
  if (seat !== p.to_act) return { refused: "it is another seat's turn in the hand" };
  const m = (typeof move === "object" && move !== null ? move : {}) as Record<string, unknown>;
  const owe = p.current - p.bets[seat];
  if (m.fold === true) {
    p.folded.push(seat);
  } else if (m.check === true) {
    if (owe > 0) return { refused: `there is ${owe} to call` };
  } else if (m.call === true) {
    if (owe <= 0) return { refused: "nothing to call; check" };
    post(p, seat, owe);
  } else if (m.raise !== undefined || m.allin === true) {
    const to = m.allin === true ? p.bets[seat] + p.chips[seat] : m.raise;
    if (typeof to !== "number" || !Number.isInteger(to)) return { refused: "a raise is {raise: whole chips}" };
    const allIn = to === p.bets[seat] + p.chips[seat];
    if (to > p.bets[seat] + p.chips[seat]) return { refused: "you have not that many chips" };
    if (to <= p.current && !allIn) return { refused: `a raise is more than ${p.current}` };
    if (to - p.current < p.raise && !allIn) return { refused: `a raise is at least ${p.current + p.raise}` };
    if (to - p.current >= p.raise) {
      p.raise = to - p.current;
      p.acted = [];
    }
    post(p, seat, to - p.bets[seat]);
    p.current = Math.max(p.current, p.bets[seat]);
  } else {
    return { refused: "a move is {fold}, {check}, {call}, {raise: N} or {allin}" };
  }
  p.acted.push(seat);
  afterAction(p, seat, live);
  return { over: p.winner !== null, next: p.winner !== null ? seat : p.to_act, winner: p.winner };
}

// A turn let run out: check when nothing is owed, fold otherwise.
export function passPoker(p: Poker, seat: number, live: number[]): PokerResult | null {
  if (p.winner !== null || seat !== p.to_act) return null;
  return playPoker(p, p.current > p.bets[seat] ? { fold: true } : { check: true }, seat, live);
}

// The stock never; a hand's two cards to its own seat only, the others' as a
// count; everything else at the table is public.
export function pokerFor(p: Poker, viewer: number | null) {
  const holes: Record<string, string[] | { count: number }> = {};
  for (const [seat, cards] of Object.entries(p.holes)) {
    holes[seat] = String(viewer) === seat ? [...cards] : { count: cards.length };
  }
  return {
    chips: p.chips,
    blinds: [SMALL_BLIND, BIG_BLIND],
    button: p.button,
    hand: p.hand,
    street: p.street,
    board: p.board,
    holes,
    bets: p.bets,
    pot: Object.values(p.put).reduce((a, b) => a + b, 0),
    current: p.current,
    min_raise: p.current + p.raise,
    folded: p.folded,
    to_act: p.winner === null ? p.to_act : null,
    stock: { count: p.stock.length },
    last: p.last,
    winner: p.winner,
  };
}
