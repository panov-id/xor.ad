// Chat WS-relay slot — PLACEHOLDER for the chat. See docs/chat_{RU,EN}.md §8.
//
// `relayUpgrade()` will terminate the room WebSocket by `chat_id` and fan
// messages out (§8.1). It writes nothing to a database — there is no `messages`
// table, and history lives only on the participants' devices (§8.8).
//
// What it fans out is **ciphertext**. A chat is encrypted on the devices: the
// node carries it and holds no keys, so it does not look into the text — not
// because it promised not to, but because it cannot (§8.13). Nothing here
// moderates anything. Illegal content in a chat is dealt with the way the
// published rules and the privacy policy both describe: the other participant
// reports it, and their device attaches the copy, because we hold none.
//
// This comment used to say the opposite — that a message passes through AI
// moderation in plaintext, that privacy rests on storing nothing rather than on
// encryption, and that end-to-end encryption was a future alternative living in
// docs/chat-decentralized-ideas_{RU,EN}.md and incompatible with this design.
// All four were true of a draft that was abandoned. Encryption is the decision
// (§8.13), and it became possible exactly when the chat stopped being
// moderated: you cannot read text and be blind to it at the same time. The
// ideas document carries the same correction at its head, and what remains a
// future branch there is the untrusted community pool, not the encryption.
//
// It is left as a stub so the node's structure is chat-ready without pulling
// chat logic into the build. Whoever implements step 5 of the build order reads
// this file first — which is why it is worth its length.

export const NODE_ROLE = Deno.env.get("NODE_ROLE") ?? "relay"; // core | relay

// Wired into main.ts only once the chat lands (separate repo). For now, an
// Upgrade request just gets a clear 501 so the surface exists but does nothing.
export function relayUpgrade(_req: Request): Response {
  return new Response("chat relay not enabled on this node yet", { status: 501 });
}
