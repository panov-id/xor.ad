// The conversation screen's own small rules (sosed Dusk: w3_chat, w3_chat-over, w3_chat-game), apart from the session
// (depth/web-platform/chat/chat_state.ts) and from React, so the unit tests take them as they are.
import type { ChatView, Line } from "../../../depth/web-platform/chat/chat_state.ts";

/** A line's time, the person's clock: hours and minutes as their language writes them (w3_chat: «21:01»). */
export function clockOf(atSeconds: number, lang: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(atSeconds * 1000));
}

/** The words under the name: ended, or the fade after the span's minutes of silence (w3_chat «Fades after 38 min
 * of silence»: the minutes left until one's own end, at least one while it runs). */
export function headerLine(view: Pick<ChatView, "over" | "endsAt">, nowSeconds: number): { key: string; values?: Record<string, number> } {
  if (view.over) return { key: "app.chat.ended" };
  const left = Math.max(0, view.endsAt - nowSeconds);
  return { key: "app.chat.fades", values: { m: Math.max(1, Math.ceil(left / 60)) } };
}

/** The ring at the right of the header: the minutes left (its number) and how much of the span is left (its arc). */
export function ringOf(endsAt: number, spanMinutes: number, nowSeconds: number): { minutes: number; left: number } {
  const seconds = Math.max(0, endsAt - nowSeconds);
  return { minutes: Math.ceil(seconds / 60), left: Math.min(1, seconds / (spanMinutes * 60)) };
}

/** The chips over the field (w3_chat: «Hi!», «Coffee?», «Deal», then the game): three stickers of the set
 * (depth/core/sticker.ts) and the game's own chip. */
export const QUICK_STICKERS = ["hi", "coffee", "deal"] as const;

/** What the list draws: their lines and the system's on the left, mine on the right, an extra like as a card. */
export type Bubble = { line: Line; side: "theirs" | "mine" | "middle" };
export const bubblesOf = (lines: Line[]): Bubble[] =>
  lines.map((line) => ({ line, side: line.extra || line.system ? "middle" : line.mine ? "mine" : "theirs" }));
