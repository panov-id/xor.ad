// The pure parts of boards.tsx that read what the node sends: the node's state is not trusted to be well formed.

// hangman: the guessed letters not shown in the slots, strings only, each once (they key the list)
export function missedLetters(guessed: unknown, slots: (string | null)[]): string[] {
  const shown = new Set(slots.filter((c): c is string => typeof c === "string").map((c) => c.toUpperCase()));
  const out: string[] = [];
  for (const l of Array.isArray(guessed) ? guessed : []) {
    if (typeof l !== "string" || !l || shown.has(l.toUpperCase()) || out.some((o) => o.toUpperCase() === l.toUpperCase())) continue;
    out.push(l);
  }
  return out;
}

// dominoes: how many boneyard bars to draw, at most 7; a free state without a boneyard draws none
export function yardBars(boneyard: { count?: unknown } | null | undefined): number {
  const n = boneyard?.count;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 7) : 0;
}

// chess: the piece's own shape; a letter that is not one of the table's (e.g. "constructor") draws a pawn
export function pieceShape(shapes: Record<string, string>, letter: string): string {
  return Object.hasOwn(shapes, letter) ? shapes[letter] : shapes[""];
}
