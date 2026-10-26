// The match card's exit (MOTION.md 04): `leave` arms the move to run when the exit animation ends (`left`),
// or after `fallbackMs` if it never reports; `dispose` (screen unmounted) drops both, so a closed screen moves nobody.
export function matchExit(fallbackMs: number) {
  let after: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const left = () => { clearTimeout(timer); timer = undefined; const f = after; after = null; f?.(); };
  return {
    leave(go: () => void) { clearTimeout(timer); after = go; timer = setTimeout(left, fallbackMs); },
    left,
    dispose() { clearTimeout(timer); timer = undefined; after = null; },
  };
}
