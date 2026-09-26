// The paper code used against a live node — scripts/run-depth-tests.sh starts one.
//
// Raising the identity on a clean device and on the device the tenth PIN
// mistake closed, and trading the code for a new one: each checked by what the
// node keeps afterwards, not by what the client says about itself.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client, type HeldLongKey } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { isCurrentCode, raise, reissue } from "./recovery.ts";

const node = Deno.env.get("DEPTH_NODE_URL");
const apiKey = Deno.env.get("DEPTH_API_KEY");
const databaseUrl = Deno.env.get("DEPTH_DATABASE_URL");

async function rowOf(text: string, args: string[]): Promise<Record<string, unknown>> {
  const sql = postgres(databaseUrl!, { max: 1 });
  try {
    return (await sql.unsafe(text, args))[0];
  } finally {
    await sql.end();
  }
}

async function person(name: string): Promise<{ client: Client; code: string }> {
  const client = new Client(node!, apiKey!);
  const code = newPaperCode();
  await client.register({ name, age: 30 }, { pin: "123456", paperCode: code });
  await client.confirmPaperCode();
  return { client, code };
}

// The public half of the long key the device opened, read inside the call that
// holds it extractable — to be compared with what the node registered.
function spyOnLongKey(): { hold: (k: CryptoKey) => Promise<HeldLongKey>; spki: () => string } {
  let seen = "";
  return {
    hold: async (k) => {
      const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", k);
      const pub = await crypto.subtle.importKey("jwk", { kty, crv, x, y }, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
      const bytes = new Uint8Array(await crypto.subtle.exportKey("spki", pub));
      seen = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      return { use: () => Promise.reject(new Error("a spy holds nothing")), signing: () => Promise.reject(new Error("a spy holds nothing")) };
    },
    spki: () => seen,
  };
}

Deno.test({
  name: "the paper code raises the identity on a clean device, and the lost one is frozen",
  ignore: !node,
  async fn() {
    const { client: lost, code } = await person("Женя");
    const found = new Client(node!, apiKey!);
    const spy = spyOnLongKey();
    const raised = await raise(found, code, { label: "terminal", hold: spy.hold });
    assertEquals(raised, { ok: true, sameDevice: false }, "the code did not raise the identity");
    assertEquals(found.identityId, lost.identityId, "a different identity came up");
    assert(found.sessionId && found.sessionId !== lost.sessionId, "no new session was seated");

    const identity = await rowOf(`SELECT identity_public_key FROM identities WHERE id = $1`, [found.identityId]);
    assertEquals(spy.spki(), identity.identity_public_key, "the key the device opened is not the identity's long key");
    const session = await rowOf(`SELECT sign_public_key FROM sessions WHERE id = $1`, [found.sessionId]);
    assert(session.sign_public_key !== identity.identity_public_key, "the new session signs with the long key itself");

    const pin = await found.firstPin("654321");
    assertEquals(pin.status, 204, `the first PIN after the code was refused: ${JSON.stringify(pin.body)}`);
    assertEquals((await found.profile()).name, "Женя", "the raised session cannot read its own profile");
    const old = await rowOf(`SELECT frozen_reason FROM sessions WHERE id = $1`, [lost.sessionId]);
    assertEquals(old.frozen_reason, "transfer", "the lost device's session is still live");
    await assertRejects(() => lost.profile(), Error, "401");
  },
});

Deno.test({
  name: "the tenth PIN mistake is lifted by the paper code on the same device",
  ignore: !node,
  async fn() {
    const { client, code } = await person("Аня");
    // Nine mistakes are the node's backoff to wait out; the tenth is made for real.
    await rowOf(`UPDATE vault_shares SET attempts_left = 1, next_attempt_at = NULL WHERE session = $1 RETURNING 1`, [client.sessionId]);
    const tenth = await client.changePin("000000", "111111");
    assertEquals(tenth.body?.error?.code, "pin_locked", "the tenth mistake did not lock the PIN");
    await assertRejects(() => client.profile(), Error, "401");

    const raised = await raise(client, code);
    assertEquals(raised, { ok: true, sameDevice: true }, "the code did not raise this device");
    const share = await rowOf(
      `SELECT v.attempts_left, v.locked_at, s.frozen_at FROM vault_shares v JOIN sessions s ON s.id = v.session WHERE v.session = $1`,
      [client.sessionId],
    );
    assertEquals(share.attempts_left, 10, "the PIN counter did not go back to ten");
    assertEquals(share.locked_at, null, "the PIN is still locked");
    assertEquals(share.frozen_at, null, "the session is still frozen");
    assertEquals((await client.profile()).name, "Аня", "the raised device cannot read its profile");
    const pin = await client.firstPin("222222");
    assertEquals(pin.status, 204, "a new PIN could not be set after the code");
    assertEquals((await client.changePin("222222", "333333")).status, 200, "the new PIN does not open this device");
  },
});

Deno.test({
  name: "a reissued code raises the identity and the old one raises nobody",
  ignore: !node,
  async fn() {
    const { client, code: old } = await person("Марк");
    const next = newPaperCode();
    assertEquals(await reissue(client, old, next), { ok: true }, "the node did not take the new code");

    assertEquals((await raise(new Client(node!, apiKey!), old)).ok, false, "the old code still raises the identity");
    const found = new Client(node!, apiKey!);
    const spy = spyOnLongKey();
    assertEquals(await raise(found, next, { hold: spy.hold }), { ok: true, sameDevice: false }, "the new code raises nobody");
    const identity = await rowOf(`SELECT identity_public_key FROM identities WHERE id = $1`, [client.identityId]);
    assertEquals(spy.spki(), identity.identity_public_key, "the new code opens another key than the identity's");

    // And the device raised by it can trade it again: the key under it is kept.
    assertEquals(await reissue(found, next, newPaperCode()), { ok: true }, "a raised device cannot reissue its code");
  },
});

Deno.test({
  name: "a raised device signs its chat half with the long key, and both sides see one safety code",
  ignore: !node,
  async fn() {
    // The session key signs requests, the long key signs halves: swapped, the
    // node refuses the consent ("not signed by your long key"), and a safety
    // code made of the session key differs from the peer's (verifier, 2026-09-26).
    const { client: lost, code } = await person("Женя");
    const found = new Client(node!, apiKey!);
    assertEquals((await raise(found, code)).ok, true);
    assertEquals((await found.firstPin("654321")).status, 204);
    const identity = await rowOf(`SELECT identity_public_key FROM identities WHERE id = $1`, [lost.identityId]);
    assertEquals(found.longSpki, identity.identity_public_key, "the raised device names another long key");
    const { client: peer } = await person("Аня");
    const sql = postgres(databaseUrl!, { max: 1 });
    try {
      const put = async (who: string, text: string) => {
        const id = crypto.randomUUID();
        await sql.unsafe(
          `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
             lat_published, lon_published, visible_at, expires_at)
           VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '3 hours')`,
          [id, who, text]);
        return id;
      };
      const mine = await put(found.identityId, "кто на набережную?");
      const theirs = await put(peer.identityId, "гуляю у реки");
      await found.like(theirs);
      const matchId = (await peer.like(mine)).body.match_id!;
      const consent = await found.consent(matchId);
      assertEquals(consent.status, 200, `the node refused the raised device's half: ${JSON.stringify(consent.body)}`);
      const chatId = (await peer.consent(matchId)).body.chat_id!;
      const here = (await found.openConversation(chatId, matchId)).safetyCode;
      const there = (await peer.openConversation(chatId, matchId)).safetyCode;
      assertEquals(here, there, "the two sides show different safety codes");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "a wrong current code is refused on the device, and the code on file stays",
  ignore: !node,
  async fn() {
    const { client, code } = await person("Лиза");
    const before = await rowOf(`SELECT recovery_auth_hash FROM identities WHERE id = $1`, [client.identityId]);
    assertEquals(await isCurrentCode(client, newPaperCode()), false, "a wrong code passed the check before a new one is shown");
    assertEquals(await isCurrentCode(client, code.toLowerCase()), true, "the right code failed the check before a new one is shown");
    assertEquals(await reissue(client, newPaperCode(), newPaperCode()), { ok: false, reason: "no_match" });
    const after = await rowOf(`SELECT recovery_auth_hash FROM identities WHERE id = $1`, [client.identityId]);
    assertEquals(after.recovery_auth_hash, before.recovery_auth_hash, "a wrong code moved the code on file");
    assertEquals((await raise(new Client(node!, apiKey!), code)).ok, true, "the right code stopped working");
  },
});

// Both answers to a reissue lost (depth.reissue.lostreply, verifier of B1): the
// node took the new code, the device never heard. It used to keep the key under
// the retired code for the rest of the process, and asking again with a new
// nonce was refused as a miss. Now the next call replays the same nonce and
// body, learns the new code is live, and keeps the key under it.
Deno.test({
  name: "a reissue whose answer is lost twice leaves the device under the new code, not the old",
  ignore: !node,
  async fn() {
    const { client, code: old } = await person("Лёва");
    const next = newPaperCode();
    // The request reaches the node; its answer does not reach the device.
    const real = client.request.bind(client);
    let lose = 2;
    client.request = (async (method: string, path: string, body?: unknown, signed?: boolean) => {
      const answer = await real(method, path, body, signed);
      if (path === "/recovery/reissue" && lose-- > 0) throw new Error("the answer was lost on the way");
      return answer;
    }) as typeof client.request;
    await assertRejects(() => reissue(client, old, next), Error, "lost on the way");
    const moved = await rowOf(`SELECT count(*)::int AS n FROM nonces WHERE session_id = $1 AND route = 'POST /recovery/reissue'`, [client.sessionId!]);
    assertEquals(moved.n, 1, "the node did not take the reissue whose answers were lost");

    // Asked again with the same two codes: done, and the key is under the new one.
    assertEquals(await reissue(client, old, next), { ok: true }, "the retry after two lost answers was refused");
    assertEquals(await isCurrentCode(client, next), true, "the device does not hold the key under the code the node has");
    assertEquals(await isCurrentCode(client, old), false, "the device still holds the key under the retired code");

    // And it can go on: the next reissue from the new code, and a clean device
    // raised by the one after it opens the identity's key.
    const third = newPaperCode();
    assertEquals(await reissue(client, next, third), { ok: true }, "the device cannot reissue from the code the node has");
    const found = new Client(node!, apiKey!);
    const spy = spyOnLongKey();
    assertEquals(await raise(found, third, { hold: spy.hold }), { ok: true, sameDevice: false }, "the latest code raises nobody");
    const identity = await rowOf(`SELECT identity_public_key FROM identities WHERE id = $1`, [client.identityId!]);
    assertEquals(spy.spki(), identity.identity_public_key, "the latest code opens another key than the identity's");
  },
});

Deno.test({
  name: "a keeper that fails is an error, not a wrong code",
  ignore: !node,
  async fn() {
    // By then the node has seated the new session: "that code does not match"
    // would send the person to type a right code again (verifier, 2026-09-26).
    const { code } = await person("Ира");
    await assertRejects(
      () => raise(new Client(node!, apiKey!), code, { hold: () => Promise.reject(new Error("the keeper broke")) }),
      Error,
      "the keeper broke",
    );
  },
});
