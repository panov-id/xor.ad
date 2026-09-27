// E2b · the node together with the real moderator model, end to end: a phrase
// the rules queue answers 202 and, a few seconds later, the model's own verdict
// lies beside it in moderator_hints. Only with MODERATOR_URL set — the stand is
// relay/moderator/run-live.sh (the model on an internal network, a throwaway
// database); the database suite runs without it and skips this file.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through relay/moderator/run-live.sh");
}
const live = Boolean(Deno.env.get("MODERATOR_URL"));

Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", "moderator-live-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "moderator-live-origin");
Deno.env.set("VAULT_SHARE_KEY", "moderator-live-vault");
Deno.env.set("MODERATOR_TIMEOUT_MS", "300000");
Deno.env.delete("FEED_VERDICT");
Deno.env.set("BRANDS", JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]));

Deno.test({
  name: "E2b: a phrase the rules queue gets the real model's verdict in moderator_hints",
  ignore: !live,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const { match } = await import("../src/lib/router.ts");
    const database = await import("../src/lib/db.ts");
    const auth = await import("../src/lib/identity_auth.ts");
    const moderator = await import("../src/lib/moderator.ts");
    await import("../src/routes/identity.ts");
    await import("../src/routes/feed.ts");

    const KEY_ID = "ak_pub_moderatorlive00001";
    await database.queryOrThrow(
      `INSERT INTO brands (key, name, domain, sender, upper) VALUES ('alpha', 'Alpha', 'alpha.test', 'a <a@alpha.test>', 'ALPHA') ON CONFLICT (key) DO NOTHING`,
    );
    await database.queryOrThrow(`INSERT INTO api_keys (id, brand, origins) VALUES ($1, 'alpha', '{}') ON CONFLICT (id) DO NOTHING`, [KEY_ID]);

    const call = async (method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) => {
      const url = new URL(`https://relay.test${path}`);
      const found = match(method, url.pathname)!;
      const raw = init.body === undefined ? undefined : JSON.stringify(init.body);
      const response = await found.h({
        req: new Request(url, {
          method,
          headers: {
            "x-protocol-version": String(auth.PROTOCOL_MAJOR),
            "x-origin-token": "moderator-live-origin",
            "x-client-ip": `192.0.2.${Math.floor(Math.random() * 250) + 1}`,
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
    };
    const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const signed = async (sessionId: string, method: string, path: string, body?: unknown) => {
      const raw = body === undefined ? new Uint8Array() : new TextEncoder().encode(JSON.stringify(body));
      const time = Math.floor(Date.now() / 1000);
      const target = new URL(`https://relay.test${path}`);
      const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target), await auth.sha256hex(raw), time);
      const signature = new Uint8Array(await crypto.subtle.sign(SIGN, pair.privateKey, new TextEncoder().encode(payload)));
      return await call(method, path, {
        body,
        headers: { "x-identity-session": sessionId, "x-identity-time": String(time), "x-identity-sign": auth.bytesToBase64url(signature) },
      });
    };
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const made = await call("POST", "/identities", {
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
    assertEquals(made.status, 200, JSON.stringify(made.body));
    const session = made.body.session_id as string;
    assertEquals((await signed(session, "POST", "/recovery/confirm", {
      recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
    })).status, 204);

    const said = await signed(session, "POST", "/feed", {
      text: "заходите на https://example.com/party", mode: "alone", lat: 41.9, lon: 12.5, area_radius: 1000,
    });
    assertEquals(said.status, 202, JSON.stringify(said.body));

    // The model on a CPU: the first answer loads it, so the wait is long.
    let row: { verdict: string; model: string; ms: number } | undefined;
    const until = Date.now() + 300_000;
    while (!row && Date.now() < until) {
      [row] = await database.queryOrThrow<{ verdict: string; model: string; ms: number }>(
        `SELECT verdict, model, ms FROM moderator_hints WHERE feed_message_id = $1`, [said.body.id],
      );
      if (!row) await new Promise((r) => setTimeout(r, 500));
    }
    assert(row, "the real model's hint never landed in moderator_hints");
    assertEquals(row.verdict, "reject", "the real model let a plain link through");
    assertEquals(row.model, moderator.MODERATOR_MODEL_DEFAULT);
    assert(row.ms > 0);
    const [queued] = await database.queryOrThrow<{ visible_at: Date | null }>(`SELECT visible_at FROM feed_messages WHERE id = $1`, [said.body.id]);
    assertEquals(queued?.visible_at, null, "the model's verdict took the phrase out of the person's queue");
    console.log(`     hint: ${row.verdict}, ${row.model}, ${row.ms} ms`);
  },
});
