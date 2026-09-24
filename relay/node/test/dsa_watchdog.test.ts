// Watchdog С1 against a real database: a notice nobody answered is warned
// about once at a day and once at two, and never again.
//
// Why the database: the whole mechanism is one statement that picks rows by
// age and stamps them in the same breath, so that two nodes cannot both send.
// Against a stub this would test the stub.
import { assertEquals } from "jsr:@std/assert@1";

if (!Deno.env.get("DATABASE_URL")) {
  throw new Error("DATABASE_URL is not set — run through scripts/run-relay-database-tests.sh");
}
Deno.env.set("MAIL_TRANSPORT", "none");
Deno.env.set("NODE_ENV_NAME", "test");

const { agingNotices, escalationAddresses, watchNoticeAge } = await import("../src/lib/dsa_watchdog.ts");
const { queryOrThrow, transaction } = await import("../src/lib/db.ts");

// The pool opens here, outside any test, as in the other database suites: a
// connection first opened inside a test outlives it and reads as a leak.
await queryOrThrow("SELECT 1");

// Sanitizers off, as in database.test.ts: the pool opens connections on demand,
// and two passes at once open a second one that outlives the test by design.
const pool = { sanitizeOps: false, sanitizeResources: false };

async function notice(ageHours: number, status = "received"): Promise<string> {
  const rows = await queryOrThrow<{ id: string }>(
    `INSERT INTO dsa_notices (brand, target_kind, reason_text, bona_fide, status, created_at)
     VALUES ('neighbro', 'chat', $1, true, $2, now() - ($3 || ' hours')::interval)
     RETURNING id`,
    [`watchdog ${crypto.randomUUID()}`, status, String(ageHours)],
  );
  return rows[0].id;
}

Deno.test({ name: "a notice younger than a day is left alone", ...pool }, async () => {
  const id = await notice(2);
  const picked = (await agingNotices(undefined, true)) ?? [];
  assertEquals(picked.some((n) => n.id === id), false, "a fresh notice was warned about");
});

Deno.test({ name: "a day old is a reminder, two days old is an escalation, and each goes once", ...pool }, async () => {
  const day = await notice(30);
  const twoDays = await notice(60);

  const first = (await agingNotices(undefined, true)) ?? [];
  assertEquals(first.find((n) => n.id === day)?.stage, "remind");
  assertEquals(first.find((n) => n.id === twoDays)?.stage, "escalate");

  // The same rows again: the stamps must keep them out.
  const second = (await agingNotices(undefined, true)) ?? [];
  assertEquals(second.some((n) => n.id === day), false, "the reminder would go twice");
  assertEquals(second.some((n) => n.id === twoDays), false, "the escalation would go twice");

  // The one that was only reminded about still escalates when it gets there.
  await queryOrThrow(`UPDATE dsa_notices SET created_at = now() - interval '60 hours' WHERE id = $1`, [day]);
  const third = (await agingNotices(undefined, true)) ?? [];
  assertEquals(third.find((n) => n.id === day)?.stage, "escalate", "a reminded notice never escalated");
});

Deno.test({ name: "a notice that was decided is not chased", ...pool }, async () => {
  const id = await notice(90, "upheld");
  const picked = (await agingNotices(undefined, true)) ?? [];
  assertEquals(picked.some((n) => n.id === id), false, "a decided notice was chased");
});

Deno.test({ name: "the escalation addresses come from the environment, and rubbish is dropped", ...pool }, () => {
  Deno.env.set("DSA_ESCALATION_EMAILS", " one@example.org, two@example.org ,, not-an-address ");
  assertEquals(escalationAddresses(), ["one@example.org", "two@example.org"]);
  Deno.env.delete("DSA_ESCALATION_EMAILS");
  assertEquals(escalationAddresses(), []);
});

// The findings of the review panel of 23.09.2026, one test each.

Deno.test({ name: "two passes at once never both take the same notice", ...pool }, async () => {
  // The first pass takes its rows inside a transaction and holds it open; the
  // second runs meanwhile. Promise.all of two plain passes did not overlap and
  // stayed green with the guard removed — so the overlap is made by hand.
  const ids = await Promise.all(Array.from({ length: 3 }, () => notice(30)));
  let release!: () => void;
  const held = new Promise<void>((resolve) => release = resolve);
  let first: { id: string }[] = [];
  const firstPass = transaction(async (run) => {
    first = (await agingNotices(run)) ?? [];
    await held;
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const secondPass = agingNotices();
  await new Promise((resolve) => setTimeout(resolve, 200));
  release();
  await firstPass;
  const second = (await secondPass) ?? [];
  const both = second.filter((n) => first.some((f) => f.id === n.id) && ids.includes(n.id));
  assertEquals(both.length, 0, "two passes both took the same notice — two letters");
  assertEquals(first.filter((n) => ids.includes(n.id)).length, ids.length, "the first pass missed a notice");
});

Deno.test({ name: "a letter that did not leave gives its stamp back", ...pool }, async () => {
  // MAIL_TRANSPORT is "none" here, so no letter leaves: exactly the failure.
  const id = await notice(30);
  const result = await watchNoticeAge();
  assertEquals(result.unsent > 0, true, "a letter that never left was counted as sent");
  const [row] = await queryOrThrow<{ reminded_at: Date | null }>(
    `SELECT reminded_at FROM dsa_notices WHERE id = $1`,
    [id],
  );
  assertEquals(row.reminded_at, null, "the stamp stayed, so the reminder would never go");
});

Deno.test({ name: "a platform notice is reminded in the inbox it came through", ...pool }, async () => {
  const rows = await queryOrThrow<{ id: string }>(
    `INSERT INTO dsa_notices (brand, received_via, target_kind, reason_text, bona_fide, status, created_at)
     VALUES (NULL, 'sosed', 'chat', $1, true, 'received', now() - interval '30 hours')
     RETURNING id`,
    [`watchdog ${crypto.randomUUID()}`],
  );
  const picked = (await agingNotices(undefined, true)) ?? [];
  assertEquals(picked.find((n) => n.id === rows[0].id)?.brand, "sosed", "the face it came through was lost");
});

// The ceiling (decided by quorum 2026-09-24, by the owner's number for С2):
// a stream of aging notices is not a stream of letters. One address gets the
// first six one by one and the rest in one summary, and every notice is in
// exactly one of them — fewer letters, none left out.
Deno.test({ name: "past six notices an address gets one summary, and every notice is told once", ...pool }, async () => {
  const { AGING_LETTERS_PER_HOUR } = await import("../src/lib/dsa_watchdog.ts");
  // Whatever an earlier case left unstamped is stamped first, so this pass is ours.
  await queryOrThrow(`UPDATE dsa_notices SET reminded_at = now(), escalated_at = now() WHERE status = 'received'`);
  const ids: string[] = [];
  for (let i = 0; i < AGING_LETTERS_PER_HOUR + 3; i++) ids.push(await notice(30));
  const one: [string, string][] = [];
  const summaries: [string, string[]][] = [];
  const result = await watchNoticeAge(
    (to, n) => { one.push([to, n.id]); return Promise.resolve(true); },
    (to, list) => { summaries.push([to, list.map((n) => n.id)]); return Promise.resolve(true); },
  );
  const addresses = new Set([...one.map(([to]) => to), ...summaries.map(([to]) => to)]);
  assertEquals(addresses.size, 1, "the reminders of one face went to more than its inbox");
  assertEquals(one.length, AGING_LETTERS_PER_HOUR, "an address got more letters one by one than the ceiling");
  assertEquals(summaries.length, 1, "what the ceiling held back did not go as one summary");
  const told = [...one.map(([, id]) => id), ...summaries[0][1]].sort();
  assertEquals(told, [...ids].sort(), "a notice was left out of the letters, or told twice");
  assertEquals(result, { reminded: ids.length, escalated: 0, unsent: 0 });
  const stamped = await queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM dsa_notices WHERE id = ANY($1::uuid[]) AND reminded_at IS NOT NULL`, [ids]);
  assertEquals(stamped[0].n, ids.length, "a notice told in the summary was not stamped");
});

Deno.test({ name: "a summary that did not leave gives back the stamps of every notice in it", ...pool }, async () => {
  const { AGING_LETTERS_PER_HOUR } = await import("../src/lib/dsa_watchdog.ts");
  await queryOrThrow(`UPDATE dsa_notices SET reminded_at = now(), escalated_at = now() WHERE status = 'received'`);
  const ids: string[] = [];
  for (let i = 0; i < AGING_LETTERS_PER_HOUR + 2; i++) ids.push(await notice(30));
  const result = await watchNoticeAge(() => Promise.resolve(true), () => Promise.resolve(false));
  assertEquals(result.unsent, 2, "the notices of a lost summary were counted as told");
  const unstamped = await queryOrThrow<{ n: number }>(
    `SELECT count(*)::int AS n FROM dsa_notices WHERE id = ANY($1::uuid[]) AND reminded_at IS NULL`, [ids]);
  assertEquals(unstamped[0].n, 2, "the stamps of a lost summary stayed, so those reminders would never go");
});

// One address that always fails must not bring the others their letters again
// (verifier, 2026-09-24: 42 letters an hour to the healthy one). The retry goes
// only where the letter did not arrive (db/054).
Deno.test({ name: "a retry goes only to the address that did not get the letter", ...pool }, async () => {
  const saved = Deno.env.get("DSA_ESCALATION_EMAILS");
  Deno.env.set("DSA_ESCALATION_EMAILS", "good@watch.test, bad@watch.test, GOOD@watch.test");
  try {
    assertEquals(escalationAddresses(), ["good@watch.test", "bad@watch.test"], "an address written twice was kept twice");
    await queryOrThrow(`UPDATE dsa_notices SET reminded_at = now(), escalated_at = now() WHERE status = 'received'`);
    const ids = [await notice(60), await notice(60), await notice(60)];
    const letters: string[] = [];
    const send = (to: string) => { letters.push(to); return Promise.resolve(to.startsWith("good")); };
    const first = await watchNoticeAge(send, () => Promise.resolve(false));
    assertEquals(first.unsent, 3, "a letter the bad address never got was counted as sent");
    const good = () => letters.filter((to) => to.startsWith("good")).length;
    assertEquals(good(), 3);
    await watchNoticeAge(send, () => Promise.resolve(false));
    await watchNoticeAge(send, () => Promise.resolve(false));
    assertEquals(good(), 3, "the healthy address got the same notices again on the retries");
    assertEquals(letters.filter((to) => to.startsWith("bad")).length, 9, "the failing address was not retried");
    await queryOrThrow(`UPDATE dsa_notices SET escalated_at = now() WHERE id = ANY($1::uuid[])`, [ids]);
  } finally {
    if (saved === undefined) Deno.env.delete("DSA_ESCALATION_EMAILS");
    else Deno.env.set("DSA_ESCALATION_EMAILS", saved);
  }
});

Deno.test({ name: "a letter that throws gives its stamp back instead of ending the pass", ...pool }, async () => {
  await queryOrThrow(`UPDATE dsa_notices SET reminded_at = now(), escalated_at = now() WHERE status = 'received'`);
  const id = await notice(30);
  const result = await watchNoticeAge(() => Promise.reject(new Error("the transport threw")), () => Promise.resolve(true));
  assertEquals(result.unsent, 1, "a throwing letter was not counted as unsent");
  const [row] = await queryOrThrow<{ reminded_at: Date | null }>(`SELECT reminded_at FROM dsa_notices WHERE id = $1`, [id]);
  assertEquals(row.reminded_at, null, "a throwing letter kept its stamp, so the reminder would never go");
});

// Starvation (dsa.aging.starvation, verifier 2026-09-24): with no escalation
// addresses the 200 oldest escalations lost their stamps every pass and came
// back first, and a fresh notice never got its reminder. Decided by quorum,
// five of five: with nobody to escalate to, escalations are not picked at all,
// and the pass says so loudly; reminders go on.
Deno.test({ name: "with nobody to escalate to, old escalations do not starve a fresh reminder", ...pool }, async () => {
  const saved = Deno.env.get("DSA_ESCALATION_EMAILS");
  Deno.env.set("DSA_ESCALATION_EMAILS", "");
  try {
    await queryOrThrow(`UPDATE dsa_notices SET reminded_at = now(), escalated_at = now() WHERE status = 'received'`);
    await queryOrThrow(
      // arrival_sent_at set: these rows are the watchdog's case, and the
      // arrival letters' retry (С2, another suite on this database) must not
      // take them for its own.
      `INSERT INTO dsa_notices (brand, target_kind, reason_text, bona_fide, status, created_at, reminded_at, arrival_sent_at)
       SELECT 'neighbro', 'chat', 'starve ' || g, true, 'received', now() - interval '60 hours', now() - interval '12 hours', now()
         FROM generate_series(1, 201) g`);
    const fresh = await notice(30);
    const told: string[] = [];
    for (let pass = 0; pass < 2; pass++) {
      await watchNoticeAge((_to, n) => { told.push(n.id); return Promise.resolve(true); }, () => Promise.resolve(true));
    }
    assertEquals(told.includes(fresh), true, "a fresh notice got no reminder behind escalations nobody could get");
    const [held] = await queryOrThrow<{ n: number }>(
      `SELECT count(*)::int AS n FROM dsa_notices WHERE reason_text LIKE 'starve %' AND escalated_at IS NULL`);
    assertEquals(held.n, 201, "an escalation with nobody to receive it was stamped as sent");
  } finally {
    await queryOrThrow(`DELETE FROM dsa_notices WHERE reason_text LIKE 'starve %'`);
    if (saved === undefined) Deno.env.delete("DSA_ESCALATION_EMAILS");
    else Deno.env.set("DSA_ESCALATION_EMAILS", saved);
  }
});
