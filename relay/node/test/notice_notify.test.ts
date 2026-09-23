// Watchdog С2 against a real database: an arrival letter that did not leave is
// retried by a standing job, and after MAX_ATTEMPTS the people named for it are
// told instead; the night path copies every new notice to them at once.
import { assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
// Mail that cannot leave: SMTP to a port nobody listens on, so the arrival
// letter fails in the route the way a provider outage would.
Deno.env.set("MAIL_TRANSPORT", "smtp");
Deno.env.set("MAIL_SMTP_HOST", "127.0.0.1");
Deno.env.set("MAIL_SMTP_PORT", "9");
Deno.env.set("NODE_ENV_NAME", "test");
// Short, so "a provider slower than the pool's idle-in-transaction limit" fits in a test.
Deno.env.set("RELAY_DB_TIMEOUT_MS", "2000");
Deno.env.set(
  "BRANDS",
  JSON.stringify([{ key: "alpha", name: "Alpha", domain: "alpha.test", from: "a <a@alpha.test>" }]),
);

const { queryOrThrow, transaction } = await import("../src/lib/db.ts");
const { reloadConfig } = await import("../src/config.ts");
const { report } = await import("../src/routes/report.ts");
const { DSA_NOTICE_NOTIFY, MAX_ATTEMPTS, retryArrivalLetters, sendNightPathCopies } = await import(
  "../src/lib/notice_notify.ts"
);

await queryOrThrow("SELECT 1");
const pool = { sanitizeOps: false, sanitizeResources: false };

async function file(): Promise<string> {
  const response = await report(
    new Request("https://relay.test/report", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify({
        target_kind: "other",
        reason_text: `[notify ${crypto.randomUUID()}] a report whose letter will not leave`,
        bona_fide: true,
      }),
    }),
  );
  assertEquals(response.status, 202);
  const id = (await response.json()).id;
  // Past the grace the route has to finish its own try.
  await queryOrThrow(`UPDATE dsa_notices SET created_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
  return id;
}

const row = async (id: string) =>
  (await queryOrThrow<{ sent: boolean; attempts: number; escalated: boolean }>(
    `SELECT arrival_sent_at IS NOT NULL AS sent, arrival_attempts AS attempts,
            arrival_escalated_at IS NOT NULL AS escalated
       FROM dsa_notices WHERE id = $1`,
    [id],
  ))[0];

Deno.test({ name: "an arrival letter that did not leave is left for the retry", ...pool }, async () => {
  const id = await file();
  assertEquals((await row(id)).sent, false, "a letter that never left was marked as sent");
});

Deno.test({ name: "the retry sends the letter once, to the support inbox", ...pool }, async () => {
  const id = await file();
  const to: string[] = [];
  const record = (address: string, opts: { id: string | null }) => {
    if (opts.id === id) to.push(address);
    return Promise.resolve(true);
  };
  await retryArrivalLetters(record);
  await retryArrivalLetters(record);
  assertEquals(to, ["support@alpha.test"], "the retry did not send, or sent twice");
  assertEquals((await row(id)).sent, true);
});

Deno.test({ name: "a letter that keeps failing is escalated once, after the last try", ...pool }, async () => {
  const id = await file();
  Deno.env.set("DSA_ESCALATION_EMAILS", "ops@example.org");
  const told: string[] = [];
  const fail = () => Promise.resolve(false);
  const escalate = (_to: string, n: { id: string }) => {
    if (n.id === id) told.push(n.id);
    return Promise.resolve(true);
  };
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await retryArrivalLetters(fail, escalate);
  assertEquals(told.length, 0, "escalated before the last try");
  await retryArrivalLetters(fail, escalate);
  await retryArrivalLetters(fail, escalate);
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  assertEquals(told.length, 1, "the people were not told once and only once");
  assertEquals(await row(id), { sent: false, attempts: MAX_ATTEMPTS, escalated: true });
});

Deno.test({ name: "with nobody to escalate to, the notice keeps being retried", ...pool }, async () => {
  const id = await file();
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  await queryOrThrow(`UPDATE dsa_notices SET arrival_attempts = $2 WHERE id = $1`, [id, MAX_ATTEMPTS]);
  await retryArrivalLetters(() => Promise.resolve(false), () => Promise.resolve(true));
  assertEquals((await row(id)).escalated, false, "marked as escalated with nobody told");
});

Deno.test({ name: "a decided notice needs no arrival letter any more", ...pool }, async () => {
  const id = await file();
  await queryOrThrow(`UPDATE dsa_notices SET status = 'upheld', decided_at = now() WHERE id = $1`, [id]);
  let called = 0;
  await retryArrivalLetters((_to, opts) => {
    if (opts.id === id) called++;
    return Promise.resolve(true);
  });
  assertEquals(called, 0, "a letter went about a notice already decided");
});

Deno.test({ name: "the night path copies a new notice to every personal address", ...pool }, async () => {
  Deno.env.set("DSA_ESCALATION_EMAILS", "one@example.org, two@example.org");
  const to: string[] = [];
  const sent = await sendNightPathCopies(
    { id: crypto.randomUUID(), kind: "other", queue: "platform", receivedVia: "alpha" },
    (address) => {
      to.push(address);
      return Promise.resolve(true);
    },
  );
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  assertEquals(sent, 2);
  assertEquals(to, ["one@example.org", "two@example.org"]);
});

Deno.test({ name: "a node with no mail at all retries nothing", ...pool }, async () => {
  Deno.env.set("MAIL_TRANSPORT", "none");
  reloadConfig();
  let called = 0;
  const result = await retryArrivalLetters(() => {
    called++;
    return Promise.resolve(true);
  });
  Deno.env.set("MAIL_TRANSPORT", "smtp");
  reloadConfig();
  assertEquals([called, result.sent], [0, 0]);
});

Deno.test({ name: "the retry is a standing job the node arms", ...pool }, async () => {
  const { armScheduledJobs } = await import("../src/lib/scheduled.ts");
  await armScheduledJobs();
  const [n] = await queryOrThrow<{ n: string }>(
    `SELECT count(*)::text AS n FROM jobs WHERE kind = $1 AND locked_until IS DISTINCT FROM 'infinity'`,
    [DSA_NOTICE_NOTIFY],
  );
  assertEquals(n.n, "1", "nothing would ever run the retry");
});

// The review panel of 23.09.2026, one test each.

Deno.test({ name: "a provider slower than the pool's idle limit does not undo the pass", ...pool }, async () => {
  const id = await file();
  await retryArrivalLetters(async (_to, opts) => {
    if (opts.id === id) await new Promise((resolve) => setTimeout(resolve, 3000));
    return true;
  });
  assertEquals((await row(id)).sent, true, "a slow letter rolled the pass back");
});

Deno.test({ name: "a moderator deciding a notice does not wait on the mail", ...pool }, async () => {
  const id = await file();
  let release!: () => void;
  const held = new Promise<void>((resolve) => release = resolve);
  let reached!: () => void;
  const sending = new Promise<void>((resolve) => reached = resolve);
  const pass = retryArrivalLetters(async (_to, opts) => {
    if (opts.id === id) {
      reached();
      await held;
    }
    return true;
  });
  // Bounded: if the pass never takes the notice, this is red, not a hung suite
  // (the verifier's run of 23.09.2026 hung here for nine minutes).
  let timer = 0;
  const reachedInTime = await Promise.race([
    sending.then(() => true),
    new Promise<boolean>((resolve) => timer = setTimeout(() => resolve(false), 5000)),
  ]);
  clearTimeout(timer);
  if (!reachedInTime) {
    release();
    await pass;
  }
  assertEquals(reachedInTime, true, "the pass never took the notice");
  // What routes/dsa.ts does to decide: lock the row. It must not wait on a letter.
  const locked = await transaction(async (run) => {
    await run(`SET LOCAL lock_timeout = '500ms'`);
    return (await run(`SELECT id FROM dsa_notices WHERE id = $1 FOR UPDATE`, [id])).length;
  }).catch((error) => String(error));
  release();
  await pass;
  assertEquals(locked, 1, `the decision waited on the mail: ${locked}`);
});

Deno.test({ name: "notices that fail for ever do not keep a new one out of the pass", ...pool }, async () => {
  // Fifty old failures fill the pass's fifty places if it takes the oldest first.
  await queryOrThrow(
    `INSERT INTO dsa_notices (brand, target_kind, reason_text, bona_fide, status, created_at,
                              arrival_attempts, arrival_leased_until)
     SELECT 'alpha', 'other', 'starve ' || g, true, 'received', now() - interval '1 day',
            5, now() - interval '1 minute'
       FROM generate_series(1, 50) g`,
  );
  const id = await file();
  const taken: string[] = [];
  await retryArrivalLetters((_to, opts) => {
    taken.push(String(opts.id));
    return Promise.resolve(false);
  });
  // Decided, so they stop crowding the passes of the tests after this one.
  await queryOrThrow(`UPDATE dsa_notices SET status = 'upheld', decided_at = now() WHERE reason_text LIKE 'starve %'`);
  assertEquals(taken.includes(id), true, "a new notice waited behind fifty that never go");
});

Deno.test({ name: "one refusing address does not repeat the escalation to the rest", ...pool }, async () => {
  const id = await file();
  await queryOrThrow(`UPDATE dsa_notices SET arrival_attempts = $2 WHERE id = $1`, [id, MAX_ATTEMPTS]);
  Deno.env.set("DSA_ESCALATION_EMAILS", "good@example.org, bad@example.org");
  const told: string[] = [];
  const escalate = (to: string, n: { id: string }) => {
    if (n.id === id) told.push(to);
    return Promise.resolve(to === "good@example.org");
  };
  await retryArrivalLetters(() => Promise.resolve(false), escalate);
  await retryArrivalLetters(() => Promise.resolve(false), escalate);
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  assertEquals(told.filter((t) => t === "good@example.org").length, 1, "the escalation went again to who had it");
});
