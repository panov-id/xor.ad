// «Your turn» (design 25.10 B5, protocol §4.6 POST /tables/:id/nudge; db/088_your_turn.sql): a seated person nudges
// the one whose turn it is; only that person's chats list room hears a `nudge` frame, once a minute per table.
// Run through scripts/run-relay-database-tests.sh.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "your-turn-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "your-turn-origin");
Deno.env.set("VAULT_SHARE_KEY", "your-turn-vault");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/tables.ts");
await import("../src/routes/inbox.ts");
await import("../src/routes/blocks.ts");
await import("../src/routes/hidden.ts");
await import("../src/routes/away.ts");
await import("../src/routes/feed.ts");
await (await import("../src/chat/relay.ts")).listenForRooms();

const KEY_ID = "ak_pub_yourturntest00001";
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
        "x-origin-token": "your-turn-origin",
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
// A lat of its own per test, so another test's tables do not crowd the list.
let spot = 0;
async function table(who: Person): Promise<{ id: string; lat: number }> {
  const lat = 40 + (++spot) / 10 + Math.random() / 100;
  const made = await signed(who, "POST", "/tables", { class: "grid", set: "checkers", seats: 2, lat, lon: 13.4, area_radius: 1000, nonce: nonce() });
  assertEquals(made.status, 201, JSON.stringify(made.body));
  return { id: made.body.id as string, lat };
}

const relay = await import("../src/chat/relay.ts");
type Frame = { type: string; data: Record<string, unknown> };
async function inboxRoom(port: number, who: Person) {
  const bought = await signed(who, "POST", "/inbox/ticket");
  assertEquals(bought.status, 200, `no ticket: ${JSON.stringify(bought.body)}`);
  const frames: Frame[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/chat`, ["xor.p1", `ticket.${bought.body.ticket}`]);
  socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)));
  socket.onerror = () => {};
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); setTimeout(() => reject(new Error("the socket never opened")), 3000); });
  const end = Date.now() + 2000;
  while (Date.now() < end && !frames.some((f) => f.type === "inbox")) await new Promise((r) => setTimeout(r, 20));
  assert(frames.some((f) => f.type === "inbox"), "the room never opened — the case proves nothing");
  frames.length = 0;
  return { socket, frames };
}
const nudges = async (frames: Frame[], ms = 600) => {
  await new Promise((r) => setTimeout(r, ms));
  return frames.filter((f) => f.type === "nudge");
};

Deno.test({ name: "a nudge reaches only the one whose turn it is, once a minute per table", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const a = await person();
  const b = await person();
  const { id } = await table(a);
  assertEquals((await signed(b, "POST", `/tables/${id}/seat`)).status, 200);
  assertEquals((await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "возьмите" })).status, 200);
  assertEquals((await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" })).status, 200);
  const view = (await signed(a, "GET", `/tables/${id}`)).body;
  const turn = view.board?.turn as number;
  assert(turn === 1 || turn === 2, `no running round: ${JSON.stringify(view.board)}`);
  const [mover, waiter] = turn === view.seat ? [a, b] : [b, a];
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, relay.relayUpgrade);
  const [rm, rw] = [await inboxRoom(server.addr.port, mover), await inboxRoom(server.addr.port, waiter)];
  try {
    assertEquals((await signed(mover, "POST", `/tables/${id}/nudge`)).status, 409, "the mover nudged themself");
    const sent = await signed(waiter, "POST", `/tables/${id}/nudge`);
    assertEquals(sent.status, 204, JSON.stringify(sent.body));
    const got = await nudges(rm.frames);
    assertEquals(got.length, 1, "the one whose turn it is heard no nudge");
    assertEquals(got[0].data.table, id);
    assertEquals((await nudges(rw.frames, 0)).length, 0, "the nudger's own list heard the nudge");
    const again = await signed(waiter, "POST", `/tables/${id}/nudge`);
    assertEquals(again.status, 429, "a second nudge inside the minute went through");
    assertEquals((await nudges(rm.frames, 300)).length, 1, "a refused nudge still reached the mover");
  } finally {
    rm.socket.close(); rw.socket.close();
    await server.shutdown();
  }
}});

Deno.test("a stranger cannot nudge a table", async () => {
  const a = await person();
  const c = await person();
  const { id } = await table(a);
  assertEquals((await signed(c, "POST", `/tables/${id}/nudge`)).status, 404, "a stranger nudged");
});

Deno.test("a nudge to a seat nobody sits in is refused and spends no minute", async () => {
  const a = await person();
  const b = await person();
  const { id } = await table(a);
  assertEquals((await signed(b, "POST", `/tables/${id}/seat`)).status, 200);
  assertEquals((await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "возьмите" })).status, 200);
  assertEquals((await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" })).status, 200);
  const view = (await signed(a, "GET", `/tables/${id}`)).body;
  const turn = view.board?.turn as number;
  const waiter = turn === view.seat ? b : a;
  // the mover's seat empties under a running round (a crash between the two writes, a sweeper): nobody to nudge
  await database.queryOrThrow(`UPDATE table_seats SET left_at = now() WHERE table_id = $1 AND seat_no = $2`, [id, turn]);
  assertEquals((await signed(waiter, "POST", `/tables/${id}/nudge`)).status, 409, "a nudge to an empty seat went through");
  const [row] = await database.queryOrThrow<{ nudged_at: Date | null }>(`SELECT nudged_at FROM tables WHERE id = $1`, [id]);
  assertEquals(row.nudged_at, null, "a nudge to nobody spent the table's minute");
});
