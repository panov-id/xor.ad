// Durak's table (prototype durak-turn): where each card stands. The prototype draws the table as a 120 x 110 picture; every
// number below is in its units, scaled by U to px of the 356.18-wide panel the board scales with (cqw, see kit.css). A card is
// a centre, a size and a turn in degrees (clockwise); the prototype turns the hand's cards and a beating card about the middle
// of their bottom edge, so their centres are worked out from that pivot.
import type { DeckState, DurakPair } from "../../../../depth/core/tables_deck.ts";

import { at, pivoted, type Placed, U } from "./cards-logic.ts";

const PANEL_H = 110;
const PAIR_PITCH = 26;
const PAIR_ROW = 26;      // the second row of pairs under the first
const PAIRS_PER_ROW = 3;
const FAN_SHOWN = 4;      // backs drawn per opponent; the count itself rides on data-count and the label
const FAN_STEP = 4;
const OPP_PITCH = 30;

/** Opponent i of n: a small fan of up to four upright backs 4 apart; the fans stand in one row along the top, 30 apart. */
export function oppFan(count: number, i = 0, n = 1): Placed[] {
  const shown = Math.min(count, FAN_SHOWN);
  const pitch = n > 1 ? Math.min(OPP_PITCH, (120 - 10 - FAN_STEP * (FAN_SHOWN - 1) - 8) / (n - 1)) : 0;
  const mid = 62 + pitch * (i - (n - 1) / 2);
  return Array.from({ length: shown }, (_, j) => at(mid + FAN_STEP * (j - (shown - 1) / 2), 10, 10, 14, 0));
}

/** The stock's back on the left, the trump lying a quarter turn under it, the count in a pill below. */
export const stockAt = (): Placed => at(17, 48, 14, 20, 0);
export const trumpAt = (): Placed => pivoted(13, 60, 14, 20, 90);
export const stockCountAt = (): Placed => at(15, 67, 18, 6, 0);

/** The pairs on the table: an upright attack card, the card that beats it turned 12° over it; three pairs to a row. */
export function pairSlots(pairs: DurakPair[]): Array<{ attack: Placed; beat: Placed | null }> {
  return pairs.map((p, i) => {
    const x = 41 + PAIR_PITCH * (i % PAIRS_PER_ROW), y = 40 + PAIR_ROW * Math.floor(i / PAIRS_PER_ROW);
    return { attack: at(x, y, 14, 20, 0), beat: p.beat === null ? null : pivoted(x + 5, y + 16, 14, 20, 12) };
  });
}

/** My hand in a fan along the bottom: 14 apart, 5° more a card about each bottom middle; a long hand narrows to fit the panel. */
export function handFan(count: number, shift = 0): Placed[] {
  const mid = (count - 1) / 2;
  const space = count > 1 ? Math.min(14, (120 - 2 * 9.5 - 15) / (count - 1)) : 0;
  const step = count > 1 ? Math.min(5, 30 / (count - 1)) : 0;
  return Array.from({ length: count }, (_, j) => pivoted(60.5 + space * (j - mid), 102 + shift / U, 15, 22, step * (j - mid)));
}

/** The height of the whole table panel for this many pairs, in px of the panel. */
export function panelHeight(pairCount: number): number {
  const rows = Math.max(1, Math.ceil(pairCount / PAIRS_PER_ROW));
  return (PANEL_H + PAIR_ROW * (rows - 1)) * U;
}
/** How far the hand sits lower than on the prototype: a second row of pairs pushes it down. */
export const handShift = (pairCount: number): number => panelHeight(pairCount) - PANEL_H * U;

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
