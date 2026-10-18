// Poker's table (sheet w3_table-poker): where the board's five cards and the seats' chips stand, in px of the sheet's panel
// (cards-logic.ts). The board is five slots 59.7 apart, a slot with no card yet shows a back; the seats are chip marks in two
// rows, mine at the bottom left, the rest round the table clockwise.
import { type Placed } from "./cards-logic.ts";

export const POKER_CARD = { w: 49.75, h: 69.64 };
export const POKER_H = 284.54;
export const CHIPS = { w: 39.79, h: 33.82 };
const SLOT_X = 35.81 + POKER_CARD.w / 2;
const SLOT_PITCH = 59.7;
const BOARD_Y = 86.75 + POKER_CARD.h / 2;

/** The five slots of the board: the cards dealt so far face up, the rest backs (card null). */
export function boardSlots(board: string[]): Array<{ card: string | null; at: Placed }> {
  return Array.from({ length: 5 }, (_, i) => ({ card: board[i] ?? null, at: { x: SLOT_X + SLOT_PITCH * i, y: BOARD_Y, ...POKER_CARD, r: 0 } }));
}

const BOTTOM_Y = 207.33, TOP_Y = 15.91;
const BOTTOM_X: Record<number, number[]> = { 1: [45.76], 2: [45.76, 222.86], 3: [45.76, 134.31, 222.86] };
const TOP_X: Record<number, number[]> = { 0: [], 1: [232.8], 2: [55.71, 232.8], 3: [55.71, 144.26, 232.8] };

/** The chip marks' left, top for n seats (2..6): the bottom row left to right, then the top row right to left. */
export function seatSlots(n: number): Array<{ x: number; y: number }> {
  const bottom = Math.min(3, Math.ceil(n / 2)), top = Math.min(3, Math.max(0, n - bottom));
  return [...BOTTOM_X[bottom].map((x) => ({ x, y: BOTTOM_Y })), ...[...TOP_X[top]].reverse().map((x) => ({ x, y: TOP_Y }))].slice(0, n);
}

/** The pot's number, centred under the board; y is the bottom of its line box (the sheet's baseline 182.06 stands 2.64 above it). */
export const POT_AT = { x: 155.33, y: 184.7 };
