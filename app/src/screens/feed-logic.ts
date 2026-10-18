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
  kind?: string;
  offer?: { discount_value: string; conditions?: string | null; venue_name?: string; redirect?: string; redirect_disabled?: boolean };
  soon?: boolean;
  /** The viewer's own like, kept in the feed: marked, not hidden (owner 15.10.2026). */
  liked?: boolean;
}

/** What left the feed on the card: hidden (with the handle that brings it back), or its author blocked. */
export type Gone = { why: "hidden" | "blocked"; id: string; handle?: string };

/** The next, wider circle; null at the widest. */
export function widerRadius(r: Radius): Radius | null {
  const i = RADII.indexOf(r);
  return i >= 0 && i < RADII.length - 1 ? RADII[i + 1] : null;
}

/** A radius as a dictionary key and its number: metres under a kilometre, kilometres from it (web.feed.m / web.feed.km). */
export function radiusWord(r: Radius): { key: "web.feed.m" | "web.feed.km"; n: number } {
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
export type Tone = "lime" | "yellow" | "peach" | "coral";
const TONES: Tone[] = ["lime", "yellow", "peach"];
export const toneOf = (card: FeedCard, index: number): Tone => (card.offer || card.kind === "offer" ? "coral" : TONES[index % TONES.length]);

/** The discount as the card writes it: the author's free text, any leading minus dropped, ours added (web ui/offer.ts). */
export const offerLabel = (discount: string): string => "−" + discount.trim().replace(/^[-−–—‒﹣－]+\s*/u, "");

/** The answer to a like (POST /feed/:id/like): liked, matched with a match to talk in, or a refusal with its cause. */
export type LikeOutcome =
  | { state: "liked" }
  | { state: "matched"; matchId?: string }
  | { state: "refused"; cause: "stepped_away" | "rapid" | "other"; status: number };

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
