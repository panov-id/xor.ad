// Protocol §2 in both directions: a request signed the way the canon describes
// verifies, and every way of getting it wrong is refused by name.
//
// The keys are generated in the test, not pinned: the point is that a client
// following §2 with WebCrypto is understood, and a fixture would only prove that
// one recorded byte string still parses. What is pinned is the signed string —
// the four lines are the contract between the node and two clients, and a change
// to them has to be a change somebody made on purpose.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  base64urlToBytes,
  bytesToBase64url,
  importSignPublicKey,
  PROTOCOL_MAJOR,
  protocolVersion,
  readSignedHeaders,
  signedAuthority,
  signedPath,
  signedPayload,
  sha256hex,
  TIME_WINDOW_SECONDS,
  verifySignedRequest,
  versionSupported,
  withinWindow,
} from "../src/lib/identity_auth.ts";

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

async function device() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { pair, signPublicKey: bytesToBase64url(spki) };
}

// What a client does: build the five lines, sign them, put the pieces in headers.
async function signedRequest(
  key: CryptoKey,
  method: string,
  url: string,
  body: Uint8Array,
  time: number,
  sessionId = "0f9c3d0a-0000-4000-8000-000000000001",
) {
  const payload = signedPayload(
    method,
    signedAuthority(url),
    signedPath(url),
    await sha256hex(body),
    time,
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)),
  );
  return new Request(url, {
    method,
    body: method === "GET" ? undefined : body,
    headers: {
      "x-identity-session": sessionId,
      "x-identity-time": String(time),
      "x-identity-sign": bytesToBase64url(signature),
      "x-protocol-version": String(PROTOCOL_MAJOR),
    },
  });
}

const NOW = 1_758_000_000;
const URL_WITH_QUERY = "https://node.example/v1/identities/me?after=abc&x=%0A";

Deno.test("the signed string is the five lines of §2, in order", async () => {
  const body = new TextEncoder().encode('{"a":1}');
  const payload = signedPayload("POST", "api.sosed.place", "/v1/feed", await sha256hex(body), NOW);
  assertEquals(payload.split("\n").length, 5);
  const [method, authority, path, digest, time] = payload.split("\n");
  assertEquals(method, "POST");
  assertEquals(authority, "api.sosed.place");
  assertEquals(path, "/v1/feed");
  assertEquals(digest, await sha256hex(body));
  assertEquals(time, String(NOW));
});

Deno.test("the query string is inside the signature, normalised", () => {
  // It used to be left out, argued from reproducibility — and the cursor of
  // GET /feed rode outside the signature as a result (review panel 2026-09-20,
  // protocols lens). Reproducibility is answered by normalising rather than by
  // omitting: the same request signs the same however its client ordered or
  // encoded it.
  assertEquals(signedPath(URL_WITH_QUERY), "/v1/identities/me?after=abc&x=%0A");
  assertEquals(
    signedPath("https://node.example/v1/feed?b=2&a=1"),
    signedPath("https://node.example/v1/feed?a=1&b=2"),
    "the order a client happened to use changed the signature",
  );
  // A repeated parameter keeps both values: dropping one would make two
  // different requests sign the same.
  assertEquals(signedPath("https://node.example/v1/feed?a=2&a=1"), "/v1/feed?a=1&a=2");
  // And an empty query is a bare path, so `/feed` and `/feed?` agree.
  assertEquals(signedPath("https://node.example/v1/feed?"), "/v1/feed");
});

Deno.test("the authority is normalised, and a default port is not part of it", () => {
  assertEquals(signedAuthority("https://API.Sosed.Place/v1/feed"), "api.sosed.place");
  assertEquals(signedAuthority("https://api.sosed.place:443/v1/feed"), "api.sosed.place");
  assertEquals(signedAuthority("http://localhost:62080/v1/feed"), "localhost:62080");
});

Deno.test("a request signed by the device verifies", async () => {
  const { pair, signPublicKey } = await device();
  const body = new TextEncoder().encode('{"name":"Аня"}');
  const req = await signedRequest(pair.privateKey, "POST", "https://node.example/v1/feed", body, NOW);
  const verdict = await verifySignedRequest(req, {
    method: "POST",
    url: "https://node.example/v1/feed",
    body,
    signPublicKey,
    now: NOW,
  });
  assert(typeof verdict !== "string", `expected a session, got ${verdict}`);
  assertEquals(verdict.sessionId, "0f9c3d0a-0000-4000-8000-000000000001");
});

Deno.test("another device's key does not verify", async () => {
  const mine = await device();
  const theirs = await device();
  const body = new TextEncoder().encode("{}");
  const req = await signedRequest(mine.pair.privateKey, "POST", "https://node.example/v1/away", body, NOW);
  const verdict = await verifySignedRequest(req, {
    method: "POST",
    url: "https://node.example/v1/away",
    body,
    signPublicKey: theirs.signPublicKey,
    now: NOW,
  });
  assertEquals(verdict, "bad_signature");
});

Deno.test("a changed body breaks the signature", async () => {
  const { pair, signPublicKey } = await device();
  const signedBody = new TextEncoder().encode('{"age":30}');
  const arrivedBody = new TextEncoder().encode('{"age":13}');
  const req = await signedRequest(pair.privateKey, "PATCH", "https://node.example/v1/identities/me", signedBody, NOW);
  const verdict = await verifySignedRequest(req, {
    method: "PATCH",
    url: "https://node.example/v1/identities/me",
    body: arrivedBody,
    signPublicKey,
    now: NOW,
  });
  assertEquals(verdict, "bad_signature");
});

Deno.test("the same signature on another path does not verify", async () => {
  const { pair, signPublicKey } = await device();
  const body = new TextEncoder().encode("{}");
  const req = await signedRequest(pair.privateKey, "POST", "https://node.example/v1/blocks", body, NOW);
  const verdict = await verifySignedRequest(req, {
    method: "POST",
    url: "https://node.example/v1/hidden",
    body,
    signPublicKey,
    now: NOW,
  });
  assertEquals(verdict, "bad_signature");
});

Deno.test("the ±5 minute window, both edges", () => {
  assert(withinWindow(NOW - TIME_WINDOW_SECONDS, NOW));
  assert(withinWindow(NOW + TIME_WINDOW_SECONDS, NOW));
  assert(!withinWindow(NOW - TIME_WINDOW_SECONDS - 1, NOW));
  assert(!withinWindow(NOW + TIME_WINDOW_SECONDS + 1, NOW));
});

Deno.test("a request from outside the window is refused before the key is read", async () => {
  const { pair, signPublicKey } = await device();
  const body = new TextEncoder().encode("{}");
  const stale = NOW - TIME_WINDOW_SECONDS - 1;
  const req = await signedRequest(pair.privateKey, "POST", "https://node.example/v1/away", body, stale);
  const verdict = await verifySignedRequest(req, {
    method: "POST",
    url: "https://node.example/v1/away",
    body,
    signPublicKey,
    now: NOW,
  });
  assertEquals(verdict, "time_out_of_window");
});

Deno.test("each missing or malformed header is named, not lumped together", async () => {
  const base = {
    "x-identity-session": "0f9c3d0a-0000-4000-8000-000000000001",
    "x-identity-time": String(NOW),
    "x-identity-sign": bytesToBase64url(new Uint8Array(64)),
  };
  const url = "https://node.example/v1/away";
  for (const absent of Object.keys(base)) {
    const headers = { ...base } as Record<string, string>;
    delete headers[absent];
    assertEquals(readSignedHeaders(new Request(url, { headers })), "missing_headers", absent);
  }
  assertEquals(
    readSignedHeaders(new Request(url, { headers: { ...base, "x-identity-time": "yesterday" } })),
    "malformed_time",
  );
  // A DER signature is ~70 bytes; r‖s for P-256 is exactly 64.
  assertEquals(
    readSignedHeaders(
      new Request(url, { headers: { ...base, "x-identity-sign": bytesToBase64url(new Uint8Array(70)) } }),
    ),
    "malformed_signature",
  );
  assertEquals(
    readSignedHeaders(new Request(url, { headers: { ...base, "x-identity-sign": "not base64url!!" } })),
    "malformed_signature",
  );
});

Deno.test("a key that is not an SPKI P-256 point is refused by import", async () => {
  assertEquals(await importSignPublicKey("not base64url!!"), null);
  assertEquals(await importSignPublicKey(bytesToBase64url(new Uint8Array(65))), null);
  const { pair } = await device();
  // The raw export is a valid point and still refused: the wire format is SPKI.
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  assertEquals(raw.length, 65);
  assertEquals(await importSignPublicKey(bytesToBase64url(raw)), null);
});

Deno.test("base64url survives a round trip and rejects padding", () => {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  assertEquals(bytesToBase64url(bytes), bytesToBase64url(bytes));
  assertEquals(base64urlToBytes(bytesToBase64url(bytes))!, bytes);
  assertEquals(base64urlToBytes("aGVsbG8="), null); // padding is not base64url
  assertEquals(base64urlToBytes("a+b/c"), null); // nor is the standard alphabet
});

Deno.test("the protocol version is read, and only the served major is supported", () => {
  const url = "https://node.example/v1/feed";
  const version = (value?: string) =>
    protocolVersion(new Request(url, { headers: value === undefined ? {} : { "x-protocol-version": value } }));
  assertEquals(version(), null);
  assertEquals(version(""), null);
  assertEquals(version("0"), null);
  assertEquals(version("1.0"), null);
  assertEquals(version("-1"), null);
  assertEquals(version(String(PROTOCOL_MAJOR)), PROTOCOL_MAJOR);
  assert(versionSupported(PROTOCOL_MAJOR));
  assert(!versionSupported(PROTOCOL_MAJOR + 1));
  assert(!versionSupported(null));
});

Deno.test("a request signed for one node does not verify on another", async () => {
  // The point of the authority line. A pool has more than one node and the
  // product has more than one face; before 2026-09-21 a signed request was
  // accepted by any of them for the whole ±5 minute window, and nothing in the
  // signature said where it had been addressed (open-work G18).
  const { pair, signPublicKey } = await device();
  const body = new TextEncoder().encode("{}");
  const req = await signedRequest(pair.privateKey, "POST", "https://api.sosed.place/v1/away", body, NOW);
  const elsewhere = await verifySignedRequest(req, {
    method: "POST",
    url: "https://api.neighbro.place/v1/away",
    body,
    signPublicKey,
    now: NOW,
  });
  assertEquals(elsewhere, "bad_signature", "a signature travelled to another face");

  // And it still verifies where it was addressed.
  const athome = await verifySignedRequest(req, {
    method: "POST",
    url: "https://api.sosed.place/v1/away",
    body,
    signPublicKey,
    now: NOW,
  });
  assert(typeof athome !== "string", `expected a session, got ${athome}`);
});

Deno.test("a cursor cannot be moved under a valid signature", async () => {
  // GET /feed and GET /inbox carry `?after=<cursor>`. With the query outside
  // the signature, anything able to rewrite a request in flight could move it
  // and the signature stayed good for five minutes.
  const { pair, signPublicKey } = await device();
  const body = new Uint8Array();
  const req = await signedRequest(
    pair.privateKey, "GET", "https://node.example/v1/feed?after=page-1", body, NOW,
  );
  const moved = await verifySignedRequest(req, {
    method: "GET",
    url: "https://node.example/v1/feed?after=page-2",
    body,
    signPublicKey,
    now: NOW,
  });
  assertEquals(moved, "bad_signature", "the cursor was moved under a valid signature");
});
