// The feed's pure part (w1_feed, w1_feed-hidden-return, w1_feed-blocked, w2_feed-empty): what a page of the node's
// answer becomes on the screen. The node's own calls are the SDK's (@sdk/client.ts feed, hide, unhide, blockByPhrase,
// like); this file only decides what is drawn from what came back. Web does the same inline (web screens/Feed.tsx,
// screens/logic/useFeed.ts, api/actions.ts likePhrase) — here it is a function a test can call.
import type { Radius } from "@sdk/client.ts";

export const RADII: Radius[] = [100, 300, 1000, 3000, 10000];
/** How long «hidden · return» stands on the feed (owner, 14.10.2026; web Feed.tsx UNDO_HIDE_S = 5). */
export const UNDO_HIDE_MS = 5000;

/** One item of GET /feed as the node delivers it (relay routes/feed.ts deliver): no distance, no age — by design. */
export interface FeedCard {
  id: string;
  text: string;
  mode: string;
  lang: string;
  like_count: number;
  /** The phrase's centre as published, rounded to the grid of its radius (relay routes/feed.ts: lat_published). */
  lat?: number;
  lon?: number;
  kind?: string;
  offer?: { discount_value: string; conditions?: string | null; venue_name?: string; promo_code?: string; redirect?: string; redirect_disabled?: boolean };
  soon?: boolean;
  /** The viewer's own like, kept in the feed: marked, not hidden (owner 15.10.2026). */
  liked?: boolean;
  /** The live match the viewer is in out of this card, by id (relay routes/feed.ts match_id, owner 02.11.2026): screen 52 after a reload. */
  match_id?: string;
  /** A table between the phrases (kind "table"): what GET /feed delivers of it (web Feed.tsx, tables/TableCard). */
  name?: string | null;
  game?: string;
  set?: string;
  playing?: number;
  watching?: number;
  free_seats?: number;
  /** The node found nothing in the asked circle and took this card from a wider one (relay routes/feed.ts:576). */
  farther_than_asked?: boolean;
}

/** The circle the node really used, when it grew the asked one because that was empty (relay routes/feed.ts:620,
 * radius_used); null when it kept the asked one. The screen must say so, or far phrases pass for near ones. */
export function widenedTo(asked: Radius, page: { radius_used?: unknown }): number | null {
  const used = page.radius_used;
  return typeof used === "number" && used > asked ? used : null;
}

/** The last circle the feed grew to, kept for the place screen's map (docs/newdesign4 screen 29: «Quiet within 1 km —
 * the feed shows 25 km for now»): the asked radius and what the node used, or null when it kept the asked one. */
let lastWidened: { asked: number; used: number } | null = null;
export function noteWidened(asked: number, used: number | null): void { lastWidened = used === null ? null : { asked, used }; }
/** The circle the feed grew to, when the map's radius is the one the feed asked with; null otherwise. */
export function widenedFor(asked: number): number | null { return lastWidened && lastWidened.asked === asked ? lastWidened.used : null; }

/** What left the feed on the card: hidden (with the handle that brings it back), or its author blocked. */
export type Gone = { why: "hidden" | "blocked"; id: string; handle?: string };

/** The next, wider circle; null at the widest. */
export function widerRadius(r: Radius): Radius | null {
  const i = RADII.indexOf(r);
  return i >= 0 && i < RADII.length - 1 ? RADII[i + 1] : null;
}

/** A radius as a dictionary key and its number: metres under a kilometre, kilometres from it (web.feed.m / web.feed.km). */
export function radiusWord(r: number): { key: "web.feed.m" | "web.feed.km"; n: number } {
  return r >= 1000 ? { key: "web.feed.km", n: r / 1000 } : { key: "web.feed.m", n: r };
}

/** What the page's cards are: a table is not a phrase (this shell has no table yet), the card that left is gone. */
export function visibleCards(items: readonly FeedCard[], gone: Gone | null): FeedCard[] {
  return items.filter((c) => c.kind !== "table" && c.id !== gone?.id);
}

/** A page after the cursor joins the list; the first page replaces it. A card seen twice (a page edge) is drawn once. */
export function mergePage(was: readonly FeedCard[], page: readonly FeedCard[], after?: string): FeedCard[] {
  if (!after) return [...page];
  const seen = new Set(was.map((c) => c.id));
  return [...was, ...page.filter((c) => !seen.has(c.id))];
}

/** The tile's colour, in the sheets' order (w1_feed: lime, yellow, peach); an offer is coral. */
/** The phrase's size by its length in graphemes (owner 2026-10-26, NEWDESIGN_PLAN §5): up to 40 large, 41–100 middle,
 * longer as before. Graphemes, so a Georgian word or an emoji family counts as a person sees it. */
export type TextSize = "l" | "m" | "s";
export function textSize(text: string): TextSize {
  const n = typeof Intl !== "undefined" && "Segmenter" in Intl ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length : [...text].length;
  return n <= 40 ? "l" : n <= 100 ? "m" : "s";
}

/** The tile's words of screen 283 (nd4/screens/feed-tile.gen.tsx): the distance from the viewer's place to the
 * phrase's published centre, the serif's size by the length, and the fade bar. The node never sends another
 * person's remaining time, only `soon` in the last 65 minutes (§8.11, owner 23.09.2026): the bar is full until then
 * and short after. A card with no point says no distance. The sizes are the archive's (FEED_TILE_FS). */
export function tileFade(card: FeedCard): string { return card.soon ? "15%" : "100%"; }
// Owner 06.11.2026: no chosen place, no distance — the fallback point would give a made-up number.
export function tileMetres(card: FeedCard, at: { lat: number; lon: number; chosen?: boolean } | null): number | null {
  if (!at || at.chosen === false || typeof card.lat !== "number" || typeof card.lon !== "number") return null;
  const rad = Math.PI / 180, R = 6_371_000;
  const dLat = (card.lat - at.lat) * rad, dLon = (card.lon - at.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(at.lat * rad) * Math.cos(card.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Tone = "lime" | "yellow" | "peach" | "coral";
const TONES: Tone[] = ["lime", "yellow", "peach"];
export const toneOf = (card: FeedCard, index: number): Tone => (card.offer || card.kind === "offer" ? "coral" : TONES[index % TONES.length]);

/** The landing's report page for a venue's offer: the storefront is the one the node gave in the offer's link. E-mail and code live on that page. */
export const offerReportUrl = (id: string, redirect?: string): string | null => {
  const host = redirect?.split("/o/")[0];
  if (!host) return null;
  return `${/^https?:\/\//.test(host) ? host : `https://${host}`}/report.html?kind=offer&id=${encodeURIComponent(id)}`;
};

/** The discount as the card writes it: the author's free text, any leading minus dropped, ours added (web ui/offer.ts). */
export const offerLabel = (discount: string): string => "−" + discount.trim().replace(/^[-−–—‒﹣－]+\s*/u, "");

/** The answer to a like (POST /feed/:id/like): liked, matched with a match to talk in, or a refusal with its cause. */
export type LikeOutcome =
  | { state: "liked" }
  | { state: "matched"; matchId?: string }
  | { state: "refused"; cause: "stepped_away" | "rapid" | "other"; status: number };

/** The card's match as the feed row delivers it: the same outcome a like's answer gives, so the card opens on card-both after a reload (screen 52). */
export function matchOf(card: { match_id?: string }): LikeOutcome | null {
  return typeof card.match_id === "string" && card.match_id !== "" ? { state: "matched", matchId: card.match_id } : null;
}

export function likeOutcome(status: number, body: unknown): LikeOutcome {
  const b = (body ?? {}) as { state?: string; match_id?: string; error?: { code?: string } };
  if (status === 200 && b.state === "matched") return { state: "matched", matchId: b.match_id };
  if (status === 200) return { state: "liked" };
  if (status === 409 && b.error?.code === "stepped_away") return { state: "refused", cause: "stepped_away", status };
  if (status === 429) return { state: "refused", cause: "rapid", status };
  return { state: "refused", cause: "other", status };
}

/** The card with the like it just got counted in (the node's count comes with the next page). */
export function withLike(card: FeedCard): FeedCard {
  return card.liked ? card : { ...card, liked: true, like_count: card.like_count + 1 };
}

/** The like taken back (card-in «Take back», DELETE /feed/:id/like answered «unliked»): the count one less, never below none. */
export function withoutLike(card: FeedCard): FeedCard {
  return card.liked ? { ...card, liked: false, like_count: Math.max(card.like_count - 1, 0) } : card;
}

/** card-need: one's own phrase is live while its end is ahead (a phrase waiting for the queue has no end yet, takes no slot). */
export function ownLive(phrases: Array<{ expires_at?: number }> | undefined, nowMs: number): boolean {
  return (phrases ?? []).some((f) => f.expires_at !== undefined && f.expires_at * 1000 > nowMs);
}

/** The language of a card as a person reads it; "und" (the node could not tell) is no word. */
export function langOf(lang: string | undefined): string | undefined {
  return !lang || lang === "und" ? undefined : lang;
}

/** The history entry an open card stands on: the feed's own entry (gate, i) one step deeper, with the card's id. */
export function cardEntry(was: unknown, id: string): { gate: string; i: number; card: string } {
  const w = (was ?? {}) as { gate?: unknown; i?: unknown };
  return { gate: typeof w.gate === "string" ? w.gate : "feed", i: typeof w.i === "number" ? w.i + 1 : 1, card: id };
}

/** The card a history entry stands for; null on any entry that is not a card's (so Back, which lands on one, closes the card). */
export function cardOf(state: unknown): string | null {
  const card = (state as { card?: unknown } | null)?.card;
  return typeof card === "string" && card !== "" ? card : null;
}

/** The entry with its card dropped: a card entry left over from before a reload stands for nothing on screen. */
export function withoutCard(state: unknown): unknown {
  if (!cardOf(state)) return state;
  const { card: _card, ...rest } = state as { card: string };
  return rest;
}

// ── the header's search, the tables between phrases, the density line, my own sent phrase, the matched card ──

/** Whether a phrase (or a table by its name) holds what was typed in the header's search: trimmed, case dropped, an empty query holds all. */
export function matchesQuery(card: FeedCard, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  return (card.kind === "table" ? card.name ?? "" : card.text).toLocaleLowerCase().includes(q);
}

/** One drawn item of the list: a phrase with its tile colour, or a table (tone null: the table's own face). */
export type FeedRow = { card: FeedCard; tone: Tone | null };

/**
 * What the list draws, in the node's order: phrases and the tables between them. The tone counts phrases only, so a table
 * between two phrases does not shift the colours (w1_feed: lime, yellow, peach); the card that left is gone; the search holds.
 */
export function feedRows(items: readonly FeedCard[], gone: Gone | null, query = ""): FeedRow[] {
  const rows: FeedRow[] = [];
  let phrases = 0;
  for (const card of items) {
    if (card.id === gone?.id || !matchesQuery(card, query)) continue;
    if (card.kind === "table") { rows.push({ card, tone: null }); continue; }
    rows.push({ card, tone: toneOf(card, phrases) });
    phrases += 1;
  }
  return rows;
}

/** The steps of GET /feed/density, from nobody to hundreds; never a number (§8.3). */
export const STEPS = ["none", "few", "about_ten", "tens", "hundreds"] as const;
export type Step = (typeof STEPS)[number];

/** The step the node answered; null for a refusal (the caller keeps the last step it had) or a word that is no step. */
export function stepOf(status: number, body: unknown): Step | null {
  const step = (body as { step?: unknown } | null)?.step;
  return status === 200 && typeof step === "string" && (STEPS as readonly string[]).includes(step) ? (step as Step) : null;
}

/** The dictionary key of a step's words (web.nearby.*). */
export const stepKey = (step: Step): string => `web.nearby.${step}`;

/** One's own phrase just sent, with the node's verdict: out in the feed, or read first (checking) (web Feed.tsx `sent`). */
export type SentPhrase = { state: "published" | "checking"; text: string; id?: string };

/** The sent phrase from what the composer returned; the id is kept only while the node gave one (no id, no way to take it down). */
export function sentOf(sent: { state: string; id?: string }, text: string): SentPhrase {
  return { state: sent.state === "published" ? "published" : "checking", text, ...(sent.id ? { id: sent.id } : {}) };
}

/** feed.phrase.span of the node (relay/node/src/lib/feed_verdict.ts PHRASE_SPAN, 4 h 20 min), in minutes: the whole length of one's own fade line. */
export const PHRASE_SPAN_MIN = 260;
/** What is left of one's own phrase, rounded up to a minute; null with no end yet (still checked) or past it. Only the author's own end is ever shown (§8.11). */
export function ownLeft(expiresAt: number | undefined, nowMs: number): { h: number; m: number; left: number } | null {
  if (expiresAt === undefined || expiresAt * 1000 <= nowMs) return null;
  const left = Math.ceil((expiresAt * 1000 - nowMs) / 60000);
  return { h: Math.floor(left / 60), m: left % 60, left };
}
/** One's own published phrase past its end (screen 39); a phrase still checked has no end and has not faded. */
export const ownFaded = (expiresAt: number | undefined, nowMs: number): boolean => expiresAt !== undefined && expiresAt * 1000 <= nowMs;
/** The fade line's fill for that many minutes left. */
export const ownFade = (left: number): string => `${Math.min(100, Math.round((left / PHRASE_SPAN_MIN) * 100))}%`;

/** The answer to DELETE /feed/:id: 204 is down, anything else is a refusal with the node's number. */
export const takedownVerdict = (status: number): { ok: true } | { ok: false; status: number } => (status === 204 ? { ok: true } : { ok: false, status });

/** The name of the one who is in on my phrase too: the match's row in the inbox, by the id the like answered with; null while unknown. */
export function peerName(rows: ReadonlyArray<Record<string, unknown>>, matchId: string | undefined): string | null {
  if (!matchId) return null;
  const row = rows.find((r) => r.id === matchId && r.kind === "match");
  return typeof row?.name === "string" && row.name.trim() !== "" ? row.name : null;
}
