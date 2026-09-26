// Step 6 (chat spec §8.13): the conversation's keys wrapped under the live
// session's wrap key, kept by the node as bytes it never reads (db/061,
// lib/chat_keys.ts, PUT and GET /chats/:id/keys). What the node promises: a
// wrap comes back only to the session that wrote it; a wrap at the wrong epoch
// is refused; a stranger sees the chat's 404; closing the chat, ending it by
// term, and agreeing to a reissue all take the wraps with them.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "chat-key-wraps-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "chat-key-wraps-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "chat-key-wraps-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { rekeyToSign } = await import("../src/routes/chats.ts");
await import("../src/routes/identity.ts");

const KEY_ID = "ak_pub_chatkeywrapstest01";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;

async function call(method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const url = new URL(`https://relay.test${path}`);
  const found = match(method, url.pathname);
  assert(found, `no route for ${method} ${url.pathname}`);
  const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await found.h({
    req: new Request(url, {
      method,
      headers: {
        "x-protocol-version": String(auth.PROTOCOL_MAJOR),
        "x-origin-token": "chat-key-wraps-origin-token",
        "x-client-ip": nextAddress(),
        ...(raw === undefined ? {} : { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      body: raw,
    }),
    params: found.params,
    url,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

type Person = { identity_id: string; session_id: string; pair: CryptoKeyPair };

async function signedCall(who: Person, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: {
      "x-identity-session": who.session_id,
      "x-identity-time": String(time),
      "x-identity-sign": auth.bytesToBase64url(signature),
    },
  });
}

async function person(): Promise<Person> {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall({ ...created, pair }, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair };
}

// A chat as consent leaves it (db/031), written straight in: the halves and the
// match are not what this file is about.
async function chat(a: Person, b: Person): Promise<string> {
  const id = crypto.randomUUID();
  const [low, high] = [a.identity_id, b.identity_id].sort();
  await database.queryOrThrow(`INSERT INTO chats (id, pair_key) VALUES ($1, $2)`, [id, `${low}:${high}:${id}`]);
  for (const p of [a, b]) {
    await database.queryOrThrow(
      `INSERT INTO chat_participants (chat_id, identity, ephemeral_public_key, ephemeral_signature) VALUES ($1, $2, 'half', 'sig')`,
      [id, p.identity_id],
    );
  }
  return id;
}

const wrapOf = (n = 120) => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(n)));
const wraps = async (chatId: string) =>
  (await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM chat_key_wraps WHERE chat_id = $1`, [chatId]))[0].n;
const code = (r: { body: unknown }) => (r.body as { error?: { code?: string } }).error?.code;

Deno.test("a wrap comes back to the session that wrote it, byte for byte, and to nobody else", async () => {
  const a = await person();
  const b = await person();
  const id = await chat(a, b);
  const mine = wrapOf();
  const put = await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: mine });
  assertEquals(put.status, 200, JSON.stringify(put.body));
  assertEquals(put.body, { epoch: 0 });

  const got = await signedCall(a, "GET", `/chats/${id}/keys`);
  assertEquals(got.status, 200, JSON.stringify(got.body));
  assertEquals(got.body, { epoch: 0, current_epoch: 0, wrapped_key: mine });

  // The other participant has written nothing: the node does not hand out A's.
  const theirs = await signedCall(b, "GET", `/chats/${id}/keys`);
  assertEquals(theirs.status, 404, JSON.stringify(theirs.body));
  assertEquals(code(theirs), "no_wrap");
  assertEquals((theirs.body as { error: { epoch: number } }).error.epoch, 0, "the refusal does not say which epoch to wrap at");

  // Written over, not added: one live session, one wrap.
  const next = wrapOf();
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: next })).status, 200);
  assertEquals((await signedCall(a, "GET", `/chats/${id}/keys`)).body.wrapped_key, next);
  assertEquals(await wraps(id), 1);
});

Deno.test("a stranger to the chat gets the chat's own 404, and a malformed wrap is refused", async () => {
  const a = await person();
  const b = await person();
  const c = await person();
  const id = await chat(a, b);
  const stranger = await signedCall(c, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() });
  assertEquals(stranger.status, 404);
  assertEquals(code(stranger), "not_found");
  assertEquals(code(await signedCall(c, "GET", `/chats/${id}/keys`)), "not_found");
  assertEquals(await wraps(id), 0, "a stranger's wrap was stored");

  for (const body of [
    { epoch: 0 },
    { wrapped_key: wrapOf() },
    { epoch: -1, wrapped_key: wrapOf() },
    { epoch: 0, wrapped_key: "" },
    { epoch: 0, wrapped_key: "not base64url!" },
    { epoch: 0, wrapped_key: "a".repeat(1025) },
  ]) {
    const refused = await signedCall(a, "PUT", `/chats/${id}/keys`, body);
    assertEquals(refused.status, 400, `${JSON.stringify(body).slice(0, 60)} was taken: ${refused.status}`);
    assertEquals(code(refused), "invalid_body");
  }
  // The route's bound and the table's agree: 768 bytes is the most a wrap of
  // 1024 characters decodes to, so one byte more never reaches db/061's CHECK.
  const big = await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf(769) });
  assertEquals(big.status, 400, JSON.stringify(big.body));
  const most = await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf(768) });
  assertEquals(most.status, 200, JSON.stringify(most.body));
  assertEquals(await wraps(id), 1);
});

Deno.test("a wrap names the epoch this side holds, or it is out of step", async () => {
  const a = await person();
  const b = await person();
  const id = await chat(a, b);
  await database.queryOrThrow(`UPDATE chat_participants SET key_epoch = 2 WHERE chat_id = $1 AND identity = $2`, [id, a.identity_id]);
  const stale = await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 1, wrapped_key: wrapOf() });
  assertEquals(stale.status, 409, JSON.stringify(stale.body));
  assertEquals(code(stale), "wrap_out_of_step");
  assertEquals((stale.body as { error: { epoch: number } }).error.epoch, 2);
  assertEquals(await wraps(id), 0);
  const current = await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 2, wrapped_key: wrapOf() });
  assertEquals(current.status, 200, JSON.stringify(current.body));
  assertEquals((await signedCall(a, "GET", `/chats/${id}/keys`)).body.epoch, 2);
});

Deno.test("closing the chat takes both wraps with it", async () => {
  const a = await person();
  const b = await person();
  const id = await chat(a, b);
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 200);
  assertEquals((await signedCall(b, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 200);
  assertEquals(await wraps(id), 2);
  assertEquals((await signedCall(a, "DELETE", `/chats/${id}`)).status, 200);
  assertEquals(await wraps(id), 0, "the wraps outlived the chat");
  assertEquals((await signedCall(b, "GET", `/chats/${id}/keys`)).status, 404);
});

Deno.test("a chat past its term drops its wraps on the first call that meets it", async () => {
  const a = await person();
  const b = await person();
  const id = await chat(a, b);
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 200);
  // A's own term is over: ten minutes of idle, created an hour ago.
  await database.queryOrThrow(`UPDATE chats SET created_at = now() - interval '1 hour' WHERE id = $1`, [id]);
  await database.queryOrThrow(`UPDATE chat_participants SET idle_ttl_minutes = 10 WHERE chat_id = $1 AND identity = $2`, [id, a.identity_id]);
  // Over for A: the read says so, and stores nothing.
  const over = await signedCall(a, "GET", `/chats/${id}/keys`);
  assertEquals(over.status, 404);
  assertEquals(code(over), "not_found");
  // Sending is what writes A's end (§8.10), and the wraps go with it.
  const sent = await signedCall(a, "POST", `/chats/${id}/messages`, { local_id: crypto.randomUUID(), ciphertext: "AAAA" });
  assertEquals(sent.status, 404, JSON.stringify(sent.body));
  assertEquals(await wraps(id), 0, "the wraps outlived the term");
});

Deno.test("agreeing to a reissue drops the wraps of the old keys", async () => {
  const a = await person();
  const b = await person();
  const id = await chat(a, b);
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 200);
  assertEquals((await signedCall(b, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 200);
  const half = async (who: Person, epoch: number) => {
    const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", eph.publicKey));
    const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, rekeyToSign(id, epoch, spki)));
    return { epoch, ephemeral_public_key: auth.bytesToBase64url(spki), ephemeral_signature: auth.bytesToBase64url(signature) };
  };
  const asked = await signedCall(a, "POST", `/chats/${id}/rekey`, await half(a, 1));
  assertEquals(asked.status, 200, JSON.stringify(asked.body));
  assertEquals(asked.body.state, "waiting");
  assertEquals(await wraps(id), 2, "a request alone dropped the wraps: B still reads with the old keys");
  // A's wrap of epoch 0 is now out of step on A's side; B's is not yet.
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 409);
  const agreed = await signedCall(b, "POST", `/chats/${id}/rekey`, await half(b, 1));
  assertEquals(agreed.status, 200, JSON.stringify(agreed.body));
  assertEquals(agreed.body.state, "agreed");
  assertEquals(await wraps(id), 0, "the wraps of the old keys survived the reissue");
  // Both wrap the new keys at the new epoch.
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 1, wrapped_key: wrapOf() })).status, 200);
  assertEquals((await signedCall(b, "PUT", `/chats/${id}/keys`, { epoch: 1, wrapped_key: wrapOf() })).status, 200);
  const read = await signedCall(a, "GET", `/chats/${id}/keys`);
  assertEquals(read.body.epoch, 1);
  assertEquals(read.body.current_epoch, 1);
});

Deno.test("a frozen session's wrap stays, and the next device starts with none", async () => {
  const a = await person();
  const b = await person();
  const id = await chat(a, b);
  assertEquals((await signedCall(a, "PUT", `/chats/${id}/keys`, { epoch: 0, wrapped_key: wrapOf() })).status, 200);
  // A moves to a new device: the old session frozen, a new live one written
  // in (what POST /sessions/.../ack does, in the table's own terms).
  await database.queryOrThrow(
    `UPDATE sessions SET frozen_at = now(), frozen_reason = 'transfer' WHERE id = $1`, [a.session_id],
  );
  const fresh = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", fresh.publicKey));
  const newSession = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO sessions (id, identity, sign_public_key, wrap_public_key) VALUES ($1, $2, $3, 'wrap')`,
    [newSession, a.identity_id, auth.bytesToBase64url(spki)],
  );
  const moved: Person = { identity_id: a.identity_id, session_id: newSession, pair: fresh };
  const empty = await signedCall(moved, "GET", `/chats/${id}/keys`);
  assertEquals(empty.status, 404, JSON.stringify(empty.body));
  assertEquals(code(empty), "no_wrap");
  // The old session's row is still there — it comes back with the session if
  // the transfer is undone — and the new device may wrap after a reissue.
  assertEquals(await wraps(id), 1);
});
