// The core's signature, checked by the node's own verifier.
//
// The core signs on its own — it does not import the node's code, because a
// client that shares the server's implementation cannot catch the server's
// mistakes, and §13 puts the terminal first precisely to keep the protocol
// honest. This test is where the two independent implementations must agree.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { generateSigningKey, signRequest } from "./sign.ts";
import { verifySignedRequest } from "../../relay/node/src/lib/identity_auth.ts";

async function nodeAccepts(method: string, url: string, body: Uint8Array) {
  const key = await generateSigningKey();
  const headers = await signRequest(key, "session-1", method, url, body);
  const req = new Request(url, { method, headers, body: method === "GET" ? undefined : body });
  return await verifySignedRequest(req, { method, url, body, signPublicKey: key.publicSpki });
}

Deno.test("the node accepts what the core signs", async () => {
  const body = new TextEncoder().encode(JSON.stringify({ text: "гуляю у реки" }));
  const verdict = await nodeAccepts("POST", "https://api.relay.test/feed", body);
  assertEquals((verdict as { sessionId: string }).sessionId, "session-1", `node said: ${verdict}`);
});

Deno.test("a query in any order signs as the node reads it", async () => {
  const verdict = await nodeAccepts("GET", "https://API.relay.test:443/feed?radius=1000&lon=12.5&lat=41.9", new Uint8Array());
  assert(typeof verdict !== "string", `node said: ${verdict}`);
});

Deno.test("a changed body is caught", async () => {
  const key = await generateSigningKey();
  const url = "https://api.relay.test/feed";
  const headers = await signRequest(key, "s", "POST", url, new TextEncoder().encode("a"));
  const req = new Request(url, { method: "POST", headers, body: "b" });
  const verdict = await verifySignedRequest(req, {
    method: "POST", url, body: new TextEncoder().encode("b"), signPublicKey: key.publicSpki,
  });
  assertEquals(verdict, "bad_signature");
});
