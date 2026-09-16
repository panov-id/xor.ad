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
- **The letter about every new notice goes to `DSA_ESCALATION_EMAILS` at once as well**, over the fallback
  transport, with the number and the target kind only — the night path for a threat to life
  (`dsa/SPEC_EN.md` §5; decided 2026-09-15 after the final panel, OPS-8).
- The notice itself is never lost: the letter stays a side effect after the write.

## W3. Job tombstones

- The worker calls `armScheduledJobs()` hourly: a standing job that is missing is created again —
  including when `enqueueOnce` got `rows === null` at node start because the database did not answer
  (added 2026-09-15 after the final panel, OPS-4).
- A `prune_dsa_records` tombstone — an urgent letter to `DSA_ESCALATION_EMAILS`: that job's period
  is promised in the privacy policy. A letter per **new** tombstone (by `id`), not per pass: an
  always-failing job, once re-armed, yields a new tombstone about once a day.
- Tombstones of other jobs — a line in the team's daily digest (the same digest as support's,
  `chat_EN.md` §13).
- A gauge `relay_jobs_tombstones{kind}` in `GET /metrics`.

## W4. The "period without a doer" gate

**Built 2026-09-15:** side three of `scripts/check-facts-limits.sh` and the `executor` column in `docs/facts/limits.tsv`; the probe in `scripts/test_check-facts-limits.sh` removes `prune_pageviews` from a copy of `scheduled.ts` and sees red. Besides a job and an `open.tsv` item, the doer may be «запрос» — a period checked in the request itself (the PIN delays).

- `scripts/check-facts-limits.sh`: a `limits.tsv` row with `enforced_by = узел` and a period in seconds,
  minutes, hours or days (selected by unit, 2026-09-15; this said "`*.ttl`, `*.retention`, `*.delay`" [retired]) must name a job in `lib/scheduled.ts` or an `open.tsv` item;
  otherwise red.
- Probe: delete the job name — the gate goes red with a legible line; restore it — green.
- This is a project gate, not node code: it can be built before product code (S4 of the route).

## W5. An external pinger

- Something outside the box asks `GET /ready` of each environment every minute and writes to
  personal addresses after three failures in a row. `/ready`, not `/health`: `/health` answers 200
  always, and a node whose database is down would look healthy (clarified 2026-09-15 after the final
  panel, OPS-2; this said "asks `GET /health`" [retired]). `/ready` counts `database: "off"` as ready
  — open item `node.ready.database.off`.
- **Choosing the service is not this specification's decision.** It needs an account and possibly
  money; it is filed as open item `node.external.pinger`.

## W6. The age of the moderation queue

- **Gauge.** `GET /metrics` serves the age of the oldest phrase waiting for a verdict — the gauge §8.3
  of the chat spec already requires.
- **Threshold.** The waiting limit `moderation.queue.wait`, 10 minutes: past it the phrase is dropped
  with "the check did not happen" (`chat_EN.md` §8.3), so an oldest age near it means the queue has
  stopped rather than slowed.
- **Where to.** A letter to the personal addresses in `DSA_ESCALATION_EMAILS`, one per stall, not per
  pass. Added 2026-09-15 after the final panel (OPS-7); built together with the queue (§13, step 2).

## W7. The age of the last dump

- **Gauge.** The age of the newest object in `backups/<env>/postgres/` of the storage — checked from outside the box, where W5 runs.
- **Threshold.** 26 hours: the dump is nightly, the hour is slack for a deploy and the network.
- **Where to.** A letter to the personal addresses; the unit `relay-backup.service` gets an `OnFailure=` with the same letter, so a failed `curl` to the storage does not stay silent.
- **Why.** Up to 2026-09-15 the backup had not run for four nights in a row and nobody learned (panel, OPS-1); the command fix and the `check-backup-script` gate catch a broken text, not a broken network. Added 2026-09-16 after the panel (OPS-14); item `backup.silent.failure` in `docs/facts/open.tsv`.

## Gauges that arrive with the code

For tables, games, sockets and blocks no watchdog is described yet: there is no code. The gauge names are fixed in advance so the code does not invent them: `relay_tables_live`, `relay_sockets_open{kind}`, `relay_table_autopass_total`, `relay_moderation_oldest_seconds` (what W6 already requires). Added 2026-09-16 (panel, OPS-16).

## How to check once built

Each watchdog is broken on purpose and must reach the channel:

| Watchdog | How to break it | What must arrive |
|---|---|---|
| W1 | a notice with `created_at` 25 hours ago | a reminder to `support@` |
| W2 | the mail transport unavailable | a retry in the queue, then a letter over the fallback transport |
| W3 | `prune_dsa_records` throws until out of attempts | one urgent letter per tombstone and `relay_jobs_tombstones{kind="prune_dsa_records"}` ≥ 1 |
| W4 | delete the job name from `scheduled.ts` | a red gate |
| W5 | stop the node container | a letter after three minutes |
| W5 | stop postgres, the node running | a letter after three minutes: `/ready` answers 503 |
| W6 | stop the moderation worker and post a phrase | a letter once the oldest phrase nears 10 minutes |

## Open

- Watchdogs W1–W3, W5 and W6 are not built — items `watchdogs.unbuilt` (W1–W2, legal) and
  `watchdogs.jobs.unbuilt` (W3, operations) in `docs/facts/open.tsv`.
- The external pinger service is not chosen — `node.external.pinger`.
