// The kept pair of a consent (keys.ts #freshPair, vault_store.ts "pairs"): a row under the same name that this
// session cannot open — left by an earlier session on this device — is replaced, so the half published now is
// the one kept on the disk and a reload finds it.
// keys.ts has parameter properties, which node's strip-only mode refuses: run by deno (run-depth-tests.sh).
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import type { Client } from "../../core/client.ts";
import { Ephemeral } from "../../core/seal.ts";
import type { PairRow } from "../vault_store.ts";
import { ChatKeys } from "./keys.ts";

const base64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const wrapPair = () => crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as Promise<CryptoKeyPair>;
const spkiOf = async (key: CryptoKey) => base64url(new Uint8Array(await crypto.subtle.exportKey("spki", key)));

function memoryStore() {
  const rows = new Map<string, PairRow>();
  return {
    rows,
    getOrPut: async (id: string, make: () => PairRow) => rows.get(id) ?? (rows.set(id, make()), rows.get(id)!),
    get: async (id: string) => rows.get(id),
    put: async (id: string, row: PairRow) => { rows.set(id, row); },
    drop: async (id: string) => { rows.delete(id); },
    prune: async (_before: number) => {},
  };
}

Deno.test("consent: a kept row this session cannot open is replaced by the pair it publishes", async () => {
  const identityId = "11111111-1111-4111-8111-111111111111", matchId = "22222222-2222-4222-8222-222222222222";
  const id = `${identityId}|match:${matchId}|0`;
  const earlier = await wrapPair(), now = await wrapPair();
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;

  // An earlier session on this device kept a pair under the same name, wrapped to its own key.
  const store = memoryStore();
  const stale = await Ephemeral.generateKept(await spkiOf(earlier.publicKey), id);
  store.rows.set(id, { kept: stale.kept, spki: stale.eph.publicSpki, epoch: 0, at: Date.now() });

  let published = "";
  const client = {
    identityId, wrapPublicSpki: await spkiOf(now.publicKey), wrapPrivate: now.privateKey,
    request: async (_m: string, _p: string, body: { ephemeral_public_key?: string }) => {
      published = body.ephemeral_public_key ?? "";
      return { status: 200, body: { state: "waiting" } };
    },
  } as unknown as Client;
  const answer = await new ChatKeys(client, long.privateKey, store).consent(matchId);
  assertEquals(answer.status, 200);

  const row = store.rows.get(id)!;
  assertNotEquals(row.kept, stale.kept, "the stale row stayed: the published pair is not kept and a reload loses it");
  assert(published !== "", "consent published no half");
  assertEquals(row.spki, published, "the kept row is not the half consent published");
  const back = await Ephemeral.restore(row.kept, row.spki, now.privateKey, id);
  assertEquals(back.publicSpki, published);
});

Deno.test("reload: the kept pair is taken at the chat's epoch, whatever epoch the row's unsealed field says", async () => {
  const identityId = "11111111-1111-4111-8111-111111111111", chatId = "33333333-3333-4333-8333-333333333333";
  const id = `${identityId}|chat:${chatId}|1`;
  const wrap = await wrapPair();
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const store = memoryStore();
  const kept = await Ephemeral.generateKept(await spkiOf(wrap.publicKey), id);
  // Someone with the disk rewrote the plain epoch field; the label sealed into the box still says 1.
  store.rows.set(id, { kept: kept.kept, spki: kept.eph.publicSpki, epoch: 7, at: Date.now() });
  const client = {
    identityId, wrapPublicSpki: await spkiOf(wrap.publicKey), wrapPrivate: wrap.privateKey,
    request: async () => ({ status: 404, body: {} }),
  } as unknown as Client;
  const row = { id: chatId, match_id: null, key_epoch: 1, me: identityId, peer: { identity_id: "p", key_epoch: 1, identity_public_key: "x" } };
  // The kept pair is used, so the next thing missing is the peer's half (not a fall to the node's wrap).
  const err = await new ChatKeys(client, long.privateKey, store).open(row as never).then(() => null, (e: Error) => e);
  assertEquals(err?.message, "the peer's ephemeral half is missing: this conversation has no keys",
    "the kept pair was skipped: its epoch was read from the row's unsealed field");
});

Deno.test("rekey: a refusal drops only the row this tab wrote, not the pair another tab kept under that name", async () => {
  const identityId = "11111111-1111-4111-8111-111111111111", chatId = "44444444-4444-4444-8444-444444444444";
  const id = `${identityId}|chat:${chatId}|1`;
  const wrap = await wrapPair();
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const store = memoryStore();
  // Another tab of this session kept its rekey pair first; its own POST may still succeed.
  const theirs = await Ephemeral.generateKept(await spkiOf(wrap.publicKey), id);
  store.rows.set(id, { kept: theirs.kept, spki: theirs.eph.publicSpki, epoch: 1, at: Date.now() });
  const client = {
    identityId, wrapPublicSpki: await spkiOf(wrap.publicKey), wrapPrivate: wrap.privateKey,
    request: async () => ({ status: 409, body: {} }),
  } as unknown as Client;
  const row = { id: chatId, match_id: null, key_epoch: 0, me: identityId, peer: { identity_id: "p", key_epoch: 0, identity_public_key: "x" } };
  const answer = await new ChatKeys(client, long.privateKey, store).requestRekey(row as never);
  assertEquals(answer.status, 409);
  assertEquals(store.rows.get(id)?.kept, theirs.kept, "the other tab's kept pair was dropped on this tab's refusal: its reload loses the rekey");
});

Deno.test("rekey: a refusal drops the row this tab wrote itself", async () => {
  const identityId = "11111111-1111-4111-8111-111111111111", chatId = "55555555-5555-4555-8555-555555555555";
  const id = `${identityId}|chat:${chatId}|1`;
  const wrap = await wrapPair();
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const store = memoryStore();
  const client = {
    identityId, wrapPublicSpki: await spkiOf(wrap.publicKey), wrapPrivate: wrap.privateKey,
    request: async () => ({ status: 409, body: {} }),
  } as unknown as Client;
  const row = { id: chatId, match_id: null, key_epoch: 0, me: identityId, peer: { identity_id: "p", key_epoch: 0, identity_public_key: "x" } };
  await new ChatKeys(client, long.privateKey, store).requestRekey(row as never);
  assertEquals(store.rows.has(id), false, "this tab's own refused row stayed on the disk");
});

Deno.test("reload: a kept row under a wrap key this identity no longer holds is erased, not left for 14 days", async () => {
  const identityId = "11111111-1111-4111-8111-111111111111", chatId = "66666666-6666-4666-8666-666666666666";
  const id = `${identityId}|chat:${chatId}|1`;
  const oldWrap = await wrapPair(), newWrap = await wrapPair();
  const long = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]) as CryptoKeyPair;
  const store = memoryStore();
  const stale = await Ephemeral.generateKept(await spkiOf(oldWrap.publicKey), id);
  store.rows.set(id, { kept: stale.kept, spki: stale.eph.publicSpki, epoch: 1, at: Date.now() });
  const client = {
    identityId, wrapPublicSpki: await spkiOf(newWrap.publicKey), wrapPrivate: newWrap.privateKey,
    request: async () => ({ status: 404, body: {} }),
  } as unknown as Client;
  const row = { id: chatId, match_id: null, key_epoch: 1, me: identityId, peer: { identity_id: "p", key_epoch: 1, identity_public_key: "x" } };
  await new ChatKeys(client, long.privateKey, store).open(row as never).catch(() => undefined);
  assertEquals(store.rows.has(id), false, "a row no key of this identity opens stayed on the disk");
});
