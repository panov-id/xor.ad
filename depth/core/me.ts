// "Me"'s readings that both faces count the same way (moved out of web/src/api/me.ts on 18.10.2026 for the app
// shell; behaviour unchanged): what stepping away and starting again cost, counted on the spot as the terminal
// counts them (depth/ink rooms.ts). The spans' order and the age band are pure and live in limits.ts.
import { type Client, CursorRefused } from "./client.ts";
export { AWAY_ORDER, ageBand } from "./limits.ts";

// What a step away costs: one's live phrases, the likes one gave, and the
// conversations whose own end comes before the break does (the caller compares `ends` with the span).
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

// What closing the identity takes with it: the live phrases and the conversations.
export async function resetCounts(client: Client): Promise<{ phrases: number; chats: number }> {
  const [me, inbox] = await Promise.all([client.profile(), client.inbox()]);
  return { phrases: me.phrases?.length ?? 0, chats: inbox.length };
}
