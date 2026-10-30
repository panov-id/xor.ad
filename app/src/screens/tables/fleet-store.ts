// The fleet being placed, shared by the board (draws it) and the strip under the panel (shuffles and sends it).
// A fresh fleet is dealt each time the first of them mounts: a new table or a rematch never repeats the fleet
// the other side already shot at (review panel 27.10.2026, security lens).
export function placingStore<T>(deal: () => T) {
  let fleet = deal();
  const listeners = new Set<() => void>();
  return {
    subscribe(f: () => void) {
      if (listeners.size === 0) fleet = deal();
      listeners.add(f);
      return () => { listeners.delete(f); };
    },
    get: () => fleet,
    set(next: T) { fleet = next; listeners.forEach((g) => g()); },
  };
}
