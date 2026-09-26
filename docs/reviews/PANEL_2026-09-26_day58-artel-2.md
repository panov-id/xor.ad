# Панель ревью 26.09.2026, вторая — что артель влила в day58 после первой

**Дата:** 26.09.2026, 11:35–12:05. **Ведущий:** сессия xor-ad-ae (задача B43 артели).
**Что ревьюили:** `git diff 01bd685..0cc0dd4 -- relay/node depth relay/local scripts` — 33 файла,
+1281 / −141, 20 коммитов: B27–B37 и реестры (устойчивость depth move, plain для ошибок, publicHalf,
счёт промахов состояния и метрики переноса, индекс уборки 059, письмо о решении по уведомлению
db/058, виды писем, сторож С6, уборщик личностей, тревоги и их тесты, скрипты). B38–B42 в диапазон
не вошли — второй заход по слову координатора.
**Воспроизвести:** `git diff 01bd685..0cc0dd4 -- relay/node depth relay/local scripts`; файлы —
`git show 0cc0dd4:<путь>`.
**Линзы:** Безопасность, Данные и СУБД, Протоколы и стандарты, Эксплуатация, Согласованность —
пять независимых агентов параллельно; затем четыре опровергателя по предметам, правило «не
уверен — опровергнуто». Ведущий — автор части кода диапазона (B27, B28, B31), поэтому сам не
ревьюил: только сводил и проверял.

Статусы ниже: **ПРОВЕРЕНО** — ведущий сверил сам инструментом (указано чем); **НЕ ПРОВЕРЕНО** —
держится на линзе и опровергателе. Сырьё агентов не редактировалось.

## Сырые находки линз

### Линза «Безопасность» — сырьё

Линза «Безопасность», коммит 0cc0dd4 (дерево par-B43 = 0cc0dd4, проверено `git rev-parse`). Критичных находок нет. Всё ниже я сам прочитал в файлах на этом коммите. Ничего не исполнял: ни одну находку не воспроизводил в контейнере.

**1. Design defect: старое устройство принимает «approved» от узла, даже если само ничего не одобряло.**
- `depth/ink/move.ts:281`: `if (next === "approved") return onMoved();` срабатывает на любом опросе.
- `depth/core/transfer_move.ts:133` записывает `this.last` из ответа узла, а строка 117 после этого замораживает его навсегда.
- Раньше экран `MovedAway` показывался только после собственного `approve()` с ответом 200.
- Последствие: сбойный или враждебный узел отвечает `approved` на `claimed`, и человек видит «переехало». На `MovedAway` есть только `process.exit(0)` (`move.ts:243-251`), а в терминальном клиенте ключ живёт в процессе. После выхода личности на этом устройстве больше нет, хотя перенос никто не подтверждал.
- Правка: в `Departure` завести флаг `approveSent`, выставлять его в начале `approve()`, а «approved» из опроса принимать только при нём. Иначе показывать ошибку.

**2. Minor: время из Retry-After ничем не ограничено сверху.**
- `depth/core/client.ts:135` принимает любое конечное число больше нуля. `transfer_move.ts:129,220` превращают его в `quietUntil`.
- `Retry-After: 99999999` от узла или прокси замораживает экран переноса на неопределённый срок: `state()` отдаёт `last`, код давно истёк, а экран об этом не знает.
- Правка: `Math.min(retryAfter, 120)`, то есть не дольше жизни кода.

**3. Minor: зависшие запросы копятся после таймаута.**
- `transfer_move.ts:92-98`: `Promise.race` отпускает ожидание через 15 с, но сам `fetch` не прерывается.
- Защита `out` в `useEvery` (`move.ts:48-60`) снимается, как только истёк таймер. Поэтому на медленном узле каждые 15 с начинается новый запрос, а старые висят и тратят лимит 600/ч.
- Кроме того, `ask()` после `approve` (`move.ts:159-160`) вызывается в обход `out`.
- Правка: передать `AbortSignal.timeout(timeoutMs)` в `client.request`.

**4. Minor: текст причины решения хранится без необходимости.**
- `relay/node/src/routes/dsa.ts:321,360` пишут `facts` в `decision_letter_facts`.
- После успешной отправки колонку никто не чистит: ни `dsa.ts:382`, ни `notice_notify.ts:876`. По комментарию `db/058:10-17`, текст может описывать обжалованный контент, и живёт он год вместе со строкой.
- Правка: в обоих `UPDATE ... SET decision_sent_at = now()` добавить `decision_letter_facts = NULL`.

**5. Contradiction: письма уходят с опозданием на месяцы после включения почты.**
- `dsa.ts:383-386`: при `transport=none` поле `decision_sent_at` остаётся NULL, а текст письма сохраняется.
- `retryDecisionLetters` (`notice_notify.ts:136`) пропускает такие строки, пока почта выключена. После включения почты он разошлёт все решения за год, вплоть до годовалых.
- `db/058:26-29` для старых решений рассуждает наоборот: «не новость никому».
- Правка: в `retryDecisionLetters` ограничить возраст, например `decided_at > now() - interval '7 days'`, или помечать отправленным при `none`.

**6. Minor: возможно двойное письмо уведомителю.**
- Отметка об отправке в маршруте идёт через `query` (`dsa.ts:382`), а `query` глотает ошибку. Если запись не прошла, повтор через `GRACE_SECONDS=300` (`notice_notify.ts:26`) отправит письмо второй раз.
- В SMTP-пути вообще нет таймаута: `relay/node/src/lib/smtp.ts:52`, `Deno.connect` без ограничения. Отправка, висящая дольше 5 минут, тоже даёт дубль. Касается только dev и Mailpit.
- Правка: в маршруте использовать `queryOrThrow`. Для SMTP добавить таймаут соединения.

**7. Minor: `session_id` не аутентифицирован.**
- `transfer_move.ts:229` сажает клиент в `answer.body.session_id`. Это поле не входит в AAD ответа: заголовок из `transfer.ts:225-229` содержит только `identity_id`, `long_pub` и `eph_pub`.
- Узел сессиями и так распоряжается, поэтому реальный выигрыш атакующего мал. Фиксирую как границу доверия.

**8. Minor: поиск открытой точки в pkcs8 без привязки к месту.**
- `depth/core/recovery.ts:83` ищет `POINT_TAG` по всему DER, включая байты `d`. Вероятность ложного совпадения около 2⁻⁴⁸ на позицию, и тогда `importKey` просто упадёт. Утечки нет, `der.fill(0)` в `finally` на месте.
- Правка: искать начиная с конца OCTET STRING с `d`, то есть с `at >= 7+32`.
- Резервный путь через JWK (строка 88) оставляет `d` строкой в памяти. Это принято решением координатора и явно записано.

**9. Minor: исключение `.claude/worktrees/` держится только на локальной настройке.**
- `scripts/check-docs-pairing.sh:171` пропускает этот каталог.
- Он скрыт только через `.git/info/exclude:11` (проверено `git check-ignore -v`), а не через `.gitignore`. Закоммиченный туда `*_RU.md` пройдёт мимо проверки парности.
- Правка: вынести правило в `.gitignore`.

**Не нашёл, где обрабатывается (это не дефект, а вопрос):**
- Свёртка IPv6 до /64 в лимитах. В `relay/node/src/lib/client_ip.ts` её не видно, а `TRANSFER_STATE_LIMITS` (`relay/node/src/lib/rate_limit.ts:245`) считаются по полному адресу. Для 404-оракула риск всё равно ничтожен: Argon2id на каждую попытку, 32⁹ вариантов, код живёт 2 минуты.

**Проверил, дефектов нет:**
- **Экранирование:** `plain` (`depth/ink/parts.ts:257`) режет CSI, OSC, C0/C1 и bidi-символы. Через `fail` (`depth/ink/app.ts:94`) проходят все `onError` экранов. `outcomeLine` выводит только числа. Метка заявителя идёт через `plain(label, 64)` (`move.ts:220`).
- **openReply:** граница `2+n+28` верна. Сообщения об ошибках фиксированные. Заголовок входит в AAD.
- **Почта:** адрес уведомителя проходит через `isEmail`, где `\s` не пропускает CRLF. В темах писем только `brand.name`. В логах `withoutAddresses` и id. В метках метрик только `kind` и `result`, персональных данных нет.
- **Скрипты:** `mktemp -d` и `trap`, пользовательский ввод в shell не попадает.
- **Прочее:** `pruneInvites` и индекс 059 в порядке. Сторож модерации: логирует только бренды.

### Линза «Данные и СУБД» — сырьё

DATA & DBMS lens, range 01bd685..0cc0dd4. I found nothing critical. There are 2 design defects and 5 minor items. Read-only: I edited nothing. The one experiment was a throwaway postgres:16 container, now removed.

**Checked and holding (the evidence is mine):**
- 059 is used by the sweep. `EXPLAIN` on 200k rows in postgres:16 gives `Limit -> Index Scan using session_invites_expiry_all`, Index Cond `expires_at < now()-1h`, then the pkey for the DELETE. Script: scratchpad/explain059.sh.
- 059 has no `CONCURRENTLY`, and that is acceptable. migrate_db.ts:83-95 runs each file inside a transaction, so `CONCURRENTLY` is impossible anyway. session_invites is small: rows live 2 min plus a 1–2 h tail.
- 058 does not rewrite the table. The column default is a constant, so the ADD COLUMN is metadata-only. Its backfill runs once, recorded in schema_migrations (migrate_db.ts:88-95). dsa_notices is at most a year of notices.
- No new code passes a timestamp from JS as a parameter. decision_sent_at, decided_at and the leases are all `now()` or copied column to column in SQL, so the microsecond loss does not apply.
- identity.ts:645-667 now reads the list and the quota in one statement, so one snapshot. `LIVE_PHRASE` (feed_limits.ts:43, `visible_at IS NOT NULL AND expires_at > now()`) is a subset of the list's WHERE (`visible_at IS NULL OR expires_at > now()`). `used` cannot disagree with the list.
- Lock order in transfer.ts matches §8.2: `vault_shares` then `session_invites` (transfer.ts:120/194, 384/386). The ack locks only the invite (324). pruneInvites (scheduled.ts:493-516) locks only session_invites rows, so it cannot close a cycle with them.
- Retention of `decision_letter_facts` is stated as 1 year with the notice row: SPEC_RU §6 (lines 432-435), limits.tsv:140 `dsa.records.retention`. Pruning goes by the notice's `created_at` (prune_dsa_records.ts:96-124).

**Design defects**

1. A notice decided in the gap between migration 058 and the new code gets no retry, and nothing reports it. 058:28-29 marks as sent only rows already decided when it runs. The old route, or any box still on old code during a rolling deploy, then decides a notice with `decision_sent_at` NULL and `decision_letter_facts` NULL. notice_notify.ts:148 filters `decision_letter_facts IS NOT NULL`, so the row is never retried. It also shows as unsent for ever, which misleads any future "unsent decision letters" gauge.
   - Point fix: in retryDecisionLetters, or a second statement in the next migration, mark `decided_at IS NOT NULL AND decision_letter_facts IS NULL AND decision_sent_at IS NULL` rows as sent (or as "unrecoverable").

2. Letters go out for old decisions once mail is switched on. With transport `none`, the route (dsa.ts:381-385) records nothing, and the retry returns at once (notice_notify.ts:409). Rows pile up with `decision_sent_at` NULL and their facts kept. When an environment gets Resend (staging, a restored backup), notice_notify.ts:422 has only a lower bound, `decided_at < now() - 300s`. Every past notifier then gets a letter, up to 8 attempts each.
   - Point fix: add an upper bound, for example `decided_at > now() - interval '7 days'`, or mark the row sent/skipped when the transport is `none`.

**Minor**

3. The purpose of the stored text ends at sending, but the text stays. 058's comment says the column exists "so it can be sent again", yet notice_notify.ts:449 and dsa.ts:384 set `decision_sent_at` and leave `decision_letter_facts` for the full year. For rejections this text was stored nowhere before 058.
   - Point fix: `SET decision_sent_at = now(), decision_letter_facts = NULL` in both places. The statement still keeps its own facts for upheld notices.

4. A silent write failure can send the letter twice. dsa.ts:384 and notice_notify.ts:449 use `query`, which returns null on error, not `queryOrThrow`. A lost "sent" mark means the letter goes again after the grace period or lease. This is at-least-once delivery; for a legal letter I'd make the failure loud, at least as a log line.

5. There is one more attempt than stated. The route's first send is not counted in `decision_attempts`, so a letter is tried 1 + 8 = 9 times against "до восьми раз" (SPEC_RU:433; notice_notify.ts:421, `decision_attempts < $3`).

6. The retry can block the night path. scheduled.ts:562-566 runs retryDecisionLetters between the arrival retry and sendNightPathSummaries. It throws on `rows === null` (notice_notify.ts:432), and a throw there now skips the night-path summary for that pass.
   - Point fix: wrap it in try/catch and log.

7. Re-running 058 by hand would be destructive. The backfill at 058:28-29 is idempotent only because the migration runner records it. Applied manually a second time after deploy, it would mark every letter still waiting for a retry as sent. Worth a comment, or guard it with `AND decision_letter_facts IS NULL`.

**Pre-existing, not introduced by this diff (I did not find where this is handled)**

8. The unfinished-signup deletion does not re-check its condition.
   - identity_sweeper.ts:415-424: the `doomed` CTE selects ids without a lock, and the DELETE is `WHERE id IN (doomed)`. Under READ COMMITTED, EvalPlanQual re-checks only `id IN`, not `signup_completed_at IS NULL`. A signup completed between the two steps would be deleted.
   - Point fix: repeat the predicate in the DELETE's WHERE.
   - This is general Postgres semantics; I did not reproduce it.

9. The deletion passes take locks in the reverse of the §8.2 order. identity_sweeper.ts:417-445 locks `identities` first and then cascades to sessions and vault_shares, while §8.2 (chat_RU.md:1125-1131) says shares, then sessions, then identity. §8.2 names only the yearly and catch-up passes, so these deletion passes are not covered by the rule. Collisions are unlikely: those identities are closed 30 days or never finished signup. `DELETE_BATCH=200` narrows the window.

**Not a finding**

- The fixture change in test-migration-upgrade.sh:124-129 (in_review becomes rejected with decided_at) does not weaken check_043 or check_006. 043 backfills regardless of status (043: `UPDATE ... WHERE arrival_sent_at IS NULL`), and check_006 reads only the m1 row.

### Линза «Протоколы и стандарты» — сырьё

PROTOCOLS & STANDARDS lens, reviewing 01bd685..0cc0dd4. I read every file at 0cc0dd4 with `git show`. I ran nothing.

**Defects**

1. **Design defect: the Art. 16(5) letter gives up for good after about 80 minutes and nothing signals it.**
   - Where: `relay/node/src/lib/notice_notify.ts:150` (`decision_attempts < $3`, MAX_ATTEMPTS=8) and `scheduled.ts:349-355` (the job runs every 10 minutes).
   - Problem: a Resend outage longer than about 80 minutes leaves the notice unsent forever. The last failure is counted as an ordinary `failed` (`:183`). There is no `gave_up` result, and no rule in `relay/local/observability/alerts.yml` reads `relay_dsa_decision_letter_total` (grep is empty). The arrival letter escalates (`arrival_unsent`); this one does not.
   - The comment at `notice_notify.ts:~130` ("After MAX_ATTEMPTS it stops and is counted") claims a signal that does not exist. Art. 16(5) says "without undue delay", and `docs/dsa/SPEC_EN.md` §6 says "up to eight times" with no end state.
   - Fix: count `{result:"gave_up"}` when `decision_attempts` reaches MAX, add an alert rule on it, and space attempts with backoff so they cover more than 80 minutes.

2. **Design defect (contradicts `docs/api/openapi.yaml` `/sessions/{lookup_id}` "503": Unavailable, and protocol §6 "Retry-After on 429 and 503"): a 5xx on the state poll ends the move on screen.**
   - Where: `depth/core/transfer_move.ts:132` and `:223` throw on any status other than 200/404/429.
   - Problem: `depth/ink/move.ts:286` turns that throw into `onError`. The comment on `ASK_TIMEOUT_MS` (F1/F2) says a lost ask "never ends a move", and a proxy 502 or a node 503 breaks that promise.
   - Fix: treat `status >= 500` like 429, returning `this.last` and honouring `retryAfter`.

3. **Design defect: the ack has no timeout, so a seated arrival can hang.**
   - Where: `transfer_move.ts:245`. `client.ts:122` calls `fetch` with no signal. If the ack stalls, `state()` never returns "approved", although `seated=true` has been set (`:237`).
   - Fix: run the ack through the same `Promise.race`/timeout as `askState`, or add an `AbortSignal.timeout`.

4. **Minor: a failed write of `decision_sent_at` sends the notifier a duplicate letter.**
   - Where: `relay/node/src/routes/dsa.ts:384` uses `query` (null on failure, silently). The retry job picks the row up about 5 minutes later (GRACE_SECONDS=300) and sends a second decision letter.
   - Fix: log or count when `query` returns null there (without throwing, because the decision is already committed).

5. **Minor (Art. 16(5)): with `transport="none"` the row stays unsent forever and can go out months late.**
   - Where: `dsa.ts:383-387` and `notice_notify.ts:~139` both short-circuit on `none`. Nothing marks the row, so if the transport is later enabled, every old decision is mailed as if it were new.
   - Fix: cap the retry by age (for example `decided_at > now() - interval '7 days'`) or mark rows when transport is `none`.

6. **Minor: Retry-After parsing covers only delay-seconds (RFC 9110 §10.2.3).**
   - Where: `depth/core/client.ts:131-135` uses `Number(header)`.
   - Problem: the HTTP-date form becomes NaN, and `Retry-After: 0` is dropped by `retry > 0`. Both fall back to 5 s (`transfer_move.ts:129,220`). The node only sends seconds (`routes/transfer.ts:~266`, openapi `schema: integer`), so today this is compliant for our node. A proxy in front could send a date.
   - Fix: `Date.parse` fallback.

7. **Minor (RFC 5915 §3 / RFC 5958 / WebCrypto): `publicHalf` trusts the embedded publicKey without checking it against `d`.**
   - Where: `depth/core/recovery.ts:84-90`.
   - What is correct: the tag `a1 44 03 42 00 04` and `slice(at+5, at+70)` give the 65-byte uncompressed point. Compressed points (`02`/`03`) and omitted ones fall back to JWK (`:89`).
   - Problem: a pkcs8 whose `[1]` does not match `d` would produce a safety code for a different key. Whether Deno and Node validate consistency on pkcs8 import is NOT VERIFIED. The blob is AES-GCM-wrapped with the user's own wrap key, so an attacker cannot easily craft one.
   - Fix: sign and verify a nonce with the private key against the derived public key once, or accept the risk explicitly in a comment.

8. **Contradiction, very minor: a comment was left in the wrong place.** `mailer.ts:769` ("One sender for both letters…") now sits above `MAIL_KINDS`, not above `deliver`.

**Checked, and consistent with the contract**

- **approve answers 200 with `{state, session_id}`.** `routes/transfer.ts:453` matches openapi `/approve` "200" (and its note about the old 204). `transfer_move.ts:146` freezes on 200 only.
- **State route: 404 `state_no_match` and 429 with `retry-after`.** `routes/transfer.ts:263,266,285` match `docs/protocol_RU.md:146` and `protocol_EN.md:154`. The miss does not feed the brake, as those docs describe.
- **`decision_letter_facts`.** Written in both decision branches (`dsa.ts:~320`, `~360`). Read only by the retry (`notice_notify.ts:148,157`). The receipt path never selects it, which matches SPEC §6 ("the receipt channel is not shown this text"). It is deleted with the notice row by `tools/prune_dsa_records.ts:124`.
- **Mail counter and the alert still fit together.** Changing `relay_mail_total` from `kind="dsa"` to per-kind labels keeps working with `alerts.yml:182`, because that rule does not filter on kind. The double count in `sendNoticeReceipt` is gone (`mailer.ts:~228`).
- **`openReply` bounds.** `transfer.ts:252-53` checks `2+n+12+16` (iv plus GCM tag), which is consistent with AES-GCM.

**Not found where described, or outside the diff**

- **RFC 2047 §2 (75-character limit on an encoded word).** `relay/node/src/lib/smtp.ts:32` writes one unfolded `=?UTF-8?B?…?=` for the whole subject, which breaks the limit with a Cyrillic brand name. This is unchanged in the diff and affects the SMTP (Mailpit) path only; Resend encodes the subject itself.
- **SPEC §6 (and Art. 16(6), which the SPEC cites) vs the letter text.** SPEC §6 says the letter states "whether automated means were used — as the decision actually was", and that "a person always decides" is no longer promised. `mailer.ts:~620` hardcodes "A person took this decision", and the new retry repeats it. This predates the diff; it is true today because the panel is operated by hand.
- **Art. 17 statement.** `dsa_statements.delivered_at` still has no retry. SPEC_EN.md:~408 says so openly, so it is a known gap, not a defect introduced here.

### Линза «Эксплуатация» — сырьё

OPERATIONS lens ("what happens at 3 a.m."): 01bd685..0cc0dd4. I read the diff plus relay/node/src/lib/{jobs,queue_metrics}.ts, routes/transfer.ts, depth/core/client.ts and docs/watchdogs_*.md at HEAD. I ran nothing: no promtool and no tests.

**1. Design defect: a decision letter is dropped after about 80 minutes, with no backoff and nothing left behind.**
- `notice_notify.ts:583-639` (`retryDecisionLetters`) runs on the fixed 10-minute cadence of DSA_NOTICE_NOTIFY (`scheduled.ts:~345`). The cap is `MAX_ATTEMPTS = 8` (`notice_notify.ts:23`), and an attempt is counted at the lease (`decision_attempts + 1` in the UPDATE).
- So a Resend outage longer than about 80 minutes loses the Article 16(5) letter for good.
- The arrival letter escalates at the same cap (`notice_notify.ts:102`). The decision letter only increments `relay_dsa_decision_letter_total{result="failed"}`, which has no alert (grep of alerts.yml: none), and nothing exports the given-up rows.
- `MailFailing` (`alerts.yml:182`) fires while mail fails. Once mail comes back, nothing tells the on-call that N letters were abandoned.
- Point fix: in `collectQueueMetrics`, export a gauge counting `decided_at IS NOT NULL AND decision_sent_at IS NULL AND decision_attempts >= MAX_ATTEMPTS`, and alert on it > 0. Optionally, gate the lease on `decided_at + backoff(attempts)`.

**2. Design defect: the new step can take the night path down with it.**
- `scheduled.ts:~341-346` runs `retryArrivalLetters` → `retryDecisionLetters` → `sendNightPathSummaries` in sequence.
- `retryDecisionLetters` throws on `rows === null` (`notice_notify.ts:610`). That includes "column missing" if the code ever runs ahead of db/058.
- When it throws, the night-path summary (the threat-to-life path) is skipped, the job backs off quadratically (`jobs.ts:190`) and ends in a tombstone.
- Point fix: wrap each step in its own try/catch and rethrow at the end.

**3. Contradiction: `reply_unacknowledged` also counts moves that succeeded.**
- `scheduled.ts:~314` calls every swept approved row with `reply_envelope` still set "a move that failed without a word".
- But the client swallows a failed ack after it is already seated (`depth/core/transfer_move.ts:~244-248`: `catch { this.acked = 0 }`), and it never sends the ack again.
- Every lost ack therefore lands in the counter as a failed move, so the metric overstates failures on a flaky network.
- Point fix: retry the ack on the next tick while `seated && acked !== 200`, or reword the metric and the comment as "reply not acknowledged".

**4. Minor: an ack that hangs holds the arriving screen.**
- `Arrival.state()` awaits the ack POST (`transfer_move.ts:~245`) with no timeout. `client.ts:123` is a bare `fetch` with no signal.
- `useEvery` skips while a call is out (`depth/ink/move.ts:~50-58`), so polling stops and `onArrived` is not called even though `seated = true`.
- On Node, undici's default 300 s header timeout caps this at about 5 minutes; I did not measure it.
- Point fix: race the ack with `ASK_TIMEOUT_MS`, the same way `askState` already does.

**5. Minor: a lost write re-sends the decision letter.**
- `dsa.ts:~384` runs `await query(UPDATE ... decision_sent_at = now())` without checking the result, and `query` returns null on error.
- If the DB blips after the letter left, there is no log line, and the retry sends the same letter again 5 minutes later (`GRACE_SECONDS`, `notice_notify.ts:26`).
- The same happens at `notice_notify.ts:627`: if the node dies after the send and before the UPDATE, the next lease sends it again.
- Sending twice is acceptable; doing it silently is not. Point fix: `log("error")` when the UPDATE returns null.

**6. Minor: switching mail on sends a backlog of old decisions.**
- With `transport=none`, the route never sets `decision_sent_at` (`dsa.ts:~383-387`), and the retry returns early (`notice_notify.ts:587`).
- A node later switched from none to smtp/resend then mails every decision taken while mail was off, 50 every 10 minutes, possibly months old.
- Point fix: in the route, set `decision_sent_at = decided_at` when the transport is none, as db/058 did for old rows.

**7. Minor: the invite sweep loses its count if a batch fails.**
- `pruneInvites` (`scheduled.ts:~142-164`) only calls `inc` after the loop.
- If a later batch throws, the rows already deleted by earlier batches are gone and never counted.
- Point fix: increment per batch.

**8. Minor: the backoff does not hold across nodes.**
- `moderation_watch.ts:454` keeps the `retry` map in process memory, and the job "runs on whichever node takes it" (`moderation_watch.ts:34-35`).
- On N nodes, each keeps its own backoff, so a mail server that is down is asked roughly N times as often as designed. It resets on restart, which is harmless.
- This is the same known open item as `lastLetterAt`. Record it next to that one rather than claim F13 is fully fixed.

**9. Minor: after the first stop, nothing is logged on a node without mail.**
- `moderation_watch.ts:499-509`: `saidNoRoad` is set once per process and cleared only when a road appears, which config never changes at runtime.
- So every later stop, of any brand, on such a node leaves no log line at all. The alert still covers it.
- Point fix: key it by `noRoad + brand`, or re-say it daily.

**10. Minor: `ModerationQueueStopped` now fires for every lone phrase.**
- `alerts.yml:104`: `max_over_time(...[5m]) > 540` for 2m.
- Until the moderator ships, every phrase ages to the ceiling (the comment at `alerts.yml:~88-95` says so). So every single post now opens an info alert, about 2 minutes after the ninth minute, and it resolves about 5 minutes after the sweep.
- That is one open/resolve pair per phrase. Previously it needed a sustained backlog.
- It is severity `info` and deliberately so. But say in the comment that it now flaps once per post, or add a `count_over_time`/`waiting` guard.

**11. Contradiction: the docs say an alert test is still open.**
- `docs/watchdogs_RU.md:186` and `docs/watchdogs_EN.md:191` say "`RecoveryBrakeOn` has no test — open".
- This diff adds that test (`alerts.test.yml:65-87`).
- Neither watchdogs doc mentions the decision-letter retry or `relay_dsa_decision_letter_total` (grep: none).

**Not found where handled (no defect, confirmed by reading):**
- The brake gauges are computed at scrape time (`queue_metrics.ts:206-208`), so the test's descending values are a possible state and the alert can clear.
- The alert test uses `stale` rather than `_`, which is the right way to model a series the node stops exporting.
- The ack route does null `reply_envelope` (`transfer.ts:~330`), so `unacked` does not count acknowledged rows.
- The Resend timeout is 20 s (`mailer.ts:51`), below the 300 s grace, so the route and the retry do not race.
- `DELETE_BATCH=200` × `MAX_BATCHES=500` caps a pass at 100 000 rows, inside the job lease.
- db/059 is a plain `CREATE INDEX`, so it locks writes while it builds. On a table of two-minute invites that is negligible.
- The `kind` relabel on `relay_mail_total`: the only alert (`alerts.yml:182`) uses `result!="sent"`, so dropping `kind="dsa"` breaks nothing in the repo. Dashboards outside the repo were not checked.
- The `check-docs-pairing` SKIP is now relative to the root, which is correct.

### Линза «Согласованность» — сырьё

Линза «Согласованность», диапазон 01bd685..0cc0dd4. Правок не вносил. Прогнал `check-facts-open`, `check-facts-limits` (473 сверки) и `check-facts-decisions` (183 решения): все три зелёные. Остальное проверено чтением и grep, живьём не исполнялось.

## Дефекты, от тяжёлых к мелким

1. **Противоречие: спецификации говорят, что старое устройство не опрашивает состояние после approve, а код после исправления F2 опрашивает.**
   - Код: `depth/ink/move.ts:160` — `.catch(() => ask())` после потерянного ответа на approve. `move.ts:91` — `approved` из опроса ведёт в `onMoved`. `depth/core/transfer_move.ts:118-121` — `Departure.state` идёт на `GET /sessions/:lookup_id`.
   - Документы утверждают обратное: `docs/protocol_RU.md:146` («Старое устройство после `approve` этот маршрут не опрашивает»), `docs/protocol_EN.md:154`, `docs/api/openapi.yaml:3435-3436`.
   - Правка: «не опрашивает, пока ответ на approve дошёл; потерянный ответ переспрашивает опросом (F2)».

2. **Противоречие: watchdogs называет `RecoveryBrakeOn` непротестированной, а тест есть.**
   - Документы: `docs/watchdogs_RU.md:186` и `docs/watchdogs_EN.md:191` — «теста в `alerts.test.yml` нет — открыто».
   - Тесты: `relay/local/observability/alerts.test.yml:276-300`, два случая (B37, коммит 09d55e2). Фраза устарела в том же диапазоне.
   - Правка: убрать хвост «— открыто».

3. **Противоречие: описание С6 не знает о новой форме тревоги.**
   - Код: `alerts.yml:99-100` теперь считает `max_over_time(...[5m]) > 540 for 2m` (F12).
   - Документы: `docs/watchdogs_RU.md:138-140` и `EN:143-146` говорят «старейшей больше 9 минут дольше 2 минут». Там же обоснование «на десятой уборщик уже снял» — для правила по пику оно больше не держит порог.
   - Ещё одно следствие: summary тревоги (`alerts.yml:104`) теперь печатает пик за 5 минут, а не текущий возраст. В тесте фраза уже снята, а сводка пишет «11m 0s» (`alerts.test.yml:233`).
   - Правка: одна фраза в обеих версиях.

4. **Противоречие: протокол назвал предел жизни неподтверждённого ответа, а openapi — нет.**
   - Протокол: `protocol_RU:146` и `EN:154` называют 1–2 часа, `reply_unacknowledged` и `state_no_match` (F7/F15).
   - openapi: `openapi.yaml:3435` говорит «repeated on every poll until … ack» без границы. У 404 на `:3452` не сказано, что промах не идёт в тормоз.
   - Правка: дописать в openapi ту же фразу.

5. **Мелкое: комментарий ссылается на снятый пункт open.tsv.**
   - Код: `relay/node/src/lib/identity_sweeper.ts:72` — «(open.tsv relay.sweeper.flaky)».
   - Реестр: строку `relay.sweeper.flaky` из `docs/facts/open.tsv` удалил этот же диапазон, grep по репозиторию находит только этот комментарий.
   - Правка: «(было relay.sweeper.flaky, закрыт этим DELETE_BATCH)».

6. **Мелкое: open.tsv ссылается на коммит, которого нет в истории day58.**
   - Реестр: `docs/facts/open.tsv:170` (`depth.socket.rekey.flaky`) — «с 712f86d тест печатает трассу».
   - История: `git merge-base --is-ancestor 712f86d 0cc0dd4` → нет, коммит лежит на `worktree-par-B24`. В day58 это 0159469.
   - Правка: заменить хеш на 0159469.

7. **Мелкое: шапка сторожа не называет новый пункт open.tsv.**
   - Код: `relay/node/src/lib/moderation_watch.ts:33-35` — «the same open item as С7's». Такого пункта у С7 не было, это и была находка F11.
   - Реестр: пункт теперь есть, `relay.watch.process.memory` (`open.tsv:171`). В `watchdogs_RU:152` и `EN:161-162` его имени тоже нет.
   - Правка: назвать пункт в комментарии и в обеих версиях watchdogs.

8. **Мелкое: комментарий обещает счёт исчерпания, которого код не делает.**
   - Код: `relay/node/src/lib/notice_notify.ts:130-131` — «After MAX_ATTEMPTS it stops and is counted». На деле считается каждая неудача, `:183` `failed`. Отдельного счёта «повторы кончились» нет: строка просто перестаёт выбираться по `decision_attempts < $3`.
   - Спека: `docs/dsa/SPEC_RU.md:432-434` / `EN:451-453` про счёт не говорит, с ней противоречия нет.
   - Правка: поправить комментарий или добавить `inc({result:"exhausted"})`.

9. **Мелкое: в спеке depth строка `depth device` осталась без пометки.**
   - Реестр: `open.tsv` `depth.restore` говорит «нет отдельной команды depth device — код переноса отсюда даёт пункт «я»».
   - Спека: `docs/depth-client_RU.md:243`, `EN:255` и §3.3 (`RU:328`, `EN:342`) подают `depth device` как команду без пометки. Строку `depth reissue` рядом пометили (F31).
   - Правка: та же пометка «пока тома нет — пункт «я»».

10. **Мелкое: решения кворума не записаны в `decisions.tsv`.**
    - Решения есть в тексте: промахи опроса состояния не идут в общий тормоз (кворум B30, 3:0 — `relay/node/src/routes/transfer.ts:275-283`, `protocol_RU:146`), и запасной путь `publicHalfByJwk` (решение координатора, `depth/core/recovery.ts:86-89`).
    - В `docs/facts/decisions.tsv` за диапазон добавлено только `dsa.2026-09-26.decisionletter`. Отклонённые варианты B30 названы только в комментарии кода.
    - Правка: заголовок «решено кворумом» в protocol §, затем строка в реестре.

## Проверено, расхождений нет
- **limits.tsv против кода.** `transfer.state.hour/day` 600/1500 = `rate_limit.ts:245-248`, `transfer.claim.*` 60/200 = `:230-233`. «48 из 600» в `move.ts:7-11` сходится с 2×24 опроса. Комментарии про «60 в час» (F4) исправлены в `move.ts` и `transfer_move.ts:127-129`, других в depth и в коде узла grep не нашёл.
- **TransferBrakeOn.** Имя, выражение, `for: 1m` и `warning` совпадают в `alerts.yml:144-150`, в тесте `:250-274` и в watchdogs RU/EN. Датчик отдаёт `queue_metrics.ts:208`.
- **openapi approve.** 200 `{state, session_id}` (`openapi.yaml:3394-3405`) совпадает с узлом (F5).
- **Повтор письма о решении.** db/058, SPEC RU/EN, openapi `:1492` и `notice_notify.ts` (`MAX_ATTEMPTS = 8`) говорят одно. Пара RU/EN совпадает.
- **Документы depth и chat.** Порядок ПИН/код (F27) и статус `depth move` (F25) исправлены в обеих версиях depth-client. Вход `scripts/depth.sh join` → `move` сходится с `depth/ink/main.ts:24`. Ссылки на строки в chat заменены на имена функций (F17), фраза о соли (F19) есть в обеих версиях.
- **Метки почты.** `MAIL_KINDS` в `mailer.ts` покрывают все вызовы `deliver`. Старых `kind="dsa"` и `"dsa mail failed"` вне протоколов ревью не осталось.
- **Индекс уборки.** db/059 и `pruneInvites` (`scheduled.ts:140-165`) говорят одно, имя задачи `prune_session_invites` совпадает.

## Искал и не нашёл
- `ASK_TIMEOUT_MS` (15 с), `MOVE_POLL_MS` и `KEYS_AHEAD` не упоминаются ни в docs, ни в limits.tsv. Противоречием это не считаю: это технические параметры клиента.
- Документа, который перечисляет метрику `relay_dsa_decision_letter_total`, нет, тревоги на неё тоже нет. Её неудачи покрывает `MailFailing` через `relay_mail_total{kind="notice_decision"}`.

## Сведённые находки (ведущий, до перепроверки)


Диапазон 01bd685..0cc0dd4 (relay/node, depth, relay/local, scripts). Линзы: Б безопасность, Д данные, П протоколы, Э эксплуатация, С согласованность.

G1 [Э1, П1, С8] relay: письмо о решении (ст. 16(5) DSA) бросается навсегда после 8 попыток по 10 мин (~80 мин): notice_notify.ts MAX_ATTEMPTS=8, `decision_attempts < $3`, scheduled.ts задача раз в 10 мин; нет счёта «исчерпано», нет тревоги на relay_dsa_decision_letter_total; комментарий notice_notify.ts:~130 «stops and is counted» обещает несуществующий сигнал.
G2 [Д2, Э6, П5, Б5] relay: при transport none решение не помечается отправленным (dsa.ts:~383-387), повтор выходит сразу (notice_notify.ts); после включения почты уходят письма о давних решениям — верхней границы по возрасту нет.
G3 [Д1] relay: уведомление, решённое между миграцией 058 и новым кодом (или старым кодом при поочерёдном выкате), остаётся с decision_letter_facts NULL — повтор его не берёт (notice_notify.ts:~148 `decision_letter_facts IS NOT NULL`), навсегда «не отправлено».
G4 [Э2, Д6] relay: retryDecisionLetters бросает на rows === null (notice_notify.ts:~432/610) и идёт перед sendNightPathSummaries (scheduled.ts) — бросок пропускает ночную сводку (путь угрозы жизни).
G5 [Э5, П4, Д4, Б6] relay: отметка decision_sent_at через `query` без проверки (dsa.ts:~384, notice_notify.ts:~449/627) — сбой записи молча даёт второе письмо; у SMTP нет тайм-аута соединения (smtp.ts:52).
G6 [Д3, Б4] relay: decision_letter_facts не обнуляется после отправки (dsa.ts, notice_notify.ts), живёт год.
G7 [Д5] relay: первая отправка маршрута не в decision_attempts — всего 1+8=9 попыток против «до восьми раз» (SPEC_RU:433).
G8 [Д7] relay: бэкфилл db/058:28-29 при ручном повторе пометит ждущие повтора письма отправленными.
G9 [Б1] depth: старое устройство принимает «approved» из опроса, даже если само approve не отправляло (move.ts:~281/91 `if (next === "approved") return onMoved()`, transfer_move.ts:~117,133) — сбойный/враждебный узел показывает «переехало», в терминале остаётся только выход.
G10 [П2] depth: ответ 5xx на опрос состояния бросает (transfer_move.ts:~132, ~223) → onError (move.ts:~286), хотя openapi /sessions/{lookup_id} знает 503 и протокол §6 — Retry-After на 503.
G11 [П3, Э4] depth: ack без тайм-аута (transfer_move.ts:~245, client.ts:122-123 fetch без signal) — пересаженное устройство может зависнуть, onArrived не наступает.
G12 [Б3] depth: askState отпускает ожидание по тайм-ауту, но fetch не прерывается — зависшие запросы копятся; ask() после approve (move.ts:~159-160) в обход защиты «в полёте».
G13 [Б2] depth: Retry-After не ограничен сверху (client.ts:135, transfer_move.ts:~129,220) — «Retry-After: 99999999» замораживает экран.
G14 [П6] depth: Retry-After только в секундах; дата и 0 теряются (client.ts:131-135).
G15 [Э3] relay/depth: метрика reply_unacknowledged (scheduled.ts:~314) называет «провалом» и удачные переносы: клиент не повторяет потерянный ack (transfer_move.ts:~244-248).
G16 [П7, Б8] depth: publicHalf верит встроенной точке без сверки с d; поиск POINT_TAG по всему DER без привязки к месту (recovery.ts:~83-90).
G17 [Б7] depth: session_id ответа узла не входит в AAD конверта (transfer_move.ts:~229).
G18 [Э7] relay: pruneInvites считает удалённое только после цикла — сбой пачки теряет счёт уже удалённого (scheduled.ts:~142-164).
G19 [Э8, Э9, С7] relay: карта повторов С6 в памяти процесса (moderation_watch.ts:~454); saidNoRoad один раз на процесс (:~499-509); шапка сторожа и watchdogs не называют пункт relay.watch.process.memory (moderation_watch.ts:33-35, watchdogs_RU:152/EN:161).
G20 [Э10, С3] observability: ModerationQueueStopped по пику за 5 мин срабатывает на каждую одиночную фразу (alerts.yml:~99-104); watchdogs_RU:138-140/EN:143-146 описывают прежнее правило; summary печатает пик.
G21 [Э11, С2] docs: watchdogs_RU:186/EN:191 «RecoveryBrakeOn — теста нет, открыто», а тест есть (alerts.test.yml).
G22 [С1] docs: protocol_RU:146/EN:154 и openapi:3435-3436 «старое устройство после approve не опрашивает», а код после F2 опрашивает при потерянном ответе.
G23 [С4] docs: openapi не называет предел жизни неподтверждённого ответа и что промах состояния не идёт в тормоз (openapi:3435, 3452).
G24 [С5] relay: комментарий identity_sweeper.ts:72 ссылается на снятый пункт open.tsv relay.sweeper.flaky.
G25 [С6] docs: open.tsv:170 depth.socket.rekey.flaky ссылается на 712f86d, которого нет в day58 (там 0159469).
G26 [С9] docs: depth-client_RU:243/EN:255 и §3.3 подают `depth device` как команду без пометки.
G27 [С10] docs: решения (промахи состояния вне тормоза — кворум B30; publicHalfByJwk — решение координатора) не записаны в decisions.tsv.
G28 [Б9] scripts: исключение .claude/worktrees/ в check-docs-pairing.sh:171 держится только на .git/info/exclude, не в .gitignore.
G29 [П8] relay: комментарий mailer.ts:769 «One sender for both letters…» стоит над MAIL_KINDS, а не над deliver.
G30 [Д8] relay (до диапазона): удаление незавершённых регистраций не перепроверяет signup_completed_at IS NULL в DELETE (identity_sweeper.ts:~415-424).
G31 [Д9] relay (до диапазона): проходы удаления берут блокировки identities → sessions → vault_shares, обратно §8.2 (identity_sweeper.ts:~417-445).

## Опровержения

### Опровержение G1–G8 (письма DSA) — сырьё

Из восьми находок три подтверждены (G1, G3, G5), одна подтверждена лишь частично (G4, мелочь), четыре опровергнуты (G2, G6, G7, G8). Критичных нет.

Проверял чтением кода в рабочей копии par-B43: HEAD там равен 0cc0dd4 (`git rev-parse --short HEAD`), дерево чистое. Код не запускал, контейнер Postgres не поднимал.

**G1 — ПОДТВЕРЖДЕНО, дефект замысла.**
- Порог попыток: `relay/node/src/lib/notice_notify.ts:23` `MAX_ATTEMPTS = 8`, условие отбора `decision_attempts < $3` на `:150`.
- После неудачи аренда сбрасывается в `now()` (`:184`), а задача перезапускается раз в 10 минут (`relay/node/src/lib/scheduled.ts:349-356`). Письмо, не ушедшее примерно за 75–85 минут (5 минут `GRACE_SECONDS` плюс 8 проходов), больше не повторяется.
- Отдельного счёта «исчерпано» нет. Эскалации нет, в отличие от письма о поступлении (`:102`).
- В `relay/local/observability/alerts.yml` единственное правило по DSA стоит на `:191`, и это `relay_dsa_queue_open`/`relay_dsa_decisions_total`. Тревоги на `relay_dsa_decision_letter_total` нет.
- Оговорка: фраза комментария `:131` «stops and is counted» формально не ложна, потому что каждая неудача даёт `inc(... "failed")` на `:183`. Но счётчик без тревоги никто не увидит.
- Смягчает то, что решение по-прежнему доходит через квитанцию на устройство (§6).

**G2 — ОПРОВЕРГНУТО: на развёрнутых узлах недостижимо.**
- Механика верна: `mailer.ts:611` возвращает `false`, `dsa.ts:383-387` не ставит отметку.
- Но мастер всегда выставляет `MAIL_TRANSPORT` в `smtp` или `resend` (`relay/wizard/wizard.py:236-238`). Значение `none` встречается только в тестовых скриптах (`scripts/run-depth-tests.sh:70`).
- Тот же класс уже опровергнут прежней панелью: `docs/reviews/PANEL_2026-09-23_loop.md:221`.

**G3 — ПОДТВЕРЖДЕНО, мелочь.**
- Окно существует. Мастер сначала мигрирует (`wizard.py:852-855`) и только потом делает `up -d` (`:866`), поэтому между ними старый образ продолжает работать на новой схеме.
- Решение, принятое в этом окне, оставит `decision_sent_at` и `decision_letter_facts` пустыми. Бэкфилл `db/058:28-29` к тому моменту уже прошёл, а отбор требует `facts IS NOT NULL` (`notice_notify.ts:148`).
- Последствие слабее заявленного: старый код письмо всё же отправлял. Результат он выбрасывал, как и до 058, так что строка просто навсегда выглядит «не отправленной». Эту колонку никто, кроме повтора, не читает.

**G4 — ЧАСТИЧНО, мелочь.**
- Бросок на `notice_notify.ts:161` действительно стоит перед `sendNightPathSummaries` (`scheduled.ts:352-354`).
- Однако `query` возвращает `null` только при сбое базы (`relay/node/src/lib/db.ts:117-123`), а ночная сводка сама читает базу и бросает на том же (`notice_notify.ts:253`). Такой же порядок уже был у `retryArrivalLetters` (`:72`).
- Реальный ущерб возможен только при сбое одного этого запроса, и тогда сводка сдвигается на один проход.

**G5 — ПОДТВЕРЖДЕНО, мелочь.** Две части, и вторая относится к старому коду.
- Отметка отправки идёт через `query`, который глотает ошибку: `dsa.ts:384` и `notice_notify.ts:178`. Если запись не удалась, повтор отправит второе письмо: после `GRACE_SECONDS` для маршрута или по истечении 10-минутной аренды для повтора.
- Письмо о поступлении устроено так же (`markArrivalSent`, `:29-31`), то есть доставка «хотя бы раз» заложена самим устройством.
- SMTP без тайм-аута — правда (`relay/node/src/lib/smtp.ts:52`, у `Deno.connect` и `conn.read` нет ни тайм-аута, ни `signal`). Но код старый, вне диапазона (последние коммиты файла `c2f69f1`, `51bbcbf`), а `smtp` работает только на dev с Mailpit на том же боксе. На проде стоит `resend`.

**G6 — ОПРОВЕРГНУТО: это решение, записанное в документах.**
- Годовой срок хранения и причина прямо записаны: `docs/dsa/SPEC_RU.md:434-436` («у отказа его больше негде взять», решено кворумом 3:0) и `db/058:10-15`.
- Каналу квитанции этот текст не показывается (SPEC `:436`).

**G7 — ОПРОВЕРГНУТО.**
- SPEC `:433-434` говорит, что не ушедшее письмо *повторяет* задача `DSA_NOTICE_NOTIFY` до восьми раз.
- Первая отправка из маршрута повтором не является, так что 1 + 8 совпадает с текстом.

**G8 — ОПРОВЕРГНУТО: обычным путём недостижимо.**
- Раннер учитывает применённые файлы по имени и повторно их не применяет (`relay/node/src/lib/migration_order.ts:3-4`, 24-30). Мастер ходит только через `tools/migrate_db.ts` (`wizard.py:854`).
- Ручной прогон через psql выходит за процедуру. Тот же приём бэкфилла уже был в db/043.

Находки G9–G31 из того же файла в мою задачу не входили, я их не смотрел.

### Опровержение G9–G17 (перенос в depth) — сырьё

Refuter verdicts for G9–G17 at commit 0cc0dd4. The worktree HEAD is 0cc0dd4 and clean, so I read files from it directly. Line numbers are exact for that commit.

**G9: REFUTED.**
- An honest node cannot reach "approved" without the issuer's own approve. `relay/node/src/routes/transfer.ts:386-388` refuses any caller except `invite.session` and `invite.identity`. The decision is written only in `approveInvite` (`transfer.ts:446-449`).
- So an honest node shows "approved" to a device that never sent approve only if that device's approve went through and its answer was lost. That is the F2 case, which is intended.
- A hostile node gains nothing new. It already controls sessions: it can freeze this session or answer 401 on every route and get the same "nothing left but exit".
- What a false "approved" costs is that the in-memory long key is dropped when the person exits `MovedAway` (`depth/ink/move.ts:244-251`). The paper code still raises the identity (`recovery.ts` `raise`).
- A false "approved" moves nothing to anyone. No reply envelope was sealed, and `sealReply` runs only inside `approve()` (`depth/core/transfer_move.ts:151`). No confidentiality loss, and no denial beyond what the node can already do.

**G10: REFUTED.** Part of it is literally true: a 5xx throws (`transfer_move.ts:132` and `:223`) and reaches `onError` (`move.ts:94`, `:286`). But the move does not end:
- `onError` is `fail` (`depth/ink/app.ts:94`). It only sets a red error line under the screen (`app.ts:457`) and does not change screens.
- `state` is not changed on the throw, so `useEvery` stays on (`move.ts:97`, `:288`) and the next tick asks again.
- The throw on the Arrival side comes before `seat`, so nothing is half-done.
- What remains is cosmetic: a stale red "error" line while polling quietly succeeds. Minor at most.

**G11: CONFIRMED, minor.**
- The ack is awaited without a signal or timeout: `transfer_move.ts:245`, with `fetch` without `signal` at `depth/core/client.ts:122`.
- `onArrived` fires only after `state()` resolves (`move.ts:278-284`). `useEvery` skips while one ask is still out (`move.ts:53-57`). So a hung ack stalls the arrived screen.
- The client is already seated (`transfer_move.ts:228-237`), so no data is lost, only the screen's progress.
- The stall is probably bounded by undici's default timeouts under Node. NOT VERIFIED.

**G12: CONFIRMED in part, minor.**
- The ask timeout does not abort the fetch: `Promise.race` without `AbortController` at `transfer_move.ts:63-66`. After each 15 s timeout the next tick can start a new request while the old one still hangs. That is a slow, bounded pile-up, not unbounded.
- The "bypass" is harmless. `ask()` at `move.ts:159-160` runs only after a non-200 or a throw from approve. A second concurrent `state()` only returns a state and calls `setState`, or `onMoved` once. After a 200 approve, `last="approved"` short-circuits every later call (`transfer_move.ts:121`).

**G13: REFUTED.**
- It is true that the value has no ceiling (`transfer_move.ts:129`, `:220`; `client.ts:131-135`). But only the node sends Retry-After, and a hostile node can freeze the screen just as well by answering "waiting" forever.
- An honest node's value comes from its limiter window (`transfer.ts:262-265`).
- The person can always press "stop"/back (`move.ts:183-188`).
- Worth at most a robustness nicety: cap it at the code's two-minute life.

**G14: REFUTED.**
- An HTTP-date or 0 turns into NaN or 0. Both are dropped by `Number.isFinite(retry) && retry > 0` (`client.ts:131-135`), and the caller falls back to 5 s (`?? 5`, `transfer_move.ts:129`). That is safe, not lost behaviour.
- The contract only ever sends seconds (`docs/protocol_RU.md:464`: "`Retry-After` в секундах").

**G15: CONFIRMED, minor (metric meaning).**
- The sweep counts `decision='approved' AND reply_envelope IS NOT NULL` (`relay/node/src/lib/scheduled.ts:153`, `:162`). The comment at `scheduled.ts:317-318` calls it "a move that failed without a word".
- The client sends the ack once and swallows a failure (`transfer_move.ts:244-248`). So a seated, successful device whose ack was lost is counted as failed.
- No alert reads this metric: grepping the repo found it only in `scheduled.ts`, the transfer test and the protocol docs.

**G16: REFUTED.**
- Measured in containers with `scratchpad/g16/t.mjs`: a pkcs8 with d from key A and the public point from key B.
  - `denoland/deno:alpine-2.1.4`: import ACCEPTED, and the re-export carries the injected point. The runtime does not check it.
  - `node:24-alpine`: `REJECTED Invalid keyData`.
- The terminal runs under Node, and Deno only runs the tests (comment at `client.ts:102-103`).
- The only caller is `recovery.ts:138`. There the key bytes are AES-GCM-wrapped under a key derived from the paper code (`recovery.ts:~60`). Forging a mismatched point needs the paper code, which already owns the identity. Not reachable by an attacker.
- The unanchored tag search is not an issue either. It runs over the runtime's own re-export, which is fixed-layout, 138 bytes with the tag at offset 68. A chance match inside the 32 bytes of d is about 2^-43.

**G17: REFUTED.**
- It cannot be built. `session_id` is minted by the node inside approve (`crypto.randomUUID()`, `transfer.ts:~375`). The reply is sealed before that request is sent (`transfer_move.ts:151-154` before `:154-159`), so the old device cannot know `session_id` to bind it.
- The node is the authority on sessions anyway. A wrong `session_id` only makes the new device's signed calls fail, which is denial of service the node already has.
- The envelope already binds the identity, the long public key and the ephemeral key through the header in the AAD (`transfer.ts:226-230`, `:273`).

**Summary:** 3 confirmed, all minor (G11, G12 in part, G15). 6 refuted (G9, G10, G13, G14, G16, G17). None is critical or a design defect.

### Опровержение G18–G21, G28, G30, G31 (эксплуатация, узел) — сырьё

Refuter verdicts at commit 0cc0dd4. I read the files from a `git archive` copy in scratchpad/r.

**G18: CONFIRMED, minor.** `relay/node/src/lib/scheduled.ts:142-164`. Each batch is its own autocommitted statement through `queryOrThrow` (:145). There is no try/catch in the loop, and `inc("relay_transfer_total",{result:"reply_unacknowledged"})` plus the log run only after the loop (:162-163). If batch N throws, the rows from batches 0..N-1 are already deleted and committed, but their `unacknowledged` count is never emitted. A retry cannot recount rows that are gone. The impact is limited to a metric: it undercounts, and no data is lost.

**G19: mostly REFUTED. The residue is CONFIRMED as minor doc hygiene.**
- The in-process maps are the known, accepted design. The header says so at `moderation_watch.ts:33-35`, and the item is tracked in `docs/facts/open.tsv:171 relay.watch.process.memory`, which names moderation_watch.ts, backup_watch.ts and the "до N лишних писем" cost.
- `saidNoRoad` is not "once per process". It resets to null as soon as a road exists (:136), so it fires once per no-road stretch. That is the intended F13 behaviour, commented at :119-122.
- What remains true: no code comment or watchdogs doc names the id `relay.watch.process.memory`. `moderation_watch.ts:35` says only "the same open item as С7's". `watchdogs_RU.md:152-153` and `EN:158` say "как у С7" / "as W7 does". `grep -rn process.memory` finds the id only in open.tsv.

**G20: behaviour part REFUTED. Doc part CONFIRMED, minor.**
- Firing on every lone stuck phrase is the deliberate F12 change. `alerts.yml:94-98` says the old instant rule "never fired" for a lone phrase. The rule is `severity: info` (:102) precisely because every phrase ages to the ceiling until the moderator exists (:89-92).
- The docs are stale. `watchdogs_RU.md:138` says "старейшей больше 9 минут дольше 2 минут" and `EN:143` says the equivalent. Neither mentions the 5-minute `max_over_time` peak that `alerts.yml:100` now uses.
- The summary at :104 labels the 5-minute peak "старейшей фразе". That age was real at some point in the window, so it is a wording nit, not a false alarm.

**G21: CONFIRMED, minor (stale doc).** `watchdogs_RU.md:186` and `watchdogs_EN.md:191` say `RecoveryBrakeOn` has no test in `alerts.test.yml`. But `relay/local/observability/alerts.test.yml:276-299` has two `alertname: RecoveryBrakeOn` cases, with the comment "had no test at all (B37, 2026-09-26)".

**G28: REFUTED.**
- `scripts/check-docs-pairing.sh:171-176` walks the filesystem with `root.rglob("*_RU.md")` and filters by its own tuple, `SKIP = (..., "/.claude/worktrees/")`. It never asks git what is ignored.
- It is true that `.gitignore` lacks `.claude/worktrees` and only `.git/info/exclude:11` has it. That does not matter here: the exclusion in the check does not depend on either file.

**G30: CONFIRMED, design defect.** It is narrow but irreversible.
- `identity_sweeper.ts:415-424` picks `doomed` in a CTE (`signup_completed_at IS NULL`, created more than `UNFINISHED_SIGNUP_HOURS=1` hour ago, :34), then runs `DELETE ... WHERE id IN (SELECT id FROM doomed)`. Under READ COMMITTED, EvalPlanQual rechecks only the DELETE's own qual, `id IN (cte)`. The CTE is not re-evaluated.
- Reproduced in a throwaway postgres:16 with `scratchpad/g30.sh`:
  - Session A runs `UPDATE identities SET signup_completed_at=now() WHERE id='a' AND signup_completed_at IS NULL` and holds it for 3 s.
  - Session B runs the sweeper's CTE+DELETE, blocks on the row, then proceeds after A commits.
  - Output: `deleted=1`, `remaining=0`. The completed identity was deleted.
- It is reachable. `POST /recovery/confirm` (`relay/node/src/routes/identity.ts:395-400`) has no age check and returns 204. The guard allows unfinished signups on this route. A person who writes the paper code down after more than one hour, while the hourly pass runs, gets 204 and then loses the identity.
- The window is the duration of one DELETE batch, so it is rare.

**G31: REFUTED.**
- The §8.2 rule (`docs/chat_RU.md:1125-1131`, id `identity.lock.order`) lists who takes shares, then sessions, then identities: vault/init, the transfer invite and confirm, the paper-code lift, the close, and "оба прохода уборщика (годовой и догоняющий)". The deletion passes are not in scope.
- No concurrent holder is reachable in practice:
  - `identity_guard.ts:127` refuses closed identities, and :138 refuses unfinished ones except on the confirm route.
  - The guard's `last_seen_at` bump is its own autocommitted statement (:173), so no route holds a session or share lock on a deletion candidate while waiting for its identity row.
  - A closed-for-30-days identity cannot have a live invite; invites live 2 minutes and need an authenticated, non-closed caller.
  - A registration transaction's identity is less than one hour old, so it is not a candidate.
- Even if it did happen, a deadlock would only abort a statement that runs again the next hour. No data is lost.

### Опровержение G22–G27, G29 (документы) — сырьё

Итог опровержения G22–G29 (всё прочитано через `git show 0cc0dd4:<path>`): **ПОДТВЕРЖДЕНО 5** (G22, G23, G24, G25, G29), **ОПРОВЕРГНУТО 2** (G26, G27). G28 в задании не было, его не проверял.

**G22 — ПОДТВЕРЖДЕНО, противоречие (узкое).**
- Документы в трёх местах говорят, что старое устройство после одобрения маршрут состояния не опрашивает:
  - protocol_RU.md:146: «Старое устройство после `approve` этот маршрут не опрашивает: ответ ему дал `approve`.»
  - protocol_EN.md:154: «The old device does not poll this route after `approve`: `approve` already answered it.»
  - openapi.yaml:~3441, то же в description и x-description-ru.
- Код делает иначе. depth/ink/move.ts:156-159: `out.approve().then((answer) => (answer.status === 200 ? onMoved() : ask())).catch(() => ask())`. Функция ask() вызывает `out.state()`, то есть GET /sessions/:lookup_id.
- depth/core/transfer_move.ts:160 ставит `last = "approved"` только при 200. Поэтому при потерянном ответе строка :121 опрос не останавливает.
- Комментарий в move.ts:89-90 говорит о том же прямо: «when that answer was lost, the node asked again (F2)».
- Документы верны только для случая, когда ответ на approve дошёл.

**G23 — ПОДТВЕРЖДЕНО, мелкое (пропуск).**
- `git show 0cc0dd4:docs/api/openapi.yaml | grep -E 'reply_unacknowledged|state_no_match|1–2 hours|brake'` ничего не находит.
- Описание ответа 200 (~3441) говорит «repeated on every poll until the new session acknowledges». Оговорки «но не дольше жизни строки, 1–2 часа» в нём нет.
- В описании 404 (~3461) нет, что промах идёт вне тормоза.
- В protocol_RU:146 и EN:154 обе вещи сказаны. Значит, openapi отстаёт от протокола.

**G24 — ПОДТВЕРЖДЕНО, мелкое (висячая ссылка).**
- relay/node/src/lib/identity_sweeper.ts:72: «the pass died with the rows in place (open.tsv relay.sweeper.flaky)».
- `git grep 'relay.sweeper.flaky' 0cc0dd4` находит только этот комментарий.
- `git log -S` показывает, что пункт был заведён в 2731cec и снят в bfeaedf «Close the sweeper flake…».

**G25 — ПОДТВЕРЖДЕНО, мелкое.**
- open.tsv:170: «с 712f86d тест печатает трассу кадров».
- `git merge-base --is-ancestor 712f86d 0cc0dd4` → rc=1, не предок.
- То же для 0159469 → rc=0, предок.
- У обоих коммитов одинаковая тема «Trace the frames of the lost-keys socket test…». Это cherry-pick, и в реестре записан sha, которого в ветке нет.

**G26 — ОПРОВЕРГНУТО.**
- Сам факт верен: строки depth-client_RU:243 и §3.3 (:328), EN:255 и :342 есть. depth/ink/main.ts:23-24 разбирает только `restore` и `move`, команды `device` нет.
- Но пробел уже учтён, и с якорем ровно на эту строку. open.tsv:167 (depth.restore): «нет отдельной команды depth device — код переноса отсюда даёт пункт «я»», якорь `docs/depth-client_RU.md:243`.
- Кроме того, таблица — спецификация, и там же без пометки стоят другие не разобранные в argv команды (`depth new`, `appearance`, `report`). Противоречия нет, есть только косметическая разница с пометкой у `reissue`.

**G27 — ОПРОВЕРГНУТО как противоречие.**
- В decisions.tsv нет ни B30, ни publicHalfByJwk, это верно (grep пуст).
- Но шапка реестра (строки 1-9) полноты не обещает: «Засеяно scripts/seed-facts-decisions.py… Строки, которые скрипт сопоставить не смог, в реестр НЕ попадают».
- Другие решения по переносу — кворум B10, решение координатора B3 — в реестре тоже отсутствуют. Правила «каждое решение в decisions.tsv» в репозитории нет.
- B30 записан в protocol_RU:146 и EN:154 («кворум B30, 26.09.2026»). Решение координатора записано в комментарии depth/core/recovery.ts:85-88.
- Остаётся, самое большее, расхождение с глобальным правилом 31 владельца: решение кворума пишется в DECISIONS с отклонёнными вариантами. Это расхождение с процессом, а не противоречие в документах.

**G29 — ПОДТВЕРЖДЕНО, мелкое.**
- mailer.ts:769-770: «One sender for both letters: same transports as everything else, and a boolean back…».
- Сразу за ним, без пустой строки, идёт комментарий к `MAIL_KINDS` (:771-776, `export const MAIL_KINDS` на :777). `async function deliver` стоит на :784.
- Комментарий оторван от deliver и к тому же устарел: «both letters» при 12 видах писем в MAIL_KINDS.


## Сводка ведущего

31 находка после слияния дублей. Опровергнуто 14, подтверждено 17. Критичных нет.

**Опровергнуто (в доклад не идёт):** G2 (почта `none` на развёрнутых узлах не ставится — мастер
пишет smtp/resend, `wizard.py:236-238`; класс снят и прежней панелью), G6 (год хранения текста —
решение в SPEC_RU:434-436), G7 (1+8 совпадает с «повторяет до восьми раз»), G8 (раннер не
применяет миграцию дважды), G9 (честный узел не отдаст approved без своего approve —
`transfer.ts:386-388`; враждебный и так распоряжается сессиями; ничего не запечатано), G10 (5xx
оставляет строку ошибки, но опрос продолжается и перенос не кончается), G13, G14 (Retry-After шлёт
только узел, контракт — секунды), G16 (Node отвергает pkcs8 с чужой точкой; подделка требует
бумажного кода — замерено опровергателем в контейнерах), G17 (session_id узел рождает после
запечатывания — связать нельзя), G26 (depth device уже в open.tsv с якорем на ту строку), G27
(реестр решений полноты не обещает), G28 (проверка парности сама пропускает каталог деревьев),
G31 (проходы удаления вне правила §8.2, одновременного держателя нет). Из G19 и G20 сняты части о
поведении (память процесса — принятый открытый пункт; срабатывание на каждую фразу — намеренно, info).

### Подтверждено, по уровням

**Дефект дизайна**
- G30 relay: уборщик незавершённых регистраций удаляет личность, чья регистрация завершилась во
  время его запроса — DELETE перепроверяет только `id IN (doomed)`, а не `signup_completed_at IS NULL`
  (`relay/node/src/lib/identity_sweeper.ts:415-424`). Путь есть: `POST /recovery/confirm` после
  часа. Необратимо. **ПРОВЕРЕНО** мной: `scratchpad/g30.sh` в postgres:16 — `deleted=1`, `remaining=0`.
- G1 relay: письмо о решении по уведомлению (ст. 16(5) DSA) после 8 попыток раз в 10 минут
  (~80 мин) больше не повторяется, счёта «исчерпано» и тревоги нет. **ПРОВЕРЕНО** мной:
  `notice_notify.ts:23,150`, в alerts.yml правила на `relay_dsa_decision_letter_total` нет
  (опровергатель); смягчение — решение доходит квитанцией на устройство.

**Мелкое**
- G3 письмо, решённое в окне между миграцией 058 и новым образом, навсегда «не отправлено»
  (`notice_notify.ts:148`). НЕ ПРОВЕРЕНО мной.
- G4 сбой чтения в повторе писем пропускает ночную сводку этого прохода. **ПРОВЕРЕНО** мной:
  `scheduled.ts:350-354`, бросок `notice_notify.ts:161`; опровергатель: ущерб — сдвиг на один проход.
- G5 отметка «отправлено» через `query` без проверки — молчаливое второе письмо (`dsa.ts:384`,
  `notice_notify.ts:178`). НЕ ПРОВЕРЕНО мной.
- G11 ack в depth без тайм-аута — пересаженное устройство может встать на экране
  (`depth/core/transfer_move.ts:245`). НЕ ПРОВЕРЕНО мной. (Код ведущего, B27.)
- G12 тайм-аут опроса не прерывает fetch — висящие запросы медленно копятся
  (`transfer_move.ts:63-66`). НЕ ПРОВЕРЕНО мной. (Код ведущего, B27.)
- G15 метрика `reply_unacknowledged` считает провалом и удачный перенос с потерянным ack
  (`scheduled.ts:153,162,317-318`). НЕ ПРОВЕРЕНО мной.
- G18 `pruneInvites` теряет счёт уже удалённого при сбое пачки (`scheduled.ts:142-164`). НЕ ПРОВЕРЕНО мной.
- G19 комментарий сторожа и watchdogs не называют пункт `relay.watch.process.memory`
  (`moderation_watch.ts:35`, `watchdogs_RU.md:152`/EN). НЕ ПРОВЕРЕНО мной.
- G20 watchdogs_RU:138/EN:143 описывают прежнее правило ModerationQueueStopped. НЕ ПРОВЕРЕНО мной.
- G21 watchdogs_RU:186/EN:191 «RecoveryBrakeOn — теста нет», а тест есть (`alerts.test.yml:276-299`). НЕ ПРОВЕРЕНО мной.
- G22 protocol_RU:146/EN:154 и openapi «старое устройство после approve не опрашивает» — код
  при потерянном ответе опрашивает (F2). НЕ ПРОВЕРЕНО мной.
- G23 openapi не называет предел жизни неподтверждённого ответа и вне-тормозной промах состояния. НЕ ПРОВЕРЕНО мной.
- G24 `identity_sweeper.ts:72` ссылается на снятый пункт `relay.sweeper.flaky`. НЕ ПРОВЕРЕНО мной.
- G25 open.tsv:170 ссылается на 712f86d, которого нет в day58 (там 0159469). НЕ ПРОВЕРЕНО мной.
- G29 комментарий `mailer.ts:769` оторван от `deliver` и устарел («both letters»). НЕ ПРОВЕРЕНО мной.

## Нарезка на задачи

| # | Что | Находки | Уровень | Цена |
|---|---|---|---|---|
| 1 | Уборщик незавершённых регистраций: повторить `signup_completed_at IS NULL` в DELETE; тест двумя соединениями (подтверждение в окне → личность цела) | G30 | дефект дизайна | ~30 мин, identity_sweeper.ts + тест |
| 2 | Письмо о решении: счёт «исчерпано» и тревога, отступ между попытками на больший срок; пометить нерешаемые строки окна 058 | G1, G3 | дефект + мелкое | ~1 ч, notice_notify.ts, alerts.yml(+test), SPEC_RU/EN §6 |
| 3 | Узел, мелкое: ночная сводка независимо от повтора писем, лог при неудачной отметке «отправлено», счёт pruneInvites по пачкам | G4, G5, G18 | мелкое | ~40 мин, scheduled.ts, notice_notify.ts, dsa.ts |
| 4 | depth move: тайм-аут ack, прерывание зависшего опроса (AbortSignal в client.request — файл bc), повтор ack или смысл метрики reply_unacknowledged | G11, G12, G15 | мелкое | ~40 мин, transfer_move.ts, client.ts (по согласованию), scheduled.ts/protocol |
| 5 | Документы: watchdogs RU/EN (G19, G20, G21), protocol RU/EN и openapi (G22, G23), висячие ссылки (G24, G25), комментарий mailer (G29) | G19–G25, G29 | противоречие + мелкое | ~40 мин |

---

# Второй заход — B38–B42 (`0cc0dd4..cbda02a`)

**Дата:** 26.09.2026, 11:58–12:15. **Ведущий:** xor-ad-ae. **Что:** `git diff 0cc0dd4..cbda02a -- relay/node
depth relay/local scripts` — 17 файлов, +966/−8; кода около 70 строк (главное — take_down.ts: снятие
живого берёт только живые лайки и живые/ждущие свои фразы, истёкшее оставлено уборщику, — снятие
40P01 с уборщиком; нулевые серии метрик B42), остальное — тесты (alerts.test.yml, take_down, стресс,
metrics_zeros). **Состав:** три линзы — Безопасность (обязательна), Данные, Эксплуатация; Протоколы и
Согласованность на 70 строках кода не собирались. Затем один опровергатель на все находки.

## Сырые находки линз (второй заход)

### Второй заход — линза «Безопасность» — сырьё

## Security lens, second pass, `0cc0dd4..cbda02a`

No critical findings. The take-down change is sound for what §8.2 asks. There are two contradictions and one minor residual race.

**Checked by reading the code at cbda02a. I did not run the tests or a container.**

### What I checked and found holding

1. **Do phrases or likes stay live after a step-away or close?**
   - The take-down deletes phrases where `visible_at IS NULL OR expires_at > now()` (`take_down.ts:93-96`). The sweep deletes the exact complement, `visible_at IS NOT NULL AND expires_at <= now()` (`feed_verdict.ts:298-299`). Together they cover every row.
   - Every reader that could show a leftover expired phrase filters on `livePhraseOf`: the feed `feed.ts:352`, the density count `feed.ts:566`, the list of one's likes (screen 25) `likes.ts:407`, the name freeze `profile.ts:153`, and the match query `likes.ts:184-185`.
   - So a leftover expired phrase and its likes are invisible, and they cannot make a match.
   - This matches the recorded decision in spec `docs/chat_RU.md` §8.2, line 108 of that section ("Снятие живого не трогает истёкшее", 26.09).
2. **Can a like land between `held` and the DELETE and survive?** No defect found.
   - The take-down locks one's own `identity_stats` row first (`take_down.ts:28-31`, `me` is in the array).
   - A like takes the same row (`likes.ts:113-116`), so a like by `me` waits until the take-down commits. Then `stillHere` (`likes.ts:117`) refuses it.
   - A like that commits before the lock appears in `held`, because the `SELECT id … FOR UPDATE` runs after the stats lock (`take_down.ts:32-40`).
3. **Does the TakeDownRetry guard still cover a new author?** Yes.
   - A like on a new author that commits between `guess` and the stats lock is in `held`. The DELETE returns it and `take_down.ts:63` throws.
   - Both callers retry only on TakeDownRetry (`away.ts:47-53`, `identity.ts:1062`).
   - A like on a phrase that has since expired no longer triggers a retry. That is correct, because it is no longer deleted or counted.
4. **Can a moderation verdict publish a waiting phrase during the take-down?** No new race.
   - The DELETE's WHERE covers both states of the row.
   - Under READ COMMITTED, the row that the verdict publishes is checked again as live and deleted.
5. **Metric labels in the zero series.** No leak and no cardinality risk.
   - Every pre-created label is a literal (`feed_verdict.ts:27`, `dsa.ts:27`, `identity.ts:1280`, `likes.ts:34-35`, `statements.ts:26`, `transfer.ts:41`, `sessions.ts:34`).
   - The one exception is `mailer.ts`: `config.mail.transport` × the `MAIL_KINDS` constant × 2 results, which is bounded.
   - The label names match the ones that actually increment (for example, `identity.ts:1103` maps `wrong_pin` to `"wrong"`).

### Findings

- **Contradiction, pre-existing and outside the diff: the PIN-limit freeze takes nothing down.**
  - `take_down.ts:2-4` says the list is "exactly as the PIN-limit freeze does", and spec §8.2 (the freeze paragraph at line 535) requires that freeze to take down phrases, likes and matches.
  - But `pin_attempts.ts:107` calls only `freezeSession(run, sessionId, "pin_limit")`, and `sessions.ts:44-90` has no call to `takeDownLive`.
  - I did not find it handled anywhere: `takeDownLive` is called only from `away.ts:118` and `identity.ts:1116`.
  - Result: after ten wrong PINs, the frozen identity's phrases, likes and matches stay live, which the spec says must go.
  - Point fix: call `takeDownLive` inside the pin_limit branch of `pin_attempts.ts`, with the same TakeDownRetry loop.
- **Minor: a narrow deadlock window remains at the expiry boundary.**
  - `now()` is fixed at the start of the take-down transaction. A phrase that expires during that transaction is still live to the take-down, which locks it (`take_down.ts:37`) or deletes it (`:94`). The sweep, with a later `now()`, sees it as expired and takes it in its own order (`feed_verdict.ts:297`).
  - Two such phrases crossing expiry inside a transaction of a few milliseconds could still produce 40P01.
  - Nothing is left half-done: the transaction rolls back. But callers do not retry 40P01 (`away.ts:51` rethrows it), so the person gets a 5xx.
  - This is my theory; I did not reproduce it. Point fix: also retry on 40P01 in the two loops.
- **Minor, a contradiction on counters that the spec accepts:** likes on phrases that expired before the take-down stay in the author's `likes_received` for good (`take_down.ts:53-55`). This is the same as any like the sweep takes, and §8.2 line 108 accepts it. It is not a leak, as long as `likes_received` is never shown to anyone as a list of who liked. I did not check that.
- **Not a defect:** `scripts/run-relay-tests.sh:47` mounts `relay/local` read-only. In a working checkout this would include any ignored local env file there (`relay/local/.gitignore` exists; I did not read it). The test container has `--allow-net=127.0.0.1`, so nothing can leave the machine.
### Второй заход — линза «Данные и СУБД» — сырьё

Линза «Данные и СУБД», второй проход, cbda02a. Смотрел только чтение и один опыт в одноразовом postgres:16.

```diff
+ Для take-down теперь без дедлока: лайк, снятие лайка, второй take-down той же личности и уборщик вне окна истечения. Проверено чтением
- Снятие лайка на истёкшей фразе, которую уборщик ещё не забрал, даёт 40P01 с уборщиком. Воспроизведено в postgres:16
! Осталось окно, в котором take-down и уборщик сталкиваются: фраза истекает во время транзакции take-down. Стресс-тест его не достаёт
! Стресс-тест не проверяет удаление своих фраз, а проверка likes_given в нём пропускает старое поведение
```

**1. Дефект конструкции.** `relay/node/src/routes/likes.ts:312-317`. Снятие лайка сначала удаляет строку `likes`, потом правит `feed_messages`. Уборщик делает наоборот: сначала строка фразы, потом каскад на `likes`. Проверки, что фраза жива, в снятии нет (`likes.ts:277-281`), поэтому на истёкшей, но ещё не убранной фразе получается тот же встречный порядок, что чинили в take-down. **ПРОВЕРЕНО** опытом: в сессии снятия `DELETE l`, пауза, `UPDATE f`, а в это время уборщик делает `DELETE FROM f WHERE expires_at<=now()`. Итог — `deadlock detected ... while updating tuple in relation "f"`. Пользователь получает 503.
Правка точечная: после блокировки `identity_stats` взять `SELECT 1 FROM feed_messages WHERE id=$1 AND expires_at > now() FOR UPDATE`, а если строки нет, отвечать `unliked()` и ничего не удалять. Спецификация от 26.09 («истёкшее — уборщику») это и требует.

**2. Дефект конструкции, редкий.** Остаётся окно. `now()` в take-down — это время начала его транзакции, у уборщика `now()` позже. Возьмём фразу X, которую я лайкнул, и мою фразу Z, у которых `expires_at` попал между этими двумя моментами. Take-down держит X (`take_down.ts:36-38`) и потом удаляет Z (`:93-96`). Уборщик одним `DELETE` уже взял Z и ждёт X. Получается цикл. **НЕ ПРОВЕРЕНО** опытом, вывод по теории блокировок. Вызывающий код повторяет транзакцию только на `TakeDownRetry` (`away.ts:51`, `identity.ts:1062`), на 40P01 повтора нет, значит закрытие или отлучка отвечают 503.
Правка: во внутреннем `SELECT` уборщика `FOR UPDATE SKIP LOCKED` (`feed_verdict.ts:297-299`). Она же закрывает и пункт 1. Оговорка: спецификация отклонила вариант «пропускать занятые в уборщике» в связке с блокировкой всех фраз по порядку `id`. Одно `SKIP LOCKED` без той связки не добавляет блокировок.

**3. Противоречие, мелкое.** Счётчики теперь зависят от пути. Для лайков на истёкших фразах take-down больше не уменьшает `likes_given` и `likes_received`, и это согласуется с уборщиком, который их никогда не уменьшает (`feed_verdict.ts:295-303`, `identity_stats` он не трогает). А снятие лайка на той же неубранной фразе их уменьшает (`likes.ts:318-325`). Правка из пункта 1 это выравнивает. Сами счётчики не расходятся со строками, потому что `likes_given` — это история.

**4. Мелкое, стресс-тест.**
- Стресс не проверяет удаление своих фраз. У лайкера в `take_down_stress.test.ts:43-63` своих фраз нет, так что изменение `take_down.ts:93-96` стрессом не покрыто. А там отдельный класс: два многострочных `DELETE` по пересекающимся истёкшим строкам в разном порядке.
- Проверка `likes_given` слишком слабая. Теперь значение детерминировано и равно `AUTHORS - live.length`, то есть 30, а `:100-101` принимает любое от 0 до 30. Старое поведение, при котором вычитались и истёкшие, этот тест тоже пропустит. Комментарий в `:94-97` («the expired ones the sweep reached first did not») описывает старый код.
- Истёкшие фразы в тесте просрочены на минуту (`:55`), поэтому окно из пункта 2 не возникает никогда.
- Утверждение «5 из 5 красных на старом коде» я **НЕ ПРОВЕРЯЛ**, сам тест не запускал.

**Где дефекта не нашёл:**
- Согласованность `now()`. **ПРОВЕРЕНО** чтением. `held` вычисляется один раз, `DELETE` идёт по `ANY($2)` без повторного предиката (`take_down.ts:57`). `now()` внутри транзакции постоянен, поэтому и перепроверка строки у `FOR UPDATE` даёт тот же ответ. Фраза, истёкшая посреди транзакции, в обоих операторах считается живой. Её счётчики уменьшаются согласованно, уборщик ждёт и забирает её после коммита. Противоречия нет, кроме окна из пункта 2.
- Порядок с лайком, снятием лайка и вторым take-down. **ПРОВЕРЕНО** чтением `likes.ts:113-116`, `294-297`. Все начинают с `identity_stats` в едином порядке uuid, а строку фразы берут только после этого. Лайк чужого на мою фразу ждёт на `stats(me)`. Второй take-down с другого устройства тоже ждёт на `stats(me)`, после чего видит свежие данные (READ COMMITTED, снимок на каждый оператор): `held` пуст или новый, лайк вставить нельзя, потому что `stats(me)` занят.
- Ждущие фразы (`visible_at IS NULL`) с уборщиком не пересекаются: уборщик берёт только `visible_at IS NOT NULL`.
- `take_down.test.ts` честно открывает окно для `TakeDownRetry` через подменённую `run` и проверяет, что блокировка не взята, через `NOWAIT`.

Опыт лежит в `/tmp/claude-1000/-home-eugene-panov-Projects-panov-id-xor-ad/6831ada1-1b2c-473c-844a-9e268f8c5d2f/scratchpad/dl.sh`.
### Второй заход — линза «Эксплуатация» — сырьё

Линза «Эксплуатация», второй проход, cbda02a. Я только читал, в репозитории ничего не менял. Для чтения выгрузил снимок через `git archive` в scratchpad.

Что проверил запуском:
- `scripts/test_alerts.sh` на снимке: «18 rules, 18 with a firing, a quiet and an edge probe», promtool — SUCCESS.
- `scripts/check-db-suites.sh relay/node` на снимке: «тестов с базой: 15 — список совпадает».
- `metrics_zeros.test.ts` и стресс-тест не запускал: нужен полный прогон узла и Postgres.

**1. Дефект проектирования. Письмо-приветствие публикует серию, которую никто не создал заранее, и MailFailing пропускает первый отказ.**
- `relay/node/src/lib/mailer.ts:191` и `:193` (`sendWelcome`) инкрементируют `relay_mail_total{transport, result}` без метки `kind`.
- Заранее созданные серии (`mailer.ts:787-789`) все несут `kind` из `MAIL_KINDS` (`:777-780`), а `"welcome"` в этом списке нет.
- Поэтому первый упавший welcome после рестарта (путь `routes/waitlist.ts:127`) рождает серию `{transport="resend",result="failed"}` сразу со значением 1. `rate()` в `alerts.yml:182` её не видит — ровно то, что B42 закрывал.
- Тест `metrics_zeros.test.ts:68` этого не ловит: селектору `result!="sent"` подходит любая нулевая серия с любым `kind`.
- Точечная правка: дать welcome `kind: "welcome"` в `:191/:193` и добавить `"welcome"` в `MAIL_KINDS`. Либо заранее создать и `{transport, result:"failed"}` без `kind`.

**2. Противоречие, мелкое. Тест нулевых серий проверяет наличие нуля, а не то, что код потом инкрементирует ту же серию.**
- `metrics_zeros.test.ts:65-70` сверяет только метки из селектора алерта.
- Метки `transport` и `kind` не проверяются. Отсюда и слепое пятно пункта 1: любую серию с новым набором меток тест пропустит.
- Правка: для `relay_mail_total` отдельно сверить, что каждое место `inc(` ложится на набор меток, созданный при загрузке. Либо свести вызовы к одной функции.

**3. Мелкое. Метка `transport` вычисляется один раз при загрузке модуля, а конфиг перечитываемый.**
- Создание нулей берёт `config.mail.transport` при импорте (`mailer.ts:788`).
- `reloadConfig()` существует и в комментарии назван задел под сигнал перезагрузки.
- В проде конфиг сейчас читается один раз, поэтому это не дефект. Но если сменить транспорт перезагрузкой, заранее созданные серии окажутся под старым транспортом. Стоит записать рядом с `reloadConfig`.

**4. Не найдено, где обрабатывается (было до этого диффа). Последний неверный PIN помечается `locked`, а не `wrong_pin`.**
- Место: `relay/node/src/lib/pin_attempts.ts:109`.
- `PinMissBurst` (`alerts.yml:111`, `result="wrong"`) и `TransferPinGuessing` (`:242`, `wrong_pin`) эту попытку не считают, а серия `locked` тоже рождается с 1.
- При переборе это недосчёт на одну попытку на сессию, пороги 10 и 20 это почти не меняет. Упоминаю, потому что задача B42 — «первое событие».

**5. Мелкое. Стресс-тест при красном прогоне не убирает свои строки.**
- В `take_down_stress.test.ts:116` assert бросает исключение раньше очистки на `:119-126`.
- Строки `take-down-stress` остаются в базе, но база одноразовая: контейнер и сеть сносит `trap cleanup` (`scripts/run-relay-database-tests.sh:29-34`). Контейнеры после теста не остаются.
- Флаки не вижу: сам тест дочищает просрочку повторным проходом (`:111`), свип идёт до исчерпания (`feed_verdict.ts:293-307`), а `likes_given` после правки детерминирован.
- Сам тест доказывает отсутствие дедлока только вероятностно, и красный он давал до правки лишь по словам комментария. Контрольную поломку я не повторял.

**6. Проверено, дефекта нет:**
- `test_alerts.sh` без promtool красный: `set -euo pipefail` (`:13`), а `docker run` (`:55`) падает с ненулевым кодом.
- Оба новых набора с базой стоят в `--ignore` (`relay/node/deno.json:7`) и отказываются работать без `DATABASE_URL` (`take_down_stress.test.ts:15-19`).
- Монтирование `relay/local` (`scripts/run-relay-tests.sh:47`) соответствует пути `../../local/...` в `metrics_zeros.test.ts:60`.
- Остальные нулевые серии совпадают с местами инкремента по меткам:
  - `dsa.ts:27` и `:341`;
  - `sessions.ts:34` и `:97`;
  - `identity.ts:1280` и `:790/988/1103`;
  - `likes.ts:34-35` и `:247/331`;
  - `statements.ts:26` и `:96`;
  - `transfer.ts:41` и `:135` через `pin_attempts.ts:109`;
  - `feed_verdict.ts:27` и `:176/263`.

**Что увидит дежурный.** `DsaQueueStuck` (`alerts.yml:191`) теперь срабатывает и на свежем узле с открытой очередью: раньше без серии `== 0` давал пустой результат. Это исправление, но после выката жди первый настоящий пейдж по старым открытым уведомлениям. Проба `alerts.test.yml:15` («no published series at all») описывает состояние, которого узел после B42 не производит. Она безвредна благодаря `or vector(0)`.

## Сведённые находки (второй заход, до перепроверки)

H1 [Б] relay (до диапазона): заморозка десятой ошибкой ПИНа ничего не снимает — pin_attempts.ts:107 только freezeSession(..., "pin_limit"); takeDownLive зовут лишь away.ts:118 и identity.ts:1116; chat_RU.md:1301 требует «в той же транзакции заморозка снимает живое, как отлучка».
H2 [Д1] relay: снятие лайка на истёкшей, но не убранной фразе — встречный порядок с уборщиком (likes.ts:312-317: DELETE likes, затем UPDATE feed_messages; уборщик: фраза, затем каскад на likes) → 40P01, человек получает 503; проверки живости фразы в снятии нет (likes.ts:277-281).
H3 [Б, Д2] relay: окно на границе истечения — фраза истекает между now() транзакции take-down и now() уборщика (take_down.ts:36-38, :93-96; feed_verdict.ts:297-299) → возможен 40P01; вызывающие повторяют только TakeDownRetry (away.ts:51, identity.ts:1062), не 40P01 — теория.
H4 [Э1] relay: sendWelcome считает relay_mail_total без kind (mailer.ts:191,193), "welcome" нет в MAIL_KINDS — нулевой серии нет, первый отказ приветствия после рестарта MailFailing не видит.
H5 [Э2] relay: metrics_zeros.test.ts:65-70 проверяет только метки из селектора тревоги, не то, что код инкрементирует ту же серию (поэтому пропустил H4).
H6 [Э4] relay (до диапазона): последний неверный ПИН считается как locked, а не wrong/wrong_pin (pin_attempts.ts:109) — PinMissBurst/TransferPinGuessing недосчитывают одну попытку.
H7 [Д4, Э5] relay: стресс take_down_stress.test.ts не покрывает удаление своих фраз (:43-63), проверка likes_given слаба (:100-101), комментарий :94-97 описывает старый код; при красном прогоне строки не чистятся (:116 до :119-126, база одноразовая).
H8 [Д3] relay: счётчики зависят от пути — take-down на истёкшей не вычитает, снятие лайка на той же неубранной вычитает (likes.ts:318-325).
H9 [Э3] relay: метка transport нулевых серий берётся при загрузке модуля (mailer.ts:788), а reloadConfig существует.

## Опровержение (второй заход)

### Второй заход — опровержение H1–H9 — сырьё

Итог по H1–H9 на cbda02a: подтверждено 8 находок, опровергнута одна (H9). Все находки — от панели (p3-findings.md), каждую я проверил сам через `git show cbda02a:…`. H2 воспроизведена в одноразовом postgres:16.

**H1 — ПОДТВЕРЖДЕНО, дефект проекта (было до диапазона).**
- При десятой ошибке `pin_attempts.ts:95-107` зовёт только `freezeSession(run, sessionId, "pin_limit")`.
- `sessions.ts:44-98` пишет `frozen_at`, шлёт `pg_notify`, а полови́ны мэтчей трогает только при `transfer`. Фразы, лайки и мэтчи не снимаются.
- `takeDownLive` вызывается только в `away.ts:118` и `identity.ts:1116`.
- В `relay/node/db` нет ни одного `CREATE TRIGGER`, так что SQL-пути тоже нет.
- Спека требует обратного, причём дважды: `chat_RU.md:1301` («В той же транзакции заморозка снимает живое, как отлучка») и `:874` («Закрытие, отлучка и заморозка снимают живые фразы…»).
- Шапка `take_down.ts:3` даже пишет «exactly as the PIN-limit freeze does», хотя этот путь её не вызывает.
- Тест `feed_publish.test.ts:2034-2047` («a PIN-limit freeze leaves the halves and the consent standing») закрепляет только сохранность согласия. Тестов на снятие живого при `pin_limit` нет.

**H2 — ПОДТВЕРЖДЕНО, мелкое.**
- Снятие лайка, `likes.ts:275-316`: чтение фразы без блокировки, advisory-блокировка пары, `identity_stats FOR UPDATE`, затем `DELETE likes` и только потом `UPDATE feed_messages`.
- Уборщик блокирует ни `identity_stats`, ни advisory не берёт, поэтому эти блокировки ничего не упорядочивают.
- Уборщик, `feed_verdict.ts:295-303`: сначала `DELETE feed_messages`, потом каскад в `likes` через `030_likes_matches_blocks.sql:15`.
- Проверки `expires_at` в снятии лайка нет (`:277-281`).
- Воспроизведение (скрипт `scratchpad/h2run.sh`, postgres:16): `ERROR: deadlock detected … while deleting tuple in relation "likes"`.
- Жертва — любая из двух сторон. Если уборщик, он повторит через минуту; если снятие лайка — человек получает 503 через `.catch` на `:327-331`.
- Окно узкое: фраза истекла, но ещё не убрана (≤1 мин), а `GET /likes` показывает только живые.

**H3 — ПОДТВЕРЖДЕНО как теория, мелкое.**
- `now()` в Postgres — время начала транзакции. Снятие живого фильтрует по нему (`take_down.ts:36-38` и `:93-96`), уборщик — по началу своего оператора.
- Сценарий цикла: фраза B, которую человек лайкнул, и его собственная фраза X истекают в этом окне. Снятие держит B `FOR UPDATE`; уборщик берёт X и ждёт B; снятие затем удаляет X и ждёт уборщика.
- Повтор есть только на `TakeDownRetry` (`away.ts:47-52`, `identity.ts:1062-1068`), остальное уходит в 503.
- Не воспроизводил.

**H4 — ПОДТВЕРЖДЕНО, мелкое.**
- `mailer.ts:191,193` пишут `{transport,result}` без `kind`. Нулевые серии в `:787-789` заводятся только для `MAIL_KINDS` (`:777-781`), `welcome` там нет. Других нулевых инициализаций `relay_mail_total` нет.
- Итог: первый отказ приветствия после старта рождает серию сразу с 1, и `rate()` в `alerts.yml:182` его не видит.

**H5 — ПОДТВЕРЖДЕНО, пробел в тесте.**
- `metrics_zeros.test.ts:65-70` ищет хотя бы одну нулевую серию, подходящую под селектор. Под `result!="sent"` подходит любая серия с `kind`, поэтому набор меток без `kind` (H4) проходит.

**H6 — ПОДТВЕРЖДЕНО, мелкое.**
- `pin_attempts.ts:109`: `meter(left === 0 ? "locked" : "wrong_pin")`. Маршруты переводят в `wrong` только `wrong_pin` (`identity.ts:790,988,1103`), а `transfer.ts:135` пишет результат как есть.
- `PinMissBurst` (`alerts.yml:111`) и `TransferPinGuessing` (`:242`) недосчитывают одну ошибку на устройство. Смягчает `SessionFreezeBurst`, который считает заморозки `pin_limit`.

**H7 — ПОДТВЕРЖДЕНО, мелкое (качество теста).**
- У лайкающего нет своих фраз (`:43-63`), так что удаление собственных фраз не покрыто.
- Новый код даёт ровно `likes_given = 30`, а тест допускает `0..30` (`:100-101`).
- Комментарий `:94-97` («the expired ones the sweep reached first did not») описывает старое поведение.
- Утверждения `:100-116` стоят раньше очистки `:119-126`, поэтому при красном прогоне строки остаются.

**H8 — ПОДТВЕРЖДЕНО, мелкое.**
- Снятие живого вычитает только живые лайки (`take_down.ts:36-38`, `:55-61`).
- `unlikePhrase` вычитает `like_count`/`likes_given`/`likes_received` и на истёкшей неубранной фразе (`likes.ts:318-325`, проверки живости нет). Смысл счётчика зависит от пути.

**H9 — ОПРОВЕРГНУТО.**
- `reloadConfig` (`config.ts:183`) нигде в `relay/node/src` не вызывается; сам комментарий `:180-182`: «Nothing in the node calls this; it is for tests». Метка `transport` из `mailer.ts:788` в работающем узле не расходится с конфигом.

## Сводка ведущего (второй заход)

9 находок после слияния: подтверждено 8, опровергнута H9 (`reloadConfig` узел не вызывает,
`config.ts:180-183`). Не находки (линзы сами сняли): остаток `likes_received` на истёкших — принятое
спекой 26.09 «истёкшее — уборщику»; монтирование relay/local в тестах — сеть закрыта; DsaQueueStuck
теперь срабатывает и на свежем узле — это исправление, ждать первого настоящего вызова после выката.

**Дефект дизайна**
- H1 relay (до диапазона): десятая ошибка ПИНа замораживает сессию, но не снимает живое — фразы,
  лайки, мэтчи остаются. Спека: chat_RU.md:1301 и :874. **ПРОВЕРЕНО** мной: `pin_attempts.ts:107`
  зовёт только freezeSession; `git grep takeDownLive` → лишь away.ts:118 и identity.ts:1116.
  Шапка take_down.ts:3 утверждает обратное.

**Мелкое**
- H2 снятие лайка на истёкшей неубранной фразе встречает уборщика встречным порядком → 40P01, 503.
  **ПРОВЕРЕНО** мной: `scratchpad/dl.sh` в postgres:16 → `deadlock detected`; порядок likes.ts:312-316
  (DELETE likes, затем UPDATE feed_messages) совпадает с моделью.
- H3 окно на границе истечения take-down × уборщик → 40P01 без повтора (теория). НЕ ПРОВЕРЕНО.
- H4 приветственное письмо без kind — нулевой серии нет, первый отказ MailFailing не видит.
  **ПРОВЕРЕНО** мной: mailer.ts:191,193; `"welcome"` в MAIL_KINDS нет.
- H5 metrics_zeros.test.ts не сверяет наборы меток с местами инкремента (пропустил H4). НЕ ПРОВЕРЕНО.
- H6 последний неверный ПИН считается `locked`, а не wrong (pin_attempts.ts:109). НЕ ПРОВЕРЕНО.
- H7 стресс take_down: нет своих фраз, слабая проверка likes_given, устаревший комментарий. НЕ ПРОВЕРЕНО.
- H8 счётчики зависят от пути (снятие лайка вычитает на истёкшей, снятие живого — нет). НЕ ПРОВЕРЕНО.

## Нарезка на задачи (второй заход)

| # | Что | Находки | Уровень | Цена |
|---|---|---|---|---|
| 6 | Заморозка десятой ошибкой ПИНа снимает живое, как отлучка: takeDownLive в ветке pin_limit (pin_attempts.ts) с повтором TakeDownRetry; тест «после десятой ошибки фраз, лайков, мэтчей нет»; поправить шапку take_down.ts | H1 | дефект дизайна | ~1 ч, pin_attempts.ts, тест |
| 7 | Снятие лайка на истёкшей фразе: взять фразу `FOR UPDATE` с `expires_at > now()` до DELETE, нет строки — `unliked()` без вычитания; тест двумя соединениями; заодно повтор 40P01 в циклах отлучки и закрытия | H2, H8, H3 | мелкое | ~45 мин, likes.ts, away.ts, identity.ts |
| 8 | Метрики: kind "welcome" в MAIL_KINDS и sendWelcome; metrics_zeros сверяет наборы меток с инкрементами; последний неверный ПИН в счёт wrong | H4, H5, H6 | мелкое | ~40 мин, mailer.ts, metrics_zeros.test.ts, pin_attempts.ts/маршруты |
| 9 | Стресс take_down: свои фразы, точная проверка likes_given, комментарий, очистка в finally | H7 | мелкое | ~20 мин, take_down_stress.test.ts |
