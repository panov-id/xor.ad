// The move of an identity between devices, as the web asks it (T1; chat spec
// §8.2, screen 13): the core's Departure and Arrival (depth/core/
// transfer_move.ts), the terminal's words for each outcome (depth/ink/move.ts
// endings), and the pace the state is asked at.

import { useEffect, useRef } from "react";
import type { MoveState } from "../../../depth/core/transfer_move.ts";

export const MOVE_POLL_MS = 2_000;

// What ends a move on either screen, in the terminal's words.
export const ENDINGS: Partial<Record<MoveState, string>> = {
  rejected: "move.rejected",
  cancelled: "move.twice",
  expired: "move.expired",
  garbled: "move.garbled",
};

// The name this device gives itself in its claim: the other device shows it
// and nobody can check it (§8.2), so the browser's own words will do.
export function browserLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "браузер";
  const system = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return system ? `${browser}, ${system}` : browser;
}

// Every `ms` while `on`, and never over itself: a tick that finds the last ask
// still out skips (depth/ink/move.ts useEvery).
export function useEvery(ms: number, tick: () => Promise<unknown> | undefined, on: boolean): void {
  const busy = useRef(false);
  const latest = useRef(tick);
  latest.current = tick;
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => {
      if (busy.current) return;
      const running = latest.current();
      if (!running) return;
      busy.current = true;
      void running.finally(() => { busy.current = false; });
    }, ms);
    return () => clearInterval(timer);
  }, [ms, on]);
}
