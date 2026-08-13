// The chat stub is a brief, and briefs go stale silently.
//
// src/chat/relay.ts is the first file whoever implements the chat will open,
// and for months it described a design that had been abandoned: messages passed
// through AI moderation in plaintext, privacy resting on storing nothing rather
// than on encryption, and end-to-end encryption named as an incompatible future
// alternative kept in another document. The specification had settled the
// opposite — the node carries ciphertext and holds no keys — and nothing
// connected the two, because a comment is not compiled and not tested.
//
// This connects them. It is deliberately about the claims that reverse the
// design, not about wording: a stub may be rewritten freely, but not back into
// the plan that was dropped.

import { assert } from "jsr:@std/assert@1";

const read = (path: string) => Deno.readTextFileSync(new URL(path, import.meta.url));

const stub = read("../src/chat/relay.ts");
const spec = read("../../../docs/chat_EN.md");

Deno.test("the specification still says the chat is encrypted and unmoderated", () => {
  // If this fails the product changed, and the stub is not the file to fix
  // first — this test is here to make that a decision rather than a drift.
  assert(
    /A chat is not moderated/.test(spec),
    "the spec no longer says the chat is unmoderated",
  );
  assert(
    /the node carries ciphertext and holds no keys/.test(spec),
    "the spec no longer says the node holds no keys",
  );
});

Deno.test("the chat stub does not describe the abandoned design", () => {
  // Each of these was in the file, and each reverses the decision in §8.13.
  const reversals: [RegExp, string][] = [
    [/moderation in plaintext/i, "moderation of plaintext in the relay"],
    [/traded end-to-end encryption away/i, "encryption traded away for moderation"],
    [
      /E2E variant is kept as a future alternative/i,
      "end-to-end encryption as a future alternative",
    ],
  ];
  for (const [pattern, what] of reversals) {
    // The corrective paragraph quotes what it corrects, so a bare match would
    // fire on the correction itself. Only a claim outside it counts.
    const withoutCorrection = stub.replace(/This comment used to say[\s\S]*?\n\/\/\n/, "");
    assert(
      !pattern.test(withoutCorrection),
      `the chat stub claims ${what} again — the spec settled the opposite in §8.13`,
    );
  }
});

Deno.test("the chat stub says what the node actually carries", () => {
  assert(/ciphertext/i.test(stub), "the stub does not say the node carries ciphertext");
  assert(/holds no keys/i.test(stub), "the stub does not say the node holds no keys");
});
