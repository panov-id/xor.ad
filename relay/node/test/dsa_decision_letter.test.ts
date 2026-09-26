// The notifier's letter about the decision (Article 16(5); db/058; B22,
// 2026-09-26), against a real database. It went once from the decision route
// and its result was thrown away, so a refused letter left no trace and nothing
// sent it again. Now the notice says whether it left, keeps the text it quotes,
// and the standing DSA_NOTICE_NOTIFY pass sends it again from that text.
import { assert, assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}

const SECRET = "dsa-decision-letter-secret";
Deno.env.set("STORAGE_TRANSPORT", "fs");
Deno.env.set("STORAGE_DIR", await Deno.makeTempDir());
Deno.env.set("SESSION_SECRET", SECRET);
Deno.env.set("NODE_ENV_NAME", "test");
// Resend with a key for alpha, and a provider this file answers for: down, or up.
Deno.env.set("MAIL_TRANSPORT", "resend");
Deno.env.set("RESEND_KEYS", JSON.stringify({ alpha: "re_test_alpha" }));
Deno.env.set("BRANDS", JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]));

let providerUp = false;
const letters: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.resend.com/")) {
    if (!providerUp) return new Response("down", { status: 500 });
    letters.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ id: "stub" }), { status: 200 });
  }
  return await realFetch(input as Request, init);
}) as typeof fetch;

const { config } = await import("../src/config.ts");
const { match } = await import("../src/lib/router.ts");
const { sign } = await import("../src/lib/jwt.ts");
const { queryOrThrow } = await import("../src/lib/db.ts");
const { scopedForBrand } = await import("../src/lib/scoped_storage.ts");
const { sha256hex } = await import("../src/lib/hash.ts");
const { usersDir } = await import("../src/lib/auth.ts");
const { render } = await import("../src/lib/metrics.ts");
const { retryDecisionLetters } = await import("../src/lib/notice_notify.ts");
await import("../src/routes/dsa.ts");

const pool = { sanitizeOps: false, sanitizeResources: false };
const failedCount = () => Number(render().match(/relay_dsa_decision_letter_total\{result="failed"\} (\d+)/)?.[1] ?? 0);

// The platform's administrator, as database.test.ts signs one in.
async function decide(id: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const email = "admin@platform.test";
  await scopedForBrand(null).put(`${usersDir()}/${await sha256hex(email)}.json`, {
    email, role: "admin", brand: null, created_at: "2026-09-15T00:00:00.000Z",
  });
  const token = await sign({ sub: email, role: "admin", brand: null, env: config.envName, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  const url = new URL(`https://relay.test/admin/dsa-notices/${id}/decide`);
  const found = match("POST", url.pathname);
  assert(found, "no decision route");
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

async function notice(): Promise<string> {
  const [row] = await queryOrThrow<{ id: string }>(
    `INSERT INTO dsa_notices (brand, target_kind, target_id, reason_text, bona_fide, notifier_email, snapshot)
     VALUES ('alpha', 'other', NULL, 'unlawful', true, 'notifier@example.test', '{"text":"x"}'::jsonb)
     RETURNING id`);
  return row.id;
}
const rowOf = async (id: string) => (await queryOrThrow<{ decision_sent_at: Date | null; decision_letter_facts: string | null; decision_attempts: number }>(
  `SELECT decision_sent_at, decision_letter_facts, decision_attempts FROM dsa_notices WHERE id = $1`, [id]))[0];

Deno.test({ name: "a refused decision letter leaves the notice unmarked, and the retry sends it from the kept text", ...pool, async fn() {
  const id = await notice();
  const facts = `Не нашли нарушения ${crypto.randomUUID().slice(0, 8)}`;
  providerUp = false;
  const before = failedCount();
  const decided = await decide(id, { decision: "rejected", facts });
  assertEquals(decided.status, 200, JSON.stringify(decided.body));

  const refused = await rowOf(id);
  assertEquals(refused.decision_sent_at, null, "a refused letter was marked as sent");
  assertEquals(refused.decision_letter_facts, facts, "the rejection kept no text to send again");
  assertEquals(failedCount() - before, 1, "the refused letter was not counted as failed");

  // The provider is back; the decision is past the grace the route is given.
  providerUp = true;
  await queryOrThrow(`UPDATE dsa_notices SET decided_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
  const pass = await retryDecisionLetters();
  assert(pass.sent >= 1, `the retry sent nothing: ${JSON.stringify(pass)}`);
  const sent = await rowOf(id);
  assert(sent.decision_sent_at, "the retry sent the letter and did not mark it");
  assertEquals(sent.decision_attempts, 1, "the retry did not count its attempt");
  assert(letters.some((l) => l.includes(facts) && l.includes("notifier@example.test")),
    "the retried letter does not say what the decision said");

  // Sent is sent: the next pass leaves it alone.
  letters.length = 0;
  await retryDecisionLetters();
  assert(!letters.some((l) => l.includes(facts)), "a sent decision letter went out again");
}});

Deno.test({ name: "a decision letter that leaves at once is marked at the decision", ...pool, async fn() {
  const id = await notice();
  providerUp = true;
  const decided = await decide(id, { decision: "rejected", facts: "Оставлено: нарушения нет" });
  assertEquals(decided.status, 200, JSON.stringify(decided.body));
  assert((await rowOf(id)).decision_sent_at, "a letter that left was not marked as sent");
}});
