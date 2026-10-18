// The gates before an identity, as web/src/router.ts has them (same paths, same
// Gate names, same history entries), cut to the screens this shell has so far.
// No router library: the shell is one switch over `Screen` (shell/App.tsx).
// Entries the web has and this shell has not yet (chat, tables ...) are
// added with their screens. "feed" is where a registration or an unlock lands (a seat, not a gate: a reload on
// it asks the PIN when the device keeps an identity, and opens the splash when it keeps none, as the web does).
import type { Record_ } from "@sdk/enroll.ts";

export type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
  | { at: "restore" }
  | { at: "arrival" }
  | { at: "unlock"; record: Record_ }
  | { at: "feed" }
  | { at: "departure" }
  | { at: "away"; until: number };

type At = Screen["at"];

export const ROUTES: Record<At, string> = {
  loading: "/",
  splash: "/",
  register: "/register",
  restore: "/restore",
  arrival: "/arrival",
  unlock: "/unlock",
  feed: "/feed",
  departure: "/move",
  away: "/away",
};

// A path names a gate (reload, Back, a typed address); anything else is not one.
export type Gate = "splash" | "register" | "restore" | "unlock" | "arrival";
const GATES: Record<string, Gate> = { "/": "splash", "/register": "register", "/restore": "restore", "/unlock": "unlock", "/arrival": "arrival" };

export function gateOf(path: string): Gate | null {
  return GATES[path.replace(/\/+$/, "") || "/"] ?? null;
}

export const pathOf = (s: Screen): string => ROUTES[s.at];

/** A seat's own address (an identity on the page): /move is the departure; anything else is the feed. */
export const seatScreen = (path: string): Screen => (path.replace(/\/+$/, "") === ROUTES.departure ? { at: "departure" } : { at: "feed" });

/**
 * The gate's screen for a path (web App.tsx gateScreen): /restore is always itself (the unlock offers it);
 * a device that keeps an identity (`record`) opens the PIN on any other path, and one does not register over it;
 * with none, /register and /arrival are themselves and anything else is the splash.
 */
export function gateScreen(path: string, record: Record_ | null = null): Screen {
  const g = gateOf(path);
  if (g === "restore") return { at: "restore" };
  if (record) return { at: "unlock", record };
  if (g === "register" || g === "arrival") return { at: g };
  return { at: "splash" };
}
