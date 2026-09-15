# Watchdogs: so that nothing lies silent — specification, 2026-09-15

Stage 1 of `docs/reviews/PLAN_2026-09-14_legal-mechanics_v1_EN.md` and S1 of the road to drawing.
**This is a specification, not code.** Node code in `relay/` is outside the hardening process's
standing permission; this records what to watch, on which signal and where to, so that nothing is
left to choose when the work starts.

## Why

The platform's promises rest on people and jobs, and they can break without a sound:

| What can fail silently | Where it is today | How it ends |
|---|---|---|
| An Art. 16 notice lies unexamined | `routes/report.ts`: the team gets one letter, after the notice is stored | the deadline in `dsa/SPEC_EN.md` passes unnoticed; Art. 16(6) requires "timely" processing |
| The new-notice letter did not go | `routes/report.ts`: a `sendNoticeArrived` failure is a log line `moderator notification not sent` | the notice is in the database and nobody knows |
| A pruning job ran out of attempts | `lib/jobs.ts`: the row gets `locked_until = 'infinity'` and stays as a tombstone | a retention period promised in the privacy policy stops being kept; `armScheduledJobs()` runs only at node start (`main.ts`) |
| A retention period without a doer | `docs/facts/limits.tsv` and `lib/scheduled.ts` are not linked by any check | a promise without a doer lives until the first panel |
| The node does not answer | `docs/runbook-node-down_EN.md`, "What this runbook cannot do": there is no alerting | people learn it is down by going to look |

## W1. The age of unresolved notices

- **Gauge.** `GET /metrics` serves `relay_dsa_oldest_unresolved_seconds` — the age of the oldest
  notice in `received` or `in_review`; zero when there is none.
- **Threshold.** Over 24 hours — a reminder; over 48 hours — an escalation. 72 hours is the DSA
  spec's internal target, not a norm; the thresholds sit before it.
- **Who sends.** A scheduler job `dsa_notice_age`, hourly, re-arming itself like the others.
  **One letter per threshold**: the notice gets `reminded_at` and `escalated_at`, and no repeat goes —
  a letter every hour would make the channel unreadable (added 2026-09-15 after the review panel).
- **Where to.** The reminder — to the `support@` of the face the notice came through (as the
  new-notice letter does); the escalation — to the personal addresses in `DSA_ESCALATION_EMAILS`,
  not a shared inbox, and over the fallback transport `MAIL_FALLBACK_TRANSPORT`: the main one may have
  failed for the same reason as in W2.
- **What the letter holds.** The notice number, the target kind, the age. No complaint text, no
  notifier data.

## W2. A notification failure — a retry, not a log line

- On `!notified` or an exception from `sendNoticeArrived`, a job `dsa_notice_notify` with the same
  number is enqueued; retries follow the queue's quadratic backoff (`lib/jobs.ts`).
- Out of attempts — a letter to `DSA_ESCALATION_EMAILS` over the fallback transport (variable
  `MAIL_FALLBACK_TRANSPORT`), with no notice content.
- The notice itself is never lost: the letter stays a side effect after the write.

## W3. Job tombstones

- The worker calls `armScheduledJobs()` hourly: a standing job that is missing is created again.
- A `prune_dsa_records` tombstone — an urgent letter to `DSA_ESCALATION_EMAILS`: that job's period
  is promised in the privacy policy. A letter per **new** tombstone (by `id`), not per pass: an
  always-failing job, once re-armed, yields a new tombstone about once a day.
- Tombstones of other jobs — a line in the team's daily digest (the same digest as support's,
  `chat_EN.md` §13).
- A gauge `relay_jobs_tombstones{kind}` in `GET /metrics`.

## W4. The "period without a doer" gate

- `scripts/check-facts-limits.sh`: a `limits.tsv` row with `enforced_by = узел` and a period
  (`*.ttl`, `*.retention`, `*.delay`) must name a job in `lib/scheduled.ts` or an `open.tsv` item;
  otherwise red.
- Probe: delete the job name — the gate goes red with a legible line; restore it — green.
- This is a project gate, not node code: it can be built before product code (S4 of the route).

## W5. An external pinger

- Something outside the box asks `GET /health` of each environment every minute and writes to
  personal addresses after three failures in a row.
- **Choosing the service is not this specification's decision.** It needs an account and possibly
  money; it is filed as open item `node.external.pinger`.

## How to check once built

Each watchdog is broken on purpose and must reach the channel:

| Watchdog | How to break it | What must arrive |
|---|---|---|
| W1 | a notice with `created_at` 25 hours ago | a reminder to `support@` |
| W2 | the mail transport unavailable | a retry in the queue, then a letter over the fallback transport |
| W3 | `prune_dsa_records` throws until out of attempts | one urgent letter per tombstone and `relay_jobs_tombstones{kind="prune_dsa_records"}` ≥ 1 |
| W4 | delete the job name from `scheduled.ts` | a red gate |
| W5 | stop the node container | a letter after three minutes |

## Open

- Watchdogs W1–W3 and W5 are not built — items `watchdogs.unbuilt` (W1–W2, legal) and
  `watchdogs.jobs.unbuilt` (W3, operations) in `docs/facts/open.tsv`.
- The external pinger service is not chosen — `node.external.pinger`.
