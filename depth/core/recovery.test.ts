// The paper code used against a live node — scripts/run-depth-tests.sh starts one.
//
// Raising the identity on a clean device and on the device the tenth PIN
// mistake closed, and trading the code for a new one: each checked by what the
// node keeps afterwards, not by what the client says about itself.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client, type HeldLongKey } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { raise, reissue } from "./recovery.ts";

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
  name: "a wrong current code is refused on the device, and the code on file stays",
  ignore: !node,
  async fn() {
    const { client, code } = await person("Лиза");
    const before = await rowOf(`SELECT recovery_auth_hash FROM identities WHERE id = $1`, [client.identityId]);
    assertEquals(await reissue(client, newPaperCode(), newPaperCode()), { ok: false, reason: "no_match" });
    const after = await rowOf(`SELECT recovery_auth_hash FROM identities WHERE id = $1`, [client.identityId]);
    assertEquals(after.recovery_auth_hash, before.recovery_auth_hash, "a wrong code moved the code on file");
    assertEquals((await raise(new Client(node!, apiKey!), code)).ok, true, "the right code stopped working");
  },
});
