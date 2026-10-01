// The node enforces `required` (W13-LN; chat spec §8.2 :851-858): a person
// without the latest revision of every required document neither publishes
// nor opens a chat — POST /feed and POST /matches/:id/consent answer 409
// legal_reacceptance_required with the documents to accept (the form the
// core already reads, depth/core/client.ts conflictOf). Behind
// LEGAL_REQUIRED=1: off, the gate is not there — the faces do not ask for
// acceptance yet (W13-LC), and every registration fixture would go red.
// This suite sets the flag before the first import.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run this suite through scripts/run-relay-database-tests.sh");
}
Deno.env.set("LEGAL_REQUIRED", "1");
Deno.env.set("SESSION_SECRET", "legal-required-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "legal-required-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "legal-required-vault-key");
Deno.env.set("FEED_VERDICT", "rules");
Deno.env.set("BRANDS", JSON.stringify([{ key: "sosed", name: "Sosed", domain: "sosed.test", from: "s <s@sosed.test>" }]));

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { revisionsOf } = await import("../src/lib/legal.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/legal.ts");
await import("../src/routes/feed.ts");
await import("../src/routes/likes.ts");
await import("../src/routes/matches.ts");

// The face with real revisions on this node (relay/node/legal/sosed.json).
const KEY_ID = "ak_pub_legalrequiredtest01";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper) VALUES ('sosed', 'Sosed', 'sosed.test', 's <s@sosed.test>', 'SOSED') ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(`INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'sosed', '{}') ON CONFLICT (id) DO NOTHING`, [KEY_ID]);
await database.queryOrThrow("SELECT 1");

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
const b64 = (bytes: Uint8Array) => auth.bytesToBase64url(bytes);
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
let addresses = 0;
const nextAddress = () => `203.0.113.${++addresses % 250}`;
const pooled = { sanitizeOps: false, sanitizeResources: false };
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
        "x-origin-token": "legal-required-origin-token",
        "x-client-ip": nextAddress(),
        "x-api-key": KEY_ID,
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
    headers: { "x-identity-session": who.session_id, "x-identity-time": String(time), "x-identity-sign": b64(signature) },
  });
}

async function person(name = "Аня"): Promise<Who> {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    body: {
      sign_pub: b64(spki), wrap_pub: b64(random(91)), name, age: 30,
      auth_hash: await auth.sha256hex(random(32)), share: b64(random(32)), recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const who = { ...created, pair };
  const confirmed = await signed(who, "POST", "/recovery/confirm", { recovery_wrapped_key: b64(random(48)) });
  assertEquals(confirmed.status, 204, "the registration was not finished");
  return who;
}

const phrase = { text: "гуляю у реки, если кто рядом", mode: "alone", lat: 41.9, lon: 12.5, area_radius: 1000 };

async function acceptAll(who: Who, except?: string) {
  for (const r of (await revisionsOf("sosed"))!) {
    if (r.document === except) continue;
    const a = await signed(who, "POST", "/legal/accept", { document: r.document, revision_sha256: r.revision_sha256 });
    assertEquals(a.status, 200, `${r.document} was not accepted: ${JSON.stringify(a.body)}`);
  }
}

async function seedPhrase(identity: string, text: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages (id, brand, author_identity, text, mode, lang, lat, lon, area_radius, lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'sosed', $2, $3, 'alone', 'und', 41.9, 12.5, 1000, 41.9, 12.5, now(), now() + interval '3 hours')`,
    [id, identity, text],
  );
  return id;
}

async function halfFor(who: Who, matchId: string) {
  const key = b64(new Uint8Array(await crypto.subtle.exportKey(
    "spki", ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])) as CryptoKeyPair).publicKey)));
  const prefix = new TextEncoder().encode("xor.ephemeral.v1\n" + matchId + "\n");
  const raw = auth.base64urlToBytes(key)!;
  const bytes = new Uint8Array(prefix.length + raw.length);
  bytes.set(prefix); bytes.set(raw, prefix.length);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, who.pair.privateKey, bytes));
  return { ephemeral_public_key: key, ephemeral_signature: b64(signature) };
}

Deno.test({
  name: "a phrase is refused 409 legal_reacceptance_required with the documents until every required revision is accepted",
  ...pooled,
  async fn() {
    const me = await person();
    const refused = await signed(me, "POST", "/feed", phrase);
    assertEquals(refused.status, 409, JSON.stringify(refused.body));
    const body = refused.body as { error?: unknown; documents?: Array<{ document: string; revision_sha256: string }> };
    assertEquals(body.error, "legal_reacceptance_required", "not the form the core reads (conflictOf)");
    assertEquals(body.documents?.map((d) => d.document).sort(), ["guidelines", "privacy", "terms"], "the documents to accept are not named");
    // Two of three: still refused, and only the missing one is named.
    await acceptAll(me, "privacy");
    const still = await signed(me, "POST", "/feed", phrase);
    assertEquals(still.status, 409, JSON.stringify(still.body));
    assertEquals((still.body as { documents: Array<{ document: string }> }).documents.map((d) => d.document), ["privacy"]);
    await acceptAll(me);
    const sent = await signed(me, "POST", "/feed", phrase);
    assert(sent.status === 200 || sent.status === 202, `accepted everything and the phrase was still refused: ${sent.status} ${JSON.stringify(sent.body)}`);
  },
});

Deno.test({
  name: "a consent is refused the same way until the revisions are accepted; the match itself stands",
  ...pooled,
  async fn() {
    const { reset } = await import("../src/lib/rate_limit.ts");
    reset();
    const a = await person("Аня");
    const b = await person("Марк");
    await acceptAll(b);
    const mine = await seedPhrase(a.identity_id, "кто на набережную?");
    const theirs = await seedPhrase(b.identity_id, "гуляю у залива");
    assertEquals((await signed(a, "POST", `/feed/${theirs}/like`)).status, 200);
    const back = await signed(b, "POST", `/feed/${mine}/like`);
    assertEquals((back.body as { state?: string }).state, "matched", `the setup did not make a match: ${JSON.stringify(back.body)}`);
    const matchId = (back.body as { match_id: string }).match_id;
    // B accepted everything: consent goes through. A did not: refused, with the documents.
    const theirConsent = await signed(b, "POST", `/matches/${matchId}/consent`, await halfFor(b, matchId));
    assertEquals(theirConsent.status, 200, JSON.stringify(theirConsent.body));
    const refused = await signed(a, "POST", `/matches/${matchId}/consent`, await halfFor(a, matchId));
    assertEquals(refused.status, 409, JSON.stringify(refused.body));
    assertEquals((refused.body as { error?: unknown }).error, "legal_reacceptance_required");
    const [row] = await database.queryOrThrow<{ n: number }>(`SELECT count(*)::int AS n FROM matches WHERE id = $1 AND chat_id IS NULL`, [matchId]);
    assertEquals(row.n, 1, "the refused consent touched the match");
    await acceptAll(a);
    const agreed = await signed(a, "POST", `/matches/${matchId}/consent`, await halfFor(a, matchId));
    assertEquals(agreed.status, 200, `accepted everything and the consent was still refused: ${JSON.stringify(agreed.body)}`);
  },
});
