// The sweeper of the likes on offers left behind (lib/offer_settle_sweeper.ts,
// open.tsv offer.match.settle.retry, W13-OR): a name accepted whose settlement
// never ran — the process died after the verdict's commit, or the settlement
// failed in its catch — leaves a like that both names now allow. The harness
// is offer_match.test.ts's: people through the routes, offers seeded live.

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const storageDir = await Deno.makeTempDir();
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", storageDir);
Deno.env.set("SESSION_SECRET", "offer-sweep-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "offer-sweep-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "offer-sweep-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { sweepOfferLikes } = await import("../src/lib/offer_settle_sweeper.ts");
const { reset } = await import("../src/lib/rate_limit.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/likes.ts");

const KEY_ID = "ak_pub_offersweeptest001";
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
        "x-origin-token": "offer-sweep-origin-token",
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

async function signedCall(who: Person, method: string, path: string, body?: unknown) {
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
  const confirmed = await signedCall({ ...created, pair }, "POST", "/recovery/confirm", {
    recovery_wrapped_key: auth.bytesToBase64url(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, pair };
}

// A live phrase as the feed leaves it; with a discount it is a neighbour's offer.
async function seed(identity: string, text: string, opts: { discount?: string; mode?: string; hours?: number } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at, discount_value, conditions)
     VALUES ($1, 'xor', $2, $3, $4, 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now(), now() + ($5 || ' hours')::interval, $6, $7)`,
    [id, identity, text, opts.mode ?? "alone", String(opts.hours ?? 3), opts.discount ?? null, opts.discount ? "самовывоз" : null],
  );
  return id;
}
const like = (who: Person, phrase: string) => signedCall(who, "POST", `/feed/${phrase}/like`);
const setName = (identity: string, state: string) =>
  database.queryOrThrow(
    `UPDATE identities SET name_state = $2, name_pending = CASE WHEN $2 = 'pending' THEN 'Анна' END WHERE id = $1`,
    [identity, state],
  );
async function matchOf(a: string, b: string) {
  const { pairKey } = await import("../src/lib/offer_match.ts");
  const rows = await database.queryOrThrow<{ id: string; expires_at: Date }>(
    `SELECT id, expires_at FROM matches WHERE pair_key = $1 AND expires_at > now()`, [await pairKey(a, b)],
  );
  return rows[0] ?? null;
}
const participants = (matchId: string) =>
  database.queryOrThrow<{ identity: string; message_id: string | null; text_snapshot: string | null; mode: string }>(
    `SELECT identity, message_id, text_snapshot, mode FROM match_participants WHERE match_id = $1`, [matchId],
  );
const statMatches = async (identity: string) =>
  Number((await database.queryOrThrow<{ matches: number }>(`SELECT matches FROM identity_stats WHERE identity = $1`, [identity]))[0].matches);

// The settlement that never ran: the name is accepted straight in the table,
// as a verdict's commit leaves it when the process dies before settleAfterVerdict.
Deno.test("a like left behind by a failed settlement becomes its match on the sweeper's pass, once", async () => {
  reset();
  const author = await person();
  const taker = await person();
  await setName(author.identity_id, "pending");
  const offer = await seed(author.identity_id, "отдам стол", { discount: "100%" });
  assertEquals((await like(taker, offer)).body, { state: "liked" });
  assertEquals(await matchOf(author.identity_id, taker.identity_id), null);
  // Nothing to settle while the name waits.
  assertEquals(await sweepOfferLikes(), 0);
  await setName(author.identity_id, "accepted");
  assertEquals(await sweepOfferLikes(), 1, "the sweeper did not settle the like left behind");
  const made = await matchOf(author.identity_id, taker.identity_id);
  assert(made, "no match after the sweeper's pass");
  const rows = Object.fromEntries((await participants(made.id)).map((r) => [r.identity, r]));
  assertEquals(rows[taker.identity_id].message_id, null);
  assertEquals(rows[author.identity_id].message_id, offer);
  assertEquals(await statMatches(author.identity_id), 1);
  // The second pass finds the pair settled and makes nothing.
  assertEquals(await sweepOfferLikes(), 0);
  reset();
});

// The liker's own name, the same way round.
Deno.test("a like whose liker's name passed without a settlement is swept too", async () => {
  reset();
  const author = await person();
  const taker = await person();
  await setName(taker.identity_id, "pending");
  const offer = await seed(author.identity_id, "отдам лампу", { discount: "100%" });
  assertEquals((await like(taker, offer)).body, { state: "liked", name_pending: true });
  await setName(taker.identity_id, "accepted");
  assertEquals(await sweepOfferLikes(), 1);
  assert(await matchOf(author.identity_id, taker.identity_id));
  assertEquals(await sweepOfferLikes(), 0);
  reset();
});

// What stops the match stops the sweeper, and the like stays: a block, a live
// chat of the pair, an expired offer.
Deno.test("a block, a live chat or an expired offer leave the like a like", async () => {
  reset();
  const author = await person();
  const taker = await person();
  await setName(author.identity_id, "pending");
  const offer = await seed(author.identity_id, "отдам полку", { discount: "100%" });
  assertEquals((await like(taker, offer)).body, { state: "liked" });
  await setName(author.identity_id, "accepted");
  await database.queryOrThrow(
    `INSERT INTO blocks (blocker_identity, blocked_identity) VALUES ($1, $2)`, [author.identity_id, taker.identity_id],
  );
  assertEquals(await sweepOfferLikes(), 0, "a match was made over a block");
  await database.queryOrThrow(`DELETE FROM blocks WHERE blocker_identity = $1`, [author.identity_id]);

  const { pairKey } = await import("../src/lib/offer_match.ts");
  const chatId = crypto.randomUUID();
  await database.queryOrThrow(`INSERT INTO chats (id, pair_key) VALUES ($1, $2)`, [chatId, await pairKey(author.identity_id, taker.identity_id)]);
  for (const p of [author, taker]) {
    await database.queryOrThrow(`INSERT INTO chat_participants (chat_id, identity) VALUES ($1, $2)`, [chatId, p.identity_id]);
  }
  assertEquals(await sweepOfferLikes(), 0, "a match was made beside the pair's live chat");
  await database.queryOrThrow(`DELETE FROM chats WHERE id = $1`, [chatId]);

  await database.queryOrThrow(`UPDATE feed_messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, [offer]);
  assertEquals(await sweepOfferLikes(), 0, "a match was made of an expired offer");
  assertEquals(await matchOf(author.identity_id, taker.identity_id), null);
  const [{ n }] = await database.queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM likes WHERE liker_identity = $1 AND feed_message_id = $2`, [taker.identity_id, offer],
  );
  assertEquals(n, 1, "the like did not stay");
  reset();
});
