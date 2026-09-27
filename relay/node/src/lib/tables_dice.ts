// The dice class — backgammon (chat spec §6: "whose turn, an honest roll, the
// score by cons won"; how to move on what fell, gammons and backgammons stay
// with the people). The node rolls (§6: "the node shuffles and rolls").
//
// A turn: {roll: true} — two dice from the platform's CSPRNG, and the turn
// stays; then any {move} the players agree on ends it. A con ends by
// agreement, as the grid's (lib/tables_grid.ts playCon).

export interface Dice {
  rolled: [number, number] | null;
  claim: number | null;
}

export const newDice = (): Dice => ({ rolled: null, claim: null });

const die = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 6);

export function playDice(d: Dice, move: unknown): { refused: string } | { again: boolean } {
  const m = (typeof move === "object" && move !== null ? move : {}) as { roll?: unknown; move?: unknown };
  if (m.roll === true) {
    if (d.rolled) return { refused: "the dice are already rolled this turn" };
    d.rolled = [die(), die()];
    return { again: true };
  }
  if (!d.rolled) return { refused: "roll first" };
  if (m.move === undefined) return { refused: "a move is {roll: true} or {move}" };
  d.rolled = null;
  return { again: false };
}
