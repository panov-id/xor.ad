// Watchdog С1: the age of unresolved notices (docs/watchdogs_RU.md).
//
// A notice under Article 16 arrives, a letter goes to the face's support
// address, and after that nothing watches it. If that letter was missed — or
// read and forgotten — the notice sits in `received` while Article 16(6)'s
// "timely" quietly runs out. Nothing in the node noticed; a person had to.
//
// Thresholds are the spec's: a reminder past 24 hours, an escalation past 48.
// The DSA's own 72 hours is the target this stands in front of, not the alarm.
// One letter per threshold, stamped on the row: an hourly letter about the same
// notice makes the channel unreadable (review panel, 15.09.2026).
//
// What the letters carry: the notice's id, the kind of target, the age. Never
// the complaint's text, never the notifier — those stay where they were filed.
import { config } from "../config.ts";
import { query } from "./db.ts";
import { log } from "./log.ts";
import { sendNoticeAging, sendNoticeAgingSummary, withoutAddresses } from "./mailer.ts";
import { brandByKey } from "./brand_registry.ts";
import { sha256hex } from "./identity_auth.ts";

export const REMIND_AFTER_HOURS = 24;
export const ESCALATE_AFTER_HOURS = 48;

export type AgingNotice = {
  id: string;
  kind: string;
  brand: string | null;
  age_hours: number;
  stage: "remind" | "escalate";
};

// Everyone who must hear about a notice nobody answered. Personal addresses,
// not a shared inbox: the shared one is what did not work.
export function escalationAddresses(): string[] {
  // Once each: a name written twice was two letters, and a notice named twice in
  // one summary (verifier, 2026-09-24).
  return [...new Set((Deno.env.get("DSA_ESCALATION_EMAILS") ?? "")
    .split(/[,\s]+/)
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address.includes("@")))];
}

const addressHash = async (address: string) => await sha256hex(new TextEncoder().encode(address));

// Where the letter about this notice at this stage already arrived. A retry
// goes only to the rest, so one failing address no longer brings every notice
// back to the healthy ones every ten minutes (db/054).
async function alreadyTold(notice: AgingNotice): Promise<Set<string>> {
  const rows = await query<{ address_hash: string }>(
    `SELECT address_hash FROM dsa_notice_letters WHERE notice_id = $1 AND stage = $2`,
    [notice.id, notice.stage],
  );
  return new Set((rows ?? []).map((r) => r.address_hash));
}

async function markTold(notices: AgingNotice[], address: string): Promise<void> {
  const hash = await addressHash(address);
  for (const notice of notices) {
    await query(
      `INSERT INTO dsa_notice_letters (notice_id, stage, address_hash) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [notice.id, notice.stage, hash],
    );
  }
}

// A place in this hour's letters at one address (db/055): one statement
// decides it, so two passes cannot both hand out the sixth.
async function takeSlot(hash: string, kind: "letters" | "summaries", ceiling: number): Promise<boolean> {
  const rows = await query<{ n: number }>(
    `INSERT INTO dsa_aging_hours (hour, address_hash, ${kind}) VALUES (date_trunc('hour', now()), $1, 1)
     ON CONFLICT (hour, address_hash) DO UPDATE SET ${kind} = dsa_aging_hours.${kind} + 1
     RETURNING ${kind} AS n`,
    [hash],
  );
  // No answer from the database is not a reason to stay silent about a notice.
  return rows === null || rows[0].n <= ceiling;
}

// A send that throws is a letter that did not leave, not the end of the pass:
// thrown out of here it left every stamp of the pass in place, and those
// letters would never go (verifier, 2026-09-24).
async function tried(attempt: () => Promise<boolean>): Promise<boolean> {
  try {
    return await attempt();
  } catch (error) {
    log("error", "a watchdog letter threw", { error: withoutAddresses(String(error)) });
    return false;
  }
}

// The rows to warn about, and the stamp that keeps the letter to one. Taken in
// one statement with `FOR UPDATE SKIP LOCKED`, as the queue claims jobs, and the
// condition repeated in the UPDATE: in READ COMMITTED a second pass waiting on
// the row re-checks only the UPDATE's own WHERE, so without either one two
// passes both got the same row (reproduced by the review panel, 23.09.2026).
// Two passes do meet: the job's lease is ten minutes, and a pass over a backlog
// can outlast it.
// `run` is the module's query unless a caller holds a transaction — the test of
// two passes at once holds one open to be the pass the other has to get past.
type Run = <R>(text: string, args?: unknown[]) => Promise<R[] | null>;

// `escalate` false: nobody to escalate to, so escalations are not picked at all.
// Picked, they found no address, gave their stamps back and came first again in
// the next pass, and 200 of them kept a fresh notice from its reminder for good
// (dsa.aging.starvation; decided by quorum 2026-09-24, five of five).
export async function agingNotices(
  run: Run = query,
  escalate = escalationAddresses().length > 0,
): Promise<AgingNotice[] | null> {
  const rows = await run<{ id: string; kind: string; face: string | null; age_hours: string; stage: string }>(
    `WITH picked AS (
       SELECT id,
              CASE WHEN $1 AND created_at < now() - interval '${ESCALATE_AFTER_HOURS} hours' AND escalated_at IS NULL
                   THEN 'escalate' ELSE 'remind' END AS stage
         FROM dsa_notices
        WHERE status IN ('received', 'in_review')
          AND ((created_at < now() - interval '${REMIND_AFTER_HOURS} hours' AND reminded_at IS NULL)
            OR ($1 AND created_at < now() - interval '${ESCALATE_AFTER_HOURS} hours' AND escalated_at IS NULL))
        -- Reminders first: an escalation whose letter keeps failing somewhere
        -- comes back every pass, and 200 of them ahead in age kept a fresh
        -- notice from its reminder even with addresses (verifier, 2026-09-24).
        ORDER BY (reminded_at IS NULL) DESC, created_at
        LIMIT 200
        FOR UPDATE SKIP LOCKED
     ), stamped AS (
       UPDATE dsa_notices n
          -- An escalation stamps the reminder too: a notice first seen past 48
          -- hours skips the reminder, and without the stamp the next pass would
          -- send it — a "waiting a day" letter after the "two days" one.
          SET reminded_at  = coalesce(n.reminded_at, now()),
              escalated_at = CASE WHEN p.stage = 'escalate' THEN now() ELSE n.escalated_at END
         FROM picked p
        WHERE n.id = p.id
          AND n.status IN ('received', 'in_review')
          AND (CASE WHEN p.stage = 'escalate' THEN n.escalated_at ELSE n.reminded_at END) IS NULL
        -- The face the notice came through, in the order the arrival letter
        -- uses (routes/report.ts): a platform notice has no brand but was
        -- still received through one, and its reminder belongs in that inbox.
        RETURNING n.id, n.target_kind AS kind, coalesce(n.brand, n.received_via) AS face,
                  extract(epoch FROM (now() - n.created_at)) / 3600 AS age_hours, p.stage
     )
     SELECT * FROM stamped`,
    [escalate],
  );
  if (rows === null) return null;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    brand: r.face,
    age_hours: Math.floor(Number(r.age_hours)),
    stage: r.stage === "escalate" ? "escalate" : "remind",
  }));
}

// Where a letter about this notice goes. A reminder follows the notice to the
// face it came through; an escalation goes to the people named in the
// environment, because the face's shared inbox is what was already missed.
export async function addressesFor(notice: AgingNotice): Promise<string[]> {
  if (notice.stage === "escalate") return escalationAddresses();
  const face = (notice.brand ? await brandByKey(notice.brand) : null) ?? config.brands[0];
  return face ? [`support@${face.domain}`] : [];
}

// A letter that did not leave gives its stamp back, so the next pass tries
// again. The stamp went on before the send to keep two passes from both sending;
// left in place after a failure it turned "at most once" into "never" — the
// silent loss this watchdog exists to prevent (review panel, 23.09.2026). The
// reminder stamp an escalation set stays: a reminder after an escalation is the
// letter the stamp was put there to stop.
async function unstamp(notice: AgingNotice): Promise<void> {
  const column = notice.stage === "escalate" ? "escalated_at" : "reminded_at";
  await query(`UPDATE dsa_notices SET ${column} = NULL WHERE id = $1`, [notice.id]);
}

// A ceiling on the letters (decided by quorum 2026-09-24, five of five, by the
// owner's number for С2 of 2026-09-23): a stream of notices was a stream of
// letters to support@ and to people's own inboxes, spending the quota the other
// watchdogs' letters need. Each address gets the first AGING_LETTERS_PER_HOUR
// notices of an hour one by one and the rest in one summary that names every
// one of them — none is left out, only the letters are fewer (db/055 counts the
// hour per address). A pass runs hourly; a pass after a failure comes in ten
// minutes, repeats what did not leave and takes newly aged notices, within the
// same hour's count. What the hour has no room for is held, not failed: its
// stamp goes back and the next hour's pass takes it, without an error and
// without the ten-minute return a failure brings (verifier, 2026-09-24).
export const AGING_LETTERS_PER_HOUR = 6;

export async function watchNoticeAge(
  send: typeof sendNoticeAging = sendNoticeAging,
  summarize: typeof sendNoticeAgingSummary = sendNoticeAgingSummary,
): Promise<{ reminded: number; escalated: number; unsent: number; held: number }> {
  const escalate = escalationAddresses().length > 0;
  const notices = await agingNotices(query, escalate);
  if (notices === null) {
    // A database that did not answer is not "nothing to do": say so and let the
    // queue's backoff bring this back.
    throw new Error("the watchdog could not read the notices");
  }
  const byAddress = new Map<string, AgingNotice[]>();
  const failedIds = new Set<string>();
  const heldIds = new Set<string>();
  for (const notice of notices) {
    const to = await addressesFor(notice);
    if (to.length === 0) {
      log("error", "nobody to warn about an unresolved notice", { id: notice.id, stage: notice.stage });
      failedIds.add(notice.id);
    }
    const told = await alreadyTold(notice);
    for (const address of to) {
      if (told.has(await addressHash(address))) continue;
      byAddress.set(address, [...(byAddress.get(address) ?? []), notice]);
    }
  }
  await query(`DELETE FROM dsa_aging_hours WHERE hour < now() - interval '2 days'`);
  for (const [address, list] of byAddress) {
    const hash = await addressHash(address);
    let next = 0;
    // One by one while the hour has room at this address.
    while (next < list.length && await takeSlot(hash, "letters", AGING_LETTERS_PER_HOUR)) {
      const notice = list[next++];
      if (await tried(() => send(address, notice))) await markTold([notice], address);
      else failedIds.add(notice.id);
    }
    const rest = list.slice(next);
    if (rest.length === 0) continue;
    // The rest in one summary, one an hour; past that they wait for the next
    // hour, their stamps given back.
    if (!await takeSlot(hash, "summaries", 1)) {
      for (const notice of rest) heldIds.add(notice.id);
    } else if (await tried(() => summarize(address, rest))) {
      await markTold(rest, address);
    } else for (const notice of rest) failedIds.add(notice.id);
  }
  let reminded = 0, escalated = 0, unsent = 0, held = 0;
  for (const notice of notices) {
    if (failedIds.has(notice.id)) {
      // Again next time, to the addresses it did not reach (db/054).
      unsent++;
      await unstamp(notice);
    } else if (heldIds.has(notice.id)) {
      held++;
      await unstamp(notice);
    } else if (notice.stage === "escalate") escalated++;
    else reminded++;
  }
  if (!escalate) {
    // Said every pass, not once: an escalation nobody can receive is a notice
    // past two days that the people named for it never hear of.
    const held = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM dsa_notices
        WHERE status IN ('received', 'in_review') AND escalated_at IS NULL
          AND created_at < now() - interval '${ESCALATE_AFTER_HOURS} hours'`,
    );
    const n = held?.[0]?.n ?? 0;
    if (n > 0) log("error", "escalations held: DSA_ESCALATION_EMAILS names nobody", { held: n });
  }
  if (unsent) {
    log("error", "notices nobody could be warned about", { reminded, escalated, unsent });
  } else if (reminded || escalated || held) {
    log("info", "notices that nobody has answered", { reminded, escalated, held });
  }
  return { reminded, escalated, unsent, held };
}
