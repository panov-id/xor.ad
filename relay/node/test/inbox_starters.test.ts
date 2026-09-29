// The starters of a conversation on its inbox row (chat spec §8.7, "Liked,
// in order"; N1): the phrases the match was made of, the same rows for both
// sides from the first minute, numbered in the order of the likes and marked
// from the reader's side. Run through scripts/run-relay-database-tests.sh.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "inbox-starters-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "inbox-starters-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "inbox-starters-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");
await import("../src/routes/likes.ts");
await import("../src/routes/matches.ts");
await import("../src/routes/chats.ts");
await import("../src/routes/inbox.ts");
await import("../src/routes/dsa.ts");
const { config } = await import("../src/config.ts");
const { sign } = await import("../src/lib/jwt.ts");
const { scopedForBrand } = await import("../src/lib/scoped_storage.ts");
const { usersDir } = await import("../src/lib/auth.ts");
const { sha256hex: hashOf } = await import("../src/lib/hash.ts");

const KEY_ID = "ak_pub_inboxstarterstest";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

// ── Against the tables ─────────────────────────────────────────────────────────

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
        "x-origin-token": "inbox-starters-origin-token",
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

async function author(): Promise<Who> {
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
  const who = { ...created, pair };
  const confirmed = await signed(who, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return who;
}

async function seedPhrase(identity: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'xor', $2, $3, 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94, now(), now() + interval '3 hours')`,
    [id, identity, text],
  );
  return id;
}

// The ephemeral half of §8.13, signed over "xor.ephemeral.v1\n<match_id>\n" ‖ SPKI.
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
const consent = async (who: Who, matchId: string) => signed(who, "POST", `/matches/${matchId}/consent`, await halfFor(who, matchId));

type Page = { items: Array<Record<string, unknown>> };
async function inbox(who: Who, since?: number): Promise<Page> {
  const answer = await signed(who, "GET", since === undefined ? "/inbox" : `/inbox?since=${since}`);
  assertEquals(answer.status, 200, `the inbox refused: ${JSON.stringify(answer.body)}`);
  return answer.body as Page;
}

const test = (name: string, fn: () => Promise<void>) => Deno.test({ name, sanitizeOps: false, sanitizeResources: false, fn });

type Starter = { position: number; text: string; mode: string; liked_by: "me" | "them"; removed: boolean };
const startersOf = (page: Page, chatId: string): Starter[] => {
  const row = page.items.find((item) => item.kind === "chat" && item.id === chatId);
  assert(row, `the conversation ${chatId} is not in the inbox: ${JSON.stringify(page.items)}`);
  assert(Array.isArray(row.starters), `the chat row carries no starters: ${JSON.stringify(row)}`);
  return row.starters as Starter[];
};

test("after the consent both see the same starters from the first minute, in the order of the likes, each marked from their own side (N1)", async () => {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const one = await author();
  const two = await author();
  // The like that comes first goes to the phrase of the greater identity: the
  // order of the likes is then the reverse of the order of the identities, so
  // a header numbered by identity reads the wrong way round.
  const [low, high] = one.identity_id < two.identity_id ? [one, two] : [two, one];
  const lowPhrase = await seedPhrase(low.identity_id, "кто на набережную?");
  const highPhrase = await seedPhrase(high.identity_id, "гуляю у залива");
  const first = await signed(low, "POST", `/feed/${highPhrase}/like`);
  assertEquals(first.status < 300, true, `the first like failed: ${JSON.stringify(first.body)}`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const back = await signed(high, "POST", `/feed/${lowPhrase}/like`);
  assertEquals((back.body as { state?: string }).state, "matched", `no match: ${JSON.stringify(back.body)}`);
  const matchId = (back.body as { match_id: string }).match_id;
  await consent(low, matchId);
  const agreed = await consent(high, matchId);
  const chatId = (agreed.body as { chat_id?: string }).chat_id;
  assert(chatId, `the consent opened no conversation: ${JSON.stringify(agreed.body)}`);

  const forLow = startersOf(await inbox(low), chatId);
  const forHigh = startersOf(await inbox(high), chatId);

  // The same rows for both: position, text and mode.
  const shape = (list: Starter[]) => list.map(({ position, text, mode }) => ({ position, text, mode }));
  assertEquals(shape(forLow), shape(forHigh), "the two sides see different starters");
  assertEquals(shape(forLow), [
    { position: 1, text: "гуляю у залива", mode: "alone" },
    { position: 2, text: "кто на набережную?", mode: "alone" },
  ], "the starters are not in the order of the likes");

  // Who liked, from each reader's side; the identity itself never leaves.
  assertEquals(forLow.map((s) => s.liked_by), ["me", "them"], "the first side's marks are wrong");
  assertEquals(forHigh.map((s) => s.liked_by), ["them", "me"], "the second side's marks are wrong");
  const raw = JSON.stringify(forLow) + JSON.stringify(forHigh);
  assert(!raw.includes(low.identity_id) && !raw.includes(high.identity_id), "a starter carries an identity");
});

// ── What is taken down is not handed on (the verifier of N1) ──────────────────

// The platform's administrator upholds an Article 16 notice about a phrase,
// through the decision route, as dsa_decision_feed.test.ts does.
async function takenDownByNotice(phraseId: string) {
  const [notice] = await database.queryOrThrow<{ id: string }>(
    `INSERT INTO dsa_notices (brand, target_kind, target_id, reason_text, bona_fide, status, snapshot_state, acknowledged_at, notifier_email)
     VALUES ('alpha', 'feed_message', $1, 'names a private address', true, 'received', 'received', now(), NULL)
     RETURNING id`,
    [phraseId],
  );
  const email = "admin@platform.test";
  await scopedForBrand(null).put(`${usersDir()}/${await hashOf(email)}.json`, {
    email, role: "admin", brand: null, created_at: "2026-09-15T00:00:00.000Z",
  });
  const token = await sign({ sub: email, role: "admin", brand: null, env: config.envName, exp: Math.floor(Date.now() / 1000) + 3600 }, "inbox-starters-secret");
  const url = new URL(`https://relay.test/admin/dsa-notices/${notice.id}/decide`);
  const found = match("POST", url.pathname);
  assert(found, "no route for the decision");
  const response = await found.h({
    req: new Request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        decision: "upheld", facts: "The phrase names a private address.", restriction: "removed",
        ground_kind: "legal", ground_text: "Article 16 notice; unlawful under national law.",
      }),
    }),
    params: found.params,
    url,
  });
  assertEquals(response.status, 200, `the decision failed: ${await response.text()}`);
}

// Two people, a match, the likes in the reverse order of the identities.
async function pairMatched() {
  const { reset } = await import("../src/lib/rate_limit.ts");
  reset();
  const one = await author();
  const two = await author();
  const [low, high] = one.identity_id < two.identity_id ? [one, two] : [two, one];
  const lowPhrase = await seedPhrase(low.identity_id, "кто на набережную?");
  const highPhrase = await seedPhrase(high.identity_id, "гуляю у залива");
  await signed(low, "POST", `/feed/${highPhrase}/like`);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const back = await signed(high, "POST", `/feed/${lowPhrase}/like`);
  assertEquals((back.body as { state?: string }).state, "matched", `no match: ${JSON.stringify(back.body)}`);
  return { low, high, lowPhrase, highPhrase, matchId: (back.body as { match_id: string }).match_id };
}

test("a phrase taken down under Article 16 after the conversation opened keeps its number with the text gone, for both (N1, P1)", async () => {
  const { low, high, lowPhrase, matchId } = await pairMatched();
  await consent(low, matchId);
  const chatId = (await consent(high, matchId)).body as { chat_id?: string };
  assert(chatId.chat_id, "no conversation opened");
  await takenDownByNotice(lowPhrase);
  for (const who of [low, high]) {
    const list = startersOf(await inbox(who), chatId.chat_id);
    assertEquals(list.map((s) => s.position), [1, 2], "the header's numbers moved");
    assertEquals(list[0].text, "гуляю у залива", "the phrase not taken down lost its text");
    assertEquals(list[0].removed, false);
    assertEquals(list[1].text, "", "the phrase taken down under Article 16 is still handed out");
    assertEquals(list[1].removed, true, "the starter taken down is not marked removed");
  }
});

test("a phrase taken down under Article 16 before the consent puts out the match it made: no conversation opens with it (N1, P2)", async () => {
  const { low, high, highPhrase, matchId } = await pairMatched();
  await consent(low, matchId);
  await takenDownByNotice(highPhrase);
  const answer = await consent(high, matchId);
  assert(!(answer.body as { chat_id?: string })?.chat_id, `a conversation opened on a match of a phrase taken down: ${JSON.stringify(answer.body)}`);
  for (const who of [low, high]) {
    const rows = (await inbox(who)).items.filter((i) => i.id === matchId || i.kind === "chat");
    assertEquals(rows, [], "the match of a phrase taken down is still in the inbox");
  }
});

test("a phrase gone before the consent has no like left, and its starter comes last (N1, NULLS LAST)", async () => {
  const { low, high, highPhrase, matchId } = await pairMatched();
  // Its author takes it down: the like on it goes by cascade; the match stays.
  const gone = await signed(high, "DELETE", `/feed/${highPhrase}`);
  assertEquals(gone.status, 204, JSON.stringify(gone.body));
  await consent(low, matchId);
  const opened = (await consent(high, matchId)).body as { chat_id?: string };
  assert(opened.chat_id, `no conversation opened: ${JSON.stringify(opened)}`);
  const list = startersOf(await inbox(low), opened.chat_id);
  assertEquals(list.map((s) => s.text), ["кто на набережную?", "гуляю у залива"], "a starter without its like is not last");
});
