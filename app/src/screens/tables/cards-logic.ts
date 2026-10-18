// Cards on a table panel (durak, poker): a card is placed by its centre, size and turn in px of the sheets' 356.18-wide panel,
// measured from the panel's top left; the board scales every number with the panel's width (cqw, tables.css).
export const REF_W = 356.18;
export type Placed = { x: number; y: number; w: number; h: number; r: number };

/** A face-up card and a card's back in a fan and in the stock (sheet w3_table-durak). */
export const FACE = { w: 49.5, h: 74 };
export const BACK = { w: 45.76, h: 64.07 };
export const STOCK = { w: 49.75, h: 69.64 };

/** The CSS variables a placed card carries (tables.css turns them into left, top, size and turn). */
export const placedVars = (p: Placed): Record<string, number> => ({ "--x": p.x, "--y": p.y, "--w": p.w, "--h": p.h, "--r": p.r });
