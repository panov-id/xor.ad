# Панель ревью 24.09.2026 — цикл day57

- **Что ревьюили:** ветка `day57`, диапазон `08bd064..731184f` (10 коммитов, все локальные): пробуждение по концу отлучки (db/047, `lib/away_waker.ts`), запечатанный курсор ленты и лайков (`lib/cursor.ts`), потолок тела 1 МиБ (`lib/body_limit.ts`, `main.ts`), переподключение комнаты в depth (`depth/core/reconnect.ts`, `depth/ink/rooms.ts`), `POST /vault/pin`, повтор `POST /blocks` из отлучки, `POST /identities/close` с `lib/take_down.ts`, `stillHere` в лайке и публикации.
- **Линзы:** безопасность (обязательна), данные и СУБД, эксплуатация, согласованность и протокол. Независимо, параллельно. Затем один опровергающий агент по находкам кода.
- **Воспроизвести диапазон:** `git diff 08bd064..731184f`.
- Каждый кусок до панели уже прошёл агента-проверяющего (verifier); его находки закрыты в тех же коммитах.

## Сырьё: линза «Безопасность»

Линза «Безопасность», diff 08bd064..731184f. В этом диффе я не нашёл ни одной критичной проблемы. Никакой маршрут не выполняет действие без ПИН: /vault/pin и /identities/close проверяют ПИН через `checkPin` со счётчиком в 10 попыток, и промах остаётся записанным в базе. Повтор по nonce отвечает 200 без ПИН, но ничего не меняет. Ключ курсора выведен через HKDF, соль и info отличны от ключа доли (`cursor.ts:28-29` против `vault_share.ts:50-51`). Nonce для GCM случайный, 96 бит. Имя списка передаётся как additional data, поэтому курсор ленты не открывается в лайках. Каноническая запись base64 проверяется (`cursor.ts:104`).

Проверил сам в контейнере `denoland/deno:alpine-2.1.4`, запустив скопированный `capBody`. В GET и HEAD с `Content-Length` тело равно `null`. Значит, запрос на апгрейд WebSocket проходит `capBody` тем же объектом, и `new Request` для GET с телом не падает. Такого обхода нет.

Находки:

1. **Дефект дизайна.** `body_limit.ts:35-45`: у чтения тела нет срока, и число одновременных буферов ничем не ограничено. Теперь любой запрос, включая 404 и неподписанные, до роутинга буферизует до 1 МиБ. Медленные соединения по 1 МиБ складываются в N МиБ памяти. Это лучше прежней безграничности, но атака slowloris остаётся. Поправка: `AbortSignal.timeout` на цикл чтения. Живьём НЕ измерял.

2. **Дефект дизайна.** `transfer.ts:319-337`: в `approveInvite` нет `stillHere`. Если одобрение прошло охранник до коммита close, оно вставляет живую сессию в закрытую личность и возвращает `first_pin_grant_at = now()`, хотя close только что его обнулил (`identity.ts`, UPDATE в `closeOnce`). Вреда нет, пока `identity_guard.ts:127` отказывает закрытой личности. Но это ровно тот класс гонки, который `stillHere` закрыл только для лайка и фразы. Поправка: в транзакции одобрения проверять `closed_at IS NULL` под блокировкой строки `identities`.

3. **Мелкое.** `take_down.ts:28-31`: гарантия `stillHere` держится на том, что строка `identity_stats` существует. `SELECT … FOR UPDATE` по отсутствующей строке ничего не блокирует. `feed_limits.ts:76` страхуется через `INSERT … ON CONFLICT`, а `takeDownLive` так не делает. Сегодня строка есть у всех (`identity.ts:222`, db/028), так что это мина, а не пожар. Поправка: тот же INSERT перед блокировкой.

4. **Мелкое.** `identity.ts` `changePin`, ветка повтора: nonce не связан с телом запроса. Повтор того же nonce с другим `next_auth_hash` получает 200, и клиент считает, что ПИН стал новым, хотя он старый. `closeOnce` устроен так же. Описано ли это в protocol §2, я не нашёл.

5. **Мелкое, противоречие.** `closeOnce`: nonce вставляется до `UPDATE identities … WHERE closed_at IS NULL`. Если личность уже закрыта, маршрут отвечает 404, но транзакция коммитит nonce, и его повтор получает 200. Кроме того, два устройства одной личности, закрывающие её одновременно, взаимно блокируются: A держит строку `identities` и ждёт `burnShare(B)`, B держит строку доли и ждёт `identities`. В итоге одно из них получает 503 вместо повтора. Это вывод из чтения кода, прогоном НЕ ПРОВЕРЕНО.

6. **Мелкое.** `depth/ink/rooms.ts` в новом цикле: `attempt = 0` сбрасывается на любом кадре. Если узел после выдачи очереди закрывает соединение с 1011, клиент переподключается примерно раз в 0,5–1 с на каждую комнату и каждый раз берёт новый билет. Лимита на выдачу билетов я не нашёл. Поправка: сбрасывать `attempt`, только если соединение прожило больше N секунд. Там же кадр, который не расшифровался, попадает в `shown`, и его честная повторная доставка с тем же id больше не рисуется.

7. **Мелкое.** У `away_waker.ts` и db/047 замечаний нет: флаг опускается и NOTIFY отправляется в одной транзакции. Если личность закрыли во время отлучки, будить нечего, потому что все участники уже помечены `gone_at`.

Тесты `run-relay-database-tests.sh` я не запускал. Все находки выше, кроме пункта про Deno, получены чтением кода.

## Сырьё: линза «Данные и СУБД»

Data & database review of `git diff 08bd064..731184f`. Read-only. One claim was checked in a docker postgres:16-alpine; everything else comes from reading the code.

**1. Design defect: close and step-away take the same two locks in opposite orders (confirmed in the container).**
- `closeOnce` locks the `identities` row first (`relay/node/src/routes/identity.ts:960`). It then locks `identity_stats` inside `takeDownLive` (`identity.ts:967` → `relay/node/src/lib/take_down.ts:58-61`).
- `stepAwayOnce` does the reverse: `identity_stats` first (`relay/node/src/routes/away.ts:113`), then `UPDATE identities` (`away.ts:132`).
- A close from one device racing a step-away from another device of the same identity deadlocks. Container repro (scratchpad/deadlock.sh): `ERROR: deadlock detected ... while locking tuple in relation "identity_stats"`. Postgres picked the close as the victim.
- The close's catch turns the deadlock error (`40P01`) into a 503 (`identity.ts` closeOnce `.catch`). It is not retried: only `TakeDownRetry` is.
- Fix: move the `UPDATE identities SET closed_at` to after `takeDownLive`. The commit is atomic, so `stillHere` still sees the close.

**2. Design defect: the waker can close a three-way lock cycle.**
- `wakeReturned` updates every due `identities` row in one statement (`relay/node/src/lib/away_waker.ts:15-16`). It has no `SKIP LOCKED` and no `lock_timeout`.
- The cycle: the waker holds identity B and waits on A, which a close holds. That close waits on `identity_stats` B, which a step-away for B holds. That step-away waits on `identities` B, which the waker holds.
- This cycle was not reproduced.
- Fix: `UPDATE ... WHERE id IN (SELECT id FROM identities WHERE away_wake_due AND stepped_away_until <= now() FOR UPDATE SKIP LOCKED)`.

**3. Contradiction: a 404 from close is committed together with its nonce.**
- The nonce is inserted at `identity.ts:955`. When `shut` comes back empty, `identity.ts:965` returns a 404 as a normal return, so the transaction commits and the nonce is kept.
- A retry with the same nonce then gets 200 through the replay branch.
- This happens when two devices close at once: the second one's UPDATE re-reads the row, sees `closed_at` already set and changes nothing.
- Fix: check before inserting the nonce, or throw so the transaction rolls back.

**4. Minor: rolling deploy with an old node image (`relay/node/db/047_away_wake.sql`).**
- The migration itself is safe: the constant default is metadata-only, and the UPDATE and index build are small.
- An old image's POST /away never raises `away_wake_due`, so those times away never get the wake.
- An old image's DELETE /away never lowers it, so the waker sends a second NOTIFY later. That is harmless.
- An old node that claims the `wake_returned` job gets "no handler" (`relay/node/src/lib/jobs.ts:207-209`) and backs off. If it takes every claim until `max_attempts` runs out, the chain stops until some node restarts and re-arms it. The same risk applies to any new scheduled job; it was already there.

**5. Minor: `CREATE INDEX` without `CONCURRENTLY` (`047_away_wake.sql:20`).** It blocks writes to `identities` while it builds. The table is small, so this is acceptable.

**Checked and found correct (from the code):**
- The `stillHere` re-read under READ COMMITTED (`take_down.ts:131-140`; `relay/node/src/routes/likes.ts:106-110`; `relay/node/src/routes/feed.ts` publish). The read is a new statement after the `identity_stats` wait, so it sees the committed close. This depends on an `identity_stats` row existing, which `identity.ts:222` and backfill 028 guarantee.
- The waker's WHERE clause is re-checked against a step-away racing it.
- NOTIFY is transactional, so it cannot go out without the flag change or vice versa.
- In close, matches are put out before `DELETE chats`, so SET NULL cannot bring one back.
- Close takes matches then chats, the same order as `chat_sweeper.ts:55-60`.
- `like_count`, `likes_given` and `likes_received` come from the DELETE's own RETURNING.

**Not described (not a defect):** when close deletes a person's own phrases, other people's likes on them go by cascade and their `likes_given` stays as it was. The expiry sweep does the same (`relay/node/src/lib/feed_verdict.ts:268-272`), but no spec line says the counters are cumulative.

**Not run:** `scripts/run-relay-database-tests.sh`.

Repro script: /tmp/claude-1000/-home-eugene-panov-Projects-panov-id-xor-ad/20917e2b-e1bb-413e-8660-7b6af7181553/scratchpad/deadlock.sh

## Сырьё: линза «Эксплуатация»

Линза «Эксплуатация», диапазон `08bd064..731184f`. Всё ниже получено чтением кода. Живьём не проверял: ни выкатом, ни нагрузкой, ни в контейнере.

**Дефекты**

1. Дизайн. Тело запроса буферизуется без срока и раньше квоты. `relay/node/src/main.ts:96` вызывает `capBody` раньше `rememberRemote` и лимитов, на любом маршруте, включая 404 и неподписанные. В `relay/node/src/lib/body_limit.ts:36-53` пик равен двум копиям, `chunks` плюс `bytes`, то есть около 2 MiB на запрос. Таймаута на чтение нет. Тысяча медленных загрузок по 1 MiB без одного байта дают около 2 ГБ удержанной памяти. Исправление точечное: `AbortSignal.timeout` или дедлайн на цикле `reader.read()`, лимит одновременных непрочитанных тел, `chunks` не держать после склейки. Ещё лучше не вычитывать тело для методов без тела и для незарегистрированных маршрутов.

2. Дизайн. Обрыв клиента посреди тела не пойман. `capBody` стоит вне `try` (`main.ts:96`, `try` начинается на `:129`), поэтому исключение из `reader.read()` уходит в Deno. В итоге штатный 500 и трасса в stderr, без `reqId` и без `relay_requests_total`. Это шум в логах, и эти случаи не видны метрике. Исправление: обернуть `capBody` в `try` и отвечать 400 со своей меткой.

3. Мелочь. Ответ 413 уходит без CORS: `main.ts:97-99` возвращает его раньше, чем обработан `origin`. Браузер витрины увидит CORS-ошибку, а не 413.

4. Противоречие. Узел без `VAULT_SHARE_KEY` здоров только на вид. `relay/node/src/routes/feed.ts:282` и `routes/likes.ts:378` отвечают 503 на всю ленту, даже на первую страницу, а `/health` ключ не проверяет, потому что ключ ленивый (`lib/cursor.ts:40-45`). Волшебник ключ требует (`relay/wizard/wizard.py:201`), так что это касается узла, собранного руками. Сработает только `ServerErrors` (`relay/local/observability/alerts.yml:87`). Исправление: падать на старте или отдавать отказ в `/health`.

5. Дизайн, смешанный пул. Новый образ отвечает 400 на открытый курсор `<micros>_<id>` из старого образа (`cursor.ts:98`, `feed.ts:288`). То же будет между узлами с разными ключами во время ротации, а ключ кэшируется до рестарта (`cursor.ts:37`). depth страницу заново не начинает (`cursor.ts:16-18`). Исправление: либо один переходный выпуск принимает оба формата курсора, либо клиент на 400 от `after` сам начинает с первой страницы.

6. Мелочь, откат после миграции 047. Старый образ задание `wake_returned` не знает: `relay/node/src/lib/jobs.ts:209` засчитывает попытку как ошибку. Пока в пуле есть новый узел, он сбрасывает `attempts=0` (`jobs.ts:162`). Если пул целиком старый, после 8 попыток (`db/001_control_state.sql:69`) примерно за 70 минут появится надгробие и сработает `JobChainDead`. Это заметно, но на каждую попытку идёт `warn` (`jobs.ts:196`). Кроме того, старый `POST /away` не поднимает `away_wake_due`, и пробуждения за время отката теряются. Сама миграция совместима назад: колонка NOT NULL, по умолчанию false (`db/047_away_wake.sql:13-14`).

**Не описано**

7. Ротация `VAULT_SHARE_KEY` описана только в комментарии (`cursor.ts:15-18`). В `relay/wizard/new-vault-key.sh` нет процедуры ротации. Ротация одновременно рвёт и копии хранилища (`lib/vault_share.ts`), и курсоры.

8. Новые метрики ни на что не выведены. Ни `relay_away_woken_total`, ни `relay_vault_pin_total`, ни `relay_identity_close_total`, ни `by="closed"` нет ни в `relay/local/observability/grafana/dashboards/relay-identity.json`, ни в `alerts.yml`. `PinMissBurst` (`alerts.yml:55`) смотрит только на `relay_vault_share_total`, поэтому перебор старого ПИНа через `/vault/pin` (`routes/identity.ts:855`) и через закрытие (`:950`) сигнала не даёт. Исправление: добавить в выражение `relay_vault_pin_total{result="wrong"}` и `relay_identity_close_total{result="wrong"}`.

9. Ограничение на число NOTIFY в `lib/away_waker.ts:22-27` не описано. Сразу после миграции (`047:17`) один проход шлёт NOTIFY на каждого отошедшего × каждую сессию × каждый чат. Объём, скорее всего, небольшой, но не замерен.

**Штормы переподключений.** Проблемы не нашёл: джиттер от половины до полной задержки, потолок 30 с (`depth/core/reconnect.ts:26-31`). На 4001 ответ `reconnect` (`:17`), и если выдача билета сама под лимитом, будет волна запросов билетов. Не проверено.

## Сырьё: линза «Согласованность и протокол»

Линза «Согласованность и протокол», диапазон 08bd064..731184f. Доки сверены с кодом.

```diff
+ Все 6 проверок зелёные, у каждой код выхода 0. check-openapi.sh: 138 операций (built 92, spec 46), HTML совпадает с yaml. check-facts-limits.sh: 449 сверок. check-facts-decisions.sh: 166 решений.
+ Пары RU/EN сходятся: §6 пагинация и тело, §4.9, строки vault/pin и close, chat §8.2/§8.11, test-map 17.10/17.11/23.8/23.14–23.16, roadmap шаг 5
! Критичных нет. 1 противоречие, 1 дефект проекта, 4 «не описано»
```

**Числа, ПРОВЕРЕНО по коду**
- 1 MiB = `BODY_MAX_BYTES = 1024*1024` (`body_limit.ts:21`), ответ 413 `invalid_body` (`:24`).
- Две минуты: задание перезаводит себя на `A_MINUTE_MS` (`scheduled.ts:319-322`), у ленты — 60 с. Это совпадает с «60 и 120 с» в chat_RU:886 / EN:895.
- AES-256-GCM, имя списка в AAD (`cursor.ts:86,108`).
- Все десять названий тестов из карты тестов есть в `relay/node/test`. В `body_limit.test.ts` ровно 5 случаев.
- Пауза переподключения — не 1–30 с. По `reconnect.ts:112-115` первая попытка 0,5–1 с, потолок 15–30 с. Доки чисел не дают (roadmap говорит «с паузой и разбросом»), так что противоречия нет. Но если кто-то напишет «1–30 с», это будет неверно.

**Противоречие**
1. `protocol_RU.md:306` / `EN:317` (§4.9): из отказа в отлучке исключён только повтор `POST /away`. Код отвечает на повтор из отлучки ещё в двух местах: `routes/blocks.ts` (проверка отлучки после поиска nonce) и `identity.ts:840-851` (`/vault/pin`). §2 (`RU:96`, `EN:101`) и test-map 23.8 это уже говорят.
   Правка: «и кроме повтора любого из семи маршрутов §2 своим nonce».

**Дефект проекта**
2. `/identities/close`. §2 (`protocol_RU:96`) и test-map 23.8 (`RU:422`, `EN:438`) обещают: повтор получает первый ответ. Строка маршрута (`RU:136`, `EN:144`) говорит, что повтор получает 401, потому что закрытие заморозило сессию. Значит, сохранённый 200 (`identity.ts:940-947`) недостижим.
   Правка: в §2 и в 23.8 оговорить, что у close повтор получает 401. Либо признать строку в `nonces` для close мёртвой.

**Не описано**
3. §4.4 (`protocol_RU:208-216`, `EN:219-227`): кода 1006 в таблице нет. `roadmap_RU:158` / `EN:169` пишет «переподключение по … 1006». По смыслу это верно, но по RFC 6455 §7.4.1 код 1006 никогда не шлётся в кадре Close: клиент видит его, когда связь оборвалась. Верно это объясняет только комментарий в коде (`depth/core/reconnect.ts:92-94`).
   Правка: строка-сноска под таблицей: «1006 узел не шлёт; клиент видит его при обрыве без кадра Close и переподключается, как на 1001».
   Рядом, код до этого диапазона: узел закрывает старый сокет кодом 1000 «replaced by a newer socket» (`chat/relay.ts:254`). В таблице 1000 значит только «человек закрыл».
4. `openapi.yaml:772-773`: «Elsewhere … (created_at, id) on /statements». Но `After` висит и на `/inbox` (`:2009`), а §6 говорит, что курсор инбокса открыт. Правка: назвать /inbox.
5. Потолок 413 из §6 не описан ни в одной операции `openapi.yaml`. check-openapi.sh этого не ловит.
6. §4.9 (`RU:303`/`EN:314`): не сказано, что отлучка, кончившаяся сама, будит комнаты заданием `wake_returned` (≤2 мин). В chat §8.2 это есть.

**Мелочь**
- `/feed` и `/likes` отвечают 503, если не задан `VAULT_SHARE_KEY` (`feed.ts`, `cursorConfigured`). В протоколе эта зависимость не упомянута.
- 404 «no such identity» у close (`identity.ts:965`) не укладывается в описание 404 в openapi (`:1602`), где причина — только сожжённая доля.

Статусы built/spec у `/vault/pin` и `/identities/close` сходятся с кодом (`x-status: built`, `x-source` на месте). Строка `request.body.bytes` в `limits.tsv:133` — 7 столбцов, как у остальных.

Ничего не правил: только чтение и прогон скриптов проверки.

## Опровержения (один агент, по умолчанию «опровергнуто»)

| Находка | Откуда | Вердикт | Чем |
|---|---|---|---|
| A. Закрытие и отлучка берут `identities` и `identity_stats` в разном порядке — взаимная блокировка | Данные 1, Безопасность 5 | **подтверждена** | прогон `scratchpad/deadlock.sh` в postgres:16; затем мной на настоящем узле: тест «a close and a step-away of one identity take their locks in one order» красный (503) до правки |
| B. Трёхсторонний цикл с метлой пробуждения | Данные 2 | подтверждена в теории, уходит с A | цикл требует закрытия, берущего `identity_stats` вторым |
| C. 404 закрытия коммитит nonce, повтор даёт 200 | Данные 3, Безопасность 5 | **опровергнута** | второе закрытие той же сессии ждёт строку `vault_shares` и получает 404 от сожжённой доли до вставки nonce |
| D. Тело: нет срока чтения; `capBody` вне `try`; 413 без CORS | Эксплуатация 1–3, Безопасность 1 | **подтверждена частично** | срок и CORS — да; 500 при обрыве никто не получает, но в метрику и лог не попадал |
| E. Узел без `VAULT_SHARE_KEY`: `/feed` и `/likes` 503 при зелёном `/health` | Эксплуатация 4 | подтверждена | `feed.ts:282`, `likes.ts:378`, `health.ts` ключ не смотрит |
| F. Одобрение переноса без проверки закрытия | Безопасность 2 | подтверждена, низкое влияние | `transfer.ts` — мной: тест красный до правки |
| G. `takeDownLive` без гарантии строки `identity_stats` | Безопасность 3 | **опровергнута** | строка пишется при регистрации (`identity.ts:222`), db/028 добила старые |
| H. depth: `attempt` сбрасывается на любом кадре; битый кадр в `shown` | Безопасность 6 | **опровергнута** | 1011 шлётся только при отказе билета, до кадров; повторная доставка несёт тот же шифротекст |
| I. Старый образ убивает цепочку `wake_returned` | Эксплуатация 6, Данные 4 | **опровергнута** как дефект | нужны 8 захватов подряд старыми узлами; мёртвую строку переармирует новый образ |

Находки по документам (линза согласованности) я проверил сам `grep`: §4.9 исключал только повтор `/away`; 1006 в протоколе нет; описание курсора не называет `/inbox`; 413 нет в операциях openapi; `wake_returned` в протоколе не упомянут — все пять **ПРОВЕРЕНО**.

## Сводка ведущего

Закрыто тем же заходом (всё — тест, увиденный красным, затем полный прогон):

- **A** — закрытие берёт блокировки в порядке отлучки: `identity_stats`, потом `identities` (`routes/identity.ts` `closeOnce`). **ПРОВЕРЕНО:** детерминированный тест, красный 503 до правки, зелёный после.
- **D** — срок чтения тела 30 с (408), обрыв посреди тела отвечается 400 и попадает в метрику, отказы идут с CORS (`lib/body_limit.ts`, `main.ts`). **ПРОВЕРЕНО:** тест срока, красный при растянутом сроке; живьём на узле стенда 413 пришёл с `access-control-allow-origin`.
- **F** — одобрение переноса берёт строку хранилища (первую блокировку закрытия) и проверяет `closed_at` (`routes/transfer.ts`). **ПРОВЕРЕНО:** тест красный до правки («a new session was seated in a closed identity»).
- **Эксплуатация 8** — `PinMissBurst` смотрит на промахи всех трёх дверей ПИН (`relay/local/observability/alerts.yml`). **ПРОВЕРЕНО:** promtool SUCCESS, `check-metrics-exist.sh` зелёный; срабатывание не прогонялось.
- **Согласованность 1–6** — протокол §2, §4.4, §4.9, §6 и openapi правлены парами RU/EN; срок тела занесён в `limits.tsv`.

Отброшено: C, G, H, I (опровергнуты), B (уходит с A).

## Нарезка на задачи

1. **E — узел без ключа хранилища здоров только на вид** (дефект дизайна, ~30 мин). Решить: `/health` отвечает отказом без `VAULT_SHARE_KEY`, или узел не стартует. Это выбор эксплуатации: балансировщик снимет такой узел с раздачи.
2. **Ротация `VAULT_SHARE_KEY` не описана** (не описано, ~1 ч доков). Ротация рвёт и доли хранилища, и курсоры; процедуры в `relay/wizard/new-vault-key.sh` нет.
3. **Смешанный пул на выкате: старый открытый курсор получает 400** (дизайн, ~40 мин). depth не начинает с первой страницы на отказ курсора.
4. **Счётчик `likes_given` другой стороны не уменьшается, когда фраза уходит каскадом** (не описано). Так делает и метла истечения; решение — считать ли счётчики накопительными.
5. **Повтор с тем же nonce и другим телом получает первый ответ** (мелочь, `/vault/pin`, `/identities/close`, `/blocks`, `/away` одинаково). §2 про тело не говорит; решить, записать ли это.
