// Battleship (relay/node/src/lib/tables_sea.ts, depth/core/tables_sea.ts): what the two seas draw. The shots sea is the
// other's, with what my shots found; my own sea shows my ships and what the other's shots found there.
import { SEA_CELLS, SEA_FILES, type SeaShot, type SeaView } from "../../../../depth/core/tables_sea.ts";

export type ShotCell = {
  id: string;
  result: SeaShot | null;
  /** The sides a found ship goes on over (r, d, l, u): ships do not touch, so a found neighbour is the same ship — drawn as one bar. */
  join: string;
};
const found = (r: SeaShot | undefined): boolean => r === "hit" || r === "sunk";
/** The hundred cells of the other's sea, row by row from a1: what my shot found there, or nothing yet. */
export function shotCells(v: SeaView): ShotCell[] {
  const at = (f: number, r: number): SeaShot | undefined => (f < 0 || f > 9 || r < 1 || r > 10 ? undefined : v.mine[`${SEA_FILES[f]}${r}`]);
  return SEA_CELLS.map((id) => {
    const f = SEA_FILES.indexOf(id[0]), r = Number(id.slice(1));
    const join = found(v.mine[id]) ? [found(at(f + 1, r)) && "r", found(at(f, r + 1)) && "d", found(at(f - 1, r)) && "l", found(at(f, r - 1)) && "u"].filter(Boolean).join(" ") : "";
    return { id, result: v.mine[id] ?? null, join };
  });
}

export type OwnCell = { id: string; ship: boolean; shot: SeaShot | null; join: { l: boolean; r: boolean; u: boolean; d: boolean } };
/** The hundred cells of my sea: a ship of mine stands on it, the other's shot found there (if it did), and the sides the ship
 *  goes on over (ships do not touch, so a ship neighbour is the same ship: battleship-turn draws each ship as one bar). */
export function ownCells(v: SeaView): OwnCell[] {
  const ship = new Set((v.ships ?? []).flat());
  const on = (f: number, r: number) => f >= 0 && f <= 9 && r >= 1 && r <= 10 && ship.has(`${SEA_FILES[f]}${r}`);
  return SEA_CELLS.map((id) => {
    const f = SEA_FILES.indexOf(id[0]), r = Number(id.slice(1)), s = ship.has(id);
    return { id, ship: s, shot: v.theirs[id] ?? null, join: { l: s && on(f - 1, r), r: s && on(f + 1, r), u: s && on(f, r - 1), d: s && on(f, r + 1) } };
  });
}

/** A free cell of the other's sea takes a tap only in my turn of the shots. */
export const canShoot = (v: SeaView, c: ShotCell, myTurn: boolean): boolean => v.phase === "shoot" && myTurn && c.result === null;
