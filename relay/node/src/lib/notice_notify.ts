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
import { sendArrivalUnsent, sendNoticeArrived, withoutAddresses } from "./mailer.ts";

export const DSA_NOTICE_NOTIFY = "dsa_notice_notify";
export const MAX_ATTEMPTS = 8;
// A letter the route is still trying is not the pass's yet. Longer than any
// send the route can make: Resend's fetch gives up after its own timeout.
const GRACE_SECONDS = 300;
const LEASE = "10 minutes";

export async function markArrivalSent(id: string): Promise<void> {
  await query(`UPDATE dsa_notices SET arrival_sent_at = now() WHERE id = $1`, [id]);
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
      await query(`UPDATE dsa_notices SET arrival_sent_at = now(), arrival_leased_until = now() WHERE id = $1`, [
        notice.id,
      ]);
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

// The night path (dsa/SPEC_RU.md §5): every new notice, at once, to the
// personal addresses — a threat to life cannot wait for a shared inbox to be
// read in the morning. The spec wants the fallback transport here; there is
// none yet (mail.fallback.transport), so it goes by the main one. Best-effort:
// the support letter is the one with a retry.
export async function sendNightPathCopies(
  opts: { id: string; kind: string; queue: "platform" | "tenant"; receivedVia: string | null },
  send: Arrival = sendNoticeArrived,
): Promise<number> {
  let sent = 0;
  for (const address of escalationAddresses()) {
    try {
      if (await send(address, opts)) sent++;
      else log("error", "the night-path copy of a notice did not leave", { id: opts.id });
    } catch (error) {
      log("error", "the night-path copy of a notice did not leave", { id: opts.id, error: withoutAddresses(String(error)) });
    }
  }
  return sent;
}
