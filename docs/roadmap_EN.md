# Roadmap — state as of 2026-09-21

A snapshot of where the product stands as a whole. The detailed work tracker is
[`open-work_EN.md`](open-work_EN.md); the product build order is §13 of
[`chat_EN.md`](chat_EN.md). This file sits one level above both: which layers
exist, which do not, and how that was checked. The snapshot was checked by a
five-lens review panel —
[`reviews/PANEL_2026-09-21_roadmap.md`](reviews/PANEL_2026-09-21_roadmap.md).

`[x]` done and verified, `[~]` partial, `[ ]` ahead. Every claim about a live
environment carries a date and a method. The 7 July 2026 snapshot (Supabase,
"prod later") is replaced in full: none of its infrastructure claims hold any
more. The legal section keeps its number (§2): both storefronts'
`17-offer_*.md` and `legal-review-brief_*.md` link to it.

## Summary

| Layer | Readiness | Verified by |
|---|---|---|
| Storefronts neighbro.place and sosed.place | ~90% | `curl` 2026-09-21: both 200 |
| Panel xor.panov.id | ~75% | `curl` 2026-09-21: 200; 9 pages in `panel/src/pages` |
| Relay node: platform (keys, brands, DSA, mail) | ~70% | `/health` 2026-09-21: `p1-prod`, `database: ok`, `mail: resend`; open items — §1 |
| Operations: backups, restore, alerts, rollback | ~50% | backups without a key and without the waitlist; restore drill — 2026-08-07 |
| Legal and DSA | ~60% | Bunny transfer outside the EEA and the LAW-7 sweeper are open — §2 |
| Relay node: product, steps 1–4 of §13 | ~25% | step 1 done on the server, step 2 without a moderator, 3 — like and take-back built, 4 — tables without routes |
| Relay node: product, steps 5–8 of §13 | 0% | `chat/relay.ts` is a stub answering 501 |
| `depth` client (terminal, goes first) | 0% | no code in any repository |
| Web app (step 9) | ~5% | only `neighbro.place/prototype/neighbro-app-proto.html` |

The percentages are estimates: they are not weighted by hours, because steps
3–9 have not yet been cut into priced tasks.

## 1. Live environment and operations

- [x] Production is public: `api.relay.panov.id/health` 200, node `p1-prod`,
  image `v2026.9.11-g8f89e7a`, brands `sosed` and `neighbro`. Measured
  2026-09-21.
- [x] Storefronts `sosed.place` and `neighbro.place`, panel `xor.panov.id` —
  200. Measured 2026-09-21. Production shipped 2026-07-27–28.
- [x] Supabase left the path on 2026-07-22: state lives in our own Postgres
  beside the node, delivery through Bunny.
- [ ] Dev and staging (box n1) — not measured: behind an IP allow-list.
- [~] Article 16 notice intake — the host `report.relay.panov.id` is alive
  (`/health` 200, `p1-prod`, measured 2026-09-21), route `POST /report`; not
  yet shipped to the storefronts in production. Why it moved: the WAF on every
  zone cuts bodies quoting `<script>` or `../`, and the zone has zero custom
  rules (`open-work_EN.md`, G12/G13).
- [ ] **Roll out `day56`.** 76 commits ahead of `origin/dev` (`cd21688`,
  2026-09-19); migrations `025`–`029` have not been applied anywhere (by the
  code and the branch; `schema_migrations` on the boxes was not queried).
  Start with dev (n1), not production.
- [ ] `NOT NULL` on the published centre (P5) — only in the rollout after
  `027`, never in the same one.
- [~] Nightly backup encryption (P4): the mechanism shipped 2026-09-21
  (`4a4da9b`); no key on the boxes yet — an owner action: the public half into
  `backup.env` on p1 and n1, the private half from its file into the password
  vault. Until then, backups are plaintext.
- [ ] L1: the waitlist is not in the backup — it lives in Bunny storage, and
  the backup takes only Postgres.
- [~] Restore drill — last on 2026-08-07 (`scripts/verify-backup-restore.sh`).
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
- [ ] **Bunny transfer outside the EEA: no SCC** (GDPR Chapter V, Art. 44–46) —
  `article-30-register_EN.md`. SCC or a replacement.
- [ ] LAW-7: the abandoned-identity sweeper is not built — the register
  promises a retention period the code does not enforce (Art. 5(1)(e) GDPR).
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
  9 and 14 of the storefronts); no client shows it yet.

## 3. Product: build order (§13 of the chat spec)

The terminal goes first; the web is the last step, over a protocol already
proven. The server is built ahead of the client, so the client column is
empty throughout.

| Step | Server (`xor.ad/relay/node`) | `depth` client |
|---|---|---|
| 1. Identity and session | [x] migration `db/022`; `POST /identities`, `/vault/*`, `/sessions/*`, `/recovery/*`; P2 closed 2026-09-21; not rolled out | [ ] |
| 2. Feed and geo | [~] migrations `db/025`–`029`; `POST/GET/DELETE /feed`, `/feed/density`, delivery by circles; **no moderator wired** — `publish()` is called only by hand, only the sweeper runs unattended (`lib/feed_verdict.ts`); the name check at first publication depends on it too; the author's age is computable — accepted cost P1; not rolled out | [ ] |
| 3. Likes | [~] `likes` — `db/030`; `POST /feed/:id/like` (2026-09-21): band, block, self-like without an oracle, a match on a mutual like; `DELETE` — a take-back until a match, else `spent`; a limit of 300 an hour; missing — the offer's match, a sweep of matches, a two-connection race test | [ ] |
| 4. Match and double consent | [~] `matches`, `match_participants`, `blocks` — migration `db/030`, `chat_id` without a key until `chats` (step 5); no routes | [ ] |
| 5. Chat: transport | [ ] `chat/relay.ts` answers 501; the `LISTEN`/`NOTIFY` bus works as of 2026-09-21 | [ ] |
| 6. Encryption | [ ] | [ ] |
| 7. Blocks, hiding, sweeping | [ ] | [ ] |
| 8. Notifications and games | [ ] | [ ] |
| 9. Web face | — | [ ] prototype exists, app does not |

Of the eleven tables in the first cut (§13), ten exist — six before
2026-09-21, and `likes`, `matches`, `match_participants`, `blocks` by
migration `db/030`. One does not: `support_requests`.

Chat code was cleared by the owner's word on 2026-09-21.

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
`6dd62de`, 8 by `ae65510`, 5 by `2bde94b`.

## Open questions

- Minimum age: 13+ now; a lawyer may insist on 16+. The Art. 8 GDPR consent
  threshold applies only to processing based on consent.
- The accent set and the brand reference typeface — open in the 7 July
  snapshot; whether they were settled has not been checked.
