// A phrase sent to the feed and the node's refusals in a person's words (§8.3; docs/refusal-wordings_RU.md §3–§5),
// for both faces. Moved out of web/src/api/actions.ts on 18.10.2026 (sayPhrase, refusalWording, refusalText) so that
// the web and the app shell say a phrase and its refusal the same way; behaviour unchanged. The words are the face's
// dictionary (`say`: depth/ink locales' write.*, away.line and the web's web.phrase.* / web.legal.* / web.like.*),
// the phrase's language the face's (`lang`).
import type { Answer, Client, Radius } from "../core/client.ts";
import { fromRefusal } from "../core/legal.ts";

export type Mode = "alone" | "company" | "party";

// What the node said back to a phrase (§8.3; P1): out at once, or read by a
// person first, or refused — with the reason a person can act on.
export type Sent =
  | { state: "published"; id: string }
  | { state: "checking"; id: string }
  | { state: "refused"; why: string };

export interface PhraseConfig {
  say: (key: string, values?: Record<string, string | number>) => string;
  lang: string;
}

export function createPhrase({ say, lang }: PhraseConfig) {
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
  async function refusalWording(client: Client, answer: Answer): Promise<string> {
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

  function refusalText(kind: "phrase" | "name" | "like", code: string | undefined, status: number, _modelText?: string): string {
    // A like has no model verdict: the node's 409 «refused» is «no live phrase of
    // your own» (relay routes/likes.ts), the rest is told by its number.
    if (kind === "like") return status === 409 ? say("web.like.needs_phrase") : say("web.like.refused_status", { status });
    const key = code ? REFUSAL_KEY[code] : undefined;
    if (key) return say(key);
    return kind === "phrase" ? say("web.phrase.refused_status", { status }) : say("web.refused.status", { status });
  }

  async function sayPhrase(
    client: Client,
    phrase: { text: string; mode: Mode; lat: number; lon: number; radius: Radius; discount_value?: string; conditions?: string },
  ): Promise<Sent> {
    // The language the page speaks is the phrase's (W17-LG): the node keeps it or says und.
    const answer = await client.say({ ...phrase, lang });
    const body = answer.body as { id?: string; state?: string } | null;
    if (answer.status === 200 && body?.id) return { state: "published", id: body.id };
    if (answer.status === 202 && body?.id) return { state: "checking", id: body.id };
    return { state: "refused", why: await refusalWording(client, answer) };
  }

  return { sayPhrase, refusalWording, refusalText };
}
