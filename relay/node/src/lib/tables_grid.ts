// The grid class — checkers, chess (chat spec §6: "whose turn, the cell is not
// taken by one's own piece, the end of a con by agreement, the score by cons
// won"; whether the move itself is legal stays with the people). And the con
// by agreement, shared with dice (lib/tables_dice.ts).
//
// A move is {from: "e2", to: "e4"}: `from` must hold the mover's piece, `to`
// must not; whatever stood on `to` is taken. The set gives the start: "chess"
// (two back rows of pieces by letter) or anything else, checkers (twelve men
// on the dark cells).
//
// The con by agreement (decided by the executor, 2026-09-27, G1g; the spec
// names the rule, not a gesture for it): the one who won says so with
// {con: "won"}; the other agrees with {con: "agree"} as their next move — a
// point to the claimant and a fresh board — and any other move of theirs
// drops the claim. Nobody scores alone.

export interface Grid {
  cells: Record<string, { seat: number; piece: string }>;
  claim: number | null;
}

const FILES = "abcdefgh";
const cell = (f: number, r: number) => `${FILES[f]}${r + 1}`;

export function newGrid(set: string, seats: number[]): Grid {
  const [low, high] = [seats[0], seats[1] ?? seats[0]];
  const cells: Grid["cells"] = {};
  if (set === "chess") {
    const back = "RNBQKBNR";
    for (let f = 0; f < 8; f++) {
      cells[cell(f, 0)] = { seat: low, piece: back[f] };
      cells[cell(f, 1)] = { seat: low, piece: "P" };
      cells[cell(f, 6)] = { seat: high, piece: "P" };
      cells[cell(f, 7)] = { seat: high, piece: back[f] };
    }
  } else {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if ((f + r) % 2 !== 0) continue;
        if (r < 3) cells[cell(f, r)] = { seat: low, piece: "M" };
        if (r > 4) cells[cell(f, r)] = { seat: high, piece: "M" };
      }
    }
  }
  return { cells, claim: null };
}

// The con by agreement, for any class that keeps a `claim`. Returns null when
// the move is not about the con, so the class's own rules take it.
export type ConResult = { refused: string } | { again: boolean; point: number | null; reset: boolean } | null;

export function playCon(state: { claim: number | null }, move: unknown, seat: number): ConResult {
  const con = (typeof move === "object" && move !== null ? (move as { con?: unknown }).con : undefined);
  if (con === undefined) {
    // Any other move by the claimant's opponent drops the claim.
    if (state.claim !== null && state.claim !== seat) state.claim = null;
    return null;
  }
  if (con === "won") {
    state.claim = seat;
    return { again: false, point: null, reset: false };
  }
  if (con === "agree") {
    if (state.claim === null || state.claim === seat) return { refused: "there is no claim of the other side to agree to" };
    const point = state.claim;
    state.claim = null;
    return { again: false, point, reset: true };
  }
  return { refused: "con is won or agree" };
}

export function playGrid(g: Grid, move: unknown, seat: number): { refused: string } | { taken: boolean } {
  const m = (typeof move === "object" && move !== null ? move : {}) as { from?: unknown; to?: unknown };
  const valid = (c: unknown): c is string => typeof c === "string" && /^[a-h][1-8]$/.test(c);
  if (!valid(m.from) || !valid(m.to) || m.from === m.to) return { refused: "a move is {from, to} on a1..h8" };
  const piece = g.cells[m.from];
  if (!piece || piece.seat !== seat) return { refused: "no piece of yours on that cell" };
  if (g.cells[m.to]?.seat === seat) return { refused: "the cell is taken by your own piece" };
  const taken = !!g.cells[m.to];
  g.cells[m.to] = piece;
  delete g.cells[m.from];
  return { taken };
}
