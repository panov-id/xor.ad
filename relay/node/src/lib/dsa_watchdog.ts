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
import { sendNoticeAging } from "./mailer.ts";
import { brandByKey } from "./brand_registry.ts";

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
  return (Deno.env.get("DSA_ESCALATION_EMAILS") ?? "")
    .split(/[,\s]+/)
    .map((address) => address.trim())
    .filter((address) => address.includes("@"));
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

export async function agingNotices(run: Run = query): Promise<AgingNotice[] | null> {
  const rows = await run<{ id: string; kind: string; face: string | null; age_hours: string; stage: string }>(
    `WITH picked AS (
       SELECT id,
              CASE WHEN created_at < now() - interval '${ESCALATE_AFTER_HOURS} hours' AND escalated_at IS NULL
                   THEN 'escalate' ELSE 'remind' END AS stage
         FROM dsa_notices
        WHERE status IN ('received', 'in_review')
          AND ((created_at < now() - interval '${REMIND_AFTER_HOURS} hours' AND reminded_at IS NULL)
            OR (created_at < now() - interval '${ESCALATE_AFTER_HOURS} hours' AND escalated_at IS NULL))
        ORDER BY created_at
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

export async function watchNoticeAge(): Promise<{ reminded: number; escalated: number; unsent: number }> {
  const notices = await agingNotices();
  if (notices === null) {
    // A database that did not answer is not "nothing to do": say so and let the
    // queue's backoff bring this back.
    throw new Error("the watchdog could not read the notices");
  }
  let reminded = 0, escalated = 0, unsent = 0;
  for (const notice of notices) {
    const to = await addressesFor(notice);
    let failed = to.length === 0;
    if (failed) {
      log("error", "nobody to warn about an unresolved notice", { id: notice.id, stage: notice.stage });
    }
    for (const address of to) {
      if (!await sendNoticeAging(address, notice)) failed = true;
    }
    if (failed) {
      // Every address again next time, including any that did get it: a
      // second copy is the price of not losing the one that mattered.
      unsent++;
      await unstamp(notice);
    } else if (notice.stage === "escalate") escalated++;
    else reminded++;
  }
  if (unsent) {
    log("error", "notices nobody could be warned about", { reminded, escalated, unsent });
  } else if (reminded || escalated) {
    log("info", "notices that nobody has answered", { reminded, escalated });
  }
  return { reminded, escalated, unsent };
}
