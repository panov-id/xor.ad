// The core against a live node — scripts/run-depth-tests.sh starts one.
//
// Registration, the paper code's confirmation, one's own profile, a phrase sent
// (202: it waits for a verdict nobody gives yet — §8.3) and the feed read back:
// every call signed by the core and accepted by a node that does not share its
// code. This is the first path a person walks, done without a browser.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { Client } from "./client.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");

Deno.test({
  name: "a person registers, confirms the paper code, and reads their own profile",
  ignore: !node,
  async fn() {
    const client = new Client(node!, apiKey!);
    const me = await client.register({ name: "Женя", age: 30 }, { testOnly: true });
    assert(me.identityId && me.sessionId, "registration did not return an identity and a session");
    await client.confirmPaperCode();
    const profile = await client.profile();
    assertEquals(profile.name, "Женя");
    assertEquals(profile.age, 30);
  },
});

Deno.test({
  name: "a phrase is sent and waits for its verdict, and the feed reads back",
  ignore: !node,
  async fn() {
    const client = new Client(node!, apiKey!);
    await client.register({ name: "Аня", age: 28 }, { testOnly: true });
    await client.confirmPaperCode();
    const sent = await client.say({ text: "гуляю у реки, если кто рядом", mode: "alone", lat: 41.9, lon: 12.5, radius: 1000 });
    assertEquals(sent.status, 202, "a phrase was not accepted for checking");
    const feed = await client.feed({ lat: 41.9, lon: 12.5, radius: 1000 });
    assert(Array.isArray(feed.items), "the feed did not come back as a list");
  },
});

Deno.test("without testOnly the core refuses to register with placeholder secrets", async () => {
  // depth-core panel, 2026-09-21: the PIN proof and the paper code are random
  // stand-ins; a terminal built on this core as-is would register people who
  // can never unlock or recover. Until the real ones exist, it takes a flag.
  const client = new Client("http://nowhere.invalid", "key");
  let refused = false;
  try { await client.register({ name: "Женя", age: 30 }); } catch (e) { refused = String(e).includes("placeholder"); }
  assert(refused, "the core registered with placeholders without being told they are acceptable");
});

Deno.test("the two shapes of 409 are told apart", async () => {
  // Protocol §6: a new edition of the documents answers 409 with no
  // error.code; every other conflict carries one (depth-core panel, 2026-09-21).
  const { conflictOf } = await import("./client.ts");
  assertEquals(conflictOf({ status: 409, body: { error: "legal_reacceptance_required", documents: ["terms"] } }), "reacceptance");
  assertEquals(conflictOf({ status: 409, body: { error: { code: "stepped_away" } } }), "stepped_away");
  assertEquals(conflictOf({ status: 200, body: {} }), null);
});
