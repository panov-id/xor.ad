// E2 · the first-tier moderator model (lib/moderator.ts): a phrase the rules
// queue gets the model's hint beside it, after the 202; the phrase stays in the
// person's queue whatever the model says; a clean phrase never reaches the
// model; a dead model or an answer that is no verdict costs the author nothing.
// The model here is a stand-in HTTP server that speaks Ollama's /api/chat.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "moderator-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "moderator-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "moderator-vault-key");
Deno.env.delete("FEED_VERDICT");
Deno.env.delete("MODERATOR_URL");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const moderator = await import("../src/lib/moderator.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/feed.ts");

const KEY_ID = "ak_pub_moderatortest00001";
await database.queryOrThrow(
  `INSERT INTO brands (key, name, domain, sender, upper)
     VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA')
     ON CONFLICT (key) DO NOTHING`,
);
await database.queryOrThrow(
  `INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`,
  [KEY_ID],
);

// The stand-in model: answers what `reply` says and keeps every phrase asked.
const asked: string[] = [];
let reply = '{"verdict":"reject","reason":"a link"}';
const model = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (req) => {
  const body = await req.json() as { messages: { role: string; content: string }[]; format?: string };
  const user = body.messages.find((m) => m.role === "user")!;
  asked.push((JSON.parse(user.content) as { phrase: string }).phrase);
  return Response.json({ message: { role: "assistant", content: reply } });
});
const MODEL_URL = `http://127.0.0.1:${model.addr.port}`;

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
        "x-origin-token": "moderator-origin-token",
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
  return (text: string) =>
    signedCall(pair.privateKey, created.session_id, "POST", "/feed", { text, mode: "alone", lat: 41.9, lon: 12.5, area_radius: 1000 });
}

type HintRow = { verdict: string; reason: string; model: string; ms: number };
async function hintOf(id: string, seconds = 3): Promise<HintRow | undefined> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const [row] = await database.queryOrThrow<HintRow>(`SELECT verdict, reason, model, ms FROM moderator_hints WHERE feed_message_id = $1`, [id]);
    if (row) return row;
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}
const queued = async (id: string) =>
  (await database.queryOrThrow<{ visible_at: Date | null }>(`SELECT visible_at FROM feed_messages WHERE id = $1`, [id]))[0]?.visible_at === null;

Deno.test({
  name: "E2: a phrase the rules queue gets the model's hint beside it, and stays in the person's queue",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    Deno.env.set("MODERATOR_URL", MODEL_URL);
    try {
      asked.length = 0;
      reply = '{"verdict":"reject","reason":"a link"}';
      const say = await author();
      const link = await say("заходите на https://example.com/party");
      assertEquals(link.status, 202, JSON.stringify(link.body));
      const hint = await hintOf(link.body.id);
      assertEquals(hint?.verdict, "reject", "no hint was kept for a queued phrase");
      assertEquals([hint?.reason, hint?.model], ["a link", moderator.MODERATOR_MODEL_DEFAULT]);
      assert(await queued(link.body.id), "the model's reject took the phrase out of the person's queue");
      assertEquals(asked, ["заходите на https://example.com/party"], "the model was not asked the phrase itself");

      // A clean phrase is published by the rules and never reaches the model.
      const clean = await (await author())("гуляю у реки, если кто рядом");
      assertEquals(clean.status, 200);
      await new Promise((r) => setTimeout(r, 200));
      assertEquals(asked.length, 1, "a clean phrase was sent to the model");
      assertEquals(await hintOf(clean.body.id, 0.2), undefined);

      // An answer that is no verdict is kept as unsure.
      reply = "I think it is fine";
      const other = await (await author())("пиши в тг, расскажу");
      assertEquals(other.status, 202);
      assertEquals((await hintOf(other.body.id))?.verdict, "unsure");
    } finally {
      Deno.env.delete("MODERATOR_URL");
    }
  },
});

Deno.test({
  name: "E2: a dead model or no flag costs the author nothing and writes no hint",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Nothing listens on this port: the hint fails, the phrase is queued as ever.
    Deno.env.set("MODERATOR_URL", "http://127.0.0.1:9");
    try {
      const dead = await (await author())("звони +7 999 123-45-67");
      assertEquals(dead.status, 202);
      assertEquals(await hintOf(dead.body.id, 0.5), undefined, "a hint was written with no model to ask");
    } finally {
      Deno.env.delete("MODERATOR_URL");
    }
    asked.length = 0;
    const off = await (await author())("www.example.org");
    assertEquals(off.status, 202);
    await new Promise((r) => setTimeout(r, 200));
    assertEquals(asked.length, 0, "the model was asked with the flag off");
    assertEquals(await hintOf(off.body.id, 0.2), undefined);
  },
});

Deno.test("E2: the model's answer is read as a verdict only when it is one", async () => {
  const config = { url: "http://model", model: "m", timeoutMs: 1000 };
  const answering = (content: string): typeof fetch => () => Promise.resolve(Response.json({ message: { content } }));
  assertEquals((await moderator.askModerator("x", config, answering('{"verdict":"PUBLISH","reason":"ok"}')))?.verdict, "publish");
  assertEquals((await moderator.askModerator("x", config, answering('{"verdict":"maybe"}')))?.verdict, "unsure");
  assertEquals((await moderator.askModerator("x", config, answering("not json")))?.verdict, "unsure");
  assertEquals(await moderator.askModerator("x", config, () => Promise.resolve(new Response("", { status: 500 }))), null);
  assertEquals(await moderator.askModerator("x", null), null);
});

Deno.test("E2b: a reason that carries an escape or a bidi mark is kept empty, the verdict stays", async () => {
  const config = { url: "http://model", model: "m", timeoutMs: 1000 };
  const answering = (reason: string): typeof fetch => () =>
    Promise.resolve(Response.json({ message: { content: JSON.stringify({ verdict: "reject", reason }) } }));
  for (const reason of ["\u001b[31mred", "link ‮txt.exe", "a​b"]) {
    const hint = await moderator.askModerator("x", config, answering(reason));
    assertEquals([hint?.verdict, hint?.reason], ["reject", ""], JSON.stringify(reason));
  }
  assertEquals((await moderator.askModerator("x", config, answering("a link")))?.reason, "a link");
});

Deno.test({ name: "E2b: no more than MODERATOR_CONCURRENCY questions are in flight; one over gets no hint", sanitizeOps: false, sanitizeResources: false }, async () => {
  const config = { url: "http://model", model: "m", timeoutMs: 5000 };
  let started = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow: typeof fetch = async () => {
    started++;
    await gate;
    return Response.json({ message: { content: '{"verdict":"reject","reason":"x"}' } });
  };
  // Ids of no phrase: the hint's row is not written, the counting is the point.
  const asking = Array.from({ length: 5 }, () => moderator.hintQueuedPhrase(crypto.randomUUID(), "x", config, slow));
  await new Promise((r) => setTimeout(r, 50));
  assertEquals(started, moderator.moderatorConcurrency(), "more questions went to the model than the limit");
  release();
  const answers = await Promise.all(asking);
  assertEquals(answers.filter((a) => a === null).length, 5 - moderator.moderatorConcurrency(), "the ones over the limit were not dropped");
  // The limit frees up once the answers are in.
  assertEquals((await moderator.hintQueuedPhrase(crypto.randomUUID(), "x", config, slow))?.verdict, "reject");
});

// VF4 · whatever the model says, the phrase stays in the person's queue: a
// publish or an unsure hint must not publish it either. The row is read after
// the hint landed and a while later, so a write that follows the hint (and
// whose failure the hint path would swallow) is seen in the row itself.
for (const [verdict, answer] of [
  ["publish", '{"verdict":"publish","reason":"fine"}'],
  ["unsure", "no verdict here"],
  ["reject", '{"verdict":"reject","reason":"a link"}'],
] as const) {
  Deno.test({
    name: `VF4: a ${verdict} hint leaves the phrase in the person's queue`,
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
      Deno.env.set("MODERATOR_URL", MODEL_URL);
      try {
        reply = answer;
        const said = await (await author())(`www.example-${verdict}.org`);
        assertEquals(said.status, 202, JSON.stringify(said.body));
        assertEquals((await hintOf(said.body.id))?.verdict, verdict, `the ${verdict} hint did not land`);
        await new Promise((r) => setTimeout(r, 500));
        const [row] = await database.queryOrThrow<{ visible_at: Date | null; expires_at: Date | null }>(
          `SELECT visible_at, expires_at FROM feed_messages WHERE id = $1`, [said.body.id],
        );
        assert(row, `the phrase is gone after a ${verdict} hint`);
        assertEquals([row.visible_at, row.expires_at], [null, null], `a ${verdict} hint took the phrase out of the person's queue`);
      } finally {
        Deno.env.delete("MODERATOR_URL");
      }
    },
  });
}

Deno.test({ name: "E2: the stand-in model stops", sanitizeOps: false, sanitizeResources: false, fn: () => model.shutdown() });
