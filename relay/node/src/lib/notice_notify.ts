// Watchdog С2 (docs/watchdogs_RU.md): the letter that says a report of illegal
// content arrived is retried, not logged and forgotten.
//
// The notice itself is never at risk — it is stored before any letter — but a
// notice nobody was told about waits for somebody to happen to open the queue,
// while Article 16(6) asks for a timely decision. Until 23.09.2026 a failed
// letter was one log line.
//
// The notice row remembers (db/043): arrival_sent_at once the letter left,
// arrival_attempts for the tries. A standing job retries every ten minutes;
// after MAX_ATTEMPTS the people in DSA_ESCALATION_EMAILS are told instead. A
// job per notice was the spec's first shape, and the queue cannot hold it:
// jobs_standing (db/020) allows one live row per kind.
import { config } from "../config.ts";
import { brandByKey } from "./brand_registry.ts";
import { enabled as databaseEnabled, query } from "./db.ts";
import { escalationAddresses } from "./dsa_watchdog.ts";
import { log } from "./log.ts";
import { inc } from "./metrics.ts";
import { sendArrivalUnsent, sendNightPathSummary, sendNoticeArrived, sendNoticeDecision, withoutAddresses } from "./mailer.ts";

export const DSA_NOTICE_NOTIFY = "dsa_notice_notify";
export const MAX_ATTEMPTS = 8;
// A letter the route is still trying is not the pass's yet. Longer than any
// send the route can make: Resend's fetch gives up after its own timeout.
const GRACE_SECONDS = 300;
const LEASE = "10 minutes";
// The decision letter's wait after a failed try: ten minutes, doubling, at most
// twelve hours — eight tries then span about a day, not the 80 minutes the flat
// ten minutes gave (review panel G1, B46, 2026-09-26).
const DECISION_BACKOFF_MINUTES = 10;
const DECISION_BACKOFF_CAP_MINUTES = 720;

// Exists at zero from the start: DsaDecisionLetterExhausted reads it, and a
// series born at 1 hides its first event from increase() (B42 gate, B46).
for (const result of ["failed", "sent_on_retry", "exhausted"]) inc("relay_dsa_decision_letter_total", { result }, 0);

// The mark that a letter left. `query` answers null on a failed write rather
// than throwing, and every mark used to ignore it: the letter had left, the row
// said it had not, and the next pass sent it again without a word (review
// panel G5, B47, 2026-09-26). At least once is the design here — a letter
// counted as sent that never left would be worse — so the second letter stays
// possible; what changes is that it is logged and counted.
for (const letter of ["arrival", "decision"]) inc("relay_dsa_letter_mark_failed_total", { letter }, 0);

export async function markLetterSent(letter: "arrival" | "decision", id: string, sql: string): Promise<boolean> {
  const done = await query(sql, [id]);
  if (done !== null) return true;
  inc("relay_dsa_letter_mark_failed_total", { letter });
  log("error", "a letter left and its mark was not written; the next pass sends it again", { letter, id });
  return false;
}

export async function markArrivalSent(id: string): Promise<void> {
  await markLetterSent("arrival", id, `UPDATE dsa_notices SET arrival_sent_at = now() WHERE id = $1`);
}

type Arrival = typeof sendNoticeArrived;
type Unsent = typeof sendArrivalUnsent;

// One pass. The rows are leased in one short statement — FOR UPDATE SKIP
// LOCKED, as the queue claims jobs — and the letters go outside any
// transaction. The first cut held a transaction open across the sends: the
// pool ends a session idle in a transaction after RELAY_DB_TIMEOUT_MS, so a slow
// provider rolled every pass back, and a moderator deciding the same notice
// waited on the mail (review panel, 23.09.2026). An attempt is counted when the
// row is taken, so a pass that dies still spends one; its lease runs out.
//
// Round robin: a row given back keeps its lease time as "last tried", and the
// pass takes the never-tried first, then the longest-untried. Oldest-first let
// fifty rows that fail for ever hold every place; fewest-attempts-first held
// back exactly the row due for escalation (both found by the suite, 23.09.2026).
export async function retryArrivalLetters(
  send: Arrival = sendNoticeArrived,
  escalate: Unsent = sendArrivalUnsent,
): Promise<{ sent: number; failed: number; escalated: number }> {
  if (!databaseEnabled()) throw new Error("no database to read the notices from");
  if (config.mail.transport === "none") return { sent: 0, failed: 0, escalated: 0 };
  const rows = await query<
    { id: string; kind: string; brand: string | null; received_via: string | null; attempts: number }
  >(
    `UPDATE dsa_notices n
        SET arrival_leased_until = now() + $2::interval, arrival_attempts = n.arrival_attempts + 1
      WHERE n.id IN (
        SELECT id FROM dsa_notices
         WHERE arrival_sent_at IS NULL AND arrival_escalated_at IS NULL
           AND status IN ('received', 'in_review')
           AND created_at < now() - make_interval(secs => $1)
           AND (arrival_leased_until IS NULL OR arrival_leased_until <= now())
         ORDER BY arrival_leased_until NULLS FIRST, created_at
         LIMIT 50
         FOR UPDATE SKIP LOCKED
      )
      RETURNING n.id, n.target_kind AS kind, n.brand, n.received_via, n.arrival_attempts AS attempts`,
    [GRACE_SECONDS, LEASE],
  );
  if (rows === null) throw new Error("could not read the notices");
  const people = escalationAddresses();
  let sent = 0, failed = 0, escalated = 0;
  for (const notice of rows) {
    const owner = notice.brand ? await brandByKey(notice.brand) : null;
    const face = owner ?? (notice.received_via ? await brandByKey(notice.received_via) : null) ??
      config.brands[0];
    let ok = false;
    try {
      ok = face
        ? await send(`support@${face.domain}`, {
          id: notice.id,
          kind: notice.kind,
          queue: notice.brand ? "tenant" : "platform",
          receivedVia: notice.received_via,
          brand: face.key,
        })
        : false;
    } catch (error) {
      log("error", "the arrival letter failed again", { id: notice.id, error: withoutAddresses(String(error)) });
    }
    if (ok) {
      await markLetterSent("arrival", notice.id, `UPDATE dsa_notices SET arrival_sent_at = now(), arrival_leased_until = now() WHERE id = $1`);
      sent++;
      continue;
    }
    failed++;
    let told = false;
    if (notice.attempts >= MAX_ATTEMPTS) {
      // Out of tries: the people named for this are told instead, once — told
      // if anyone was told, so one refusing address does not repeat it to the
      // rest every pass. With nobody to tell, the retries go on.
      for (const address of people) {
        if (await escalate(address, { id: notice.id, kind: notice.kind, attempts: notice.attempts })) told = true;
      }
      if (told) escalated++;
    }
    await query(
      `UPDATE dsa_notices SET arrival_leased_until = now(),
              arrival_escalated_at = CASE WHEN $2 THEN now() ELSE arrival_escalated_at END
        WHERE id = $1`,
      [notice.id, told],
    );
  }
  if (failed) log("error", "arrival letters that still did not leave", { sent, failed, escalated });
  else if (sent) log("info", "arrival letters sent on retry", { sent });
  return { sent, failed, escalated };
}

type Decision = typeof sendNoticeDecision;

// The notifier's letter about the decision (Article 16(5); db/058; B22,
// 2026-09-26), retried by the same pass and the same shape as the arrival
// letter above: leased in one statement, sent outside any transaction, an
// attempt counted when taken, round robin by last try. It is sent from what the
// decision kept on the notice — the text the letter quotes and the snapshot
// state — so a retry says what the first letter would have said. The wait after
// a failure doubles (DECISION_BACKOFF_*). The try that uses up MAX_ATTEMPTS is
// counted as exhausted, and DsaDecisionLetterExhausted pages on it: telling the
// notifier some other way would be a letter with words nobody has written yet,
// and the device receipt (§6) still carries the decision (review panel G1).
//
// A notice decided in the window between db/058 and the code that writes the
// letter's text (the wizard migrates, then restarts) has no text to send again.
// It was left "not sent" for ever; now it is marked exhausted at once and
// counted, so a letter that cannot be retried is seen rather than waited for
// (review panel G3).
//
// The counter is what happened in this process; what stays is the row. A node
// that dies between leasing the last try and sending it spent the attempt and
// counted nothing, and the row is never picked again (review panel 3, O3). So
// the alert reads the rows instead: every decided letter out of tries, unsent,
// and held by no lease — the one in flight is not given up yet. It holds until
// the letter is marked sent, not for an hour after an increase (O2; B63,
// 2026-09-26). Read at scrape time by lib/queue_metrics.ts.
export const DECISION_LETTER_GIVEN_UP = `decided_at IS NOT NULL AND decision_sent_at IS NULL
        AND notifier_email IS NOT NULL AND decision_attempts >= ${MAX_ATTEMPTS}
        AND (decision_leased_until IS NULL OR decision_leased_until <= now())`;

export async function retryDecisionLetters(
  send: Decision = sendNoticeDecision,
): Promise<{ sent: number; failed: number; exhausted: number }> {
  if (!databaseEnabled()) throw new Error("no database to read the notices from");
  if (config.mail.transport === "none") return { sent: 0, failed: 0, exhausted: 0 };
  const textless = await query<{ id: string }>(
    `UPDATE dsa_notices SET decision_attempts = $1
      WHERE decided_at IS NOT NULL AND decision_sent_at IS NULL AND notifier_email IS NOT NULL
        AND decision_letter_facts IS NULL AND decision_attempts < $1
      RETURNING id`,
    [MAX_ATTEMPTS],
  );
  if (textless === null) throw new Error("could not read the notices");
  let exhausted = textless.length;
  const rows = await query<{
    id: string; brand: string | null; status: string; notifier_email: string; facts: string;
    snapshot_state: string | null; snapshot_reason: string | null; attempts: number;
  }>(
    `UPDATE dsa_notices n
        SET decision_leased_until = now() + $2::interval, decision_attempts = n.decision_attempts + 1
      WHERE n.id IN (
        SELECT id FROM dsa_notices
         WHERE decided_at IS NOT NULL AND decision_sent_at IS NULL
           AND notifier_email IS NOT NULL AND decision_letter_facts IS NOT NULL
           AND status IN ('upheld', 'rejected')
           AND decision_attempts < $3
           AND decided_at < now() - make_interval(secs => $1)
           AND (decision_leased_until IS NULL OR decision_leased_until <= now())
         ORDER BY decision_leased_until NULLS FIRST, decided_at
         LIMIT 50
         FOR UPDATE SKIP LOCKED
      )
      RETURNING n.id, n.brand, n.status, n.notifier_email, n.decision_letter_facts AS facts,
                n.snapshot_state, n.snapshot_reason, n.decision_attempts AS attempts`,
    [GRACE_SECONDS, LEASE, MAX_ATTEMPTS],
  );
  if (rows === null) throw new Error("could not read the notices");
  let sent = 0, failed = 0;
  for (const notice of rows) {
    let ok = false;
    try {
      ok = await send(notice.notifier_email, {
        id: notice.id,
        brand: notice.brand,
        decision: notice.status as "upheld" | "rejected",
        facts: notice.facts,
        snapshotState: notice.snapshot_state ?? undefined,
        snapshotReason: notice.snapshot_reason ?? undefined,
      });
    } catch (error) {
      log("error", "the decision letter failed again", { id: notice.id, error: withoutAddresses(String(error)) });
    }
    if (ok) {
      await markLetterSent("decision", notice.id, `UPDATE dsa_notices SET decision_sent_at = now(), decision_leased_until = now() WHERE id = $1`);
      sent++;
      continue;
    }
    failed++;
    inc("relay_dsa_decision_letter_total", { result: "failed" });
    if (notice.attempts >= MAX_ATTEMPTS) exhausted++;
    // The next try waits longer each time. The exhausted one is not picked
    // again, and its lease ends now rather than twelve hours on: the given-up
    // gauge (DECISION_LETTER_GIVEN_UP) counts it once no lease holds it.
    await query(
      `UPDATE dsa_notices
          SET decision_leased_until = CASE WHEN $3::int >= $5::int THEN now()
                ELSE now() + make_interval(mins => least($2 * power(2, $3::int - 1)::int, $4)) END
        WHERE id = $1`,
      [notice.id, DECISION_BACKOFF_MINUTES, notice.attempts, DECISION_BACKOFF_CAP_MINUTES, MAX_ATTEMPTS],
    );
  }
  if (sent) inc("relay_dsa_decision_letter_total", { result: "sent_on_retry" }, sent);
  if (exhausted) inc("relay_dsa_decision_letter_total", { result: "exhausted" }, exhausted);
  if (failed || exhausted) log("error", "decision letters that still did not leave", { sent, failed, exhausted });
  else if (sent) log("info", "decision letters sent on retry", { sent });
  return { sent, failed, exhausted };
}

// The night path (dsa/SPEC_RU.md §5): every new notice, at once, to the
// personal addresses — a threat to life cannot wait for a shared inbox to be
// read in the morning. The spec wants the fallback transport here; there is
// none yet (mail.fallback.transport), so it goes by the main one. Best-effort:
// the support letter is the one with a retry.
//
// With a ceiling (owner, 23.09.2026): the first NIGHT_PATH_PER_HOUR notices of
// an hour are copied one by one, the rest are counted and go as one summary
// after the hour (sendNightPathSummaries). Anyone can file a notice, and the
// only limit before this was per address, in memory: a stream of reports would
// have been a stream of letters to people's own inboxes, spending the quota the
// watchdogs' letters need (review panel С2).
export const NIGHT_PATH_PER_HOUR = 6;

export async function sendNightPathCopies(
  opts: { id: string; kind: string; queue: "platform" | "tenant"; receivedVia: string | null },
  send: Arrival = sendNoticeArrived,
): Promise<number> {
  const people = escalationAddresses();
  if (people.length === 0) return 0;
  // One statement decides the place, so two nodes cannot both hand out the sixth.
  const counted = await query<{ sent: number }>(
    `INSERT INTO night_path_hours (hour, sent) VALUES (date_trunc('hour', now()), 1)
     ON CONFLICT (hour) DO UPDATE SET sent = night_path_hours.sent + 1
     RETURNING sent`,
  );
  // No answer from the database is not a reason to stay silent about a notice.
  if (counted !== null && counted[0].sent > NIGHT_PATH_PER_HOUR) return 0;
  let sent = 0;
  for (const address of people) {
    try {
      if (await send(address, opts)) sent++;
      else log("error", "the night-path copy of a notice did not leave", { id: opts.id });
    } catch (error) {
      log("error", "the night-path copy of a notice did not leave", { id: opts.id, error: withoutAddresses(String(error)) });
    }
  }
  return sent;
}

type Summary = typeof sendNightPathSummary;

// After the hour: one letter for what the ceiling held back. Leased like the
// retries — one short statement, the letter outside any transaction, stamped
// once it reached anyone.
export async function sendNightPathSummaries(send: Summary = sendNightPathSummary): Promise<number> {
  const people = escalationAddresses();
  if (people.length === 0) return 0;
  const hours = await query<{ hour: Date; held: number }>(
    `UPDATE night_path_hours h SET summary_leased_until = now() + $2::interval
      WHERE h.hour IN (
        SELECT hour FROM night_path_hours
         WHERE hour < date_trunc('hour', now()) AND sent > $1 AND summarized_at IS NULL
           AND (summary_leased_until IS NULL OR summary_leased_until <= now())
         ORDER BY hour
         LIMIT 24
         FOR UPDATE SKIP LOCKED
      )
      RETURNING h.hour, h.sent - $1 AS held`,
    [NIGHT_PATH_PER_HOUR, LEASE],
  );
  if (hours === null) throw new Error("could not read the night path's hours");
  let summarized = 0;
  for (const { hour, held } of hours) {
    let told = false;
    for (const address of people) {
      if (await send(address, { hour: new Date(hour), held, shown: NIGHT_PATH_PER_HOUR })) told = true;
    }
    await query(
      `UPDATE night_path_hours SET summary_leased_until = now(),
              summarized_at = CASE WHEN $2 THEN now() ELSE summarized_at END
        WHERE hour = $1`,
      [hour, told],
    );
    if (told) summarized++;
    else log("error", "the night-path summary did not leave", { hour: new Date(hour).toISOString(), held });
  }
  return summarized;
}
