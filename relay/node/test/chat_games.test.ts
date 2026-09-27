// GC1 (chat spec §6, screen 18; protocol §4.7; db/076): a game in a chat of
// two, on the tables' engine. Proposed and answered, played through the
// class's rules, sent to the conversation's rooms as the side that sees it,
// and gone with the conversation.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "chat-games-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "chat-games-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "chat-games-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const chatGames = await import("../src/lib/chat_games.ts");
const relay = await import("../src/chat/relay.ts");
const takeDown = await import("../src/lib/take_down.ts");
await import("../src/routes/away.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/chat_games.ts");
// The rooms' listeners, once and before any test: started inside one, they
// count as that test's leak (as session_freeze.test.ts does).
await (await import("../src/chat/relay.ts")).listenForRooms();

const KEY_ID = "ak_pub_chatgamestest00001";
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
        "x-origin-token": "chat-games-origin-token",
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

type Person = { identity_id: string; session_id: string; pair: CryptoKeyPair };

async function signed(who: Person, method: string, path: string, body?: unknown) {
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

// A known PIN proof, so a test can close an identity (POST /identities/close).
const PIN = new TextEncoder().encode("1234-chat-games");

async function person(age = 30): Promise<Person> {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: auth.bytesToBase64url(spki),
      wrap_pub: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age,
      auth_hash: await auth.sha256hex(PIN),
      share: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signed({ ...created, pair }, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair };
}

const nonce = () => auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(16)));
const code = (r: { body: unknown }) => (r.body as { error?: { code?: string } }).error?.code;

// A live chat of the two, as consent leaves it (db/031).
async function chatOf(a: Person, b: Person): Promise<string> {
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

// deno-lint-ignore no-explicit-any -- a Board of many classes, read field by field
type View = { class: string; your_seat: number | null; board: any; pending: any };
const view = async (who: Person, chat: string) => (await signed(who, "GET", `/chats/${chat}/game`)).body as View;

// Two rooms of the conversation, one per side, with sockets that keep what they are sent.
function rooms(chat: string, a: Person, b: Person) {
  const sent = new Map<string, { type: string; data: any }[]>([["a", []], ["b", []]]);
  const fake = (name: string) =>
    ({ readyState: WebSocket.OPEN, send: (t: string) => sent.get(name)!.push(JSON.parse(t)), close() {} }) as unknown as WebSocket;
  relay.roomsForTest().set(chat, new Set([
    { socket: fake("a"), session: a.session_id, chat, seq: 0 },
    { socket: fake("b"), session: b.session_id, chat, seq: 0 },
  ]));
  const waitFor = async (name: string, type: string, count = 1) => {
    const end = Date.now() + 3000;
    while (Date.now() < end && sent.get(name)!.filter((f) => f.type === type).length < count) {
      await new Promise((r) => setTimeout(r, 20));
    }
    return sent.get(name)!.filter((f) => f.type === type);
  };
  return { sent, waitFor, close: () => relay.roomsForTest().delete(chat) };
}

Deno.test({ name: "a game in a chat: proposed, accepted, played by the class's rules, framed to both rooms, and moving the mover's term", sanitizeOps: false, sanitizeResources: false }, async () => {
  const a = await person();
  const b = await person();
  const chat = await chatOf(a, b);
  const room = rooms(chat, a, b);
  try {
    assertEquals((await signed(a, "POST", `/chats/${chat}/game`, { class: "dots", set: "2x2" })).status, 204);
    const offered = await room.waitFor("b", "proposal");
    assertEquals([offered[0]?.data.kind, offered[0]?.data.mine], ["game", false], "the other side is offered the game");
    assert(!JSON.stringify(room.sent.get("b")).includes(a.identity_id), "no identity in the frame");
    // Nobody answers their own proposal.
    assertEquals(code(await signed(a, "POST", `/chats/${chat}/game/answer`, { answer: "accept" })), "refused");
    assertEquals((await signed(b, "POST", `/chats/${chat}/game/answer`, { answer: "accept" })).status, 204);
    const [mine, theirs] = [await view(a, chat), await view(b, chat)];
    assertEquals([mine.your_seat, theirs.your_seat, mine.board.turn], [1, 2, 1], "the proposer is seat 1 and moves first");

    // The dots engine of the tables: a taken edge is refused, a move needs the board's version.
    const moved = await signed(a, "POST", `/chats/${chat}/game/moves`, { seq: mine.board.seq, move: { edge: "h:0:0" } });
    assertEquals(moved.status, 200, JSON.stringify(moved.body));
    assertEquals(moved.body.board.turn, 2);
    const again = await signed(b, "POST", `/chats/${chat}/game/moves`, { seq: moved.body.board.seq, move: { edge: "h:0:0" } });
    assertEquals([code(again), again.body.error.reason], ["illegal_move", "the edge is taken"]);
    assertEquals(code(await signed(b, "POST", `/chats/${chat}/game/moves`, { seq: mine.board.seq, move: { edge: "h:0:1" } })), "stale_seq");
    assertEquals(code(await signed(a, "POST", `/chats/${chat}/game/moves`, { seq: moved.body.board.seq, move: { edge: "h:0:1" } })), "not_your_turn");

    const boards = await room.waitFor("b", "board", 2);
    assert(boards.some((f) => f.data?.turn === 2), `the move did not reach the other room: ${JSON.stringify(boards)}`);
    const lines = await room.waitFor("b", "sys");
    assertEquals(lines[0]?.data, { kind: "move", seat: 1 }, "the move is announced as a system line");
    const [term] = await database.queryOrThrow<{ moved: boolean }>(
      `SELECT last_own_message_at IS NOT NULL AS moved FROM chat_participants WHERE chat_id = $1 AND identity = $2`, [chat, a.identity_id]);
    assertEquals(term.moved, true, "the move moved the mover's own term");
  } finally {
    room.close();
  }
});

Deno.test({ name: "the hangman word stays with its setter in a chat too: not in the other side's answer, frame or moves", sanitizeOps: false, sanitizeResources: false }, async () => {
  const a = await person();
  const b = await person();
  const chat = await chatOf(a, b);
  const room = rooms(chat, a, b);
  try {
    await signed(a, "POST", `/chats/${chat}/game`, { class: "word", set: "hangman" });
    await signed(b, "POST", `/chats/${chat}/game/answer`, { answer: "accept" });
    const set = await signed(a, "POST", `/chats/${chat}/game/word`, { word: "кот" });
    assertEquals(set.status, 202, JSON.stringify(set.body));
    const theirs = await view(b, chat);
    assertEquals([theirs.board.state.word.word, theirs.board.state.word.mask], [null, "___"], "the other side sees the word, not its mask");
    assertEquals((await view(a, chat)).board.state.word.word, "кот");
    await room.waitFor("b", "board", 2);
    assert(!JSON.stringify(theirs).includes("кот"), `the word leaks in the other side's answer: ${JSON.stringify(theirs)}`);
    assert(!JSON.stringify(room.sent.get("b")).includes("кот"), "the word leaks in the other side's frames");
    const guess = await signed(b, "POST", `/chats/${chat}/game/moves`, { seq: theirs.board.seq, move: { letter: "к" } });
    assertEquals(guess.status, 200, JSON.stringify(guess.body));
  } finally {
    room.close();
  }
});

Deno.test({ name: "a chat's game is only its two sides', and it goes with the conversation", sanitizeOps: false, sanitizeResources: false }, async () => {
  const a = await person();
  const b = await person();
  const chat = await chatOf(a, b);
  await signed(a, "POST", `/chats/${chat}/game`, { class: "grid", set: "checkers" });
  await signed(b, "POST", `/chats/${chat}/game/answer`, { answer: "accept" });
  assertEquals((await signed(await person(), "GET", `/chats/${chat}/game`)).status, 404, "a stranger sees no game");
  assertEquals((await signed(a, "POST", `/chats/${chat}/game/resign`)).status, 204);
  assertEquals((await view(b, chat)).board.over, true);
  // The chat ends for one side: the game is gone for both, and the sweeper takes the row.
  await database.queryOrThrow(`UPDATE chat_participants SET gone_at = now() WHERE chat_id = $1 AND identity = $2`, [chat, b.identity_id]);
  assertEquals((await signed(a, "GET", `/chats/${chat}/game`)).status, 404);
  await database.transaction((run) => chatGames.sweepChatGames(run));
  const [left] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM chat_games WHERE chat_id = $1`, [chat]);
  assertEquals(left.n, 0, "the sweeper leaves the game of an ended chat");
});

// GC1b (chat spec §8.2, :1301 and «отошёл»): stepping away, closing the
// identity and the freeze of the tenth PIN miss take down what is live the
// same way — among it the games of one's chats, one's seat at a table and
// one's table lines still waiting for the queue.
const liveGame = async () => {
  const a = await person();
  const b = await person();
  const chat = await chatOf(a, b);
  await signed(a, "POST", `/chats/${chat}/game`, { class: "dots", set: "2x2" });
  assertEquals((await signed(b, "POST", `/chats/${chat}/game/answer`, { answer: "accept" })).status, 204);
  return { a, b, chat };
};
const gameRows = async (chat: string) =>
  (await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM chat_games WHERE chat_id = $1`, [chat]))[0].n;

Deno.test({ name: "stepping away takes the games of one's chats with it", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, chat } = await liveGame();
  const away = await signed(a, "POST", "/away", { span: "short", nonce: nonce() });
  assertEquals(away.status, 200, JSON.stringify(away.body));
  assertEquals(await gameRows(chat), 0, "the game of a chat outlived its player's step away");
});

Deno.test({ name: "closing the identity takes the games of its chats with it", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, chat } = await liveGame();
  const closed = await signed(a, "POST", "/identities/close", { auth: auth.bytesToBase64url(PIN), nonce: nonce() });
  assertEquals(closed.status, 200, JSON.stringify(closed.body));
  assertEquals(await gameRows(chat), 0, "the game of a chat outlived its player's closed identity");
});

Deno.test({ name: "the freeze of the tenth PIN miss takes the games of one's chats, and nothing else live keeps it waiting", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, chat } = await liveGame();
  // A seat at a table and a line waiting for the queue, written straight in.
  const [table] = await database.queryOrThrow<{ id: string }>(
    `INSERT INTO tables (brand, game, set, seats, lat, lon, area_radius) VALUES ('alpha', 'grid', 'checkers', 2, 52.5, 13.4, 1000) RETURNING id`);
  await database.queryOrThrow(`INSERT INTO table_seats (table_id, identity, seat_no, playing_from) VALUES ($1, $2, 1, now())`, [table.id, a.identity_id]);
  await database.queryOrThrow(
    `INSERT INTO table_lines (brand, table_id, author_identity, text, seat_no, kind) VALUES ('alpha', $1, $2, 'ждёт очереди', 1, 'line')`,
    [table.id, a.identity_id]);
  // Frozen with nothing else live — no phrase, no like, no match.
  await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE identity = $1`, [a.identity_id]);
  await takeDown.takeDownLeftByPinLimit();
  assertEquals(await gameRows(chat), 0, "the minute's job left the game of a player frozen by the PIN limit");
  const [left] = await database.queryOrThrow<{ seats: number; lines: number }>(
    `SELECT (SELECT count(*) FROM table_seats WHERE identity = $1 AND left_at IS NULL)::int AS seats,
            (SELECT count(*) FROM table_lines WHERE author_identity = $1 AND visible_at IS NULL)::int AS lines`,
    [a.identity_id]);
  assertEquals([left.seats, left.lines], [0, 0], "the freeze left a seat at a table or a line waiting for the queue");
});
