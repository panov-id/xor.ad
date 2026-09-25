# Панель ревью · 25.09.2026 · единый порядок блокировок (identity.lock.order)

- **Что:** ветка `day58`, незакоммиченный дифф поверх `ae1235a`: `relay/node/src/routes/identity.ts`
  (vaultInit, claimRecovery), `relay/node/src/routes/transfer.ts` (createInvite, approveInvite),
  `relay/node/src/lib/identity_sweeper.ts` (closeInactive, closeIdentities), тесты в
  `relay/node/test/{identity_routes,transfer_routes,identity_sweeper}.test.ts`, `docs/facts/open.tsv`.
- **Линзы:** безопасность, данные и СУБД, эксплуатация; verifier (effort xhigh) параллельно; опровержение
  отложенных находок отдельным агентом.
- **Воспроизвести диапазон:** `git diff ae1235a -- relay/node docs/facts/open.tsv` (до коммита — рабочее дерево).
- **Правило, которое вводит кусок:** всё, что двигает сессии, берёт блокировки в порядке
  доля (`vault_shares`) → `sessions` → `identities`; уборщик не ждёт доли (SKIP LOCKED) и держит строки
  `FOR NO KEY UPDATE`.

## Сырые находки

### Линза «Безопасность»

Линза «Безопасность» — сырой отчёт (без правки). Только чтение; всё НЕ ПРОВЕРЕНО исполнением.

Итог: критичных нет; 2 дефекта дизайна, 2 мелочи; вектор SKIP LOCKED-голодания не найден.

Д1. identity.ts:630-645, цикл перечитывания claim нового устройства. Комментарий «a move needs the share of the live session, held here» ложен для живой сессии без строки vault_shares (устройство только посажено, ПИН не ставило): FOR UPDATE ничего не блокирует, id попадает в held. Сценарий: два claim C1, C2 с кодом, живая T без share. Оба читают live=[T], ничего не блокируют; C1 замораживает T, вставляет N1, коммит; C2 ждал на freezeSession(T), UPDATE совпал с нулём строк, INSERT упирается в индекс одной живой сессии → 503. Угроза низкая (оба держат код, повтор проходит), но утверждение комментария ложно. Правка: после блокировки share на том же проходе SELECT id FROM sessions WHERE id = ANY($fresh) AND frozen_at IS NULL ORDER BY id FOR UPDATE; выходить, когда заблокированный набор совпал с прочитанным. Теста нет, на throw при pass 3 тоже.

Д2. transfer.ts:119-122: перепроверка в createInvite смотрит frozen_at, не closed_at. closeInactive (identity_sweeper.ts:149) ставит только closed_at, сессии замораживаются позже в closeIdentities (:322). Сценарий: уборщик держит share и сессии; callerOf видит closed_at NULL; bump last_seen_at ждёт на сессии; уборщик закрывает, коммит. createInvite берёт share, checkPin проходит, сессия не заморожена → 200, окно в закрытой личности. Ограничено: approveInvite отказывает 401 (transfer.ts:339). Правка: JOIN identities … AND i.closed_at IS NULL FOR SHARE OF s. В vaultInit закрыто условием closed_at IS NULL в UPDATE гранта.

М1. transfer.ts:111-122: перепроверка после checkPin. Ход закоммитил, пока createInvite ждал: неверный ПИН тратит попытку на сожжённой строке → 409 pin_mismatch, верный → 401. Оракул верности ПИНа для замороженного устройства в окне гонки; каждая попытка списывается. Правка: share FOR UPDATE → перепроверка → checkPin.

М2. Комментарий transfer.ts:114-118 перечисляет «an approval, a paper-code claim», не покрывает закрытие уборщиком.

Проверено, дефекта нет: замороженное не тратит грант (vaultInit :817-831); потерянный телефон не обгоняет код через approve (share → invite; mine :346 → 401; если approve первым — цикл claim находит T и замораживает); оракулов в 401 нет (побайтно как unauthorized(), identity_guard.ts:79-83); throw цикла → catch → обычный 503.

Голодание SKIP LOCKED: вектора нет — чужую share не заблокировать; подписанный запрос и так бампает last_seen_at (identity_guard.ts:~160); неподписанный claim без кода → 404 до транзакции. Вне диффа: support.ts:50 (allowFrozen) бампает last_seen_at замороженной — потерянный телефон может продлевать год бесконечно; было до диффа.
Вне диффа: vaultShare (identity.ts:745-760) в окне закрытия уборщиком отдаёт share закрытой личности до closeIdentities; получает сам владелец — мелочь.

### Линза «Данные и СУБД»

Линза «Данные и СУБД» — сырой отчёт (без правки). Одна находка проверена в контейнере postgres:16-alpine (scratchpad/lockprobe.sh), остальные чтением.

1. Дефект дизайна, ПРОВЕРЕНО экспериментом (агентом). identity_sweeper.ts:146-147 sessions … FOR UPDATE, identities … FOR UPDATE. FOR UPDATE конфликтует с FOR KEY SHARE, который неявно берёт любой INSERT в таблицу со ссылкой на sessions (nonces, pending_deliveries, socket_tickets, session_invites) или identities (sessions, support_requests, identity_stats, likes…). Reissue: identity.ts:1140 identities FOR UPDATE, затем :1202 INSERT INTO nonces (KEY SHARE на сессию); уборщик берёт долю SKIP LOCKED (reissue долю не держит), сессию FOR UPDATE, ждёт личность → цикл. Support: support.ts:69,123 KEY SHARE на личность, :132 на сессию — цикл тот же. Окно «человек вернулся через год». Замер: с FOR UPDATE — deadlock detected … while locking tuple in relation "identities", жертва уборщик; с FOR NO KEY UPDATE обе завершились. Правка: :146,:147 FOR NO KEY UPDATE (конфликтует с UPDATE, FOR SHARE, FOR UPDATE; совместим только с KEY SHARE). Снимает и исходный дедлок уборщик против claim. Тот же довод к stillTheCode (identity.ts:713) — мелочь. Теста уборщик против reissue/support нет.
2. Противоречие, НЕ ПРОВЕРЕНО живьём. identity.ts:1063 против :1096-1099: closeOnce — своя доля → identity_stats → личность (UPDATE) → сессии → доли остальных (burnShare). Сценарий: A закрывается; замороженный F делает claim с того же устройства — держит свою долю и строку F (разморозка), ждёт уникальный индекс sessions_one_live до решения A; A держит личность и ждёт строку F. Только если SELECT id FROM sessions (:1096, без ORDER BY) выдал A раньше F. Итог close 503, claim 409. Правка: перед takeDownLive взять доли всех сессий личности ORDER BY FOR UPDATE OF v и sessions ORDER BY id FOR NO KEY UPDATE.
3. Противоречие, мелочь, НЕ ПРОВЕРЕНО. identity_sweeper.ts:243-253: повторный проход одним оператором UPDATE sessions и UPDATE vault_shares, порядок CTE не определён. Десятый неверный ПИН (checkPin: доля → freezeSession) от личности, закрытой closeInactive, сессии ещё не заморожены → цикл. Правка: заранее взять доли пачки ORDER BY v.session FOR UPDATE OF v.
4. Мелочь. identity_sweeper.ts:136-144 сравнение по количеству got >= want, а не по составу: новая доля закоммичена между SELECT и другая заблокирована — счёт сходится. Результат — только ожидание на :146, не ошибочное закрытие. Правка: сравнивать множества v.session.
5. Мелочь. Доли исключённых личностей, взятые SKIP LOCKED, заблокированы до коммита пачки из 2000. Close на burnShare(F) ждёт пачку, а takeDownLive выставил SET LOCAL lock_timeout='2s' → close 503. Правка: состав без блокировки, блокировать только прошедших; или по личности на подтранзакцию.
6. Мелочь, до диффа. identity.ts:632-645: живая сессия без доли попадает в held без блокировки. Два claim с новых устройств: второй замораживает B, сажает C; первый упирается в sessions_one_live → 503. Правка: после цикла SELECT id FROM sessions WHERE identity=$1 AND frozen_at IS NULL ORDER BY id FOR NO KEY UPDATE и перечитать. Для сессий с долей цикл корректен (transfer.ts:311, pin_attempts.ts:55); лимит pass===3 ограничен.
7. Проверено, дефектов нет: keyset id > $1 (uuid побайтно, как ORDER BY id); проход с исключёнными возвращает picked=2000 и идёт дальше; каждый проход с нулевого uuid → исключённая возвращается через час. Ошибочное закрытие исключено. FOR UPDATE OF v SKIP LOCKED с JOIN блокирует только v. vaultInit/createInvite доля → sessions FOR SHARE → личность совпадает. away.ts nonces раньше личности.
8. Тесты. Паузы 300 мс не проверяют, что первый запрос встал в ожидание (transfer_routes.test.ts:243,281,514,516; identity_routes.test.ts:1826; identity_sweeper.test.ts:446,497) — на медленном CI тест пройдёт без гонки; правка: ждать pg_stat_activity wait_event_type='Lock'. Тест уборщик против claim (identity_sweeper.test.ts:429, комментарий :459): уборщик не ждёт и не перечитывает, а исключает по SKIP LOCKED — название и комментарий описывают другой механизм; регрессию к старому порядку поймает. pg_stat_database.deadlocks общий и сбрасывается с задержкой (не проверено); защиту дают статусы и sweepError.

### Линза «Эксплуатация»

Линза «Эксплуатация» — сырой отчёт (без правки)

1. Дефект дизайна: пропуски уборщика не видны. identity_sweeper.ts:144-145 — личности с занятыми долями (got < want) и выжившие на втором вопросе (picked − closed) не попадают ни в метрику, ни в лог: relay_identity_sweeper_total считает только закрытые, лог «swept identities» только при closed > 0. Сценарий 3 ч ночи: долю держит зависшая транзакция или клиент в цикле /vault/share — личность пропускается каждый час бессрочно, 365 дней не исполняются, дашборд в норме. IdentitySweeperSilent не сработает — проход завершается, last_pass_seconds обновляется. Правка: inc("relay_identity_sweeper_skipped_total", { reason: "share_locked" }, candidates.length - ids.length) и { reason: "survived" } на ids.length - shut.length.
2. Дефект дизайна: createInvite проверяет живую сессию после checkPin, а не до (transfer.ts:111 против :118-122). Телефон, замороженный одобрением/заявкой пока транзакция ждала долю, с неверным ПИН: checkPin списывает попытку со строки сожжённой доли, пишет relay_transfer_total{result="wrong_pin"} и отвечает 409 pin_mismatch вместо 401. Ложный счёт в алерте подбора ПИНа (alerts.yml:171, wrong_pin > 20/15m) и клиент снова просит ПИН при мёртвой сессии. Правка: SELECT 1 FROM vault_shares WHERE session=$1 FOR UPDATE → проверка живой сессии → checkPin (как vaultInit identity.ts:820-831).
3. Не найдено, где обработано: 503 заявки с нового устройства не метрится и не отличим от дедлока. identity.ts:639 бросает Error, catch :674-677 пишет log("error", "recovery claim failed on a new device") — различить только по тексту. У relay_recovery_claim_total нет result storage_failed (у vault_share и vault_init есть). Правка: inc(..., { result: "storage_failed" }) в catch; либо свой класс ошибки и { result: "sessions_moved" }. Тот же старый пробел в catch createInvite (transfer.ts:140-142).
4. Не найдено, где обработано: новые 401 не метрятся — identity.ts:831 (vaultInit), transfer.ts:122 (createInvite). Ложной тревоги нет: ответ побайтно как unauthorized() стража (identity_guard.ts:82,128), алертов на 401 в alerts.yml нет (grep). Но гонку «заморозили, пока ждали» не увидеть. Правка: inc(..., { result: "frozen_meanwhile" }).
5. Противоречие: identity.ts, комментарий «a third pass is a refusal», код :639 отказывает на pass === 3, т. е. на четвёртом чтении после трёх раундов блокировок. Поправить текст («the fourth read») или условие на pass === 2.
6. Противоречие: transfer.ts:117 «opened a window of 200» двусмысленно — лучше «answered 200 and opened an invitation».
7. Мелочь: годовой бэклог. Keyset id > $1 — улучшение (раньше каждая пачка заново проходила активных), за проход один обход индекса; предел 500×2000. Каждая пачка — пять запросов, у каждого 15 с statement_timeout (db.ts:24-27). Доли SKIP LOCKED, но sessions FOR UPDATE на :146 ждёт; пока ждёт, взятые доли до 2000 личностей держатся, их маршруты стоят до 15 с. Задеты только вернувшиеся через год. Правка по желанию: SET LOCAL lock_timeout = '2s' (как take_down.ts:27, likes.ts:104) плюс catch с continue или счётчиком.
8. Мелочь: два узла после истечения аренды. Раньше кандидатов разводил FOR UPDATE SKIP LOCKED, теперь оба идут по одним id. Чтением: доли SKIP LOCKED, сессии и личности ORDER BY id → цикла ожиданий нет; второй узел дублирует работу, closed_at IS NULL даёт ему ноль. Корректно, но пропуски второго узла тоже не видны.
9. Цифры в комментариях сходятся с docs/facts/open.tsv:165 (9/9, 5/5, 3/3, 3/3); ссылка identity.lock.order есть.
10. Новая сессия, вставленная заявкой в гонке, в sessions FOR UPDATE не попадёт; второй вопрос с clock_timestamp() её видит — корректно.

### Verifier (первый проход)

Verifier (effort xhigh) — сырой отчёт, сжатый пересказ по пунктам без изменения сути; проверял дерево 15:10–15:25 (дифф 378+/24-), дерево менялось во время проверки.

Утверждения: 1 ПРОВЕРЕНО (vault/init: HEAD 9/9 deadlock, рабочее 0/9; поломка перечита FOR SHARE → «frozen session's vault/init answered 204»; поломка блокировки доли краснеет только в части с закрытием). 2 ПРОВЕРЕНО (HEAD «approve 200 and invite 503 deadlocked»; поломка перечита в createInvite → «window answered 200»). 3a ПРОВЕРЕНО (HEAD «claim answered 503»). 3b НЕ ПРОВЕРЕНО — throw на третьем проходе не вызвать снаружи. 4a ПРОВЕРЕНО (sweep-vs-claim на HEAD deadlock; поломка SKIP LOCKED → «sweep and a close deadlocked»; VERIF5: пропущенная личность закрыта следующим проходом). 4b НЕ ПОДТВЕРДИЛОСЬ: тест с заявкой не исполняет путь «сессии → личность → перепроверка» — уборщик пропускает личность (VERIF4, closed:0), имя и комментарий описывают несуществующий путь. 5 ПРОВЕРЕНО на дереве 15:10: 343 passed, exit 0; на снимке 15:39:47 красный — «the sweep and a reissue's nonce…» deadlock. 6a ПРОВЕРЕНО для четырёх тестов. 6b НЕ ПОДТВЕРДИЛОСЬ: «sweep yields to a close that holds one of two shares» на HEAD зелёный — охраняет SKIP LOCKED внутри нового кода, а не отличие от HEAD.

Находки: 
1. Регрессия уборщик против POST /recovery/reissue (identities FOR UPDATE identity.ts:1140 → INSERT nonces KEY SHARE; уборщик sessions FOR UPDATE → identities FOR UPDATE identity_sweeper.ts:146-147). P4c через маршрут: рабочее дерево 6/6 deadlock, reissue 503; HEAD 0/6, 204. На снимке 15:39:47 P4c всё ещё 6/6.
2. Новый deadlock vault/init (и createInvite в проверенной версии) против догоняющего прохода (identity_sweeper.ts:228-267: одна команда замораживает сессии, потом жжёт доли); маршруты берут долю → FOR SHARE сессии. P2: vault/init 3/3 и invite 3/3 deadlock, жертва уборщик; у закрытой личности live=1 unburned=1 до повтора задачи (jobs.ts:190, 30 с). HEAD invite 0/3. На снимке 15:39:47 invite 401 без deadlock, vault/init 3/3.
3. Было и на HEAD: заявка с нового устройства 503, когда нет строки доли для очереди (цикл identity.ts:632-645 при fresh.length === 0 ничего не блокирует). P5: единственная сессия заморожена pin_limit, заявка того же устройства + нового → новое 503 3/3 (рабочее, HEAD, снимок). P6: живая без доли, две заявки новых → вторая 503 3/3 (HEAD так же); на снимке 15:39:47 обе 200.
4. Фильтр got >= want (identity_sweeper.ts:144) не охраняется тестом: без него полный прогон зелёный 343/0; но нужен — VERIF3 (закрытие в порядке closeOnce) без фильтра deadlock 3/3, с ним 0/3.
5. Keyset (identity_sweeper.ts:114/163) не охраняется тестом (поломка — прогон зелёный); последствие не воспроизведено (нужно > 2000 переживших).
6. createInvite на закрытой за время ожидания личности отвечал 200 и в проверенной версии, и на HEAD (P2-invite); на снимке 15:39:47 — 401.
Служебное: пробы scratchpad/probes/*.ts, логи scratchpad/runs/; первая команда сделала rm -rf scratchpad/head и scratchpad/wt без проверки.

## Опровержения

Находки, закрытые правкой, опровержению не отдавались: каждая воспроизведена тестом, красным на коде без правки (это сильнее опровержения чтением). Отдельному агенту отданы четыре отложенные.

Опровержение (агент, только чтение) — сжатый пересказ.
F1 identity.close.lockorder — подтверждается чтением, с поправкой: close ждёт не строку F, а долю F — freezeSession(F) для уже замороженной ничего не лочит (sessions.ts:83, WHERE frozen_at IS NULL), ждёт burnShare(F) (sessions.ts:118). Цикл реален только если F заморожена pin_limit (доля не сожжена). Замыкание: claim держит долю F; close замораживает A и ждёт burnShare(F); claim на sessions_one_live (db/022:134) ждёт незакоммиченный close. Жертва — кто начал ждать первым (deadlock_timeout 1 с < lock_timeout 2 с): close 503 (catch :1123) и claim 409, либо claim 409 и close 200. Окно узкое, достижимое.
F2 sweeper.batch.shareheld — механизм подтверждается (identity_sweeper.ts:140-141 SKIP LOCKED держит доли исключённых до коммита; close исключённой ждёт burnShare под lock_timeout 2s, take_down.ts:27; повтор closeIdentity :1033 ловит только TakeDownRetry); 503 только если пачка идёт дольше 2 с — чтением не решить.
F3 support.frozen.bump — подтверждается чтением (support.ts:50 allowFrozen; guard бампает last_seen_at; год в identity_sweeper.ts:116,:166 замороженные не исключает; комментарий GuardOptions.allowFrozen говорит об одном исключении — claim того же устройства). Оговорка: нужен активный подписанный POST /support раз в год от держателя ключа — продуктовое решение.
F4 tests.race.waitlock — подтверждается частично: нет опроса pg_stat_activity wait_event_type='Lock' (как в feed_publish.test.ts:2288). Пройдут без гонки тесты, где утверждения только о приросте deadlocks/нет ошибок/не закрыта (identity_routes:1983, identity_sweeper:456-463); transfer_routes.test.ts:243 последовательный порядок ловит.

## Сводка ведущего

Закрыто тем же заходом (у каждого пункта тест; ПРОВЕРЕНО мной: без правки тест красный с приведённым сообщением, с правкой зелёный, полный прогон 349 passed в 10 файлах):

| Находка | Кто | Правка | Красный без правки |
|---|---|---|---|
| createInvite: ПИН смотрится раньше живости сессии; окно в закрытой личности | безопасность Д2, М1; эксплуатация 2 | доля → живая сессия и незакрытая личность → 401 `moved_meanwhile` → checkPin | `wrong PIN answered 409 … attempts_left 9` |
| Уборщик `FOR UPDATE` против key-share от INSERT (reissue, support) | данные 1; verifier 1 | `FOR NO KEY UPDATE` на sessions и identities | `sweep and a reissue deadlocked` |
| Две заявки над живой сессией без доли | безопасность Д1; данные 6 | цикл блокирует и строки сессий | `second queued claim answered 503` |
| Заявка нового устройства при единственной сессии, замороженной pin_limit | verifier 3 | цикл берёт доли и строки всех сессий личности | `new-device claim answered 503` |
| Догоняющий проход против vault/init | verifier 2; данные 3 | пачка → её доли ORDER BY → прежний CTE | `vault/init and the catch-up pass deadlocked` |
| Фильтр «все доли взяты» не охранялся | verifier 4 | тест закрытия дополнен порядком closeOnce | `sweep and a close deadlocked` |
| Пропуски уборщика не видны; 401 и 503 не метрятся | эксплуатация 1, 3, 4 | `relay_identity_sweeper_skipped_total{reason}`, `moved_meanwhile`, `storage_failed` | не тестировалось (метрики) |
| Имя теста «уборщик против заявки» описывало не тот путь | данные 8; verifier 4b | переименован в «yields to» | — |

Отброшено: явная блокировка строк сессий в догоняющем проходе — без неё тест зелёный, нужность не доказана, строка убрана.

Записано в `docs/facts/open.tsv` (опровержение их не сняло; мной не воспроизведены — НЕ ПРОВЕРЕНО):
`sweeper.batch.shareheld` (второй verifier воспроизвёл механизм при искусственной задержке пачки 3,5 с: закрытие под lock_timeout 2s отменено через 2435 мс; реальный повод для такой задержки не измерен), `support.frozen.bump`, `tests.race.waitlock`.

`identity.close.lockorder` закрыт после второго verifier — см. ниже.

Не охраняется тестом: keyset уборщика (verifier 5) — нужно больше 2000 переживших кандидатов; ветка `throw`
четвёртого прочтения в заявке (verifier 3b) — снаружи не вызвать.

## Второй проход verifier (окончательное дерево)

Полный прогон 349 passed (два прогона), прошлые пробы зелёные, метрики `moved_meanwhile`, `skipped_total{share_held,came_back}`, `storage_failed` растут на своих путях (его пробы W4, W5).

Главная находка: **мой цикл заявки, взявший доли всех сессий, сам дал deadlock с закрытием** — заявка с нового устройства против закрытия A, когда у личности есть сессия F, замороженная по pin_limit, с несожжённой долей и id раньше A: 3 из 3, заявка 503 (на HEAD не было). ПРОВЕРЕНО мной его пробами W1/W1r. Исправлено: `closeOnce` берёт доли всех сессий личности по порядку в самом начале. Тест «a close and a claim from {a new device | the frozen sibling} over a PIN-locked sibling…»: на старой блокировке закрытия красный (`claim 503` и `claim after the close answered 409`), на новой зелёный. Второй случай и есть отложенный `identity.close.lockorder` — закрыт тем же.

Тесты, которые по его мутациям охраняют не то, что названо (оставлены, записаны честно): «catch-up pass waits on a invite» охраняет проверку «личность не закрыта» в createInvite, а не порядок прохода; «two paper-code claims over a shareless live session» краснеет только без блокировки строк и без чтения всех сессий вместе; «sweep yields to a claim» — только без фильтра и со старым порядком вместе; повторные проходы цикла заявки ни одним тестом не нагружены. Новые метрики ни один тест и ни один дашборд не читают.

## Третий проход verifier (правка закрытия)

Полный прогон на копии 351 passed; W1/W1r зелёные (close 200, claim 404); 120 пар закрытия с 15 писателями (W9), догоняющий проход (W2, W3), W8, W14 — deadlocks 0, ни одного 503. Новые тесты стабильны 3/3 и краснеют при откате closeOnce. ПРОВЕРЕНО им; я перепроверил W10/W11 на своём дереве.

- Вариант теста «the frozen sibling» охраняет не deadlock своего имени: при откате он падает на 409, а сам deadlock `identity.close.lockorder` возникает, только когда закрытие перечисляет A раньше F. Verifier вызвал его пробой W15: старый код 4/4 deadlock (close 503, claim 409), новый 4/4 без deadlock. Тест репозитория оставлен как есть.
- **Закрытие ждало пачку уборщика до statement_timeout** (ожидание переехало в первый оператор, до lock_timeout в takeDownLive): пачка 3,5 с → close 200 через 3,6 с; 20 с → 503 через 15 с с занятым соединением пула. Исправлено: `SET LOCAL lock_timeout = '2s'` в начале closeOnce. ПРОВЕРЕНО мной пробой W10: 503 через 2019–2029 мс в обоих порядках и при 3,5 и 20 с, deadlocks 0. Цена: при пачке 2–15 с закрытие снова отвечает 503, как на HEAD.
- Устаревшие комментарии (identity_sweeper.ts, identity.ts ×2, тест уборщика) переписаны под новый порядок закрытия.
- Пути закрытия (повтор nonce, два 404) тестами не охраняются — записано `identity.close.paths.untested`.
- Было до куска: запрос в поддержку, вставший за закрытием, привязывается к закрытой личности; следующий проход уборщика привязку снимает (W12, W12b). Не записано отдельным пунктом — самолечится за час.

## Нарезка на задачи

1. ~~identity.close.lockorder~~ — закрыт 25.09.2026 (выше).
2. **tests.race.waitlock** — comfort. Заменить паузы 300 мс ожиданием `pg_stat_activity wait_event_type = 'Lock'` (образец `feed_publish.test.ts:2288`) в тестах этого куска. Цена: помощник и замена в ~8 местах.
3. **sweeper.batch.shareheld** — comfort. Блокировать доли только прошедших кандидатов или `lock_timeout` на пачку. Цена: правка уборщика и тест с долгой пачкой.
4. **support.frozen.bump** — продуктовое решение: считать ли обращение в поддержку с замороженного устройства использованием на год. До решения — ничего.
5. Keyset уборщика без теста — comfort; тест с BATCH, уменьшенным через параметр, если он появится.
6. identity.close.paths.untested — три теста на повтор nonce и 404 закрытия; comfort, полчаса.
7. Метрики `moved_meanwhile`, `relay_identity_sweeper_skipped_total` — на дашборд `relay-identity.json` и, для `share_held`, алерт на рост без убывания. Цена: правка дашборда и alerts.yml.

## Волна workflow по остаткам (25.09.2026, поверх 78f7252)

Четыре потока в отдельных worktree, вливание по очереди S3 → S4 → S2 → S1, все влились без отказов (workflow `wf_bc5afe2e-27f`, 7 агентов). Worktree поднимались на 684a103, а не на 78f7252 — каждый исполнитель сам перевёл свою ветку на 78f7252 до работы; патчи сняты от 78f7252.

- **S1 тесты гонок:** помощник `queuedBehind` (рекурсия по `pg_blocking_pids` от держателя, `pg_stat_clear_snapshot()`, 5 с и читаемое сообщение) вместо 18 пауз в `identity_routes` и `transfer_routes`; три теста путей закрытия (повтор nonce + `relay_nonce_replay_total`, 404 без доли, 404 сожжённой). Закрыты `tests.race.waitlock`, `identity.close.paths.untested`.
- **S2 уборщик:** SKIP LOCKED под точкой сохранения, откат снимает доли исключённых; тест «a stalled batch keeps no share…» (на 78f7252 — `canceling statement due to lock timeout`), тест keyset на настоящем BATCH=2000; ожидание блокировки в тестах уборщика.
- **S3 наблюдаемость:** `skipped_total` на панели 10, новая панель 17 «Первый ПИН после переноса», тревоги `IdentitySweeperKeepsSkipping` и `RecoveryClaimCannotWrite`; `promtool` SUCCESS, 16 правил, 28 рядов существуют.
- **S4 документы:** абзац о порядке в `chat_RU.md`/`chat_EN.md` §8.2, строка `chat.2026-09-25.lockorder` в `decisions.tsv`.

Verifier (ПРОВЕРЕНО им, 12 мутаций, два полных прогона 356) подтвердил потоки; линза «Безопасность» серьёзного не нашла. Закрыто ведущим тем же заходом: тест «a stalled batch…» висел вечно при провале ожидания — держатель доли отпускается в `finally` (принудительный провал теперь красный за 130 мс); в абзаце «не дольше 2 с» уточнено как предел на одно ожидание (verifier: close 200 через 3470 мс при двух ожиданиях); 76 адресов реестров, сдвинутых абзацем, переписаны `scripts/readdress-facts.py --write`; `sweeper.batch.shareheld` переписан под остаток (доли обрабатываемых личностей при ожидании строк сессий — на 78f7252 то же); дефекты тревог записаны `observability.lockorder.alerts`. Полный прогон после последней правки: 356 passed в 10 файлах; `test_alerts.sh` SUCCESS.

Не сделано: `count-tests.sh --check` красный и на 78f7252 (`docs/test-map` говорит 545/592 при 561/608) — не из этой волны; потолок в 5 попыток точки сохранения тестом не исполняется.

## Уборщик не ждёт строк (25.09.2026, поверх 0d10f6e)

`closeInactive` в той же точке сохранения берёт и строки сессий и личности `FOR NO KEY UPDATE SKIP LOCKED`; личность, у которой хоть что-то занято, уходит в следующий проход, пропуск считается `row_held`. Тест «a batch skips an identity whose session somebody holds…»: на уборщике 0d10f6e красный («the sweep waited on a session row somebody held»). Закрыт `sweeper.batch.shareheld`.

Verifier (ПРОВЕРЕНО им): 357 passed; 360 раундов против 15 маршрутов (V9) — deadlocks 0, 5xx 0; пачка из 2000 с одной удержанной сессией держит блокировки 130 мс (V4); счёт share_held/row_held/came_back без двойного счёта (V1–V3). Его находки, закрытые тем же заходом:
- **Перепроверка года больше не охранялась** — мутация без неё оставляла набор зелёным, а его проба V2 закрывала вернувшегося. Новый тест «a person back between the pick and the locks…» останавливает уборщик между выбором и блокировками (`LOCK TABLE vault_shares`) и коммитит бамп в этот зазор; без перепроверки красный («a person who came back while the sweep waited was closed»).
- **Тревога не видела удержанную строку** — `IdentitySweeperKeepsSkipping` теперь `reason=~"share_held|row_held"`, случай в `alerts.test.yml` (с одним share_held — FAILED), описание панели 10 дополнено.
- Абзац §8.2: «пока ждёт» снято (пачке ждать нечего), в EN подлежащее — годовой проход, а не закрытие.

Оставлено, записано здесь: мутации `ident_wait`, `no_own`, `all_share`, `keep_locks`, `sess_full` полный набор не валят — эти страховки тестом не держатся; «a stalled batch…», «a person back after a year…», «a reissue's nonce…» теперь проходят через пропуск, а не через названный механизм. Потолок в 5 попыток и счёт его пропуска как share_held — в `observability.lockorder.alerts`.

## Тревоги без обходных выражений (25.09.2026, поверх e6b732a)

Ряды `relay_identity_sweeper_skipped_total{reason}` (share_held, row_held, came_back) и `relay_recovery_claim_total{result="storage_failed"}` узел заводит нулём при загрузке — `increase()` видит первое событие после рестарта, и у `RecoveryClaimCannotWrite` снята ветка `unless … offset`, которая срабатывала на пропуске скрейпа (находка verifier). Тесты: два в узле («…published at zero…», красные без заведения рядов) и случай «a scrape gap over an old storage_failed is not an alert» (на старом выражении FAILED на 1h30m); случай рестарта переписан под форму ряда, которую выдаёт код. Остаток пункта `observability.lockorder.alerts` — только счёт выброшенных потолком как share_held.
