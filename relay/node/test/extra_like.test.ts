// A like inside a live conversation (chat spec §8.7, W10-N2): the phrase joins
// the chat's starters at the next position, and both sides learn — each room
// gets an extra_like frame with the direction from its own side, and a side
// with no open room reads it from GET /inbox. One-sided delivery is forbidden
// (§8.7): the row is what both see, the frame is transit. Run through
// scripts/run-relay-database-tests.sh.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "extra-like-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "extra-like-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "extra-like-vault-key");
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

const KEY_ID = "ak_pub_extraliketest0001";
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
        "x-origin-token": "extra-like-origin-token",
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

// Two phrases liked both ways, both consents: a live conversation whose
// header holds starters 1 and 2. b keeps a second phrase for the extra like.
async function openChat() {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const a = await person();
  const b = await person();
  const mine = await seedPhrase(a.identity_id, "кто на набережную?");
  const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
  const later = await seedPhrase(b.identity_id, "кто-нибудь идёт на набережную вечером", "company");
  await signed(a, "POST", `/feed/${theirs}/like`);
  const back = await signed(b, "POST", `/feed/${mine}/like`);
  assertEquals((back.body as { state?: string }).state, "matched", `the setup made no match: ${JSON.stringify(back.body)}`);
  const matchId = (back.body as { match_id: string }).match_id;
  await signed(a, "POST", `/matches/${matchId}/consent`, await halfFor(a, matchId));
  const agreed = await signed(b, "POST", `/matches/${matchId}/consent`, await halfFor(b, matchId));
  const chat = (agreed.body as { chat_id?: string }).chat_id;
  assert(chat, `the consents opened no chat: ${JSON.stringify(agreed.body)}`);
  const header = await database.queryOrThrow<{ position: number }>(
    `SELECT position FROM chat_starters WHERE chat_id = $1 ORDER BY position`, [chat]);
  assertEquals(header.map((r) => r.position), [1, 2], "the header is not starters 1 and 2 — the case proves nothing");
  return { a, b, chat, later };
}

type Frame = { type: string; seq: number; data: Record<string, unknown> };
// A room of the chat for one side, through a real ticket and socket; frames
// are collected as they come.
async function room(port: number, who: Who, chat: string) {
  const bought = await signed(who, "POST", `/chats/${chat}/ticket`);
  assertEquals(bought.status, 200, `no ticket: ${JSON.stringify(bought.body)}`);
  const frames: Frame[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`, ["xor.p1", `ticket.${(bought.body as { ticket: string }).ticket}`]);
  socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)));
  socket.onerror = () => {};
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    setTimeout(() => reject(new Error("the socket never opened")), 3000);
  });
  return { socket, frames };
}

async function roomsListed(chat: string, n: number) {
  const until = Date.now() + 2000;
  while (Date.now() < until && (relay.roomsForTest().get(chat)?.size ?? 0) < n) await new Promise((r) => setTimeout(r, 20));
  assertEquals(relay.roomsForTest().get(chat)?.size ?? 0, n, "the rooms never opened — the case proves nothing");
}

async function extraLikeFrame(frames: Frame[], ms = 2000): Promise<Frame | undefined> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const found = frames.find((f) => f.type === "extra_like");
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  return undefined;
}

const test = (name: string, fn: () => Promise<void>) => Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn });

test("a like into a live conversation reaches both rooms as starter 3, each with its own direction (§8.7, N2)", async () => {
  const { a, b, chat, later } = await openChat();
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  const roomA = await room(server.addr.port, a, chat);
  const roomB = await room(server.addr.port, b, chat);
  try {
    await roomsListed(chat, 2);
    const liked = await signed(a, "POST", `/feed/${later}/like`);
    assertEquals(liked.status, 200, JSON.stringify(liked.body));
    assertEquals(liked.body, { state: "liked" }, "a like into a live chat answered something other than liked");

    const [row] = await database.queryOrThrow<{ position: number; text_snapshot: string; mode: string; liked_by: string }>(
      `SELECT position, text_snapshot, mode, liked_by FROM chat_starters WHERE chat_id = $1 AND position = 3`, [chat]);
    assert(row, "the like added no starter at position 3");
    assertEquals(row.liked_by, a.identity_id);

    const toA = await extraLikeFrame(roomA.frames);
    const toB = await extraLikeFrame(roomB.frames);
    assert(toB, "the author of the phrase got no extra_like frame — the delivery was one-sided");
    assert(toA, "the one who liked got no extra_like frame — the delivery was one-sided");
    const text = "кто-нибудь идёт на набережную вечером";
    assertEquals(toA.data, { kind: "extra_like", position: 3, text, mode: "company", direction: "you_liked_theirs" },
      "the liker's frame is not the contract's, or not from the liker's side");
    assertEquals(toB.data, { kind: "extra_like", position: 3, text, mode: "company", direction: "they_liked_yours" },
      "the author's frame is not the contract's, or not from the author's side");
  } finally {
    roomA.socket.close();
    roomB.socket.close();
    await server.shutdown();
    relay.roomsForTest().delete(chat);
  }
});

test("a side with no open room learns of the extra like from its inbox, and the starter is there for both (§8.7, N2)", async () => {
  const { a, b, chat, later } = await openChat();
  // A visit a whole second before the like: `since` is in seconds.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const visit = Math.floor(Date.now() / 1000) - 1;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  const roomA = await room(server.addr.port, a, chat);
  try {
    await roomsListed(chat, 1);
    const before = await signed(b, "GET", `/inbox?since=${visit}`);
    assertEquals(before.status, 200);
    assertEquals((before.body as { events: { extra_likes: number } }).events.extra_likes, 0,
      "the header's own starters are counted as extra likes");

    const liked = await signed(a, "POST", `/feed/${later}/like`);
    assertEquals(liked.body, { state: "liked" });
    assert(await extraLikeFrame(roomA.frames), "the liker's open room got no frame");

    // b was offline: the inbox is its way in.
    const inboxB = await signed(b, "GET", `/inbox?since=${visit}`);
    assertEquals(inboxB.status, 200, JSON.stringify(inboxB.body));
    assertEquals((inboxB.body as { events: { extra_likes: number } }).events.extra_likes, 1,
      "the offline side's inbox does not show the extra like");
    const inboxA = await signed(a, "GET", `/inbox?since=${visit}`);
    assertEquals((inboxA.body as { events: { extra_likes: number } }).events.extra_likes, 1,
      "the liker's inbox does not show the row both sides see");
    const later2 = await signed(b, "GET", `/inbox?since=${Math.floor(Date.now() / 1000) + 1}`);
    assertEquals((later2.body as { events: { extra_likes: number } }).events.extra_likes, 0,
      "an extra like older than the visit is counted as new");

    // b comes back: its room opens on the same conversation, the row stands.
    const roomB = await room(server.addr.port, b, chat);
    try {
      await roomsListed(chat, 2);
      const rows = await database.queryOrThrow<{ position: number }>(
        `SELECT position FROM chat_starters WHERE chat_id = $1 ORDER BY position`, [chat]);
      assertEquals(rows.map((r) => r.position), [1, 2, 3]);
    } finally {
      roomB.socket.close();
    }
  } finally {
    roomA.socket.close();
    await server.shutdown();
    relay.roomsForTest().delete(chat);
  }
});
