// Battleship — a set of the grid class with a hidden position (owner,
// 13.10.2026). Two seats, a 10×10 sea a1..j10, the standard fleet: one of
// four cells, two of three, three of two, four of one; ships are straight and
// do not touch, not even at a corner.
//
// Two phases. Placement: each seat in turn moves {fleet: [["a1","a2"], …]} —
// the whole fleet at once; the node checks it and keeps it. Nobody else ever
// sees it (§6.1: what is hidden is cut, here in seaFor): the other seat and the
// spectators see only that it is placed, and the moves everyone sees carry
// {fleet: "placed"}, never the cells. Then shots: {shot: "e5"}; a hit keeps the
// turn, a miss passes it; a ship whose every cell is hit is sunk and its cells
// are shown. The one who sinks the whole other fleet wins.

export const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
const FILES = "abcdefghij";
const SIZE = 10;

export interface Sea {
  phase: "place" | "shoot";
  fleets: Record<string, string[][] | null>;
  // By the seat who shot: cell -> what it found.
  shots: Record<string, Record<string, "hit" | "miss" | "sunk">>;
}

export function newSea(seats: number[]): Sea {
  return {
    phase: "place",
    fleets: Object.fromEntries(seats.map((s) => [String(s), null])),
    shots: Object.fromEntries(seats.map((s) => [String(s), {}])),
  };
}

const parse = (c: unknown): [number, number] | null => {
  if (typeof c !== "string") return null;
  const m = /^([a-j])(10|[1-9])$/.exec(c);
  return m ? [FILES.indexOf(m[1]), Number(m[2]) - 1] : null;
};

// Why a fleet is not acceptable, or null when it is.
export function fleetFault(fleet: unknown): string | null {
  if (!Array.isArray(fleet) || fleet.length !== FLEET.length) return "a fleet is ten ships";
  const ships: [number, number][][] = [];
  for (const ship of fleet) {
    if (!Array.isArray(ship) || ship.length < 1) return "a ship is a list of cells";
    const cells = ship.map(parse);
    if (cells.some((c) => c === null)) return "a ship's cells are on a1..j10";
    ships.push(cells as [number, number][]);
  }
  const sizes = ships.map((s) => s.length).sort((a, b) => b - a);
  if (sizes.join() !== FLEET.join()) return "the fleet is 4, 3, 3, 2, 2, 2, 1, 1, 1, 1";
  for (const ship of ships) {
    const fs = new Set(ship.map(([f]) => f));
    const rs = new Set(ship.map(([, r]) => r));
    if (fs.size !== 1 && rs.size !== 1) return "a ship is straight";
    const along = (fs.size === 1 ? ship.map(([, r]) => r) : ship.map(([f]) => f)).sort((a, b) => a - b);
    if (along.some((v, i) => i > 0 && v !== along[i - 1] + 1)) return "a ship's cells are in one unbroken line";
  }
  // No two ships share or touch a cell, sides and corners alike.
  const owner = new Map<string, number>();
  ships.forEach((ship, i) => ship.forEach(([f, r]) => owner.set(`${f},${r}`, i)));
  if (owner.size !== FLEET.reduce((a, b) => a + b, 0)) return "ships do not overlap";
  for (const [key, i] of owner) {
    const [f, r] = key.split(",").map(Number);
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const other = owner.get(`${f + df},${r + dr}`);
        if (other !== undefined && other !== i) return "ships do not touch, not even at a corner";
      }
    }
  }
  return null;
}

const name = ([f, r]: [number, number]) => `${FILES[f]}${r + 1}`;

export type SeaResult =
  | { refused: string }
  | { over: boolean; next: number; shown: unknown };

export function playSea(sea: Sea, move: unknown, seat: number, other: number): SeaResult {
  const m = (typeof move === "object" && move !== null ? move : {}) as { fleet?: unknown; shot?: unknown };
  if (sea.phase === "place") {
    if (sea.fleets[seat] !== null) return { refused: "your fleet is placed; the other places theirs" };
    if (m.fleet === undefined) return { refused: "a move is {fleet} before the shots" };
    const fault = fleetFault(m.fleet);
    if (fault) return { refused: fault };
    sea.fleets[seat] = (m.fleet as string[][]).map((ship) => ship.map((c) => name(parse(c)!)));
    const waiting = Object.keys(sea.fleets).find((s) => sea.fleets[s] === null);
    if (waiting === undefined) sea.phase = "shoot";
    // The first seat shoots first, so whoever placed second hands it back.
    return { over: false, next: waiting === undefined ? Math.min(seat, other) : Number(waiting), shown: { fleet: "placed" } };
  }
  const cell = parse(m.shot);
  if (!cell) return { refused: "a move is {shot} on a1..j10" };
  const target = name(cell);
  const mine = sea.shots[seat];
  if (mine[target]) return { refused: "that cell was shot" };
  const fleet = sea.fleets[other] ?? [];
  const ship = fleet.find((s) => s.includes(target));
  if (!ship) {
    mine[target] = "miss";
    return { over: false, next: other, shown: { shot: target, result: "miss" } };
  }
  mine[target] = "hit";
  const sunk = ship.every((c) => mine[c]);
  if (sunk) for (const c of ship) mine[c] = "sunk";
  const over = fleet.every((s) => s.every((c) => mine[c]));
  return { over, next: seat, shown: { shot: target, result: sunk ? "sunk" : "hit" } };
}

// One's own fleet whole; of the other's only whether it is placed. The shots
// are public: they say only what the shooter already learned.
export function seaFor(sea: Sea, viewer: number | null) {
  const fleets: Record<string, string[][] | { placed: boolean }> = {};
  for (const [seat, fleet] of Object.entries(sea.fleets)) {
    fleets[seat] = String(viewer) === seat && fleet ? fleet.map((s) => [...s]) : { placed: fleet !== null };
  }
  return { phase: sea.phase, size: SIZE, fleet: FLEET, fleets, shots: sea.shots };
}
