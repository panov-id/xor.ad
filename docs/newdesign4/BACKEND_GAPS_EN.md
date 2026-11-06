# Backend gaps: what the archive screens show and the node does not serve

Pair: `BACKEND_GAPS_RU.md`. Source: `audit/AUDIT.tsv` (made by `audit/build-audit.py`, 01.11.2026), 144 families of
`sosed-design-2026-10-29_2.zip`. A row marked `?` is an inference of the audit agent, NOT VERIFIED; each row is checked
against the node code when its family is built, then marked here.

Totals of the audit: node serves 77 families, part of it 11, nothing 15; 39 families need no node call.

| Family | Screen | Node | What is missing | Checked |
|---|---|---|---|---|
| 38 | phrase-rejected | partial | ? moderation verdict reason shown to the author (model verdict not returned to client) | no |
| 39 | phrase-faded | partial | ? faded own phrase kept for the author after fade | no |
| 43 | feed-search | no | text search over the feed (GET /feed has only lat/lon/radius/after) | no |
| 45 | link-gone | no | ? public phrase page /l/<id> and faded-link state without keys | no |
| 65 | lost-compose | partial | lost kind exists (db/089, mode in POST /feed); 3-day life per kind not confirmed | yes, 02.11: lib/feed_verdict.ts:164 LOST_SPAN = 3 days, feed_publish test «lives three days» |
| 66 | lost-open | yes | seen marks (point,time,line): new table; owner sees all, others dots without author | yes, 02.11: db/090 lost_seen_marks, GET /feed/:id/seen (routes/lost.ts) — the author reads where+when, others only when and dim; no author; test lost.test.ts |
| 67 | lost-seen | yes | POST a seen mark without geolocation; fade after 3 days | yes, 02.11: POST /feed/:id/seen — where in words, when a step now/15m/1h/earlier, no coordinates; dim after 3 days (isDim); text judged by the model as seen_note |
| 68 | lost-print | partial | A4 flyer built on the device (photo never leaves); only phrase id/QR link needed | yes, 02.11: the node needs only the id — /l/<id> answers; the flyer is built on the device |
| 69 | lost-scan | partial | public page /l/<id>; anonymous mark write; per-device limit, captcha-lite | partial, 02.11: GET /l/:id without a key, limited by address as /o/:code — done; the anonymous mark is BLOCKED: a daily IP+UA hash contradicts «We do not fingerprint your browser» (LOST_SPOTS §6), owner's word |
| 70 | lost-found | yes | POST /feed/:id/found exists; /l/<id> 'Found, thank you' public state missing | yes, 02.11: GET /l/:id → state found after /found, gone after the term or the counted take-down (POST /feed/:id/complaints, 3 counting) |
| 71 | spot-new | no | spot entity: name (checked as phrase), closed flag, term, cap | no |
| 74 | spot-scan | no | entry by code, membership row (spot,identity) with no list of people | no |
| 75 | spot-feed | no | closed spot feed separate from the street feed | no |
| 77 | spot-mine | no | organiser numbers only: scans, inside, phrases; live code rotation, paper code | no |
| 78 | spot-pin | no | pinned message <=140 chars + useful lines, checked as a phrase | no |
| 85 | new-table-3 | partial | ? 'how neighbours see it' visibility option on POST /tables not confirmed | no |
| 94 | game-lost | partial | ? result reasons draw/left/timeout/paused/reconnect and move clock: only resign/nudge found in tables routes | no |
| 102 | game-watch | partial | ? watch mode: spectator seat after 3 skipped turns exists; 'can watch' list flag not confirmed | no |
| 114 | chat-stickers | partial | ? stickers in a chat of two: messages are ciphertext, sticker field only on table lines | no |
| 132 | notif-ask | no | push/notification permission and subscription route (none in node) | no |
| 133 | notif-settings | no | per-kind notification settings stored per identity | no |
| 146 | appeal | no | appeal route and state (mailer says no formal internal appeals body) | no |
| 157 | cab-offer-stats | no | offer stats: views, opens, redemptions (no counters route in /adv) | no |
| 159 | cab-account | partial | ? account page: GET /adv/me exists; edit/close account not found | no |
| 268 | ad-panel | no | ? ad panel slot data for wide screens (no route serves it) | no |
| 273 | ad-offer-gone | partial | ? ad-offer-gone state of /o/:code (stopped offer) not confirmed | no |
| 283 | feed (filters) | no | phrase topics Neighbours / Activities / Things: a phrase has no topic field, GET /feed does not filter; the archive's composer (59) picks no topic — where it comes from is the owner's call (the node's model from the text?) | yes, 01.11: relay/node/src/routes/feed.ts:580–604 — kind, mode, no topic |
| 283 | feed (tile) | yes | distance: the node sends the phrase's lat/lon on its radius's grid, the app measures from its own place | yes, 01.11: routes/feed.ts:586–587 |
