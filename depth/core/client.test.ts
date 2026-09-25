// The core against a live node — scripts/run-depth-tests.sh starts one.
//
// Registration, the paper code's confirmation, one's own profile, a phrase sent
// (202: it waits for a verdict nobody gives yet — §8.3) and the feed read back:
// every call signed by the core and accepted by a node that does not share its
// code. This is the first path a person walks, done without a browser.
import { assert, assertEquals } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

// One row, on a connection of its own, closed after.
async function rowOf(text: string, args: string[]): Promise<Record<string, unknown>> {
  const sql = postgres(databaseUrl!, { max: 1 });
  try {
    return (await sql.unsafe(text, args))[0];
  } finally {
    await sql.end();
  }
}

// Two people whose phrases are already past the queue. A phrase sent through
// the client waits for a verdict nobody gives on a bare stand (§8.3), so the
// rows go in the way the socket suite does it — the subject here is hiding,
// not moderation.
async function twoWithPhrases(sql: postgres.Sql) {
  const person = async (name: string) => {
    const c = new Client(node!, apiKey!);
    await c.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() });
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
    const me = await client.register({ name: "Женя", age: 30 }, { pin: "123456", paperCode: newPaperCode() });
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
    await client.register({ name: "Аня", age: 28 }, { pin: "123456", paperCode: newPaperCode() });
    await client.confirmPaperCode();
    const sent = await client.say({ text: "гуляю у реки, если кто рядом", mode: "alone", lat: 41.9, lon: 12.5, radius: 1000 });
    assertEquals(sent.status, 202, "a phrase was not accepted for checking");
    const feed = await client.feed({ lat: 41.9, lon: 12.5, radius: 1000 });
    assert(Array.isArray(feed.items), "the feed did not come back as a list");
  },
});

// The paper code is the whole of "I lost my phone" (§8.2), so the test is the
// way back itself: a clean device with nothing but the sixteen characters asks
// the node, gets the wrapped long key, opens it, and the key it opens signs
// what the identity's public key verifies. Written as the terminal types it
// back — lower case, dashes, an O for a zero — to hold the reading too.
Deno.test({
  name: "the paper code finds the identity on a clean device and opens its long key",
  ignore: !node,
  async fn() {
    const { derivePaperCode, unwrapLongKey, paperGroups } = await import("./paper.ts");
    const code = newPaperCode();
    const client = new Client(node!, apiKey!);
    await client.register({ name: "Аня", age: 30 }, { pin: "482913", paperCode: code });
    await client.confirmPaperCode();

    const typed = paperGroups(code).join("-").toLowerCase().replaceAll("0", "o");
    const { lookupId, wrapKey } = await derivePaperCode(typed);
    const fresh = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]) as CryptoKeyPair;
    const wrapPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
    const spki = async (k: CryptoKey) => {
      const bytes = new Uint8Array(await crypto.subtle.exportKey("spki", k));
      return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    };
    const claimed = await fetch(new URL("/recovery/claim", node!), {
      method: "POST",
      headers: { "content-type": "application/json", "x-protocol-version": "1", "x-api-key": apiKey! },
      body: JSON.stringify({ lookup_id: lookupId, sign_pub: await spki(fresh.publicKey), wrap_pub: await spki(wrapPair.publicKey) }),
    });
    const body = await claimed.json() as { identity_id?: string; recovery_wrapped_key?: string };
    assertEquals(claimed.status, 200, `the node did not find the identity by its paper code: ${JSON.stringify(body)}`);
    assertEquals(body.identity_id, client.identityId, "the code raised somebody else");

    const wrapped = Uint8Array.from(atob(body.recovery_wrapped_key!.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    const longKey = await unwrapLongKey(wrapped, wrapKey);
    const row = await rowOf(`SELECT identity_public_key FROM identities WHERE id = $1`, [client.identityId]);
    const pub = Uint8Array.from(atob(String(row.identity_public_key).replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    const verifier = await crypto.subtle.importKey("spki", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const said = new TextEncoder().encode("the same person");
    const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, longKey, said);
    assert(
      await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifier, signature, said),
      "the key under the paper code is not the identity's long key",
    );
  },
});

// One counter for every proof of the PIN (§8.2): a wrong old PIN in "change the
// PIN" costs an attempt, the new PIN is what "start again" is then confirmed
// with, and the old one no longer is.
Deno.test({
  name: "the PIN is changed with the old one and then confirms the close, the old one no longer does",
  ignore: !node,
  async fn() {
    const client = new Client(node!, apiKey!);
    await client.register({ name: "Женя", age: 30 }, { pin: "111111", paperCode: newPaperCode() });
    await client.confirmPaperCode();

    const wrong = await client.changePin("999999", "222222");
    assertEquals(wrong.status, 409, JSON.stringify(wrong.body));
    assertEquals(wrong.body.error?.code, "pin_mismatch");
    assertEquals(wrong.body.error?.attempts_left, 9, "a wrong old PIN did not cost an attempt");

    const changed = await client.changePin("111111", "222222");
    assertEquals(changed.status, 200, `the PIN was not changed: ${JSON.stringify(changed.body)}`);

    // The counter after a wrong PIN waits before the next try (§8.2); the
    // change put it back to ten, so the close below is not held by it.
    const stale = await client.closeIdentity("111111");
    assertEquals(stale.status, 409, `the old PIN still confirmed something: ${JSON.stringify(stale.body)}`);
    assertEquals(stale.body.error?.code, "pin_mismatch");

    const closed = await client.closeIdentity("222222");
    assertEquals(closed.status, 200, `the close was refused: ${JSON.stringify(closed.body)}`);
    const row = await rowOf(`SELECT closed_at FROM identities WHERE id = $1`, [client.identityId]);
    assert(row.closed_at !== null, "the identity is not closed");
  },
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
    await client.register({ name: "Аня", age: 30 }, { pin: "123456", paperCode: newPaperCode() });
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
