# Панель ревью 26.09.2026 — что артель влила в day58

**Дата:** 26.09.2026, 10:20–10:45. **Ведущий:** сессия xor-ad-ae (задача B26 артели).
**Что ревьюили:** `git diff 2ea2cd3..5884454 -- relay/node depth` — 56 файлов, +4754 / −106
(без тестов и локалей — 26 файлов кода). Вошли: перенос личности с ack и отдельным пределом
опроса, подъём бумажным кодом и перевыпуск кода в depth, ядро очереди реплик до согласия,
очередь ввода useKeys, сторож С6 и письма, дайджест поддержки, живая фраза (LIVE_PHRASE, quota).
**Воспроизвести:** `git diff 2ea2cd3..5884454 -- relay/node depth`; файлы — `git show 5884454:<путь>`.
На момент записи day58 = 4852782 (сверху влиты B19 и B18, панель их не читала).
**Линзы:** Безопасность, Данные и СУБД, Протоколы и стандарты, Эксплуатация, Согласованность —
пять независимых агентов, параллельно, без доступа к находкам друг друга. Затем четыре
агента-опровергателя по предметам, правило «не уверен — опровергнуто».
**Машинные проверки до панели:** на 5884454 (+B19/B18) экраны depth 51/0, живой прогон экранов
зелёный (exit 0), ядро depth 75/0 на вершине B2 — в журналах артели.

Статусы ниже: **ПРОВЕРЕНО** — ведущий сверил сам инструментом (указано чем); **НЕ ПРОВЕРЕНО** —
держится на агентах (линза и опровергатель); сырьё агентов ниже не редактировалось.

## Сырые находки линз

### Линза «Безопасность» — сырьё

Security lens: day58 at 5884454, range 2ea2cd3..5884454 on relay/node and depth. Everything below comes from reading the code. The only thing I ran was one check in a `node:24-alpine` container, noted under finding 1.

**What holds (I read the code, nothing exercised live)**
- The reply envelope is sealed to the new device's `wrap_pub` together with `secret` (depth/core/transfer.ts:217-239). Its additional data binds the check digest and the header. So someone who overheard the code and pulls `reply_envelope` from the state route cannot open it.
- The label the claimant chose goes through `plain()` before display (depth/ink/move.ts:203).
- Only the new session can ack (relay/node/src/routes/transfer.ts:311-314), and that check runs under `FOR UPDATE`. Ack, approve and reject give one wording for "not yours" and "no such code".
- Unacked replies are pruned about 1 hour after expiry (relay/node/src/lib/scheduled.ts:284-293).
- The new moderation watchdog's mail and logs carry counts only (mailer.ts, moderation_watch.ts:209-214).
- `livePhraseOf` only rewrites a constant string, so it opens no injection.

**Findings, most severe first**

1. **Design defect (I see a defect): terminal escape injection through error lines.**
   - `openReply` runs `JSON.parse` on the reply header before any authentication (depth/core/transfer.ts:250-252).
   - Checked in `node:24-alpine`: the `SyntaxError` message carries the input bytes raw. `JSON.parse("\x1b]0;pwn\x07{")` gives a message that contains ESC and BEL.
   - The error travels `Arrival.state` → `onError(e.message)` (move.ts:264) → `fail` (app.ts:89) → rendered with no filter at app.ts:427. screens.ts:54, 87, 130 and 433 render `error` the same way.
   - Who can plant it: the node, or the old device's session, since `approve` accepts any reply bytes. The payload is arbitrary OSC/CSI: window title, OSC 8 links, OSC 52 clipboard write on terminals that allow it.
   - Fix: `fail = (m) => setError(say("common.error", { message: plain(m) }))`. Also wrap the header parse in its own try and throw a fixed message.

2. **Minor (I see a defect): `lookup_id` travels in the URL path.**
   - The new device polls `GET /sessions/:lookup_id` every 5 s. Ack, approve and reject also carry it in the path (transfer.ts:477-480).
   - So it lands in CDN, WAF and access logs. The claim route does not need `secret`, because the node cannot check the envelope (transfer.ts:186-223).
   - Anyone reading those logs within the 120 s can claim first. The result is cancel or "garbled" (DoS only), plus a read of the claim envelope. The GET route predates this range, and ack adds one more path.
   - Fix: move `lookup_id` into the body (POST for the state route).

3. **Minor (I see a defect): the state route is an existence oracle that skips the shared miss counter.**
   - 404 versus 200 "waiting"/"expired" (transfer.ts:266-273) is not counted by `TRANSFER.countMiss`. The per-address ceiling is now 600/hour (rate_limit.ts:313-316), up from the claim's 60.
   - Practical gain is close to nil: 45-bit code, Argon2id 64 MiB per guess, 120 s lifetime. It is still a way around the shared pause the claim route was built with.
   - Fix: count a 404 here with `TRANSFER.countMiss()`.

4. **Minor: private scalar in an immutable JS string.**
   - `publicHalf` calls `exportKey("jwk")` on the extractable long key (depth/core/recovery.ts:75-79). The JWK's `d` becomes a string that cannot be zeroed and lives until GC.
   - This goes against the "extractable only inside the call" claim in the header comment (recovery.ts:15-16).
   - Fix: export `pkcs8` into an `ArrayBuffer`, take the public point from it, zero the buffer. Or pass `long_pub` from a source already authenticated by the wrap's additional data.

5. **Minor: PIN left in memory.** `pin` stays in React state for the whole life of MoveOut after the invite opened (move.ts:65, 92). Fix: `setPin("")` once `pinProof` resolves.

6. **Contradiction: stale comments on rate limits.** transfer_move.ts:91-93 and move.ts:7-10 still say the state route shares the claim's 60/hour. The node now has separate `TRANSFER_STATE_LIMITS` (rate_limit.ts:313; transfer.ts:259). The 5 s poll is justified by a limit that no longer applies.

7. **Minor (I could not find where this is handled): old device after a lost approve answer.**
   - If `approve` commits but its answer is lost, `ask()` returns "approved" (move.ts:137-141).
   - `endings` has no "approved" entry (move.ts:36-41), so the screen goes back to the code screen with the code still shown (move.ts:159-173).
   - The device is already frozen and burned, yet it never reaches MovedAway. The person may believe the move failed and repeat it.
   - Fix: send `approved` to `onMoved`.

8. **Minor: pending chat lines.** They sit unsealed in process memory (depth/core/pending.ts), which is by spec (§8.5).
   - When a flush is stuck, `sayInChat` puts the new line into the queue too (client.ts, `#flush` path).
   - Those lines are dropped only by `decline` or `seat`. I found no drop when the match expires in depth: `dropQueued` exists, but nothing calls it.
   - "Not sent" becomes "sent later", into whatever chat id the caller passes. I could not find where the match's expiry is wired in.

**Not a finding**
- The approve body's `sign_pub`/`wrap_pub` are not tied to the claim on the node. That is the owner's own call and predates this range.
- The moderation watchdog keeps its memory per process, so a restart or a multi-node pool means duplicate letters. That is operations and already named in moderation_watch.ts:116-118.

### Линза «Данные и СУБД» — сырьё

DATA & DBMS lens: review of 2ea2cd3..5884454 on relay/node and depth

No migrations in range (`git diff --stat 2ea2cd3..5884454 -- relay/node/db` is empty), so nothing to backfill or make idempotent. I found no critical defect and no lock-order violation.

How I checked: I read the diff and the full `transfer.ts` at 5884454, db/024 and db/025. I ran EXPLAIN in a throwaway postgres:16 container with 200k phrases and 50k invites. Results:
- The watchdog's waiting read uses a bitmap scan on `feed_one_waiting`.
- `verdictSince` uses an index scan on `feed_cursor`.
- The invite prune does a seq scan.

**1. Design defect (I see it). Once the reply is acked, the next GET is treated as an error by the client.**
- `transfer.ts:286-289`: after the ack, GET returns `approved` without `reply_envelope`.
- `depth/core/transfer_move.ts:175` throws "approved without a reply" when it gets that.
- `depth/ink/move.ts:257-266` polls with a bare `setInterval` and has no in-flight guard. `state` only leaves `"claimed"` after `state()` resolves.
- Two ways to hit it:
  - A `state()` call that runs longer than `pollMs` (openReply plus the ack, `transfer_move.ts:176-191`) overlaps the next tick. The second call lands after the first call's ack and throws, so `onError` fires on a device that was just seated.
  - The ack request itself throws on the network after the node committed it. `state()` then rejects, and every later poll finds the reply gone.
- Point fix: in `Arrival.state()`, keep the opened result and return `"approved"` without reopening when `last === "approved"`. Also guard `ask` with an in-flight ref.
- Not exercised live.

**2. Minor / contradiction. An un-acked reply lives about 2 hours, and the docs don't say so.**
- The prune deletes at `expires_at < now() - 1h` and runs hourly (`scheduled.ts:289-291`). So with no ack, `reply_envelope` is served to anyone who knows `lookup_id` for up to ~2h02m after the invite.
- `protocol_RU.md:146-147` says "until ack" but gives no upper bound. The comment at `transfer_move.ts:188-190` says the envelope "waits for the sweeper".
- It is sealed to `wrap_pub` plus the secret (`chat_RU.md:1105`), so the exposure is low.
- Point fix: either state the bound in protocol §, or give GET a separate retention for approved rows, for example `decided_at + 10 min` in `stateOf`/prune.

**3. Minor, pre-existing but now on the ack path. The invite prune scans the whole table.**
- `session_invites_expiry` is partial `WHERE decided_at IS NULL` (`db/024:63-64`). Approved rows, which now keep the envelope until pruned, are not in that index, and EXPLAIN shows `Seq Scan on session_invites`.
- The db/024 comment "without this it reads the whole table hourly" is therefore only half true.
- Point fix: a new migration with an index on `(expires_at)` without the predicate.

**4. Minor. Profile quota and the phrase list are two statements with no shared snapshot.**
- `identity.ts:310-315` (phrases) and `:320-324` (slots) run as separate `query()` calls under READ COMMITTED. A phrase that expires between them shows in `phrases` but not in `quota.used`, so screen 10 can show 4 timers with "3 of 4".
- Point fix: one statement, either with `count(*) FILTER (WHERE LIVE_PHRASE)` alongside the list, or both inside `transaction()` at REPEATABLE READ.

**5. Minor. The moderation watchdog compares the app clock with the DB clock.**
- `moderation_watch.ts:153-158` passes `new Date(lastLetterAt)` (the node process's `Date.now()`, millisecond precision) against `visible_at`, which is DB `now()` with microseconds.
- If the node's clock runs ahead of Postgres, a verdict given just after a letter is missed, and the next letter is suppressed for up to a day. With `options.now` injected in tests, this compares fake time against real rows.
- Point fix: keep `lastLetterAt` as a DB timestamp. Take it from `SELECT now()` when a letter is sent, carry it as text/epoch rather than a JS Date (see memory "postgres.js режет микросекунды"), and compare `visible_at > $2::timestamptz`.

**6. Minor. The watchdog's memory is per process, and I could not find where the pool case is handled.**
- `moderation_watch.ts:136-138`: `lastLetterAt` and `pastNine` live in the process. When the job moves between nodes, each node can send its own "first" letter, and `pastNineInADay` undercounts.
- It is named as an open item in the header (`:116-118`). I could not find it in `docs/facts/open.tsv`.
- Point fix: add an open.tsv row, as for С7.

**7. Minor, checked and fine.** `watchModeration` reads `readModerationQueue()` and `late` (`:167-176`) as two statements, so the gauge rows and the late ids may disagree by one sweep tick. This only affects the day count, not whether a letter is sent. No action.

**Checked, no defect found:**
- **Lock order.**
  - `approveInvite` (`transfer.ts:368-435`) takes `vault_shares` → `session_invites` → `sessions` (freeze) → `identities` (the `first_pin_grant_at` UPDATE). That matches `chat_RU.md:1125-1131`.
  - `ackReply` (`:306-319`) takes only the `session_invites` row. Its UPDATE doesn't touch the FK columns, so there's no key-share lock on `sessions`, and no cycle is possible with approve, claim or reject.
- **Ack TOCTOU.** SELECT ... FOR UPDATE followed by the UPDATE in one transaction. A repeat is idempotent, and a race with the prune gives a 404 without corruption.
- **`LIVE_PHRASE` / `livePhraseOf`** (`feed_limits.ts:13-22`). The substitution is word-bounded and only rewrites the two column names. All nine call sites are equivalent to the old text (feed.ts:354/568, hidden.ts:26, likes.ts:78/129/179-180/404, profile.ts:154, identity.ts:323).
- **NULL handling.**
  - `feed_messages.brand` is NOT NULL (`db/025:20`), so the watchdog group key and the gauge label are never null.
  - `quota.next_at` is only emitted when `used >= LIVE_MAX`, and then `min(expires_at)` is non-null.
  - Rows whose author was erased (`author_identity` NULL) are counted as waiting by the watchdog and swept by `sweepStaleQueue` alike (`feed_verdict.ts:240-245`), so the two are consistent.
- **Watchdog query cost.** These run every minute and on every scrape, and use the partial indexes (EXPLAIN above). No full scan.
- **`support_sweeper.ts:74-80`.** Only counting changed. No rows are marked as sent, so nothing is lost on a failed letter.

**Not done:** I did not run the relay test suites and did not try the ack race (item 1) against a live node.

### Линза «Протоколы и стандарты» — сырьё

Линза «Протоколы и стандарты», диапазон 2ea2cd3..5884454 (relay/node, depth). Только чтение, ничего не правил. Все находки ниже я проверил сам по файлам. Ничего не запускал: это находки по чтению кода, живьём не проверены.

## Итог
Криптография конвертов сделана по букве chat_RU §8.2 «Конверты переноса побайтно» (:1099). Совпадает всё: Argon2id 64 МиБ / t=3 / p=1 (`pin.ts:17-19`), разбиение material на 32 и 32 байта, iv в 12 байт, доп. данные claim и reply, HKDF-SHA-256 над ECDH‖secret, pkcs8 wrapKey под AES-GCM, 20 бит сверки старшими битами вперёд, алфавит Crockford без I L O U, base64url без `=` по RFC 4648 §5 (`sign.ts:26`).
Критичных дефектов нет. Есть один дефект потока и несколько расхождений контракта.

## Находки, от серьёзных к мелким

1. **Дефект дизайна: потерянный ответ на ack выглядит как проваленный перенос.** `depth/core/transfer_move.ts:191`. Если `POST …/ack` бросит исключение (сеть), оно не перехватывается. `Arrival.state()` отклоняется уже после `client.seat(...)`, и `depth/ink/move.ts:262` уходит в `onError`, хотя личность уже переехала. Комментарий `:188-190` и строка protocol_RU:147 («Повтор — тоже 200», ack повторяем) обещают обратное.
   Правка: обернуть ack в `try/catch`, при ошибке записывать `acked = 0`.

2. **Противоречие: openapi описывает approve с ответом 204.** `docs/api/openapi.yaml`, `/sessions/{lookup_id}/approve`: `"204": Done.`. Код отвечает `200 {state:"approved", session_id}` (`relay/node/src/routes/transfer.ts:437`), клиент ждёт именно 200 (`move.ts:139`). Дефект был и до диапазона, но это контракт той же пары маршрутов.
   Правка: заменить в openapi 204 на 200 со схемой `{state, session_id}`. В строке protocol_RU:144 дописать «отвечает `{state, session_id}`».

3. **Противоречие: устаревший комментарий о пределе опроса.** `transfer_move.ts:91-93` говорит, что опрос делит с claim «60 an hour, TRANSFER_CLAIM_LIMITS». Предел теперь свой, `TRANSFER_STATE_LIMITS` 600/1500 (`rate_limit.ts:245`, protocol_RU:396, `limits.tsv` transfer.state.hour/.day).
   Правка: переписать комментарий.

4. **Мелкое: клиент игнорирует Retry-After (RFC 9110 §10.2.3; 429 — RFC 6585 §4).** На 429 `Departure.state` и `Arrival.state` (`transfer_move.ts:94`, `:171`) отдают прежнее состояние, и опрос продолжается каждые 5 с (`MOVE_POLL_MS`). Узел заголовок шлёт (`transfer.ts:261`), клиент его разбирает (`client.ts:131`), но опрос его не учитывает.
   Правка: на время `retryAfter` пропускать опросы.

5. **Мелкое: Retry-After разбирается только в форме delay-seconds.** `client.ts:131`: `Number(header)`. Форма HTTP-date, которую допускает RFC 9110 §10.2.3, молча теряется. Сейчас узел шлёт секунды, так что это неполнота разбора, а не поломка.

6. **Мелкое: ack не пропускает шагнувшего в сторону.** `transfer.ts:304` вызывает `callerOf(req)` без `allowSteppedAway`. Если у личности стоит `stepped_away_until`, ack получает `409 stepped_away` (`identity_guard.ts:178`), и конверт лежит до уборщика (`scheduled.ts:289`, срок + 1 ч). Утечки нет: конверт запечатан на `wrap_pub`. Но ack — служебная квитанция, отказывать ей незачем.
   В openapi у `/ack` объявлен 409 — он описывает ровно этот случай, а в protocol_RU:147 его нет.
   Правка: либо `allowSteppedAway: true`, либо внести 409 в строку протокола.

7. **Мелкое: ссылка спецификации ведёт не на ту строку.** chat_RU.md:1105 и chat_EN.md:1118 ссылаются на `transfer.ts:275` как на место, где отдаётся `reply_envelope`. После вставки комментария B3 на `:275` стоит `claim_envelope`, а `reply_envelope` — на `:286`.
   Правка: сослаться на имя `inviteState`, а не на номер строки.

8. **Мелкое: разбор ответного конверта без проверки границ.** `transfer.ts:250-259` (depth/core) не проверяет `bytes.length >= 2 + n + 12 + 16` до разрезания. Подделку всё равно ловит тег GCM, потому что iv связан в J0 (NIST SP 800-38D §7.1). Но усечённый конверт падает непонятной ошибкой WebCrypto или JSON, а не читаемой.
   Правка: одна проверка длины с внятной ошибкой.

9. **Мелкое, осознанное отступление от RFC 9106.** §3.1 советует соль уникальную на каждый пароль, от 16 байт. Здесь соль постоянная, `"xor.ad/device-link/v1"`. Иначе нельзя: оба устройства должны вывести одно и то же. Параметры отличаются от «второго рекомендуемого» набора §4 (t=3, p=4, 64 МиБ) только в p=1.
   Следствие стоит назвать: перебор 45 бит один на все переносы сразу, поэтому оценка «сотни тысяч лет» (chat_RU:1157) верна для одного ядра, а не на каждое приглашение. После 26.09 цена ниже: ответ запечатан ещё и на `wrap_pub`.
   Правка: одна фраза в §8.2, код не трогать.

10. **Мелкое: один секрет в двух примитивах.** `secret` идёт сразу ключом AES-GCM для claim (`transfer.ts:117`) и частью IKM для HKDF ответа (`:204`). Это разрешено буквой §8.2, практической атаки не вижу. Чище было бы выводить ключ claim тоже через HKDF (RFC 5869 §3.2), но это меняет контракт клиентов — только новым доменом `…/v2`.

## Проверено, расхождений нет
- **Маршрут ack.** protocol_RU:147, openapi `/sessions/{lookup_id}/ack` и код (`transfer.ts:302-326`) сходятся: 200 при повторе, 404 при чужой подписи.
- **`quota` в `GET /identities/me`.** protocol_RU:336, openapi:653 и `identity.ts:326-359` сходятся: `LIVE_PHRASE` общий с отказом пятой фразы, `next_at` приходит только при `used >= 4`.
- **`PENDING_MAX`.** 200 совпадает с `chat.pending.max` (`limits.tsv:91`). Клиент отвечает за это по `open.tsv:159`.
- **Письмо С6** (`mailer.ts:502-531`). Заголовки в ASCII, кодировка RFC 2047 не нужна. Текст «at ten … dropped» совпадает с `moderation.queue.wait` = 10 (`limits.tsv:112`). Ст. 17 DSA не затронута.

## В описанном месте не нашёл
`docs/openapi.yaml` нет — файл лежит в `docs/api/openapi.yaml`.

### Линза «Эксплуатация» — сырьё

Линза «Эксплуатация». Смотрел `git diff 2ea2cd3..5884454 -- relay/node depth`, файлы брал через `git show 5884454:…`. Ничего не правил и не запускал: всё ниже получено чтением кода, живьём не проверено.

Одна поправка к заданию. Опрос состояния переноса больше не делит лимит `TRANSFER_CLAIM_LIMITS`. На 5884454 у него свой `TRANSFER_STATE_LIMITS`: 600 в час и 1500 в сутки (`routes/transfer.ts:259`, `rate_limit.ts:313-316`, `limits.tsv:106-107`). Отказ в окно не засчитывается (`rate_limit.ts:347-353`), поэтому опрос во время 429 блокировку не продлевает.

1. **Критично.** Если ответ на ack потерялся, новое устройство застревает, хотя ключ у него уже есть. В `depth/core/transfer_move.ts:177-191` функция `Arrival.state()` сначала вызывает `seat()`, потом `await`-ит ack. Допустим, узел ack записал (`transfer.ts:316` обнулил `reply_envelope`), а ответ до клиента не дошёл, и `fetch` бросил исключение. Тогда `setState("approved")` в `depth/ink/move.ts:259-262` не вызывается, и опрос продолжается. Следующий опрос получает `approved` без конверта и бросает `approved without a reply` (`transfer_move.ts:175`). Так повторяется каждые 5 с. После уборки (`scheduled.ts:290`, срок истечения плюс час) приходит 404, и экран пишет «перенос истёк». При этом клиент уже сидит в новой сессии, а ключи живут только в памяти: записи на диск в `depth/core` нет. Выход из процесса оставляет личность одному бумажному коду, старое устройство уже заморожено. Точечная правка: в `Arrival` запомнить `seated`. Если перенос уже `approved` и `seated`, возвращать `approved` без повторного открытия конверта. Ошибку ack не пробрасывать из `state()`.

2. **Дефект дизайна.** Опрос без защиты от наложения и без тайм-аута. `useEvery` в `move.ts:43-50` — это голый `setInterval`, а `fetch` в `client.ts:123` идёт без `AbortSignal`. Если узел отвечает дольше 5 с, запросы копятся без предела, по одному каждые 5 с. На прибывающем устройстве два одновременных `state()` делают `seat` дважды и зовут `onArrived` дважды. Бросок одного из них оставляет сообщение `error` на экране `arrivedPin`, потому что `fail` общий (`app.ts:89`). Правка: флаг «запрос в полёте» в `ask()` и тайм-аут в `#call`.

3. **Дефект дизайна.** Тревога `ModerationQueueStopped` почти не может сработать. Правило `max(relay_moderation_oldest_seconds) > 540 for: 2m` (`relay/local/observability/alerts.yml:94-95`) требует, чтобы старейшей фразе было больше 11 минут. Но в 10 минут уборка раз в минуту её снимает. Датчик держится выше 540 только при непрерывном потоке фраз, при редком трафике никогда. Письмо С6 это закрывает: в нём нет `for`. Но `docs/watchdogs_RU.md:138` описывает правило как рабочее. Правка: `for: 0m` либо `max_over_time(...[5m]) > 540`.

4. **Противоречие.** Письмо С6 при выключенной почте пишет error каждую минуту. `sendModerationStopped` отвечает `false`, когда транспорт `none` (`mailer.ts:69`). Тогда `lastLetterAt` не ставится (`moderation_watch.ts:122`), и каждый проход пишет error «nobody could be told» (`:126`). На dev без модератора это error на каждую застрявшую фразу. Сегодняшняя правка B15 в `support_sweeper.ts:80` ровно этот случай исключает (`transport !== "none"`), а здесь исключения нет. Правка: при `none` возвращаться до цикла или писать на уровне info.

5. **Дефект дизайна.** Письма С6 при лежащей почте повторяются каждую минуту без отступа. `deliver` ловит ошибку и возвращает `false` (`mailer.ts:794-797`), а `lastLetterAt` пишется только при успехе. Пока очередь стоит, каждую минуту идёт новая попытка на каждый адрес, и каждая даёт две строки error. Правка: запоминать и неудачную попытку, с отступом, например 10 минут.

6. **Мелочь.** Метрика почты путает источники. `deliver` считает каждое письмо как `relay_mail_total{kind="dsa"}` (`mailer.ts:792,795`). Письма С6 (а до них С7) неотличимы от писем по DSA. Дежурный видит «DSA mail failed», а упало письмо о модерации. Правка: передавать `kind` параметром.

7. **Мелочь.** Непрочитанные ответы переноса не видны. На ack есть счётчик `reply_acknowledged` (`transfer.ts:317`), а ответ, убранный без ack, не считается нигде: `scheduled.ts:290-302` пишет в лог только общее `deleted`. Как раз этот сигнал показал бы случай из п. 1. Правка: считать строки с `decision='approved' AND reply_envelope IS NOT NULL` при уборке.

8. **Мелочь.** Отказ 429 на опросе не попадает в метрики. `transfer.ts:261` отказывает без `inc`, а у invite есть `address_limited` (`:84`). Если новый лимит 600/1500 окажется мал за NAT оператора, этого не будет видно. Правка: `inc("relay_transfer_total", {result:"state_limited"})`.

9. **Мелочь, в коде названо как открытое.** Память С6 живёт в процессе. `lastLetterAt` и `pastNine` (`moderation_watch.ts:53,55`) обнуляются при каждом рестарте. Пока модератора нет, очередь на проде стоит всегда, так что каждый выкат или рестарт даёт письмо. На пуле из N узлов писем N, а счётчик `pastNineInADay` делится между узлами. Правка: хранить отметку последнего письма в БД. Та же дыра у С7.

10. **Противоречие, мелочь.** Комментарии в depth устарели после B10. `depth/ink/move.ts:7-10` и `depth/core/transfer_move.ts:91-93` всё ещё пишут, что опрос делит лимит ввода кода, 60 в час.

**Искал и не нашёл проблем:**
- **Падение задачи С6.** Сбой запроса к БД возвращает `null` и даёт пустой результат (`moderation_watch.ts` через `readModerationQueue`, `late ?? []`). Необработанного исключения нет. Если бы задача бросила, у очереди задач есть повтор с квадратичным отступом (`jobs.ts:186`).
- **Рост `pastNine`.** Ограничен суточным числом фраз.
- **Рестарт узла посреди переноса.** Состояние в `session_invites` лежит в БД. Ответ доступен до срока истечения плюс час (`stateOf`: сначала решение, потом `expired`).
- **Сводка поддержки при отказе почты.** Теперь считается (`support_sweeper.ts:80-83`).

### Линза «Согласованность» — сырьё

Линза «Согласованность», диапазон 2ea2cd3..5884454. Всё ниже я сверил сам: читал файлы в worktree par-B25, между 5884454 и HEAD там отличаются только depth/ink/app.ts, screens.ts и live.node-test.ts, а app.ts смотрел через `git show 5884454:`. Тесты не запускал, это чтение, а не исполнение.

## Дефекты (по убыванию тяжести)

**1. Противоречие. Документы и реестр говорят, что `depth move` нет, хотя он построен.**
- В документах и реестре:
  - docs/depth-client_RU.md:32: «Нет `depth move` (пункт `depth.restore`)».
  - docs/depth-client_EN.md:36: «There is no `depth move`».
  - docs/facts/open.tsv:167 (`depth.restore`): «не построен depth move».
- В коде:
  - depth/ink/move.ts:1: MoveOut и MoveIn.
  - depth/ink/main.ts:22-24: `argv "move"` → `moveIn`.
  - app.ts@5884454:181-196: экраны `move`, `movedAway`, `moveIn`, `arrivedPin`.
  - Коммит 2a0fcb8 «Let depth move an identity…».
- Правка: переписать статус в обоих языках. В open.tsv оставить открытым только то, чего действительно нет (например, `depth device`).

**2. Противоречие. Строка интерфейса обещает то, чего код не делает: `restore.introHere`.**
- depth/ink/locales/en.json:170 «…and you set a new PIN». То же в ru.json:170 и ещё в 15 локалях.
- Строка показывается, когда `client.registered` (app.ts@5884454:308). Но при `o.sameDevice` код идёт сразу в `newPaper`, без ПИНа (app.ts@5884454:321-326, комментарий «the old PIN opens it again»).
- Само расхождение уже записано в open.tsv `depth.pin.forgot.samedevice`, но строка его не учитывает.
- Правка: текст «прежний ПИН снова откроет это устройство». Второй путь — исполнить обещание через грант.

**3. Противоречие. Порядок ПИНа и кода при переносе в спеке клиента расходится с кодом и протоколом.**
- В спеке: docs/depth-client_RU.md:280 и 295 «ПИН этого устройства… ПИН спрашивается до кода»; EN:293 и 308 то же.
- В коде: новое устройство просит сначала код, а первый ПИН задаёт после прихода по гранту (move.ts:236-266 MoveIn, app.ts@5884454:192 `onArrived` → `arrivedPin`; transfer_move.ts:163-166). Протокол согласен с кодом: docs/protocol_RU.md:143 `POST /vault/init`, «первый ПИН на новом устройстве после переноса».
- Правка: в §3.2 обоих языков поставить ПИН после сверки.

**4. Устаревший комментарий: в depth опрос будто бы делит предел с claim (60/ч).**
- В depth: depth/ink/move.ts:7-10 («shares its per-address allowance with the claim — 60 an hour… TRANSFER_CLAIM_LIMITS») и depth/core/transfer_move.ts:91-92 (то же).
- На узле: relay/node/src/routes/transfer.ts:257 `checkAll(TRANSFER_STATE_LIMITS…)`; relay/node/src/lib/rate_limit.ts:235-248 задаёт 600/ч и 1500/сут; limits.tsv:106-107.
- Правка: ссылаться на `TRANSFER_STATE_LIMITS`. Фразу «Every two seconds, one move would spend it» убрать.

**5. Противоречие. «Ответ повторяется до ack» — на деле ответ живёт не дольше примерно часа.**
- В документах: docs/protocol_RU.md:146 и protocol_EN.md:154 «на каждый опрос, пока новая сессия не подтвердит»; transfer.ts:278-285 говорит то же.
- В коде: relay/node/src/lib/scheduled.ts:288-294 удаляет приглашение через час после `expires_at` (120 с), даже если одобренный ответ никто не подтвердил. Комментарий scheduled.ts:282-283 «the decision has already reached both sides» после B3 тоже неверен.
- depth/core/transfer_move.ts:189 («waits for the sweeper») описывает это верно.
- Правка: назвать границу в протоколе RU и EN и поправить комментарий в scheduled.ts.

**6. Мелочь. Ссылки на строки в спеке чата уехали.**
- docs/chat_RU.md:1105 и chat_EN (тот же абзац) ссылаются на `transfer.ts:275`. На самом деле `reply_envelope` отдаётся в transfer.ts:286-287, а на 275 — комментарий.
- chat_RU.md:1396 и chat_EN:1415 ссылаются на `identity.ts:592` («re-arms first_pin_grant_at»). Это только вход в ветку `sameDevice` (590), само `UPDATE … first_pin_grant_at = now()` стоит на identity.ts:614.

**7. Мелочь. Пункт open.tsv противоречит сам себе.**
- open.tsv:174 `chat.queue.ceiling`: «в depth ждущей беседы с очередью пока нет; в depth ядро построено 26.09.2026…». Первую половину нужно снять.

**8. Мелочь. `depth.lock` не учитывает удержание ключа из §8.13.**
- open.tsv:166 `depth.lock`: «завёрнутой копии ключей в памяти нет».
- Спека: chat_RU.md:2678 и chat_EN:2708 теперь говорят, что завёрнутую копию долгого ключа держит ключ процесса. Код это делает: depth/core/transfer.ts:174-177 `HeldKey.hold`.
- Правка: уточнить «кроме долгого ключа».

**9. Мелочь. Имя команды расходится со спекой.**
- scripts/depth.sh:20 называет подкоманду `join` (`args=(move)`), а спека (depth-client_RU.md таблица §3, EN:250) и main.ts:24 называют её `depth move`.

**10. Мелочь. Таблица команд противоречит статусу о `depth reissue`.**
- depth-client_RU.md таблица §3 (строка `depth reissue`) и EN:256 перечисляют `depth reissue` как команду без пометки.
- Статус в той же спеке (RU:31-32, EN:35-36) говорит, что без тома такой команды быть не может.
- Правка: пометить строку в таблице.

## Проверено, расхождений нет
- `PENDING_MAX` 200 (depth/core/pending.ts:19) совпадает с limits.tsv:91 `chat.pending.max` и relay routes/chats.ts:29.
- `INVITE_TTL_SECONDS` 120 (transfer.ts:42) совпадает с chat_RU схемой §8.2 и move.codeLife.
- `MOVE_POLL_MS` 5000 сходится с обоснованием 600/ч (10×2×24 опроса за 120 с).
- `TRANSFER_CLAIM_LIMITS` 60 и 200 совпадают с limits.tsv:104-105 и таблицами протокола RU и EN.
- `LIVE_MAX` 4 совпадает с `feed.live.slots`. Описание `quota` в protocol RU и EN, в openapi и в identity.ts согласовано, включая отсутствие `next_at` при свободном месте.
- `KEYS_AHEAD` 32 (depth/ink/parts.ts:50) в реестре не значится. Это клиентский технический буфер, противоречия нет, есть пробел.
- Сторож С6: watchdogs_RU и watchdogs_EN совпадают с moderation_watch.ts (раз в минуту, 9 из 10 минут, раз в сутки или через час после вердикта), с mailer.ts и с queue_metrics.ts.
- Пары RU/EN chat, protocol и depth-client по сегодняшним абзацам говорят одно и то же; в chat_EN только убран дубль.
- decisions.tsv:190-192 указывают на верные строки chat_RU и chat_EN.
- Документация маршрута ack совпадает с `ackReply` (404 `not_found` чужой подписи, повтор 200).
- Комментарий transfer.ts:331-334 про запечатывание на `wrap_pub` актуален.

## Сведённые находки (ведущий, до перепроверки)


Диапазон: 2ea2cd3..5884454, relay/node и depth. Источник — линзы (Д данные, П протоколы, Э эксплуатация, Б безопасность, С согласованность).

F1 [Д1, П1, Э1 крит., Э2] depth: Arrival.state() после seat() ждёт ack; потерянный ответ ack или наложение опросов (useEvery = голый setInterval без защиты «в полёте», fetch без тайм-аута) → следующий опрос получает approved без reply_envelope → throw "approved without a reply" (transfer_move.ts:175, :176-191; move.ts:257-266, :43-50) → onError на уже пересаженном устройстве; после уборки 404 → «код истёк»; двойной seat/onArrived.
F2 [Б7] depth: старое устройство — approve закоммичен, ответ потерян → ask() видит approved, но endings без approved → экран снова показывает код, MovedAway не наступает (move.ts:36-41, 137-141, 159-173).
F3 [Б1] depth: SyntaxError из JSON.parse заголовка ответа несёт сырые байты (ESC, BEL) → onError → fail (app.ts:89) → вывод без plain (app.ts:427; screens.ts:54, 87, 130, 433) → внедрение управляющих последовательностей в терминал.
F4 [П3, Э10, Б6, С4] depth: комментарии move.ts:7-10 и transfer_move.ts:91-93 говорят, что опрос делит 60/ч с claim; на узле свой TRANSFER_STATE_LIMITS 600/1500 (rate_limit.ts:313-316, transfer.ts:257-259).
F5 [П2] docs/api/openapi.yaml: approve описан как 204, код отвечает 200 {state, session_id} (transfer.ts:437).
F6 [П6] relay: ack через callerOf без allowSteppedAway (transfer.ts:304) → 409 stepped_away при отлучке; protocol_RU:147 409 не называет.
F7 [Д2, С5] relay/docs: неподтверждённый ответ живёт до уборки (scheduled.ts:288-294, срок +1 ч, раз в час), protocol_RU:146/EN:154 говорит «пока не подтвердит» без предела; комментарий scheduled.ts:282-283 устарел.
F8 [Д3] relay: уборка приглашений — Seq Scan: индекс session_invites_expiry частичный WHERE decided_at IS NULL (db/024:63-64).
F9 [Д4] relay: GET /identities/me — фразы и quota двумя запросами без общего снимка (identity.ts:310-315, 320-324).
F10 [Д5] relay: сторож С6 сравнивает часы процесса (new Date(lastLetterAt)) с visible_at из now() БД (moderation_watch.ts:153-158).
F11 [Д6, Э9] relay: память С6 в процессе (moderation_watch.ts:53,55,136-138) — рестарт/пул → лишние письма; названо в коде (:116-118), строки в open.tsv нет.
F12 [Э3] observability: тревога ModerationQueueStopped `> 540 for: 2m` (relay/local/observability/alerts.yml:94-95) почти не срабатывает — уборка снимает фразу в 10 мин.
F13 [Э4, Э5] relay: С6 при transport none пишет error каждую минуту (mailer.ts:69, moderation_watch.ts:122,126), при лежащей почте — повтор каждую минуту без отступа (mailer.ts:794-797).
F14 [Э6] relay: deliver считает всё как relay_mail_total{kind="dsa"} (mailer.ts:792,795).
F15 [Э7, Э8] relay: нет метрики для ответа, убранного без ack (scheduled.ts:290-302), и для 429 на опросе состояния (transfer.ts:261).
F16 [П4, П5] depth: на 429 опрос не учитывает Retry-After (transfer_move.ts:94,171); разбор только секунд (client.ts:131).
F17 [П7, С6] docs: chat_RU:1105/EN ссылаются на transfer.ts:275 (там не reply_envelope); chat_RU:1396/EN:1415 на identity.ts:592 (UPDATE на 614).
F18 [П8] depth: openReply режет конверт без проверки длины (transfer.ts:250-259) → невнятная ошибка на усечённом.
F19 [П9, П10] docs: постоянная соль Argon2id (RFC 9106 §3.1) — оценка «сотни тысяч лет» на все переносы, а не на каждое; secret в двух примитивах.
F20 [Б2] relay: lookup_id в пути URL (GET/approve/reject/ack) → в логах CDN/WAF; прочитавший за 120 с может заявить первым.
F21 [Б3] relay: маршрут состояния — оракул существования, промахи не идут в TRANSFER.countMiss (transfer.ts:266-273).
F22 [Б4] depth: recovery.ts:75-79 publicHalf exportKey("jwk") → d в неизменяемой строке.
F23 [Б5] depth: ПИН остаётся в состоянии React MoveOut после открытия окна (move.ts:65, 92).
F24 [Б8] depth: dropQueued никто не зовёт; очередь не сбрасывается по истечении мэтча (pending.ts, client.ts).
F25 [С1] docs: depth-client_RU:32/EN:36 и open.tsv:167 говорят, что depth move нет.
F26 [С2] locales: restore.introHere обещает новый ПИН (en/ru.json:170) — уже в owner.md (B20).
F27 [С3] docs: depth-client_RU:280,295/EN:293,308 — ПИН до кода при переносе; код и протокол — после.
F28 [С7] open.tsv:174 chat.queue.ceiling противоречит сам себе.
F29 [С8] open.tsv:166 depth.lock «завёрнутой копии нет» — есть HeldKey.
F30 [С9] scripts/depth.sh:20 `join` vs спека и main.ts `move`.
F31 [С10] depth-client таблица §3 `depth reissue` без пометки vs статус RU:31-32/EN:35-36.

## Опровержения

### Опровержение F1–F3, F16, F18, F22–F24 (клиент depth) — сырьё

Итог опровержения по коммиту 5884454: подтверждены F1, F2, F3, F16, F18, F22 и F23. Опровергнута только F24. Настоящие дефекты проектирования — F1 и F2, остальные подтверждённые — мелкие.

**F1 — ПОДТВЕРЖДЕНО, дефект проектирования.**
- Путь без всяких гонок: `Arrival.state()` сначала сажает клиента (`transfer_move.ts:177`), потом ждёт ack (`:191`).
- `fetch` без тайм-аута и без перехвата сетевой ошибки (`client.ts:123`). Если ответ на ack потерян, `state()` отклоняется уже после `seat()`, и срабатывает `onError` (`move.ts:264`).
- Состояние экрана при этом остаётся `claimed`, опрос продолжается (`move.ts:266`).
- Если ack на узле закоммичен, ответ приходит `approved` уже без `reply_envelope`. Такой ответ узел отдаёт по замыслу (`relay transfer.ts:280-289`, конверт обнуляется там же, на `:309`). Клиент на это бросает «approved without a reply» (`transfer_move.ts:175`) каждые 5 с, и `onArrived` не наступает никогда.
- Ключ есть только в памяти процесса. Выход — и личность заморожена на старом устройстве, поднять её можно лишь бумажным кодом.
- Вторая ветка, с наложением опросов (`useEvery` — голый `setInterval`, `move.ts:43-50`), тоже реальна, но нужна задержка сети около 5 с.

**F2 — ПОДТВЕРЖДЕНО, дефект проектирования.**
- `approve` закоммичен, ответ потерян: `.catch` зовёт `onError` (`move.ts:143`), состояние остаётся `claimed`, опрос идёт.
- `ask` получает `approved` и делает `setState` (`move.ts:79`). Но `approved` нет в `endings` (`:36-41`), поэтому рендер падает в последнюю ветку и снова показывает код и «никто не спрашивал» (`:159-173`).
- Опрос останавливается (`open` = false, `:83`). `MovedAway` показывается только из `onMoved` (`:139`) — на этом пути его никто не вызывает.

**F3 — ПОДТВЕРЖДЕНО, мелкое.**
- `openReply` разбирает заголовок через `JSON.parse` до проверки AEAD (`core/transfer.ts:252`). Заголовок пишет одобряющее устройство либо узел.
- Проверил: `docker run node:24-alpine`, `JSON.parse("\x1b[2J")` → сообщение `Unexpected token '\u001b', "\u001b[2J" is not valid JSON`, байты ESC сырые. Для длинного ввода фрагмент обрезается примерно до 10 символов, но короткой последовательности этого хватает.
- Путь до экрана: `MoveIn` `onError` → `fail` (`app.ts:89,194`) → `say` подставляет строку без чистки (`strings.ts:45`) → экрана `moveIn` нет в списке исключений (`app.ts:427`) → `Text` выводит строку без `plain`.
- Мелкое, потому что нужен злонамеренный узел или скомпрометированное одобряющее устройство.

**F16 — ПОДТВЕРЖДЕНО как факт, мелкое, вреда почти нет.**
- При 429 `state()` возвращает `this.last` (`transfer_move.ts:94,171`), `Retry-After` не читается.
- Опрос и так идёт с фиксированным шагом 5 с, так что игнорирование не увеличивает нагрузку, просто опрос тратится впустую.
- Часть про HTTP-date на деле не достижима: узел отдаёт только секунды (`relay transfer.ts:260-262`, `String(verdict.retryAfterSeconds)`).

**F18 — ПОДТВЕРЖДЕНО, мелкое.**
- `n` читается из `bytes[0..1]` без проверки `bytes.length >= 2 + n + 12` (`core/transfer.ts:249-259`).
- На усечённом конверте получаем `JSON.parse("")` → «Unexpected end of JSON input» либо `OperationError` от `unwrapKey`. Ошибка невнятная, но небезопасного исхода нет: AEAD срывает всё, что подделано.

**F22 — ПОДТВЕРЖДЕНО, мелкое (гигиена).**
- `exportKey("jwk")` отдаёт весь JWK вместе с `d` (`recovery.ts:76`). Деструктурируются только `x`, `y`, но строка `d` остаётся в куче до сборки мусора.
- Альтернатива через pkcs8 в `Uint8Array` позволила бы обнулить буфер. Выигрыш маленький: сам извлекаемый ключ в той же памяти.

**F23 — ПОДТВЕРЖДЕНО, мелкое.**
- После `start()` `setPin("")` не вызывается (`move.ts:65,89-106`). ПИН живёт в состоянии `MoveOut`, пока экран с кодом и подтверждением не размонтирован.
- Только память процесса, выигрыш атакующего ничтожен.

**F24 — ОПРОВЕРГНУТО.**
- `git grep` по 5884454 показывает, что `queueLine`/`dropQueued`/`flushQueued` существуют только в `depth/core/client.ts:681-697`, их не зовёт ни одно место в `depth/ink`.
- Очередь никто не наполняет, поэтому «не сброшена по истечении мэтча» недостижимо: это незаведённый API, а не утечка. Уместна строка в `open.tsv` — «лицо не подключено», не дефект.

Все файлы я читал через `git show 5884454:…`, ничего не правил.

### Опровержение F5–F9, F20, F21 (узел переноса) — сырьё

Итог опровержения по F5, F6, F7, F8, F9, F20 и F21 (всё читал через `git show 5884454:<path>`): подтверждаю 5 из 7 (F5, F7, F8, F9, F21), критичных нет; F6 и F20 опровергнуты. Для F8 была проверка в одноразовом Postgres, для остальных — чтение кода.

**F5 — ПОДТВЕРЖДЕНО, мелкое (контракт расходится с кодом).** `docs/api/openapi.yaml:3394` описывает у approve ответ `"204": Done.`. Код на `transfer.ts:437` отвечает `json({state:"approved", session_id}, 200)`. Ответа 200 в openapi нет вовсе. Протокол (`protocol_RU:144`) код ответа не называет.

**F6 — ОПРОВЕРГНУТО, на практике недостижимо.** `ackReply` действительно вызывает `callerOf(req)` без `allowSteppedAway` (`transfer.ts:303`), и `identity_guard.ts:177` в отлучке отдаёт 409. Но отлучка хранится на уровне личности. `approveInvite` сам вызывает `callerOf` без `allowSteppedAway` (`transfer.ts:342`), значит approve не проходит, пока личность в отлучке. После approve старая сессия заморожена (`:418-421`). Отлучку между approve и ack может поставить только новая сессия, своим подписанным запросом до собственного ack. depth шлёт ack сразу после получения ответа (`depth/core/transfer_move.ts:187-191`). Остаток — пропуск в документации, а не дефект.

**F7 — ПОДТВЕРЖДЕНО, мелкое (документация и комментарий).** Неподтверждённый ответ удаляется вместе со строкой по условию `expires_at < now() - interval '1 hour'` (`scheduled.ts:290`), уборка раз в час (`:303`). Значит, он живёт примерно от 1 до 2 часов после истечения. `protocol_RU:146` и `:147` пишут «на каждый опрос, пока новая сессия не подтвердит» и предела не называют. Комментарий `scheduled.ts:282-283` («the decision has already reached both sides») противоречит самой идее ack: для решённых, но неподтверждённых приглашений это неверно.

**F8 — ПОДТВЕРЖДЕНО, мелкое.** Индекс `session_invites_expiry` частичный, `WHERE decided_at IS NULL` (`db/024:63-64`). Запрос уборки (`scheduled.ts:288-291`) этого условия не содержит, поэтому планировщик индекс взять не может. Других индексов на `session_invites` в миграциях нет (`git grep` по `relay/node/db`). Проверено в одноразовом postgres:16: на 200 тысячах строк `EXPLAIN` показал `Seq Scan … Filter: (expires_at < (now() - '01:00:00'))`. Оговорка по цене: строки короткоживущие, на личность живым может быть только одно приглашение. Вред — полное чтение таблицы раз в час, а комментарий `024:61-62` обещает обратное.

**F9 — ПОДТВЕРЖДЕНО, мелкое (косметика).** Профиль, фразы и счётчик слотов читаются тремя отдельными `query()` без транзакции (`identity.ts:290`, `:310`, `:326`). Каждый запрос в READ COMMITTED берёт свой снимок и свой `now()`. Если фраза истечёт или пройдёт очередь между запросами, список и `used` могут разойтись на единицу. Следующее чтение это исправляет, на запись не влияет.

**F20 — ОПРОВЕРГНУТО как угроза безопасности.** Сам факт верен: старое устройство опрашивает `GET /sessions/:lookup_id` ещё до claim, так что `lookup_id` попадает в URL. Это осознанное решение, записанное в `db/024:10-12`. Но тот, кто прочитал `lookup_id`, не знает второй половины кода.
- Его конверт заявки старое устройство не откроет: `openClaim` с чужим ключом падает, `depth/core/transfer.test.ts:65`, `transfer_move.ts:99`. Проверочные знаки не покажутся, одобрить нечего.
- Настоящий claim после этого отменяет перенос (`transfer.ts:210-217`).
- Ответный конверт запечатан на `wrap_pub` плюс вторую половину кода.

Остаток — сорвать перенос длиной 120 секунд при доступе к логам CDN. Захвата нет.

**F21 — ПОДТВЕРЖДЕНО, мелкое.** Маршрут состояния отвечает 404 на неизвестный код против 200 на существующий (`transfer.ts:266-271`) и `TRANSFER.countMiss()` не вызывает. Общий тормоз есть только у claim (`:200`). Значит, распределённый перебор обходит общий тормоз через этот маршрут. Практически это неосуществимо:
- пространство кода 32^9 ≈ 3,5·10^13 (`depth/core/transfer.ts:44,72`);
- на каждую догадку нужен Argon2id;
- предел на адрес 600 в час и 1500 в сутки (`rate_limit.ts:245-247`);
- приглашение живёт 120 секунд.

Это несогласованность защиты, а не пробитая защита.

### Опровержение F10–F15 (сторож, почта, метрики) — сырьё

Refuter report for F10–F15. I read everything from the xor.ad repo at 5884454 with `git show`. The file `relay/node/src/lib/moderation_watch.ts` has 134 lines at that commit, so some line numbers in the findings don't point at what they claim. I note this per finding.

**F10 — REFUTED (at most negligible).**
- Line numbers 153-158 don't exist; the file ends at line 134. The real comparison is in `verdictSince`, `moderation_watch.ts:70-76`, with the date built at :73. It is called at :110.
- `visible_at = now()` is set at `feed_verdict.ts:142`, and `lastLetterAt` comes from `Date.now()` (:83, :123). So the two times do come from different clocks.
- In practice it doesn't matter. The check is only reached when at least an hour has passed since the last letter (:110). It then asks "was there any verdict after the last letter". A skew of a few seconds only changes the answer for a verdict that landed within those few seconds of the letter. The node and Postgres on a box use the same clock. There is no realistic failure here.

**F11 — CONFIRMED, minor (a missing entry in the open-items list).**
- The memory is kept inside the process: `moderation_watch.ts:53,55`, set at :123.
- The code names this at :32-35, not :116-118 as cited: "Named, not fixed here — the same open item as С7's."
- `docs/watchdogs_RU.md:152-153` also says this.
- `docs/facts/open.tsv` at 5884454 has no row for it. I grepped for "памят|в процессе|С6|once"; the only near miss is `backup.silent.failure` (:156), which is about С7 not being deployed, not about per-process memory. So the "same open item" the code points to doesn't exist in the list.
- Impact: a restart or a pool of nodes sends one extra letter per face. That is bounded, so minor.

**F12 — CONFIRMED, minor.**
- The rule is `alerts.yml:94-95`: `> 9 * 60` with `for: 2m`.
- `SWEEP_FEED_QUEUE` runs every minute (`scheduled.ts:255-259`) and removes phrases past 10 minutes.
- A single phrase is over 540 s only from minute 9 until the sweep takes it, at some point between minute 10 and 11. `for: 2m` needs about minute 11 or later, so a lone stuck phrase never fires the alert. It only fires when phrases keep arriving so that the next-oldest is also past 9 minutes.
- The test at `alerts.test.yml:208` feeds a constant `600x10`, a state the sweep makes impossible. So the test doesn't guard this case.
- Mitigating: the alert is `info`, the boxes have no Alertmanager, and the real path is the node's letter.

**F13 — CONFIRMED, design defect (minor to moderate).**
- `mailer.ts:69` is a timeout comment, not the transport check. The real check is `sendModerationStopped`, `mailer.ts:527`: `if (config.mail.transport === "none") return false;`.
- In that case `sent=false`, so `lastLetterAt` is not set (:122-125), `last` stays undefined and the stop counts as news again (:108). The result is an `error` log (:126) every minute while the queue is stopped.
- The same happens when `DSA_ESCALATION_EMAILS` is empty (`dsa_watchdog.ts:35-42`: no addresses, `sent=false`).
- When mail is down, `deliver` returns false (`mailer.ts:794-797`) and there is no backoff, so it retries every minute.
- Per the header comment (:17-20), every phrase currently ages to the ceiling, so the queue reads as "stopped" regularly. This will be noisy.

**F14 — CONFIRMED, minor.**
- `deliver` hard-codes `kind: "dsa"` (`mailer.ts:792,795`).
- It is called for the support digest (:319), backup stale (:499), moderation stopped (:530), job tombstone (:540), arrival unsent (:563) and the night summary (:587).
- The only alert on this metric (`alerts.yml:163`) filters on `result` only, so no alert is lost. The label is simply wrong.

**F15 — CONFIRMED, minor (visibility gap).**
- `PRUNE_INVITES` (`scheduled.ts:284-304`) deletes expired invitations, including decided ones that were never picked up, and only writes `log(... { deleted })`. There is no counter.
- `transfer.ts:260-263` returns 429 without an `inc`. The other 429s in the same file do count, as `relay_transfer_total{result:"address_limited"|"paused"}` at :85, :171 and :178.
- Nothing breaks. It is observability only.

**Summary:** F10 refuted. F13 is a design defect. F11, F12, F14 and F15 are minor. Wrong line citations: F10 (153-158), F11 (116-118, should be 32-35) and F13 (`mailer.ts:69`, should be :527).

### Опровержение F4, F17, F19, F25–F31 (документы) — сырьё

I tried to refute F4, F17, F19 and F25–F31. Six stand, one stands as a minor design note, three are refuted.

Everything was read from the worktree par-B25. Its tree differs from 5884454 only in depth/ink/app.ts, screens.ts and live.node-test.ts (checked with `git diff --stat 5884454 HEAD`). The app.ts line numbers below come from the worktree.

**F4 — CONFIRMED, minor (stale comment).**
- depth/ink/move.ts:7-10 says "the state route shares its per-address allowance with the claim — 60 an hour (… TRANSFER_CLAIM_LIMITS)".
- depth/core/transfer_move.ts:91-92 says the same.
- The node has its own buckets: relay/node/src/lib/rate_limit.ts:245-248 sets `TRANSFER_STATE_LIMITS` to 600/HOUR and 1500/DAY, and relay/node/src/routes/transfer.ts:259 uses `checkAll(TRANSFER_STATE_LIMITS, …)`.
- The finding's line numbers for rate_limit.ts (313-316) are wrong; the substance holds.

**F17 — CONFIRMED, minor (line references drifted).**
- chat_RU:1105 and chat_EN:1118 cite `transfer.ts:275`. Line 275 is the `claim_envelope` branch. `reply_envelope` is handed out at transfer.ts:286-287.
- chat_RU:1396 and chat_EN:1415 cite `identity.ts:592` for re-arming `first_pin_grant_at`. Line 592 opens the same-device transaction. The `UPDATE identities SET first_pin_grant_at = now()` sits about 20 lines further down.

**F19 — CONFIRMED as a fact, minor design note. The doc sentence itself is not false.**
- The salt is constant: depth/core/transfer.ts:47 `const SALT = text(DOMAIN)` and :97 `salt: SALT`.
- So one sweep of all 2^45 codes covers every transfer. chat_RU:1157 only says an offline search "превращается в сотни тысяч лет". That matches one single-core sweep: 2^45 × 0.1 s ≈ 111,000 years. It never says the cost is per transfer.
- The same `secret` is used twice: as a raw AES-GCM key (transfer.ts:118) and as HKDF input (transfer.ts:204, domain-separated by `info`).
- The impact is bounded. The reply is also sealed to `wrap_pub` (transfer.ts:20, 233), so `secret` alone does not yield the long-lived key.

**F25 — CONFIRMED, contradiction.**
- depth-client_RU:32 says «Нет `depth move`»; EN:36 says the same.
- open.tsv:167 says «не построен depth move».
- But depth/ink/move.ts exists (MoveOut/MoveIn), depth/ink/main.ts:24 routes `"move"`, and commit 2a0fcb8 ("Let depth move an identity…") is an ancestor of 5884454.

**F26 — CONFIRMED, defect, already recorded.**
- en.json:170 "…and you set a new PIN." and ru.json:170 «…и вы зададите новый ПИН.» are shown when `client.registered` (app.ts:327).
- The same-device path skips the PIN and goes straight to `newPaper` (app.ts:344-346, comment "the old PIN opens it again").
- The same defect is already in .parallel/xor.ad/owner.md:3, point (в) under B20. This is a duplicate, not a new finding.

**F27 — CONFIRMED, contradiction.**
- depth-client_RU:280 shows `ПИН этого устройства` before the code, and RU:295 says «ПИН спрашивается до кода». EN:293 and EN:308 say the same.
- The code does it the other way. MoveIn (move.ts:236-238) takes the nine characters, then the check line, then waits. The PIN is set afterwards through `client.firstPin` (app.ts:223).
- protocol_RU:143 agrees with the code: `POST /vault/init` sets the first PIN "после переноса".

**F28 — REFUTED.**
- The entry is at open.tsv:159, not 174; the file has 173 lines.
- It reads «в depth ждущей беседы с очередью пока нет; в depth ядро построено 26.09.2026 (…pending.ts…), экран — открыт».
- That is clumsy but consistent: the core is built and the screen is not, so there is no pending conversation for a user in depth yet.

**F29 — REFUTED on substance, the wording is loose.**
- `HeldKey` (transfer.ts:171-195) is a copy of the long-lived key, wrapped in memory under a key the process generates. It is not the wrapped keys the lock needs.
- depth.lock (open.tsv:166) is about unlocking via `POST /vault/share`. For that, «завёрнутой копии ключей» means keys wrapped under the vault key (PIN + node share). None exists.

**F30 — REFUTED (naming, not a contradiction).**
- scripts/depth.sh:6-8 documents `join` as "an identity taken over … (depth move, §8.2)".
- depth.sh:20 maps it explicitly: `join) args=(move)`.
- It is a wrapper alias. main.ts and the spec both say `move`.

**F31 — CONFIRMED, minor contradiction.**
- The §3 table at depth-client_RU:244 and EN:256, plus §3.6 (RU:359/366, EN:374/382), specify a `depth reissue` command with no marker.
- The status block at RU:31 and EN:35 says «отдельной команды `depth reissue` нет и без тома быть не может».
- So the spec prescribes a command that the status block calls impossible.


## Сводка ведущего

31 находка после слияния дублей (список — «Сведённые находки» выше). Опровергнуто 7, подтверждено 24,
из них F26 — повтор того, что уже в `owner.md` (B20). Критичных нет: «критично» линзы
«Эксплуатация» по F1 опровергатель снизил до дефекта дизайна — личность переезжает, ломается
экран нового устройства, и выход из процесса оставляет её бумажному коду.

**Опровергнуто (в доклад не идёт):** F6 (ack в отлучке недостижим — approve в отлучке не проходит),
F10 (часы процесса и БД — расхождение в секунды при проверке раз в час), F20 (lookup_id в URL —
сознательно, db/024:10-12; без второй половины кода захвата нет, остаётся срыв переноса), F24
(очередь реплик ещё не подключена к экрану — не утечка, а незаведённый API; экран — B25), F28
(open.tsv chat.queue.ceiling неловок, но не противоречив), F29 (HeldKey — не та завёрнутая копия,
о которой depth.lock), F30 (`join` — обёртка, документирована в depth.sh:6-8).

**Неверные ссылки линз** (суть держится, номера нет): moderation_watch.ts на 5884454 — 134 строки,
ссылки на :116-118 и :153-158 указывают мимо (ПРОВЕРЕНО `wc -l`; нужное — :32-35, :70-76);
mailer.ts:69 — это не проверка транспорта, она на :527 (ПРОВЕРЕНО `sed -n 527p`); rate_limit.ts:313-316 —
предел состояния на :245-248; open.tsv:174 — файл из 173 строк (ПРОВЕРЕНО `wc -l`).

### Подтверждено, по уровням

**Дефект дизайна**
- F1 depth: новое устройство после потерянного ответа на ack или наложения опросов остаётся на
  экране кода с ошибкой; каждые 5 с «approved without a reply». ПРОВЕРЕНО чтением day58:
  `depth/core/transfer_move.ts:175` бросок, `:191` ack без перехвата, `depth/ink/move.ts:48` голый setInterval.
- F2 depth: старое устройство после потерянного ответа на approve снова показывает код вместо
  «Личность переехала». ПРОВЕРЕНО: `depth/ink/move.ts:36` — в `endings` нет `approved`.
- F3 depth: SyntaxError из разбора заголовка ответа несёт сырые ESC/BEL в строку ошибки, а `fail`
  выводит её без `plain`. ПРОВЕРЕНО: `docker run node:24.21.0-alpine` — сообщение содержит ESC и BEL
  (`true true`); `depth/ink/app.ts:89` — `fail` без `plain`. Опровергатель ставит «мелкое» (нужен
  злонамеренный узел), линза «Безопасность» — дефект; ведущий оставляет дефект: узел в модели
  угроз проекта противник (parts.ts `plain`, §8.13).
- F13 relay: письмо С6 при `transport none` или пустом списке адресов пишет error раз в минуту,
  при лежащей почте повторяет без отступа. НЕ ПРОВЕРЕНО ведущим (опровергатель: `mailer.ts:527`,
  `moderation_watch.ts:122-126`).

**Противоречие**
- F25 docs: depth-client_RU:32 / EN:36 и open.tsv:167 говорят, что `depth move` нет. ПРОВЕРЕНО `sed -n 32p`.
- F27 docs: depth-client_RU:295 «ПИН спрашивается до кода» — код и протокол задают ПИН после
  переноса. ПРОВЕРЕНО `sed -n 295p`.
- F31 docs: таблица §3 depth-client велит `depth reissue`, статус той же спеки говорит, что без тома
  её нет. НЕ ПРОВЕРЕНО ведущим.
- F5 api: openapi у approve — `"204": Done.`, код отвечает 200 `{state, session_id}`. ПРОВЕРЕНО
  `git show 5884454:docs/api/openapi.yaml`.
- F7 docs: неподтверждённый ответ живёт 1–2 ч после истечения, протокол предела не называет;
  комментарий scheduled.ts:282-283 устарел. НЕ ПРОВЕРЕНО ведущим.
- F26 locales: restore.introHere обещает новый ПИН — уже в owner.md (B20), здесь не дублируется.

**Мелкое**
- F4 комментарии depth про «60 в час общих с claim» устарели после отдельного предела состояния.
- F8 уборка приглашений — Seq Scan: индекс частичный. ПРОВЕРЕНО: `024_session_invites.sql:63-64`
  `WHERE decided_at IS NULL`; EXPLAIN — у двух агентов, ведущим не повторён.
- F9 профиль: фразы и quota разными запросами, расхождение на единицу.
- F11 память С6 в процессе, строки в open.tsv нет.
- F12 тревога ModerationQueueStopped `> 540 for: 2m` почти не срабатывает; тест тревоги кормит
  недостижимое состояние.
- F14 все письма считаются как `kind="dsa"`.
- F15 нет метрик: ответ, убранный без ack; 429 на опросе состояния.
- F16 опрос не учитывает Retry-After.
- F17 ссылки на строки в chat_RU/EN уехали (transfer.ts:275, identity.ts:592).
- F18 разбор ответного конверта без проверки длины — невнятная ошибка на усечённом.
- F19 постоянная соль Argon2id: оценка перебора — на все переносы разом; одна фраза в §8.2.
- F21 маршрут состояния не считает промахи в общий тормоз claim (практически неосуществимо).
- F22 `recovery.ts` экспортирует JWK с `d` в строку.
- F23 ПИН остаётся в состоянии экрана переноса.

## Нарезка на задачи

| # | Что | Находки | Уровень | Цена |
|---|---|---|---|---|
| 1 | depth move: устойчивость исходов — перехват ack, «approved» без конверта после seat = прибыл, защита опроса «в полёте» и тайм-аут fetch, `approved` на старом устройстве → «Личность переехала», учёт Retry-After | F1, F2, F16 | дефект | ~1 ч, depth/core/transfer_move.ts, depth/ink/move.ts, client.ts; тесты с подделкой узла |
| 2 | depth: ошибки на экран только через `plain`; разбор заголовка ответа — фиксированная ошибка и проверка длины | F3, F18 | дефект | ~30 мин, app.ts, transfer.ts; тест с ESC в заголовке |
| 3 | С6: молчать при `transport none`/без адресов, отступ повторов, строка в open.tsv о памяти процесса, метка `kind` у писем, правило тревоги | F13, F11, F14, F12 | дефект + мелкое | ~1 ч, moderation_watch.ts, mailer.ts, alerts.yml(+test), open.tsv |
| 4 | Узел переноса: метрики (без ack, 429 состояния), промахи состояния в общий тормоз, индекс уборки новой миграцией, предел жизни ответа в протоколе и комментарии, openapi approve 200 | F15, F21, F8, F7, F5 | противоречие + мелкое | ~1 ч, transfer.ts, scheduled.ts, db/0xx, protocol_RU/EN, openapi.yaml |
| 5 | Документы depth и спеки: статус `depth move`, порядок ПИН/код, пометка `depth reissue`, ссылки на строки, фраза о соли, комментарии о пределе | F25, F27, F31, F17, F19, F4 | противоречие | ~40 мин, depth-client_RU/EN, chat_RU/EN, open.tsv, move.ts, transfer_move.ts |
| 6 | Гигиена ключей и ПИНа в depth | F22, F23 | мелкое | ~20 мин, recovery.ts, move.ts |
| 7 | Профиль одним снимком | F9 | мелкое | ~20 мин, identity.ts |
