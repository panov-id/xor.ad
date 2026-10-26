// The chats list's room (chat spec §8.12, protocol §4.4, db/087_inbox_room.sql; owner's decision 2026-10-26: «Сразу
// канал узла»). One socket per session hears «the list changed» whenever a match or a chat of its identity changes or
// a line waits for it; nothing of what changed rides on the frame. A stranger's room hears nothing. Run through
// scripts/run-relay-database-tests.sh.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "inbox-room-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "inbox-room-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "inbox-room-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const relay = await import("../src/chat/relay.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");
await import("../src/routes/likes.ts");
await import("../src/routes/matches.ts");
await import("../src/routes/chats.ts");
await import("../src/routes/inbox.ts");

const KEY_ID = "ak_pub_inboxroomtest0001";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);
// Warmed before the first case: a listener opened inside a case is a leak.
await relay.listenForRooms();
addEventListener("unload", () => {
  database.closePool();
});

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;
type Who = { identity_id: string; session_id: string; pair: CryptoKeyPair };

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
        "x-origin-token": "inbox-room-origin-token",
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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function signed(who: Who, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: { "x-identity-session": who.session_id, "x-identity-time": String(time), "x-identity-sign": auth.bytesToBase64url(signature) },
  });
}

async function person(): Promise<Who> {
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
  const who = { ...(answer.body as { identity_id: string; session_id: string }), pair };
  const confirmed = await signed(who, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return who;
}

async function seedPhrase(identity: string, text: string, mode = "alone"): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'xor', $2, $3, $4, 'und', 60.17, 24.94, 1000, 60.17, 24.94, now(), now() + interval '3 hours')`,
    [id, identity, text, mode],
  );
  return id;
}

async function halfFor(who: Who, matchId: string) {
  const key = auth.bytesToBase64url(new Uint8Array(await crypto.subtle.exportKey(
    "spki", ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair).publicKey)));
  const prefix = new TextEncoder().encode("xor.ephemeral.v1\n" + matchId + "\n");
  const raw = auth.base64urlToBytes(key)!;
  const bytes = new Uint8Array(prefix.length + raw.length);
  bytes.set(prefix); bytes.set(raw, prefix.length);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, bytes));
  return { ephemeral_public_key: key, ephemeral_signature: auth.bytesToBase64url(signature) };
}

type Frame = { type: string; seq: number; data: Record<string, unknown> };

// The chats list's room for one person, through a real ticket and socket; frames are collected as they come.
async function inboxRoom(port: number, who: Who) {
  const bought = await signed(who, "POST", "/inbox/ticket");
  assertEquals(bought.status, 200, `no ticket: ${JSON.stringify(bought.body)}`);
  const ticket = (bought.body as { ticket: string }).ticket;
  const frames: Frame[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`, ["xor.p1", `ticket.${ticket}`]);
  socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)));
  socket.onerror = () => {};
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    setTimeout(() => reject(new Error("the socket never opened")), 3000);
  });
  await until(() => (relay.roomsForTest().get(`inbox:${who.identity_id}`)?.size ?? 0) === 1, "the room never opened — the case proves nothing");
  // the room opens with one «changed» for whatever happened between the ticket and the socket
  await until(() => frames.some((f) => f.type === "inbox"), "the room opened without its first «changed»");
  frames.length = 0;
  return { socket, frames, ticket };
}

async function until(ok: () => boolean, why: string, ms = 2000) {
  const end = Date.now() + ms;
  while (Date.now() < end && !ok()) await new Promise((r) => setTimeout(r, 20));
  assert(ok(), why);
}
const quiet = (ms = 400) => new Promise((r) => setTimeout(r, ms));
const changed = (frames: Frame[]) => frames.filter((f) => f.type === "inbox").length;

const test = (name: string, fn: () => Promise<void>) => Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn });

test("a match and the chat it opens reach both sides' chats list, and nobody else's (§8.12)", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const [a, b, c] = [await person(), await person(), await person()];
  const mine = await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  const [ra, rb, rc] = [await inboxRoom(server.addr.port, a), await inboxRoom(server.addr.port, b), await inboxRoom(server.addr.port, c)];
  try {
    await signed(a, "POST", `/feed/${theirs}/like`);
    const back = await signed(b, "POST", `/feed/${mine}/like`);
    assertEquals((back.body as { state?: string }).state, "matched", `the setup made no match: ${JSON.stringify(back.body)}`);
    await until(() => changed(ra.frames) > 0, "the one who liked first never heard of the match on «Chats»");
    await until(() => changed(rb.frames) > 0, "the one who matched never heard of it on «Chats»");
    assertEquals(ra.frames.find((f) => f.type === "inbox")?.data, {}, "the frame carries what changed; it must carry nothing");

    const matchId = (back.body as { match_id: string }).match_id;
    ra.frames.length = 0; rb.frames.length = 0;
    await signed(a, "POST", `/matches/${matchId}/consent`, await halfFor(a, matchId));
    // the other side stands on «Chats» while the first «yes» is said: crowd runs 8-11 never saw it come
    await until(() => changed(rb.frames) > 0, "the other side heard nothing of the first «yes»");
    rb.frames.length = 0;
    const agreed = await signed(b, "POST", `/matches/${matchId}/consent`, await halfFor(b, matchId));
    assert((agreed.body as { chat_id?: string }).chat_id, `the consents opened no chat: ${JSON.stringify(agreed.body)}`);
    await until(() => changed(ra.frames) > 0, "the chat opened and the first to say yes never heard it on «Chats»");

    await quiet();
    assertEquals(changed(rc.frames), 0, "a stranger's chats list heard another pair's match");
  } finally {
    for (const r of [ra, rb, rc]) r.socket.close();
    await server.shutdown();
    for (const w of [a, b, c]) relay.roomsForTest().delete(`inbox:${w.identity_id}`);
  }
});

test("an inbox ticket opens one room once; a spent one is refused 4001", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await person();
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  const first = await inboxRoom(server.addr.port, a);
  try {
    const again = new WebSocket(`ws://127.0.0.1:${server.addr.port}/chat`, ["xor.p1", `ticket.${first.ticket}`]);
    const code = await new Promise<number>((resolve) => { again.onclose = (e) => resolve(e.code); again.onerror = () => {}; });
    assertEquals(code, 4001, "a spent inbox ticket opened a second room");
    const [row] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM socket_tickets WHERE session = $1`, [a.session_id]);
    assertEquals(row.n, 0, "the spent ticket stayed in the table");
  } finally {
    first.socket.close();
    await server.shutdown();
    relay.roomsForTest().delete(`inbox:${a.identity_id}`);
  }
});

test("an unsigned call buys no inbox ticket", async () => {
  const answer = await call("POST", "/inbox/ticket");
  assertEquals(answer.status, 401, `an unsigned inbox ticket was answered ${answer.status}`);
});

test("a match taken away (sweeper, block) reaches both sides' chats list (§8.12)", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const [a, b] = [await person(), await person()];
  const mine = await seedPhrase(a.identity_id, "кто в парк?");
  const theirs = await seedPhrase(b.identity_id, "иду в парк");
  await signed(a, "POST", `/feed/${theirs}/like`);
  const back = await signed(b, "POST", `/feed/${mine}/like`);
  const matchId = (back.body as { match_id: string }).match_id;
  assert(matchId, `the setup made no match: ${JSON.stringify(back.body)}`);
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  const [ra, rb] = [await inboxRoom(server.addr.port, a), await inboxRoom(server.addr.port, b)];
  try {
    await database.queryOrThrow(`UPDATE matches SET expires_at = now() WHERE id = $1`, [matchId]);
    await until(() => changed(ra.frames) > 0 && changed(rb.frames) > 0, "a match taken down in place (expires_at) reached no list");
    ra.frames.length = 0; rb.frames.length = 0;
    await database.queryOrThrow(`DELETE FROM matches WHERE id = $1`, [matchId]);
    await until(() => changed(ra.frames) > 0, "a match was taken away and the first side never heard it");
    await until(() => changed(rb.frames) > 0, "a match was taken away and the second side never heard it");
  } finally {
    ra.socket.close(); rb.socket.close();
    await server.shutdown();
    for (const w of [a, b]) relay.roomsForTest().delete(`inbox:${w.identity_id}`);
  }
});
