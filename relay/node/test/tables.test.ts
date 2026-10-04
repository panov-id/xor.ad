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
await import("../src/routes/feed_queue.ts");
await import("../src/routes/feed.ts");
// The rooms' listeners, once and before any test: started inside one, they
// count as that test's leak (as session_freeze.test.ts does).
await (await import("../src/chat/relay.ts")).listenForRooms();

// Under --shuffle a sanitised case after any room or race case failed on
// "op_read started before the test": the pool's extra connections and the one
// it keeps aside for LISTEN read from their sockets across cases (W16-SF3:
// 0 runs of 10 green, 14–16 leaks a run). closePool() after each such case, as
// W16-SF1 did, would drop the rooms' LISTEN, armed once above, and the next
// room case would hear nothing; so the ops and resources sanitisers are off
// for every case here, not only for those that said so.
type Def = Deno.TestDefinition;
function test(name: string, fn: Def["fn"]): void;
function test(def: Def): void;
function test(def: Omit<Def, "fn">, fn: Def["fn"]): void;
function test(a: string | Def | Omit<Def, "fn">, fn?: Def["fn"]): void {
  const def = typeof a === "string" ? { name: a, fn: fn! } : fn ? { ...a, fn } : (a as Def);
  Deno.test({ sanitizeOps: false, sanitizeResources: false, ...def });
}

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

// FX3 (X4, 27.09.2026): a table's name and its lines reach every seat's
// screen — the terminal's too — so what nobody can see is refused at the door,
// as in a person's name (lib/names.ts): ESC, C0/C1 controls, direction overrides.
test("a table's name and its lines refuse what nobody can see", async () => {
  const a = await person();
  const named = (name: string) =>
    signed(a, "POST", "/tables", { class: "grid", set: "checkers", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: nonce(), name });
  assertEquals((await named("ст\u001b[31mол")).status, 400, "a table's name with ESC was taken");
  assertEquals((await named("стол‮")).status, 400, "a table's name with a direction override was taken");
  assertEquals((await named("стол\u0007")).status, 400, "a table's name with a bell was taken");
  assertEquals((await named("👨‍👩‍👧‍👦 стол")).status, 201, "a name an emoji spells with joiners was refused");
  const { b, id } = await game();
  const say = (text: string) => signed(b, "POST", `/tables/${id}/lines`, { kind: "line", text });
  assertEquals((await say("привет\u001b[2J")).status, 400, "a line with ESC was taken");
  assertEquals((await say("привет‮текст")).status, 400, "a line with a direction override was taken");
  assertEquals((await say("привет")).status, 202);
});

test("a table is seen only from a live seat, and a repeat of its nonce gets the same table", async () => {
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

test("sitting: one table at a time, and a band and a block get the same refusal", async () => {
  const a = await person();
  const b = await person();
  const first = (await setUp(a)).body.id as string;
  const second = (await setUp(b)).body.id as string;
  // B sits at their own; A's table is elsewhere.
  const refused = await signed(b, "POST", `/tables/${first}/seat`);
  assertEquals(code(refused), "already_seated");
  assertEquals(refused.body.error.table, second, "the refusal names one's own table, not the one asked for");
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

test("a move needs the board's version: a repeat answers the same board, a stale one is refused", async () => {
  const { a, b, id } = await game();
  const start = await board(a, id);
  assertEquals([start.state.order, start.turn], [[1, 2], 1]);
  assertEquals(code(await signed(b, "POST", `/tables/${id}/moves`, { seq: start.seq, move: { from: "c3", to: "d4" } })), "not_your_turn");
  const moved = await signed(a, "POST", `/tables/${id}/moves`, { seq: start.seq, move: { from: "c3", to: "d4" } });
  assertEquals(moved.status, 200, JSON.stringify(moved.body));
  assertEquals(moved.body.board.turn, 2);
  const again = await signed(a, "POST", `/tables/${id}/moves`, { seq: start.seq, move: { from: "c3", to: "d4" } });
  assertEquals(again.body.board.seq, moved.body.board.seq);
  const stale = await signed(b, "POST", `/tables/${id}/moves`, { seq: start.seq, move: { from: "d6", to: "e5" } });
  assertEquals(code(stale), "stale_seq");
  // The move in words is a line everyone seated sees.
  const lines = (await signed(b, "GET", `/tables/${id}`)).body.lines as { kind: string }[];
  assert(lines.some((l) => l.kind === "move"), JSON.stringify(lines));
});

test("an overdue turn is a pass; three in a row make a spectator and end a game of two", async () => {
  const { a, b, id } = await game();
  const overdue = () =>
    database.queryOrThrow(`UPDATE table_games SET turn_due = now() - interval '1 second' WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  // A's turn lapses: a pass, and B's turn.
  await overdue();
  const once = await board(b, id);
  assertEquals(once.turn, 2);
  // B plays, A lapses twice more — by the job this time, not by a request.
  const s = await board(b, id);
  assertEquals((await signed(b, "POST", `/tables/${id}/moves`, { seq: s.seq, move: { from: "b6", to: "a5" } })).status, 200);
  await overdue();
  await tables.autopass();
  const t = await board(b, id);
  assertEquals((await signed(b, "POST", `/tables/${id}/moves`, { seq: t.seq, move: { from: "f6", to: "g5" } })).status, 200);
  await overdue();
  await tables.autopass();
  const [seat] = await database.queryOrThrow<{ playing: boolean }>(
    `SELECT playing_from IS NOT NULL AS playing FROM table_seats WHERE identity = $1 AND left_at IS NULL`, [a.identity_id]);
  assertEquals(seat.playing, false, "three passes seat A as a spectator");
  const [running] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  assertEquals(running.n, 0, "one player left: the game is over");
});

test("the last one out closes the table, and the sweeper takes it with its lines", async () => {
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

test("a table silent for an hour is swept though people still sit at it", async () => {
  const { id } = await game();
  await database.queryOrThrow(`UPDATE tables SET last_move_at = now() - interval '61 minutes' WHERE id = $1`, [id]);
  await tables.pruneTables();
  const [left] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM tables WHERE id = $1`, [id]);
  assertEquals(left.n, 0);
});

test("blocking a seat stands the blocker up, the game goes on, and the blocker cannot sit back", async () => {
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

test("a line is hidden only for the one who hid it, and goes with the table", async () => {
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

test("a table is liked without sitting, once per person, and only by one who could sit there", async () => {
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

test("resigning makes a spectator and ends a game of two; stepping away frees the seat", async () => {
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

test("lines and the name pass the feed's first tier: clean is public at once, a link waits", async () => {
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

test("dots: the engine refuses a taken edge, scores closed boxes, and the finished game comes back over", async () => {
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

// A panel session minted as lib/auth.ts redeem() mints it (as feed_publish.test.ts does).
async function panelAs(role: string, brand: string | null = null) {
  const { sign } = await import("../src/lib/jwt.ts");
  const { sha256hex } = await import("../src/lib/hash.ts");
  const { scopedForBrand } = await import("../src/lib/scoped_storage.ts");
  const { config } = await import("../src/config.ts");
  const email = `${role}-${crypto.randomUUID()}@platform.test`;
  await scopedForBrand(null).put(`panel/${config.envName}/users/${await sha256hex(email)}.json`, {
    email, role, brand, created_at: "2026-09-27T00:00:00.000Z",
  });
  const token = await sign({ sub: email, role, brand, env: config.envName, exp: Math.floor(Date.now() / 1000) + 3600 }, "tables-secret");
  return async (method: string, path: string) => {
    const url = new URL(`https://relay.test${path}`);
    const found = match(method, url.pathname);
    assert(found, `no route for ${method} ${url.pathname}`);
    const response = await found.h({
      req: new Request(url, { method, headers: { authorization: `Bearer ${token}` } }),
      params: found.params,
      url,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
}

test({
  name: "what the rules flagged at a table waits in the panel's queue, is decided once, and the watchdog counts it",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { readModerationQueue } = await import("../src/lib/queue_metrics.ts");
    const a = await person();
    const made = await signed(a, "POST", "/tables", {
      class: "grid", set: "chess", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, name: "t.me/chessclub", nonce: nonce(),
    });
    const id = made.body.id as string;
    const line = await signed(a, "POST", `/tables/${id}/lines`, { kind: "line", text: "пиши https://example.com" });
    const moderator = await panelAs("moderator");
    const queue = (await moderator("GET", "/admin/table-queue")).body as { kind: string; id: string; text: string }[];
    assert(queue.some((q) => q.kind === "line" && q.id === line.body.id), JSON.stringify(queue));
    assert(queue.some((q) => q.kind === "name" && q.id === id && q.text === "t.me/chessclub"), JSON.stringify(queue));
    assert(!JSON.stringify(queue).includes(a.identity_id), "no identity in the queue");
    const [{ brand }] = await database.queryOrThrow<{ brand: string }>(`SELECT brand FROM tables WHERE id = $1`, [id]);
    const watched = (await readModerationQueue())!.find((r) => r.brand === brand);
    assert(watched && watched.waiting >= 2, `the watchdog counts table items: ${brand} ${JSON.stringify(await readModerationQueue())}`);

    // Another brand's moderator cannot decide it; the right one does, once.
    const stranger = await panelAs("moderator", "some-other-brand");
    await database.queryOrThrow(`DELETE FROM moderation_verdicts WHERE brand = $1`, [brand]);
    assertEquals((await stranger("POST", `/admin/table-queue/lines/${line.body.id}/publish`)).status, 409);
    assertEquals(
      (await database.queryOrThrow(`SELECT 1 FROM moderation_verdicts WHERE brand = $1`, [brand])).length, 0,
      "a decision that did not apply is not a verdict",
    );
    assertEquals((await moderator("POST", `/admin/table-queue/lines/${line.body.id}/publish`)).status, 200);
    assertEquals(
      (await database.queryOrThrow(`SELECT 1 FROM moderation_verdicts WHERE brand = $1`, [brand])).length, 1,
      "a decision at a table is the watchdog's verdict for its face (db/078)",
    );
    assertEquals((await moderator("POST", `/admin/table-queue/lines/${line.body.id}/publish`)).status, 409);
    const shown = ((await signed(a, "GET", `/tables/${id}`)).body.lines as { id: string }[]).map((l) => l.id);
    assert(shown.includes(line.body.id), "published: the line is public");
    // The name's verdict goes to the author's own rooms as name_verdict with table (G1e).
    const relay = await import("../src/chat/relay.ts");
    const got: { type: string; data: unknown }[] = [];
    const key = `table:${id}`;
    relay.roomsForTest().set(key, new Set([{
      socket: { readyState: WebSocket.OPEN, send: (t: string) => got.push(JSON.parse(t)), close() {} } as unknown as WebSocket,
      session: a.session_id, chat: key, seq: 0, table: id, identity: a.identity_id,
    }]));
    assertEquals((await moderator("POST", `/admin/table-queue/names/${id}/refuse`)).status, 200);
    const until = Date.now() + 3000;
    while (Date.now() < until && !got.some((f) => f.type === "name_verdict")) await new Promise((r) => setTimeout(r, 20));
    relay.roomsForTest().delete(key);
    assertEquals(got.find((f) => f.type === "name_verdict")?.data, { accepted: false, table: id },
      "the author was not told the name's verdict");
    const [t] = await database.queryOrThrow<{ name: string | null; name_pending: string | null }>(
      `SELECT name, name_pending FROM tables WHERE id = $1`, [id]);
    assertEquals([t.name, t.name_pending], [null, null], "a refused name leaves the table nameless");
    assertEquals((await panelAs("viewer").then((v) => v("POST", `/admin/table-queue/names/${id}/publish`))).status, 403);
  },
});

test("a refused applicant sits out the round; the one not refused plays", async () => {
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
  // The line says whom it refuses, not only who spoke (verifier of G1e).
  const refusal = ((await signed(c, "GET", `/tables/${id}`)).body.lines as { id: string; seat: number; refuses_seat: number | null }[])
    .find((l) => l.id === no.body.id);
  assertEquals([refusal?.seat, refusal?.refuses_seat], [1, 3], "the refusal line does not name the refused seat");
  await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals((await board(a, id)).state.order, [1, 2], "seat 3 was refused and waits");
});

// G1e: the table's socket (protocol §4.4, §4.6). Rooms are put in by hand, as
// session_freeze.test.ts does: a room needs a socket, the frames it would be
// sent do not.
test({
  name: "a table's room gets the board, the line and the seat as frames, and 4005 when its seat is lost",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const relay = await import("../src/chat/relay.ts");
    const { a, b, id } = await game();
    // A ticket only from a live seat, like the table itself (SEC-4).
    const bought = await signed(a, "POST", `/tables/${id}/ticket`);
    assertEquals([bought.status, typeof bought.body.ticket], [200, "string"], JSON.stringify(bought.body));
    assertEquals((await signed(await person(), "POST", `/tables/${id}/ticket`)).status, 404);

    const sent = new Map<string, { type: string; data: Record<string, unknown> }[]>();
    const closed = new Map<string, number>();
    const fake = (name: string): WebSocket => {
      sent.set(name, []);
      return {
        readyState: WebSocket.OPEN,
        send: (text: string) => sent.get(name)!.push(JSON.parse(text)),
        close: (code: number) => closed.set(name, code),
      } as unknown as WebSocket;
    };
    const key = `table:${id}`;
    relay.roomsForTest().set(key, new Set([
      { socket: fake("a"), session: a.session_id, chat: key, seq: 0, table: id, identity: a.identity_id },
      { socket: fake("b"), session: b.session_id, chat: key, seq: 0, table: id, identity: b.identity_id },
    ]));
    const waitFor = async (name: string, type: string) => {
      const until = Date.now() + 3000;
      while (Date.now() < until && !sent.get(name)!.some((f) => f.type === type)) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return sent.get(name)!.find((f) => f.type === type);
    };
    try {
      const start = await board(a, id);
      assertEquals((await signed(a, "POST", `/tables/${id}/moves`, { seq: start.seq, move: { from: "c3", to: "d4" } })).status, 200);
      const boardFrame = await waitFor("b", "board");
      assert(boardFrame, `no board frame reached the other seat: ${JSON.stringify(sent.get("b"))}`);
      assertEquals(boardFrame!.data.turn, 2, "the frame carries the board after the move");
      const moveLine = await waitFor("b", "line");
      assertEquals(moveLine?.data.kind, "move");
      assert(!JSON.stringify([...sent.values()]).includes(a.identity_id), "no identity in any frame");

      const c = await person();
      await signed(c, "POST", `/tables/${id}/seat`);
      const seatFrame = await waitFor("a", "seat");
      assertEquals(seatFrame?.data, { playing: 2, watching: 1 });

      assertEquals((await signed(b, "DELETE", `/tables/${id}/seat`)).status, 204);
      const until = Date.now() + 3000;
      while (Date.now() < until && !closed.has("b")) await new Promise((resolve) => setTimeout(resolve, 20));
      assertEquals(closed.get("b"), 4005, "the room of the one who stood up is closed 4005");
      assertEquals(closed.has("a"), false, "the others' rooms stay open");
    } finally {
      relay.roomsForTest().delete(key);
    }
  },
});

// V7 · a room whose identity holds no seat at the table gets no line and no
// seat frame — the board already closed such a room 4005 (X1); the line and
// the seat went out to it unchecked, before any board.
test({
  name: "V7: a room with no seat at the table gets no line or seat frame, and is closed 4005",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const relay = await import("../src/chat/relay.ts");
    const { a, id } = await game();
    const stranger = await person();
    const sent = new Map<string, { type: string }[]>();
    const closed = new Map<string, number>();
    const fake = (name: string): WebSocket => {
      sent.set(name, []);
      return {
        readyState: WebSocket.OPEN,
        send: (text: string) => sent.get(name)!.push(JSON.parse(text)),
        close: (code: number) => closed.set(name, code),
      } as unknown as WebSocket;
    };
    const key = `table:${id}`;
    relay.roomsForTest().set(key, new Set([
      { socket: fake("a"), session: a.session_id, chat: key, seq: 0, table: id, identity: a.identity_id },
      { socket: fake("x"), session: stranger.session_id, chat: key, seq: 0, table: id, identity: stranger.identity_id },
    ]));
    const waitFor = async (check: () => boolean) => {
      const until = Date.now() + 3000;
      while (Date.now() < until && !check()) await new Promise((resolve) => setTimeout(resolve, 20));
    };
    try {
      assertEquals((await signed(a, "POST", `/tables/${id}/lines`, { kind: "line", text: "привет" })).status, 202);
      const c = await person();
      await signed(c, "POST", `/tables/${id}/seat`);
      await waitFor(() => sent.get("a")!.some((f) => f.type === "line") && sent.get("a")!.some((f) => f.type === "seat"));
      assert(sent.get("a")!.some((f) => f.type === "line"), `the seated room got no line: ${JSON.stringify(sent.get("a"))}`);
      await waitFor(() => closed.has("x"));
      const leaked = sent.get("x")!.filter((f) => f.type === "line" || f.type === "seat").map((f) => f.type);
      assertEquals(leaked, [], "a room with no seat got the table's lines or seats");
      assertEquals(closed.get("x"), 4005, "a room with no seat was not closed 4005");
    } finally {
      relay.roomsForTest().delete(key);
    }
  },
});

// A table of a class, two playing: A sets it up, B sits and applies, A opens the round.
async function gameOf(klass: string, set: string): Promise<{ a: Person; b: Person; id: string }> {
  const a = await person();
  const b = await person();
  const made = await signed(a, "POST", "/tables", { class: klass, set, seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: nonce() });
  const id = made.body.id as string;
  await signed(b, "POST", `/tables/${id}/seat`);
  await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "сыграю" });
  await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  return { a, b, id };
}
// Each class carries its own state (dots, deck, word, grid, dice, free,
// physics); the test reads the fields of the class it plays.
// deno-lint-ignore no-explicit-any
type Seen = { seq: number; turn: number; over: boolean; score: Record<string, number>; state: Record<string, any> };
const seen = async (who: Person, id: string) => (await signed(who, "GET", `/tables/${id}`)).body.board as Seen;

test({ name: "deck: the node deals, each sees their own hand and the others' backs, a card must be in the hand, an empty hand wins", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, b, id } = await gameOf("deck", "durak36");
  const mine = await seen(a, id);
  const theirs = await seen(b, id);
  assertEquals(mine.state.deck.hands["1"].length, 6, "A sees six cards of their own");
  assertEquals(mine.state.deck.hands["2"], { count: 6 }, "A sees only the size of B's hand");
  assertEquals(theirs.state.deck.hands["1"], { count: 6 }, "B sees only the size of A's hand");
  assertEquals(mine.state.deck.stock, { count: 24 });
  const notMine = (theirs.state.deck.hands["2"] as string[])[0];
  const refused = await signed(a, "POST", `/tables/${id}/moves`, { seq: mine.seq, move: { play: notMine } });
  assertEquals([code(refused), refused.body.error.reason], ["illegal_move", "the card is not in your hand"]);
  // One card left in A's hand: playing it wins the deal.
  const last = (mine.state.deck.hands["1"] as string[])[0];
  await database.queryOrThrow(
    `UPDATE table_games SET state = jsonb_set(state, '{deck,hands,1}', to_jsonb(ARRAY[$2::text])) WHERE table_id = $1 AND ended_at IS NULL`,
    [id, last],
  );
  const won = await signed(a, "POST", `/tables/${id}/moves`, { seq: mine.seq, move: { play: last } });
  assertEquals(won.status, 200, JSON.stringify(won.body));
  assertEquals([won.body.board.over, won.body.board.score["1"]], [true, 1], "an empty hand wins the deal");
});

test({ name: "word: the setter's word is hidden from the others and from the moves, letters are not repeated, a guessed word scores", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, b, id } = await gameOf("word", "hangman");
  let s = await seen(a, id);
  assertEquals(s.state.word.setter, 1);
  const flagged = await signed(a, "POST", `/tables/${id}/moves`, { seq: s.seq, move: { word: "telegram" } });
  assertEquals(flagged.body.error?.reason, "set another word", "a contact word passes the rules first");
  assertEquals((await signed(a, "POST", `/tables/${id}/moves`, { seq: s.seq, move: { word: "кот" } })).status, 200);
  const guesser = await seen(b, id);
  assertEquals([guesser.state.word.word, guesser.state.word.mask], [null, "___"], "the guesser sees the word masked");
  assertEquals((await seen(a, id)).state.word.word, "кот", "the setter sees their own word");
  assert(!JSON.stringify(guesser).includes("кот"), `the word leaks to the guesser: ${JSON.stringify(guesser)}`);
  const guess = async (letter: string) => {
    const now = await seen(b, id);
    return await signed(b, "POST", `/tables/${id}/moves`, { seq: now.seq, move: { letter } });
  };
  assertEquals((await guess("к")).status, 200);
  assertEquals((await guess("к")).body.error?.reason, "that letter was tried");
  assertEquals((await guess("о")).status, 200);
  const done = await guess("т");
  assertEquals(done.status, 200, JSON.stringify(done.body));
  s = done.body.board;
  assertEquals(s.score["2"], 1, "a guessed word scores the guesser");
  assertEquals([s.state.word.setter, s.turn], [2, 2], "the guesser sets the next word");
});

// G1h: a table in the feed (§6.1) — the only way a neighbour learns of it.
test({ name: "a table shows in a neighbour's feed as a card, updates as people sit, and leaves when its places are taken", sanitizeOps: false, sanitizeResources: false }, async () => {
  const a = await person();
  // A place of its own: the other tests' tables stand at 52.52, 13.4, and the
  // feed picks at most a quarter of the page among them at random.
  const lat = -30 + Math.random() * 10;
  const lon = -60 + Math.random() * 10;
  const made = await signed(a, "POST", "/tables", { class: "grid", set: "checkers", seats: 2, lat, lon, area_radius: 1000, nonce: nonce() });
  const id = made.body.id as string;
  const cardFor = async (who: Person) => {
    const feed = await signed(who, "GET", `/feed?lat=${lat + 0.001}&lon=${lon + 0.001}&radius=1000`);
    assertEquals(feed.status, 200, JSON.stringify(feed.body));
    return (feed.body.items as { kind: string; id: string }[]).find((i) => i.kind === "table" && i.id === id) as
      | Record<string, unknown>
      | undefined;
  };
  const neighbour = await person();
  const card = await cardFor(neighbour);
  assert(card, "the neighbour's feed has no card of the table");
  assertEquals([card!.game, card!.seats, card!.free_seats, card!.playing, card!.watching], ["grid", 2, 1, 1, 0]);
  assert(!JSON.stringify(card).includes(a.identity_id), "no identity on the card");
  assertEquals(await cardFor(await person(14)), undefined, "outside the band: no card");
  assertEquals(await cardFor(a), undefined, "one's own table is not a card in one's own feed");

  const c = await person();
  assertEquals((await signed(c, "POST", `/tables/${id}/seat`)).status, 200, "sat down by the card's id");
  assertEquals((await cardFor(neighbour))?.watching, 1, "the card shows the one who sat down");

  await signed(c, "POST", `/tables/${id}/lines`, { kind: "application", text: "играю" });
  await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals(await cardFor(neighbour), undefined, "a table whose places are all taken leaves the feed");
});

// G1g: the last four classes, one test each, and the seats of a class.
const moveAs = async (who: Person, id: string, move: unknown) =>
  signed(who, "POST", `/tables/${id}/moves`, { seq: (await seen(who, id)).seq, move });
const reasonOf = (r: { body: { error?: { reason?: string } } }) => r.body.error?.reason;
const setState = (id: string, path: string, value: unknown) =>
  database.queryOrThrow(
    `UPDATE table_games SET state = jsonb_set(state, $2::text[], $3::text::jsonb) WHERE table_id = $1 AND ended_at IS NULL`,
    [id, path, JSON.stringify(value)],
  );

test({ name: "a class seats no more than the spec's table says: the word two", sanitizeOps: false, sanitizeResources: false }, async () => {
  const a = await person();
  const three = await signed(a, "POST", "/tables", { class: "word", set: "hangman", seats: 3, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: nonce() });
  assertEquals([three.status, three.body.error?.message], [400, "a word table seats at most 2"]);
});

test({ name: "grid: one's own piece blocks the cell, and a con ends only when the other side agrees", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, b, id } = await gameOf("grid", "checkers");
  assertEquals(reasonOf(await moveAs(a, id, { from: "c3", to: "b2" })), "the cell is taken by your own piece");
  assertEquals(reasonOf(await moveAs(a, id, { from: "d6", to: "e5" })), "no piece of yours on that cell");
  assertEquals((await moveAs(a, id, { con: "won" })).status, 200);
  assertEquals(reasonOf(await moveAs(b, id, { con: "won" })) ?? "claimed", "claimed");
  // B claimed too, so B's claim stands; A agrees to it.
  const agreed = await moveAs(a, id, { con: "agree" });
  assertEquals(agreed.status, 200, JSON.stringify(agreed.body));
  assertEquals(agreed.body.board.score["2"], 1, "the claimant scores once the other side agrees");
  assertEquals(agreed.body.board.state.grid.cells["c3"]?.seat, 1, "a new con starts from the start");
});

test({ name: "dice: the node rolls once a turn, the move comes after the roll, and a claim not agreed to is dropped", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, b, id } = await gameOf("dice", "backgammon");
  assertEquals(reasonOf(await moveAs(a, id, { move: "13/7" })), "roll first");
  const rolled = await moveAs(a, id, { roll: true });
  const dice = rolled.body.board.state.dice.rolled as number[];
  assert(dice.length === 2 && dice.every((d) => d >= 1 && d <= 6), `not two dice: ${JSON.stringify(dice)}`);
  assertEquals(rolled.body.board.turn, 1, "the roller keeps the turn to move");
  assertEquals(reasonOf(await moveAs(a, id, { roll: true })), "the dice are already rolled this turn");
  assertEquals((await moveAs(a, id, { move: "13/7 13/10" })).body.board.turn, 2);
  await moveAs(b, id, { con: "won" });
  await moveAs(a, id, { roll: true });
  assertEquals((await seen(a, id)).state.dice.claim, null, "a move instead of agreeing drops the claim");
});

test({ name: "dominoes: hands are cut per seat, a bone must match its end, the empty hand scores the others' pips", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, b, id } = await gameOf("free", "double-six");
  const mine = await seen(a, id);
  assertEquals([mine.state.free.hands["1"].length, mine.state.free.hands["2"], mine.state.free.boneyard], [7, { count: 7 }, { count: 14 }]);
  await setState(id, "{free,hands,1}", ["6:6", "1:2"]);
  await setState(id, "{free,line}", ["3:4"]);
  assertEquals(reasonOf(await moveAs(a, id, { play: "6:6", end: "right" })), "the bone does not match that end");
  await setState(id, "{free,hands,1}", ["4:5"]);
  const theirs = (await seen(b, id)).state.free.hands["2"] as string[];
  const expected = theirs.reduce((sum, bone) => sum + bone.split(":").reduce((s2, h) => s2 + Number(h), 0), 0);
  const won = await moveAs(a, id, { play: "5:4", end: "right" });
  assertEquals(won.status, 200, JSON.stringify(won.body));
  assertEquals([won.body.board.over, won.body.board.score["1"]], [true, expected], "the empty hand scores the pips left");
  assertEquals(won.body.board.state.free.line, ["3:4", "4:5"], "the bone turns to match");
});

test({ name: "physics: a flick slides until it hits, pushes a piece off the board for a point, and the last side standing ends it", sanitizeOps: false, sanitizeResources: false }, async () => {
  const { a, id } = await gameOf("physics", "chapayev");
  await setState(id, "{physics,cells}", { "3:5": 1, "3:7": 2, "0:0": 1 });
  assertEquals(reasonOf(await moveAs(a, id, { flick: { piece: "3:7", dir: [0, 1], power: 2 } })), "no piece of yours there");
  const flicked = await moveAs(a, id, { flick: { piece: "3:5", dir: [0, 1], power: 3 } });
  assertEquals(flicked.status, 200, JSON.stringify(flicked.body));
  assertEquals(flicked.body.board.state.physics.cells, { "3:6": 1, "0:0": 1 }, "stopped where it hit, the other pushed off");
  assertEquals([flicked.body.board.score["1"], flicked.body.board.over], [1, true]);
});

// G1f: the same through a real socket — a ticket bought by a signed call,
// spent by a WebSocket in Sec-WebSocket-Protocol on a served GET /chat, frames
// read off the wire, and the close the seat's loss makes (session_freeze.test.ts
// serves relayUpgrade the same way).
test({
  name: "a live socket to a table: a ticket opens it, a move and a line arrive as frames, standing up closes it 4005",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const relay = await import("../src/chat/relay.ts");
    const { a, b, id } = await game();
    const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
    const frames: { type: string; data: Record<string, unknown> }[] = [];
    let closedWith: number | null = null;
    try {
      const token = (await signed(b, "POST", `/tables/${id}/ticket`)).body.ticket as string;
      const socket = new WebSocket(`ws://127.0.0.1:${server.addr.port}/chat`, ["xor.p1", `ticket.${token}`]);
      socket.onmessage = (event) => frames.push(JSON.parse(event.data));
      socket.onerror = () => {};
      const shut = new Promise<void>((resolve) => {
        socket.onclose = (event) => {
          closedWith = event.code;
          resolve();
        };
      });
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        setTimeout(() => reject(new Error("the table's socket did not open within five seconds")), 5000);
      });
      // The node puts the room in on its own open; wait until it is there.
      const until = Date.now() + 3000;
      while (Date.now() < until && !(relay.roomsForTest().get(`table:${id}`)?.size)) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const waitFor = async (type: string) => {
        const end = Date.now() + 3000;
        while (Date.now() < end && !frames.some((f) => f.type === type)) await new Promise((r) => setTimeout(r, 20));
        return frames.find((f) => f.type === type);
      };
      const start = await board(a, id);
      assertEquals((await signed(a, "POST", `/tables/${id}/moves`, { seq: start.seq, move: { from: "c3", to: "d4" } })).status, 200);
      const moved = await waitFor("board");
      assert(moved, `no board frame came over the wire: ${JSON.stringify(frames)}`);
      assertEquals(moved!.data.turn, 2);
      const said = await signed(a, "POST", `/tables/${id}/lines`, { kind: "line", text: "твой ход" });
      const end = Date.now() + 3000;
      while (Date.now() < end && !frames.some((f) => f.type === "line" && f.data.id === said.body.id)) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assert(frames.some((f) => f.type === "line" && f.data.text === "твой ход"), `the line did not arrive: ${JSON.stringify(frames)}`);

      assertEquals((await signed(b, "DELETE", `/tables/${id}/seat`)).status, 204);
      await Promise.race([shut, new Promise((r) => setTimeout(r, 5000))]);
      // The code travels as a frame before the close (protocol §4.4 `closed`),
      // so either the close or that frame says 4005.
      const said4005 = closedWith === 4005 || frames.some((f) => f.type === "closed" && f.data.code === 4005);
      assert(said4005, `standing up did not close the socket 4005: close ${closedWith}, frames ${JSON.stringify(frames.map((f) => f.type))}`);
    } finally {
      await server.shutdown();
    }
  },
});

// X1 (xor-ad-c4's cross check, 27.09.2026), the two probes as they sent them
// and a third for a block from a chat. Red on 198716c, green after FX1.
test({
  name: "X1: a ticket spent after its seat is gone opens no room",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const relay = await import("../src/chat/relay.ts");
    const { a, b, id } = await game();
    const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
    const frames: { type: string; data: Record<string, unknown> }[] = [];
    try {
      const token = (await signed(b, "POST", `/tables/${id}/ticket`)).body.ticket as string;
      assertEquals((await signed(b, "DELETE", `/tables/${id}/seat`)).status, 204);
      const socket = new WebSocket(`ws://127.0.0.1:${server.addr.port}/chat`, ["xor.p1", `ticket.${token}`]);
      socket.onmessage = (event) => frames.push(JSON.parse(event.data));
      socket.onerror = () => {};
      await new Promise((r) => setTimeout(r, 1500));
      await signed(a, "POST", `/tables/${id}/lines`, { kind: "line", text: "секрет стола" });
      const end = Date.now() + 3000;
      while (Date.now() < end && !frames.some((f) => f.type === "line")) await new Promise((r) => setTimeout(r, 20));
      assert(!frames.some((f) => f.type === "line"), "a person who stood up still receives the table's lines through a ticket bought while seated");
      assert(frames.some((f) => f.type === "closed" && f.data.code === 4001), `the stale ticket is not refused as a bad one: ${JSON.stringify(frames)}`);
      socket.close();
    } finally {
      await server.shutdown();
    }
  },
});

test({
  name: "X1: a block from the feed stands the blocker up from a shared table",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, id } = await game();
    const phrase = crypto.randomUUID();
    await database.queryOrThrow(
      `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
                                  lat_published, lon_published, visible_at, expires_at)
         VALUES ($1, 'alpha', $2, 'фраза b', 'alone', 'und', 52.52, 13.4, 1000, 52.52, 13.4, now(), now() + interval '3 hours')`,
      [phrase, b.identity_id],
    );
    assertEquals((await signed(a, "POST", "/blocks", { feed: phrase, nonce: nonce() })).status, 204);
    const seats = await database.queryOrThrow<{ identity: string }>(
      `SELECT identity FROM table_seats WHERE table_id = $1 AND left_at IS NULL`, [id]);
    assert(!seats.some((s) => s.identity === a.identity_id), "the blocker stays at the table with the blocked after a block from the feed");
    assert(seats.some((s) => s.identity === b.identity_id), "the blocked one was stood up instead of the blocker");
  },
});

test({
  name: "X1: a block from a chat stands the blocker up from a shared table",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const { a, b, id } = await game();
    const chat = crypto.randomUUID();
    const [low, high] = [a.identity_id, b.identity_id].sort();
    await database.queryOrThrow(`INSERT INTO chats (id, pair_key) VALUES ($1, $2)`, [chat, `${low}:${high}:${chat}`]);
    for (const p of [a, b]) {
      await database.queryOrThrow(
        `INSERT INTO chat_participants (chat_id, identity, ephemeral_public_key, ephemeral_signature) VALUES ($1, $2, 'half', 'sig')`,
        [chat, p.identity_id],
      );
    }
    assertEquals((await signed(b, "POST", "/blocks", { chat, nonce: nonce() })).status, 204);
    const seats = await database.queryOrThrow<{ identity: string }>(
      `SELECT identity FROM table_seats WHERE table_id = $1 AND left_at IS NULL`, [id]);
    assert(!seats.some((s) => s.identity === b.identity_id), "the blocker stays at the table after a block from a chat");
  },
});

// Graphemes are what a person counts, bytes what the database holds (db/064:
// a name to 256, a line to 2048). A family emoji is one grapheme and 25 bytes:
// 24 of them are a name the node let through and the CHECK refused with a 503
// (verifier of GC2, 27.09.2026). Now the node says 400 before the insert.
test({ name: "a name or a line of family emoji too long in bytes is a 400, not a 503", sanitizeOps: false, sanitizeResources: false }, async () => {
  const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
  const a = await person();
  const named = await signed(a, "POST", "/tables", {
    class: "grid", set: "checkers", seats: 2, lat: 52.52, lon: 13.4, area_radius: 1000, name: family.repeat(24), nonce: nonce(),
  });
  assertEquals([named.status, named.body.error?.reason], [400, "too_many_bytes"], JSON.stringify(named.body));
  const { b, id } = await game();
  const said = await signed(b, "POST", `/tables/${id}/lines`, { kind: "line", text: family.repeat(128) });
  assertEquals([said.status, said.body.error?.reason], [400, "too_many_bytes"], JSON.stringify(said.body));
});
