// Playing alone while waiting (chat spec §6.2, owner's decision 2026-10-25):
// the table's player marks "playing alone", neighbours see `solo` in the list,
// a neighbour sits down and applies, and the round that starts clears the mark.
// The node keeps the moment only — no puzzle, no position. The harness is
// tables_confirm.test.ts's: people through the routes.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "tables-solo-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "tables-solo-origin");
Deno.env.set("VAULT_SHARE_KEY", "tables-solo-vault");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/tables.ts");
await import("../src/routes/blocks.ts");
await import("../src/routes/hidden.ts");
await import("../src/routes/away.ts");
await import("../src/routes/feed.ts");
await (await import("../src/chat/relay.ts")).listenForRooms();

const KEY_ID = "ak_pub_tablessolo000001";
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
        "x-origin-token": "tables-solo-origin",
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
const listed = async (who: Person, lat: number, id: string) => {
  const page = await signed(who, "GET", `/tables?lat=${lat}&lon=13.4&radius=1000`);
  assertEquals(page.status, 200, JSON.stringify(page.body));
  return (page.body.items as { id: string; solo: boolean }[]).find((c) => c.id === id);
};

Deno.test("a player marks playing alone, a neighbour sees it in the list, and a round that starts clears it", async () => {
  const a = await person();
  const b = await person();
  const { id, lat } = await table(a);
  assertEquals((await listed(b, lat, id))?.solo, false, "a fresh table already says playing alone");
  assertEquals((await signed(a, "POST", `/tables/${id}/solo`)).status, 204);
  assertEquals((await listed(b, lat, id))?.solo, true, "the neighbour does not see playing alone (owner 2026-10-25: «пусть видят»)");
  assertEquals((await signed(a, "GET", `/tables/${id}`)).body.solo, true, "the table's own view does not carry the mark");
  // The neighbour sits and applies; the player starts the round with them.
  assertEquals((await signed(b, "POST", `/tables/${id}/seat`)).status, 200);
  assertEquals((await signed(b, "POST", `/tables/${id}/lines`, { kind: "application", text: "возьмите" })).status, 200);
  assertEquals((await signed(a, "POST", `/tables/${id}/proposals`, { kind: "rematch" })).status, 200);
  const view = (await signed(b, "GET", `/tables/${id}`)).body;
  assertEquals(view.solo, false, "the round started and the table still says playing alone");
  // A round under way cannot be marked alone again.
  assertEquals((await signed(a, "POST", `/tables/${id}/solo`)).status, 409, "playing alone was allowed during a round");
});

Deno.test("the mark comes off by hand and with the last player standing up, and a stranger cannot set it", async () => {
  const a = await person();
  const b = await person();
  const { id, lat } = await table(a);
  assertEquals((await signed(b, "POST", `/tables/${id}/solo`)).status, 404, "someone not at the table touched its mark");
  assertEquals((await signed(a, "POST", `/tables/${id}/solo`)).status, 204);
  assertEquals((await signed(a, "DELETE", `/tables/${id}/solo`)).status, 204);
  assertEquals((await listed(b, lat, id))?.solo, false, "the mark taken off by hand stayed");
  // A watcher sits down; the player stands up; the table stays open with no player — no mark.
  assertEquals((await signed(a, "POST", `/tables/${id}/solo`)).status, 204);
  assertEquals((await signed(b, "POST", `/tables/${id}/seat`)).status, 200);
  assertEquals((await signed(b, "POST", `/tables/${id}/solo`)).status, 409, "a watcher marked playing alone");
  assertEquals((await signed(a, "DELETE", `/tables/${id}/seat`)).status, 204);
  const [{ solo_since }] = await database.queryOrThrow<{ solo_since: Date | null }>(`SELECT solo_since FROM tables WHERE id = $1`, [id]);
  assertEquals(solo_since, null, "the last player stood up and the table still says playing alone");
});

// Review 2026-10-26 (security lens): every mark writes the table and notifies its stream; a loop of toggles is cut at
// solo.minute (6) per identity with 429 and retry-after, and the table's own mark is left as the last allowed call set it.
Deno.test("marking playing alone is limited per identity: the seventh toggle in a minute is 429 with retry-after", async () => {
  const a = await person();
  const { id } = await table(a);
  for (let k = 0; k < 6; k++) {
    const r = await signed(a, k % 2 ? "DELETE" : "POST", `/tables/${id}/solo`);
    assertEquals(r.status, 204, `toggle ${k + 1} of 6 was refused`);
  }
  const over = await signed(a, "POST", `/tables/${id}/solo`);
  assertEquals(over.status, 429, "the seventh toggle in a minute went through");
  assertEquals(over.body?.error?.code, "rate_limited");
});
