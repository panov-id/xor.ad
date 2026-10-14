// The face's address (owner 12.10.2026: "tabs + nested, without ids"). Each
// screen has a path that names the place, never what is open there: a card,
// a match, a chat, a table travel in history.state only, a structured copy the
// browser keeps for this tab — the URL is what gets copied, shared, logged and
// shown, so it carries no id and nothing of the person.
//
// No router library: the face is one switch over `Screen` (App.tsx), and this
// is the two-way map between it and location.pathname, in one table below.

import type { FeedCard } from "./screens/Feed.tsx";
import type { InboxChatRow, MatchRow } from "./screens/Inbox.tsx";
import type { Record_ } from "./vault.ts";

export type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
  | { at: "restore" }
  | { at: "unlock"; record: Record_ }
  | { at: "offer"; code: string }
  | { at: "feed" }
  | { at: "composer" }
  | { at: "card"; card: FeedCard }
  | { at: "likes" }
  | { at: "place" }
  | { at: "place-qr" }
  | { at: "inbox" }
  | { at: "match"; row: MatchRow }
  | { at: "chat"; row: InboxChatRow }
  | { at: "statements"; from: "feed" | "me" }
  | { at: "me" }
  | { at: "edit"; field: "name" | "age"; current: string }
  | { at: "change-pin" }
  | { at: "reissue" }
  | { at: "departure" }
  | { at: "hidden" }
  | { at: "table"; tableId: string; from?: "feed" | "tables" }
  | { at: "tables" }
  | { at: "new-table"; from: "feed" | "tables" }
  | { at: "blocked" }
  | { at: "arrival" }
  | { at: "reset" }
  | { at: "step-away" }
  | { at: "away"; until: number }
  | { at: "theme" }
  | { at: "legal" }
  | { at: "wizard"; from: "register" | "me" };

export type Tab = "feed" | "tables" | "inbox" | "me";
type At = Screen["at"];

// kind → [path, what opens from the path alone].
//   a Screen  — the path is enough to draw it (reload, a typed address);
//   a Tab     — the screen needs what only history.state holds (an object, a
//               value read on the way in): without it, its tab opens instead;
//   "entry"   — before an identity is open: a gate (App.tsx). It has a path of its own
//               and is pushed like any step (gateOf reads it back), but opens nothing
//               once seated.
// The offer's exit screen keeps its inbound link `/o/<code>` (W5): the code is
// the venue's printed link, not ours to rename, and it is entered before any identity.
export const ROUTES: Record<At, readonly [string, Screen | Tab | "entry"]> = {
  loading: ["/", "entry"],
  splash: ["/", "entry"],
  register: ["/register", "entry"],
  restore: ["/restore", "entry"],
  unlock: ["/unlock", "entry"],
  arrival: ["/arrival", "entry"],
  offer: ["/o", "entry"],
  feed: ["/feed", { at: "feed" }],
  composer: ["/write", { at: "composer" }],
  card: ["/card", "feed"],
  likes: ["/likes", { at: "likes" }],
  place: ["/place", { at: "place" }],
  "place-qr": ["/place/qr", { at: "place-qr" }],
  tables: ["/tables", { at: "tables" }],
  "new-table": ["/tables/new", { at: "new-table", from: "tables" }],
  table: ["/table", "tables"],
  inbox: ["/inbox", { at: "inbox" }],
  match: ["/match", "inbox"],
  chat: ["/chat", "inbox"],
  // The statements are read on the first entry into the feed; a bare path has none to show.
  statements: ["/statements", "me"],
  me: ["/me", { at: "me" }],
  theme: ["/me/theme", { at: "theme" }],
  // The field opens with the value the "me" screen read; without it, "me" reads it again.
  edit: ["/me/name", "me"],
  "change-pin": ["/me/pin", { at: "change-pin" }],
  reissue: ["/me/paper", { at: "reissue" }],
  hidden: ["/me/hidden", { at: "hidden" }],
  blocked: ["/me/blocked", { at: "blocked" }],
  legal: ["/me/legal", { at: "legal" }],
  "step-away": ["/me/away", { at: "step-away" }],
  // Away until a time the profile says: landing reads the profile again (App.tsx land).
  away: ["/away", "feed"],
  reset: ["/me/reset", { at: "reset" }],
  departure: ["/me/departure", { at: "departure" }],
  wizard: ["/me/wizard", { at: "wizard", from: "me" }],
};

export const TABS: readonly Tab[] = ["feed", "tables", "inbox", "me"];
export const isTab = (s: Screen): s is { at: Tab } => (TABS as readonly string[]).includes(s.at);
export const isEntry = (s: Screen): boolean => ROUTES[s.at][1] === "entry";

// The gates before an identity: the path names the gate (reload, Back, a typed
// address). Anything else is not a gate: a seated path asked for before sign-in.
export type Gate = "splash" | "register" | "restore" | "unlock" | "arrival";
const GATES: Record<string, Gate> = { "/": "splash", "/register": "register", "/restore": "restore", "/unlock": "unlock", "/arrival": "arrival" };
export function gateOf(path: string): Gate | null {
  return GATES[path.replace(/\/+$/, "") || "/"] ?? null;
}

export function pathOf(s: Screen): string {
  if (s.at === "edit") return `/me/${s.field}`;
  return ROUTES[s.at][0];
}

// What a path opens once an identity is open: the id-less screen it names, an
// object screen's tab, or the feed for "/" and anything unknown.
export function screenOf(path: string): Screen {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/me/age") return { at: "me" };
  for (const [, [route, opens]] of Object.entries(ROUTES)) {
    if (route !== p || opens === "entry") continue;
    return typeof opens === "string" ? { at: opens } : opens;
  }
  return { at: "feed" };
}

// The record a history entry carries: ours by `xor`, the page life (`seat`)
// that wrote it, its depth (`i`, 0 = the first entry of that seat — nothing of
// ours behind it), and the screen with its object.
export type Entry = { xor: 1; seat: string; i: number; screen: Screen };
export function entryOf(state: unknown): Entry | null {
  const e = state as Partial<Entry> | null;
  return e && e.xor === 1 && typeof e.seat === "string" && typeof e.i === "number" && e.screen ? (e as Entry) : null;
}
