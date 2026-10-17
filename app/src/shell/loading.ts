// Waiting rules (MOTION.md, "В код"): a skeleton shows at once on request; an
// answer faster than NO_SHOW_MS shows none; once shown it stays MIN_SKELETON_MS.
import { useEffect, useRef, useState } from "react";

export const NO_SHOW_MS = 300;
export const MIN_SKELETON_MS = 600;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `work`; calls `show(true)` at once, and cancels it silently when the
 *  answer lands inside NO_SHOW_MS; otherwise holds the skeleton MIN_SKELETON_MS. */
export async function withSkeleton<T>(work: Promise<T>, show: (on: boolean) => void): Promise<T> {
  const t0 = performance.now();
  show(true);
  try {
    return await work;
  } finally {
    const spent = performance.now() - t0;
    // Under NO_SHOW_MS the skeleton never made it to the screen (see useSkeleton).
    if (spent >= NO_SHOW_MS && spent < MIN_SKELETON_MS) await sleep(MIN_SKELETON_MS - spent);
    show(false);
  }
}

/** `visible` is true only once a request has been pending for NO_SHOW_MS...
 *  but never flickers: after it shows, it stays at least MIN_SKELETON_MS. */
export function useSkeleton(pending: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (pending) {
      const id = setTimeout(() => { shownAt.current = performance.now(); setVisible(true); }, NO_SHOW_MS);
      return () => clearTimeout(id);
    }
    if (!visible) return;
    const left = Math.max(0, MIN_SKELETON_MS - (performance.now() - shownAt.current));
    const id = setTimeout(() => setVisible(false), left);
    return () => clearTimeout(id);
  }, [pending, visible]);
  return visible;
}
