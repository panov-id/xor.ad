// Chapayev as the node deals it (relay/node/src/lib/tables_physics.ts, state key `physics`): an 8×8 board of "x:y" -> seat,
// and a flick {piece, dir: [dx, dy], power}. A flick goes along a row, a column or a diagonal, up to 7 cells: what a
// target cell means is shared here for both faces; where the piece ends, who is knocked off and who wins stay the node's.

export interface Physics { cells: Record<string, number> }
export const PHYSICS_SIZE = 8;
export const FLICK_MAX = 7;

export function physicsOf(state: Record<string, unknown> | null | undefined): Physics | null {
  const p = state?.physics as Physics | undefined;
  return p && typeof p === "object" && p.cells && typeof p.cells === "object" ? p : null;
}

const parse = (id: string): [number, number] | null => {
  const m = /^([0-7]):([0-7])$/.exec(id);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** The flick that takes `piece` to `target` ("x:y" both): null unless the target lies on a line from the piece within 7 cells. */
export function flickTo(piece: string, target: string): { piece: string; dir: [number, number]; power: number } | null {
  const a = parse(piece), b = parse(target);
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const power = Math.max(Math.abs(dx), Math.abs(dy));
  if (power < 1 || power > FLICK_MAX) return null;
  if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return null;
  return { piece, dir: [Math.sign(dx), Math.sign(dy)], power };
}

/** Where on the board a seat sits: the node's newPhysics puts the n-th seat on row 0, row 7, column 0, column 7. */
export function screenAt(x: number, y: number, n: number): { col: number; row: number } {
  // d: the distance from my edge, a: the place along it; my edge is the screen's bottom (row 7), a runs left to right
  const [d, a] = n === 0 ? [y, x] : n === 1 ? [7 - y, 7 - x] : n === 2 ? [x, 7 - y] : [7 - x, y];
  return { col: a, row: 7 - d };
}
