// A card's three gestures (sosed blocks, web/design/gen/dir-blocks behavior):
// swipe right, swipe left, pull down. Pointer events, so a finger, a pen and
// a mouse all drive it. The element owns its gestures: it carries
// `touch-action: none` (blocks.css), the page around it scrolls as before.
// The axis is locked after the first LOCK_PX of travel, so a pull down that
// wobbles sideways stays a pull, and a swipe stays a swipe. Below the
// threshold the card snaps back and nothing happens ("release above 80 px").
// A gesture that travelled is not also a click: the click after it is eaten.

import { type MouseEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const SWIPE_PX = 96;
export const PULL_PX = 80;
const LOCK_PX = 10;

export type SwipeHandlers = { onLeft?: () => void; onRight?: () => void; onDown?: () => void; disabled?: boolean };

export function useSwipe({ onLeft, onRight, onDown, disabled }: SwipeHandlers) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const moved = useRef(false);
  const [offset, setOffset] = useState({ dx: 0, dy: 0 });

  function reset() {
    start.current = null;
    axis.current = null;
    setOffset({ dx: 0, dy: 0 });
  }

  const bind = {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      axis.current = null;
      moved.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (!axis.current && Math.hypot(dx, dy) >= LOCK_PX) axis.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (!axis.current) return;
      moved.current = true;
      // Only down is a gesture on the vertical axis; up stays where it is.
      setOffset(axis.current === "x" ? { dx, dy: 0 } : { dx: 0, dy: Math.max(0, dy) });
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      const along = axis.current;
      reset();
      if (along === "x" && dx >= SWIPE_PX) onRight?.();
      else if (along === "x" && dx <= -SWIPE_PX) onLeft?.();
      else if (along === "y" && dy >= PULL_PX) onDown?.();
    },
    onPointerCancel() { reset(); },
    onClickCapture(e: MouseEvent) {
      if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; }
    },
  };
  return { bind, offset, dragging: start.current !== null && axis.current !== null };
}
