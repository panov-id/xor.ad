// How a person's typed paper code is read (chat spec §8.2): any case, dashes
// and spaces where they like, and the letters Crockford reads as digits read
// as digits. U is not in the alphabet and is refused by the caller
// (paper.ts readPaperCode), not guessed here. Split out of paper.ts so that a
// face's pure rules can use it without the Argon2 module paper.ts imports;
// paper.ts re-exports it, there is one reading.
export function readPaperText(typed: string): string {
  return typed.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}
