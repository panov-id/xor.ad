# Roadmap — state as of 2026-10-03

A snapshot of where the product stands as a whole. What is open — the registry
[`facts/open.tsv`](facts/open.tsv); the build order — §13 of
[`chat_EN.md`](chat_EN.md). This is one level above: which layers exist, which
do not, and what proved it. The 2026-10-03 cut was checked against the
`comic-web` branch = `d373afde` (the web face, brands and themes); the other layers against
the 2026-09-29 cut (`day58` = `941388f0` plus T18 `e16c71bd`, the crew board, waves 4–8);
measurements of 2026-09-29, for the web and migrations 2026-10-03 — `curl`, `scripts/count-tests.sh`,
`scripts/check-openapi.sh`, `ls relay/node/db`, `scripts/run-relay-database-tests.sh`,
`scripts/run-e2e-paths.sh`, `scripts/run-depth-tests.sh`,
`scripts/run-depth-ui-tests.sh`, `git`. Earlier snapshots (2026-09-27 and before) are replaced whole; the `open-work` tracker and the test map are no
longer maintained by hand since 2026-09-26 and sit in `archive/`.

`[x]` — done and verified, `[~]` — partial, `[ ]` — ahead. Every claim about the
live environment carries a date and how it was measured. The live environment
runs image `v2026.9.11-g8f89e7a` (built 2026-09-11): everything below marked
with a later date exists in the `day58`/`salvage-wave6` code and is proven by tests, not on the
live node. The legal section keeps its number (§2): `17-offer_*.md` of both
storefronts and `legal-review-brief_*.md` point at it.

## Summary

| Layer | Readiness | Verified |
|---|---|---|
| Storefronts neighbro.place and sosed.place | ~90% | `curl` 2026-09-29: both 200 |
| Panel xor.panov.id | ~80% | 200 (`curl` 2026-09-29); 11 pages in `panel/src/pages` (`ls` 2026-09-29: keys, brands, DSA notices, the feed queue with the model's hint, logs, panel users, secret keys, support, waitlist, sign-in and its callback); unit 39, e2e 5 (`count-tests.sh` 2026-09-29); the moderation path in the browser is green and red with the moderator's decision broken (`E2E_PATHS_ONLY=moderation-path scripts/run-e2e-paths.sh --breaks`, 2026-09-29); three pages — the tables queue, envelopes, DSA recipients — are mockups only |
| Relay node: platform (keys, brands, DSA, mail) | ~75% | `/health` 2026-09-29: `p1-prod`, `database: ok`, `mail: resend`, `storage_transport: bunny`, image `v2026.9.11-g8f89e7a`; 875 tests, of them 821 in the node (`count-tests.sh` 2026-09-29); with the database 580 in 37 suites, no failures (`run-relay-database-tests.sh` on `fb260ef1`, 2026-09-29); the contract — 151 operations, 145 built, 6 spec, the API pages match the spec (`check-openapi.sh` 2026-09-29); 70 migration files, the last `083` (`ls relay/node/db`); what is open — §1 |
| Operations: backups, restore, alerts, rollback | ~50% | backups without a key and without the waitlist; restore drill — 2026-08-07; alert rules with `promtool` probes, alert counters seeded at zero on start |
| Legal and DSA | ~60% | the Bunny transfer outside the EEA is open — §2 |
| Relay node: product, steps 1–4 of §13 | ~75% | step 1 — identity, PIN, code, move, the tenth PIN miss takes down what is live; step 2 — the first tier of §8.3 (rules) decides in the request, a flagged phrase waits for a person in the panel; the moderator model behind the `MODERATOR_URL` flag (`lib/moderator.ts`) puts a hint next to the person's queue and decides nothing itself (measured 2026-09-27, `docs/measurements/moderator-2026-09-27_EN.md`); step 3 — like, take-back, name refusal, a match from an offer; step 4 — consent with the ephemeral half |
| Relay node: product, steps 5–8 of §13 | ~70% | step 5 — transport, socket, delivery, close codes, the `closed` frame; step 6 — direction keys, rekey, wraps under the session key; step 7 — blocks, hidden, sweepers; step 8 — notifications as inbox events, `GET /inbox?since`, derived from the tables; tables of seven game classes (`dots`, `grid`, `deck`, `word`, `dice`, `free`, `physics` — `grep` over `relay/node/src/lib` 2026-09-29) on the socket, tables in the feed; the venue cabinet `/adv/*` and the offer complaint (Offers below); a daily support digest |
| `depth` client (terminal, goes first) | ~75% | core `depth/core/` against a live node — 121 tests, no failures (`run-depth-tests.sh` 2026-09-29 on `e16c71bd`); Ink screens — 98 in three suites (78, the table 16, a game in the conversation 4), no failures (`run-depth-ui-tests.sh` 2026-09-29); a game in the conversation, the offer complaint from a feed line; the conversation's key reissue on screen — one side asks, the other is shown the question and agrees (T16, T18: a test of two screens and a step against a live node in `run-depth-live-ui.sh`); the inbox is read past the first hundred by `next` (T15, `depth/core/inbox_pages.test.ts`); the mixed path — one in the terminal, the other in the browser against one node (`run-e2e-paths.sh`, path `mixed-depth`); the PIN and the paper code are real, `depth restore` and `depth move` both ways, a new code from "me"; a lock after 5 minutes without input, opened with the PIN through `POST /vault/share`, screens for 4002 and 4004; raised by the paper code on the same device — keep the PIN or set a new one through the grant (all 2026-09-26); 17 languages (`check-depth-i18n.sh`) |
| Web application (step 9) | ~80% | the web face `web/` on `depth/core`: registration with a PIN and the paper code, unlocking with the PIN after a reload, the feed, the composer, the card, "liked", the inbox, the match with consent, an end-to-end encrypted chat, the "me" screen, raising and reissuing the code, the move to another device, hidden and blocked as lists, tables and a game in the conversation, the venue cabinet, the offer complaint from the offer's card in the feed (WS3); screens are the brands — sosed "blocks" and neighbro "stickers" — on themes from JSON, the reference is the brands' sheets `panel/design/sheets-<brand>/`, the gate `scripts/check-web-design.sh` compares against them ([`design/web-vs-sheets_EN.md`](design/web-vs-sheets_EN.md)); dictionaries in 17 languages (`ls web/src/locales` 2026-09-29), `web.*` keys outside ru are a copy of the Russian (`owner.md`); e2e in Docker — 64 tests in 53 specs, per brand 55 passed and 9 skipped (run of `scripts/report/webshots.sh` 2026-10-03); the role paths against a live node in one run `scripts/run-e2e-paths.sh`: `two-people`, `two-devices`, `mixed-depth`, `decline-expire`, `venue-path`, `moderation-path`, each with a control break of its own (`--breaks`); missing — a language switch, the offer's life bar in the inbox, a screen for the tenth PIN miss; the complaint about an offer's link is made only from the card in the feed, the exit screen has none (the owner's decision of 2026-10-01, `c026fd10`) |

The percentages are expert estimates: they are not weighted by hours, because
there is no priced breakdown for steps 3–9 yet.

## 1. Live environment and operations

- [x] Prod is public: `api.relay.panov.id/health` 200, node `p1-prod`, region
  `eu-nuremberg`, image `v2026.9.11-g8f89e7a`, brands `sosed` and `neighbro`.
  Measured 2026-09-29 (`curl`).
- [x] Storefronts `sosed.place` and `neighbro.place`, panel `xor.panov.id` — 200.
  Measured 2026-09-29 (`curl`). Prod opened 2026-07-27–2026-07-28.
- [x] Supabase left the path on 2026-07-22: state in our own Postgres next to
  the node, delivery through Bunny.
- [~] The dev and staging environments (box n1): pinned tags in
  `relay/wizard/environments.toml` — dev `sha-622a848` (2026-09-11), staging
  `v2026.8.14-gc3d10fb` (the file checked 2026-09-29); n1's live answers were not taken. Boxes
  `n2` and `n3` are declared in the inventory without machines.
- [~] Article 16 notice intake — host `report.relay.panov.id` answers 200
  (`curl` 2026-09-29; the zone serves `/health` from the Bunny cache — `report.zone.cache`
  in `facts/open.tsv`), route `POST /report`; the storefronts are not switched to it.
  Why a separate host: the WAF of every zone cuts bodies quoting `<script>` or
  `../`, and the zone has zero rules of its own.
- [x] The node's gates run the database suites from one list
  (`relay/node/deno.json`, the single source since 2026-09-26); the full database
  run on `fb260ef1` on 2026-09-29: 580 in 37 suites, no failures
  (`scripts/run-relay-database-tests.sh`); the cabinet's test signs in by the link
  in the letter caught at Resend, and goes red when the letter did not leave or left
  with a dead link (T12, V4, `relay/node/test/adv.test.ts`).
- [~] The role paths in the browser against a live `relay/local` in one run
  `scripts/run-e2e-paths.sh`, each with a control break of its own in the node
  (`--breaks`; a path red without its break is a spoiled run). Nine paths
  (`grep` over `PATHS` 2026-09-29): `two-people`, `decline-expire`, `two-devices`,
  `venue-path`, `offer-complaint`, `mixed-depth`, `moderation-path`, `chat-end`,
  `decline-undo`. The break is undone on any exit of the run, a broken-off one
  too; results older than a day are swept (T10, `089cd33f`). The result of all nine
  with their breaks is taken by the coordinator after the merge; this cut did not
  repeat it.
- [x] The schema upgrade path `021` → `063` over a non-empty database is held by
  tests (2026-09-26): backfills `027`/`028`/`047`/`049` over live rows, starts from
  several levels; migration hygiene is a gate (`IF NOT EXISTS`, `NOT NULL` without
  `DEFAULT` and a backfill, numbering), old violations listed.
- [~] The live image of 2026-09-11 answers a `/v1` replay with `Idempotency-Key`
  200 without a body and holds Article 16 notice snapshots as a jsonb string; both
  are fixed in the `day58` code (`acb7dca`, `4e54c91`, `db/046` unfolds the strings),
  and in the test database the class is caught by `tools/check_jsonb_strings.ts`.
- [ ] `NOT NULL` for the published centre is not on
  (`feed.published.notnull` in `facts/open.tsv`).
- [~] Encryption of nightly backups: the mechanism was built on 2026-09-21
  (`4a4da9b`), there is no key on the boxes — the owner's action
  (`backup.encryption` in `facts/open.tsv`). Until then the backups are plaintext.
- [ ] The waitlist is not in the backup — it lives in Bunny storage, and the
  backup takes only Postgres.
- [~] Restore drill — the last on 2026-08-07 (`scripts/verify-backup-restore.sh`).
- [x] Watchdogs C1–C3, C6, C7 are built (`watchdogs_EN.md`): the age of Article 16
  notices, the retry of a letter that did not go, re-arming queue jobs and the
  `prune_dsa_records` tombstone, the moderation queue's age per brand with a letter
  from the node no more than once a day (2026-09-26), the C7 letter. The tenth PIN
  miss's minute job counts what it did, logs the error code and raises two alerts —
  a take-down put off and one that keeps failing (2026-09-26).
- [x] Alert rules (`relay/local/observability/alerts.yml`) — each with a `promtool`
  probe, a gate "rule without a probe"; alert counters are seeded at zero on start,
  so the first event is visible (2026-09-26). The alerts' work on prod is not verified.
- [~] Rollback — the procedure exists (`relay/RELEASE_EN.md`, the previous
  `:vX.Y.Z`), never rehearsed on the live environment.
- [~] Per-address rate limits live in the node's memory: they do not survive a
  container being recreated and are not shared between nodes. An IPv6 address is
  counted by its /64, IPv4 inside IPv6 (`::ffff:`, NAT64 `64:ff9b::/96`) — in the
  same bucket as bare IPv4 (2026-09-26, decided by quorum); the per-address limit on
  entering move codes is no higher than the node's overall brake, so one address
  cannot pause everyone.
- [ ] Scrubbing addresses in the node's log: e-mail is cut out, the client IP and
  the database `address:port` reach the log; a draft without a speed measurement — open.

## 2. Legal and DSA

- [x] Terms, Privacy, Community Guidelines; operator PSYTICAN & PEJEDED.
  The `support@` addresses of both storefronts are live per the Article 30 register.
- [x] Article 30 GDPR processing register (`article-30-register_EN.md`); its GA4
  line is marked "live prod not verified".
- [x] Breach procedure, 72 hours under Article 33 GDPR (`breach-procedure_EN.md`).
- [x] Mail: Resend on staging and prod, Mailpit on dev.
- [~] The register of DSA notices and decisions in the panel, `GET /statements`
  with an `after` cursor; the live node has no Article 16 intake, so the register
  there is empty.
- [x] The Article 16(5) decision letter: a delivery mark, a retry by a standing
  job, after 8 failures — a lasting trace (`db/058`) and an alert (2026-09-26).
- [x] Watchdog C1 — the age of Article 16 notices: a letter after 24 hours,
  escalation after 48, one per threshold, one that did not go repeats after
  10 minutes (`lib/dsa_watchdog.ts`, `db/041`). No fallback transport for the
  escalation; the `DSA_ESCALATION_EMAILS` addresses are not set on the boxes.
- [x] Watchdog C2 — the letter about a new notice that did not go repeats every
  10 minutes; after 8 failures — a letter to `DSA_ESCALATION_EMAILS`; every new
  notice is copied there at once (at night no more than 6 an hour, the rest as a
  digest; the owner's decision of 2026-09-23). `lib/notice_notify.ts`, `db/043`–`044`.
- [x] The one-year notice term leaves an anonymous count: `prune_dsa_records`
  deletes and counts by month and target kind (`db/045`), as the policy and
  `dsa/SPEC` §9 promise.
- [ ] **Bunny transfer outside the EEA: no SCC** (Chapter V GDPR, Articles 44–46) —
  `article-30-register_EN.md`. SCC or a replacement.
- [x] The abandoned-identity sweeper (`lib/identity_sweeper.ts`): a year without
  a session closes, 30 days later deletes; held rows are skipped (`SKIP LOCKED`),
  an identity that finished registering during its query is left alone
  (2026-09-26, a two-connection test); a frozen session does not extend the year.
- [ ] J9: re-check the micro-enterprise status **before 2027-08-05**. The
  exemption under Article 19(1) DSA from Articles 20–28 depends on it. No
  transparency reports on the same ground (Articles 15(3), 19(1)); on request —
  Article 24(3).
- [ ] Legal review of the Terms (13+ together with offline meetings).
- [ ] Legal analysis of saving an offer (opened 2026-08-29), three questions:
  what binds the venue once `discount_until` on a saved card has passed; what to
  do with the copy of an offer taken down on a complaint; is it an offer or an
  invitation to make offers. In detail — `legal-review-brief_EN.md`.
- [~] The Article 17 statement screen for an author without e-mail — drawn
  2026-09-21 (frames U, V, W of sheet `panel/design/sheets/screen-06-07-10.svg`).
  Built in the terminal on 2026-09-23 (`depth/ink/rooms.ts`, `Statements`); no
  client on the web.

## 3. Product: build order (§13 of the chat spec)

The terminal goes first; the web is the last step over an already proven
protocol. The server is built ahead of the client; the client is the
`depth/core/` core without rendering, against a live node, and the
`depth/ink/` screens on top of it.

| Step | Server (`xor.ad/relay/node`) | `depth` client |
|---|---|---|
| 1. Identity and session | [x] `db/022`; `POST /identities`, `/vault/*`, `/sessions/*`, `/recovery/*`, `PATCH /identities/me` (the name goes into the queue, a freeze while a phrase or chat is live, age across 20/21 only upwards, the filter within the band with checked bounds — out of bounds 400, 503 only when the database is unavailable); PIN change `POST /vault/pin`, "start over" `POST /identities/close`, a new paper code `POST /recovery/reissue`, revisions `GET /legal/manifest` and `POST /legal/accept`; `quota {used, of, next_at}` in `GET /identities/me`; `GET/PUT /identities/appearance`. **The tenth PIN miss** locks the share, freezes the session and takes down what is live — the phrase, likes, matches, chats — and stands whatever the freeze meets (savepoints through postgres.js, a retry on 40P01, the PIN routes' own `lock_timeout`); what is left undone a minute job finishes with a re-check; the socket, support, consent, move approval and the first PIN read `locked_at` and refuse a locked session (2026-09-26). The fourth bypass is closed (2026-09-26, B108): the routes that waited for the identity's stats behind the take-down — profile, phrase, like, time away, block — reread `locked_at` after the wait and answer a locked session 401. **Move**: a nine-character code, approval on the old device, `reply_envelope` erased on the new session's `ack`, a brake of 50 misses → a 15-minute pause, the state poll has its own limit. The identity sweeper — §2 | [x] The PIN and the paper code are real (2026-09-26): Argon2id with a device salt, a 16-character code wraps the long key, registration waits for the second and fourth groups of the code; `depth restore` — raising by code on a clean process; `depth move` — a move both ways, the new device's first PIN after the move, the outcome as the node decided whatever the network did to the answers; a new code and PIN change from "me"; there is no separate `depth reissue` command and without a volume there cannot be one (`depth-client_EN.md` §3.6); raised by the paper code on the same device — "I remember the PIN" or a new PIN through the grant, and the node's refusal does not follow the person to the next screen (2026-09-26); the "me" screen with name and age editing; coming back from a step away from the PIN and code screens; errors reach the screen only through `plain`, without escape sequences |
| 2. Feed and geo | [~] `db/025`–`029`; `POST/GET/DELETE /feed`, `/feed/density` (counts people with a live phrase, not phrases — 2026-09-26), delivery by rings; **the first tier of §8.3 — rules** (a link, a contact, a phrase the author already has up) reads in the request: a clean phrase is published in the same transaction and answers 200, a flagged one waits for a person — 202; `FEED_VERDICT=queue` hands everything to a person (2026-09-26); the rules were measured on 2026-09-27 (M1, `docs/measurements/feed-rules-2026-09-27_EN.md`): a corpus of 211 phrases, 74 to a person (35 %), 0 false flags, 11 false passes — disguised links and contacts; **the moderator model behind a flag** `MODERATOR_URL` (`lib/moderator.ts`, a local model in Docker) is asked about what the rules flagged and puts a hint next to the queue, the queue does not change from it (measured 2026-09-27, `docs/measurements/moderator-2026-09-27_EN.md`); a person decides the flagged: `GET /admin/feed-queue`, `POST …/publish`, `…/refuse`, `refuse-name` (the phrase waits for a new name, a match requires `accepted`), the queue page in the panel with the model's hint and an e2e test, the moderation path in the browser (`moderation-path.spec.ts`: a phrase a person published is seen in its author's feed; a refusal the author does not see — `owner.md`); without a person only the cleaner works (`lib/feed_verdict.ts`); watchdog C6 — the queue's age per brand, a letter from the node no more than once a day; the author's age is computable — the accepted price of P1; the `soon` flag in the last 65 minutes of another's phrase; the ring is a delivery choice, not an access boundary (S1, risk accepted 2026-09-23); a live phrase's term is read by one predicate `LIVE_PHRASE` wherever it is read (2026-09-26) | [~] core: phrase and feed with a cursor; a full-screen card, the node's refusal on publishing in `refusal-wordings` words; a terminal with no point yet opens the point on the way to the feed (2026-09-26) |
| 3. Likes | [~] `likes` — `db/030`; `POST /feed/:id/like`: the band, blocks, a self-like without an oracle, a match on a mutual one; `DELETE` — taking back before a match, otherwise `spent`, taken back only from a live phrase held first, the expired goes to the sweeper (2026-09-26); a limit of 300 an hour; expired matches swept once a minute; a mutual-likes test on two connections; the liked left the feed for `GET /likes`; a match from an offer | [~] core: like and take-back; the "liked" screen |
| 4. Match and double consent | [~] `db/030`; `POST /matches/:id/consent` (`waiting`/`agreed`), "not now" and its undo; the chat does not open on `agreed` until step 5, the ephemeral key is step 6; consent behind a tenth miss does not pass (2026-09-26) | [~] core: consent and "not now"; "not now" and "bring back" on the inbox screen |
| 5. Chat: transport | [~] `db/031`: `chats`, `chat_participants`, `chat_starters`; both consents open the chat and return `chat_id`; `db/032` `pending_deliveries`, sending ciphertext (202 without a presence signal) and acknowledging receipt; a queue ceiling of 200 with silent eviction and a sweep of rows older than 260 minutes; `db/033` tickets and the `GET /chat` socket: the accumulated on connect, the new through `NOTIFY`; a session with a locked share gets no room and no lines (2026-09-26); the end of a conversation — `DELETE /chats/:id`, one's own span, the `sweep_chats` sweeper, the room closes with 4003; `PATCH` of the span, `POST /chats/alive`, `GET /inbox` (matches and conversations, one's own `my_span`; `?since` — the events since the last visit, 2026-09-26; `offer_interest` rows; pages of a hundred with `next`, the terminal's core reads them to the end — T15, 2026-09-29); time away `POST/DELETE /away`; a node shutdown closes rooms with code 1001 | [~] `depth/ink`: one's own span and countdown, a tombstone on 4003, time away in full and the "away" mark on the other side; room reconnect on 1001, 1011 and 1006 with a pause and jitter, a new ticket on 4001, a line delivered twice shows once (`depth/core/reconnect.ts`); the queue of lines before consent with a ceiling in the core without a screen (2026-09-26); screens for 4002 and 4004 — the session is over, not a room (2026-09-26); a lock after 5 minutes without input: the screen wiped to one line, the rooms closed, the core answers nothing but `POST /vault/share` (2026-09-26) |
| 6. Encryption | [~] the ephemeral half signed by the long key rides on consent (`db/030`, `routes/matches.ts`), the inbox returns the other's half, the long key and `me`; rekey after losing the pair — `POST /chats/:id/rekey`, the epoch in `db/031`; `chat_key_wraps` — `db/061`, `PUT/GET /chats/:id/keys` (2026-09-26, P2; no client calls it yet); the reissue question to the other side — the terminal's screen (T16, 2026-09-29) | [~] `depth/core/seal.ts`: ECDH P-256 → HKDF (salt `chat_id`) → two direction keys, AES-GCM with a 96-bit nonce; `Client.consent` publishes the half, `openConversation`/`sayInChat`/`read`; an end-to-end test of two terminals against the node, a reflection does not open; wraps under the session key — `openAndWrap`/`unwrapConversation` (2026-09-26, P2) |
| 7. Blocks, hiding, cleanup | [~] `POST`/`GET`/`DELETE /blocks`: by phrase or conversation, 204 without an oracle, a `nonce` against replay, kills the match and ends the conversation for both with the room closing 4003; sweepers of matches, the queue and conversations; `db/034` and `/hidden` — hide a phrase for oneself only and bring it back, an index on `hidden_messages.feed_message_id` (`db/060`); missing — blocking and hiding a line at a table (there are no tables) | [x] `depth/ink`: "hide" and "block" in the feed, the hidden screen with bring-back (2026-09-23), "end the conversation" and "block" in the chat; blocking asks twice and names the consequence; the "blocked" screen with unblocking |
| 8. Notifications and games | [~] notifications — the inbox only (§8.12): `GET /inbox?since` answers `events` (new matches, an answer to one's consent, opened conversations, queued replies, a term ending soon) and flags on the rows, all derived from the tables at request time, no notifications table (`lib/inbox_events.ts`, 2026-09-26); tables of seven game classes (`dots`, `grid`, `deck`, `word`, `dice`, `free`, `physics`) on the socket with rules and score, tables in the feed, a game in the conversation | [~] the inbox screen: marks ● (new), ● N (replies waiting), ⌛ (term ending) and counts in the head — symbols, no captions (2026-09-26); game boards and a game in the conversation; `board.*` strings in 15 languages are a copy of ru (`owner.md`) |
| 9. Web face | — | [~] the web face `web/` on `depth/core` — the summary above (row "Web application"); begun 2026-09-26–2026-09-27 (W1–W6): registration with a PIN and the paper code, unlocking with the PIN after a reload by a separate unlock pair (`unlock_pub`, db/063), any reload goes only through the PIN, there is no tab record, the feed with the nearby step live for a screen reader, the composer with refusals in the document's words, the card with like / hide / block, "liked", the inbox with events, the match with consent, an end-to-end encrypted chat with key wraps under the session's key and a reissue, a `closed` frame instead of a close code, the exit screen of an offer's link `/o/<code>`, the "me" screen with the PIN change, time away and Article 17 statements, raising by the paper code on a clean device and reissuing the code (2026-09-27); built and e2e-tested in Docker — the count is in the row "Web application" (`scripts/run-web-tests.sh`, `WEB_PORT`), each from an address of its own under the stand's token, axe with nothing serious or critical; texts in Russian and hard-coded — 17 locales ahead; the prototype `neighbro.place/prototype/neighbro-app-proto.html` stays; since 2026-09-27 added the move, the lists, tables, the cabinet, screens after the kit's sheets, 17 dictionaries and the role paths (`run-e2e-paths.sh`) |
| Offers (outside §13) | [~] `db/050`: `advertisers`, `venues`, `offers`; `GET /o/:code` (the exit screen: the domain and whether the link is spent) and `/o/:code/go` (302, counted without a person, previewers and HEAD do not count, a per-address limit); the link goes dark with the offer — hidden on complaints or with the discount expired (quorum 2026-09-24); a complaint about the link `POST /o/:code/report`; the `/adv/*` cabinet — sign-in, venues, an envelope and confirming the place by its code, offers, complaints and a reply, "not us" (`grep route` over `relay/node/src/routes` 2026-09-29); interest in an offer in the inbox | [~] interest in an offer in the inbox, the offer complaint from a feed line; on the web — the cabinet, the exit screen, the complaint from the offer's card in the feed; the complaint about the link — only from the card in the feed (the owner's decision of 2026-10-01, `c026fd10`) |

All eleven tables of the first cut (§13) exist. Migrations in `relay/node/db` —
71 files, the last `084` (`ls relay/node/db/*.sql`, 2026-10-03). 875 tests: the node 821,
`testing/e2e` 10, the panel 39 and 5 (`scripts/count-tests.sh`, 2026-09-29); the
web — 64 tests in 53 specs of `web/e2e/specs` (run 2026-10-03), not counted by
the counter.

Chat code was allowed by the owner's word on 2026-09-21.

## 4. Storefronts and panel

- [x] Landings of both storefronts: themes, accents, i18n, waitlist, `legal.html`.
- [x] App screen mockups are assembled from the kit (`panel/design/sheets`,
  `panel/design/kit`), a gallery and text gates.
- [x] Panel: sign-in by link, API keys and secret keys with quotas, brands,
  panel users, waitlist, logs, the DSA notice register, the feed queue, support.
- [~] Translation of the app's strings: the web speaks through dictionaries
  `web/src/locales` in 17 languages (2026-09-29), `web.*` keys outside ru are a copy
  of the Russian; there is no language switch, the language follows the browser.

## 5. Review panels

Protocols — `reviews/PANEL_*.md`. The panels of 2026-09-21–2026-09-23 were
closed by commits of the same days. Over the 2026-09-26 shifts on `day58` five
panels ran (`PANEL_2026-09-26_day58-artel.md`, `…-artel-2..5.md`): findings were
closed by tasks B26–B105, all merged; the sixth panel (B72–B104) is kept in
`salvage-wave6` (`17955fc6`).
From here on — one panel per wave, only the "Security" lens plus `verifier`;
findings go as a line into `facts/open.tsv`, not as new tasks of the same wave
(`parallel-sessions_EN.md` §2).

The check of 2026-09-29 found three items closed earlier that wave 7b had opened
again: V5 — control and invisible characters in a name (`7e7a5fd5`, 2026-09-27); V7 —
a table's frames only to rooms holding a seat (`0cf2a019`, 2026-09-27); V8 — the offer
complaint from the terminal's feed (`185b8322`, 2026-09-27; the App walked live —
`946a7a82`).

## Open questions

- Minimum age: 13+ now, the lawyer may insist on 16+. The Article 8 GDPR
  consent threshold concerns only processing based on consent.
- The set of accents and the brand's font — decided 2026-10-02: brands and themes as data
  (`web/themes/<brand>/*.json`, light/dark/mono and coloured); the web's font is Golos Text,
  codes JetBrains Mono (`web/src/styles.css`), the brands' sheets use Golos and Russo One.
