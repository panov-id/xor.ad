import type { InboxChatRow } from "../../../../depth/web-platform/chat/keys.ts";
// w3_inbox's rules, kept out of the screen: offers to talk (the strip on top) and talks (the rows below) from one
// GET /inbox?since page (web Inbox.tsx), what is new since the last look, and the ring — the minutes a talk has
// before an hour of silence ends it (§8.12: «a talk fades after an hour of silence»).
export interface OfferRow {
  kind: "match"; id: string; name: string; age: number;
  waiting_for_you: boolean; arrived_since?: boolean; answered_since?: boolean;
}
export interface TalkRow {
  kind: "chat"; id: string; name: string; age: number; state: "open" | "ended";
  chat_expires_at: number; my_span?: number; opened_since?: boolean; pending_messages?: number; last_activity_at?: number;
}
type Say = (key: string, values?: Record<string, string | number>) => string;
export type Row = OfferRow | TalkRow | { kind: string };

export const SILENCE = 60 * 60;

export function splitInbox(rows: Row[]): { offers: OfferRow[]; talks: TalkRow[] } {
  return {
    offers: rows.filter((r): r is OfferRow => r.kind === "match"),
    talks: rows.filter((r): r is TalkRow => r.kind === "chat"),
  };
}

// The web's marks (Inbox.tsx marksOf): an offer arrived or answered, a talk opened or with lines waiting.
export function isFresh(r: OfferRow | TalkRow): boolean {
  return r.kind === "match" ? Boolean(r.arrived_since || r.answered_since) : Boolean(r.opened_since || (r.pending_messages ?? 0) > 0);
}

// An ended talk has no ring; an open one the whole minutes left (never 0 while it lives), its share of the hour.
export function ringOf(t: TalkRow, now: number): { minutes: number; share: number } | null {
  if (t.state === "ended") return null;
  const left = Math.max(0, Math.min(SILENCE, t.chat_expires_at - now));
  if (left === 0) return null;
  return { minutes: Math.ceil(left / 60), share: left / SILENCE };
}

// The line under a talk's name: lines waiting for me first, then an ended talk, then an open one. Short words, not the
// web's span line (Inbox.tsx «goes out after 1 h of your silence»): the line runs one row under the name, and the
// ring beside it already tells the minutes.
export function lineOf(t: TalkRow, say: Say): string {
  if ((t.pending_messages ?? 0) > 0) return say("web.inbox.waits_you");
  return say(t.state === "ended" ? "app.talks.closed" : "app.talks.open");
}

// ── w3_likes: what I am in on (GET /likes, the node's routes/likes.ts) ──
export interface LikedRow {
  id: string; text: string; mode: string; lang?: string; lat?: number; lon?: number; like_count: number;
  state: "liked" | "matched"; liked_at: number; soon?: boolean; offer?: { discount_value: string };
}

// Metres between two points on the sphere (haversine; the earth's mean radius).
export function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180, R = 6_371_000;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// A distance as the feed says one (web.feed.m / web.feed.km): metres to the ten under a kilometre (never 0 — a phrase
// next door is 10 m), kilometres with one decimal under ten, whole ones above.
export function distanceWord(m: number): { key: "web.feed.m" | "web.feed.km"; n: number } {
  if (m < 995) return { key: "web.feed.m", n: Math.max(10, Math.round(m / 10) * 10) };
  const km = m / 1000;
  return { key: "web.feed.km", n: km < 9.95 ? Math.round(km * 10) / 10 : Math.round(km) };
}

// The hand on a liked card takes the like back — not once a match came of it (the node answers `spent`), never on a
// private author's offer (web Likes.tsx).
export function canTakeBack(r: LikedRow, spent: boolean): boolean {
  return r.state === "liked" && !r.offer && !spent;
}

// ── w3_match, w3_match-waiting: what a match shows (web useMatch.ts) ──
export interface MatchRow extends OfferRow {
  phrase: { text: string; mode: string; expires_at?: number };
  my_phrase?: { text: string; mode: string; expires_at?: number };
  // I agreed and wait (P10); "gone" since Q9: I agreed and the other said "not now".
  my_consent?: "waiting" | "none" | "gone";
}
export type MatchView = "offer" | "they-agreed" | "declined" | "waiting" | "gone";

// The node's word first (after a reload a match I agreed to waits, W7), then what was done on this screen.
export function matchView(row: MatchRow, here: { agreed: boolean; declined: boolean; gone?: boolean }): MatchView {
  const waiting = here.agreed || row.my_consent === "waiting" || row.my_consent === "gone";
  if (waiting) return (here.gone ?? row.my_consent === "gone") ? "gone" : "waiting";
  if (here.declined) return "declined";
  return row.waiting_for_you ? "they-agreed" : "offer";
}

// A wait's look at the inbox (web useMatch, every 5 s): my yes is gone once the other said "not now" (my_consent
// "gone", Q9); their undo brings it back. A match no longer listed tells nothing new: the last word stands.
export function goneIn(rows: Row[], matchId: string, was: boolean): boolean {
  const mine = rows.find((r): r is MatchRow => r.kind === "match" && (r as MatchRow).id === matchId);
  return mine ? mine.my_consent === "gone" : was;
}

// ── a talk's row into the chat (App.tsx openChat, depth/web-platform/chat/keys.ts InboxChatRow) ──
// The inbox reads the node's whole row; TalkRow above is the few fields the list draws. The chat needs the rest — the
// keys' part (me, key_epoch, the peer's public key) and my span — so a row opens a chat only when the node gave them;
// one without is not passed on half-made (null: its row takes no press).
export function chatRowOf(row: Row): InboxChatRow | null {
  const r = row as Partial<InboxChatRow> & { kind: string };
  const peer = r.peer as Partial<InboxChatRow["peer"]> | undefined;
  const ok = r.kind === "chat" && typeof r.id === "string" && typeof r.me === "string" && typeof r.key_epoch === "number"
    && typeof r.name === "string" && typeof r.age === "number" && (r.state === "open" || r.state === "ended")
    && typeof r.chat_expires_at === "number" && typeof r.my_span === "number"
    && !!peer && typeof peer.identity_id === "string" && typeof peer.identity_public_key === "string" && typeof peer.key_epoch === "number";
  return ok ? (row as InboxChatRow) : null;
}
