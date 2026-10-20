// Battleship as the node deals it (relay/node/src/lib/tables_sea.ts seaFor, state key `sea`), shared by both faces' boards:
// the shape of the state, the fleet typed as ships of cells, and what a seat sees of the two seas. The node keeps every
// rule (sizes, straightness, no touching, the shots); nothing here judges a fleet beyond "these are cells of a1..j10".

export type SeaShot = "hit" | "miss" | "sunk";
export interface Sea {
  phase: "place" | "shoot";
  fleets: Record<string, string[][] | { placed: boolean }>;
  /** By the seat who shot: cell -> what it found. */
  shots: Record<string, Record<string, SeaShot>>;
}

export const SEA_FILES: readonly string[] = [..."abcdefghij"];
/** Row by row, a1..j1 first. */
export const SEA_CELLS: readonly string[] = Array.from({ length: 10 }, (_, r) => SEA_FILES.map((f) => `${f}${r + 1}`)).flat();
export const FLEET_EXAMPLE = "a1 a2 a3 a4; c1 c2 c3; e1 e2 e3; a6 a7; c6 c7; e6 e7; h1; h3; h5; h7";

/** «a1 a2; c1» → [["a1","a2"],["c1"]]; null when a cell is not a1..j10. The node checks the fleet itself. */
export function parseFleet(text: string): string[][] | null {
  const ships = text.split(";").map((ship) => ship.toLowerCase().split(/[\s,]+/).filter(Boolean)).filter((ship) => ship.length > 0);
  if (ships.length === 0 || ships.some((ship) => ship.some((cell) => !/^[a-j](10|[1-9])$/.test(cell)))) return null;
  return ships;
}

export function seaOf(state: Record<string, unknown> | null | undefined): Sea | null {
  const s = state?.sea as Sea | undefined;
  return s && typeof s === "object" && s.fleets && s.shots && (s.phase === "place" || s.phase === "shoot") ? s : null;
}

export type SeaView = {
  phase: "place" | "shoot";
  /** My fleet's cells (all of its ships) when I have placed it, else null; null for a seat that does not play. */
  ships: string[][] | null;
  /** The placed fleet is mine to place: no fleet yet and a move is mine. */
  toPlace: boolean;
  /** What my shots found, by cell. */
  mine: Record<string, SeaShot>;
  /** What the other's shots found of my sea, by cell. */
  theirs: Record<string, SeaShot>;
};
/** A seat's view of the sea; null for a watcher (the node shows a watcher no one's fleet). */
export function seaView(sea: Sea, seat: number, myTurn: boolean): SeaView | null {
  const me = String(seat);
  const fleet = sea.fleets[me];
  if (fleet === undefined) return null;
  const other = Object.keys(sea.fleets).find((s) => s !== me);
  const ships = Array.isArray(fleet) ? fleet : null;
  return { phase: sea.phase, ships, toPlace: sea.phase === "place" && !ships && myTurn, mine: sea.shots[me] ?? {}, theirs: (other && sea.shots[other]) || {} };
}
