# Ночной разбор 18.09.2026: план сборки API по брифу

Рабочий протокол ночного аналитика. Код не писался, файлы не правились; единственный
артефакт — этот документ. Пара `_EN` не заводится по заданию ночи (исключение из правила 18,
проговорено вслух).

Как читать пометки: **ПРОВЕРЕНО** — утверждение снято с файла или командой, названо чем;
**НЕ ПРОВЕРЕНО** — вывод по чтению или память, живым запуском не подтверждён.

Оценки часов — для одного разработчика с агентом; они не замер, а прикидка по объёму
маршрутов, таблиц и тестов, и относятся к коду узла без клиента `depth`.

---

## 0. Сверка счётов, о которых просили

- **ПРОВЕРЕНО** `grep -c x-status docs/api/openapi.yaml` = 105, но это совпадение, а не счёт
  операций: четыре строки — описание в `info` (строки 7, 8, 13, 14), а `grep -o "x-status: [a-z]*" | sort | uniq -c`
  даёт **35 built + 66 spec = 101** помеченных операции. Ещё четыре built-операции наследуют
  `x-status` через YAML-якоря (`&adminLog` на `/admin/logs-client-errors` для трёх `/admin/logs-*`,
  `&quota` на `/admin/api-keys/{id}/quota` для `/admin/secret-keys/{id}/quota`; `openapi.yaml:799`,
  `openapi.yaml:879`). Итого **39 built + 66 spec + 0 proposed = 105 операций** — бриф
  (`build-brief_RU.md:4`) прав.
- **ПРОВЕРЕНО** `POST /feed/{id}/claim` в yaml нет (`grep -n claim` даёт только `/sessions/claim`
  и `/recovery/claim`). `proposed` — ноль.
- **ПРОВЕРЕНО** таблиц продукта в `docs/facts/schema.tsv` — 29 (`grep -c $'\tproduct$'`): 26 из
  спеки чата + `advertisers`, `venues`, `offers`, `offer_link_reports` из спеки офферов; ни одна
  не мигрирована (колонка `migration` = `-`).
- **ПРОВЕРЕНО** `scripts/count-tests.sh`: `relay/node/test` 197, `testing/e2e` 10, итого 207 — совпадает
  с `test-map_RU.md:38-40`.

---

## 1. Каркас: как устроен узел сейчас

### 1.1. Язык, сборка, запуск

- **ПРОВЕРЕНО** Deno 2.1.4 (`relay/node/Dockerfile:2` — `FROM denoland/deno:alpine-2.1.4`), без
  фреймворка: `Deno.serve` в `relay/node/src/main.ts:59`. Задачи — `relay/node/deno.json`
  (`dev`, `start`, `check`, `test`, `test:db`, `fmt`, `lint`); `deno fmt` на 100 колонок с `;`.
- **ПРОВЕРЕНО** Postgres через `jsr:@db/postgres@0.19`, пул из 4 соединений
  (`relay/node/src/lib/db.ts:14-21`). Три примитива: `query` (глотает ошибку, возвращает `null`,
  `db.ts:37-53`), `queryOrThrow` (`db.ts:57-65`), `transaction` (одно соединение, BEGIN/COMMIT,
  колбэк получает скоуповый `query`, `db.ts:80-102`). База **не обязательна**: `enabled()`
  (`db.ts:25`) — без `DATABASE_URL` все `query` возвращают `null`, и узел «работает».

### 1.2. Роутинг — два уровня

- **ПРОВЕРЕНО** Точная таблица `routes: Record<string, Handler>` в `main.ts:30-47` — ключ
  `"МЕТОД /путь"`, обработчик `(req: Request) => Response`. Здесь живут `/health`, `/ready`,
  `/metrics`, `/waitlist`, `/client-error`, `/pageview`, `/report`, `/csp-report` и заглушка
  `GET /chat` → `relayUpgrade` (`main.ts:46`), отвечающая 501 (`relay/node/src/chat/relay.ts:32-34`).
- **ПРОВЕРЕНО** Паттерн-роутер `relay/node/src/lib/router.ts`: `route(method, "/a/:id", h)`
  (`router.ts:19-26`), обработчик получает `{req, params, url}` (`router.ts:10-15`); первый
  совпавший выигрывает (`router.ts:32-42`). Модули регистрируются побочным эффектом импорта:
  `import "./routes/dsa.ts"`, `"./routes/admin.ts"`, `"./routes/v1.ts"` (`main.ts:19,25,26`).
  Так же будет подключаться каждый новый модуль продукта.
- **ПРОВЕРЕНО** В диспетчере `main.ts:59-127`: `HEAD` = `GET` без тела (`main.ts:72-74`), `OPTIONS` —
  204 на любой путь (`main.ts:65`), исключение обработчика → `{error: "internal"}` 500
  (`main.ts:107`), метрика по маршруту-паттерну, `x-request-id`, CORS. **Слоя middleware нет**:
  нет места, куда воткнуть проверку `x-protocol-version` или подписи «на все подписанные
  маршруты» разом — это придётся делать обёрткой над обработчиком (как `requirePermission` в
  `lib/access_guard.ts` для панели) либо новым слоем в `main.ts` перед `routes[route]`.

### 1.3. Форма ошибки, пределы, идемпотентность — что переиспользуется

- **ПРОВЕРЕНО** `apiError(code, message, status, extra, headers)` в `relay/node/src/routes/v1.ts:30-40`
  даёт ровно `{error: {code, message, ...}}` — форма `ApiError` протокола §6 (`protocol_RU.md:399-405`).
  Экспортирована из `v1.ts`; для продукта её стоит вынести в `lib/http.ts`, а не импортировать из
  чужого маршрута.
- **ПРОВЕРЕНО** Скользящий лимитер в памяти `relay/node/src/lib/rate_limit.ts`: `check(limit, key, now)`
  и `checkAll(limits, key)` (`rate_limit.ts:142-229`), `retryAfterSeconds` до выхода старейшего
  события из окна (`rate_limit.ts:208`) — ровно то, что протокол §5 требует для `Retry-After`
  (`protocol_RU.md:365`). Ключ — произвольная строка, значит счётчики «по личности» из §5 ложатся
  сюда без правок (ключ = `identity:<uuid>`), а «по адресу» — как у `REPORT_LIMITS`
  (`routes/report.ts:63-72`). Потолок 50 000 корзин с вытеснением по заполненности
  (`rate_limit.ts:41,143-193`).
- **ПРОВЕРЕНО** `lib/idempotency.ts` — таблица `idempotency` по ключу `brand:key:sha256(body)`
  (`idempotency.ts:21-22`), хранит `{status, body}` (`idempotency.ts:16-19`). Это **не** таблица
  `nonces` канона: та привязана к сессии и маршруту (`chat_RU.md:1029-1037`), хранит только 2xx/409
  и живёт 10 минут. Переиспользовать можно рисунок (`recall`/`remember`), не таблицу.
- **ПРОВЕРЕНО** Подписей ECDSA в узле нет нигде: `grep -rn "ECDSA\|P-256\|x-identity" relay/node/src`
  — пусто. Есть `lib/jwt.ts` (HS256 для панели) и `lib/hash.ts` (`sha256hex`). WebCrypto
  `crypto.subtle.verify` в Deno 2.1 доступен — ключ сессии придётся импортировать из хранимого
  `sign_public_key` (формат хранения не назван, см. §3).
- **ПРОВЕРЕНО** `LISTEN`/`NOTIFY` в коде нет (`grep -rn "LISTEN\|NOTIFY" relay/node/src` — пусто), а
  канон требует `NOTIFY session_frozen` и `seat_left` в транзакции (`protocol_RU.md:202-203,218`).
  Пул `db.ts` для `LISTEN` не годится: нужно выделенное долгоживущее соединение вне пула.
- **ПРОВЕРЕНО** WebSocket-апгрейда в коде нет: `relay.ts` — заглушка 501, `Deno.upgradeWebSocket`
  не вызывается ни в одном файле.

### 1.4. Миграции

- **ПРОВЕРЕНО** `relay/node/tools/migrate_db.ts`: файлы `db/*.sql` по имени, по одному в транзакции
  под `pg_advisory_xact_lock(8150413)`, запись в `schema_migrations` (`migrate_db.ts:17,27-32,56-72`).
  Ни отката, ни контрольных сумм — миграция обязана быть идемпотентной сама (`IF NOT EXISTS`),
  иначе повтор после неудачной записи применит её дважды (`migrate_db.ts:49-55`).
- **ПРОВЕРЕНО** На диске 18 файлов, нумерация `001…021` с дырами (`011`, `018`, `019`
  отсутствуют; `ls relay/node/db`). Следующий номер продукта — `022`. Все 18 — управляющий контур
  и DSA; таблиц продукта ноль.
- **ПРОВЕРЕНО** Ворота `scripts/check-facts-schema.sh` сверяют реестр `schema.tsv` с живой базой
  стенда и без базы отказываются работать (`schema.tsv:19-25`). Значит каждая миграция продукта
  сопровождается правкой колонки `migration` в `schema.tsv`.

### 1.5. Тесты

- **ПРОВЕРЕНО** Два контура: `deno test … --ignore=test/database.test.ts --shuffle` без базы
  (`deno.json`, задача `test`) и `scripts/run-relay-database-tests.sh` — одноразовый `postgres:16-alpine`
  в Docker, миграции, прогон `test/database.test.ts`, снос (`run-relay-database-tests.sh:19-60`).
- **ПРОВЕРЕНО** Стиль: каждый файл объявляет окружение через `suite({...})` из
  `test/support/config_env.ts` (`config_env.ts:66-97`), которое очищает все переменные из списка
  `CONFIGURED` (`config_env.ts:22-48`) и зовёт `reloadConfig()`. Маршрут вызывается **без сервера**:
  `match(method, path)` из роутера и `h({req, params, url})` — так делает `database.test.ts:61-79`.
  Утверждения — `jsr:@std/assert@1`.
- **ПРОВЕРЕНО** Для продукта нужен именно второй контур: `database.test.ts` требует `DATABASE_URL`
  и падает без него (`database.test.ts:22-26`). Карта тестов §1–§23 — почти целиком «нечем»
  (`test-map_RU.md`); тестов о чате и ленте — 0 (`test-map_RU.md:40`).

### 1.6. Фоновые задачи, почта, конфиг

- **ПРОВЕРЕНО** Очередь `jobs` в базе: `handle(kind, fn)` + `enqueueOnce` + воркер раз в минуту с
  арендой 10 минут (`relay/node/src/lib/jobs.ts:16-19,44-46,94-121,217-231`); задача перевзводится,
  возвращая `Date` (`jobs.ts:33-40`). Все уборщики регистрируются в
  `lib/scheduled.ts:57-136` и взводятся на старте `scheduled.ts:141-148`. Уборщики продукта
  (`feed.sweeper`, `chat.janitor.missing`, `table.sweeper`, `identity.sweeper`, `support.sweeper`)
  — открытые пункты `open.tsv`, кода нет.
- **ПРОВЕРЕНО** Почта: `MAIL_TRANSPORT` smtp/resend/none, умолчание smtp на `mailpit:1025`
  (`relay/node/src/config.ts:122-124`); dev-бокс поднимает Mailpit визардом
  (`relay/wizard/wizard.py:205-206`).
- **ПРОВЕРЕНО** Метрики: счётчики `inc` и **есть `setGauge`** (`relay/node/src/lib/metrics.ts:104,112`)
  — канон §8.3 (`chat_RU.md`, «сегодня модуль метрик узла умеет лишь счётчики») устарел; датчики
  `relay_moderation_oldest_seconds`, `relay_sockets_open{kind}` (`watchdogs_RU.md:377`) строятся
  на нём без правок модуля.
- **ПРОВЕРЕНО** Переменных `PROTOCOL_SUNSET_AT`, `MODERATION_*`, `REPORT_THRESHOLD_*`,
  `DSA_ESCALATION_EMAILS`, `MAIL_FALLBACK_TRANSPORT` в `config.ts` нет (`grep`), и в списке
  `CONFIGURED` тестовой обвязки их тоже нет — добавляя переменную, добавлять в оба места.

---

## 2. Пошаговый план сборки

Шаги — по брифу `build-brief_RU.md:31-40`; шаги 3–6 брифа здесь слиты в «лайк/мэтч/чат» и «сокет»,
как просил владелец; шаг 0 добавлен — без него ни один маршрут не отвечает по протоколу.

### Шаг 0. Сквозной каркас протокола (§2–§6 протокола)

| Что | Где сейчас | Что строить |
|---|---|---|
| Проверка `x-protocol-version` → 400 `protocol_version_unsupported` | нет | обёртка `signed(handler)` или слой в `main.ts` перед диспетчером; заголовок `x-protocol-sunset` из `PROTOCOL_SUNSET_AT` на **каждый** ответ (`protocol_RU.md:133`) |
| Подпись ECDSA P-256 над `метод\nпуть\nsha256(тела)\nвремя`, окно ±5 мин, живая сессия, `frozen_at IS NULL` | нет | `lib/identity_auth.ts`: читает `sessions.sign_public_key`, `crypto.subtle.verify`; кладёт `{session, identity}` в контекст |
| Отлучка: 409 `stepped_away` на всё, кроме трёх маршрутов (`protocol_RU.md:306`) | нет | та же обёртка, флаг `allowWhileAway` |
| Nonce у семи маршрутов (`protocol_RU.md:113-116`) | таблица не мигрирована | `lib/nonce.ts` по образцу `idempotency.ts`; порядок: подпись → версия → nonce → обработчик; хранить только 2xx/409 |
| Форма ошибки | `apiError` в `routes/v1.ts:30` | вынести в `lib/http.ts`, коды — из `ApiError.enum` (`openapi.yaml:252`) |
| Пределы «по личности» | `rate_limit.ts` | объявить `Limit[]` для 12 строк §5 протокола с ключом `identity:<id>` |
| Обязательная база | `db.enabled()` | подписанные маршруты без базы отвечают 503, а не «работают» (пункт `node.ready.database.off`) |
| Выделенное соединение `LISTEN` | нет | `lib/bus.ts`: одно соединение, каналы `session_frozen`, `seat_left`, `chat_<id>` |

Тесты: §2 карты (2.1–2.4), §23.1, §23.2, §23.5, §23.8 (`test-map_RU.md:70-74,409-416`).
Окружение: `DATABASE_URL` обязателен; `PROTOCOL_SUNSET_AT` (пусто).
**Оценка: 20–28 ч.** Риски: формат подписи не назван (§3.1), заголовок не доходит через WAF
(НЕ ПРОВЕРЕНО — по памяти проекта WAF режет цитаты атак на api-хосте; `x-identity-sign` — base64url,
безопасно, но тело `POST /feed` с `<script>` в тексте фразы будет срезано до узла).

### Шаг 1. Личность и сессия

- **Таблицы (DDL канона):** `identities` (`chat_RU.md:774-793`), `identity_appearance` (`:799-806`),
  `legal_acceptances` (`:815-823`), `sessions` (`:1012-1024`), `nonces` (`:1029-1038`),
  `vault_shares` (`:1227-1237`), плюс `identity_stats` (`:1908-1915` и `ALTER` с массивами
  `rejected_at_recent`/`published_at_recent`/`first_published_at`, `chat_RU.md:1586-1590`) — она
  создаётся в транзакции регистрации (`chat_RU.md:1592`). В `relay/node/db` — ничего из этого.
  Миграция `022_identity.sql` (одна на решение, схлопывать до пуша — бриф §1).
- **Маршруты openapi (все `x-status: spec`):** `POST /identities` (`openapi.yaml:1068`), `POST /vault/share` (`:1082`),
  `POST /sessions/invite` (`:1098`), `POST /vault/pin` (`:1114`), `POST /identities/close` (`:1131`),
  `PUT /identities/appearance` (`:1148`), `POST /sessions/claim` (`:1163`), `POST /recovery/claim` (`:1177`),
  `GET /legal/manifest` (`:1188`), `POST /legal/accept` (`:1201`), `GET /identities/me` (`:2009`),
  `PATCH /identities/me` (`:2024`), `POST /recovery/reissue` (`:2041`). `GET /statements` — в шаг 7.
- **Тесты:** §1, §2, §3 (3.1–3.6), §4, §5, §17 (17.5, 17.6, 17.9–17.11), §22 (22.1–22.7 частично —
  до ленты только `stepped_away_until`), §23.10 (`test-map_RU.md:51-119,332-347,389-401`).
- **Окружение:** `DATABASE_URL`; тесты — только через `run-relay-database-tests.sh`; Argon2id на
  узле **не нужен** (узел сравнивает хэш `auth`, `chat_RU.md:1196`), но какой хэш — не названо (§3).
- **Оценка: 55–70 ч.** Самые дорогие куски: атомарная попытка ПИНа с растущей задержкой
  (`chat_RU.md:1259-1272`), перенос с двумя конвертами и отменой вторым claim (`:1145`),
  восстановление с заморозкой живой сессии и сжиганием доли (`:1084-1085`).
- **Риски:** тела пяти маршрутов не описаны в контракте (§3.2); хранилища приглашений и
  «незавершённой регистрации» нет в DDL (§3.4, §3.5); общий счётчик промахов 50/час «на узел»
  в памяти — в пуле из двух боксов это 100 (`rate_limit.ts:5-7`, принято протоколом §5:365).

### Шаг 2. Лента и гео

- **Таблицы:** `feed_messages` с четырьмя индексами (`chat_RU.md:1437-1459`); SQL-функции
  `grid_round_lat`, `grid_round_lon`, `haversine`, `band_low`, `band_high`, которыми пользуется
  запрос выдачи (`chat_RU.md:1665-1693`) — **их DDL в каноне нет**, только формула
  (`chat_RU.md:1511-1516`). Миграция `023_feed.sql` + функции.
- **Маршруты:** `POST /feed` (`openapi.yaml:1217`), `GET /feed` (`:1232`), `DELETE /feed/{id}` (`:1264`),
  `GET /feed/density` (`:1278`). Здесь же — очередь модерации (воркер вне событийного цикла,
  `chat_RU.md:1643-1645`), вердикт имени (`name_state`, кадр `name_verdict` — но кадр требует
  сокета шага 4; до него вердикт виден через `GET /identities/me`), уборщик `feed.sweeper`,
  предел ожидания `moderation.queue.wait` 10 мин, датчик `relay_moderation_oldest_seconds` (С6).
- **Тесты:** §6 (6.1–6.13), §7 (7.1–7.11), §8.18, §8.19, §17.1–17.3, §23.3, §23.4 (столы — позже),
  §23.11 (после шага 3) (`test-map_RU.md:120-167,195-196`).
- **Окружение:** `MODERATION_FALSE_BLOCK_BUDGET`, `REPORT_THRESHOLD_SHARE`, `REPORT_THRESHOLD_FLOOR`
  (имена предложены, согласия нет — `protocol_RU.md:366-371`); модель — стенд
  `relay/moderation-bench` (**ПРОВЕРЕНО** каталог есть, `ls relay`), выбор модели — открытый пункт
  `moderation.model` со стопом «код» (`open.tsv:256`).
- **Оценка: 45–60 ч без модели** (первая ступень — правила: длина, ссылки, стоп-слова) **+ 15–25 ч**
  на встраивание классификатора как отдельного процесса, когда модель выбрана.
- **Риски:** `POST /feed` и `GET /feed` без тел и параметров в контракте (§3.2); WAF на api-хосте
  (шаг 0); порог по бюджету ложных блокировок нечем считать без замера §8.14.

### Шаг 3. Лайк, мэтч, согласие, инбокс

- **Таблицы:** `likes` (`chat_RU.md:1893-1898`), `matches` (`:1983-1989`), `match_participants`
  (`:1991-2002`), `chats` (`:2106-2113`), `chat_participants` (`:2115-2124`), `chat_starters`
  (`:2126-2134`). `table_likes` (`:1901-1906`) — в шаг 5. Миграция `024_match_chat.sql`.
- **Маршруты:** `POST/DELETE /feed/{id}/like` (`openapi.yaml:1292,1307`), `GET /likes` (`:1247`),
  `POST /matches/{id}/consent` (`:1320`), `GET /inbox` (`:1337`).
- **Тесты:** §8 (8.1–8.8), §9 (9.0–9.12, 8.9–8.11 — переакцепт), §10, §14 (14.1, 14.2), §18, §21,
  §23.11 (`test-map_RU.md:168-222,273-281,348-358,379-387`).
- **Окружение:** манифест редакций для 409 `legal_reacceptance_required` — откуда узел берёт
  `revision_sha256` (§3.9).
- **Оценка: 35–45 ч.** Мэтч-транзакция с `ON CONFLICT (pair_key) DO UPDATE … WHERE expires_at <= now()`
  (`chat_RU.md:2011-2016`) и гонка двух `accept` (тест 9.6) — основное.
- **Риски:** DDL `match_participants.message_id NOT NULL` против теста 10.3 «необязательны» (§3.7);
  `LikeResult.match_id` против теста 8.6 «только `{state}`» (§3.8).

### Шаг 4. Сокет, сообщения, шифрование

- **Таблицы:** `pending_deliveries` (`chat_RU.md:2270-2278`), `chat_key_wraps` (`:2538-2543`).
  Миграция `025_delivery.sql`.
- **Маршруты:** `POST /chats/{id}/ticket` (`openapi.yaml:1351`), `POST /chats/alive` (`:1367`),
  `DELETE /chats/{id}` (`:1385`), `PATCH /chats/{id}` (`:1398`), `POST /chats/{id}/messages` (`:2058`),
  `POST /chats/{id}/received` (`:2077`); апгрейд сокета — `GET /chat` (`openapi.yaml:587`, built как
  заглушка; путь сокета для стола не назван, §3.10); кадры `message`, `peer_stepped_away`, `sys`,
  `closed`, `name_verdict` (`protocol_RU.md:222-234`); коды закрытия 1000–4004; `NOTIFY session_frozen`;
  уборщик `chat.janitor.missing` (`gone_at`, `chats`, `pending_deliveries` по `chat.pending.ttl`, `nonces`).
- **Тесты:** §11 (11.2, 11.3), §12, §13, §19, §20 (20.1, 20.3, 20.4), §22.4, §22.5
  (`test-map_RU.md:223-272,360-378`).
- **Окружение:** второй бокс для 20.2 — «после появления пула»; Caddy на боксе должен пропускать
  `Upgrade` (НЕ ПРОВЕРЕНО: `relay/caddy` не читал).
- **Оценка: 45–60 ч.** Выделенное `LISTEN`-соединение, обмен билета → сессия, потолок очереди
  `chat.pending.max` 200 с вытеснением, отдача при подключении, `alive` с 503 при неподтверждённом
  чтении (`openapi.yaml:1372-1379`).
- **Риски:** формат билета и его хранилище не названы (§3.4); двухсрочная беседа (`idle_ttl_minutes`
  у каждого) требует уборщика **до** первой отладки — иначе `gone_at` никогда не наступает.

### Шаг 5. Столы и игры

- **Таблицы:** `tables` (`chat_RU.md:320-338`), `table_seats` (`:340-370`), `table_lines` (`:372-406`),
  `table_games` (`:414-436`), `chat_games` (`:444-464`), `table_scores` (`:481-485`), `table_likes`
  (`:1901-1906`). Миграция `026_tables.sql`.
- **Маршруты:** 15 операций `/tables*` (`openapi.yaml:1413-1668`) и 10 операций `/chats/{id}/game*`
  (`:1669-1837`); задача `table_autopass` раз в 30 с (`chat_RU.md:429`); `table.sweeper`; кадры `line`,
  `board`, `seat`, `proposal`, `confirm`; `NOTIFY seat_left` и код 4005.
- **Тесты:** §15 (15.1–15.17), §8.14–8.16, §23.9, §23.12, §23.13 (`test-map_RU.md:282-306,191-193,417-421`).
- **Окружение:** каталог стикеров (id из «нашего каталога», `chat_RU.md:378`) — где он лежит, не
  названо.
- **Оценка: 50–65 ч на инфраструктуру стола + 60–90 ч на движки семи классов** (`grid | free | dots |
  deck | dice | physics | word`, `openapi.yaml:274`): минимальные правила «свой код у класса»
  (`open.tsv:219-223`), физика по общему сиду (тест 15.4), виселица через очередь (15.5). Движки —
  самая большая и самая слабо описанная часть плана; их можно ставить параллельно и по одному классу.
- **Риски:** `tables.game` в DDL против `class` в контракте (§3.6); `TableView.is_playing` против
  «свой `seat` и `playing`» протокола (§3.6); окно хода против WCAG — открытый пункт
  `a11y.table.move.timer` со стопом «код» (`open.tsv:269`).

### Шаг 6. Блокировки, скрытие, отлучка, поддержка, профиль

- **Таблицы:** `blocks` (`chat_RU.md:2316-2323`), `hidden_messages` (`:2342-2353`), `support_requests`
  (`:2802-2816`). Миграция `027_safety_support.sql`. (Профиль — колонки `identities` шага 1.)
- **Маршруты:** `/blocks` ×3 (`openapi.yaml:1838-1884`), `/hidden` ×3 (`:1885-1930`), `/away` ×2
  (`:1931-1961`), `/support` ×3 (`:1962-2008`); `GET/PATCH /identities/me` уже с шага 1, здесь —
  `name_frozen`, `paused`, `age_step_down`, системная строка `age_changed`.
- **Тесты:** §16 (16.1–16.8e), §17.4, §17.7, §22 целиком, §23.5–23.7 (`test-map_RU.md:307-331,389-415`).
- **Окружение:** суточная сводка команде (`support.sweeper`) — адрес получателя; адрес поддержки
  витрины для 429 в `message` (`protocol_RU.md:312`) — из `brands` (`db/001`).
- **Оценка: 30–40 ч.** Отлучка — одна транзакция, которая трогает шесть таблиц
  (`protocol_RU.md:303`), и `leave_table(identity)` как общая процедура пяти путей (`chat_RU.md:335`).
- **Риски:** `POST /blocks` с `{table, seat}` до шага 5 не проверить; `blocks.hour` и `hidden.hour`
  в памяти — на пуле удваиваются (принято).

### Шаг 7. DSA-хвосты

- **Что:** `GET /statements` (`openapi.yaml:2094`; `delivered_at` при первой выдаче), `POST /report/decision`
  (`:654`; одинаковое тело и время для двух веток, `protocol_RU.md:247`), `receipt_hash` в
  `report.ts` (пункт `dsa.receipt.unbuilt`), колонка `until` в `dsa_statements`
  (`dsa.statements.until.unbuilt`, `open.tsv:281`), счётчик уведомлений (`dsa.notice.counter`),
  сторожа С1–С3, С6, С7 (`watchdogs_RU.md:302-373`), `prune_dsa_records` уносит `receipt_hash`.
- **Таблицы:** `ALTER dsa_statements ADD until, delivered_at`; `ALTER dsa_notices ADD receipt_hash,
  reminded_at, escalated_at` — миграция `028_dsa_tails.sql`.
- **Тесты:** §16.9, §16.9a, §16.9b, §16.7, §16.8 и таблица «Как проверить» сторожей
  (`watchdogs_RU.md:383-392`).
- **Окружение:** `DSA_ESCALATION_EMAILS`, `MAIL_FALLBACK_TRANSPORT`, `BACKUP_AGE_ALERT_HOURS`.
- **Оценка: 25–35 ч.**
- **Риски:** `GET /statements` без личности заявителя — у `dsa_statements` сегодня есть
  `notice_id` (`db/017_dsa_statements_notice_index.sql`), а связи «мотивировка → identity адресата»
  нет ни в одной миграции: как узел находит «свои» мотивировки по подписи — не описано (§3.11).

### Итог по часам

| Шаг | Часы |
|---|---|
| 0. Каркас протокола | 20–28 |
| 1. Личность и сессия | 55–70 |
| 2. Лента и гео (без модели / с моделью) | 45–60 / +15–25 |
| 3. Лайк, мэтч, инбокс | 35–45 |
| 4. Сокет, сообщения | 45–60 |
| 5. Столы: инфраструктура / движки | 50–65 / 60–90 |
| 6. Блокировки, отлучка, поддержка, профиль | 30–40 |
| 7. DSA-хвосты | 25–35 |
| **Всего** | **380–520 ч** (≈ 10–13 недель одного разработчика) |

Без движков игр и модели — **305–400 ч**. Оценка — прикидка, НЕ ПРОВЕРЕНО замером.

---

## 3. Канон и контракт недоговаривают

Каждый пункт — место, где код не соберётся без решения. Формат: оба конца → предложение.

### 3.1. Формат подписи, ключа и хэша тела

- `protocol_RU.md:96-102` и `chat_RU.md:953`: «`x-identity-sign` подпись, base64url». WebCrypto
  ECDSA даёт **сырые `r‖s` 64 байта**, а не DER; `openapi.yaml:75-80` (`identitySignature`) формат не
  уточняет. `sessions.sign_public_key text` (`chat_RU.md:1015`) — SPKI base64? JWK? raw 65 байт?
  `sha256 тела` — hex или base64url, и что подписывается при пустом теле (`GET`): sha256 пустой
  строки или пустая строка?
- **Решить:** подпись = raw `r‖s`, base64url без набивки; ключ хранится как JWK-строка
  (`crypto.subtle.exportKey("jwk")`, импортируется без разбора); хэш тела — hex нижним регистром,
  у запроса без тела — sha256 пустой строки; `x-identity-time` — целое unix-секунд, оно же в строке.
  Записать в протокол §2 и в `identitySignature.description`.

### 3.2. Тела и параметры, которых в контракте нет

**ПРОВЕРЕНО** по `openapi.yaml`: без `requestBody` стоят `POST /identities` (`:1068`,
«The body is not spelled out in the canon»), `POST /recovery/claim` (`:1177`), `PUT /identities/appearance`
(`:1148`), `POST /legal/accept` (`:1201`), `POST /feed` (`:1217`), `PATCH /chats/{id}` (`:1398`),
`POST /matches/{id}/consent` (`:1320` — а канон кладёт туда `ephemeral_public_key`, `chat_RU.md:2027`).
Без параметров запроса — `GET /feed` (`:1232`: канон требует `lat`, `lon`, радиус просмотра, язык, режим —
`chat_RU.md:1665-1693`, `:1530`), `GET /feed/density` (`:1277`). Без схемы ответа — `POST /identities`,
`POST /vault/share`, `POST /sessions/invite`, `POST /sessions/claim`, `POST /recovery/claim`,
`GET /legal/manifest`, `POST /chats/{id}/ticket`, `GET /feed/density`, `GET /inbox` (`items: object`).

- **Решить:** дописать все девять тел и семь ответов до первой строки шага 1 — иначе `check-openapi.sh`
  зелёный, а клиент `depth` строится по догадке. Минимальные предложения (не выдумка полей,
  а перенос из DDL): `POST /identities {name, age, identity_public_key, sign_public_key,
  wrap_public_key, label?, auth_hash, recovery: {lookup_id, wrapped_key}, appearance?}` →
  `{identity_id, session_id, share}`; `POST /feed {text, mode, lat, lon, area_radius, discount_value?,
  conditions?}`; `GET /feed?lat&lon&radius&mode?&after`; `PATCH /chats/{id} {idle_ttl_minutes}`;
  `POST /matches/{id}/consent {ephemeral_public_key}`.

### 3.3. Время: unix-секунды или ISO

- `protocol_RU.md:89`: «Время: unix-секунды, UTC. Часовых поясов в протоколе нет нигде».
  `FeedItem.created_at` — integer (`openapi.yaml:210`). Но `Board.expires_at`, `TableLine.created_at`,
  `SupportRequest.created_at/answered_at`, `Profile.stepped_away_until`, `phrases[].expires_at`,
  `Statement.created_at/until`, `blocks[].since`, `Away.until` — все `format: date-time`
  (`openapi.yaml:306,316,400,413,418,493,498,707,776`).
- **Решить:** одно правило на весь контракт. Предлагаю unix-секунды целым числом везде (как §1
  протокола) и правку девяти схем.

### 3.4. Хранилища, которых нет в DDL: приглашения, билеты, «незавершённая регистрация»

- Приглашение переноса: `lookup_id`, `enc_secret`, конверт ответа, срок 120 с, «второй claim отменяет»
  (`chat_RU.md:1071-1086,1145`) — **таблицы нет** ни в 26 DDL канона, ни в `schema.tsv`. В памяти
  нельзя: claim приходит на любой узел пула.
- Билет сокета: 30 с, одноразовый, привязка к сессии и беседе/столу (`protocol_RU.md:190-196,261`) —
  таблицы нет, формат не назван.
- «Личность до подтверждения кода помечена незавершённой и не проходит ни одной проверки
  членства» (`chat_RU.md:1214-1218`) — колонки в `identities` нет; `prune_unfinished_signups` не
  из чего написать.
- **Решить:** три DDL в канон §8.2 и в `schema.tsv`: `session_invites (lookup_id PK, session,
  enc_secret, reply_secret, claimed_at, cancelled_at, expires_at)`, `socket_tickets (ticket_hash PK,
  session, chat_id | table_id, expires_at, used_at)` либо билет как HMAC-подписанный токен без
  таблицы (тогда «гасит» = запись в `nonces`-подобную таблицу), `identities.confirmed_at`
  (NULL = незавершённая). Счёт таблиц продукта станет 31–32.

### 3.5. Хэш `auth` и хэш бумажного кода — какой

- `vault_shares.auth_hash` «хэш от половины material» (`chat_RU.md:1229`), `identities.recovery_auth_hash`
  «хэш половины бумажного кода» (`:779`), `next_auth_hash` — «хэш, который узел сохранит» (`openapi.yaml:456`).
  Алгоритм не назван нигде; `PinChange.next_auth_hash` считает **клиент**, а `POST /vault/share`
  сравнивает на **узле** — оба обязаны считать одинаково.
- **Решить:** sha256 в hex над сырыми 32 байтами `auth`; записать в §8.2 и в схему `Auth`.
  То же для `lookup_id` восстановления (тест 5.7 называет соль и алфавит, но не хэш хранения).

### 3.6. Имена полей стола

- DDL: `tables.game` (`chat_RU.md:323`), `table_games.class` (`:417`). Контракт: `TableCreate.class`
  (`openapi.yaml:274`), `TableView.class` (`:287`), но `FeedItem.game` у карточки стола (`:198`).
  Протокол §4.2: «у стола вместо `text` — `{game, playing, watching}`» (`protocol_RU.md:169`).
- `TableView.playing: integer`, `is_playing: boolean` (`openapi.yaml:289-291`); протокол §4.6: «свой
  `seat` и `playing`» как признак (`protocol_RU.md:256`).
- **Решить:** одно имя — `class` — везде, включая колонку `tables.class` и карточку ленты;
  `is_playing` оставить и вписать в протокол §4.6.

### 3.7. `match_participants` для мэтча от оффера

- DDL: `message_id uuid NOT NULL`, `text_snapshot text NOT NULL` (`chat_RU.md:1994-1995`).
  Тест 10.3: «`message_id` и `text_snapshot` необязательны — мэтч от оффера без своей фразы проходит»
  (`test-map_RU.md:216`); §4.3 протокола: «у оффера мэтч односторонний и не требует своей живой
  фразы» (`protocol_RU.md:176`).
- **Решить:** снять `NOT NULL` с обеих колонок и добавить `CHECK ((message_id IS NULL) = (text_snapshot IS NULL))`.

### 3.8. Ответ лайка

- `LikeResult {state, match_id}` (`openapi.yaml:211-215`). Тест 8.6: «ответ содержит только `{state}`»
  (`test-map_RU.md:177`).
- **Решить:** `match_id` — uuid сущности, §1 протокола его разрешает; поправить тест 8.6 на
  «`{state, match_id?}` и ничего о личности», либо убрать `match_id` и брать его из `GET /inbox`.

### 3.9. Манифест юридических документов

- `GET /legal/manifest` отдаёт «дата, `sha256` существа, политика» (`protocol_RU.md:153`); 409
  `legal_reacceptance_required` сравнивает `legal_acceptances.revision_sha256` с текущим
  (`chat_RU.md:820`, `openapi.yaml:100-113`). Откуда узел знает текущие редакции трёх документов
  **двух витрин** — файл в образе, переменная, таблица? `deploy/check-legal-revisions.py` (тест 8.10)
  живёт в деплое, не в узле.
- **Решить:** таблица `legal_revisions (brand, document, revision_date, revision_sha256, required)`
  либо JSON в образе узла, обновляемый деплоем; назвать в §8.2 и в `Health`.

### 3.10. Путь сокета и стол

- Протокол §4.4: `new WebSocket(...)` без пути (`protocol_RU.md:134`); в контракте `GET /chat`
  (`openapi.yaml:587`, built как 501). Для стола сокет «один на стол» (`protocol_RU.md:220`) — путь не назван.
  Билет привязан к беседе или столу, значит путь может быть один (`GET /chat`) и различать по билету,
  либо два.
- **Решить:** один путь `GET /chat`, `Sec-WebSocket-Protocol: xor.p1, ticket.<билет>`, билет сам
  знает, к чему привязан; записать в §4.4 и в описание `GET /chat`.

### 3.11. Адресат мотивировки

- `GET /statements` — «свои мотивировки» по подписи (`protocol_RU.md:246`). В `dsa_statements`
  (`db/005`, `db/010`, `db/017`) связи с `identities` нет и быть не могло — таблицы личностей нет.
  Как узел находит «свои»: по `author_identity` цели в момент решения? Тогда колонка
  `dsa_statements.addressee_identity` нужна и должна переживать `SET NULL` автора.
- **Решить:** колонка `addressee_identity uuid` в миграции шага 7, заполняется транзакцией
  `POST /admin/dsa-notices/{id}/decide` из снимка цели; `delivered_at` рядом.

### 3.12. Графемы

- «128 графем считает узел» (`chat_RU.md:1441`, `limits.tsv:31`), «24 графемы» (`:776`, `:326`).
  Чем считать — не названо; `grep -rn Segmenter docs relay/node/src` — пусто. `Intl.Segmenter`
  в Deno 2.1 есть (ICU полный), но зависит от версии ICU: семейный эмодзи — одна графема в
  ICU ≥ 66; замер не сделан (тест 1.2b).
- **Решить:** `new Intl.Segmenter("und", {granularity: "grapheme"})` в `lib/text.ts`, нормализация
  NFC перед счётом, тест 1.2b с семейным эмодзи как ворота на смену образа Deno.

### 3.13. Курсор `after`

- «непрозрачная строка, кодирует `(visible_at, id)`» (`protocol_RU.md:407`, `openapi.yaml:522`).
  Кодирование не названо; «не раскрывает ничего сверх выданного» — но `visible_at` и `id` уже
  выданы, так что подписывать курсор не обязательно.
- **Решить:** base64url от `"<unix-секунды>.<uuid>"`; неразобранный курсор → 400 `invalid_body`.

### 3.14. Таблица `nonces` — три мелочи

- `nonce bytea` 16 байт (`chat_RU.md:1031`) против `Nonce` строкой 22 символа base64url
  (`openapi.yaml:434-438`) — декодирование на входе, сбой → 409 `invalid_body` (`NonceReused`,
  `openapi.yaml:544-547`); **но** 409 с `invalid_body` для «nonce не той формы» — это форма тела,
  для которой везде 400. Нарочно?
- «Повтор ищется после проверки подписи и версии» и «хранятся только 2xx и 409» — ответ 429 не
  хранится, значит повтор после 429 действует; принято (SEC-4). `response jsonb ≤ 1024` — ответ
  `POST /tables` `{id}` влезает; ответ `POST /away` `{until}` тоже.
- Уборка — «тем же уборщиком, что чистит беседы» (`chat_RU.md:1038`), а уборщика бесед нет
  (`chat.janitor.missing`): до шага 4 таблица растёт. Один шаг 0 может завести `prune_nonces`
  в `scheduled.ts` сразу — стоимость 1 ч.
- **Решить:** оставить 409 для повторного nonce и 400 для битого; уборщик nonce — в шаг 0.

### 3.15. Пул и счётчики в памяти

- «общий счётчик промахов: 50 за час **на узел**» (`protocol_RU.md:434-435`), «счётчики по личности
  живут в памяти узла … на каждом узле пула свои, и это принято» (`:365`). `rate_limit.ts:5-7`
  говорит то же. Принято, но названо только для «по личности»; для 50/час на узел при двух боксах
  за одним DNS-именем реальный порог — 100. Достаточно вписать это в §8.7.

### 3.16. Функции гео и полос в базе

- Запрос выдачи зовёт `grid_round_lat`, `grid_round_lon`, `haversine`, `band_low`, `band_high`
  (`chat_RU.md:1665-1687`); формулы клетки (`:1511-1516`) и полос (§8.2, `band(20)=[18,22]`,
  `band(21)=[19,∞)`, тест 7.2) есть, `CREATE FUNCTION` — нет.
- **Решить:** пять `CREATE FUNCTION … IMMUTABLE` в миграции шага 2, и в канон, чтобы
  `check-facts-schema` их видел (либо считать на узле и отдавать в запрос параметрами — но тогда
  `haversine` от округлённого центра всё равно в SQL).

---

## 4. Что параллельно, что блокирует

**Блокирует всё:** шаг 0 (обёртка подписи, версия, форма ошибки, nonce, обязательная база) и
решения §3.1, §3.2, §3.3, §3.5 — без них ни один маршрут шага 1 не проходит `check-openapi.sh` с
`x-status: built`, и `depth` не может подписать ни одного запроса.

**Цепочка данных (§13 канона):** 1 → 2 → 3 → 4; 6 частично — `blocks`, `away`, `support`, профиль —
нуждаются только в шаге 1, а `{table, seat}` в блокировке и `leave_table` — в шаге 5.

**Параллельно, независимо от цепочки:**
- миграции всех 29 таблиц одним заходом — DDL готов, спорны только §3.4, §3.6, §3.7; можно класть
  `022…028` сразу и держать `check-facts-schema` зелёным;
- движки семи классов доски (шаг 5) — чистые функции над `jsonb state` без базы; их можно писать
  и тестировать до столов;
- очередь модерации первой ступени (правила) и стенд модели (`relay/moderation-bench`) —
  независимы от ленты, стыкуются на шаге 2;
- DSA-хвосты шага 7 (сторожа С1–С3, С7, `receipt_hash`, `until`) — не трогают таблиц продукта,
  можно делать первыми и закрывать четыре «сейчас»-пункта `open.tsv` (`:264,266,268,278`);
- `depth`: ядро без DOM/Ink — Argon2id, подпись, хранилище — пишется по §2 протокола параллельно
  шагу 0 и становится первым живым клиентом шага 1;
- дописывание контракта (§3.2) — документная работа, идёт до кода.

**Что ждёт решения владельца и не кодируется:** модель модерации (`moderation.model`, стоп «код»),
окно хода против WCAG (`a11y.table.move.timer`, стоп «код»), имена трёх переменных порога
(`protocol_RU.md:367-369`), DPA Hetzner (`hetzner.dpa`).

---

## 5. Сводка для владельца

1. Узел — Deno 2.1.4 без фреймворка, два роутера (`main.ts` точный + `lib/router.ts` паттерны),
   миграции файлами под advisory-lock, тесты двух контуров; всё это переиспользуется, дописывать
   каркас не надо.
2. Из протокола §2–§6 в коде нет ничего: ни подписи, ни версии, ни nonce, ни `LISTEN`, ни сокета;
   форма ошибки и лимитер есть и подходят как есть.
3. Таблиц продукта 29 объявлено, 0 мигрировано; DDL канона достаточно для 26, но приглашений,
   билетов и «незавершённой регистрации» в схеме нет — их надо объявить до шага 1.
4. План — 8 шагов (0 каркас … 7 DSA-хвосты), **380–520 часов** одного разработчика с агентом,
   из них 60–90 — движки семи классов игр и 15–25 — модель модерации; без них 305–400.
5. Три главные недоговорённости, без которых код не пишется: формат подписи и ключа (§3.1);
   девять маршрутов без тела и семь без ответа в контракте (§3.2); время — unix или ISO — в девяти
   схемах против §1 протокола (§3.3).
6. Ещё пять, которые ударят по DDL: хранилища приглашений/билетов (§3.4), алгоритм хэша `auth`
   (§3.5), `game`/`class` у стола (§3.6), `NOT NULL` у мэтча от оффера (§3.7), функции гео и
   полос в базе (§3.16).
7. Блокирует всё — шаг 0 и решения по §3.1–3.3; параллельно можно начинать миграции, движки игр,
   первую ступень модерации, DSA-хвосты и ядро `depth`.
8. Два открытых пункта со стопом «код» так и стоят: модель модерации и окно хода против WCAG;
   шаг 2 и шаг 5 без них собираются частично.
9. Пул делает счётчики «на узел» вдвое мягче (два бокса) — принято протоколом, но не для
   порога 50/час восстановления; одна строка в §8.7 закроет.
10. Первая проверка утром: дописать §3.2 в `openapi.yaml`, прогнать `scripts/check-openapi.sh`, и
    только потом первая миграция `022_identity.sql`.

---

Строка состояния ночи: 18.09.2026 00:40, сессия 40 ч; ветка `day54`; в дереве незакоммиченные
чужие файлы (`docs/reviews/NIGHT_2026-09-18_summary.md`, `panel/design/*.svg`) — не трогались.
