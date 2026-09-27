// The free table — dominoes (chat spec §6: "whose turn; a bone goes only to a
// matching end; the end of a con; the score by the pips of the bones left").
// 2–4 seats. The node shuffles the 28 bones and deals seven each (five at
// three or four); the boneyard and the others' hands are cut per seat.
//
// A move: {play: "3:5", end: "left" | "right"} — the bone from one's hand, one
// of its halves matching that end (the first bone goes anywhere); {draw: true}
// takes from the boneyard. An empty hand ends the con: the one who emptied it
// scores the pips left in everybody else's hands.

export interface Free {
  boneyard: string[];
  hands: Record<string, string[]>;
  line: string[]; // bones as laid, left to right, each oriented "a:b"
}

export function newFree(seats: number[]): Free {
  const bones: string[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) bones.push(`${a}:${b}`);
  for (let i = bones.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [bones[i], bones[j]] = [bones[j], bones[i]];
  }
  const each = seats.length <= 2 ? 7 : 5;
  const hands: Record<string, string[]> = {};
  for (const seat of seats) hands[seat] = bones.splice(0, each);
  return { boneyard: bones, hands, line: [] };
}

const pips = (bone: string) => bone.split(":").reduce((sum, half) => sum + Number(half), 0);

export type FreeResult = { refused: string } | { won: boolean; points: number };

export function playFree(f: Free, move: unknown, seat: number): FreeResult {
  const hand = f.hands[seat];
  if (!hand) return { refused: "no hand at this seat" };
  const m = (typeof move === "object" && move !== null ? move : {}) as { play?: unknown; end?: unknown; draw?: unknown };
  if (m.draw === true) {
    const bone = f.boneyard.shift();
    if (!bone) return { refused: "the boneyard is empty" };
    hand.push(bone);
    return { won: false, points: 0 };
  }
  if (typeof m.play !== "string") return { refused: "a move is {play, end} or {draw: true}" };
  // The same bone either way round: "5:3" is "3:5".
  const at = hand.findIndex((b) => b === m.play || b.split(":").reverse().join(":") === m.play);
  if (at < 0) return { refused: "the bone is not in your hand" };
  const [x, y] = hand[at].split(":").map(Number);
  if (f.line.length === 0) {
    f.line.push(`${x}:${y}`);
  } else if (m.end === "left") {
    const open = Number(f.line[0].split(":")[0]);
    if (y === open) f.line.unshift(`${x}:${y}`);
    else if (x === open) f.line.unshift(`${y}:${x}`);
    else return { refused: "the bone does not match that end" };
  } else if (m.end === "right") {
    const open = Number(f.line[f.line.length - 1].split(":")[1]);
    if (x === open) f.line.push(`${x}:${y}`);
    else if (y === open) f.line.push(`${y}:${x}`);
    else return { refused: "the bone does not match that end" };
  } else {
    return { refused: "end is left or right" };
  }
  hand.splice(at, 1);
  if (hand.length > 0) return { won: false, points: 0 };
  let points = 0;
  for (const [other, bones] of Object.entries(f.hands)) if (other !== String(seat)) points += bones.reduce((s, b) => s + pips(b), 0);
  return { won: true, points };
}

// What one seat may see: its own hand, the others' sizes, the boneyard's size.
export function freeFor(f: Free, viewer: number | null) {
  const hands: Record<string, string[] | { count: number }> = {};
  for (const [seat, bones] of Object.entries(f.hands)) {
    hands[seat] = String(viewer) === seat ? [...bones] : { count: bones.length };
  }
  return { hands, boneyard: { count: f.boneyard.length }, line: f.line };
}
