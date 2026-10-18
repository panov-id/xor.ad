// The gates before an identity, as web/src/router.ts has them (same paths, same
// Gate names, same history entries), cut to the screens this shell has so far.
// No router library: the shell is one switch over `Screen` (shell/App.tsx).
// Entries the web has and this shell has not yet (chat, tables ...) are
// added with their screens. "feed" is where a registration or an unlock lands (a seat, not a gate: a reload on
// it asks the PIN when the device keeps an identity, and opens the splash when it keeps none, as the web does).
import type { Record_ } from "@sdk/enroll.ts";
import type { MatchRow } from "./screens/talks/talks-logic";
// The path, not @sdk: node:test (run-app-unit-tests.sh) has no aliases.
import { codeOfPath } from "../../depth/core/offer_exit.ts";
import type { Radius } from "@sdk/client.ts";
import type { InboxChatRow } from "@platform/chat/keys.ts";

export type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
  | { at: "restore" }
  | { at: "arrival" }
  | { at: "unlock"; record: Record_ }
  | { at: "feed" }
  | { at: "departure" }
  | { at: "away"; until: number }
  | { at: "me" }
  | { at: "inbox" }
  | { at: "likes" }
  | { at: "match"; row: MatchRow }
  | { at: "tables" }
  | { at: "new-table"; game?: string }
  | { at: "table"; id: string }
  | { at: "offer"; code: string }
  // A chat travels in history.state only (web router.ts): the row is a structured copy, never in the address.
  | { at: "chat"; row: InboxChatRow }
  // The phrase for the feed (web /write), with the feed's circle it opened from.
  | { at: "composer"; radius: Radius };

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
  me: "/me",
  inbox: "/inbox",
  likes: "/likes",
  match: "/match",
  tables: "/tables",
  "new-table": "/tables/new",
  table: "/table",
  offer: "/o",
  chat: "/chat",
  composer: "/write",
};

// A path names a gate (reload, Back, a typed address); anything else is not one.
export type Gate = "splash" | "register" | "restore" | "unlock" | "arrival";
const GATES: Record<string, Gate> = { "/": "splash", "/register": "register", "/restore": "restore", "/unlock": "unlock", "/arrival": "arrival" };

export function gateOf(path: string): Gate | null {
  return GATES[path.replace(/\/+$/, "") || "/"] ?? null;
}

export const pathOf = (s: Screen): string => (s.at === "offer" ? `/o/${s.code}` : ROUTES[s.at]);

/** A seat's own address (an identity on the page): /move is the departure, /me is Me, /away the away screen, /inbox, /likes,
 * /match the talks, /tables the tables, /tables/new the wizard, /chat the chat its entry carries, /write the composer;
 * anything else is the feed. */
export const seatScreen = (path: string, state?: { until?: number; game?: string; row?: MatchRow | InboxChatRow; id?: string; radius?: Radius } | null): Screen => {
  const p = path.replace(/\/+$/, "");
  const offer = codeOfPath(p);
  if (offer) return { at: "offer", code: offer };
  if (p === ROUTES.departure) return { at: "departure" };
  if (p === ROUTES.me) return { at: "me" };
  if (p === ROUTES.inbox) return { at: "inbox" };
  if (p === ROUTES.likes) return { at: "likes" };
  // A match rides in its history entry, as the web's (web/src/router.ts): without it (a typed /match) the inbox.
  if (p === ROUTES.match) return state?.row?.kind === "match" ? { at: "match", row: state.row as MatchRow } : { at: "inbox" };
  if (p === ROUTES.tables) return { at: "tables" };
  if (p === ROUTES["new-table"]) return typeof state?.game === "string" ? { at: "new-table", game: state.game } : { at: "new-table" };
  // A table rides in its history entry (its id), as the web's: without one (a typed /table) the list.
  if (p === ROUTES.table) return typeof state?.id === "string" && state.id ? { at: "table", id: state.id } : { at: "tables" };
  // A chat's entry without its row (a typed /chat, a reload: the row is not kept on the disk) is the feed.
  if (p === ROUTES.chat && state?.row?.kind === "chat") return { at: "chat", row: state.row as InboxChatRow };
  if (p === ROUTES.composer) return { at: "composer", radius: state?.radius ?? 1000 };
  // The away screen's until rides in its history entry (App.tsx awayCheck); a lapsed one is the feed.
  if (p === ROUTES.away && typeof state?.until === "number" && state.until > Date.now() / 1000) return { at: "away", until: state.until };
  return { at: "feed" };
};

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
