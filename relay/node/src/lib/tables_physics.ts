// The physics class — chapayev (chat spec §6: "whose turn, the score by the
// pieces knocked off; everything else — the flick ends where it rolled"). 2–4
// seats. The spec asks for a deterministic simulation so that every screen
// sees the same result (§15: "physics is synchronised by a shared seed"); the
// one here is the smallest that is deterministic: an 8×8 board, and a flick
// slides a piece cell by cell.
//
// A move: {flick: {piece: "x:y", dir: [dx, dy], power: 1..7}}. The piece slides
// up to `power` cells along `dir` (each of dx, dy in -1..1). The first piece in
// its way stops it; if that piece is somebody else's it is pushed one cell on,
// and off the board it is knocked off — a point to the flicker. A seat with no
// pieces left is out; the last seat with pieces ends the game.

export interface Physics {
  cells: Record<string, number>; // "x:y" -> seat
}

export function newPhysics(seats: number[]): Physics {
  // Two seats face each other on rows 0 and 7; a third and fourth take the
  // columns 0 and 7 between them.
  const cells: Record<string, number> = {};
  const rows = [
    (i: number) => `${i}:0`,
    (i: number) => `${i}:7`,
    (i: number) => `0:${i}`,
    (i: number) => `7:${i}`,
  ];
  seats.forEach((seat, n) => {
    for (let i = 1; i <= 6; i++) cells[rows[n](i)] = seat;
  });
  return { cells };
}

const inside = (x: number, y: number) => x >= 0 && x < 8 && y >= 0 && y < 8;

export type PhysicsResult = { refused: string } | { knocked: number; over: boolean };

export function playPhysics(p: Physics, move: unknown, seat: number): PhysicsResult {
  const f = (typeof move === "object" && move !== null ? (move as { flick?: unknown }).flick : undefined) as
    | { piece?: unknown; dir?: unknown; power?: unknown }
    | undefined;
  if (!f || typeof f.piece !== "string" || !Array.isArray(f.dir) || !Number.isInteger(f.power)) {
    return { refused: "a move is {flick: {piece: \"x:y\", dir: [dx, dy], power}}" };
  }
  const [dx, dy] = f.dir as number[];
  const power = f.power as number;
  if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy) || (dx === 0 && dy === 0) || power < 1 || power > 7) {
    return { refused: "dir is a step of -1..1 each way, power 1..7" };
  }
  if (p.cells[f.piece] !== seat) return { refused: "no piece of yours there" };
  let [x, y] = f.piece.split(":").map(Number);
  let knocked = 0;
  delete p.cells[f.piece];
  for (let step = 0; step < power; step++) {
    const [nx, ny] = [x + dx, y + dy];
    if (!inside(nx, ny)) break; // the flicked piece stops at the edge
    const hit = p.cells[`${nx}:${ny}`];
    if (hit !== undefined) {
      if (hit !== seat) {
        const [px, py] = [nx + dx, ny + dy];
        delete p.cells[`${nx}:${ny}`];
        if (!inside(px, py)) knocked += 1;
        else if (p.cells[`${px}:${py}`] === undefined) p.cells[`${px}:${py}`] = hit;
        else knocked += 1; // pushed into another piece: off the board too
      }
      break;
    }
    [x, y] = [nx, ny];
  }
  p.cells[`${x}:${y}`] = seat;
  const left = new Set(Object.values(p.cells));
  return { knocked, over: left.size <= 1 };
}
