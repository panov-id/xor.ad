// The move of an identity between devices, as the web asks it (T1; chat spec
// §8.2, screen 13): the core's Departure and Arrival (depth/core/
// transfer_move.ts), the screens' rules shared with the terminal and the app
// shell (depth/core/move_flow.ts: the endings, the claim's refusals, the pace
// guard, the browser's name for itself), and the pace the state is asked at.

import { useEffect, useRef } from "react";
import { deviceLabel, MOVE_ENDINGS, oneAtATime } from "../../../depth/core/move_flow.ts";
import { say } from "../locales/say.ts";

export const MOVE_POLL_MS = 2_000;

// What ends a move on either screen, in the terminal's words (move_flow.ts).
export const ENDINGS = MOVE_ENDINGS;

// The name this device gives itself in its claim: the other device shows it
// and nobody can check it (§8.2), so the browser's own words will do.
export function browserLabel(): string {
  return deviceLabel(navigator.userAgent, say("web.transfer.browser"));
}

// Every `ms` while `on`, and never over itself: a tick that finds the last ask
// still out skips (move_flow.ts oneAtATime, as depth/ink/move.ts useEvery).
export function useEvery(ms: number, tick: () => Promise<unknown> | undefined, on: boolean): void {
  const latest = useRef(tick);
  latest.current = tick;
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(oneAtATime(() => latest.current()), ms);
    return () => clearInterval(timer);
  }, [ms, on]);
}
