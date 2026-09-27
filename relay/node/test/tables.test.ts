// Step 8 (chat spec §6, §6.1; protocol §4.6): tables against a live database.
// What the node promises: a table is seen only from a live seat (SEC-4); one
// table at a time; the refusal to sit is one answer for a band and a block; the
// first round seats the applicants; the board's version refuses a stale move
// and answers a repeat; an overdue turn is a pass, three make a spectator and
// end a game of two; the last one out closes the table and the sweeper takes
// it with its lines.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "tables-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "tables-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "tables-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const tables = await import("../src/lib/tables.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/tables.ts");
await import("../src/routes/blocks.ts");
await import("../src/routes/hidden.ts");
await import("../src/routes/away.ts");

const KEY_ID = "ak_pub_tablestest0000001";
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
        "x-origin-token": "tables-origin-token",
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
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
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
const setUp = (who: Person, n = nonce()) =>
  signed(who, "POST", "/tables", { class: "grid", set: "checkers", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: n });
type Board = { seq: number; turn: number | null; state: { order: number[] } };
const board = async (who: Person, id: string) => (await signed(who, "GET", `/tables/${id}`)).body.board as Board;

// Two playing at a fresh table: A sets it up, B sits and applies, A opens the
// first round alone and B takes the free place.
async function game(): Promise<{ a: Person; b: Person; id: string }> {
  const a = await person();
  const b = await person();
  const made = await setUp(a);
  assertEquals(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id as string;
  assertEquals((await signed(b, "POST", `/tables/${id}/seat`)).body, { seat: 2 });
  assertEquals((await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "возьмите" })).status, 202);
  const round = await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals(round.status, 200, JSON.stringify(round.body));
  return { a, b, id };
}

Deno.test("a table is seen only from a live seat, and a repeat of its nonce gets the same table", async () => {
  const a = await person();
  const stranger = await person();
  const n = nonce();
  const made = await setUp(a, n);
  assertEquals(made.status, 201, JSON.stringify(made.body));
  assertEquals((await setUp(a, n)).body, made.body);
  const mine = await signed(a, "GET", `/tables/${made.body.id}`);
  assertEquals(mine.status, 200, JSON.stringify(mine.body));
  assertEquals([mine.body.seat, mine.body.is_playing, mine.body.playing, mine.body.watching], [1, true, 1, 0]);
  assertEquals(mine.body.seats, [{ seat: 1, name: "Аня", role: "playing" }]);
  assert(!JSON.stringify(mine.body).includes(a.identity_id), "no identity leaves the node");
  // Not seated and not existing are one answer (SEC-4).
  const theirs = await signed(stranger, "GET", `/tables/${made.body.id}`);
  const none = await signed(stranger, "GET", `/tables/${crypto.randomUUID()}`);
  assertEquals([theirs.status, none.status], [404, 404]);
  assertEquals(theirs.body, none.body);
});

Deno.test("sitting: one table at a time, and a band and a block get the same refusal", async () => {
  const a = await person();
  const b = await person();
  const first = (await setUp(a)).body.id as string;
  const second = (await setUp(b)).body.id as string;
  // B sits at their own; A's table is elsewhere.
  assertEquals(code(await signed(b, "POST", `/tables/${first}/seat`)), "already_seated");
  // B setting up their own did not touch A's: A still sits there.
  const [closed] = await database.queryOrThrow<{ closed: boolean }>(
    `SELECT closed_at IS NOT NULL AS closed FROM tables WHERE id = $1`, [first]);
  assertEquals(closed.closed, false);

  const teen = await person(14);
  const band = await signed(teen, "POST", `/tables/${second}/seat`);
  const c = await person();
  await database.queryOrThrow(`INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [b.identity_id, c.identity_id]);
  const blocked = await signed(c, "POST", `/tables/${second}/seat`);
  assertEquals([band.status, blocked.status], [409, 409]);
  assertEquals(band.body, blocked.body);
  assertEquals(code(band), "unavailable");
});

Deno.test("a move needs the board's version: a repeat answers the same board, a stale one is refused", async () => {
  const { a, b, id } = await game();
  const start = await board(a, id);
  assertEquals([start.state.order, start.turn], [[1, 2], 1]);
  assertEquals(code(await signed(b, "POST", `/tables/${id}/moves`, { seq: start.seq, move: "e4" })), "not_your_turn");
  const moved = await signed(a, "POST", `/tables/${id}/moves`, { seq: start.seq, move: "e4" });
  assertEquals(moved.status, 200, JSON.stringify(moved.body));
  assertEquals(moved.body.board.turn, 2);
  const again = await signed(a, "POST", `/tables/${id}/moves`, { seq: start.seq, move: "e4" });
  assertEquals(again.body.board.seq, moved.body.board.seq);
  const stale = await signed(b, "POST", `/tables/${id}/moves`, { seq: start.seq, move: "e5" });
  assertEquals(code(stale), "stale_seq");
  // The move in words is a line everyone seated sees.
  const lines = (await signed(b, "GET", `/tables/${id}`)).body.lines as { kind: string }[];
  assert(lines.some((l) => l.kind === "move"), JSON.stringify(lines));
});

Deno.test("an overdue turn is a pass; three in a row make a spectator and end a game of two", async () => {
  const { a, b, id } = await game();
  const overdue = () =>
    database.queryOrThrow(`UPDATE table_games SET turn_due = now() - interval '1 second' WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  // A's turn lapses: a pass, and B's turn.
  await overdue();
  const once = await board(b, id);
  assertEquals(once.turn, 2);
  // B plays, A lapses twice more — by the job this time, not by a request.
  const s = await board(b, id);
  assertEquals((await signed(b, "POST", `/tables/${id}/moves`, { seq: s.seq, move: "d5" })).status, 200);
  await overdue();
  await tables.autopass();
  const t = await board(b, id);
  assertEquals((await signed(b, "POST", `/tables/${id}/moves`, { seq: t.seq, move: "c5" })).status, 200);
  await overdue();
  await tables.autopass();
  const [seat] = await database.queryOrThrow<{ playing: boolean }>(
    `SELECT playing_from IS NOT NULL AS playing FROM table_seats WHERE identity = $1 AND left_at IS NULL`, [a.identity_id]);
  assertEquals(seat.playing, false, "three passes seat A as a spectator");
  const [running] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  assertEquals(running.n, 0, "one player left: the game is over");
});

Deno.test("the last one out closes the table, and the sweeper takes it with its lines", async () => {
  const { a, b, id } = await game();
  assertEquals((await signed(a, "POST", `/tables/${id}/lines`, { kind: "sticker", sticker: "wave" })).status, 200);
  assertEquals((await signed(a, "DELETE", `/tables/${id}/seat`)).status, 204);
  assertEquals((await signed(a, "GET", `/tables/${id}`)).status, 404);
  const open = async () =>
    (await database.queryOrThrow<{ open: boolean }>(`SELECT closed_at IS NULL AS open FROM tables WHERE id = $1`, [id]))[0]?.open;
  assertEquals(await open(), true, "B still sits");
  assertEquals((await signed(b, "DELETE", `/tables/${id}/seat`)).status, 204);
  assertEquals(await open(), false);
  await tables.pruneTables();
  const [left] = await database.queryOrThrow<{ n: number }>(
    `SELECT (SELECT count(*) FROM tables WHERE id = $1) + (SELECT count(*) FROM table_lines WHERE table_id = $1) AS n`, [id]);
  assertEquals(Number(left.n), 0);
});

Deno.test("a table silent for an hour is swept though people still sit at it", async () => {
  const { id } = await game();
  await database.queryOrThrow(`UPDATE tables SET last_move_at = now() - interval '61 minutes' WHERE id = $1`, [id]);
  await tables.pruneTables();
  const [left] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM tables WHERE id = $1`, [id]);
  assertEquals(left.n, 0);
});

Deno.test("blocking a seat stands the blocker up, the game goes on, and the blocker cannot sit back", async () => {
  const { a, id } = await game();
  const c = await person();
  assertEquals((await signed(c, "POST", `/tables/${id}/seat`)).body, { seat: 3 });
  // C blocks seat 2 (B): C stands up, A and B play on.
  assertEquals((await signed(c, "POST", "/blocks", { table: id, seat: 2, nonce: nonce() })).status, 204);
  assertEquals((await signed(c, "GET", `/tables/${id}`)).status, 404, "the blocker stood up");
  assertEquals((await board(a, id)).state.order, [1, 2], "the game goes on");
  assertEquals(code(await signed(c, "POST", `/tables/${id}/seat`)), "unavailable");
  // A seat at a table the caller does not sit at names nobody: 204, no block.
  const d = await person();
  assertEquals((await signed(d, "POST", "/blocks", { table: id, seat: 1, nonce: nonce() })).status, 204);
  const [n] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM blocks WHERE blocker_identity = $1`, [d.identity_id]);
  assertEquals(n.n, 0);
});

Deno.test("a line is hidden only for the one who hid it, and goes with the table", async () => {
  const { a, b, id } = await game();
  const said = await signed(b, "POST", `/tables/${id}/lines`, { kind: "line", text: "привет" });
  assertEquals(said.status, 202);
  const seen = (who: Person) =>
    signed(who, "GET", `/tables/${id}`).then((r) => (r.body.lines as { id: string }[]).some((l) => l.id === said.body.id));
  assertEquals([await seen(a), await seen(b)], [true, true]);
  // One's own line is not one to hide.
  assertEquals((await signed(b, "POST", "/hidden", { line: said.body.id })).status, 404);
  const hid = await signed(a, "POST", "/hidden", { line: said.body.id });
  assertEquals(hid.status, 200, JSON.stringify(hid.body));
  assertEquals([await seen(a), await seen(b)], [false, true]);
  assertEquals((await signed(a, "GET", "/hidden")).body, [{ id: hid.body.id, kind: "line", text: "привет" }]);
  await database.queryOrThrow(`UPDATE tables SET closed_at = now() WHERE id = $1`, [id]);
  await tables.pruneTables();
  assertEquals((await signed(a, "GET", "/hidden")).body, []);
});

Deno.test("a table is liked without sitting, once per person, and only by one who could sit there", async () => {
  const { id } = await game();
  const c = await person();
  const count = async () =>
    (await database.queryOrThrow<{ n: number }>(`SELECT like_count AS n FROM tables WHERE id = $1`, [id]))[0].n;
  assertEquals((await signed(c, "POST", `/tables/${id}/like`)).body, { state: "liked" });
  assertEquals((await signed(c, "POST", `/tables/${id}/like`)).body, { state: "liked" });
  assertEquals(await count(), 1, "a repeat is not a second like");
  assertEquals((await signed(c, "DELETE", `/tables/${id}/like`)).status, 204);
  assertEquals(await count(), 0);
  const teen = await person(14);
  assertEquals((await signed(teen, "POST", `/tables/${id}/like`)).status, 404, "outside the band: no such table");
});

Deno.test("resigning makes a spectator and ends a game of two; stepping away frees the seat", async () => {
  const { a, b, id } = await game();
  assertEquals((await signed(b, "POST", `/tables/${id}/resign`)).status, 204);
  assertEquals((await signed(b, "GET", `/tables/${id}`)).body.is_playing, false);
  const [running] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  assertEquals(running.n, 0);
  const away = await signed(a, "POST", "/away", { span: "short", nonce: nonce() });
  assertEquals(away.status, 200, JSON.stringify(away.body));
  const [seat] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM table_seats WHERE identity = $1 AND left_at IS NULL`, [a.identity_id]);
  assertEquals(seat.n, 0, "the one who stepped away no longer sits");
});

Deno.test("lines and the name pass the feed's first tier: clean is public at once, a link waits", async () => {
  const a = await person();
  const clean = await signed(a, "POST", "/tables", {
    class: "grid", set: "chess", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, name: "шахматы у пруда", nonce: nonce(),
  });
  const linked = await person();
  const flagged = await signed(linked, "POST", "/tables", {
    class: "grid", set: "chess", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, name: "t.me/chess", nonce: nonce(),
  });
  assertEquals((await signed(a, "GET", `/tables/${clean.body.id}`)).body.name, "шахматы у пруда");
  assertEquals((await signed(linked, "GET", `/tables/${flagged.body.id}`)).body.name, null, "a link waits for the queue");
  const id = clean.body.id as string;
  const ok = await signed(a, "POST", `/tables/${id}/lines`, { kind: "line", text: "кто играет?" });
  const link = await signed(a, "POST", `/tables/${id}/lines`, { kind: "line", text: "пиши https://example.com" });
  assertEquals([ok.status, link.status], [202, 202]);
  const shown = ((await signed(a, "GET", `/tables/${id}`)).body.lines as { id: string }[]).map((l) => l.id);
  assert(shown.includes(ok.body.id), "the clean line is public");
  assert(!shown.includes(link.body.id), "the line with a link waits");
});

Deno.test("dots: the engine refuses a taken edge, scores closed boxes, and the finished game comes back over", async () => {
  const a = await person();
  const b = await person();
  const made = await signed(a, "POST", "/tables", { class: "dots", set: "2x2", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: nonce() });
  const id = made.body.id as string;
  await signed(b, "POST", `/tables/${id}/seat`);
  await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "сыграю" });
  await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  const edges = [
    "h:0:0", "h:0:1", "h:1:0", "h:1:1", "h:2:0", "h:2:1",
    "v:0:0", "v:0:1", "v:0:2", "v:1:0", "v:1:1", "v:1:2",
  ];
  const who = { 1: a, 2: b } as Record<number, Person>;
  let current = await board(a, id);
  const first = await signed(who[current.turn!], "POST", `/tables/${id}/moves`, { seq: current.seq, move: { edge: edges[0] } });
  assertEquals(first.status, 200, JSON.stringify(first.body));
  current = first.body.board;
  const taken = await signed(who[current.turn!], "POST", `/tables/${id}/moves`, { seq: current.seq, move: { edge: edges[0] } });
  assertEquals([code(taken), taken.body.error.reason], ["illegal_move", "the edge is taken"]);
  let last = first.body.board as Board & { over: boolean; score: Record<string, number> };
  for (const edge of edges.slice(1)) {
    const r = await signed(who[last.turn!], "POST", `/tables/${id}/moves`, { seq: last.seq, move: { edge } });
    assertEquals(r.status, 200, JSON.stringify(r.body));
    last = r.body.board;
  }
  assertEquals(last.over, true);
  const view = (await signed(a, "GET", `/tables/${id}`)).body.board as { over: boolean; score: Record<string, number> };
  assertEquals(view.over, true, "the finished game comes back, not null");
  assertEquals(Object.values(view.score).reduce((x, y) => x + y, 0), 4, "four boxes on a 2×2 field");
});

Deno.test("a refused applicant sits out the round; the one not refused plays", async () => {
  const a = await person();
  const b = await person();
  const c = await person();
  const made = await signed(a, "POST", "/tables", { class: "free", set: "domino", seats: 3, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: nonce() });
  const id = made.body.id as string;
  await signed(b, "POST", `/tables/${id}/seat`);
  await signed(c, "POST", `/tables/${id}/seat`);
  await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "можно?" });
  await signed(c, "POST", `/tables/${id}/lines`, { kind: "application", text: "и я" });
  assertEquals(code(await signed(a, "POST", `/tables/${id}/lines`, { kind: "refusal", text: "в другой раз" })), "invalid_body");
  const no = await signed(a, "POST", `/tables/${id}/lines`, { kind: "refusal", text: "в другой раз", seat: 3 });
  assertEquals(no.status, 202, JSON.stringify(no.body));
  await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals((await board(a, id)).state.order, [1, 2], "seat 3 was refused and waits");
});
