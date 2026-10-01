// Five minutes without input and the page locks (W13-WL; the storefronts'
// screen 12, docs/depth-client_RU.md the paragraph of 2026-09-17), as the
// terminal does on depth/core/lock.ts IdleTimer. Input is a key, a pointer, a
// touch or a wheel anywhere in the document; nothing else counts — the clock
// of a tab left open runs down whatever the node sends.
//
// The wait is a parameter: the stand's build (VITE_STAND=1) reads it from
// sessionStorage "xor-idle-ms" so a test does not sit through five minutes;
// a real page never reads it.

import { IDLE_MS, IdleTimer } from "../../depth/core/lock.ts";

const KEY = "xor-idle-ms";
const INPUTS = ["keydown", "pointerdown", "touchstart", "wheel"] as const;

export function idleMsOf(): number {
  if (import.meta.env.VITE_STAND !== "1") return IDLE_MS;
  const given = Number(sessionStorage.getItem(KEY) ?? "");
  return Number.isFinite(given) && given >= 500 ? given : IDLE_MS;
}

// Starts the clock; every input starts it over; `stop` takes the listeners
// off and lets the clock go.
export function watchIdle(onIdle: () => void, ms = idleMsOf()): { stop(): void } {
  const timer = new IdleTimer(onIdle, ms);
  const touch = () => timer.touch();
  for (const type of INPUTS) document.addEventListener(type, touch, { passive: true, capture: true });
  return {
    stop() {
      timer.stop();
      for (const type of INPUTS) document.removeEventListener(type, touch, { capture: true });
    },
  };
}
