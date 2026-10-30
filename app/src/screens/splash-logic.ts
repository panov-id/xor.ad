// The splash's floating icons step away from a finger (docs/newdesign4 SCREENS_spec §1): within 110 px of the touch an
// icon moves up to 34 px straight away from it, and never further than 8 px from the panel's edge. Free of React.
export type Box = { left: number; top: number; right: number; bottom: number };
export const REACH = 110, PUSH = 34, EDGE = 8;

/** The shift of one icon whose resting centre is (cx, cy) and half-size h, for a touch at (x, y) inside the panel. */
export function flee(cx: number, cy: number, h: number, x: number, y: number, panel: Box): { px: number; py: number } {
  const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
  const k = d < REACH ? (REACH - d) / REACH : 0;
  let px = (dx / (d || 1)) * k * PUSH, py = (dy / (d || 1)) * k * PUSH;
  const room = h + EDGE;
  px = Math.max(panel.left + room - cx, Math.min(panel.right - room - cx, px));
  py = Math.max(panel.top + room - cy, Math.min(panel.bottom - room - cy, py));
  return { px, py };
}
