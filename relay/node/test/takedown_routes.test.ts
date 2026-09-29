// Two writing routes behind a take-down in flight (open.tsv
// takedown.routes.nostillhere, takedown.frozen.untested; P9, 2026-09-30).
//
// The tenth PIN miss locks the session's share, freezes it and takes down
// what is live (takeDownLive) while holding the counters rows. A take-back of
// a like and DELETE /feed/:id that passed the guard before that commit wait on
// those rows; once they commit, the request must not answer as if the session
// were live, and nothing the take-down removed may come back.
//
// The take-down here is the real takeDownLive, run on a second connection
// whose commit is held until the route is seen queued on it (pg_stat_activity).

import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

Deno.env.set("SESSION_SECRET", "takedown-routes-secret");
Deno.env.set("NODE_ENV_NAME", "test");
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("ORIGIN_TOKEN", "takedown-routes-origin-token");
Deno.env.set("VAULT_SHARE_KEY", "takedown-routes-vault-key");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const postgres = (await import("npm:postgres@3.4.4")).default;
const { match } = await import("../src/lib/router.ts");
const database = await import("../src/lib/db.ts");
const auth = await import("../src/lib/identity_auth.ts");
const { takeDownLive, stillHere } = await import("../src/lib/take_down.ts");
await import("../src/routes/identity.ts");
await import("../src/routes/likes.ts");
await import("../src/routes/feed.ts");

const KEY_ID = "ak_pub_takedownroutes001";
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
const nextAddress = () => `203.0.113.${++addresses % 250}`;
const b64 = (bytes: Uint8Array) => auth.bytesToBase64url(bytes);

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
        "x-origin-token": "takedown-routes-origin-token",
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
  const payload = auth.signedPayload(method, auth.signedAuthority(target), auth.signedPath(target),
    await auth.sha256hex(raw), time);
  const signature = new Uint8Array(await crypto.subtle.sign(SIGN, key, new TextEncoder().encode(payload)));
  return await call(method, path, {
    body,
    headers: {
      "x-identity-session": sessionId,
      "x-identity-time": String(time),
      "x-identity-sign": b64(signature),
    },
  });
}

async function person() {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const answer = await call("POST", "/identities", {
    headers: { "x-api-key": KEY_ID },
    body: {
      sign_pub: b64(spki),
      wrap_pub: b64(crypto.getRandomValues(new Uint8Array(91))),
      name: "Аня",
      age: 30,
      auth_hash: await auth.sha256hex(crypto.getRandomValues(new Uint8Array(32))),
      share: b64(crypto.getRandomValues(new Uint8Array(32))),
      recovery_lookup_id: crypto.randomUUID(),
    },
  });
  assertEquals(answer.status, 200, `the registration failed: ${JSON.stringify(answer.body)}`);
  const created = answer.body as { identity_id: string; session_id: string };
  const confirmed = await signedCall(pair.privateKey, created.session_id, "POST", "/recovery/confirm", {
    recovery_wrapped_key: b64(crypto.getRandomValues(new Uint8Array(48))),
  });
  assertEquals(confirmed.status, 204);
  return { ...created, key: pair.privateKey };
}

async function phrase(author: string): Promise<string> {
  const id = crypto.randomUUID();
  await database.queryOrThrow(
    `INSERT INTO feed_messages
       (id, brand, author_identity, text, mode, lang, lat, lon, area_radius,
        lat_published, lon_published, visible_at, expires_at)
     VALUES ($1, 'alpha', $2, 'фраза', 'alone', 'und', 60.17, 24.94, 1000, 60.17, 24.94,
             now() - interval '1 hour', now() + interval '3 hours')`,
    [id, author],
  );
  return id;
}

// A like as likes.ts writes it: the row, the phrase's count, both counters.
async function like(liker: string, phraseId: string, author: string): Promise<void> {
  await database.transaction(async (run) => {
    await run(`INSERT INTO likes (liker_identity, feed_message_id) VALUES ($1, $2)`, [liker, phraseId]);
    await run(`UPDATE feed_messages SET like_count = like_count + 1 WHERE id = $1`, [phraseId]);
    await run(`UPDATE identity_stats SET likes_received = likes_received + 1 WHERE identity = $1`, [author]);
    await run(`UPDATE identity_stats SET likes_given = likes_given + 1 WHERE identity = $1`, [liker]);
  });
}

type Tx = { unsafe: (q: string, args?: unknown[]) => Promise<unknown> };

async function waitingOn(tx: Tx, what: string): Promise<string> {
  const [{ p }] = await tx.unsafe(`SELECT pg_backend_pid() AS p`) as { p: number }[];
  for (let i = 0; i < 250; i++) {
    await tx.unsafe(`SELECT pg_stat_clear_snapshot()`);
    const rows = await tx.unsafe(
      `SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))`, [p],
    ) as { query: string }[];
    if (rows.length > 0) return rows[0].query.replace(/\s+/g, " ").slice(0, 160);
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`${what}: nothing queued on the take-down after five seconds — the case never ran`);
}

// The tenth miss's work on a second connection: the session's entry closed
// (`how`), then the real takeDownLive; the request is sent while it holds its
// locks, and the commit waits until the request is queued on them.
async function behindTakeDown(
  me: { identity_id: string; session_id: string },
  how: "share_locked" | "frozen",
  send: () => Promise<{ status: number; body: unknown }>,
) {
  const sql = postgres(Deno.env.get("DATABASE_URL")!, { max: 1, onnotice: () => {} });
  let pending: Promise<{ status: number; body: unknown }> | null = null;
  let waited = "";
  try {
    // deno-lint-ignore no-explicit-any
    await sql.begin(async (tx: any) => {
      if (how === "share_locked") {
        await tx.unsafe(`UPDATE vault_shares SET attempts_left = 0, locked_at = now() WHERE session = $1`, [me.session_id]);
      } else {
        await tx.unsafe(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
      }
      // deno-lint-ignore no-explicit-any
      await takeDownLive((async (text: string, args?: unknown[]) => await tx.unsafe(text, args ?? [])) as any, me.identity_id);
      pending = send();
      waited = await waitingOn(tx, how);
    });
  } finally {
    await sql.end();
  }
  // Answered after the take-down's commit, which is what releases the wait.
  assert(pending, "the request was never sent");
  const answer = await (pending as Promise<{ status: number; body: unknown }>);
  return { answer, waited };
}

const pooled = { sanitizeOps: false, sanitizeResources: false };

const liked = async (liker: string, id: string) =>
  (await database.queryOrThrow(`SELECT 1 FROM likes WHERE liker_identity = $1 AND feed_message_id = $2`,
    [liker, id])).length === 1;
const likeCount = async (id: string) => Number((await database.queryOrThrow<{ n: number }>(
  `SELECT like_count AS n FROM feed_messages WHERE id = $1`, [id]))[0].n);
const given = async (id: string) => Number((await database.queryOrThrow<{ n: number }>(
  `SELECT likes_given AS n FROM identity_stats WHERE identity = $1`, [id]))[0].n);
const exists = async (id: string) =>
  (await database.queryOrThrow(`SELECT 1 FROM feed_messages WHERE id = $1`, [id])).length === 1;

// The send is held until the transaction above is queued; `send` itself must
// not await before the route's first lock, so it is started inside.
for (const how of ["share_locked", "frozen"] as const) {
  Deno.test({ name: `a take-back of a like behind the tenth miss's take-down answers 401 (${how})`, ...pooled }, async () => {
    const me = await person();
    const other = await person();
    const theirs = await phrase(other.identity_id);
    await like(me.identity_id, theirs, other.identity_id);

    const { answer, waited } = await behindTakeDown(me, how,
      () => signedCall(me.key, me.session_id, "DELETE", `/feed/${theirs}/like`));
    assert(/identity_stats|advisory/.test(waited), `the take-back waited on something else: ${waited}`);
    assertEquals(answer.status, 401,
      `${how}: the take-back behind the take-down answered ${answer.status} ${JSON.stringify(answer.body)} — a session whose entry was just closed was served as live`);
    assertEquals(await liked(me.identity_id, theirs), false, `${how}: the like came back`);
    assertEquals(await likeCount(theirs), 0, `${how}: the phrase's like count moved`);
    assertEquals(await given(me.identity_id), 0, `${how}: likes_given moved`);
  });
}

Deno.test({ name: "DELETE /feed/:id behind the tenth miss's take-down answers 404 and writes nothing", ...pooled }, async () => {
  const me = await person();
  const mine = await phrase(me.identity_id);
  const { answer, waited } = await behindTakeDown(me, "share_locked",
    () => signedCall(me.key, me.session_id, "DELETE", `/feed/${mine}`));
  assert(/feed_messages/.test(waited), `the take-down route waited on something else: ${waited}`);
  assertEquals(answer.status, 404,
    `DELETE /feed/:id behind the take-down answered ${answer.status} ${JSON.stringify(answer.body)}, not 404`);
  assertEquals(await exists(mine), false, "the phrase the take-down removed is back");
});

// The frozen_at branch of stillHere on its own, with its control: the same
// session unfrozen is live, frozen it is closed while its share stays open.
Deno.test({ name: "stillHere closes a frozen session whose share is not locked", ...pooled }, async () => {
  const me = await person();
  const live = await database.transaction((run) => stillHere(run, me.identity_id, me.session_id));
  assertEquals(live, null, "control: an unfrozen session with an open share is not live");
  await database.queryOrThrow(`UPDATE sessions SET frozen_at = now(), frozen_reason = 'pin_limit' WHERE id = $1`, [me.session_id]);
  const [share] = await database.queryOrThrow<{ locked: boolean }>(
    `SELECT locked_at IS NOT NULL AS locked FROM vault_shares WHERE session = $1`, [me.session_id]);
  assertEquals(share.locked, false, "the share is locked: the case would not isolate frozen_at");
  const frozen = await database.transaction((run) => stillHere(run, me.identity_id, me.session_id));
  assertEquals(frozen, { closed: true, awayUntil: null }, "a frozen session was answered as live by stillHere");
});

addEventListener("unload", () => {
  database.closePool();
});
