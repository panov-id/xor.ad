// The "me" screens' words and readings (W4, 2026-09-26). The words are the
// terminal's, verbatim: depth/ink/locales/ru.json is imported as it is, and
// `say` substitutes {name} the way depth/ink/strings.ts does. Nothing here
// draws; the screens in screens/Me.tsx do.

import ru from "../../../depth/ink/locales/ru.json";
import type { Answer, Client } from "../../../depth/core/client.ts";
import { CursorRefused } from "../../../depth/core/client.ts";

const STRINGS = ru as Record<string, string>;

export function say(key: string, values?: Record<string, string | number>): string {
  const template = STRINGS[key] ?? key;
  return values
    ? template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole))
    : template;
}

// How the node refuses a proof of the PIN, as one line (§8.2): the same
// counter answers "change the PIN" and "start again" (depth/ink/rooms.ts).
export function pinRefusal(answer: Answer<unknown>): string | null {
  const error = (answer.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
  if (error?.code === "pin_mismatch") return say("pin.mismatch", { n: String(error.attempts_left ?? "?") });
  if (error?.code === "pin_locked") return say("pin.locked");
  if (error?.code === "rate_limited") return say("pin.wait", { n: String(answer.retryAfter ?? "?") });
  return null;
}

const hhmm = (seconds: unknown) =>
  typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toTimeString().slice(0, 5) : "?";

// The node's refusal of a profile edit, in the owner's words
// (refusal-wordings §5, 2026-09-23), or null for a refusal with no words.
export function profileRefusal(answer: Answer<unknown>): string | null {
  const error = (answer.body as { error?: { code?: string; until?: number } } | null)?.error;
  if (error?.code === "name_frozen") return say("profile.nameFrozen");
  if (error?.code === "age_step_down") return say("profile.ageDown");
  if (error?.code === "paused") return say("write.paused", { time: hhmm(error.until) });
  if (error?.code === "rate_limited") {
    const hours = Math.min(24, Math.max(1, Math.ceil((answer.retryAfter ?? 24 * 3600) / 3600)));
    return say("profile.patchDay", { n: String(hours) });
  }
  return null;
}

export const AWAY_MINUTES = { short: 20, hour: 60, long: 240 } as const;
export type AwaySpan = keyof typeof AWAY_MINUTES;
export const AWAY_ORDER: AwaySpan[] = ["short", "hour", "long"];

// What a step away costs, counted on the spot as the terminal counts it:
// one's live phrases, the likes one gave, and the conversations whose own
// end comes before the break does.
export async function awayCounts(client: Client): Promise<{ phrases: number; likes: number; ends: number[] }> {
  const profile = await client.profile();
  let likes = 0;
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const got = await client.likes(after).catch((e: Error) => {
      if (!(e instanceof CursorRefused)) throw e;
      likes = 0;
      after = undefined;
      return client.likes();
    });
    likes += got.items.length;
    if (!got.next) break;
    after = got.next;
  }
  const inbox = await client.inbox();
  const ends = inbox
    .filter((r) => r.kind === "chat" && r.state !== "ended")
    .map((r) => Number(r.chat_expires_at))
    .filter((n) => Number.isFinite(n));
  return { phrases: profile.phrases?.length ?? 0, likes, ends };
}

export async function resetCounts(client: Client): Promise<{ phrases: number; chats: number }> {
  const [me, inbox] = await Promise.all([client.profile(), client.inbox()]);
  return { phrases: me.phrases?.length ?? 0, chats: inbox.length };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export const graphemes = (text: string, max: number) => [...segmenter.segment(text)].slice(0, max).map((s) => s.segment).join("");
export const NAME_MAX = 24;
