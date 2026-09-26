// What the web face asks of the node, over the one core (depth/core/client.ts):
// nothing here signs, encodes or names a path — the Client does, as it does for
// the terminal. This file turns the Client's answers into what a screen shows:
// a phrase sent or refused in the words of docs/refusal-wordings_RU.md §3–§5,
// a like's state, a hide's handle, a block's silence.
//
// The words are Russian for now, as the skeleton's screens are: the seventeen
// locales of depth/ink are the owner's texts, and the web face joins them when
// its strings are lifted out (W2, 2026-09-26).

import type { Answer, Client, Liked, Radius } from "../../../depth/core/client.ts";

export type Mode = "alone" | "company" | "party";
export const MODES: Array<{ value: Mode; label: string }> = [
  { value: "alone", label: "один" },
  { value: "company", label: "компанией" },
  { value: "party", label: "вечеринка" },
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
    return [
      `Пять отказов за час — пауза до ${hhmm(error.until)}. Решение автоматическое.`,
      "До этого времени ничего не уходит на проверку:",
      "фразы, реплики за столом, смена имени, лайк на оффер, пока имя не принято, слово для виселицы.",
      "Следующий отказ в этом часе — снова 15 минут.",
      "Лента, лайки фраз и беседы работают.",
      "Основание — соглашение, §8 и §15. Пауза кончится сама; не согласны — координатор цифровых услуг или суд.",
    ].join("\n");
  }
  if (answer.status === 429 && error?.next_slot !== undefined) return `Четыре фразы за час уже сказаны. Следующую можно в ${hhmm(error.next_slot)}.`;
  if (answer.status === 429) return "Слишком много отправок подряд.";
  if (answer.status === 409 && error?.checking !== undefined) return "Проверяем прошлое — новое уйдёт после вердикта.";
  if (answer.status === 409 && error?.live !== undefined) {
    const ends = ((await client.profile().catch(() => null))?.phrases ?? [])
      .map((p) => p.expires_at)
      .filter((n): n is number => typeof n === "number");
    return `Четыре фразы уже живут. Ближайшая освободится в ${ends.length ? hhmm(Math.min(...ends)) : "?"}.`;
  }
  if (answer.status === 409 && error?.code === "stepped_away") return "Вы отошли. Фразы сняты, беседы ждут.";
  // What has no wording of its own says what the node said, until it gets one.
  return error?.message ? `Фраза не принята: ${error.message}.` : `Фраза не принята (${answer.status}).`;
}

export async function sayPhrase(
  client: Client,
  phrase: { text: string; mode: Mode; lat: number; lon: number; radius: Radius; discount_value?: string; conditions?: string },
): Promise<Sent> {
  const answer = await client.say(phrase);
  const body = answer.body as { id?: string; state?: string } | null;
  if (answer.status === 200 && body?.id) return { state: "published", id: body.id };
  if (answer.status === 202 && body?.id) return { state: "checking", id: body.id };
  return { state: "refused", why: await refusalWording(client, answer) };
}

// A like's outcome as the node names it: liked, matched (with the match), or
// refused — 429 past three hundred an hour, 409 across the band or a block.
export type LikeOutcome = { state: "liked" } | { state: "matched"; matchId?: string } | { state: "refused"; why: string };

export async function likePhrase(client: Client, phraseId: string): Promise<LikeOutcome> {
  const answer = await client.like(phraseId);
  if (answer.status === 200 && answer.body?.state === "matched") return { state: "matched", matchId: answer.body.match_id };
  if (answer.status === 200) return { state: "liked" };
  const error = (answer.body as { error?: { code?: string; message?: string } } | null)?.error;
  // The node's two 409s (routes/likes.ts:121 stepped_away, :88 no live phrase
  // of one's own — §8.4, a like is a phrase meeting a phrase). The first has
  // its wording (refusal-wordings, depth's away.line); the second has none yet
  // in refusal-wordings or depth's locales — the node's own text until the
  // owner gives one (owner.md).
  if (answer.status === 409 && error?.code === "stepped_away") return { state: "refused", why: "Вы отошли. Фразы сняты, беседы ждут." };
  if (answer.status === 409) return { state: "refused", why: error?.message ?? "a like needs a live phrase of your own" };
  if (answer.status === 429) return { state: "refused", why: "Слишком много отправок подряд." };
  return { state: "refused", why: error?.message ? `Лайк не принят: ${error.message}.` : `Лайк не принят (${answer.status}).` };
}

// Taking a like back: unliked, or spent once a match came of it (§8.4).
export async function unlikePhrase(client: Client, phraseId: string): Promise<"unliked" | "spent" | "refused"> {
  const answer = await client.unlike(phraseId);
  if (answer.status === 200 && answer.body?.state === "spent") return "spent";
  if (answer.status === 200) return "unliked";
  return "refused";
}

// Hiding is one's own business (§8.9): the handle comes back, the author
// never learns. Blocking answers 204 whatever happened, so it never fails here.
export const hidePhrase = (client: Client, phraseId: string): Promise<string> => client.hide(phraseId);
export const blockByPhrase = async (client: Client, phraseId: string): Promise<void> => {
  await client.blockByPhrase(phraseId);
};

export const likedPhrases = (client: Client, after?: string): Promise<{ items: Liked[]; next: string | null }> => client.likes(after);
