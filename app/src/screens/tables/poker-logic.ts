// Poker's table (prototype poker-turn): a picture 120 x 120 units (cards-logic.ts, U), the felt an oval in the middle, the
// board's five slots on it, the pot's chip and count under them, the seats as avatars round the oval - mine at the bottom
// with my two cards under it, the rest clockwise, each with two backs and a stack pill. A slot with no card yet is dashed.
import { at, pivoted, type Placed, U } from "./cards-logic.ts";

export const POKER_H = 120 * U;
/** The felt: the oval's box, centre and size. */
export const FELT = at(60, 53, 100, 62, 0);

/** The five slots of the board, 13.5 apart on the felt: the cards dealt so far, null where none is yet. */
export function boardSlots(board: string[]): Array<{ card: string | null; at: Placed }> {
  return Array.from({ length: 5 }, (_, i) => ({ card: board[i] ?? null, at: at(33 + 13.5 * i, 50.5, 12, 17, 0) }));
}

/** The pot: a chip under the board's middle and its count in a pill to the right of it. */
export const POT_CHIP = at(60, 66, 8, 8, 0);
export const POT_AT = at(73, 66, 14, 6, 0);

// Seat centres, prototype units. The prototype's four: me at the bottom, then left, top, right; more seats fill the top corners.
const B = { x: 60, y: 96 }, L = { x: 14, y: 50 }, T = { x: 60, y: 12 }, R = { x: 106, y: 50 };
const TL = { x: 28, y: 16 }, TR = { x: 92, y: 16 };
const SEATS: Record<number, Array<{ x: number; y: number }>> = {
  2: [B, T], 3: [B, L, R], 4: [B, L, T, R], 5: [B, L, TL, TR, R], 6: [B, L, TL, T, TR, R],
};

export type SeatPlace = { avatar: Placed; backs: Placed[]; stack: Placed };
/** n seats (2..6) round the oval, the first at the bottom: a 14-unit avatar, two backs under it, a stack pill (above the
 *  avatar on the top row, where the felt is below it). */
export function seatSlots(n: number): SeatPlace[] {
  return (SEATS[Math.min(6, Math.max(2, n))] ?? SEATS[2]).slice(0, n).map(({ x, y }) => ({
    avatar: at(x, y, 14, 14, 0),
    backs: [at(x - 3.5, y + 12, 7, 10, 0), at(x + 2.5, y + 12, 7, 10, 0)],
    stack: at(x, y < 30 ? y - 12 : y + 11, 16, 4, 0),
  }));
}

/** My two cards under my avatar, each turned 6° out about its bottom middle. */
export function holeSlots(n: number): Placed[] {
  return Array.from({ length: n }, (_, i) => {
    const d = i - (n - 1) / 2;
    return pivoted(59.5 + 14 * d, 118, 13, 18, 12 * d);
  });
}
