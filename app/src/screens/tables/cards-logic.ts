// Cards on a table panel (durak, poker): a card is placed by its centre, size and turn in px of the sheets' 356.18-wide panel,
// measured from the panel's top left; the board scales every number with the panel's width (cqw, tables.css).
export const REF_W = 356.18;
export type Placed = { x: number; y: number; w: number; h: number; r: number };

/** A face-up card and a card's back in a fan and in the stock (sheet w3_table-durak). */
export const FACE = { w: 49.5, h: 74 };
export const BACK = { w: 45.76, h: 64.07 };
export const STOCK = { w: 49.75, h: 69.64 };

/** The prototypes (docs/newdesign/proto) draw a card table as a picture 120 units wide; U turns its units into px of the panel. */
export const U = REF_W / 120;
/** A box at centre (x, y), w x h, turned r degrees, all in prototype units. */
export const at = (x: number, y: number, w: number, h: number, r: number): Placed => ({ x: x * U, y: y * U, w: w * U, h: h * U, r });
/** The centre of a w x h card the prototype turns r degrees about the middle of its bottom edge at (px, py). */
export function pivoted(px: number, py: number, w: number, h: number, r: number): Placed {
  const t = (r * Math.PI) / 180;
  return at(px + (h / 2) * Math.sin(t), py - (h / 2) * Math.cos(t), w, h, r);
}

/** The CSS variables a placed card carries (tables.css turns them into left, top, size and turn). */
export const placedVars = (p: Placed): Record<string, number> => ({ "--x": p.x, "--y": p.y, "--w": p.w, "--h": p.h, "--r": p.r });
