// The ends of a move that the network can blur (review panel 2026-09-26,
// F1 F2 F16), against a fake node: no live node can lose an answer on cue.
// The envelopes are the real ones, so the arriving side really opens a reply.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { base64url } from "./sign.ts";
import { deriveTransferCode, HeldKey, openClaim, sealReply } from "./transfer.ts";
import { Arrival, Departure, type MoveClient } from "./transfer_move.ts";

type Reply = { status: number; body: unknown; retryAfter?: number };
type Route = (method: string, path: string, body?: unknown) => Reply | "throw" | "hang";

const spki = async (key: CryptoKey) => base64url(new Uint8Array(await crypto.subtle.exportKey("spki", key)));

function fake(route: Route) {
  const calls: string[] = [];
  const client = {
    identityId: "", held: null, longSpki: "", seats: 0,
    seat() { client.seats++; },
    firstPin: () => Promise.resolve({ status: 204, body: null }),
    request: <T>(method: string, path: string, body?: unknown) => {
      calls.push(`${method} ${path.replace(/\/sessions\/[^/]+/, "/sessions/…")}`);
      const r = route(method, path, body);
      if (r === "throw") return Promise.reject(new TypeError("fetch failed"));
      if (r === "hang") return new Promise<never>(() => {});
      return Promise.resolve(r as { status: number; body: T; retryAfter?: number });
    },
  };
  return { client: client as unknown as MoveClient & { seats: number }, calls };
}

Deno.test("an ack whose answer is lost does not undo an arrival: the device stays arrived", async () => {
  const code = "K7QM3F2X9";
  const keys = await deriveTransferCode(code);
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  let claim = "";
  let reply = "";
  let acked = false;
  const node = fake((method, path, body) => {
    if (path === "/sessions/claim") {
      claim = (body as { envelope: string }).envelope;
      return { status: 200, body: { state: "claimed" } };
    }
    if (path.endsWith("/ack")) {
      acked = true;
      return "throw";
    }
    if (method === "GET") {
      return { status: 200, body: acked ? { state: "approved" } : { state: "approved", reply_envelope: reply, session_id: "s-2" } };
    }
    return { status: 404, body: null };
  });
  const into = await Arrival.claim(node.client, code, "depth, test");
  assert(into instanceof Arrival);
  const claimant = await openClaim(keys, claim);
  reply = await sealReply(keys, claimant, { identityId: "id-1", longPub: await spki(long.publicKey) }, await HeldKey.hold(long.privateKey));

  assertEquals(await into.state(), "approved", "a lost ack answer turned an arrival into an error");
  assertEquals(into.acked, 0);
  // The node dropped the reply on the ack it did take; the next ask must not
  // read that as a failed move.
  assertEquals(await into.state(), "approved", "the ask after the ack called the move failed");
  assertEquals(await into.state(), "approved");
  assertEquals(node.client.seats, 1, "the device was seated more than once");
  assertEquals(node.calls.filter((c) => c.startsWith("GET")).length, 1, "a seated device kept asking");
});

Deno.test("the old device that lost the answer to \"it is me\" learns it moved from the node", async () => {
  // Built by hand: Departure.open needs the node to answer the invitation.
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  let state = "waiting";
  const node = fake((method, path) => {
    if (path === "/sessions/invite") return { status: 200, body: { expires_in: 120 } };
    if (path.endsWith("/approve")) {
      state = "approved";
      return "throw";
    }
    if (method === "GET") return { status: 200, body: { state } };
    return { status: 404, body: null };
  });
  const client = node.client as unknown as { held: unknown; longSpki: string; identityId: string };
  client.held = await HeldKey.hold(long.privateKey);
  client.longSpki = await spki(long.publicKey);
  client.identityId = "id-1";
  const out = await Departure.open(node.client, new Uint8Array(32));
  assert(out instanceof Departure);
  state = "approved"; // the approval committed; its answer never came
  assertEquals(await out.state(), "approved");
  const asks = node.calls.length;
  assertEquals(await out.state(), "approved", "moved turned back into something else");
  assertEquals(node.calls.length, asks, "a moved device kept asking the node");
});

Deno.test("a 429 keeps the last word and no ask goes out until Retry-After has passed", async () => {
  let n = 0;
  const node = fake((method, path) => {
    if (path === "/sessions/claim") return { status: 200, body: { state: "claimed" } };
    if (method === "GET") return ++n === 1 ? { status: 429, body: null, retryAfter: 30 } : { status: 200, body: { state: "rejected" } };
    return { status: 404, body: null };
  });
  const into = await Arrival.claim(node.client, "K7QM3F2X9", "depth, test");
  assert(into instanceof Arrival);
  assertEquals(await into.state(), "claimed");
  assertEquals(await into.state(), "claimed");
  assertEquals(await into.state(), "claimed");
  assertEquals(node.calls.filter((c) => c.startsWith("GET")).length, 1, "asks went out inside the node's Retry-After");
  into.quietUntil = 0; // the thirty seconds, passed
  assertEquals(await into.state(), "rejected");
});

Deno.test("an ask that never answers, or fails on the way, is \"no answer yet\", not an end", async () => {
  let mode: "hang" | "throw" = "hang";
  const node = fake((method, path) => {
    if (path === "/sessions/claim") return { status: 200, body: { state: "claimed" } };
    if (method === "GET") return mode;
    return { status: 404, body: null };
  });
  const into = await Arrival.claim(node.client, "K7QM3F2X9", "depth, test");
  assert(into instanceof Arrival);
  const started = Date.now();
  assertEquals(await into.state(50), "claimed");
  assert(Date.now() - started < 2000, "the ask waited past its timeout");
  mode = "throw";
  assertEquals(await into.state(50), "claimed");
});

