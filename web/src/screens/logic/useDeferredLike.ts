// The neighbro heart (owner's decision 02.10.2026): a like placed on a card is
// held here for UNDO_MS before it goes to the node. Taking the heart off in
// that window cancels it on this device — nothing was sent, so nothing is
// unsent. The node has only like/unlike (openapi), no "pending like": the
// window is the page's own. Leaving the card while the heart sits sends it
// at once: the person placed it and did not take it off.

import { useEffect, useRef, useState } from "react";

export const UNDO_MS = 5000;

export function useDeferredLike(send: () => unknown, ms = UNDO_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  function fire() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPendingSince(null);
    void sendRef.current();
  }

  function place() {
    if (timer.current) return;
    setPendingSince(Date.now());
    setNow(Date.now());
    timer.current = setTimeout(fire, ms);
  }

  function undo() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPendingSince(null);
  }

  // A second's tick for the words "goes in n s".
  useEffect(() => {
    if (pendingSince === null) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [pendingSince]);

  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void sendRef.current(); } }, []);

  const left = pendingSince === null ? 0 : Math.max(0, Math.ceil((pendingSince + ms - now) / 1000));
  return { pending: pendingSince !== null, left, place, undo };
}
