# Панель ревью 19.09.2026 — кит, листы, ворота, офферы и схемы в контракте

**Что ревьюили.** Ветка `day56`, диапазон `cd21688..HEAD` (ce45c75, dd6df5e, 639c182) плюс
незакоммиченная правка контракта (схемы из прозы: 6 новых операций, 128 всего).
Воспроизвести: `git diff cd21688`.

**Линзы.** Безопасность (обязательна), Протоколы и стандарты, Согласованность, Дизайн.
Каждая — отдельный агент, параллельно, без доступа к находкам остальных. Все только читали.

**Как читать.** Раздел «Сырьё» — отчёты агентов дословно, без правки. «Перепроверка» — вердикт
по каждой существенной находке. «Сводка» — что закрыто, что решает владелец, что отброшено.

---

## Сырьё

### Линза «Безопасность» (агент; прочтение кода, ничего не запускал)

1. **Design defect: the cabinet cookie on the shared origin.** See docs/offers/SPEC_RU.md:158-161 and docs/api/openapi.yaml:84-88. The reasoning is wrong. HttpOnly only stops a script from reading the cookie. An XSS in the neighbour app on sosed.place makes same-origin `fetch('/adv/...')` calls, and the browser attaches `adv_session` to them. Result: an XSS on the storefront means full control of any logged-in venue's cabinet (publish offers, answer complaints, change the address). Path=/adv does not protect against this, as the spec itself admits. Point fix: give the cabinet its own origin (adv.sosed.place) with a `__Host-` cookie and no Domain attribute. The minimum is a CSRF/Origin check on the state-changing /adv/* routes, plus a correction to the sentence at :159.
2. **Design defect, not described: `POST /vault/init`.** See openapi.yaml:2565-2579 and protocol_RU.md:97. The only auth is identitySignature, and the text says "the old PIN is not needed". I found no description of a state check, meaning the call is allowed only once, and only right after a completed transfer or recovery. Without it, anyone holding the signing key but not the PIN (a stolen or extracted key) replaces auth_hash/share and gets past the PIN lock and `pin_locked`. Fix: allowed only when the identity has a pending "first PIN" state set by approve/recovery, which the call consumes. Otherwise 409 or unauthorized.
3. **Design defect, not described: `/sessions/{lookup_id}/approve` and `/reject`.** See openapi.yaml:2580-2607 and protocol_RU.md:98. Nothing says the server checks that the signer is the same identity the transfer session belongs to. Nothing says whether the four characters are checked on the server or only by eye. Also missing: how long lookup_id lives, whether it is single-use, and the attempt limit. With only "any valid signature" as the check, any user can approve someone else's transfer if they know the lookup_id. Reject then gives a DoS on someone else's transfer. Fix: add one line to each: "the session belongs to the signing identity, otherwise not_found; single-use; TTL".
4. **Design defect: sybil/griefing on `/o/{code}/report`.** See openapi.yaml:~2345, "two counting reports from different people disable the link at once". The bar is two identities, and an identity costs one registration. That makes a competitor's link cheap to disable. Enforcement is instant with no moderation, and the text does not say how it gets restored. I did not find in SPEC §10.1 what makes a report "counting" (identity age, geography, having seen the card). If that is described there, this downgrades to a minor issue.
5. **Contradiction/minor: `/adv/venues/not-us` has no session.** See openapi.yaml:2450-2462 and SPEC_RU.md:759-761. The schema says the code has attempts counted and is burnt after several wrong ones (openapi.yaml:509). It does not say whether wrong attempts on not-us and on /verify share one counter. If they don't, not-us is a second brute-force channel with its own budget. The spec says "rate limit same as code entry", which covers frequency, not the attempt counter. Also the 204 answer is the same for a valid and an invalid code. That is good against an oracle, but then an honest owner gets no feedback. That is a product question, not a security one.
6. **Minor: enumerating `/o/{code}` and `/o/{code}/go`.** See openapi.yaml:2320-2344. security: [], with 200 (domain + disabled) vs a not-found response. I did not find the length or entropy of `code`, so offer links can be enumerated. Fix: set a minimum length (≥ 10 base32 characters) in the schema. /go is not an open redirect as long as external_url comes only from a moderated offer (SPEC:453-454).
7. **Minor, not described: age exposure in `InboxItem`.** See openapi.yaml:396-397. `name` + `age` are returned for kind=offer_interest as well, not only match/chat. I did not find whether showing age to the other side before a match is allowed. Check against chat_RU. `TableView.seats` gives out only names and hand_count, never tiles. I see no problem there.
8. **Minor: `eval()` in scripts/build-design-sheets.py:67.** The filter EXPR (:51) `^[\w\s.+\-*/()]+$` with `__builtins__={}` allows attributes and calls. For example `().__class__.__base__.__subclasses__().pop()`. There is no `[]`, but `.pop()` and chaining give a path to classic sandbox escapes. The input is SVGs from the repo itself, so the risk is low (the same trust level as the script). Point fix: replace eval with an `ast` walk allowing only BinOp/UnaryOp/Constant/Name, or forbid `_` and `.` outside digits in EXPR.
9. **Minor: href resolution in scripts/build-design-sheets.py:96-97.** `(base / file).resolve()` has no containment check, so `../../..` reads any XML file on the disk. Only XML is parsed and it does not leave the machine. Fix: `assert lib_path.is_relative_to(ROOT/"panel/design")`.

Not opened by the lens: scripts/check-design-spacing.mjs/.sh, design-palettes.py, design-kit-share.py, test_*.sh, protocol_RU §4.3/§4.11/§4.13 in detail.

### Линза «Протоколы и стандарты» (сжато ведущим, смысл и ссылки сохранены; агент; чтение openapi.yaml, SPEC_RU.md, точечно chat_RU.md и docs/dsa; валидатор OpenAPI не запускался)

1. **Критично.** Новые пути с шаблоном не объявляют path-параметры: `/o/{code}` (:2320), `/o/{code}/go` (:2332), `/o/{code}/report` (:2345), `/offers/{id}/complaints` (:2359), `/adv/venues/{id}` (~:2411), `/adv/venues/{id}/envelope`, `/adv/venues/{id}/verify`, `/adv/complaints/{id}/response` (~:2514), `/admin/offer-complaints/{id}/decision`, `/admin/venues/{id}/suspend`. По OpenAPI 3.1 §4.8.12.1 каждый шаблонный параметр обязан быть объявлен, иначе документ невалиден и генераторы клиентов падают.
2. **Противоречие.** `counts_towards_autohide` передано неполно (:2366–2367): канон SPEC_RU.md:385, :401 — первая публикация жалующегося старше суток и раньше дня выхода оффера, значение замораживается в момент жалобы.
3. **Противоречие.** `/o/{code}/report` (:2352–2353) не говорит, что незасчитанная жалоба идёт модератору с высоким приоритетом и ничего не гасит (SPEC_RU.md:670–674) и что она не расходует `COMPLAINT_MONTHLY_LIMIT` (SPEC_RU.md:665).
4. **Противоречие.** `/adv/venues/not-us` (:2457): «код из конверта, который по этому адресу никто не заказывал» — канон SPEC_RU.md:757–760 такого серверного условия не ставит; сервер знать этого не может. Гасится ли код после «это не мы» — не сказано ни там, ни там.
5. **Дефект дизайна.** `/o/{code}/go` (:2339, 2343): нет `Cache-Control: no-store` и `Referrer-Policy: no-referrer`; GET, считающий `redirect_hits`, накручивается превьюерами ссылок. 302 по RFC 9110 §15.4.3 корректен.
6. **Дефект дизайна.** `/o/{code}` (:2320–2331): нет 404 для неизвестного кода; 410 только на `/go`.
7. **Дефект дизайна.** Гашение ссылки не моделирует мотивировку по ст. 17 DSA (SPEC_RU.md:683–687; docs/dsa/CHECKLIST_RU.md:55): в `AdvOffer` только `redirect_disabled_at`.
8. **Дефект дизайна.** `OfferCreate.discount_until` без предела 90 дней (канон SPEC_RU.md:289), у `PhraseCreate` он есть.
9. **Мелочь.** `POST /adv/venues`, `POST /adv/offers` → 200; для создания точнее 201 с `Location` (RFC 9110 §15.3.2).
10. **Мелочь.** `POST /adv/venues/{id}/verify` → 409 на «неверный или погашенный код»; неверный — 422/400, погашенный — 409/410.
11. **Мелочь.** `POST /offers/{id}/complaints` → 202 без тела; нет 400/422 на отсутствие `notifier_email` (SPEC_RU.md:631).
12. **Мелочь.** CSRF для POST кабинета не описан ни в контракте, ни в каноне (SameSite=Lax не закрывает запросы с поддоменов витрины).

Сверено, расхождений нет: enum `span` [10, 30, 60, 260] (:445 ↔ chat_RU.md:2123, :2171); `ComplaintDecision.status`; `Venue.verification_status`; `AdvOffer.status`; обязательный `notifier_email`; жалоба на ссылку без почты; смена адреса → `unverified`. Спека чата по личностям, хранилищу, сессиям, мэтчам и столам сверена выборочно.

### Линза «Согласованность» (сжато ведущим, смысл и ссылки сохранены; агент; grep, пересчёт, чтение ворот)

1. **Противоречие.** `docs/design-system-app_RU.md:291` — «81 символ», `_EN.md:307` — «81 symbols»; в `components.svg` 92 (`grep -o '<symbol id='`). Коммит ce45c75 тоже говорит 92.
2. **Дефект.** `scripts/test_check-design-spacing.sh` и `test_check-design-text.sh` не подключены в `check-all.sh` (строки 95–151); подключён только `test_build-design-sheets.sh` (:100).
3. **Дефект.** У `scripts/design-palettes.py --check` нет пробы — его красным никто не видел.
4. **Дефект.** Слепые места `scripts/check-design-spacing.mjs`: меряет только `screen-*.svg`, не `app-kit.svg` (:29); видит только кнопки кита 40–60 (:44); правило низа пропускается, если блок касается низа кадра (:60); подпись дальше 30 px не проверяется (:51); лист с нулём кнопок — «✓» без предупреждения (:70). Реальных дефектов за этими дырами агент не мерил.
5. Правило «срок числом только у своей фразы» — нарушений не найдено.
6. Сверено: `build-design-sheets.py --check` 15/15; `design-palettes.py --check` 16 схем, 76 пар; в каждом `screen-*.svg` есть `data-kit="button-*"` (8–34).

### Линза «Дизайн» (сжато ведущим, смысл и ссылки сохранены; агент; смотрел 4 из 15 PNG: 03, 20-24 верх, light верх, часть app-kit)

1. **Дефект.** 03 кадр 5 и light кадр 2: «Есть у кого зарядка type-c на час?» доходит до правого края карточки без поля.
2. **Дефект.** 03 кадр 5: метка «один» выше сердца и «•••» примерно на 24 px (2x); то же у оффера частника.
3. **Дефект.** 03 кадр 1 и light кадр 1: между композером и таббаром видна полоса карточки («сесть» и шеврон) — выглядит как артефакт обрезки.
4. **Дефект.** 20 «во время ухода»: серые строки «Вы отошли…» и «осталось 41 мин» на чёрном — на глаз ниже 4.5:1 (не мерено).
5. **Дефект.** light, правая колонка: `--ok #9ecb7a` и `--err #ef7a6a` «как есть» нечитаемы на светлых землях.
6. **Противоречие.** 20 «предложение отойти»: нет таббара, пустая тёмная полоса под композером; композер закрывает весь ряд действий последней карточки.
7. **Не уверен.** Раста: зелёная тень под красной первичной и композером — нарочно ли.
8. **Не уверен.** Пунктирная рамка у своей фразы на проверке против правила «карточка — заливка без рамки».

---

## Перепроверка

Опровергающий — отдельный агент, по умолчанию «опровергнуто»; числа и строки ведущий проверил сам.

| Находка | Вердикт | Основание |
|---|---|---|
| Безоп. 1 — cookie кабинета на общем источнике | подтверждено | SPEC_RU.md:158-161 — только HttpOnly/SameSite/Path, про Origin/CSRF ничего (опровергающий, grep) |
| Безоп. 2 — `/vault/init` без предусловия | подтверждено | protocol_RU.md:97, openapi.yaml:2572; chat_RU.md:1248 требует прежний ПИН при смене |
| Безоп. 3 — approve/reject без проверки владельца | подтверждено частично | TTL 120 с описан (chat_RU.md:1079), владелец и одноразовость — нет |
| Безоп. 4 — сибилы на жалобах на ссылку | **опровергнуто** | SPEC_RU.md:669-671: засчитываются только жалобы тех, чья первая публикация старше суток и раньше оффера |
| Безоп. 5 — «это не мы» — второй канал подбора | подтверждено узко | SPEC_RU.md:760 — только «предел частоты как у ввода кода» |
| Безоп. 6 — перебор `/o/{code}` | мелочь, закрыто | `minLength: 10` у параметра пути |
| Безоп. 7 — возраст в `InboxItem` для `offer_interest` | не перепроверялось | уходит владельцу как вопрос приватности |
| Безоп. 8 — `eval` в сборщике | подтверждено ведущим | `scripts/build-design-sheets.py:67` до правки |
| Безоп. 9 — путь из href без ограничения | подтверждено ведущим | там же, `:96-97` до правки |
| Прот. 1 — нет параметров пути | подтверждено, шире заявленного | скриптом: 15 операций, плюс довоенная `/support/{no}/seen` (имя `no` YAML 1.1 читает как `false`) |
| Прот. 2 — неполное условие засчитывания жалобы | подтверждено | openapi.yaml:2366 против SPEC_RU.md:385, 401 |
| Прот. 3 — незасчитанная жалоба на ссылку | подтверждено | openapi.yaml:2352 против SPEC_RU.md:664-672 |
| Прот. 4 — «никто не заказывал» как проверка сервера | **опровергнуто** | SPEC_RU.md:757 говорит то же; это описание ситуации, не проверка |
| Прот. 5 — заголовки у `/go`, накрутка превьюерами | не перепроверялось | в долг |
| Прот. 6 — нет 404 у `/o/{code}` | не перепроверялось | в долг |
| Прот. 7 — мотивировка ст. 17 не в контракте | **опровергнуто** | SPEC_RU.md:683-687: уходит письмом, не полем ответа |
| Прот. 8 — нет 90 дней у `discount_until` | **опровергнуто** | openapi.yaml:460 — есть |
| Прот. 9–11 — 201, 422/409, тело 202 | не перепроверялось | мелочи в долг |
| Согл. 1 — «81 символ» | подтверждено ведущим | design-system-app_RU.md:291; `grep -o '<symbol id='` = 92 |
| Согл. 2 — две пробы не подключены | подтверждено ведущим | `grep test_check-design scripts/check-all.sh` = 0 |
| Согл. 3 — у проверки схем нет пробы | подтверждено ведущим | `scripts/test_design-palettes*` отсутствовал |
| Согл. 4 — слепые места ворот отступов | признано | заявлено в шапке самих ворот; в долг |
| Диз. 1 — «type-c на час?» у края карточки | подтверждено ведущим ранее глазом | виден на рендерах 03 и light |
| Диз. 2 — «один» не на линии сердца | не перепроверялось | в долг |
| Диз. 3 — полоса карточки под композером | подтверждено | вырез screen-03.png, кадр 1 |
| Диз. 4 — контраст на кадре 20 | **опровергнуто** | `--muted` #9a8d7c на #0d0b0a ≈ 6:1 (screen-20-21-22-24.svg:18-19) |
| Диз. 5 — `--ok`/`--err` на светлом | **опровергнуто** | нарочное исследование токенов: screen-light-03-08-23.svg:47, :718 |
| Диз. 6 — нет таббара на кадре 20 «предложение отойти» | подтверждено слабо | описание 20 (sosed.place `docs/20-*_RU.md:54-56`) о таббаре молчит |
| Диз. 7 — зелёная тень у раста | **опровергнуто ведущим** | тень `--shadow` схемы раста задана зелёной намеренно (`scripts/design-palettes.py`) |
| Диз. 8 — пунктир у своей фразы | **опровергнуто** | правило Н6, design-system-app_RU.md:416 |

## Сводка ведущего

**Закрыто тем же заходом** (все ворота и пробы зелёные после правок):
- параметры пути у 16 операций, у кода оффера `minLength: 10`; имя `"no"` в кавычках (Прот. 1, Безоп. 6);
- `/vault/init` — только по одноразовому праву «первый ПИН», иначе 409 (Безоп. 2);
- approve/reject — только сессией выдавшей личности, один раз, в 120 секунд (Безоп. 3);
- «это не мы» — общий счётчик попыток с вводом кода, в контракте и SPEC §11 RU/EN (Безоп. 5);
- условие засчитывания жалоб и судьба незасчитанной жалобы на ссылку (Прот. 2, 3);
- `eval` заменён разбором `ast`, путь к киту ограничен `panel/design`, две подсадки в пробу (Безоп. 8, 9);
- «81» → «92» символа в дизайн-системе RU/EN (Согл. 1);
- пробы ворот текста и отступов подключены в `check-all.sh --with-tests`, новая проба схем `test_design-palettes.sh` — 3 подсадки (Согл. 2, 3);
- полоса под композером: земля таббара поднята на 12 px (Диз. 3).

**Решено владельцем 19.09.2026 и внесено:**
- Безоп. 1 — кабинет на своём поддомене `adv.sosed.place` / `adv.neighbro.place`, cookie `__Host-adv` без `Domain`: SPEC §2.1 RU/EN, `advertiserSession`, протокол §4.13, адресная строка листа 17 (13 мест). DNS и сертификаты поддоменов — работа выката.
- Безоп. 7 — имя и возраст в `offer_interest` как в мэтче: лайк на оффер частника сразу даёт мэтч (SPEC §7); строка в описании `InboxItem`.
- Диз. 6 — на кадре 20 «предложение отойти» дорисован таббар, композер поставлен на 684, как везде.

**Отброшено:** Безоп. 4, Прот. 4, 7, 8, Диз. 4, 5, 7, 8 — опровергнуты, основания в таблице.

## Нарезка на задачи

1. ~~Кабинет: свой источник~~ — сделано 19.09.2026.
2. ~~Возраст в `InboxItem`~~ — сделано 19.09.2026.
3. ~~`/o/{code}/go`: заголовки, превьюеры; 404 у `/o/{code}`~~ — сделано 19.09.2026.
4. ~~201 у создания, 422/409 у кода, тело 202 у жалобы~~ — сделано 19.09.2026; у «это не мы» оставлен 204 на любой код, чтобы ответ не выдавал, существует ли код.
5. ~~**Ворота отступов: мерить `app-kit.svg`, предупреждать о листе без кнопок**~~ — **сделано 19.09.2026 вечером:** кит меряется (панель семейства вместо телефона), лист без кнопок назван строкой «!», низ блока меряется и у края телефона, кроме блока, уходящего за край; подписи листа (`cap`) и кнопки под покрытием и за краем не меряются. Найдено и исправлено: кнопка жалобы в 10 px от низа телефона (01-04-05). Проб 12, четыре новые красны на прежних воротах.
6. ~~**Дизайн: «type-c на час?» у края, «один» не на линии сердца**~~ — **сделано 19.09.2026:** «type-c» разнесено на две строки (ворота текста); у `card-phrase` слот `word` на линии лайка, пять ручных «один» (03, light, 01-04-05 ×2, 08) заменены им — стояли на 13 px выше.
