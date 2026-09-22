// The node says what it will accept, and says the same numbers it enforces.
//
// The point of the route is that no face has to carry a copy: if these two
// ever drift apart, a person types a sentence the node then refuses.
import { assertEquals } from "jsr:@std/assert@1";
import { limits } from "../src/routes/limits.ts";
import { TEXT_MAX_GRAPHEMES } from "../src/routes/feed.ts";
import { CIPHERTEXT_MAX } from "../src/routes/chats.ts";

Deno.test("the limits route answers with the numbers the routes enforce", async () => {
  const answer = limits();
  assertEquals(answer.status, 200);
  const body = await answer.json();
  assertEquals(body.phrase_length, TEXT_MAX_GRAPHEMES, "the phrase limit is not what /feed enforces");
  assertEquals(body.chat_ciphertext_chars, CIPHERTEXT_MAX, "the ciphertext limit is not what /chats enforces");
  assertEquals(typeof body.phrase_length, "number");
});

Deno.test("the phrase limit is the one the registry states", () => {
  // docs/facts/limits.tsv phrase.length: 128 graphemes. A number that moves
  // in the code and not in the registry is the drift this route exists to end.
  assertEquals(TEXT_MAX_GRAPHEMES, 128);
});
