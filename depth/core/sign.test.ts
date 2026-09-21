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

// One refusal per field of the signed line (depth-core panel, 2026-09-21): host
// and query joined the signature only on that day and are the most fragile.
async function verdictFor(mutate: (u: URL) => void, opts: { shiftSeconds?: number; foreignKey?: boolean } = {}) {
  const key = await generateSigningKey();
  const url = "https://api.relay.test/feed?lat=1&lon=2";
  const now = Math.floor(Date.now() / 1000);
  const headers = await signRequest(key, "s", "GET", url, new Uint8Array(), now - (opts.shiftSeconds ?? 0));
  const target = new URL(url);
  mutate(target);
  const other = opts.foreignKey ? await generateSigningKey() : key;
  return await verifySignedRequest(new Request(target, { headers }), {
    method: "GET", url: target, body: new Uint8Array(), signPublicKey: other.publicSpki,
  });
}

Deno.test("another host is refused", async () => {
  assertEquals(await verdictFor((u) => { u.hostname = "api.other.test"; }), "bad_signature");
});
Deno.test("a changed query is refused", async () => {
  assertEquals(await verdictFor((u) => u.searchParams.set("lat", "9")), "bad_signature");
});
Deno.test("a time outside the window is refused", async () => {
  assertEquals(await verdictFor(() => {}, { shiftSeconds: 6 * 60 }), "time_out_of_window");
});
Deno.test("somebody else's key is refused", async () => {
  assertEquals(await verdictFor(() => {}, { foreignKey: true }), "bad_signature");
});
Deno.test("the private half of the signing key cannot be exported", async () => {
  const key = await generateSigningKey();
  let exported = true;
  try { await crypto.subtle.exportKey("pkcs8", key.privateKey); } catch { exported = false; }
  assertEquals(exported, false, "the signing key's private half is extractable");
});

Deno.test("non-ASCII and !'()* in the query sign as the node reads them", async () => {
  // Protocols lens, 2026-09-21: §2 names no order and no encoder beyond "one
  // encoder", so a client and the node might part on these. They do not: both
  // sort the decoded pairs and encode with encodeURIComponent.
  const verdict = await nodeAccepts("GET", "https://api.relay.test/feed?q=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82&b=(x)!*'&a=%C3%A9", new Uint8Array());
  assert(typeof verdict !== "string", `node said: ${verdict}`);
});
