// chatKeysFor (depth/web-platform/chat/keys.ts): the seat's chat keys come from the long key the client holds;
// a client that holds none is refused at once, not later at the first consent.
// keys.ts has parameter properties, which node's strip-only mode refuses: run by deno (run-depth-tests.sh).
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import type { Client } from "../../core/client.ts";
import { ChatKeys, chatKeysFor } from "./keys.ts";

Deno.test("chatKeysFor: a held long key gives the chat keys, signing with that key", async () => {
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  let asked = 0;
  const client = { held: { signing: async () => { asked++; return long.privateKey; } } } as unknown as Client;
  const keys = await chatKeysFor(client);
  assert(keys instanceof ChatKeys);
  assertEquals(asked, 1);
});

Deno.test("chatKeysFor: a client holding no long key is refused", async () => {
  const client = { held: null } as unknown as Client;
  await assertRejects(() => chatKeysFor(client), Error, "holds no long key");
});
