# Пробелы узла: что показывают экраны архива и чего узел не отдаёт

Пара: `BACKEND_GAPS_EN.md`. Источник: `audit/AUDIT.tsv` (сделан `audit/build-audit.py`, 01.11.2026), 144 семейства
`sosed-design-2026-10-29_2.zip`. Строка с `?` — догадка агента описи, НЕ ПРОВЕРЕНО; каждая строка сверяется с кодом
узла, когда до её семейства доходит работа, и отмечается здесь.

Итог описи: узел отдаёт всё для 77 семейств, часть — для 11, ничего — для 15; 39 семействам узел не нужен.

| Семейство | Экран | Узел | Чего не хватает (дословно из описи, по-английски) | Сверено |
|---|---|---|---|---|
| 38 | phrase-rejected | частично | ? moderation verdict reason shown to the author (model verdict not returned to client) | нет |
| 39 | phrase-faded | частично | ? faded own phrase kept for the author after fade | нет |
| 43 | feed-search | нет | text search over the feed (GET /feed has only lat/lon/radius/after) | нет |
| 45 | link-gone | нет | ? public phrase page /l/<id> and faded-link state without keys | нет |
| 65 | lost-compose | частично | lost kind exists (db/089, mode in POST /feed); 3-day life per kind not confirmed | да, 02.11: lib/feed_verdict.ts:164 LOST_SPAN = 3 days, тест feed_publish «lives three days» |
| 66 | lost-open | да | seen marks (point,time,line): new table; owner sees all, others dots without author | да, 02.11: db/090 lost_seen_marks, GET /feed/:id/seen (routes/lost.ts) — хозяин видит где+когда, другие только когда и dim; без автора; тест lost.test.ts |
| 67 | lost-seen | да | POST a seen mark without geolocation; fade after 3 days | да, 02.11: POST /feed/:id/seen — «где» словами, «когда» ступенью now/15m/1h/earlier, координат нет; dim после 3 дней (isDim); текст через модель как seen_note |
| 68 | lost-print | частично | A4 flyer built on the device (photo never leaves); only phrase id/QR link needed | да, 02.11: узлу нужен только id — ссылка /l/<id> отвечает; листовка на устройстве |
| 69 | lost-scan | частично | public page /l/<id>; anonymous mark write; per-device limit, captcha-lite | частично, 02.11: GET /l/:id без ключа, лимит по адресу как /o/:code — есть; анонимная отметка — BLOCKED: суточный хэш IP+UA спорит с «We do not fingerprint your browser» (LOST_SPOTS §6), слово владельца |
| 70 | lost-found | да | POST /feed/:id/found exists; /l/<id> 'Found, thank you' public state missing | да, 02.11: GET /l/:id → state found после /found, gone после срока или снятия счётом (POST /feed/:id/complaints, 3 засчитанных) |
| 71 | spot-new | нет | spot entity: name (checked as phrase), closed flag, term, cap | нет |
| 74 | spot-scan | нет | entry by code, membership row (spot,identity) with no list of people | нет |
| 75 | spot-feed | нет | closed spot feed separate from the street feed | нет |
| 77 | spot-mine | нет | organiser numbers only: scans, inside, phrases; live code rotation, paper code | нет |
| 78 | spot-pin | нет | pinned message <=140 chars + useful lines, checked as a phrase | нет |
| 85 | new-table-3 | частично | ? 'how neighbours see it' visibility option on POST /tables not confirmed | нет |
| 94 | game-lost | частично | ? result reasons draw/left/timeout/paused/reconnect and move clock: only resign/nudge found in tables routes | нет |
| 102 | game-watch | частично | ? watch mode: spectator seat after 3 skipped turns exists; 'can watch' list flag not confirmed | нет |
| 114 | chat-stickers | частично | ? stickers in a chat of two: messages are ciphertext, sticker field only on table lines | нет |
| 132 | notif-ask | нет | push/notification permission and subscription route (none in node) | нет |
| 133 | notif-settings | нет | per-kind notification settings stored per identity | нет |
| 146 | appeal | нет | appeal route and state (mailer says no formal internal appeals body) | нет |
| 157 | cab-offer-stats | нет | offer stats: views, opens, redemptions (no counters route in /adv) | нет |
| 159 | cab-account | частично | ? account page: GET /adv/me exists; edit/close account not found | нет |
| 268 | ad-panel | нет | ? ad panel slot data for wide screens (no route serves it) | нет |
| 273 | ad-offer-gone | частично | ? ad-offer-gone state of /o/:code (stopped offer) not confirmed | нет |
| 283 | feed (фильтры) | нет | темы фраз Neighbours / Activities / Things: у фразы нет поля темы, GET /feed не фильтрует; в композере архива (59) темы не выбирают — откуда она, решает владелец (модель узла по тексту?) | да, 01.11: relay/node/src/routes/feed.ts:580–604 — kind, mode, без темы |
| 283 | feed (плитка) | да | расстояние: узел отдаёт lat/lon фразы по сетке её радиуса, приложение считает от своего места | да, 01.11: routes/feed.ts:586–587 |
