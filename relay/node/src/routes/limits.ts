// What the node will accept, said out loud.
//
// The client is open and therefore hostile: every limit here is also enforced
// where the work happens, and this route changes nothing about that (§8.3). It
// exists so a face can show the right number before a person types past it —
// the terminal used to carry 146 in its own source while the node refused at
// 128, and the first anyone learned of the difference was a rejection after
// the sentence was written (consistency lens and review panel, 2026-09-22).
//
// Public on purpose: these numbers are in the published protocol, and a client
// needs them before it has an identity.
import { route } from "../lib/router.ts";
import { json } from "../lib/http.ts";
import { TEXT_MAX_GRAPHEMES } from "./feed.ts";
import { CIPHERTEXT_MAX } from "./chats.ts";

export function limits(): Response {
  return json({
    // limits.tsv phrase.length — graphemes, counted by the node.
    phrase_length: TEXT_MAX_GRAPHEMES,
    // limits.tsv chat.ciphertext.bytes — the base64url text, not the bytes
    // under it; a face uses it to keep a draft from being refused on send.
    chat_ciphertext_chars: CIPHERTEXT_MAX,
  }, 200, {
    // A face may read this at every start; it does not move between deploys.
    "cache-control": "public, max-age=300",
  });
}

route("GET", "/limits", () => limits());
