// Chat WS-relay slot — PLACEHOLDER for the chat. See docs/chat_{RU,EN}.md §8.
// A node terminates the room WebSocket by chat_id and fans messages out; it
// PASSES THEM THROUGH AI MODERATION IN PLAINTEXT and writes nothing to the
// database — history lives only in the participants' browsers. Privacy rests on
// storing nothing, not on encryption: v1 traded end-to-end encryption away for
// moderation. The E2E variant is kept as a future alternative in
// docs/chat-decentralized-ideas_{RU,EN}.md, and it is incompatible with this
// one. Kept as a stub so the node structure is chat-ready without pulling any
// chat logic into the v1 landing build.

export const NODE_ROLE = Deno.env.get("NODE_ROLE") ?? "relay"; // core | relay

// Wired into main.ts only once the chat lands (separate repo). For now, an
// Upgrade request just gets a clear 501 so the surface exists but does nothing.
export function relayUpgrade(_req: Request): Response {
  return new Response("chat relay not enabled on this node yet", { status: 501 });
}
