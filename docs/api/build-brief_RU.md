# Бриф на код API — 17.09.2026

Что программировать, в каком порядке и обо что проверять. Канон контракта — `docs/api/openapi.yaml`
(105 операций: построено 39, из спеки 66, предложено 0; `GET /likes` и `POST/DELETE /tables/{id}/like` утверждены 17.09.2026), протокол —
`protocol_RU.md`, данные — спека чата `chat_RU.md` и спека офферов, тесты — `test-map_RU.md`. Пара — `build-brief_EN.md`.

## 1. Перед первой строкой

- **Имена 56 предложенных маршрутов утверждены владельцем 17.09.2026** (`ROUTES_2026-09-17_naming_RU.md`); в yaml они стоят с `x-status: spec`, список §8 протокола пуст.
- **Сначала ядро, потом лица** (§13 спеки чата): протокол, крипто и состояние — общий модуль без DOM и без Ink;
  терминал `depth` идёт первым, веб — по проверенному протоколу.
- **Ворота держат контракт**: `check-openapi.sh` сверяет yaml с таблицами протокола и с `relay/node/src/routes`
  в обе стороны, ловит дубли ключей и порванные описания; `check-facts-schema.sh` — таблицы против базы и
  миграций; `check-facts-limits.sh` — каждый срок узла с исполнителем. Построенный маршрут получает `x-status: built`
  и `x-source`, иначе ворота красные.
- **Миграции** — по одной на решение, схлопывать до пуша, fresh migrate на выброшенной базе перед мержем
  (навык `git-workflow`). Таблиц продукта 29, все объявлены в каноне, ни одна не мигрирована.

## 2. Сквозные правила (протокол §2–§6)

Подпись запроса: ECDSA P-256 над `метод\nпуть\nsha256 тела\nunix-время`, заголовки `x-identity-session`,
`x-identity-time`, `x-identity-sign`, окно ±5 минут. Заголовок `x-protocol-version` на каждом запросе, ответ
`x-protocol-sunset` при назначенной дате, субпротокол `xor.p1` на сокете. Форма ошибки `{error: {code, message,
reason?}}`, 429 с `Retry-After`, 409 «примите заново» своей формой. Одноразовые действия — семь маршрутов с
`nonce` в теле, таблица `nonces`, повтор ищется после проверки подписи. Пагинация — курсор `?after`, ответ
`{items, next}`. Сокет — кадры только от узла, билет в `Sec-WebSocket-Protocol`, коды закрытия 1000–4005.
Наружу не уходит ни один идентификатор человека: uuid только у сущностей, места — номерами.

## 3. Порядок по данным (§13) — что строить на каждом шаге

| Шаг | Таблицы (спека чата) | Операции | Тесты (карта) | Пределы (`limits.tsv`) |
|---|---|---|---|---|
| 1. Личность и сессия | `identities`, `sessions`, `vault_shares`, `nonces`, `legal_acceptances`, `identity_appearance` | `POST /identities`, `POST /vault/share`, `POST /sessions/invite`, `POST /vault/pin`, `POST /identities/close`, `PUT /identities/appearance`, `POST /sessions/claim`, `POST /recovery/claim`, `GET /legal/manifest`, `POST /legal/accept`, `GET /identities/me`, `PATCH /identities/me`, `POST /recovery/reissue`, `GET /statements` | §1–5, §17, §22 | `identities.create.*`, `pin.attempts`, `recovery.*`, `invite.lifetime`, `nonce.*`, `profile.patch.day`, `reissue.day` |
| 2. Лента и гео | `feed_messages`, `identity_stats` | `POST /feed`, `GET /feed`, `DELETE /feed/{id}`, `GET /feed/density` | §6–7 | `phrase.length`, `feed.publications.hour`, `feed.area.steps`, `moderation.queue.wait`, `filter.age.*` |
| 3. Лайки | `likes` | `POST /feed/{id}/like`, `DELETE /feed/{id}/like` | §8 | — |
| 4. Мэтч и согласие | `matches`, `match_participants`, `chat_starters` | `POST /matches/{id}/consent`, `GET /inbox` | §9–10, §18, §21 | `match.*` |
| 5–6. Чат, транспорт и шифрование | `chats`, `chat_participants`, `pending_deliveries`, `chat_key_wraps` | `POST /feed/{id}/like`, `DELETE /feed/{id}/like`, `POST /matches/{id}/consent`, `GET /inbox`, `POST /chats/{id}/ticket`, `POST /chats/alive`, `DELETE /chats/{id}`, `PATCH /chats/{id}`, `POST /chats/{id}/game`, `GET /chats/{id}/game`, `DELETE /chats/{id}/game`, `POST /chats/{id}/game/answer`, `POST /chats/{id}/game/moves`, `POST /chats/{id}/game/word`, `POST /chats/{id}/game/confirm`, `POST /chats/{id}/game/proposals`, `POST /chats/{id}/game/proposals/{pid}`, `POST /chats/{id}/game/resign`, `POST /chats/{id}/messages`, `POST /chats/{id}/received` (кроме `game*`) | §11–14, §19–20 | `chat.*`, `ticket.lifetime` |
| 7. Блокировки, скрытие, чистка, отлучка | `blocks`, `hidden_messages` | `POST /blocks`, `GET /blocks`, `DELETE /blocks/{id}`, `POST /hidden`, `GET /hidden`, `DELETE /hidden/{id}`, `POST /away`, `DELETE /away` | §16, §19, §22 | `blocks.hour`, `hidden.hour`, `away.span.*` |
| 8. Уведомления и игры | `chat_games`, `tables`, `table_seats`, `table_lines`, `table_games`, `table_scores`, `support_requests` | `POST /tables`, `GET /tables/{id}`, `POST /tables/{id}/seat`, `DELETE /tables/{id}/seat`, `POST /tables/{id}/ticket`, `POST /tables/{id}/lines`, `POST /tables/{id}/moves`, `POST /tables/{id}/confirm`, `POST /tables/{id}/proposals`, `POST /tables/{id}/proposals/{pid}`, `POST /tables/{id}/resign`, `POST /tables/{id}/congratulate`, `POST /tables/{id}/kick`, `/chats/{id}/game*`, `POST /support`, `GET /support`, `POST /support/{no}/seen`, `GET /statements` | §15, §23 | `table.*`, `sticker.minute`, `support.*`, `chat.messages.minute` |
| 9. Веб-лицо | — | по тому же протоколу | все | — |

Офферы (`advertisers`, `venues`, `offers`, `offer_link_reports`, спека офферов) — после чата, отдельным заходом.

## 4. Что держит код

`check-facts-open`: пунктов со стопом «код» два — `moderation.model` (какая модель: решается замером §8.14,
шаг 2) и `a11y.table.move.timer` (окно хода против WCAG 2.2.1, шаг 8). Пункты «с запуском» и «публикацию» код
не держат, но называют, чего в коде ещё нет: уборщики (`chat.janitor.missing`, `feed.sweeper`, `table.sweeper`),
таймеры стола (`table.timers.unbuilt`, задача `table_autopass`), сторожа С1–С7, `receipt_hash` в `report.ts`,
колонка `until` в `dsa_statements`, переменные узла `PROTOCOL_SUNSET_AT` и `BACKUP_AGE_ALERT_HOURS`.

## 5. Как проверять

Карта тестов `test-map_RU.md` §1–23 — что должно быть правдой и чем доказывается, по шагам; §23 — контракт
(версия, форма ошибки, пагинация, отлучка, nonce, seq). Тест, который никогда не падал, ничего не доказывает:
после написания сломать проверяемое и увидеть красное (правило проекта). Панель ревью — перед первой строкой
нового сервиса и перед мержем существенного изменения (`review-panel`).
