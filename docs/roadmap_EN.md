# Roadmap — state as of 2026-09-24

A snapshot of where the product stands as a whole. The detailed work tracker is
[`open-work_EN.md`](open-work_EN.md); the product build order is §13 of
[`chat_EN.md`](chat_EN.md). This file sits one level above both: which layers
exist, which do not, and how that was checked. The snapshot was checked by a
five-lens review panel —
[`reviews/PANEL_2026-09-21_roadmap.md`](reviews/PANEL_2026-09-21_roadmap.md); the 2026-09-22 summary was checked by the consistency lens, and what was built that day by the panels `reviews/PANEL_2026-09-22_*.md` (feed queue, profile, encryption, reissue, support). What was built on 2026-09-23 was checked by the panels `reviews/PANEL_2026-09-23_*.md` (watchdogs C1–C3, stepping away, profile and card, screens, chat, the loop). The 2026-09-24 cut is by measurement (`curl`, `scripts/check-node-images.sh`, `scripts/check-openapi.sh`, `scripts/count-tests.sh`, `scripts/run-depth-ui-tests.sh`, `git`, CI), without a review panel.

`[x]` done and verified, `[~]` partial, `[ ]` ahead. Every claim about a live
environment carries a date and a method. The 7 July 2026 snapshot (Supabase,
"prod later") is replaced in full: none of its infrastructure claims hold any
more. The legal section keeps its number (§2): both storefronts'
`17-offer_*.md` and `legal-review-brief_*.md` link to it.

## Summary

| Layer | Readiness | Verified by |
|---|---|---|
| Storefronts neighbro.place and sosed.place | ~90% | `curl` 2026-09-24: both 200 |
| Panel xor.panov.id | ~80% | 11 pages in `panel/src/pages` (2026-09-22: the feed queue, support); e2e 5, unit 32 |
| Relay node: platform (keys, brands, DSA, mail) | ~70% | `/health` 2026-09-24: `p1-prod`, `database: ok`, `mail: resend`; CI runs all 10 database suites — 276 tests (2026-09-24); open items — §1 |
| Operations: backups, restore, alerts, rollback | ~50% | backups without a key and without the waitlist; restore drill — 2026-08-07 |
| Legal and DSA | ~60% | Bunny transfer outside the EEA is open — §2 |
| Relay node: product, steps 1–4 of §13 | ~60% | step 1 and the profile edit; step 2 — a person gives the verdict in the panel (no model); step 3 — like, take-back, name refusal; step 4 — consent with the ephemeral half; the contract: 97 operations built, 41 spec (measured on the evening of 2026-09-24, after `POST /vault/pin` and `POST /identities/close`; `check-openapi.sh`, by parsing the YAML — `grep` undercounts operations taken through anchors); support is outside the §13 steps: `POST/GET /support`, the team's side, `db/039` |
| Relay node: product, steps 5–8 of §13 | ~40% | step 5 — transport, socket, delivery, close codes; step 6 — direction keys and the reissue; step 7 — blocks, hidden, sweepers; step 8 — not started (games), in place of notifications the inbox with a cursor and the daily support digest; stepping away, `POST/DELETE /away` (2026-09-23) |
| `depth` client (terminal, goes first) | ~65% | core `depth/core/`: signing, registration, profile, feed, like, consent, end-to-end encryption, the key reissue and the safety code against a live node (36 core tests, 39 in the whole `depth/` run counting the screens' strings); Ink rendering since 2026-09-22 — `depth/ink/`: registration, location, feed, phrase, inbox, chat; on 2026-09-23 — the "me" screen with name and age editing, "liked", "blocked", "not now", the chat span and the tombstone, stepping away, the full-screen card, refusals on publishing; arrows and enter only; the storefronts' seventeen languages (`scripts/check-depth-i18n.sh`), 30 screen tests (`scripts/run-depth-ui-tests.sh`, 2026-09-24) and a live walk of the terminal against a node, up to the shared safety code (`scripts/run-depth-live-ui.sh`); an image and the command `scripts/depth.sh` (2026-09-22); the PIN and the paper code are placeholders under `testOnly`, and an identity lives until you quit: the key is non-extractable, so nothing reaches the disk and `depth join` waits for the Argon2id parameters |
| Web app (step 9) | ~5% | only `neighbro.place/prototype/neighbro-app-proto.html` |

The percentages are estimates: they are not weighted by hours, because steps
3–9 have not yet been cut into priced tasks.

## 1. Live environment and operations

- [x] Production is public: `api.relay.panov.id/health` 200, node `p1-prod`,
  image `v2026.9.11-g8f89e7a`, brands `sosed` and `neighbro`. Measured
  2026-09-24.
- [x] Storefronts `sosed.place` and `neighbro.place`, panel `xor.panov.id` —
  200. Measured 2026-09-24. Production shipped 2026-07-27–2026-07-28.
- [x] Supabase left the path on 2026-07-22: state lives in our own Postgres
  beside the node, delivery through Bunny.
- [~] Dev and staging (box n1) answer — measured 2026-09-24
  (`scripts/check-node-images.sh`): dev runs `sha-622a848` of 2026-09-11, that
  is, none of `day56`; staging answers but does not name its build. Boxes `n2`
  and `n3` are declared in the inventory with no machines.
- [~] Article 16 notice intake — the host `report.relay.panov.id` is alive
  (`/health` 200, `p1-prod`, measured 2026-09-24 — **from Bunny's cache**: the zone serves `/health` and `/ready`
  with `max-age=2592000`, `cdn-cachedat 09/23/2026`, the node is not asked — `report.zone.cache`), route `POST /report`; not
  yet shipped to the storefronts in production. Why it moved: the WAF on every
  zone cuts bodies quoting `<script>` or `../`, and the zone has zero custom
  rules (`open-work_EN.md`, G12/G13).
- [ ] **Roll out `day57`.** `day56` was pushed in full on 2026-09-24
  (`b74b60a`); `day57` on top of it is ahead of `origin/dev` (`cd21688`,
  2026-09-19); the counts of commits and of unpushed ones are
  `git rev-list --count origin/dev..day57` and `origin/day57..day57` on the day
  of the rollout, not from here (panel 2026-09-24).
  Migrations `022`–`046` have not been applied anywhere: the dev
  (`sha-622a848`) and production images end at `021`, staging at `010` (by the
  pinned tags in `relay/wizard/environments.toml`; `schema_migrations` on the
  boxes was not queried). The draft pairs were squashed on 2026-09-24 in
  `day57`: `035` into `030`, `036` and `038` into `031`, `037` into `032`,
  `040` into `039` (9 files into 4, 16 into 11 across `030`–`045`, no
  renumbering), so `day57` is what rolls out, not `day56`. A merge into `dev`
  ships only the panel (`deploy-dev.yml`); node n1 goes by
  `scripts/deploy-relay-dev.sh` after a green build-push. Start with dev (n1),
  not production.
- [x] The node's CI runs every database suite: the list is taken from the
  `--ignore` of `relay/node/deno.json`, 10 suites, 276 tests (`f142f18`,
  2026-09-24; before it, 9 of the 10 ran only locally). A deliberate break in
  `queue_metrics.test.ts` went red naming the file.
- [ ] **Two production defects are fixed by rolling out `day57`** (found by
  the loop on 2026-09-24): a `/v1` repeat with an `Idempotency-Key` answers 200
  with no body (`acb7dca`); Article 16 notice snapshots sit in
  `dsa_notices.snapshot` as a jsonb string, so the panel shows the moderator
  an escaped line instead of the evidence (`4e54c91`, `db/046` unwraps the
  rows). The storefronts send no idempotency key, so the first touches only
  `/v1` clients. In the test database the class is caught by the last step of
  the run: no jsonb column in the schema holds a string
  (`tools/check_jsonb_strings.ts`). Production has no such step: after the
  rollout run the same tool in the node's container and expect zero; a
  snapshot the old image writes during the migration window or a rollback is
  still shown as the object by the queue (`routes/dsa.ts`).
- [ ] `NOT NULL` on the published centre (P5) — only in the rollout after
  `027`, never in the same one.
- [~] Nightly backup encryption (P4): the mechanism shipped 2026-09-21
  (`4a4da9b`); no key on the boxes yet — an owner action: the public half into
  `backup.env` on p1 and n1, the private half from its file into the password
  vault. Until then, backups are plaintext. As of 2026-09-24 the private half
  is still a file.
- [ ] L1: the waitlist is not in the backup — it lives in Bunny storage, and
  the backup takes only Postgres.
- [~] Restore drill — last on 2026-08-07 (`scripts/verify-backup-restore.sh`).
- [x] Watchdog W3 — queue jobs that ran out of attempts are re-armed every hour,
  and a node started without its database arms them without a restart; a
  `prune_dsa_records` tombstone is a letter to `DSA_ESCALATION_EMAILS`, one per
  tombstone (`scheduled.ts` `rearmPass`, `lib/tombstone_watch.ts`, `db/042`, 6 tests
  against Postgres, 2026-09-23). Not shipped.
- [~] Alerts: `relay/local/observability/alerts.yml` and the gate
  `scripts/check-metrics-exist.sh`, runbook `runbook-node-down_*.md`; not
  verified to fire in production.
- [~] Rollback — the procedure exists (`relay/RELEASE_EN.md`, the previous
  `:vX.Y.Z`), never exercised on a live environment.
- [ ] Per-address rate limits live in node memory: they do not survive a
  container rebuild and are not shared between nodes.

## 2. Legal and DSA

- [x] Terms, Privacy, Community Guidelines; operator PSYTICAN & PEJEDED. Both
  storefronts' `support@` addresses are live per the Article 30 register.
- [x] Article 30 GDPR record of processing (`article-30-register_EN.md`); its
  GA4 row is marked "live production not verified".
- [x] Breach procedure, 72 hours per Article 33 GDPR
  (`breach-procedure_EN.md`).
- [x] Mail: Resend on staging and production, Mailpit on dev.
- [~] DSA notice and decision register in the panel, `GET /statements` —
  not whole in production until `day56` and the Article 16 intake ship. P3
  closed 2026-09-21: the list has an `after` cursor, statements past the
  hundredth are reachable.
- [~] Watchdog W1 — the age of Article 16 notices (`watchdogs_EN.md`): a letter
  past 24 hours, an escalation past 48, one per threshold, a letter that did not
  leave retried in 10 minutes; `lib/dsa_watchdog.ts`, migration `db/041`, 7 tests
  against Postgres (2026-09-23, panel `reviews/PANEL_2026-09-23_watchdog-c1.md`).
  Missing — a fallback transport for the escalation, and the
  `DSA_ESCALATION_EMAILS` addresses are not set on the boxes; not shipped.
- [~] Watchdog W2 — an arrival letter that did not leave is retried by a
  standing job every 10 minutes; after 8 failures, a letter to
  `DSA_ESCALATION_EMAILS`; every new notice is copied there at once (the night
  path, at most 6 an hour, the rest as one summary after the hour; owner, 2026-09-23).
  `lib/notice_notify.ts`, `db/043`–`044`, 15 tests against Postgres
  (2026-09-23). Missing — the fallback transport; not shipped.
- [x] A notice's one-year term leaves an anonymous count: `prune_dsa_records`
  deletes and counts by month and kind of target (`db/045`
  `dsa_notice_counts`, 2026-09-23), as the privacy policy and `dsa/SPEC` §9
  promise. Not rolled out.
- [ ] **Bunny transfer outside the EEA: no SCC** (GDPR Chapter V, Art. 44–46) —
  `article-30-register_EN.md`. SCC or a replacement.
- [x] LAW-7: the abandoned-identity sweeper — built 2026-09-20
  (`lib/identity_sweeper.ts`: a year without a session closes, 30 days later
  deletes; tests `identity_sweeper.test.ts`). Until 2026-09-21 this line and the
  Article 30 register said "not built" — a quorum of agents picked it as the next
  piece, and reading the code showed it was already there.
- [ ] J9: recheck micro-enterprise status **by 2027-08-05**. The Art. 19(1)
  DSA exemption from Art. 20–28 depends on it. There are no transparency
  reports on the same ground (Art. 15(3), 19(1)); on request — Art. 24(3).
- [ ] Legal review of the Terms (13+ together with offline meetups).
- [ ] Legal analysis of saved offers (filed 2026-08-29), three questions:
  what binds the venue when `discount_until` on a saved card has passed; what
  to do with the copy of an offer removed after a complaint; whether a saved
  card is an offer or an invitation to make offers. Details —
  `legal-review-brief_EN.md`.
- [~] The Article 17 statement-of-reasons screen for an author without
  email — drawn 2026-09-21 (frames U, V, W of
  `panel/design/sheets/screen-06-07-10.svg`, the owner's decisions in screens
  9 and 14 of the storefronts). Built in the terminal on 2026-09-23
  (`depth/ink/rooms.ts`, `Statements`; three screen tests, seen red);
  no web client yet.

## 3. Product: build order (§13 of the chat spec)

The terminal goes first; the web is the last step, over a protocol already
proven. The server is built ahead of the client; the client is the `depth/core/`
core without drawing, against a live node (since 2026-09-21).

| Step | Server (`xor.ad/relay/node`) | `depth` client |
|---|---|---|
| 1. Identity and session | [x] migration `db/022`; `POST /identities`, `/vault/*`, `/sessions/*`, `/recovery/*`, `PATCH /identities/me` (2026-09-22: the name to the queue, frozen while a phrase lives or a chat is open, age across 20/21 upward only, the filter inside the band; the `name_verdict` frame goes to the author's open rooms since 2026-09-24, no `filter_modes` — the field's meaning is not written down); P2 closed 2026-09-21; `GET/PUT /identities/appearance` — theme, contrast and accent on the node (2026-09-23); `phrases` in `GET /identities/me`; not rolled out | [~] core: registration and the paper code against a live node; PIN, code and share are placeholders; the "me" screen: name and age editing with the approved refusals (2026-09-23) |
| 2. Feed and geo | [~] migrations `db/025`–`029`; `POST/GET/DELETE /feed`, `/feed/density`, delivery by circles; **no moderating model wired**; a person gives the verdict: `GET /admin/feed-queue` and `POST …/publish`, `…/refuse` are built on the node (2026-09-22, `routes/feed_queue.ts`, five tests), the panel's queue page is built (`panel/src/pages/feed-queue`, mockup `panel/design/feed-queue-mockup.svg`, an e2e verdict test against the stand); refusing the name apart from the phrase is built (2026-09-22: `refuse-name`, the phrase waits for a new name, a match requires `accepted`) — `publish()` is called by hand from that page, only the sweeper runs unattended (`lib/feed_verdict.ts`); the name check at first publication depends on it too; the author's age is computable — accepted cost P1; the `soon` flag in the last 65 minutes of someone else's phrase (2026-09-23); the circle is a choice of delivery, not an access boundary (S1, risk accepted 2026-09-23); not rolled out | [~] core: a phrase and the feed with its cursor; the full-screen card, the node's refusal on publishing in `refusal-wordings`' words (2026-09-23) |
| 3. Likes | [~] `likes` — `db/030`; `POST /feed/:id/like` (2026-09-21): band, block, self-like without an oracle, a match on a mutual like; `DELETE` — a take-back until a match, else `spent`; a limit of 300 an hour; a sweep of expired matches every minute; missing — the offer's match (unblocked 2026-09-22: `publish` in the queue accepts the name with the same verdict, `name_state = accepted` is the "name checked" mark; the offer's match itself is not built yet); the two-connection test of crossing likes exists since 2026-09-24 — without the pair lock the match is lost, with it the match is made (`feed_publish.test.ts`); liked phrases left the feed for `GET /likes` (2026-09-23) | [~] core: like and take-back; the "liked" screen (2026-09-23) |
| 4. Match and double consent | [~] `db/030`; `POST /matches/:id/consent` (`waiting`/`agreed`), "not now" and its undo (2026-09-21); `agreed` opens no chat until step 5, the ephemeral key is step 6 | [~] core: consent and "not now"; "not now" and "undo" on the inbox screen (2026-09-23) |
| 5. Chat: transport | [~] `db/031`: `chats`, `chat_participants`, `chat_starters`; both consenting opens the chat and answers its `chat_id`; `db/032` `pending_deliveries`, sending a ciphertext (202 with no signal of presence) and confirming receipt (2026-09-21); a queue ceiling of 200 pushing out the oldest in silence and a sweep of rows past 260 minutes; `db/033` tickets and the `GET /chat` socket: what waits on connecting, what is new through `NOTIFY`, two `depth` terminals exchange a ciphertext; the end of a conversation — `DELETE /chats/:id`, one's own term, the `sweep_chats` job, the room closes 4003 (2026-09-21); the term's `PATCH`, `POST /chats/alive`, `GET /inbox` (matches and conversations, one's own `my_span`; no `offer_interest`, no second page); stepping away, `POST/DELETE /away` (2026-09-23); a node stopping closes its rooms with 1001 (`main.ts`, `closeAllRooms`; was "missing — 1001" [retired]) | [~] `depth/ink` (2026-09-23): one's own chat span and countdown, the tombstone on 4003, stepping away in full and the "stepped away" mark on a peer; the room reconnects on 1001, 1011 and 1006 after a jittered pause, takes a new ticket on 4001, and a line handed twice is shown once (`depth/core/reconnect.ts`, 2026-09-24); no screens for 4002 and 4004 |
| 6. Encryption | [~] the ephemeral half, signed by the long key, rides on consent (`db/030`, `routes/matches.ts`); the inbox hands over the peer's half, long key and `me` (2026-09-22); the reissue after a lost pair — `POST /chats/:id/rekey`, the epoch in `db/031` (2026-09-22); missing — `chat_key_wraps` (the web face needs them, not a terminal without a disk) | [~] `depth/core/seal.ts`: ECDH P-256 → HKDF (salt `chat_id`) → two direction keys, AES-GCM with a 96-bit nonce; `Client.consent` publishes the half, `openConversation`/`sayInChat`/`read`; an end-to-end test of two terminals against the node, a reflection does not open (2026-09-22); missing — wraps under the session key, and Ink |
| 7. Blocks, hiding, sweeping | [~] `POST`/`GET`/`DELETE /blocks` (2026-09-21): by a phrase or a conversation, 204 with no oracle, a `nonce` against replay, the match goes and the conversation ends for both with the room closed 4003; sweepers of matches, the queue and conversations; `db/034` and `/hidden` — hide a phrase for oneself and bring it back; missing — blocking and hiding a line at a table (there are no tables) | [x] `depth/ink` (2026-09-23): "hide" and "block" in the feed, the hidden list with a way back, "end the conversation" and "block" in the chat; blocking asks twice and names what it costs; the core gained `hide`, `hidden`, `unhide`; the "blocked" screen with lifting (2026-09-23) |
| 8. Notifications and games | [ ] | [ ] |
| 9. Web face | — | [ ] prototype exists, app does not |
| Offers (outside §13) | [~] `db/050`: `advertisers`, `venues`, `offers`; `GET /o/:code` (the interstitial: the domain and whether the link is off) and `/o/:code/go` (302, a count with no person, previewers and HEAD not counted, a limit per address), 9bfb5f0 and a62bbb9; the link goes out with the offer too — hidden by complaints or its discount over, decided by quorum on 2026-09-24 (98e0c84); not yet — complaints about a link `/o/:code/report` (waits for the letter to the venue under Art. 17), the `/adv/*` dashboard | [ ] |

All eleven tables of the first cut (§13) exist: six before 2026-09-21, `likes`,
`matches`, `match_participants`, `blocks` by migration `db/030`, `support_requests`
by `db/039` (2026-09-22). Migrations in `relay/node/db` — 46 files, the last `054` (measured late on the evening of 2026-09-24; 43 and `051` in the evening [retired]; was "37, the last `045`" after the squash [retired]).

Chat code was cleared by the owner's word on 2026-09-21.

**Built on 2026-09-24, not rolled out** (git `day57`): changing the PIN `POST /vault/pin` (63ac60e), "start over" `POST /identities/close` (dd16011), a new paper code `POST /recovery/reissue` (dd40dc6), the legal revisions `GET /legal/manifest` and `POST /legal/accept` (29cdd5d); the request dispatcher moved to `relay/node/src/dispatch.ts`, and HEAD is checked through it (b6819f5); `/ready` answers 503 for a staging or prod node with no database (d60fdac); DELETE `/away` no longer wakes the rooms a second time after the minute's job (19a014d). 571 tests (`scripts/count-tests.sh`, the evening of 2026-09-24).

## 4. Storefronts and panel

- [x] Landing pages of both storefronts: themes, accents, i18n, waitlist,
  `legal.html`.
- [x] App screen mockups are assembled from the kit (`panel/design/sheets`,
  `panel/design/kit`), with a gallery and text gates.
- [x] Panel: link sign-in, API keys and secret keys with quotas, brands, panel
  users, waitlist, logs, DSA notice register.
- [ ] Translation of the app strings: only a language selector exists, in the
  prototype.

## 5. Review panel leftovers, 2026-09-21

The first panel (`PANEL_2026-09-21_steps1-2.md`) is closed in full. The second
(`PANEL_2026-09-21_day-fixes.md`) is closed in full on 2026-09-21: task 7 by
`6dd62de`, 8 by `ae65510`, 5 by `2bde94b`. The 2026-09-23 panels
(`PANEL_2026-09-23_*.md`, eight reports): findings were closed the same day by the
"Close what the panel found…" commits; the reports were not checked line by line
in this cut.

## Open questions

- Minimum age: 13+ now; a lawyer may insist on 16+. The Art. 8 GDPR consent
  threshold applies only to processing based on consent.
- The accent set and the brand reference typeface — open in the 7 July
  snapshot; whether they were settled has not been checked.
