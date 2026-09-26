// An upheld notice about a phrase of the feed (Article 17; chat spec §13 step 2,
// "вместе с этим шагом, не после"; dsa/SPEC §7; P8, 2026-09-26), against a real
// database.
//
// Until now the decision route wrote the statement of reasons to whatever the
// operator typed as recipient_identity — the tests typed e-mails — and touched
// the phrase not at all: "removed" removed nothing, and an author without a
// mailbox, whose only channel is GET /statements, was told nothing. Here the
// node addresses the statement to the phrase's author itself and takes the
// phrase out of the feed in the same transaction.
import { assert, assertEquals } from "jsr:@std/assert@1";
if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
const SECRET = "dsa-decision-feed-secret";
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", SECRET);
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "dsa-decision-feed-origin");
Deno.env.set("VAULT_SHARE_KEY", "dsa-decision-feed-vault-key");
Deno.env.set("BRANDS", JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]));
const { config } = await import("../src/config.ts");
const { match } = await import("../src/lib/router.ts");
const { sign } = await import("../src/lib/jwt.ts");
const { queryOrThrow } = await import("../src/lib/db.ts");
const { scopedForBrand } = await import("../src/lib/scoped_storage.ts");
const { sha256hex } = await import("../src/lib/hash.ts");
const { usersDir } = await import("../src/lib/auth.ts");
const auth = await import("../src/lib/identity_auth.ts");
await import("../src/routes/dsa.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/statements.ts");
const pool = { sanitizeOps: false, sanitizeResources: false };
const KEY_ID = "ak_pub_dsadecisionfeed01";
await queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper) VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
   ON CONFLICT (key) DO NOTHING`,
);
await queryOrThrow(`INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`, [KEY_ID]);

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
let addresses = 0;

// The panel's side: the platform's administrator deciding a notice.
async function decide(id: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = "admin@platform.test";
  await scopedForBrand(null).put(`${usersDir()}/${await sha256hex(email)}.json`, {
    email, role: "admin", brand: null, created_at: "2026-09-15T00:00:00.000Z",
  });
  const token = await sign({ sub: email, role: "admin", brand: null, env: config.envName, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  const url = new URL(`https://relay.test/admin/dsa-notices/${id}/decide`);
  const found = match("POST", url.pathname);
  assert(found, "no route for the decision");
  const response = await found.h({
    req: new Request(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: found.params,
    url,
  });
  return { status: response.status, body: await response.json() };
}

// The author's side: a registered identity, signing as the terminal does.
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
        "x-origin-token": "dsa-decision-feed-origin",
        "x-client-ip": `203.0.113.${++addresses % 250}`,
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
async function signedCall(key: CryptoKey, sessionId: string, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
  const time = Math.floor(Date.now() / 1000);
  const target = new URL(`https://relay.test${path}`);
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: { "x-identity-session": sessionId, "x-identity-time": String(time), "x-identity-sign": auth.bytesToBase64url(signature) },
  });
}
async function author() {
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
  assertEquals(answer.status, 200, "the registration failed");
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair };
}

// A published phrase of theirs, the way the socket suite seeds one: the
// subject here is the decision, not moderation.
async function phraseOf(identityId: string): Promise<string> {
  const id = crypto.randomUUID();
  await queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
       lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'alpha', $2, 'кто на набережную?', 'alone', 'und', 59.93, 30.33, 1000, 59.93, 30.33, now(), now() + interval '3 hours')`,
    [id, identityId],
  );
  return id;
}
async function noticeAbout(phraseId: string | null): Promise<string> {
  const [row] = await queryOrThrow<{ id: string }>(
    `INSERT INTO dsa_notices (brand, target_kind, target_id, reason_text, bona_fide, status, snapshot_state, acknowledged_at, notifier_email)
     VALUES ('alpha', 'feed_message', $1, 'names a private address', true, 'received', 'received', now(), NULL)
     RETURNING id`,
    [phraseId ?? crypto.randomUUID()],
  );
  return row.id;
}
const upheld = (over: Record<string, unknown> = {}) => ({
  decision: "upheld",
  facts: "The phrase names a private address and calls people there.",
  restriction: "removed",
  ground_kind: "legal",
  ground_text: "Article 16 notice; unlawful under national law.",
  ...over,
});
const phraseRows = async (id: string) =>
  Number((await queryOrThrow<{ n: string }>(`SELECT count(*)::text AS n FROM feed_messages WHERE id = $1`, [id]))[0].n);
const statementOf = async (noticeId: string) =>
  (await queryOrThrow<{ recipient_identity: string; restriction: string; target_id: string }>(
    `SELECT recipient_identity, restriction, target_id FROM dsa_statements WHERE notice_id = $1`, [noticeId]));

Deno.test({ name: "an upheld notice about a phrase is addressed to its author by the node, and the phrase leaves the feed", ...pool, async fn() {
  const me = await author();
  const stranger = await author();
  const phrase = await phraseOf(me.identity_id);
  const notice = await noticeAbout(phrase);

  // No recipient typed: the node knows whose phrase it is.
  const decided = await decide(notice, upheld());
  assertEquals(decided.status, 200, JSON.stringify(decided.body));
  assert(decided.body.statement_id, "no statement of reasons was written");

  const [statement] = await statementOf(notice);
  assertEquals(statement.recipient_identity, me.identity_id, "the statement was not addressed to the phrase's author");
  assertEquals(statement.target_id, phrase);
  assertEquals(await phraseRows(phrase), 0, "\"removed\" left the phrase in the feed");

  // The author reads it where an author without a mailbox reads anything —
  // and the stranger reads nothing of it.
  const mine = await signedCall(me.pair.privateKey, me.session_id, "GET", "/statements");
  assertEquals(mine.status, 200, JSON.stringify(mine.body));
  const items = (mine.body as { items: Array<{ id: string; restriction: string }> }).items;
  assertEquals(items.map((i) => i.id), [decided.body.statement_id as string], "the author does not see the statement about their phrase");
  assertEquals(items[0].restriction, "removed");
  const theirs = await signedCall(stranger.pair.privateKey, stranger.session_id, "GET", "/statements");
  assertEquals((theirs.body as { items: unknown[] }).items.length, 0, "a stranger was shown somebody else's statement");
}});

Deno.test({ name: "a recipient the operator typed does not redirect a phrase's statement away from its author", ...pool, async fn() {
  const me = await author();
  const stranger = await author();
  const phrase = await phraseOf(me.identity_id);
  const notice = await noticeAbout(phrase);
  const decided = await decide(notice, upheld({ recipient_identity: stranger.identity_id, restriction: "hidden" }));
  assertEquals(decided.status, 200, JSON.stringify(decided.body));
  const [statement] = await statementOf(notice);
  assertEquals(statement.recipient_identity, me.identity_id, "the typed recipient took the statement from the phrase's author");
  assertEquals(await phraseRows(phrase), 0, "\"hidden\" left the phrase in the feed");
  const theirs = await signedCall(stranger.pair.privateKey, stranger.session_id, "GET", "/statements");
  assertEquals((theirs.body as { items: unknown[] }).items.length, 0, "the typed stranger was handed a statement about somebody else's phrase");
}});

Deno.test({ name: "a restriction that is not about the feed leaves the phrase where it is", ...pool, async fn() {
  const me = await author();
  const phrase = await phraseOf(me.identity_id);
  const notice = await noticeAbout(phrase);
  const decided = await decide(notice, upheld({ restriction: "access_restricted" }));
  assertEquals(decided.status, 200, JSON.stringify(decided.body));
  assertEquals(await phraseRows(phrase), 1, "an access restriction deleted the phrase");
  assertEquals((await statementOf(notice))[0].recipient_identity, me.identity_id);
}});

Deno.test({ name: "a phrase already gone: the statement goes to the typed addressee, and without one the decision is refused", ...pool, async fn() {
  const me = await author();
  const gone = await noticeAbout(null);
  const refused = await decide(gone, upheld());
  assertEquals(refused.status, 422, JSON.stringify(refused.body));
  assertEquals((await statementOf(gone)).length, 0, "a refused decision wrote a statement");
  const [row] = await queryOrThrow<{ decided_at: Date | null }>(`SELECT decided_at FROM dsa_notices WHERE id = $1`, [gone]);
  assertEquals(row.decided_at, null, "a refused decision marked the notice decided");

  const decided = await decide(gone, upheld({ recipient_identity: me.identity_id }));
  assertEquals(decided.status, 200, JSON.stringify(decided.body));
  assertEquals((await statementOf(gone))[0].recipient_identity, me.identity_id);
}});
