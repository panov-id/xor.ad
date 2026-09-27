// What I hid and whom I blocked, with the way back (L1; chat spec §8.9; the
// terminal's rooms, depth/ink/rooms.ts): GET/DELETE /hidden and /blocks
// through the core (depth/core/client.ts hidden, unhide, blocks, unblock).

import type { Client } from "../../../depth/core/client.ts";

export type HiddenRow = { id: string; kind: string; text: string };
export type BlockRow = { id: string; since: number };

export const hiddenList = (client: Client): Promise<HiddenRow[]> => client.hidden();
export const blockList = (client: Client): Promise<BlockRow[]> => client.blocks();

// DELETE answers 204 for any handle, mine or not (SEC-14): nothing to read.
export async function unhide(client: Client, id: string): Promise<void> {
  const answer = await client.unhide(id);
  if (answer.status !== 204 && answer.status !== 200) throw new Error(`the phrase did not come back: ${answer.status}`);
}

export async function unblock(client: Client, id: string): Promise<void> {
  const answer = await client.unblock(id);
  if (answer.status !== 204 && answer.status !== 200) throw new Error(`the block was not lifted: ${answer.status}`);
}

// The day a block was set, as the terminal writes it (rooms.ts Blocked).
export const day = (seconds: unknown): string =>
  typeof seconds === "number" && Number.isFinite(seconds)
    ? new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" }).format(new Date(seconds * 1000))
    : "?";
