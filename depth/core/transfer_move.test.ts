// `depth move` against a live node — scripts/run-depth-tests.sh starts one.
//
// Two clients in one process stand for the two devices. Each outcome is
// checked by what the node keeps afterwards — which session is live, which
// share is burned, which key the identity is known by — not by what the
// clients say about themselves.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { Client } from "./client.ts";
import { newPaperCode } from "./paper.ts";
import { HeldKey } from "./transfer.ts";
import { raise } from "./recovery.ts";
import { Arrival, Departure } from "./transfer_move.ts";

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

async function person(name: string): Promise<Client> {
  const client = new Client(node!, apiKey!);
  await client.register({ name, age: 30 }, { pin: "123456", paperCode: newPaperCode() }, { hold: HeldKey.hold });
  await client.confirmPaperCode();
  return client;
}

async function opened(from: Client, pin = "123456"): Promise<Departure> {
  const out = await Departure.open(from, await from.pinProof(pin));
  if (!(out instanceof Departure)) throw new Error(`the invitation was refused: ${out.status} ${JSON.stringify(out.body)}`);
  return out;
}

async function claimed(to: Client, code: string): Promise<Arrival> {
  const into = await Arrival.claim(to, code, "depth, test");
  if (!(into instanceof Arrival)) throw new Error(`the claim was refused: ${into.status} ${JSON.stringify(into.body)}`);
  return into;
}

Deno.test({
  name: "the identity moves: the new device signs as its own session, the old one is frozen and its share burned",
  ignore: !node,
  async fn() {
    const old = await person("Аня");
    const fresh = new Client(node!, apiKey!);
    const out = await opened(old);
    const into = await claimed(fresh, out.code);

    assertEquals(await out.state(), "claimed");
    assertEquals(out.check, into.check, "the two screens show different check characters");
    assertEquals(out.claimant?.label, "depth, test");
    assertEquals((await old.request("GET", "/identities/me")).status, 200, "the old device froze before anybody said yes");

    const approved = await out.approve();
    assertEquals(approved.status, 200, `approve refused: ${JSON.stringify(approved.body)}`);
    assertEquals(await into.state(), "approved");
    // The reply taken is the reply gone (B3): the node answers the ack, and
    // whoever holds the code asks for it after that in vain.
    assertEquals(await into.ackDone, 200, "the node did not take the ack");
    const after = await fresh.request<{ state?: string; reply_envelope?: string }>(
      "GET", `/sessions/${encodeURIComponent((await rowOf(`SELECT lookup_id FROM session_invites WHERE new_session = $1`, [fresh.sessionId])).lookup_id as string)}`,
      undefined, false,
    );
    assertEquals(after.body.reply_envelope, undefined, "the reply is still handed out after the ack");

    assertEquals(fresh.identityId, old.identityId, "a different identity arrived");
    assertEquals(fresh.longSpki, old.longSpki, "the long key that arrived is not the one that left");
    const identity = await rowOf(`SELECT identity_public_key FROM identities WHERE id = $1`, [old.identityId]);
    assertEquals(identity.identity_public_key, fresh.longSpki, "the node knows the identity by another long key");

    const before = await rowOf(`SELECT frozen_reason, (SELECT burned_at IS NOT NULL FROM vault_shares WHERE session = s.id) AS burned FROM sessions s WHERE id = $1`, [old.sessionId]);
    assertEquals(before, { frozen_reason: "transfer", burned: true }, "the old device was not frozen and burned");
    const live = await rowOf(`SELECT id, frozen_at FROM sessions WHERE identity = $1 AND frozen_at IS NULL`, [old.identityId]);
    assertEquals(live.id, fresh.sessionId, "the live session is not the new device's");

    const pin = await fresh.firstPin("654321");
    assertEquals(pin.status, 204, `the first PIN was refused: ${JSON.stringify(pin.body)}`);
    assertEquals((await fresh.request("GET", "/identities/me")).status, 200, "the new device cannot sign");
    assertEquals((await old.request("GET", "/identities/me")).status, 401, "the old device still signs");

    // And the arrived identity can leave again: the long key is held here too.
    const back = new Client(node!, apiKey!);
    const again = await opened(fresh, "654321");
    const home = await claimed(back, again.code);
    assertEquals(await again.state(), "claimed");
    assertEquals((await again.approve()).status, 200);
    assertEquals(await home.state(), "approved");
    assertEquals(await home.ackDone, 200);
    assertEquals(back.longSpki, old.longSpki, "the long key did not survive a second move");
  },
});

Deno.test({
  name: "\"it does not match\" kills the code: nothing moves, nothing freezes",
  ignore: !node,
  async fn() {
    const old = await person("Боря");
    const stranger = new Client(node!, apiKey!);
    const out = await opened(old);
    const into = await claimed(stranger, out.code);
    assertEquals(await out.state(), "claimed");
    assertEquals((await out.reject()).status, 204);
    assertEquals(await into.state(), "rejected");
    assertEquals(stranger.identityId, "", "the stranger was seated after a refusal");
    const row = await rowOf(`SELECT frozen_at FROM sessions WHERE id = $1`, [old.sessionId]);
    assertEquals(row.frozen_at, null, "a refusal froze the old device");
    assertEquals((await old.request("GET", "/identities/me")).status, 200);
  },
});

Deno.test({
  name: "a second claim cancels the move on both sides, and \"it is me\" then moves nothing",
  ignore: !node,
  async fn() {
    const old = await person("Вера");
    const out = await opened(old);
    const first = await claimed(new Client(node!, apiKey!), out.code);
    assertEquals(await out.state(), "claimed", "the owner never saw the first claim");
    const second = await Arrival.claim(new Client(node!, apiKey!), out.code, "shoulder");
    assert(!(second instanceof Arrival), "the second claim was accepted");
    assertEquals(second.status, 409);
    assertEquals(await out.state(), "cancelled");
    assertEquals(await first.state(), "cancelled");
    assertEquals((await out.approve()).status, 409, "\"it is me\" moved a cancelled transfer");
    assertEquals((await old.request("GET", "/identities/me")).status, 200, "a cancelled move froze the old device");
  },
});

Deno.test({
  name: "the window opens only with the right PIN, and a wrong one is counted",
  ignore: !node,
  async fn() {
    const old = await person("Гоша");
    const out = await Departure.open(old, await old.pinProof("000000"));
    assert(!(out instanceof Departure), "a wrong PIN opened a transfer window");
    assertEquals(out.status, 409);
    assertEquals((out.body as { error?: { code?: string } }).error?.code, "pin_mismatch");
  },
});

Deno.test({
  name: "an identity raised by its paper code on a clean device can move on from there",
  ignore: !node,
  async fn() {
    const code = newPaperCode();
    const lost = new Client(node!, apiKey!);
    await lost.register({ name: "Ева", age: 30 }, { pin: "123456", paperCode: code }, { hold: HeldKey.hold });
    await lost.confirmPaperCode();
    const found = new Client(node!, apiKey!);
    const raised = await raise(found, code, { label: "terminal", hold: HeldKey.hold });
    assert(raised.ok, "the paper code did not raise the identity");
    assertEquals((await found.firstPin("135790")).status, 204);
    const out = await opened(found, "135790");
    const next = new Client(node!, apiKey!);
    const into = await claimed(next, out.code);
    assertEquals(await out.state(), "claimed");
    assertEquals((await out.approve()).status, 200);
    assertEquals(await into.state(), "approved");
    assertEquals(await into.ackDone, 200);
    assertEquals(next.longSpki, lost.longSpki, "the long key did not survive the paper code and the move");
  },
});

Deno.test({
  name: "a device that never held its long key cannot open a window at all",
  ignore: !node,
  async fn() {
    const old = new Client(node!, apiKey!);
    await old.register({ name: "Даша", age: 30 }, { pin: "123456", paperCode: newPaperCode() });
    await old.confirmPaperCode();
    await assertRejects(() => Departure.open(old, new Uint8Array(32)), Error, "does not hold the long key");
  },
});
