# Gaps 2026-10-12: web face vs the promise

Working protocol. Read-only inventory, branch `day59`, nothing run. Sources:
`web/src/App.tsx:62-92` (`type Screen`), `web/src/screens/*.tsx`, `web/src/adv/Cabinet.tsx`;
walk = `scripts/textwalk/textwalk.mjs` `step(`/`look(` calls; e2e = `web/e2e/specs/*.spec.ts` titles;
sheets = `panel/design/adaptive-{sosed,neighbro}-*.svg` (both brands have the same 94 names) and `panel/design/sheets/*.svg`.
"inferred" = concluded from grep absence or names, not from reading the whole flow.
Textwalk runs one width per run (`WALK_WIDTH`, default 393, `textwalk.mjs:15-17`); which widths were actually run is not evidenced here.

## Table

| Feature / flow | Promised (file:line) | Web screen | Sheet | Walked (textwalk) | e2e | Note |
|---|---|---|---|---|---|---|
| Place QR (`<storefront>/#p=<cell>&s=<step>`, parsed on device from the fragment, sets place+radius; anyone scanning a printed QR, opens the feed at that spot) | docs/protocol_RU.md:167 | **none** — no `#p=` parsing in web/src (only Cabinet reads `location.hash` as token, `web/src/adv/Cabinet.tsx:42`) | sheets/screen-26-place-qr.svg | no | no | **Absent.** In-app QR scanner explicitly not built: docs/offers/README_RU.md:302; identity transfer has no QR by design: docs/chat_RU.md:1075 |
| Venue cabinet: sign-in by mail, venues, offers, new offer, preview, complaints answer | docs/offers/SPEC_RU.md:80, :182 | web/src/adv/Cabinet.tsx:73-94 | adaptive-*-adv-{sign-in,sent,expired,venues,offers,new-offer} | no | adv.spec.ts:36, venue-path.spec.ts:34, envelopes.spec.ts:29, dsa-recipients.spec.ts:57 | Not walked at all |
| Offer in feed (person side), complaint, link report | docs/offers/SPEC_RU.md:523, :571, :665 | Card.tsx:134-163 | adaptive-*-card-more | no (walk has no venue) | offer-complaint.spec.ts:16,63, offer-life.spec.ts:14 | |
| Offer exit screen (redirect) | docs/offers/SPEC_RU.md:496 | Offer.tsx (`offer`, App.tsx:68) | adaptive-*-offer-link, -offer-exit | no | offer.spec.ts:10,34, a11y.spec.ts:89 | |
| Promo codes | docs/offers/SPEC_RU.md:562 | not found in web/src (inferred) | none | no | no | inferred absent |
| Business response to complaint | docs/offers/SPEC_RU.md:390 | Cabinet `answerComplaint` (Cabinet.tsx:23) | none dedicated | no | venue-path.spec.ts:34 | |
| Arrival (identity arrives: code typed on new device) | docs/chat-flows_RU.md:120 | Arrival.tsx (`arrival`, App.tsx:88) | adaptive-*-arrival, -arrival-check | no | transfer.spec.ts:11, transfer-claim.spec.ts:15, cellfield.spec.ts:9 | |
| Departure (move identity to another device) | docs/chat-flows_RU.md:120; depth `depth move` docs/depth-client_RU.md:276 | Departure.tsx (App.tsx:82, Me row `move` App.tsx:409) | adaptive-*-departure | no | transfer.spec.ts:11, two-devices.spec.ts:63, mixed-move.spec.ts:41 | |
| Restore by paper code | docs/chat-flows_RU.md:187 | Restore.tsx | adaptive-*-restore, -restore-wrong | yes, textwalk.mjs:283-289 | restore.spec.ts:11, wiped-storage.spec.ts:13 | |
| Place choice + geolocation | docs/chat_RU.md:1507 | Place.tsx, web/src/geo/place.ts:107 | adaptive-*-place | yes, search :277-279, coords :281 | none named | |
| Composer: text, two segment choices (Composer.tsx:57,71 — inferred mode/kind), contact refusal, limit | docs/chat-flows_RU.md:214; docs/depth-client_RU.md:663 | Composer.tsx | adaptive-*-composer-{393,1440,contact,limit} | yes: plain + contact phrase, textwalk.mjs:189-196 | compose-like:46, phrase-lang:10, phrase-lines:20, moderation-path:40 | limit state not walked |
| Feed, card, like, likes list | docs/chat_RU.md:1963 | Feed.tsx, Card.tsx, Likes.tsx | feed-*, card-*, like, likes, likes-empty | feed/card/like yes :200-207; **likes screen no** | compose-like, swipe:51, heart:47, starters:36 | |
| Match + double consent | docs/chat-flows_RU.md:349 | Match.tsx | match-393, match-waiting | yes :208-218 | consent-wait:8, decline:44, decline-expire:67-146 | |
| Chat | docs/chat-flows_RU.md:526 | Chat.tsx | chat-393, chat-1440 | yes :220-230 | chat:49, chat-resend:47, unlock-chat:50 | |
| Rekey (keys after device change) | docs/chat_RU.md:2652 | ChatActions.tsx, Chat.tsx | chat-keys | no | rekey:58, mixed-rekey:40 | |
| Safety code | docs/chat_RU.md:1093 | Chat.tsx:50,93,179; ChatActions.tsx:45 | (inside chat-actions) | no | none named (inferred) | |
| Block (card + chat), blocked list | docs/chat_RU.md:2407 | Card.tsx, Chat.tsx, Blocked.tsx | blocked, blocked-me, card-more | no | card-more:9, chat-block:47, lists:10 | |
| End conversation / tombstone | docs/chat-flows_RU.md:585 | Chat.tsx (`endChat`, :45) | chat-ended | no | mixed-chat-end:68, decline-expire:146 | |
| Chat span | docs/chat_RU.md:2194 | Chat.tsx `changeSpan` | chat-actions | no | chat-span:54 | |
| Game inside chat | docs/chat_RU.md:62 | ChatGame.tsx | chat-game | no | chat-game:54, game-rounds:88,137, mixed-chat-game:39 | |
| Tables list, new table, table, applications, watching, over | docs/chat_RU.md:296 | TableList.tsx, NewTable.tsx, Table.tsx | tables-*, new-table, table-*, feed-table | yes :232-261 (one class, dots default `NewTable.tsx:82`, inferred) | table:31,67,114, table-feed:10, tables-mine:21, table-walk:11, two-people:24 | |
| Game classes | node: relay/node/src/lib/tables.ts:37 = grid, free, dots, deck, dice, physics, word | NewTable.tsx:65-73 offers all 7 (dots 3x3/2x2/4x4; grid checkers/chess; deck 36; word ru (hangman); dice backgammon; free double-six (dominoes); physics chapayev). Render: dots SVG (ui/Board.tsx), DeckBoard :34, WordBoard :57, FreeBoard :86, CellsBoard :113 (grid/dice/physics as text `<pre>` 8x8) | no per-class sheets | dots only (inferred) | dots (table:67, chat-game:54), deck (table-deck:9, game-rounds:88) | grid/dice/free/physics/word never exercised by e2e or walk |
| Stickers (send) | docs/chat_RU.md:305; docs/depth-client_RU.md:1093 | shown at table only (Table.tsx:158); no sending, none in chat (inferred) | sheets/screen-* (16, inferred) | no | no | Outside alpha per depth doc |
| Statements (DSA Art. 17) | web/src/screens/Statements.tsx:1 (dsa/SPEC §7) | Statements.tsx (App.tsx:77) | adaptive-*-statements | no | none named (inferred) | |
| Art. 16 notice on a person's phrase | docs/depth-client_RU.md:344 ("must exist in every face") | **none**: no `/reports` call in web/src (grep) | none | no | no | **Absent** (offer complaints exist, phrase report does not, inferred) |
| Age filter | docs/chat_RU.md:1449 | AgeFilter.tsx | age-filter | no | age-filter:14 | Screen not in `type Screen` (overlay, inferred) |
| Hidden (phrases) | docs/chat_RU.md:488 | Hidden.tsx (App.tsx:83) | hidden | no | lists:10, swipe:51 | |
| Step away / away | docs/chat_RU.md:879 | App.tsx:90-91 step-away/away | step-away, away | no | me:11, chat-away:52 | |
| Theme | docs/chat_RU.md:809 | App.tsx:92 | theme | no | theme:9 | |
| Legal accept / new revision | docs/depth-client_RU.md:1214 | Legal.tsx (App.tsx:426) | legal | no (inferred: registration passes it silently) | legal:33,55,79 | |
| Reset (start again) | docs/depth-client_RU.md:368 | App.tsx:89 | reset | no | me:11 | |
| Reissue paper code | docs/depth-client_RU.md:368 | Reissue.tsx | reissue | no | reissue:8, two-devices:63 | |
| Change PIN | docs/chat-flows_RU.md:88 | App.tsx:80 | change-pin | no | me:11, restore-pin:9 | |
| Unlock / idle lock | docs/chat_RU.md:1220 | Unlock.tsx, Locked.tsx | unlock, unlock-wrong, locked | no (reload at :266 inferred unlock-free) | idle-lock:14, unlock-last-attempts:16,83, unlock-silent:9 | |
| Edit name / age | docs/chat-flows_RU.md:792 | App.tsx:79 | edit-name, edit-age | name yes :271; age no | me:124,161, chat-age:45 | |
| Language | docs/chat_RU.md:786 | Splash list, Me row | lang, splash-lang | yes :153-155, :291-294 | language:11-51, k4:13 | Me row not walked |
| Wizard | (onboarding) | Wizard.tsx | wizard-1..4 | yes :174 | wizard:12,61 | |
| Register + errors | docs/chat-flows_RU.md:14 | Register.tsx | register-1/2/3, -young, -mismatch, -wrong, -1440 | yes :157-170 | register-feed:10, register-feedback, k4 | |
| Inbox | docs/chat-flows_RU.md:827 | Inbox.tsx | inbox-* | yes :209 | chat, starters | |
| Empty states | docs/chat_RU.md:2763 | feed/inbox/likes/tables empty (inferred EmptyState) | feed-empty, inbox-empty, likes-empty, tables-empty | first feed only (:177, inferred empty) | kit:507 (component only) | |
| Offline / error states | docs/chat_RU.md:2763 | ui/Status.tsx:9 (`offline`), ErrorLine | feed-loading, feed-refused | no offline step | kit:529, close-code:66, k4:65,97 | no flow-level offline test (inferred) |
| Devices list (`depth device`) | docs/depth-client_RU.md:243, :328 | no device list (inferred; Departure shows a code only) | none | no | no | inferred absent |
| Verifiable client (digest-pinned) | docs/depth-client_RU.md:40-55 | not possible in web by design | — | — | — | terminal-only by construction |
| 768 / 2560 layouts | docs/chat_RU.md:2763 | adaptive.css | feed-768, feed-2560, splash-768 (only these) | capable via WALK_WIDTH, runs not evidenced | layout:27,42 (no width named, inferred) | |

## 1. Promised, absent from web (5)

1. Place QR `#p=&s=` — docs/protocol_RU.md:167; no parser in web/src; sheet sheets/screen-26-place-qr.svg exists.
2. Art. 16 notice on a person's phrase — docs/depth-client_RU.md:344; no `/reports` in web/src (inferred).
3. Promo codes — docs/offers/SPEC_RU.md:562; not found in web/src (inferred).
4. Sending stickers — docs/chat_RU.md:305; web only displays them at tables, Table.tsx:158 (inferred; alpha excludes them, depth-client_RU.md:1095).
5. Device/session list (`depth device`) — docs/depth-client_RU.md:328 (inferred).
(Not counted: in-app QR scanner — explicitly rejected, docs/offers/README_RU.md:302; verifiable build — terminal-only by design.)

## 2. Present, never walked by textwalk (25)

Cabinet (all 6 views), offer in feed + complaint, offer exit, arrival, departure, likes screen, rekey, safety code, block (card/chat), blocked list, end chat, chat span, chat game, game classes other than dots (6: grid, deck, word, dice, free, physics), statements, age filter, hidden, step-away/away, theme, legal, reset, reissue, change PIN, unlock/locked, edit age, language row in Me, composer limit state, offline state, 768/2560 runs (not evidenced).

## 3. Present and walked, without a design sheet (2)

1. Game boards per class at a table: walked (dots, textwalk.mjs:245-261); no per-class sheet — only generic table-393/1440/over.
2. Place by pasted coordinates (textwalk.mjs:281): the `place` sheet exists, the coordinates path has none (inferred).
Everything else walked has an `adaptive-*` sheet in both brands.
