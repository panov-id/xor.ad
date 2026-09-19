# Screens against the API contract

Audit of 2026-09-19: every datum on the 14 mock-up sheets (`panel/design/sheets/`, 178 frames)
against `docs/api/openapi.yaml` (105 operations: 39 built, 66 described) and `docs/protocol_RU.md`.
The aim: before any code, find everything the screens show or send that the contract does not give.

**How it was done.** Three reader agents (read only) went through the sheets: 01-08, 12-19 and
20-25 with the i18n and the light sheets. Each datum got a class: *covered* (an operation and a
field, with the yaml line), *partial* (the operation exists, the field or state is not described),
*gap* (neither an operation nor a field), *on the device* (by the screen's description it lives
only on the device). The lead re-checked every finding marked **VERIFIED** here against the yaml
itself, the protocol and the screen descriptions in the sosed.place repository. **NOT VERIFIED**
means an agent's claim the lead has not checked.

The contract was not changed during the audit; `scripts/check-openapi.sh` is green.

## Contradictions — the owner decides

| # | What | Where | Status |
|---|---|---|---|
| C1 | **Decided 2026-09-19: the rule of 2026-09-15 restored, the time left removed from other people's cards.** Feed cards showed "2 h 50 min left" on **other people's** phrases, while screen 23's description forbids it: "the time left on someone else's phrase is not shown as a number — decided 2026-09-15". Introduced by commit `bf2cae7` on the morning of 2026-09-19. `FeedItem` has no lifetime field at all | sheets 03, 20-24, i18n, light; sosed.place `docs/23-*_RU.md:16`; `openapi.yaml:192-210` | **VERIFIED** |
| C2 | **Decided 2026-09-19: the `/away` description caught up with protocol §4.9.** Since 2026-09-18 stepping away also removes **your likes on other people's** phrases and tables; the description of `POST /away` does not say so — only your phrases "with their likes", matches, games, the seat | sosed.place `docs/20-*_RU.md:10,16`; `openapi.yaml:1938` | **VERIFIED** |
| C3 | **Decided 2026-09-19: the English description corrected to "200 with an id".** `POST /hidden`: the English description says "204", the Russian one and the response say "200 with an id" | `openapi.yaml:1892-1900` | **VERIFIED** |
| C4 | **Decided 2026-09-19: the card removed from frames 14 A and 14 H, the caption corrected.** Sheet 14 A keeps a "passed on as an illegal-content notice" card in the support list, while screen 14's description says a forwarded request leaves the list in the same transaction | sosed.place `docs/14-*_RU.md:32` | **VERIFIED** |
| C5 | **Decided 2026-09-19: the caption corrected to "10 minutes".** The caption of sheet 12, frame 6: the eighth wrong PIN means an hour; screen 12's description: the eighth is 10 minutes, the ninth an hour | sosed.place `docs/12-*_RU.md:56-57` | **VERIFIED** |
| C6 | **Lifted 2026-09-19: the cabinet signs in by the same link with the `advertiser` role (protocol §4.13); the built `/auth/request-link` was not changed.** The venue cabinet signs in by an e-mailed link, while the only such operation, `/auth/request-link`, serves only an existing panel operator | `openapi.yaml:742-750` | **VERIFIED** |

## Gaps by theme

### Offers — described 2026-09-19 (protocol §4.13, 17 `spec` operations)
Below is what stood before.
**VERIFIED**: the yaml has no `/offers`, `/o/` routes and no `venue`, `discount`, `promo` fields;
`FeedItem.kind` is only `phrase` and `table` (`:197`). `docs/offers/SPEC_RU.md` has no routes either.
Yet sheets 03, 04, 06, 09, 17, 23, 25 draw offers, and `GET /likes` itself says it returns "private
authors' offers" (`:1254`). Missing: the offer card in the feed (venue or "private", discount, terms,
deadline, promo code, link), the whole venue cabinet (sign-in, envelope verification, the form,
automatic checks, statistics, "discount not given" complaints, the reply to the moderator), the
`sosed.place/o/…` redirect and the "the link goes somewhere else" complaint.

### The feed
- `POST /feed` has no request body — text, mode, area, offer are undescribed. **VERIFIED** (`:1216-1231`).
- `FeedItem` has no lifetime (`expires_at`) — neither "time left" nor "soon gone". **VERIFIED**.
- No operation gives the place name ("Kolonaki, Athens · approximate") — open question 6 in `docs/api-platform_EN.md`. **VERIFIED**.
- `/feed/density` answers "The band." with no schema and no "few people" floor. **VERIFIED** (`:1277-1291`).
- `GET /feed` has no filter parameters **by design**: age and languages live on the profile (`filter_age_min`, `filter_age_max`, `languages`, `:537-539`). The gap is narrower: **the mode filter** ("company") has a place neither on the profile nor in the request. **VERIFIED**.
- No "farther than you asked" mark, no "dozens more in other languages" count, no "the filter narrowed" signal. **VERIFIED**: the words farther, other_lang, narrow do not occur in the yaml.
- "My phrase under review": the feed carries no author and `Profile.phrases` has only `{id, expires_at}` — nothing to draw it from but a copy on the device. **VERIFIED** (`:541-545`).

### The phrase quota
"2 of 4 free", "next at 21:40", "4 of four places free" — no fields.
**VERIFIED**: the words `quota`, `slots` occur in the yaml only for the panel's API keys.

### Inbox, matches, conversations
- `GET /inbox` returns a `Page` whose `items` are `{type: object}` — no name and age, no other person's phrase, no time left, no "waiting for your reply". **VERIFIED** (`:255-263`, `:1350`).
- A match cannot be declined ("not now") or the decline undone: `decline` exists only in the answer to a game proposal. **VERIFIED** (`:346`).
- No read of a single match, no "the offer is gone" response, no conversation lifetime, no body for `PATCH /chats/{id}`, no queue for lines before consent; the conversation's system lines (`chat_opened`, a move, an age change, `peer_stepped_away`) are described only in the protocol. **VERIFIED**: a match has only `/matches/{id}/consent` (`:1448`) with answers 200, 400, 409, 429; `expires_at` occurs in the schemas only on a game; `PATCH /chats/{id}` has no body; `chat_opened` and `age_changed` do not occur in the yaml; there is no queue of lines before consent in either the yaml or the protocol.

### Identity, PIN, transfer
- The old device cannot answer "it's me" / "doesn't match": sessions have only `invite` and `claim`. **VERIFIED** (`:1098`, `:1163`).
- `POST /identities` has no body (name, age) and no "under 13" refusal; creation registers no PIN, node share or paper code; no "attempts left" field and no "locked" code; `/recovery/claim` has no body; a new device cannot set its own PIN. **VERIFIED**: `POST /identities` is "the key, a name and an age", the body "not spelled out in the canon"; among the `ApiError.code` values the only age one is `age_step_down`, there is no "locked" code; attempts are prose only (`:1218`); `/recovery/claim` has no body; `PinChange` requires the old `current_auth`.

### Support and documents
- The request list cannot show the request's text: `SupportRequest` has no text field. **VERIFIED** (`:396-403`).
- No `maxLength` 1000 on the text, no answer-read date; `/legal/manifest` and `/legal/accept` have no schemas; "was 2026-08-27" is nowhere. **VERIFIED**: `SupportCreate.body` has no `maxLength`, there is no `seen_at`/`read_at`, `/legal/*` has no schemas, `LegalReacceptance` has no previous date.

### Tables and games
- Seats have no names: `TableLine` and `Board` know a seat number, while the screens say "Anya · 3", "turn: Anya". **VERIFIED** (`:308-316`).
- No "game over" state, no "you were asked to leave" notice, no opponents' tile counts, no per-seat roles. **VERIFIED with a caveat**: `Board.state` is an `object` (jsonb by game class), so "game over" and tile counts may live inside it — "not described" rather than "absent"; the `/tables/{id}/kick` description has no notice to the removed person (`:1787`).

### Appearance and defaults
- `PUT /identities/appearance` has no body and no read-back, while screen 22 keeps the choice on the node. **VERIFIED**: `PUT` has no body, there is no `GET`.
- The default area, mode and silence span are not in `Profile` — perhaps deliberately on the device; nowhere said. **VERIFIED**: the words default, silence do not occur in the yaml.

## Lives on the device by design — not a gap
Which hints were already shown (screen 24), the "you have been here an hour" counter (20), the
console (21 — "keeps nothing on disk, no copy goes to the node"), saved offers (12, 17), the size of
the local database and notice receipts (12), "changed since" on documents (15), the device copy of
the appearance choice (22). References are in the agents' reports; the lead has not checked them.

## What is proposed
1. Decide contradictions C1–C6 — they are about what to show, not about fields.
2. Offers: a section of the contract of their own — the largest gap, half of screen 17 and the feed cards.
3. Schemas where there is only prose: `POST /feed`, `GET /inbox`, `/feed/density`, `POST /identities`, `/legal/*`, `PUT /identities/appearance`.
4. ~~Take the NOT VERIFIED items through a second pass~~ — done 2026-09-19: all 13 claims held, one refined (the feed filters), one with a caveat (the game state).

## Closed in the contract on the evening of 2026-09-19
By the 14-point list the owner agreed: the `/inbox` rows — the `InboxItem` schema;
`/feed/density` — `{band: nobody | few | tens | hundreds}`; the mode filter — `filter_modes` on the
profile; the quota — `Profile.quota {used, of, next_at}`; declining a match — `POST` and `DELETE
/matches/{id}/decline`; the conversation span handle — the `ChatSpan` body, the lifetime —
`InboxItem.chat_expires_at`; creating an identity — `IdentityCreate`, the `too_young` refusal; the
PIN — `attempts_left` and `pin_locked`; a new device — `POST /vault/init` and a body for
`/recovery/claim`; the transfer — `POST /sessions/{lookup_id}/approve` and `/reject`; documents — a
manifest schema and `LegalAccept`; appearance — `Appearance` and `GET /identities/appearance`; the
table — `TableView.seats` and `Board.over`; support — `SupportRequest.body`, `read_at`, `maxLength`
1000. The contract has 128 operations (39 built, 89 described), `scripts/check-openapi.sh` is green.
