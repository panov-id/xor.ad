# API build brief — 2026-09-17

What to program, in what order, and what to check against. The contract's canon is `docs/api/openapi.yaml`
(105 operations: 39 built, 66 from the spec, 0 proposed; `GET /likes` and `POST/DELETE /tables/{id}/like` agreed 2026-09-17), the protocol —
`protocol_EN.md`, the data — the chat spec `chat_EN.md` and the offers spec, the tests — `test-map_EN.md`. Pair — `build-brief_RU.md`.

## 1. Before the first line

- **The names of the 56 proposed routes were agreed by the owner on 2026-09-17** (`ROUTES_2026-09-17_naming_EN.md`); in the yaml they carry `x-status: spec`, the §8 list of the protocol is empty.
- **Core first, faces after** (chat spec §13): protocol, crypto and state are one module without DOM and without Ink;
  the terminal `depth` goes first, the web follows the proven protocol.
- **Gates hold the contract**: `check-openapi.sh` checks the yaml against the protocol tables and `relay/node/src/routes`
  both ways and catches duplicate keys and broken descriptions; `check-facts-schema.sh` — tables against the database and
  migrations; `check-facts-limits.sh` — every node period with a doer. A built route gets `x-status: built` and an
  `x-source`, or the gate goes red.
- **Migrations** — one per decision, squashed before a push, a fresh migrate on a throwaway database before a merge
  (skill `git-workflow`). Product tables: 29, all declared in the canon, none migrated.

## 2. Cross-cutting rules (protocol §2–§6)

Request signature: ECDSA P-256 over `method\npath\nsha256 of body\nunix time`, headers `x-identity-session`,
`x-identity-time`, `x-identity-sign`, a ±5-minute window. The `x-protocol-version` header on every request, the
`x-protocol-sunset` answer header once a date is set, the `xor.p1` subprotocol on the socket. The error shape
`{error: {code, message, reason?}}`, 429 with `Retry-After`, the 409 "accept again" in its own shape. One-shot actions —
seven routes with a `nonce` in the body, the `nonces` table, the replay looked up after the signature check. Pagination —
the `?after` cursor, the `{items, next}` answer. The socket — frames from the node only, the ticket in
`Sec-WebSocket-Protocol`, close codes 1000–4005. Not one person identifier leaves the node: uuids only for things, seats by number.

## 3. The data order (§13) — what to build at each step

| Step | Tables (chat spec) | Operations | Tests (map) | Limits (`limits.tsv`) |
|---|---|---|---|---|
| 1. Identity and session | `identities`, `sessions`, `vault_shares`, `nonces`, `legal_acceptances`, `identity_appearance` | `POST /identities`, `POST /vault/share`, `POST /sessions/invite`, `POST /vault/pin`, `POST /identities/close`, `PUT /identities/appearance`, `POST /sessions/claim`, `POST /recovery/claim`, `GET /legal/manifest`, `POST /legal/accept`, `GET /identities/me`, `PATCH /identities/me`, `POST /recovery/reissue`, `GET /statements` | §1–5, §17, §22 | `identities.create.*`, `pin.attempts`, `recovery.*`, `invite.lifetime`, `nonce.*`, `profile.patch.day`, `reissue.day` |
| 2. Feed and geo | `feed_messages`, `identity_stats` | `POST /feed`, `GET /feed`, `DELETE /feed/{id}`, `GET /feed/density` | §6–7 | `phrase.length`, `feed.publications.hour`, `feed.area.steps`, `moderation.queue.wait`, `filter.age.*` |
| 3. Likes | `likes` | `POST /feed/{id}/like`, `DELETE /feed/{id}/like` | §8 | — |
| 4. Match and consent | `matches`, `match_participants`, `chat_starters` | `POST /matches/{id}/consent`, `GET /inbox` | §9–10, §18, §21 | `match.*` |
| 5–6. Chat, transport and encryption | `chats`, `chat_participants`, `pending_deliveries`, `chat_key_wraps` | `POST /feed/{id}/like`, `DELETE /feed/{id}/like`, `POST /matches/{id}/consent`, `GET /inbox`, `POST /chats/{id}/ticket`, `POST /chats/alive`, `DELETE /chats/{id}`, `PATCH /chats/{id}`, `POST /chats/{id}/game`, `GET /chats/{id}/game`, `DELETE /chats/{id}/game`, `POST /chats/{id}/game/answer`, `POST /chats/{id}/game/moves`, `POST /chats/{id}/game/word`, `POST /chats/{id}/game/confirm`, `POST /chats/{id}/game/proposals`, `POST /chats/{id}/game/proposals/{pid}`, `POST /chats/{id}/game/resign`, `POST /chats/{id}/messages`, `POST /chats/{id}/received` (except `game*`) | §11–14, §19–20 | `chat.*`, `ticket.lifetime` |
| 7. Blocks, hiding, sweeping, stepping away | `blocks`, `hidden_messages` | `POST /blocks`, `GET /blocks`, `DELETE /blocks/{id}`, `POST /hidden`, `GET /hidden`, `DELETE /hidden/{id}`, `POST /away`, `DELETE /away` | §16, §19, §22 | `blocks.hour`, `hidden.hour`, `away.span.*` |
| 8. Notices and games | `chat_games`, `tables`, `table_seats`, `table_lines`, `table_games`, `table_scores`, `support_requests` | `POST /tables`, `GET /tables/{id}`, `POST /tables/{id}/seat`, `DELETE /tables/{id}/seat`, `POST /tables/{id}/ticket`, `POST /tables/{id}/lines`, `POST /tables/{id}/moves`, `POST /tables/{id}/confirm`, `POST /tables/{id}/proposals`, `POST /tables/{id}/proposals/{pid}`, `POST /tables/{id}/resign`, `POST /tables/{id}/congratulate`, `POST /tables/{id}/kick`, `/chats/{id}/game*`, `POST /support`, `GET /support`, `POST /support/{no}/seen`, `GET /statements` | §15, §23 | `table.*`, `sticker.minute`, `support.*`, `chat.messages.minute` |
| 9. The web face | — | by the same protocol | all | — |

Offers (`advertisers`, `venues`, `offers`, `offer_link_reports`, the offers spec) — after the chat, as a separate run.

## 4. What holds the code

`check-facts-open`: items that hold code — two: `moderation.model` (which model: settled by a measurement, §8.14,
step 2) and `a11y.table.move.timer` (the move window against WCAG 2.2.1, step 8). Items "with launch" and
"publication" do not hold the code but name what the code lacks: sweepers (`chat.janitor.missing`, `feed.sweeper`,
`table.sweeper`), table timers (`table.timers.unbuilt`, the `table_autopass` job), watchdogs W1–W7, `receipt_hash`
in `report.ts`, the `until` column of `dsa_statements`, the node variables `PROTOCOL_SUNSET_AT` and `BACKUP_AGE_ALERT_HOURS`.

## 5. How to check

The test map `test-map_EN.md` §1–23 — what must be true and what proves it, by step; §23 — the contract (version,
error shape, pagination, stepping away, nonce, seq). A test that has never failed proves nothing: after writing one,
break what it guards and see it go red (project rule). A review panel — before the first line of a new service and
before merging a substantial change (`review-panel`).
