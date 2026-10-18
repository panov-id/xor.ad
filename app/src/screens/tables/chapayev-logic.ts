// Chapayev (relay/node/src/lib/tables_physics.ts, depth/core/tables_physics.ts): the board as a seat sees it — its own edge
// at the bottom — and the aim of a flick drawn from a piece to a target cell. Where a flicked piece ends is the node's.
import { PHYSICS_SIZE, type Physics, screenAt } from "../../../../depth/core/tables_physics.ts";
import type { Stand } from "./table-logic";

export type PCell = { id: string; stand: Stand };
/** The 64 cells row by row from the screen's top left, each named "x:y" as the node does. */
export function chapayevCells(p: Physics, seat: number, n: number): PCell[] {
  const out: PCell[] = new Array(PHYSICS_SIZE * PHYSICS_SIZE);
  for (let x = 0; x < PHYSICS_SIZE; x++) {
    for (let y = 0; y < PHYSICS_SIZE; y++) {
      const id = `${x}:${y}`, owner = p.cells[id];
      const { col, row } = screenAt(x, y, n);
      out[row * PHYSICS_SIZE + col] = { id, stand: owner === undefined ? "free" : owner === seat ? "mine" : "theirs" };
    }
  }
  return out;
}

/** An arrow from the centre of one cell to the centre of another, in cell units on the screen's 8×8. */
export function aimLine(from: string, to: string, n: number): { x1: number; y1: number; x2: number; y2: number } {
  const at = (id: string) => { const [x, y] = id.split(":").map(Number); const s = screenAt(x, y, n); return [s.col + 0.5, s.row + 0.5]; };
  const [x1, y1] = at(from), [x2, y2] = at(to);
  return { x1, y1, x2, y2 };
}

/** My place among the playing seats (the node's n-th seat sits on its n-th side); a seat not found sits at the bottom. */
export const seatIndex = (seats: number[] | undefined, seat: number): number => Math.max(0, (seats ?? []).indexOf(seat));
