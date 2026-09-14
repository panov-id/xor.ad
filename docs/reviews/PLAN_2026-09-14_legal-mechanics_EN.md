# Plan v0 — the legal part, then the mechanics, 2026-09-14

A draft before the panel. Gathered from what stayed open after
`PANEL_2026-09-14_day51.md` (the lead's summary, the task cut) and from the legal
and product items of `docs/facts/open.tsv`. Line numbers are at `xor.ad` d42485b,
`sosed.place` ea70556, `neighbro.place` 6eb0053. The storefronts are edited as
mirrors.

This is a plan, not an edit. It goes through the lenses, is rewritten after the
panel into a detailed plan v1, and only v1 is executed — on a separate word.

## Selection principle: by itself, without us

The team is one or two people. Any obligation that holds only because one of us
read, decided and pressed is an obligation that one day will not be kept: a
holiday, an illness, a night. So every item of the plan asks the same question:
**can this resolve by itself — by a rule, a span, a threshold, a sweeper — with a
team member stepping in only where the law demands it or where the cost of an
automatic mistake is irreversible.**

Three levels, most desirable first:

1. **By itself by construction** — nothing to decide: the data is not there, the
   span runs out, the threshold fires, the sweeper deletes.
2. **By itself, reversible by a human** — the automatic action happens at once, is
   reversible, carries a statement of reasons and a way to object; a human looks at
   samples or on objection.
3. **A human is required** — only where a norm says so directly (e.g. DSA arts.
   16(6) and 17 on decisions, art. 18 on notifying authorities) or where a mistake
   is irreversible for a third party.

Not critical, but that is the aim: an item left at level 3 names why not lower.

## Order

The legal part (L) first, then the mechanics (M). The mechanics may require
correcting a legal promise, and then the L item is reopened in this same plan, not
the next one. Separately — autonomy (A): where the product is waiting for us today.

---

## L — the legal part

### L1. The terms lag behind the mechanics (DSA art. 14)

**Now.** The published `sosed.place/landing/legal/terms_EN.md` is simpler than what
the product does:
- `:77` — an offer link is switched off "on report", while the spec
  (`offers/SPEC_EN.md`, S14) switches it off automatically only after two reports
  from people who have posted, the rest going to a moderator;
- `:64` — "posting quotas" with neither the hourly limit nor the fifteen-minute pause
  after five automated refusals;
- `:76` — does not name "one live offer per private person" or the duplicate ban;
- passes, spectators and turn order at a table are not in the community guidelines.

**Direction.** One sentence per restriction, naming its automated nature and the way
to object. Table rules go into `community-guidelines_*` (10 and 19 languages in the
two storefronts).

**Autonomy.** Level 1: text once, then by itself.

**Open for the lenses.** Translating the guidelines into 19 languages — who and how,
without hand-proofing each.

### L2. The privacy policy lags behind the schema (GDPR art. 13)

**Now.** `privacy_EN.md:41-44`:
- `stepped_away_at` / `stepped_away_until` are not named;
- a support request: "1 year", but neither the purpose after the link to the
  identity is broken nor the deletion of a report moved into art. 16 is named;
- `support_requests.seen_at` — a timestamp where a fact would do (P6, ⚪).

**Direction.** Lines in the data and retention list; `seen_at` → `seen boolean` or a
fact on the device.

**Autonomy.** Level 1, provided the sweepers from A exist.

### L3. A decision on a notice without email (art. 16(4)–(5))

**Now.** `dsa.article16.no-email` (now, legal): the decision goes by email only, the
notifier's identity is not linked. Screen 11 warns since 2026-09-14 "without an email
the decision will not reach you". The conditionality of 16(5) is a non-lawyer's
inference.

**Direction — a fork for the lenses:**
- (a) leave as is and get a lawyer's view;
- (b) a one-time receipt code on the device: a notifier without email sees the
  decision by the notice number, and the node does not know whose receipt it is;
- (c) something else.

**Autonomy.** (b) — level 1: delivery without email and without a human.

### L4. Mere conduit or hosting (DSA arts. 4–6)

**Now.** `dsa.conduit.or.hosting` (now, legal): the node holds undelivered ciphertext
until delivery or the end of the conversation. Art. 16 duties for conversations
depend on the classification.

**Direction.** Put the question to a lawyer on one page; do not extend storage until
the answer.

**Autonomy.** Not about automation — about the duty not arising.

### L5. Notifying authorities (art. 18)

**Now.** `dsa.article18.route` (now, legal): the addressee was found but not
confirmed, and the fact of notifying is recorded nowhere.

**Direction.** A log of art. 18 notifications (a table or a record in the notice
register) and a letter template.

**Autonomy.** Level 3 by the norm: a human decides "a threat to life is suspected".
Everything around it is automated — the template, the log, the reminder.

### L6. Statement of reasons without email and the "report" item

**Now.** `DSA-reasons-no-mail`, `DSA-report-menu` (at launch, legal).

**Direction.** Check that screens 5, 9, 11 and 17 already cover them, and close the
registry items if so.

**Autonomy.** Level 1.

### L7. Pauses and refusals as a "restriction" (art. 17)

**Now.** The fifteen-minute pause after five automated refusals is a debatable
candidate for a "restriction" under art. 17(1) (refuter B, P5). The pause text says
nothing about automation or objection.

**Direction.** The pause text says "the decision is automated" and gives the way to
object, as a pre-publication refusal does.

**Autonomy.** Level 2: the pause by itself, the objection by procedure.

---

## M — the mechanics

### M1. 🔴 "Forgot PIN?" — the paper code only (S1)

**Now.** `sosed.place/docs/12-identity-and-security_EN.md` ("forgot PIN?") and
`11-empty-and-edge-states_EN.md` (tenth PIN mistake) allow a new PIN without the
code; the canon `xor.ad/docs/chat_EN.md` (burned share → paper code only) does not.

**Direction.** The link and the tenth mistake lead to recovery with the paper code.

**Legal link.** None. **Autonomy.** Level 1.

### M2. An 8-hour step-away outlasts any conversation (S2/D1/D2)

**Now.** The longest conversation span is 260 minutes (`chat_EN.md`,
`idle_ttl_minutes`); the texts promise that "long ones survive" and "what is written
waits".

**Direction — a fork for the lenses:** an honest price, or a third step ≤ 4:20.

**Legal link.** L1 if the step-away is mentioned in the terms. **Autonomy.** Level 1.

### M3. Storage for rules already promised (D4, D5, S7/D6)

**Now.**
- the rolling hour of refusals is one `rejected_count integer`;
- "4 publications per hour" has nothing to count from after phrases are `DELETE`d;
- "a report from someone who has posted" has no attribute.

**Direction.** Moments of refusals and publications (an array or a table with a
sweep), `first_published_at` in `identity_stats`.

**Legal link.** L1 (the terms name these rules), L2 (new data goes into the policy).
**Autonomy.** Level 1: windows run out by themselves.

### M4. What the pause blocks (S5)

**Now.** Canon: "sending"; screens: "only new phrases"; the counter is also fed by
table lines.

**Direction.** One rule in all three places.

**Legal link.** L1, L7.

### M5. The "stepped away" label: NULL and delivery (S3/S4)

**Now.** The rule `last_own_message_at < stepped_away_at` is undefined for NULL; how
the label reaches the peer is not described.

**Direction.** The whole expression, a boolean field in the open-chat response,
clearing `stepped_away_at` when no conversation needs the label.

**Legal link.** L2 (retention of `stepped_away_at`).

### M6. Support: rate limit and number (S13), indexes (D9), the name as an oracle (S6)

**Direction.** A per-identity request limit in `limits.tsv`; a random visible
number; indexes on `identity` for the first migration; a refused name feeds the
refusal counter.

**Autonomy.** S13 — level 1: the limit stops by itself a stream that would otherwise
be handled by hand.

---

## A — autonomy: where the product is waiting for us

Candidates found by searching the specs; the lenses add to it.

| Place | Now | Level now | Candidate |
|---|---|---|---|
| `sosed.place/docs/14-support_EN.md` (logic) | "no automated handling — a notification to the team" | 3 | common questions answer themselves; a human only for what the answers did not close |
| `xor.ad/docs/offers/SPEC_EN.md` (venue suspension) | a moderator sets `suspended` by hand | 3 | a threshold of upheld reports within a window → automatic suspension with objection |
| `offers/SPEC_EN.md` (link reports) | reports from people who have not posted wait for a moderator | 3 | ? |
| `offers/SPEC_EN.md` (offer formality) | "the formality of an offer is judged by a moderator" | 3 | ? |
| `offers/SPEC_EN.md` ("hide at once") | a moderator's tool | 3 | stays as a manual lever, not as the path |
| `chat_EN.md` (actions table) | a report on a conversation → moderator by procedure | 3 | art. 16 — a human's decision? for the lens |
| `open.tsv` `identity.sweeper`, `support.sweeper`, `table.sweeper`, `chat.janitor.missing` | no sweepers | — | every span held by the scheduler, not by people |
| `open.tsv` `moderation.queue.throughput` | throughput not measured | — | a refusal on timeout instead of hand-clearing the queue |

---

## What the panel must produce

- for every L and M: confirmation, a corrected direction, or removal;
- forks L3 and M2 — options with a price for a questionnaire;
- table A — filled in: level, why not lower, what it takes to lower it;
- an execution order for v1, given that L reopens from M.
