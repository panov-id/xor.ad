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

// Saying a phrase and the node's refusals are the platform's (depth/web-platform/phrase.ts), shared with the app shell.
import { createPhrase, type Mode } from "../../../depth/web-platform/phrase.ts";
export type { Mode, Sent } from "../../../depth/web-platform/phrase.ts";
export const { sayPhrase, refusalWording, refusalText } = createPhrase({ say, lang: LANG });
// Made when asked (W14), so the labels are in the page's language of the moment.
export const modes = (): Array<{ value: Mode; label: string }> => [
  { value: "alone", label: say("web.mode.alone") },
  { value: "company", label: say("web.mode.company") },
  { value: "party", label: say("web.mode.party") },
];

// The mode's icon (sheets adaptive-*-feed, 11.10.2026): one person, a company, a party.
export const modeIcon = (mode: string): "me" | "company" | "party" => (mode === "company" || mode === "party" ? mode : "me");

// A language of a phrase by its name in the interface's language («русский»,
// not «ru»; П2, walkthrough 10.10.2026). The node files "und" for a phrase of
// no known language, and a code the browser cannot name stays unsaid: an
// internal id is no word for a person.
export function languageIn(lang: string | undefined): string | undefined {
  if (!lang || lang === "und") return undefined;
  try {
    const name = new Intl.DisplayNames([LANG], { type: "language" }).of(lang);
    return name && name.toLowerCase() !== lang.toLowerCase() ? name : undefined;
  } catch {
    return undefined;
  }
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
  // The node's two 409s (routes/likes.ts stepped_away, and «refused»: no live
  // phrase of one's own — §8.4, a like is a phrase meeting a phrase). The first
  // has its wording (refusal-wordings, depth's away.line), the rest is told by
  // refusalText in the interface's words; the node's free text is never shown.
  if (answer.status === 409 && error?.code === "stepped_away") return { state: "refused", why: say("away.line") };
  if (answer.status === 429) return { state: "refused", why: say("write.rapid") };
  return { state: "refused", why: refusalText("like", error?.code, answer.status, error?.message) };
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
