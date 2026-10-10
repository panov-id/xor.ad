// The first-tier moderator model (lib/moderator.ts): with MODERATOR_URL on it
// decides every phrase and every new name (W17-MM, WP-4; owner 09.10.2026 —
// nobody else reads them): publish puts it out, anything else is a refusal
// with its reason, and only the model's reject counts towards the pause.
// With it off, the rules decide. Nothing waits for a person.
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
await import("../src/routes/profile.ts");

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
  return {
    id: created.identity_id,
    say: (text: string) =>
      signedCall(pair.privateKey, created.session_id, "POST", "/feed", { text, mode: "alone", lat: 41.9, lon: 12.5, area_radius: 1000 }),
    rename: (name: string) => signedCall(pair.privateKey, created.session_id, "PATCH", "/identities/me", { name }),
  };
}

const rowOf = async (id: string) =>
  (await database.queryOrThrow<{ visible_at: Date | null }>(`SELECT visible_at FROM feed_messages WHERE id = $1`, [id]))[0];
// The refusals that count towards the pause of §8.3 (identity_stats).
const refusals = async (identity: string) =>
  (await database.queryOrThrow<{ n: number }>(
    `SELECT coalesce(cardinality(rejected_at_recent), 0) AS n FROM identity_stats WHERE identity = $1`, [identity],
  ))[0]?.n ?? 0;
const nameOf = async (identity: string) =>
  (await database.queryOrThrow<{ name: string; name_state: string; name_pending: string | null }>(
    `SELECT name, name_state, name_pending FROM identities WHERE id = $1`, [identity],
  ))[0];
async function withModel<T>(url: string, step: () => Promise<T>): Promise<T> {
  Deno.env.set("MODERATOR_URL", url);
  try {
    return await step();
  } finally {
    Deno.env.delete("MODERATOR_URL");
  }
}

// WP-4 (owner, 09.10.2026): nobody but the model reads a phrase. With the
// model on it decides every phrase, flagged by the rules or not: publish puts
// it out, reject refuses it with the model's reason and counts towards the
// pause, unsure refuses it too but without the moment. Nothing waits.
Deno.test({
  name: "WP-4: the model decides a phrase the rules flagged and one they did not; nothing waits for a person",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await withModel(MODEL_URL, async () => {
      asked.length = 0;
      reply = '{"verdict":"reject","reason":"a link"}';
      const a = await author();
      const link = await a.say("заходите на https://example.com/party");
      assertEquals(link.status, 422, JSON.stringify(link.body));
      assertEquals(link.body.error.code, "moderation_refused");
      assertEquals(link.body.error.message, "a link", "the model's reason did not reach the author");
      assertEquals(asked, ["заходите на https://example.com/party"], "the model was not asked the phrase itself");
      assertEquals(await refusals(a.id), 1, "the model's reject did not count towards the pause");

      // A crude phrase is clean by the rules; the model refuses it (W17-MM).
      const crude = await (await author()).say("все соседи с третьего этажа тупые уроды");
      assertEquals(crude.status, 422, `a crude phrase went out: ${JSON.stringify(crude.body)}`);

      // The model may publish what the rules flagged: it reads, they match.
      reply = '{"verdict":"publish","reason":"fine"}';
      const offer = await (await author()).say("отдам кресло, пишите в тг");
      assertEquals(offer.status, 200, `the model's publish did not put it out: ${JSON.stringify(offer.body)}`);
      assert((await rowOf(offer.body.id))?.visible_at, "a phrase the model published is not in the feed");

      // An answer that is no verdict: refused, closed — and no moment.
      reply = "I think it is fine";
      const u = await author();
      const unsure = await u.say("пиши в тг, расскажу");
      assertEquals(unsure.status, 422, JSON.stringify(unsure.body));
      assertEquals(await refusals(u.id), 0, "an unsure model counted against the author");
    });
  },
});

Deno.test({
  name: "WP-4: a dead model refuses without a moment; with no model the rules publish what is clean and refuse what they flag",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Nothing listens on this port.
    await withModel("http://127.0.0.1:9", async () => {
      const a = await author();
      const dead = await a.say("иду гулять в парк");
      assertEquals(dead.status, 422, "with the model dead a phrase went out unread");
      assertEquals(dead.body.error.message, "the moderator could not read the phrase; try again later");
      assertEquals(await rowOf(dead.body.id ?? "00000000-0000-0000-0000-000000000000"), undefined);
      assertEquals(await refusals(a.id), 0, "a dead model counted against the author");
    });
    asked.length = 0;
    const clean = await (await author()).say("кто на каток вечером?");
    assertEquals(clean.status, 200, "with no model the rules no longer published a clean phrase");
    const b = await author();
    const flagged = await b.say("www.example.org");
    assertEquals(flagged.status, 422, JSON.stringify(flagged.body));
    assertEquals(flagged.body.error.message, "the phrase was not published: link");
    assertEquals(await refusals(b.id), 1);
    assertEquals(asked.length, 0, "the model was asked with the flag off");
  },
});

// WP-4 for names: decided when they change, by the model when it is on, by
// the rules when it is not. Refused, the old name stands — nothing pending.
Deno.test({
  name: "WP-4: a new name is the model's to decide — publish is the name, anything else a refusal, and the old name stands",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await withModel(MODEL_URL, async () => {
      const a = await author();
      reply = '{"verdict":"publish","reason":"fine"}';
      asked.length = 0;
      const ok = await a.rename("пиши в тг");
      assertEquals(ok.status, 200, JSON.stringify(ok.body));
      assertEquals(asked, ["пиши в тг"], "the model was not asked the name");
      assertEquals(await nameOf(a.id), { name: "пиши в тг", name_state: "accepted", name_pending: null });

      reply = '{"verdict":"reject","reason":"a messenger"}';
      const no = await a.rename("Оля");
      assertEquals(no.status, 422, JSON.stringify(no.body));
      assertEquals(no.body.error.code, "name_refused");
      assertEquals(no.body.error.message, "a messenger");
      assertEquals(await nameOf(a.id), { name: "пиши в тг", name_state: "accepted", name_pending: null });

      reply = "no verdict";
      assertEquals((await a.rename("Оля")).status, 422);
    });
    await withModel("http://127.0.0.1:9", async () => {
      assertEquals((await (await author()).rename("Оля")).status, 422, "a dead model let a name through");
    });
    const c = await author();
    assertEquals((await c.rename("Оля")).status, 200, "with no model a clean name was not the name");
    const flagged = await c.rename("пиши в тг");
    assertEquals(flagged.status, 422);
    assertEquals(flagged.body.error.message, "the name was not accepted: contact");
    assertEquals(await nameOf(c.id), { name: "Оля", name_state: "accepted", name_pending: null });
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
// The stand-in model stops with the process, not in a test of its own: under
// --shuffle that test ran before the hints and left them no model (W16-SF1).
globalThis.addEventListener("unload", () => void model.shutdown());
