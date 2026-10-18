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
