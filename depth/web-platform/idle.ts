// Five minutes without input and the page locks (W13-WL; the storefronts' screen 12, docs/depth-client_RU.md
// the paragraph of 2026-09-17), as the terminal does on depth/core/lock.ts IdleTimer. Input is a key, a
// pointer, a touch or a wheel anywhere in the document; nothing else counts — the clock of a tab left open
// runs down whatever the node sends. The same inputs stamp the reload grace's clock (grace.ts), once a second
// at most.
//
// The wait is the face's parameter: the stand's build (VITE_STAND=1) reads it from sessionStorage
// "xor-idle-ms" so a test does not sit through five minutes; a real page never reads it.
//
// Moved out of web/src/idle.ts on 17.10.2026: the web and the app shell watch the same inputs.
import { IDLE_MS, IdleTimer } from "../core/lock.ts";

const KEY = "xor-idle-ms";
const INPUTS = ["keydown", "pointerdown", "touchstart", "wheel"] as const;

/** The idle wait: the real one, or (stand build only) the one sessionStorage "xor-idle-ms" gives, at least 500 ms. */
export function idleMsOf(stand: boolean): number {
  if (!stand) return IDLE_MS;
  const given = Number(sessionStorage.getItem(KEY) ?? "");
  return Number.isFinite(given) && given >= 500 ? given : IDLE_MS;
}

// Starts the clock; every input starts it over; `stop` takes the listeners off and lets the clock go.
export function watchIdle(onIdle: () => void, stampGrace: () => void, ms: number): { stop(): void } {
  const timer = new IdleTimer(onIdle, ms);
  let stamped = 0;
  const touch = () => {
    timer.touch();
    const now = Date.now();
    if (now - stamped >= 1000) { stamped = now; stampGrace(); }
  };
  for (const type of INPUTS) document.addEventListener(type, touch, { passive: true, capture: true });
  return {
    stop() {
      timer.stop();
      for (const type of INPUTS) document.removeEventListener(type, touch, { capture: true });
    },
  };
}
