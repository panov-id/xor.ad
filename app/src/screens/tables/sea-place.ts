// battleship-place (owner 27.10.2026, «Кнопка «случайно»»): the app places the fleet, the person shuffles until it suits
// and sends it. The rules are the node's (relay/node/src/lib/tables_sea.ts): ships 4, 3, 3, 2, 2, 2, 1, 1, 1, 1 on a1..j10,
// straight, never touching, not even at a corner. The node still judges the fleet; this only never offers a bad one.
import { SEA_FILES } from "../../../../depth/core/tables_sea.ts";

export const FLEET_SIZES: readonly number[] = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
const N = 10;

/** The fleet's ship sizes, each once, biggest first: the chips of the battleship-place strip (4, 3, 2, 1). */
export const fleetSizes = (): number[] => [...new Set(FLEET_SIZES)].sort((a, b) => b - a);

/** A fleet by the node's rules; `rand` is Math.random unless a test pins it. Big ships first, so a dead end is rare. */
export function randomFleet(rand: () => number = Math.random): string[][] {
  for (;;) {
    const taken = new Set<number>();
    const ships: string[][] = [];
    for (const size of FLEET_SIZES) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const down = rand() < 0.5;
        const x = Math.floor(rand() * (down ? N : N - size + 1));
        const y = Math.floor(rand() * (down ? N - size + 1 : N));
        const cells = Array.from({ length: size }, (_, i) => (down ? [x, y + i] : [x + i, y]));
        // no cell of the ship may sit on or next to (corners too) a taken cell
        if (cells.some(([cx, cy]) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => taken.has((cx + dx) * N + (cy + dy)) && cx + dx >= 0 && cx + dx < N && cy + dy >= 0 && cy + dy < N)))) continue;
        cells.forEach(([cx, cy]) => taken.add(cx * N + cy));
        ships.push(cells.map(([cx, cy]) => `${SEA_FILES[cx]}${cy + 1}`));
        placed = true;
      }
      if (!placed) break;
    }
    if (ships.length === FLEET_SIZES.length) return ships;
  }
}

/** The grid of the sheet, row by row a1..j1 first: which ship (its index) stands on each cell, or null, and the sides
 *  where the same ship goes on (left, right, up, down) — the sheet draws a ship as one bar, not as separate cells. */
export function fleetGrid(fleet: string[][]): Array<{ id: string; ship: number | null; join: { l: boolean; r: boolean; u: boolean; d: boolean } }> {
  const at = new Map<string, number>();
  fleet.forEach((ship, i) => ship.forEach((c) => at.set(c, i)));
  const shipAt = (x: number, y: number) => (x < 0 || x >= N || y < 0 || y >= N ? undefined : at.get(`${SEA_FILES[x]}${y + 1}`));
  return Array.from({ length: N * N }, (_, k) => {
    const x = k % N, y = Math.floor(k / N), ship = shipAt(x, y) ?? null;
    const same = (dx: number, dy: number) => ship !== null && shipAt(x + dx, y + dy) === ship;
    return { id: `${SEA_FILES[x]}${y + 1}`, ship, join: { l: same(-1, 0), r: same(1, 0), u: same(0, -1), d: same(0, 1) } };
  });
}
