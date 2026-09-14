# Plan v1 — mechanics on paper, legal texts, storage and watchers, 2026-09-14

The detailed plan after the panel `PANEL_2026-09-14_plan-legal-mechanics.md` over the
draft `PLAN_2026-09-14_legal-mechanics_EN.md` (v0). Line numbers are at `xor.ad`
d42485b, `sosed.place` ea70556, `neighbro.place` 6eb0053. The storefronts are edited
as mirrors, RU and EN as a pair. Executed stage by stage, each stage on a separate
word.

## What changed against v0

- **The premise for level 3 was wrong.** DSA art. 16(6) expressly allows automated
  means with disclosure; art. 17 only requires the statement of reasons to say that
  automation was used. A human is required by: DSA art. 12(1) — the point of contact
  must not rely solely on automated tools; GDPR art. 22(3) — the right to human
  intervention in a significant automated decision about a natural person; art. 18 —
  the judgement "a threat to life is suspected". Everything else where we have a human
  rests on our own promises: `sosed.place/landing/legal/terms_EN.md:87` and `:92`
  ("taken by a person"). The norms were checked against unofficial copies, EUR-Lex
  did not open — stage 0.
- **Order.** v0 put the legal texts first, but L1, L2 and L7 describe rules decided in
  M2–M5. Now: decisions on the mechanics on paper → legal texts in one pass → storage
  and sweepers. The watchers go separately and before everything else, because they
  remove the most manual work.
- **Facts corrected:** community guidelines — 17 languages in `sosed.place` and 10 in
  `neighbro.place`, not "10 and 19"; P4 (one offer, duplicate) was refuted by the
  day's panel and is removed from L1; L6 is not closed by the screens — one checklist
  line is about code; J9 and DSA-turnover are out of scope with a due date of
  2027-08-05; the dropped S10, S12, D12 are added.

## Principle: by itself, without us

Three levels: **1** — by itself by construction; **2** — by itself, reversible, with a
statement of reasons, a human looks on objection or by sampling; **3** — a human is
required.

Two rules for all automation, written down after the panel:

1. **The expiry of a review period neither imposes nor lifts a measure.** A measure
   ends only by its own span (a pause — 15 minutes, a hide — with the offer's death).
   Otherwise a violator files an objection on Friday night, and an attacker gets a
   measure without a decision.
2. **Automation is not fed by free identities.** Every automatic threshold (hide,
   link disabling, suspension, pause) counts only votes from identities with an
   accepted publication older than N hours, one vote per target; a queue timeout is
   not a refusal.

**Level 3 after the panel — only here:**

| Where | Why not lower |
|---|---|
| Reading every notice for art. 18 | a judgement about a threat to life |
| An objection to a decision on an art. 16 notice | under F4 the decision itself may be automated with disclosure (level 2); a human looks on objection |
| Suspending a venue that is a natural person | GDPR 22(3) — the right to intervention; and SEC1: only an operator's `resolved` enters the threshold |
| A channel to a human in support | DSA art. 12(1) |
| Redacting personal data in a complaint | rare, a judgement |

---

## Stage 0 — forks and checking the norms (decisions, no edits)

| # | Fork | Decided in | Options — in the questionnaire |
|---|---|---|---|
| F1 | The third step-away step against the 260-min conversation span | M2 | honest price / step ≤ 4 h / pause one's own span / close non-surviving conversations on leaving |
| F2 | A decision on a notice without email | L3 | as is + lawyer / receipt on the device / receipt + fallback line |
| F3 | Automation for venues | A8 | auto-hide offers, `suspended` by a human / auto-suspension with objection / as now |
| F4 | The promise "a decision on a report is taken by a person" | L1 | keep / replace with disclosure of automation |
| F5 | A sixth refusal within the same hour | M3 (E1b) | a new pause at once / five tries after a pause (`posting_paused_until`) |

**Decided 2026-09-14:**
- **F1 — the third step is 4 hours.** `limits.tsv` `away.span.long` 8 → 4 h. A 260-min conversation survives the step-away if one's own message was no more than 20 min earlier; storage of undelivered messages does not grow, L4 is not reopened; the label is `away_marked`, not `away_from`.
- **F2 — a receipt on the device plus a fallback line** "clear your browser data and you will not see the decision — leave an email" (4.3).
- **F3 — offers auto-hide, `suspended` is set by a human** after three `resolved` within 90 days; the auto-hide threshold counts only people who posted long ago (2.4).
- **F4 — the promise "a person decides" is replaced by disclosure of automation** (3.1); a human looks on objection and reads for art. 18. The art. 16(6) "diligent, non-arbitrary" risk is handled by an automated decision naming the class and carrying the way to object, with doubtful cases left to a human.
- **F5 — a new pause at once.** A pure rolling window (`chat_EN.md`, refusal counter): every refusal beyond the fifth within the same hour sets another 15 minutes; the pause is computed at read time from `rejected_at_recent`, no separate column. The pause text (3.2) and the terms (3.1) say "five refusals within a rolling hour — a pause; each further one in the same hour — a pause again".

**0.1. Checking the norms against the source.** DSA arts. 4(2), 12(1), 14(1)–(2),
16(4)–(6), 17(1)–(3), 18, 19(1), 24(3); GDPR 13, 22; P2B arts. 2 and 4 — from EUR-Lex
(a script in Docker if a direct request again returns an empty page). Output: a table
"norm — quote — panel's conclusion confirmed/not" at the end of the panel file. Stage 2
does not start without it.

---

## Stage 1 — watchers: so that nothing lies silently

An edit of existing `xor.ad/relay` code and documents. Does not touch chat code.

**1.1. Age of art. 16 notices.** A gauge "age of the oldest undecided `dsa_notices`"
in `/metrics`; a reminder to the team at > 24 h, escalation at > 48 h — not to the
shared `support@` inbox but to two personal addresses. A scheduled job.
Place: `relay/node/src/routes/report.ts:283-303`, `lib/scheduled.ts`, `lib/metrics.ts`.
Level: the alert — 1, the decision — 3.

**1.2. An alert failure is an alert, not a log line.** `report.ts:296-303`: on
`!notified` or an exception — a retry job with backoff, after N — an urgent letter to
the personal addresses.

**1.3. Jobs that exhausted their attempts re-arm by themselves.** `lib/jobs.ts:171-180`
sets a tombstone, `armScheduledJobs` is called only at start (`main.ts:55`). Edit: the
worker calls `armScheduledJobs` hourly; a `prune_dsa_records` tombstone is an urgent
alert, the rest a daily digest.

**1.4. A "span without a sweeper" gate.** `scripts/check-facts-limits.sh`: a
`limits.tsv` row with `enforced_by = узел` and a span (`*.ttl`, `*.retention`,
`*.delay`) must name a job in `scheduled.ts` or an `open.tsv` item; otherwise red.
Red-check: remove the job name and see the refusal.

**1.5. An external node pinger.** `docs/runbook-node-down_RU/EN.md` describes the
handling but not the detection. Choosing a service is an `open.tsv` item, not a plan
decision.

**Stage check.** Each watcher is broken on purpose (delay a notice, drop the mail
transport, stop the worker) — the message arrived in the channel.

---

## Stage 2 — mechanics on paper (the `xor.ad` canon + the storefronts)

### 2.1. 🔴 M1: "Forgot PIN?" — the paper code; a burned share freezes the session

- `sosed.place/docs/12-identity-and-security_RU/EN.md:53-56`: the link leads to
  recovery with the paper code; the 2026-09-14 decision "with a price" — `[retired]`.
- `11-empty-and-edge-states_RU/EN.md:32`, `:75`: "set a new PIN" → "recover with the
  paper code: it sets up a new share and a new PIN".
- `xor.ad/docs/chat_RU/EN.md:1177`: burning the share **sets `frozen_at` on the
  sessions in the same transaction**; the node refuses that session's signature
  everywhere except the recovery handle (SEC3). The price is named: someone who forgot
  the PIN can use nothing until the code is entered.
- SEC4: the global miss threshold (`limits.tsv:66-67`, `protocol_RU/EN.md:224-238`)
  does not close code intake but makes it costlier (a challenge of growing
  difficulty); a stop stays per address only.
- Level 1.

### 2.2. M2: step-away against the conversation span — by F1

**F1 decided: the third step is 4 hours.** `limits.tsv` `away.span.long` 8 h → 4 h
(`00-mechanics_*` §13, screen 20 "20 minutes / an hour / 4 hours", `chat_RU/EN.md`
step-away state); "long ones survive" stays true for the 260 span, "it waits" gets
the caveat "if the conversation lives that long". The 2026-09-14 "8 hours" decision —
`[retired]`. Common:
- `chat_RU/EN.md:827-829`, `sosed.place/docs/00-mechanics_*:1077,:1080`,
  `20-step-away_*:10,:15,:40`, `chat-flows_*:966` — the price and the "it waits"
  promise are rewritten for the option;
- `00-mechanics_RU.md:108` — fix the example "Kolya — two hours" given the 10/30/60/260
  set;
- if an option extends storage of undelivered messages, L4 is reopened before the edit.

### 2.3. M4: what the pause blocks

- One rule in `chat_RU/EN.md:1461`, `00-mechanics_*:227`,
  `11-empty-and-edge-states_*:86`, `refusal-wordings_*:93-94`: the pause blocks
  everything that goes into the moderation queue — phrases, table lines and requests,
  a name change and an offer like that sends the name; conversations, likes on phrases
  and reading work.
- A refused name feeds the refusal counter (S6): `chat_RU/EN.md:1469`.
- A queue timeout is a separate outcome "not checked, try later", not `rejected`, and
  does not touch the counter (SEC5).

### 2.4. M3: storage for rules already promised

Following the "Mechanics" lens's design (experiments E1a, E2a in `postgres:16`):
- `identity_stats`: `rejected_count` → `rejected_at_recent timestamptz[]` (≤ 6),
  `published_at_recent timestamptz[]` (≤ 4), `first_published_at timestamptz` (rounded
  to a day); windows filtered in the query, cleaned on write — no sweeper; under F5 the
  pause is computed from the array, no `posting_paused_until`.
- The `identity_stats` row is created in the signup transaction (E2b).
- The handles from 2.3 start with `SELECT … FROM identity_stats … FOR UPDATE`.
- A link report: table `offer_link_reports (offer_id, reporter, counts, created_at)`,
  `counts` frozen at report time (`first_published_at` older than 24 h and earlier
  than the offer), the transaction starts with `SELECT … FROM offers FOR UPDATE` (E3);
  the `reporter` link lives until the offer dies.
- The same "posted long ago" condition — for the auto-hide of a feed phrase by
  threshold (`00-mechanics_*:564-576`, SEC13) and the auto-hide of an offer
  (`offers/SPEC_*:401`).
- A private person's duplicate offer (`offers/SPEC_*:455`): "earlier" = among live
  ones; no text hash is stored (`chat_EN.md` "a number, not text") — the rule is
  narrowed.
- `sosed.place/docs/00-mechanics_*:708` "the quota is not stored separately" — rewrite.

### 2.5. M5: the "stepped away" label — a boolean on the participant

- `chat_participants.away_marked boolean NOT NULL DEFAULT false` instead of
  `identities.stepped_away_at` (or `away_from timestamptz` with F1 "pause one's own
  span"); set by the step-away transaction for live conversations, lifted by one's own
  message or move.
- The open-chat response (`chat_RU/EN.md:1944`) — a single `peer_stepped_away boolean`;
  no one else's timestamps go out.
- Early return: `stepped_away_until = now()` (D12); a past `stepped_away_until` is
  cleared by the session's first request.
- Conversation span: `COALESCE(last_own_message_at, chats.created_at) + ttl` —
  `chat_RU/EN.md:1926`, `:2168`, `:2181` (MEC-NULL).
- `migrations-step1_RU/EN.md:171` — "eleven" in two senses (D12).

### 2.6. M6: support

- `support_requests`: `id uuid`, `public_no text UNIQUE` (10 Crockford base32 chars
  from a CSPRNG), `answer_seen boolean` instead of `seen_at`; indexes
  `(identity, created_at DESC) WHERE identity IS NOT NULL` and `(created_at)`.
- An answer is served only on the owner's signature; the number is never a key (S13).
- Limit: `support.requests.day` per identity in `limits.tsv` plus the per-address
  limit; at the limit — a line with the `support@` address (art. 12(1): the channel to
  a human is not cut).
- A letter to the team per request (`14-support_*:19`) → a daily digest.
- Moving into art. 16: one transaction `INSERT dsa_notices` + `DELETE support_requests`
  (already decided), plus recognising "looks like a content report" by a rule on the
  node — the client offers the art. 16 form before sending (AUT5), level 2.

### 2.7. Autonomy: promises without an executor, and thresholds

- `offers/SPEC_*:757` "formality is judged by a moderator" — remove (A10).
- `offers/SPEC_*:426`, `:589` "review within a day" — rewrite as "record and
  consequences": the offer expires by itself (A7).
- `sosed.place/docs/19-table_*:132`: a report on a table line — hide for oneself;
  becomes an art. 16 notice only with the "illegal" box, as in the feed (AUT16).
- F3 decided: offers auto-hide on a threshold of reports from people who posted long
  ago (`offers/SPEC_*:401`), `suspended` is set by a human after three `resolved` within
  90 days (unchanged); deleting the profile after a year does not lift `suspended` — an
  address hash and the end date remain (SEC12).
- "This isn't us" (`offers/SPEC_*:725`): `suspended` is lifted by re-verification with
  a code (A12).
- S12: `sosed.place/docs/16-stickers_*:26` — packs load at app start, not when the
  conversation input opens.
- S10: `depth` — started only through a wrapper with `--log-driver none` built in; the
  client does not start without a variable the wrapper sets; the main interface in the
  alternate buffer (`depth-client_*:72-82`, `:292`, `:744`).
- `sosed.place/docs/00-mechanics_*:746` "three jobs" → six, by the code (AUT-M).

**Stage check.** readdress, the five `xor.ad` checks, byte comparison of the
storefronts, a control grep for the retired wordings.

---

## Stage 3 — legal texts in one pass (one revision date)

After stage 2 and check 0.1. Both storefronts, `terms_EN.md`, `privacy_EN.md`,
`community-guidelines_*` (17 and 10 languages: edit RU and EN, the rest machine
translation under the English-prevails note, `refusal-wordings_EN.md`, translation
section).

### 3.1. L1 — terms and community guidelines (art. 14(1))

- `terms_EN.md:77`: a link is switched off automatically after reports from two people
  who posted long ago, the rest go to a moderator; the venue receives a statement of
  reasons.
- `terms_EN.md:64`: four publications per rolling hour; five automated refusals within
  an hour — a 15-minute pause on everything that goes to checking.
- `terms_EN.md:87`, `:92` — by F4: "a decision on a report may be taken
  automatically; the answer says so, and a person will look at it again if you write
  to support". The same edit in `dsa/SPEC_RU/EN.md` (who decides) and in art. 16(6)
  statements (the `automated_used` field exists); an art. 14(2) banner.
- `terms_EN.md:93`: "final" — about a refusal; the pause is named separately, with no
  invented objection (LAW3).
- `terms_EN.md:133`, `privacy_EN.md:107`: "asked to accept" → "we notify; by continuing
  you agree", per `dsa/CHECKLIST_EN.md` (notify without requiring acceptance) (LAW5).
- `community-guidelines_*:33`: "quota reduction or a full access block" — no mechanism,
  a block does not touch the quota (`:29`, `00-mechanics_EN.md` §3); replace with the
  consequences that exist (LAW4). One line about passes and spectators at a table.

### 3.2. L7 — the pause text (art. 17(3))

`refusal-wordings_RU/EN.md` §4, `11-empty-and-edge-states_*:86`: facts (five refusals
within an hour), an automated decision, the ground — the terms clause from 3.1, the
routes — the pause ends by itself at HH:MM, the digital services coordinator, a court.
Level 1.

### 3.3. L6 — a statement of reasons to the venue on link disabling (art. 17(1)(a), 17(2))

`offers/SPEC_RU/EN.md:681` "not shown to the author" → a letter to the venue at the
moment of disabling: facts, automation, span, how to contest. Level 1. Whether P2B
art. 4 applies — a question in the lawyer's letter (4.1).

### 3.4. L2 — the privacy policy (GDPR 5(1)(c)(e), 13)

`privacy_EN.md`:
- `:24` — "counters" extended with the moments of publications and refusals within the
  last hour and the date of the first publication (to a day), kept while the identity
  lives;
- `:40` — the delivery path for the F1 option;
- `:41-44` — the step-away label for the life of a conversation; a support request:
  the purpose after the link is broken — a record of the review; a report moved into
  art. 16 is deleted from support; the receipt (if F2);
- `:97-103` — delete the Google Analytics banner description (LAW7).

### 3.5. DPIA, the art. 30 register, the DSA README

- `xor.ad/docs/dpia_RU/EN.md:70`, `:89`: the pause, link disabling, venue automation,
  new timestamps, the receipt.
- `docs/article-30-register_*`: the same data.
- `dsa/README_RU/EN.md:84`: art. 24(3) is not exempted — the number of active
  recipients on the coordinator's request; the counter — an `open.tsv` item (LAW8).
- `dsa/CHECKLIST_RU/EN.md:76`, `:98`: 14(6) → 14(2).

**Stage check.** The storefront linter, one `Last updated` in both texts, an art. 14(2)
banner on the storefronts.

---

## Stage 4 — outside the documents

**4.1. A one-page letter to a lawyer** (L4): mere conduit or hosting for
`pending_deliveries` with a span of up to 260 min (F1 decided without growing
storage); "reasonably necessary" under art. 4(2); whether P2B applies to venue offers.

**4.2. L5 — art. 18.** Carry out the already promised `dsa_notice.escalated` action
(`dsa/SPEC_EN.md`, audit actions); a log of notifications (the table from the
"Mechanics" lens report); check the Europol address (`dsa/SPEC_EN.md`, addressees); a
letter template. The signal on every new notice — stage 1.

**4.3. L3 — a receipt without email** (F2 decided; a fallback line on storefront
screens 5 and 11 "clear your browser data and you will not see the decision — leave an
email"; the `dsa.article16.no-email` item closes as "delivered without email too"): `dsa_notices.receipt_hash`,
a 128-bit code born on the device, the request for the decision is not signed by the
identity and does not log the address, the same answer and delay for "none" and "not
decided", the hash leaves with the notice (`prune_dsa_records`).

**4.4. Registry.** `open.tsv`: `DSA-reasons-no-mail` and `DSA-report-menu` stay open
until the feed code, due date checked against the checklist's "After launch" section;
`J9` and `DSA-turnover` — out of scope, due 2027-08-05; new items — an external pinger,
an art. 24(3) counter, a venue-profile sweeper (`offers/SPEC_EN.md`, retention).

---

## Order and cost

| Stage | What | Depends on | Cost |
|---|---|---|---|
| 0 | forks F1–F5, checking the norms | — | a questionnaire + ~40 min of checking |
| 1 | watchers | — | ~3–4 h, `relay` code (a separate word) |
| 2 | mechanics on paper | 0 | ~3 h, ~40 files in three repos |
| 3 | legal texts | 0.1, 2 | ~2 h + machine translation of the guidelines into 16 languages |
| 4 | lawyer, art. 18, receipt, registry | 0, 2 | letter ~30 min; receipt ~1 h of spec |

Stages 1 and 2 are independent and can run in parallel. M1 (2.1) goes first inside
stage 2: it is the only 🔴 and blocks pushing `day51` to `dev`.
