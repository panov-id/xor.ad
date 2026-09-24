# Watchdogs: so that nothing lies silent — specification, 2026-09-15

Stage 1 of `docs/reviews/PLAN_2026-09-14_legal-mechanics_v1_EN.md` and S1 of the road to drawing.
**This is a specification, not code** — except W1, W2 and W3: they were built on 2026-09-23
(`relay/node/src/lib/dsa_watchdog.ts`, `relay/node/src/lib/notice_notify.ts`,
`relay/node/src/lib/tombstone_watch.ts`, migrations `db/041`–`db/043`), and their sections below describe what was built. Node code in `relay/` is outside the hardening process's
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

- **Gauge.** `GET /metrics` serves `relay_dsa_queue_oldest_seconds{brand}` — the age of the oldest
  notice without a decision (`decided_at IS NULL`), per face (`lib/queue_metrics.ts`); a face with no
  such notice has no label. Until 2026-09-23 this named `relay_dsa_oldest_unresolved_seconds`, which
  the code never had.
- **Threshold.** Over 24 hours — a reminder; over 48 hours — an escalation. 72 hours is the DSA
  spec's internal target, not a norm; the thresholds sit before it.
- **Who sends.** A scheduler job `dsa_notice_age`, hourly, re-arming itself like the others.
  **One letter per threshold**: the notice gets `reminded_at` and `escalated_at`, and no repeat goes —
  a letter every hour would make the channel unreadable (added 2026-09-15 after the review panel).
  The stamp goes on as the row is taken (`FOR UPDATE SKIP LOCKED`, the condition repeated in the
  `UPDATE`) — two passes never take one row — and **comes off when the letter did not leave**: the
  next pass, in 10 minutes rather than an hour, sends it again. A letter goes at least once; a second
  copy is the price of not losing the one that mattered (review panel 2026-09-23,
  `docs/reviews/PANEL_2026-09-23_watchdog-c1.md`).
- **Where to.** The reminder — to the `support@` of the face the notice came through (as the
  new-notice letter does: `brand`, else `received_via`); the escalation — to the personal addresses in
  `DSA_ESCALATION_EMAILS` (the wizard passes it to the node from `secrets.env`), not a shared inbox,
  and over the fallback transport `MAIL_FALLBACK_TRANSPORT`: the main one may have failed for the same
  reason as in W2. **There is no fallback transport yet** — the escalation goes over the main one;
  it needs a second mail account (`mail.fallback.transport`). An empty `DSA_ESCALATION_EMAILS` means
  the escalation reaches nobody, and the node logs that at `error` every 10 minutes.
- **The first rollout.** Every accumulated unresolved notice older than 48 hours gets an escalation —
  up to 200 a pass, oldest first.
- **What the letter holds.** The notice number, the target kind, the age. No complaint text, no
  notifier data.

## W2. A notification failure — a retry, not a log line

- The notice row remembers whether the letter about it left (`db/043`: `arrival_sent_at`,
  `arrival_attempts`, `arrival_escalated_at`); the route sets `arrival_sent_at` only when the letter
  left. A standing job `dsa_notice_notify` retries every 10 minutes the unsent letters of unresolved
  notices older than five minutes. The rows are leased in one short statement (`FOR UPDATE SKIP
  LOCKED`, `arrival_leased_until` for 10 minutes, the attempt counted when taken); the letters go
  outside any transaction — the pool closes a session idle in a transaction past
  `RELAY_DB_TIMEOUT_MS`, and a moderator's decision locks the same row and must not wait on mail
  (review panel 2026-09-23). Round robin: never tried first, then the longest untried. The first shape — "a job `dsa_notice_notify` per notice" — the queue cannot hold:
  `jobs_standing` (`db/020`) is unique on the job kind, and a second unsent letter would not have been
  queued at all (found by the W2 suite, 2026-09-23).
- Out of attempts (8, `MAX_ATTEMPTS`) — a letter to `DSA_ESCALATION_EMAILS` over the fallback transport
  (variable `MAIL_FALLBACK_TRANSPORT`), with no notice content, one per notice; with nobody to tell
  there is no stamp and the retries go on. **There is no fallback transport yet** — the letter goes
  over the main one (`mail.fallback.transport`).
- **The letter about every new notice goes to `DSA_ESCALATION_EMAILS` at once as well**, over the fallback
  transport, with the number and the target kind only — the night path for a threat to life
  (`dsa/SPEC_EN.md` §5; decided 2026-09-15 after the final panel, OPS-8). Built over the main transport,
  without a retry. **The ceiling is 6 per hour** (owner, 2026-09-23): the first six notices of an hour
  are copied one by one, the rest are counted and go as one summary after the hour ends ("N more
  beyond the six"). The counter is a row per hour in `night_path_hours` (`db/044`), shared by the
  pool; one statement hands out the places. Without a ceiling a stream of reports from many
  addresses would be a stream of letters to personal inboxes and a drain on the quota the watchdogs'
  letters share (W2 review panel).
- Notices written before `db/043` count as told by the migration — too late to retry them.
- The notice itself is never lost: the letter stays a side effect after the write.

## W3. Job tombstones

- The node calls `armScheduledJobs()` hourly (`scheduled.ts`, `rearmPass` and `startRearming`): a
  standing job that is missing is created again — including when `enqueueOnce` got `rows === null`
  at node start because the database did not answer (added 2026-09-15 after the final panel, OPS-4).
  It is a process timer, not a queue job: a job can become a tombstone itself or never be armed, and
  then nothing would re-arm the re-arm.
- Where tombstones come from. A database that is down spends no attempts: `claim()` reads `null`
  and takes nothing. A tombstone is eight handler failures against a database that answers —
  storage, a partial outage, a bug. The W1 panel's estimate — a tombstone after an hour or so of a
  database down (2026-09-23) — is wrong.
- A `prune_dsa_records` tombstone — an urgent letter to `DSA_ESCALATION_EMAILS`: that job's period
  is promised in the privacy policy. A letter per **new** tombstone (by `id`, the `reported_at`
  column), not per pass: an always-failing job, once re-armed, yields a new tombstone about once a
  day. The rows are leased in one short statement (`FOR UPDATE SKIP LOCKED`, `report_leased_until`),
  the letters go outside any transaction, and the stamp goes on after a letter reached at least one
  address; the lease of a pass that died runs out and the letter goes again. Tombstones already lying there before
  `db/042` are marked as told by the migration — they are old news.
- Tombstones of other jobs — a line in the team's daily digest (the same digest as support's,
  `chat_EN.md` §13). **Built 2026-09-24** (`lib/support_sweeper.ts`, `supportDigest`): a line
  "jobs that gave up: kind ×count" in every face's letter, and a digest goes to every face while
  there are any, even with no requests that day. This said "not built: the digest goes per face and
  about support only" [retired].
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

- **Gauge — built 2026-09-24.** `GET /metrics` serves `relay_backup_age_seconds` — the age of the marker `backups/<env>/last-ok.json` that the backup script puts in the **working** zone with the node's key after a dump went up (`relay/wizard/backup-postgres.sh`); `-1` while there is none. The node reads it with the `watch_backup` job once an hour (`relay/node/src/lib/backup_watch.ts`). Not the dumps themselves: they may live in their own zone, whose key is kept off the node — otherwise a break-in of the node reaches the second copy. [retired] This said "the age of the newest object in `backups/<env>/postgres/`" (2026-09-16, OPS-5: the external pinger of W5 does not list the storage; a box down as a whole is caught by W5).
- **Threshold.** 26 hours (`BACKUP_AGE_ALERT_HOURS`, a node variable): the dump is nightly, the hour is slack for a deploy and the network.
- **Where to.** A letter to the escalation addresses (`DSA_ESCALATION_EMAILS`) from the node itself — the boxes run no Alertmanager; at most once a day while the backup stays old; with no marker, only once the node has been up longer than the threshold. [retired] This also said "the unit `relay-backup.service` gets an `OnFailure=` with the same letter": not built — the box has no way to send a letter without the node, and a failed `curl` is caught anyway by the marker that does not move.
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
| W7 | stop `relay-backup.timer` and set `BACKUP_AGE_ALERT_HOURS=0` | a letter within the hour |
| W6 | stop the moderation worker and post a phrase | a letter once the oldest phrase nears 10 minutes |

## Open

- Watchdogs W5 and W6 are not built. W7 was built on 2026-09-24 and ships with the `day57` roll; until then the backup on the boxes stays silent — item `backup.silent.failure` in `docs/facts/open.tsv`.
  W2 is built without the fallback transport — `watchdogs.unbuilt`. W3's digest line about other tombstones was built on 2026-09-24.
- The external pinger service is not chosen — `node.external.pinger`.
- W1: no fallback transport for the escalation — `mail.fallback.transport`; a letter per notice rather
  than one summary a pass — `watchdog.letters.flood` (review panel 2026-09-23).
