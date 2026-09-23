// The core against a live node — scripts/run-depth-tests.sh starts one.
//
// Registration, the paper code's confirmation, one's own profile, a phrase sent
// (202: it waits for a verdict nobody gives yet — §8.3) and the feed read back:
// every call signed by the core and accepted by a node that does not share its
// code. This is the first path a person walks, done without a browser.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

// Two people whose phrases are already past the queue. A phrase sent through
// the client waits for a verdict nobody gives on a bare stand (§8.3), so the
// rows go in the way the socket suite does it — the subject here is hiding,
// not moderation.
async function twoWithPhrases(sql: postgres.Sql) {
  const person = async (name: string) => {
    const c = new Client(node!, apiKey!);
    await c.register({ name, age: 30 }, { testOnly: true });
    await c.confirmPaperCode();
    return c;
  };
  const a = await person("Женя");
  const b = await person("Аня");
  const put = async (who: string, text: string) => {
    const id = crypto.randomUUID();
    await sql.unsafe(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
         lat_published, lon_published, visible_at, expires_at)
       VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '3 hours')`,
      [id, who, text],
    );
    return id;
  };
  await put(a.identityId, "кто на набережную?");
  const phraseOfB = await put(b.identityId, "гуляю у реки");
  return { a, b, phraseOfB };
}

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

Deno.test({
  name: "a new name waits for the queue; the old one stands until then",
  ignore: !node,
  async fn() {
    const client = new Client(node!, apiKey!);
    await client.register({ name: "Аня", age: 30 }, { testOnly: true });
    await client.confirmPaperCode();
    const asked = await client.editProfile({ name: "Анна", languages: ["ru"] });
    assertEquals(asked.status, 202, JSON.stringify(asked.body));
    const body = asked.body as { name: string; name_pending?: string; languages: string[] };
    assertEquals(body.name, "Аня");
    assertEquals(body.name_pending, "Анна");
    assertEquals(body.languages, ["ru"]);
    assertEquals((await client.profile()).name, "Аня", "the old name did not stand while the new one waits");
  },
});

Deno.test({
  name: "a hidden phrase leaves my feed, comes back by its handle, and never touches the other person's",
  ignore: !node || !databaseUrl,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const { a, b, phraseOfB } = await twoWithPhrases(sql);
      const seen = async (who: typeof a) =>
        (await who.feed({ lat: 59.93, lon: 30.33, radius: 1000 })).items
          .map((item) => (item as { id: string }).id);

      assert((await seen(a)).includes(phraseOfB), "the feed did not carry the phrase to begin with");
      const handle = await a.hide(phraseOfB);
      assertEquals((await seen(a)).includes(phraseOfB), false, "a hidden phrase stayed in my own feed");
      // The other side is untouched: hiding is one-sided (§8.9).
      assertEquals((await b.hidden()).length, 0, "hiding leaked to the other person");

      const list = await a.hidden();
      assertEquals(list.length, 1);
      assertEquals(list[0].id, handle, "the list does not hand back the handle that hid it");

      assertEquals((await a.unhide(handle)).status, 204);
      assert((await seen(a)).includes(phraseOfB), "the phrase did not come back");
      assertEquals((await a.hidden()).length, 0);
    } finally {
      await sql.end();
    }
  },
});
