// The confirmation of a new game at a table (chat spec §6.1, decided
// 2026-09-09; limits table.confirm.window = 30 s; W14-TC, open.tsv
// table.confirm.unbuilt): a rematch proposal carries `until`; everyone playing
// has thirty seconds to say "I am here"; whoever did not becomes a spectator
// (playing_from NULL) and the round starts with those who confirmed; the view
// says how many confirmed of how many — but not with two at the table (decided
// 2026-09-10), where the count would name the one other person. The harness is
// tables.test.ts's: people through the routes, a table set up and sat at.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "tables-confirm-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "tables-confirm-origin");
Deno.env.set("VAULT_SHARE_KEY", "tables-confirm-vault");
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

const KEY_ID = "ak_pub_tablesconfirm0001";
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
const nextAddress = () => `198.51.100.${++addresses % 250}`;

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
        "x-origin-token": "tables-confirm-origin",
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

// The board with its proposal, as the test reads it.
type BoardP = Board & { pending: { id: string; until?: number; confirmed?: number; of?: number } | null };
const boardP = async (who: Person, id: string) => (await signed(who, "GET", `/tables/${id}`)).body.board as BoardP;
const until = (b: BoardP | null) => b?.pending?.until;
const count = (b: BoardP | null) => (b?.pending && b.pending.confirmed !== undefined ? [b.pending.confirmed, b.pending.of] : null);
const playingFrom = async (id: string, seat: number) =>
  (await database.queryOrThrow<{ playing_from: Date | null }>(
    `SELECT playing_from FROM table_seats WHERE table_id = $1 AND seat_no = $2 AND left_at IS NULL`, [id, seat]))[0]?.playing_from ?? null;
const expireNow = (id: string) =>
  database.queryOrThrow(`UPDATE table_games SET pending = jsonb_set(pending, '{until}', '1') WHERE table_id = $1 AND ended_at IS NULL AND pending IS NOT NULL`, [id]);

// Three at a table, all playing: A sets it up for three, B and C sit and apply,
// A opens the first round alone and both take the free places.
async function gameOfThree(): Promise<{ a: Person; b: Person; c: Person; id: string }> {
  const a = await person();
  const b = await person();
  const c = await person();
  const made = await signed(a, "POST", "/tables", { class: "deck", set: "durak36", seats: 3, lat: 52.52, lon: 13.4, area_radius: 1000, nonce: nonce() });
  assertEquals(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id as string;
  for (const who of [b, c]) {
    assertEquals((await signed(who, "POST", `/tables/${id}/seat`)).status, 200);
    assertEquals((await signed(who, "POST", `/tables/${id}/lines`, { kind: "application", text: "возьмите" })).status, 202);
  }
  const round = await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals(round.status, 200, JSON.stringify(round.body));
  assertEquals((await board(a, id)).state.order.length, 3, "the first round did not seat all three");
  return { a, b, c, id };
}

Deno.test("a rematch proposal carries thirty seconds, the view counts the confirmed of three, and the silent one watches the round that starts", async () => {
  const { a, b, c, id } = await gameOfThree();
  const asked = Math.floor(Date.now() / 1000);
  const proposed = await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals(proposed.status, 200, JSON.stringify(proposed.body));
  let seen = await boardP(b, id);
  const u = until(seen);
  assert(typeof u === "number" && u >= asked + 25 && u <= asked + 35, `until is not thirty seconds from the proposal: ${u} vs ${asked}`);
  assertEquals(count(seen), [1, 3], "the proposer's own confirmation is not counted of three");
  const answered = await signed(b, "POST", `/tables/${id}/proposals/${seen!.pending!.id}`, { answer: "accept" });
  assertEquals(answered.body, { state: "waiting" });
  seen = await boardP(c, id);
  assertEquals(count(seen), [2, 3], "the second confirmation is not counted");
  // The window runs out with C silent: C watches, the round starts with A and B.
  await expireNow(id);
  seen = await boardP(a, id);
  assertEquals(seen!.pending, null, "the expired proposal is still open");
  assert(seen!.turn !== null, "no round started with the two who confirmed");
  assertEquals(seen!.state.order.slice().sort(), [1, 2], "the round is not of the two who confirmed");
  assertEquals(await playingFrom(id, 3), null, "the one who did not confirm still plays");
  assert(await playingFrom(id, 1), "a confirmed player was stood up");
});

Deno.test("with two at the table the view gives the window but not the count, and a silent one leaves the proposer alone", async () => {
  const { a, b, id } = await game();
  const proposed = await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals(proposed.status, 200, JSON.stringify(proposed.body));
  const seen = await boardP(b, id);
  assert(typeof until(seen) === "number", "the proposal of two carries no window");
  assertEquals(count(seen), null, "with two at the table the count names the other person (decided 2026-09-10)");
  // The round under way stays as it is: a new one needs two who confirmed.
  const [{ id: before }] = await database.queryOrThrow<{ id: string }>(`SELECT id FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  await expireNow(id);
  const after = await boardP(a, id);
  assertEquals(after!.pending, null, "the expired proposal is still open");
  const [{ id: still }] = await database.queryOrThrow<{ id: string }>(`SELECT id FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  assertEquals(still, before, "a round started with one confirmed");
  assertEquals(await playingFrom(id, 2), null, "the silent one still plays");
  assert(await playingFrom(id, 1), "the proposer was stood up");
});

Deno.test("the autopass job applies an expired confirmation with nobody asking the table", async () => {
  const { a, b, c, id } = await gameOfThree();
  const proposed = await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" });
  assertEquals(proposed.status, 200);
  const pid = (await database.queryOrThrow<{ pending: { id: string } }>(`SELECT pending FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]))[0].pending.id;
  assertEquals((await signed(c, "POST", `/tables/${id}/proposals/${pid}`, { answer: "accept" })).body, { state: "waiting" });
  await expireNow(id);
  await tables.autopass();
  assertEquals(await playingFrom(id, 2), null, "the job left the silent one playing");
  const [running] = await database.queryOrThrow<{ state: { order: number[] }; pending: unknown }>(
    `SELECT state, pending FROM table_games WHERE table_id = $1 AND ended_at IS NULL`, [id]);
  assert(running, "no round after the job");
  assertEquals(running.pending, null);
  assertEquals(running.state.order.slice().sort(), [1, 3], "the job's round is not of the two who confirmed");
  void b;
});
