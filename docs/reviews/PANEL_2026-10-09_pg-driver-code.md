# Панель 09.10.2026 — код замены драйвера (W15-NC)

Диапазон: xor.ad `b30c0fce..e9e5ebf4` (ветка day59), `git diff b30c0fce..e9e5ebf4 -- relay/node scripts`.
Файлы: relay/node/src/lib/db.ts, chat/relay.ts, routes/profile.ts, routes/health.ts, Dockerfile, scripts/check-pg-resilience.sh, тесты db_*, chat_hardening, expired_take_down, pg_types.
Состав (артель по умолчанию): линза «Безопасность» (fable) + verifier. Опровержение — экспериментом: на каждую находку тест, красный на текущем коде (исполнитель xor-ad-51).

## Сырые находки: линза «Безопасность»

```diff
- Отступ (backoff) LISTEN обходится любым открытием комнаты: db.ts:422–426 — атакующий с билетами гонит узел на соединения к мёртвой базе
! DSN всё ещё может снять таймауты: splitOptions ловит только ?options=, а ?statement_timeout=0 идёт отдельным GUC (db.ts:87–93) — НЕ ПРОВЕРЕНО опытом
! У LISTEN-клиента нет connectionTimeoutMillis — зависший SYN держит открытие комнаты минуты (db.ts:96–112, 429, relay.ts:506)
+ Инъекций SQL не нашёл: все 3 интерполяции — константы (db.ts:457,506 через ident(); dsa_watchdog.ts:178 — тернарник)
@@ TLS под Deno и PGPASSFILE в образе не упражнялись никем — отмечаю как «не нашёл, где проверено», не как дефект
```

1. Обход backoff LISTEN открытием комнат — дефект дизайна, лёгкий DoS. db.ts:422–426: startListening() стартует connectListener() всякий раз, когда listener === null и connecting === null. После неудачной попытки connecting обнуляется в finally (стр. 424), retryLater() только ставит таймер (485–495). Каждый listen() (listenForRooms() при открытии комнаты — relay.ts:401–412, 506) запускает попытку немедленно, минуя задержку. Сценарий: база лежит → listenWasLost() закрывает комнаты 1012 (relay.ts:435–438) → массовые переподключения → каждое = new pg.Client + connect(). Владелец билетов может держать поток попыток. Правка: в startListening() при retryTimer !== undefined не стартовать новую попытку.
2. LISTEN-клиент без таймаута соединения — дефект дизайна. db.ts:96–112 (clientConfig()) без connectionTimeoutMillis; он есть только у пула (db.ts:129). При дропе SYN connecting висит до TCP-таймаута ОС (~2 мин), await listenForRooms() в relay.ts:506 задерживает апгрейд WebSocket. НЕ ПРОВЕРЕНО, что pg.Client принимает connectionTimeoutMillis. Правка: перенести в clientConfig().
3. splitOptions закрывает один из нескольких каналов снятия таймаута — противоречие. db.ts:83–93 и db_dsn.test.ts:66–78 закрывают только ?options=. pg-connection-string копирует произвольные query-ключи; ?statement_timeout=0, ?idle_in_transaction_session_timeout=0, ?lock_timeout, ?keepalives=0 идут отдельными GUC в startup-пакете, а Postgres применяет -c раньше остальных GUC пакета. НЕ ПРОВЕРЕНО (исходники pg недоступны офлайн). Проверка — тест с searchParams statement_timeout=0, ожидание 15000. Атакующий — владелец DATABASE_URL.
4. keepAlive без начальной задержки — мелочь. db.ts:106–109, без keepAliveInitialDelayMillis первый probe по tcp_keepalive_time ядра (7200 с). НЕ ПРОВЕРЕНО под Deno.
5. Защита от undefined поверхностная — мелочь. db.ts:201–203 ловит только верхний уровень args; [1, undefined] → {1,NULL}. Комментарий 184–185 обещает больше.
6. check-pg-resilience.sh:30–31 — chmod 777 на mktemp -d в /tmp, gate.ts пишется после (стр. 53). Мелочь, стенд разработчика.

Не нашла дефекта: SQL-инъекция (3 интерполяции — константы); секреты в журналах/ответах (String(error), scrubFields, фиксированные тексты HTTP); /health listen — четыре значения; payload NOTIFY — только роль базы; внешний триггер listenWasLost — только через падение базы/сети; supply chain — integrity на 13 пакетов в deno.lock; «postgres.js в образ не попадает (вывод из Dockerfile, образ не вскрывал)».

Не нашла, где проверено: TLS под Deno (sslmode=require в pg-connection-string = rejectUnauthorized:false); PGPASSFILE в образе при --allow-read=/data,/app/legal.

## Опровержения и сверка ведущего

- «postgres.js в образ не попадает» — ОПРОВЕРГНУТО замером NC-F (xor-ad-51, образ day59 8555569b): /deno-dir/npm/registry.npmjs.org/postgres/3.4.4 в образе есть целиком; deno 2.1.4 `cache --frozen` ставит все пакеты замка. Узлом не импортируется (deno info: 0). Записано в PANEL_2026-10-09_pg-driver-plan.md.
- TLS под Deno — замер NC-D: все sslmode, включая no-verify, отказывают с самоподписанным сертификатом («CaUsedAsEndEntity»), т.е. rejectUnauthorized:false под Deno не действует; MITM при require не подтверждён, а подключение к самоподписанному невозможно. Открыто к выкату.
- PGPASSFILE — NC-D: с PGPASSFILE=/data/pgpass (внутри --allow-read) pg читает файл; решено нормой.
- Находки 1–5 — отданы на эксперимент (NC-H), вердикты ниже, когда придут.

## verifier (Sonnet), day59 e9e5ebf4

Все пять заявок HELD: импортов npm:postgres в src/tools нет, `deno info src/main.ts` без postgres@3.4.4; run-relay-tests.sh rc 0, 298 passed; база rc 0, 50 наборов ok, 0 FAILED, TZ=Europe/Berlin в раннере; три поломки из копии — красные по ассерту (db_dsn «the DSN's options replaced the node's own», chat_hardening [1001,1001] вместо [1012,1012], expired_take_down B98), cmp равны; check-pg-resilience GREEN (бури 55 и 61). Оговорки: deno.lock держит npm:postgres@3.4.4 и jsr:@db/postgres@0.19 (первый драйвер, хвост); test/moderator_live.test.ts — `0 passed | 1 ignored` (живая модель, офлайн пропускается).

## Вердикты экспериментом (NC-H, xor-ad-51, на e9e5ebf4)

- H1 ПОДТВЕРЖДЕНО и ИСПРАВЛЕНО: «22 connection attempts in one second of room openings»; startListening() не стартует попытку при взведённом retryTimer.
- H2 ПОДТВЕРЖДЕНО и ИСПРАВЛЕНО: «listen() was still waiting on the silent server after 6 s», closePool() висел; connectionTimeoutMillis в clientConfig() для LISTEN и пула.
- H3 ПОДТВЕРЖДЕНО и ИСПРАВЛЕНО: ?statement_timeout=0 и ?idle_in_transaction_session_timeout=0 перебивали таймауты пула; splitOptions превращает их в -c перед нашими. lock_timeout не тронут — своего у узла нет.
- H4 ОПРОВЕРГНУТО как сформулировано; ОТКРЫТ более глубокий дефект: под Deno 2.1.4 и 2.5.6 у сокета pg с keepAlive:true таймера keepalive нет вовсе (/proc/net/tcp timer_active=00), с задержкой и без; положительный контроль Deno.connect + setKeepAlive → 02. Молчащая база без FIN LISTEN-клиентом не обнаруживается. В db.ts — комментарий; чинить прикладным пингом LISTEN — отдельная задача.
- H5 ПОДТВЕРЖДЕНО и ИСПРАВЛЕНО: [1, undefined, 3] проходил; holdsUndefined() рекурсивно по массивам.
- H6 ИСПРАВЛЕНО (поломкой не проверено): gate.ts в отдельном каталоге 755/644, монтируется :ro.

Каждое исправление: тест в test/db_hardening.test.ts, красный на e9e5ebf4, зелёный после, поломка из копии → красный.

## Нарезка

| # | Что | Уровень | Цена |
|---|---|---|---|
| H1 | backoff LISTEN не обходится открытием комнат; тест «N открытий при лежащей базе → попыток ≤ по расписанию» | дефект дизайна | 1 ч |
| H2 | connectionTimeoutMillis у LISTEN-клиента; тест с чёрной дырой | дефект дизайна | 30 мин |
| H3 | ?statement_timeout=0 и соседние ключи DSN; тест, затем снимать их в splitOptions | противоречие | 30 мин |
| H4 | keepAliveInitialDelayMillis | мелочь | 15 мин |
| H5 | undefined внутри массива — глубокая проверка или комментарий | мелочь | 15 мин |
| H6 | check-pg-resilience.sh: gate.ts до chmod, :ro | мелочь | 15 мин |
