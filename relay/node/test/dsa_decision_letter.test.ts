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

// The letter's last try, the wait between tries, and a notice with no text to
// send (review panel G1, G3; B46, 2026-09-26).
const resultCount = (result: string) =>
  Number(render().match(new RegExp(`relay_dsa_decision_letter_total\\{result="${result}"\\} (\\d+)`))?.[1] ?? 0);
const { MAX_ATTEMPTS } = await import("../src/lib/notice_notify.ts");

async function refusedDecision(): Promise<string> {
  const id = await notice();
  providerUp = false;
  const decided = await decide(id, { decision: "rejected", facts: `Отказ ${crypto.randomUUID().slice(0, 8)}` });
  assertEquals(decided.status, 200, JSON.stringify(decided.body));
  await queryOrThrow(`UPDATE dsa_notices SET decided_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
  return id;
}
const waitOf = async (id: string) => (await queryOrThrow<{ minutes: number }>(
  `SELECT round(extract(epoch FROM decision_leased_until - now()) / 60)::int AS minutes FROM dsa_notices WHERE id = $1`, [id]))[0].minutes;

Deno.test({ name: "the waits between tries of a decision letter double", ...pool, async fn() {
  const id = await refusedDecision();
  await retryDecisionLetters();
  assertEquals((await rowOf(id)).decision_attempts, 1);
  assertEquals(await waitOf(id), 10, "the first failed try did not wait ten minutes");
  await queryOrThrow(`UPDATE dsa_notices SET decision_attempts = 2, decision_leased_until = now() WHERE id = $1`, [id]);
  await retryDecisionLetters();
  assertEquals((await rowOf(id)).decision_attempts, 3);
  assertEquals(await waitOf(id), 40, "the third failed try did not wait forty minutes");
}});

Deno.test({ name: "the last try of a decision letter is counted as given up and not tried again", ...pool, async fn() {
  const id = await refusedDecision();
  await queryOrThrow(`UPDATE dsa_notices SET decision_attempts = $2 WHERE id = $1`, [id, MAX_ATTEMPTS - 1]);
  const before = resultCount("exhausted");
  const pass = await retryDecisionLetters();
  assert(pass.exhausted >= 1, `the last try was not counted as given up: ${JSON.stringify(pass)}`);
  assertEquals(resultCount("exhausted") - before, pass.exhausted, "the metric does not say what the pass gave up");
  assertEquals((await rowOf(id)).decision_attempts, MAX_ATTEMPTS);
  // Given up is given up, even with the provider back and the wait over.
  providerUp = true;
  letters.length = 0;
  await queryOrThrow(`UPDATE dsa_notices SET decision_leased_until = now() WHERE id = $1`, [id]);
  await retryDecisionLetters();
  assertEquals((await rowOf(id)).decision_sent_at, null, "a given-up letter was tried again");
}});

Deno.test({ name: "a decision with no text to send again is counted as given up at once", ...pool, async fn() {
  // Decided in the db/058 window: the old code wrote the decision, not the letter's text.
  const id = await notice();
  await queryOrThrow(
    `UPDATE dsa_notices SET status = 'rejected', decided_at = now() - interval '1 hour', decision_letter_facts = NULL WHERE id = $1`, [id]);
  providerUp = true;
  const before = resultCount("exhausted");
  const pass = await retryDecisionLetters();
  assert(pass.exhausted >= 1, `the textless decision was not counted: ${JSON.stringify(pass)}`);
  assertEquals((await rowOf(id)).decision_attempts, MAX_ATTEMPTS, "the textless decision is still waiting to be tried");
  assert(resultCount("exhausted") - before >= 1, "the textless decision did not reach the metric");
}});

// A letter that left and whose mark could not be written (review panel G5,
// B47): the next pass sends it again — at least once is the design — but the
// failed mark is counted and logged, not silent. The write is made to fail by
// a trigger on this one notice.
Deno.test({ name: "a decision letter that left with its mark unwritten is counted, not silent", ...pool, async fn() {
  const id = await notice();
  await queryOrThrow(`
    CREATE OR REPLACE FUNCTION b47_refuse_mark() RETURNS trigger AS $$
    BEGIN
      IF NEW.decision_sent_at IS NOT NULL AND OLD.decision_sent_at IS NULL AND NEW.id = '${id}' THEN
        RAISE EXCEPTION 'mark refused for the test';
      END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await queryOrThrow(`CREATE TRIGGER b47_refuse_mark BEFORE UPDATE ON dsa_notices FOR EACH ROW EXECUTE FUNCTION b47_refuse_mark()`);
  try {
    providerUp = true;
    letters.length = 0;
    const before = Number(render().match(/relay_dsa_letter_mark_failed_total\{letter="decision"\} (\d+)/)?.[1] ?? 0);
    const decided = await decide(id, { decision: "rejected", facts: "Отметка не запишется" });
    assertEquals(decided.status, 200, JSON.stringify(decided.body));
    assert(letters.some((l) => l.includes("Отметка не запишется")), "the letter did not leave");
    assertEquals((await rowOf(id)).decision_sent_at, null, "the refused mark was written anyway");
    const after = Number(render().match(/relay_dsa_letter_mark_failed_total\{letter="decision"\} (\d+)/)?.[1] ?? 0);
    assertEquals(after - before, 1, "a mark that failed was not counted");
  } finally {
    await queryOrThrow(`DROP TRIGGER IF EXISTS b47_refuse_mark ON dsa_notices`);
    await queryOrThrow(`DROP FUNCTION IF EXISTS b47_refuse_mark()`);
  }
}});

// The trace a given-up letter leaves (review panel 3, O2 and O3; B63,
// 2026-09-26): a gauge read from the rows at scrape time, up for as long as the
// letter stays unsent. The counter above lives in one process and says nothing
// about a node that died after leasing the last try.
const { collectQueueMetrics } = await import("../src/lib/queue_metrics.ts");
async function givenUp(): Promise<number> {
  await collectQueueMetrics();
  const line = render().split("\n").find((l) => l.startsWith("relay_dsa_decision_letters_given_up "));
  assert(line, "relay_dsa_decision_letters_given_up is not on /metrics");
  return Number(line.split(" ").pop());
}

Deno.test({ name: "a decision letter given up stays counted until it is marked sent", ...pool, async fn() {
  const id = await refusedDecision();
  await queryOrThrow(`UPDATE dsa_notices SET decision_attempts = $2 WHERE id = $1`, [id, MAX_ATTEMPTS - 1]);
  const before = await givenUp();
  // The last try, seen while it is in flight: leased, so not given up yet.
  let inFlight: number | null = null;
  await retryDecisionLetters(async () => {
    inFlight = await givenUp();
    return false;
  });
  assertEquals(inFlight, before, "the last try was counted as given up while it was still being sent");
  assertEquals(await givenUp() - before, 1, "the refused last try is not counted as given up");
  // A later pass does not make it go away; the mark does.
  await retryDecisionLetters();
  assertEquals(await givenUp() - before, 1, "the given-up letter left the gauge with the letter still unsent");
  await queryOrThrow(`UPDATE dsa_notices SET decision_sent_at = now() WHERE id = $1`, [id]);
  assertEquals(await givenUp(), before, "a letter marked sent is still counted as given up");
}});

Deno.test({ name: "a node that died holding the last try leaves the letter counted once its lease runs out", ...pool, async fn() {
  const id = await refusedDecision();
  await queryOrThrow(`UPDATE dsa_notices SET decision_attempts = $2 WHERE id = $1`, [id, MAX_ATTEMPTS - 1]);
  const before = await givenUp();
  // The lease of the last try, as the pass takes it. The node then dies before
  // the send, so nothing counts, marks or gives the lease back: the row is put
  // back to what the lease left once the stub has seen it.
  let row: { attempts: number; leased: boolean } | null = null;
  await retryDecisionLetters(async () => {
    row = (await queryOrThrow<{ attempts: number; leased: boolean }>(
      `SELECT decision_attempts AS attempts, decision_leased_until > now() AS leased FROM dsa_notices WHERE id = $1`, [id]))[0];
    return false;
  });
  assertEquals(row, { attempts: MAX_ATTEMPTS, leased: true }, "the pass did not lease the last try the way this case assumes");
  await queryOrThrow(`UPDATE dsa_notices SET decision_leased_until = now() + interval '10 minutes' WHERE id = $1`, [id]);
  assertEquals(await givenUp(), before, "a held lease was counted as given up");
  await queryOrThrow(`UPDATE dsa_notices SET decision_leased_until = now() - interval '1 second' WHERE id = $1`, [id]);
  assertEquals(await givenUp() - before, 1, "the letter the dead node held is in no trace");
  // Nothing sends it again: the gauge is the only trace, and it holds.
  providerUp = true;
  letters.length = 0;
  await retryDecisionLetters();
  assertEquals((await rowOf(id)).decision_sent_at, null);
  assertEquals(await givenUp() - before, 1);
}});

Deno.test({ name: "a decision with no text to send again is counted as given up on the gauge", ...pool, async fn() {
  const id = await notice();
  const before = await givenUp();
  await queryOrThrow(
    `UPDATE dsa_notices SET status = 'rejected', decided_at = now() - interval '1 hour', decision_letter_facts = NULL WHERE id = $1`, [id]);
  await retryDecisionLetters();
  assertEquals(await givenUp() - before, 1, "the textless decision is not on the gauge");
}});
