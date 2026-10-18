// Durak's table (sheet w3_table-durak): where each card stands. All numbers are the sheet's, in px of its 356.18-wide panel
// measured from the panel's top left; the board scales them with the panel's width (cqw, see tables.css). A card is a centre,
// a size and a turn in degrees (clockwise); the sheet's fans and pairs are read off its card boxes (the fans turn about each
// card's own centre).
import type { DeckState, DurakPair } from "../../../../depth/core/tables_deck.ts";

import { BACK, FACE, type Placed, STOCK } from "./cards-logic.ts";

const PANEL_H = 320.36;
const OPP_ROW = 70;       // one more opponent's fan under the first
const PAIR_PITCH = 109.45;
const PAIR_ROW = 106;     // the second row of pairs under the first
const PAIRS_PER_ROW = 3;

/** An opponent's fan of backs: spaced 25.87 apart from the left, each turned 5° more than the one before, about the middle. */
export function oppFan(count: number, row = 0): Placed[] {
  const space = count > 1 ? Math.min(25.87, (225 - 62.68) / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => ({ x: 62.68 + space * i, y: 47.94 + OPP_ROW * row, ...BACK, r: (i - (count - 1) / 2) * 5 }));
}

/** The stock's back (when cards are left) and the trump card lying sideways, a quarter turn, in front of it. */
export const stockAt = (): Placed => ({ x: 281.56, y: 64.66, ...STOCK, r: 0 });
export const trumpAt = (): Placed => ({ x: 299.46, y: 56.7, ...STOCK, r: 90 });

/** The pairs on the table: an attack card turned 5°, the card that beats it over it, down and to the right, turned 15°; three pairs to a row. */
export function pairSlots(pairs: DurakPair[], oppRows: number): Array<{ attack: Placed; beat: Placed | null }> {
  const extra = OPP_ROW * Math.max(0, oppRows - 1);
  return pairs.map((p, i) => {
    const c = i % PAIRS_PER_ROW, r = Math.floor(i / PAIRS_PER_ROW);
    const x = 97.5 + PAIR_PITCH * c, y = 158.4 + PAIR_ROW * r + extra;
    return { attack: { x, y, ...FACE, r: 4.96 }, beat: p.beat === null ? null : { x: x + 13.95, y: y + 15.9, ...FACE, r: 15.43 } };
  });
}

/** My hand in a fan along the bottom: touching cards, the angle growing by 5.24° a card with a gap of 4.97° each side of the middle; a hand over six narrows. */
export function handFan(count: number, shift = 0): Placed[] {
  const mid = (count - 1) / 2;
  const step = count <= 6 ? 5.24 : 31.44 / count;
  const space = Math.min(49.8, 300 / Math.max(count, 1));
  return Array.from({ length: count }, (_, j) => {
    const d = j - mid;
    const r = step * d + Math.sign(d) * 4.97;
    return { x: 176.1 + d * space, y: 266 + 0.764 * (Math.abs(r) - 7.59) + shift, ...FACE, r };
  });
}

/** The height of the whole table panel for this many pairs and opponents. */
export function panelHeight(pairCount: number, oppRows: number): number {
  const rows = Math.max(1, Math.ceil(pairCount / PAIRS_PER_ROW));
  return PANEL_H + PAIR_ROW * (rows - 1) + OPP_ROW * Math.max(0, oppRows - 1);
}
/** How far the hand sits lower than on the sheet: a second row of pairs and more opponents push it down. */
export const handShift = (pairCount: number, oppRows: number): number => panelHeight(pairCount, oppRows) - PANEL_H;

export type DurakView = {
  opps: Array<{ seat: number; count: number }>;
  hand: string[];
  pairs: DurakPair[];
  stock: number;
  trump: string | null;
};
/** What the table draws for a seat: the others' hand sizes (in seat order), my cards, the pairs, the stock, the trump. */
export function durakView(d: DeckState, seat: number): DurakView {
  const mine = d.hands[String(seat)];
  const opps = Object.entries(d.hands).filter(([s]) => Number(s) !== seat).map(([s, h]) => ({ seat: Number(s), count: Array.isArray(h) ? h.length : h.count })).sort((a, b) => a.seat - b.seat);
  return { opps, hand: Array.isArray(mine) ? mine : [], pairs: d.table ?? [], stock: d.stock.count, trump: d.trump ?? null };
}
