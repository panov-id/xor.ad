// What a closed conversation socket means for the client (protocol §4.4).
//
// Until 2026-09-24 depth acted on 4003 alone, and every other close left the
// room silently dead: the node closes every room with 1001 when it stops
// (relay/node/src/main.ts), so a restart of the node ended every open
// conversation on the screen without a word.
//
// 1006 is not in the protocol's table: it is what a client sees when the line
// dropped with no close frame at all — the network, not the node, and the
// same answer as 1001.

export type CloseAction = "over" | "reconnect" | "stay";

export function afterClose(code: number): CloseAction {
  if (code === 4003) return "over";
  // 4001: the ticket went stale; a new one is taken on the way back in.
  if (code === 1001 || code === 1011 || code === 1006 || code === 4001) return "reconnect";
  // 1000 is one's own close; 4002 (moved), 4004 (update) and 4005 (a seat)
  // have screens of their own that depth does not draw yet.
  return "stay";
}

// A second, doubling to half a minute, each drawn between half and all of it:
// a node back from a restart is not met by every room in the same instant.
const BASE_MS = 1000;
const CAP_MS = 30_000;

export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const full = Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(full / 2 + (full / 2) * random());
}
