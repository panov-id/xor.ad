// What the web face asks of the node, over the one core (depth/core/client.ts):
// nothing here signs, encodes or names a path — the Client does, as it does for
// the terminal. This file turns the Client's answers into what a screen shows:
// a phrase sent or refused in the words of docs/refusal-wordings_RU.md §3–§5,
// a like's state, a hide's handle, a block's silence.
//
// The words are Russian for now, as the skeleton's screens are: the seventeen
// locales of depth/ink are the owner's texts, and the web face joins them when
// its strings are lifted out (W2, 2026-09-26).

import { LANG, say } from "../locales/say.ts";
import type { Answer, Client, Liked, Radius } from "../../../depth/core/client.ts";
import { fromRefusal } from "../../../depth/core/legal.ts";

export type Mode = "alone" | "company" | "party";
// Made when asked (W14), so the labels are in the page's language of the moment.
export const modes = (): Array<{ value: Mode; label: string }> => [
  { value: "alone", label: say("web.mode.alone") },
  { value: "company", label: say("web.mode.company") },
  { value: "party", label: say("web.mode.party") },
];

// What the node said back to a phrase (§8.3; P1): out at once, or read by a
// person first, or refused — with the reason a person can act on.
export type Sent =
  | { state: "published"; id: string }
  | { state: "checking"; id: string }
  | { state: "refused"; why: string };

const hhmm = (seconds: unknown) =>
  typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "?";

// The refusals of a moment, word for word from docs/refusal-wordings_RU.md
// (§4 the pause, §5 the rest) as depth/ink/locales/ru.json carries them —
// texts for people are the owner's, none is made up here. The text stays in
// the field. The node sends no time for "four live" (routes/feed.ts:135
// answers {live} alone): as depth/ink/rooms.ts does, the moment is read from
// one's own phrases in the profile.
export async function refusalWording(client: Client, answer: Answer): Promise<string> {
  const error = (answer.body as { error?: { code?: string; message?: string; until?: number; next_slot?: number; checking?: unknown; live?: unknown } } | null)?.error;
  if (answer.status === 429 && error?.until !== undefined) {
    return say("write.paused", { time: hhmm(error.until) });
  }
  if (answer.status === 429 && error?.next_slot !== undefined) return say("write.hourly", { time: hhmm(error.next_slot) });
  if (answer.status === 429) return say("write.rapid");
  if (answer.status === 409 && error?.checking !== undefined) return say("write.hold");
  if (answer.status === 409 && error?.live !== undefined) {
    const ends = ((await client.profile().catch(() => null))?.phrases ?? [])
      .map((p) => p.expires_at)
      .filter((n): n is number => typeof n === "number");
    return say("write.live", { time: ends.length ? hhmm(Math.min(...ends)) : "?" });
  }
  if (answer.status === 409 && error?.code === "stepped_away") return say("away.line");
  // The node's legal gate (W13-LN, behind LEGAL_REQUIRED): new revisions to
  // accept first, and where — screen 15 from "me" (W13-LC).
  if (fromRefusal(answer).length > 0) return say("web.legal.refused");
  return refusalText("phrase", error?.code, answer.status, error?.message);
}

// What a person reads of a node's refusal that has no wording of its own
// (decided by quorum 2/2 on 2026-10-10, docs/chat_RU.md): a code the node gave
// (error.code, relay routes/feed.ts:358 «moderation_refused» for a phrase,
// routes/profile.ts:135,138 «name_refused» for a name) maps to a phrase of the
// dictionary in the interface language. The node's free text (error.message:
// the model's reason or the rules' English line) is NOT shown — `modelText` is
// accepted so that showing it, when the language of the reason is the
// interface's, is a change in this one function.
const REFUSAL_KEY: Record<string, string> = {
  moderation_refused: "web.phrase.refused_generic",
  name_refused: "web.name.refused_generic",
};

export function refusalText(kind: "phrase" | "name", code: string | undefined, status: number, _modelText?: string): string {
  const key = code ? REFUSAL_KEY[code] : undefined;
  if (key) return say(key);
  return kind === "phrase" ? say("web.phrase.refused_status", { status }) : say("web.refused.status", { status });
}

export async function sayPhrase(
  client: Client,
  phrase: { text: string; mode: Mode; lat: number; lon: number; radius: Radius; discount_value?: string; conditions?: string },
): Promise<Sent> {
  // The language the page speaks is the phrase's (W17-LG): the node keeps it or says und.
  const answer = await client.say({ ...phrase, lang: LANG });
  const body = answer.body as { id?: string; state?: string } | null;
  if (answer.status === 200 && body?.id) return { state: "published", id: body.id };
  if (answer.status === 202 && body?.id) return { state: "checking", id: body.id };
  return { state: "refused", why: await refusalWording(client, answer) };
}

// A like's outcome as the node names it: liked, matched (with the match), or
// refused — 429 past three hundred an hour, 409 across the band or a block.
// `namePending`: the like stands, but on an offer it makes no match while the
// liker's own name is not accepted — the node says so (routes/likes.ts) and
// the card says it to the person, as the terminal does (WP-1).
export type LikeOutcome =
  | { state: "liked"; namePending?: true }
  | { state: "matched"; matchId?: string }
  | { state: "refused"; why: string };

export async function likePhrase(client: Client, phraseId: string): Promise<LikeOutcome> {
  const answer = await client.like(phraseId);
  if (answer.status === 200 && answer.body?.state === "matched") return { state: "matched", matchId: answer.body.match_id };
  if (answer.status === 200 && answer.body?.name_pending) return { state: "liked", namePending: true };
  if (answer.status === 200) return { state: "liked" };
  const error = (answer.body as { error?: { code?: string; message?: string } } | null)?.error;
  // The node's two 409s (routes/likes.ts:121 stepped_away, :88 no live phrase
  // of one's own — §8.4, a like is a phrase meeting a phrase). The first has
  // its wording (refusal-wordings, depth's away.line); the second has none yet
  // in refusal-wordings or depth's locales — the node's own text until the
  // owner gives one (owner.md).
  if (answer.status === 409 && error?.code === "stepped_away") return { state: "refused", why: say("away.line") };
  if (answer.status === 409) return { state: "refused", why: error?.message ?? "a like needs a live phrase of your own" };
  if (answer.status === 429) return { state: "refused", why: say("write.rapid") };
  return { state: "refused", why: error?.message ? say("web.like.refused_why", { why: error.message }) : say("web.like.refused_status", { status: answer.status }) };
}

// Taking a like back: unliked, or spent once a match came of it (§8.4).
export async function unlikePhrase(client: Client, phraseId: string): Promise<"unliked" | "spent" | "refused"> {
  const answer = await client.unlike(phraseId);
  if (answer.status === 200 && answer.body?.state === "spent") return "spent";
  if (answer.status === 200) return "unliked";
  return "refused";
}

// Taking one's own phrase down (§8.3, W11-C; DELETE /feed/:id): 204 is the
// only "came down" — the live slot frees, the hour's ceiling does not. 404 is
// the node's one answer for a phrase that is not mine any more — expired,
// already gone — and is said with its number, not swallowed.
export async function takeDownPhrase(client: Client, phraseId: string): Promise<{ ok: true } | { ok: false; status: number }> {
  const answer = await client.takeDown(phraseId).catch((e: Error) => ({ status: 0, body: { error: e.message } }));
  return answer.status === 204 ? { ok: true } : { ok: false, status: answer.status };
}

// Hiding is one's own business (§8.9): the handle comes back, the author
// never learns. Blocking answers 204 whatever happened, so it never fails here.
export const hidePhrase = (client: Client, phraseId: string): Promise<string> => client.hide(phraseId);
export const blockByPhrase = async (client: Client, phraseId: string): Promise<void> => {
  await client.blockByPhrase(phraseId);
};

export const likedPhrases = (client: Client, after?: string): Promise<{ items: Liked[]; next: string | null }> => client.likes(after);
