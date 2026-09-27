// The dots class (chat spec §6: "whose turn; the edge is not taken; a closed
// area counts; the score by the number of closed areas"). The first class
// whose rules the engine keeps whole; the others still store a move as sent.
//
// The field is n×n boxes; an edge is "h:r:c" (above box r,c; r in 0..n) or
// "v:r:c" (left of box r,c; c in 0..n). Closing a box scores it and, as the
// game is played on paper, the one who closed it moves again.

export interface Dots {
  n: number;
  edges: string[];
  boxes: Record<string, number>; // "r:c" -> seat that closed it
}

// The set names the size: "4x4" … "8x8"; anything else is the 4×4 field.
export function newDots(set: string): Dots {
  const m = /^([2-8])x\1$/.exec(set);
  return { n: m ? Number(m[1]) : 4, edges: [], boxes: {} };
}

export type DotsResult = { refused: string } | { closed: number; over: boolean };

export function playDots(dots: Dots, move: unknown, seat: number): DotsResult {
  if (typeof move !== "object" || move === null || typeof (move as { edge?: unknown }).edge !== "string") {
    return { refused: "an edge is {edge: \"h:r:c\" | \"v:r:c\"}" };
  }
  const edge = (move as { edge: string }).edge;
  const m = /^([hv]):(\d):(\d)$/.exec(edge);
  const n = dots.n;
  if (!m) return { refused: "not an edge" };
  const [r, c] = [Number(m[2]), Number(m[3])];
  const fits = m[1] === "h" ? r <= n && c < n : r < n && c <= n;
  if (!fits) return { refused: "off the field" };
  if (dots.edges.includes(edge)) return { refused: "the edge is taken" };
  dots.edges.push(edge);
  const has = (e: string) => dots.edges.includes(e);
  const candidates = m[1] === "h" ? [[r - 1, c], [r, c]] : [[r, c - 1], [r, c]];
  let closed = 0;
  for (const [br, bc] of candidates) {
    if (br < 0 || bc < 0 || br >= n || bc >= n) continue;
    if (has(`h:${br}:${bc}`) && has(`h:${br + 1}:${bc}`) && has(`v:${br}:${bc}`) && has(`v:${br}:${bc + 1}`)) {
      dots.boxes[`${br}:${bc}`] = seat;
      closed += 1;
    }
  }
  return { closed, over: dots.edges.length === 2 * n * (n + 1) };
}
