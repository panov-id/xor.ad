// The other side's absence and what this tab did not see (chat spec §8.2,
// §8.8; W12-AW), as depth/ink/rooms.ts keeps them.
//
// "Отошёл": the node sends one system frame, `sys {kind: "peer_stepped_away"}`
// (relay/node/src/routes/away.ts → chat/relay.ts NOTIFY chat_sys), to every
// room of the conversation but the absent person's own; the mark stands until
// their first line here (chats.ts: a line clears away_marked). The inbox row
// carries no such flag, so a tab that opens after the fact shows nothing —
// the terminal has the same limit.
//
// "Вы пропустили сообщение": the inbox row's last_activity_at against the
// newest moment this tab saw in the conversation — a line read or sent. This
// tab keeps no history on disk, so "last own message" is what it saw in its
// own life; a tab that saw nothing of a conversation claims nothing.

const seen = new Map<string, number>();

// Checked like any number from the node: a string or a NaN would make the
// comparison lie (security lens, 23.09.2026).
const moment = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);

export function sawActivity(chatId: string, atSeconds: unknown): void {
  const at = moment(atSeconds);
  if (at === null) return;
  seen.set(chatId, Math.max(seen.get(chatId) ?? 0, Math.floor(at)));
}

export const lastSeen = (chatId: string): number | null => seen.get(chatId) ?? null;

// True when the node saw movement in the conversation after everything this
// tab saw — and nothing this tab saw yet reaches that moment.
export function missedSince(chatId: string, lastActivityAt: unknown): boolean {
  const activity = moment(lastActivityAt);
  const known = lastSeen(chatId);
  if (activity === null || known === null) return false;
  return Math.floor(activity) > known;
}

// A frame is the other side stepping away when the node says so, and only then.
export const isPeerAway = (data: unknown): boolean =>
  typeof data === "object" && data !== null && (data as { kind?: unknown }).kind === "peer_stepped_away";

// For tests of the page alone.
export const forgetSeen = (chatId?: string): void => { chatId ? seen.delete(chatId) : seen.clear(); };
