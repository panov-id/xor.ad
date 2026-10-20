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

// The sheets w3_table-poker (four) and w3_table-poker-{2,3,5,6} (docs/newsdesign/ours, drawn out of the four by
// scripts/design/poker-seat-sheets.py): two rows at the sheet's ends, a middle place halfway for five and six.
// 2 and 3 are the four with seats empty; 5 is the six with the top left empty - a player joining moves nobody.
const BOTTOM_Y = 207.33, TOP_Y = 15.91;
const BL = { x: 45.76, y: BOTTOM_Y }, BM = { x: 134.31, y: BOTTOM_Y }, BR = { x: 222.86, y: BOTTOM_Y };
const TL = { x: 55.71, y: TOP_Y }, TM = { x: 144.26, y: TOP_Y }, TR = { x: 232.8, y: TOP_Y };
const SEATS: Record<number, Array<{ x: number; y: number }>> = {
  2: [BL, TR], 3: [BL, BR, TR], 4: [BL, BR, TR, TL], 5: [BL, BM, BR, TR, TM], 6: [BL, BM, BR, TR, TM, TL],
};

/** The chip marks' left, top for n seats (2..6): the bottom row left to right, then the top row right to left (clockwise). */
export function seatSlots(n: number): Array<{ x: number; y: number }> {
  return (SEATS[Math.min(6, Math.max(2, n))] ?? SEATS[2]).slice(0, n);
}

/** The pot's number, centred under the board; y is the bottom of its line box (the sheet's baseline 182.06 stands 2.64 above it). */
export const POT_AT = { x: 155.33, y: 184.7 };
