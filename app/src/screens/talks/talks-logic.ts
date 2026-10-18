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
