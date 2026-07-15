// Chat WS-relay slot — PLACEHOLDER for the future decentralized chat.
// See docs/chat-decentralized-ideas_{RU,EN}.md. A relay node terminates the
// room WebSocket and fans out END-TO-END-ENCRYPTED messages; it never sees
// plaintext or holds keys. Kept as a stub so the node structure is chat-ready
// without pulling any chat logic into the v1 landing build.

export const NODE_ROLE = Deno.env.get("NODE_ROLE") ?? "relay"; // core | relay

// Wired into main.ts only once the chat lands (separate repo). For now, an
// Upgrade request just gets a clear 501 so the surface exists but does nothing.
export function relayUpgrade(_req: Request): Response {
  return new Response("chat relay not enabled on this node yet", { status: 501 });
}
