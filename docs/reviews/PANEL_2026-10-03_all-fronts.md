# Панель 03.10.2026 — все фронты на comic-web

- Дата: 03.10.2026. Ветка `comic-web` @ d373afde (содержит day58 @ c9e4e57f), xor.ad.
- Диапазон: `git log day58..comic-web` (31 коммит) и текущее состояние узла, веба, панели, depth.
- Линзы: безопасность, данные и СУБД, протоколы и стандарты, эксплуатация, согласованность; опровергающий — один агент по 12 находкам.
- Все линзы работали только чтением, docker не запускали.
- Предыдущая панель: `PANEL_2026-10-02_comic-web.md` (её находки не повторялись).

## Сырьё линз

Записано ведущим сжато, без изменения смысла и ссылок.

### security

Линза «Безопасность», comic-web @ d373afde, чтение diff day58..comic-web (205 файлов, в основном web/src). relay/panel/depth/витрины не в диапазоне.
1. Дефект дизайна (весомое). Предупреждения о необратимом ушли под ⓘ: Me.tsx:268-271 (reset.warning, reset.code), Departure.tsx:90-93 (move.price «переписка станет нечитаемой навсегда»). Раньше видимые <p class="warn">; Info держит текст в DOM только открытым (ui/Info.tsx:43). ПИН → reset-go (Me.tsx:278) / move-go (Departure.tsx:98) без слова «навсегда». Правка: вернуть видимыми или disabled до раскрытия.
2. Дефект дизайна. Кнопки необратимых/денежных действий только иконкой, текст в aria-label: Me.tsx:278, Departure.tsx:98, Cabinet.tsx (adv-send, adv-again, venue-add), Offer.tsx:72. Правка: kind="danger" и внешний переход — видимый текст.
3. Мелочь (стенд). docker-compose.web.yml:45,54,56 VITE_BRAND в psql -c строке → SQL-инъекция из env на стенде. Правка: проверка ^(sosed|neighbro)$ в run-web-tests.sh.
4. Не нашёл описания: frame-ancestors только в vite preview (vite.config.ts ~:120 CSP_HEADER); где ставит боевой шлюз/Bunny — не найдено.
Проверено чтением, дефекта нет: theme из localStorage (theme.ts:21-33,57-67), /kit и globalThis.xor за VITE_STAND (вырезание из бандла НЕ ПРОВЕРЕНО), idle.ts:17, нет innerHTML/eval, inline style через CSSOM, Offer.tsx href, Cabinet.tsx токен, usePhase.

### data

Линза «Данные и СУБД», comic-web @ d373afde, только чтение.
Ветка не трогает узел: diff c9e4e57f..d373afde -- relay depth пуст.
1. Дефект дизайна. Узел: likes.ts:152-168 отсекает блок (NOT EXISTS blocks :164), но не hidden_messages (034_hidden_messages.sql:10). Лайк в neighbro, затем «скрыть» в окне 5 с → useDeferredLike.ts:46 шлёт на размонтировании → узел засчитывает лайк скрытой фразе. Правка: веб — deferred.undo() перед hide; узел — NOT EXISTS hidden_messages в likes.ts:167 + тест. Правило продукта не найдено.
2. Дефект (до ветки). useFeed.ts:39-50 нет защиты от устаревшего ответа; cursor.ts:79 курсор = (micros,id), без радиуса. «Ещё» на r1, смена радиуса на r2 → страница r1 дописывается к r2, next от r1. Правка: reqId в ref или радиус в sealCursor.
3. Мелочь. useFeed.ts:41 склейка страниц без дедупликации по id; двойной «ещё» → повторы карточек и ключей.
4. Не нашёл описания: отказ/429 лайка на размонтировании (useCard.ts:72, likes.ts:82,:307) не виден — уточнение п.3 панели 02.10.

### protocols

Линза «Протоколы и стандарты», диапазон 1ac19904..d373afde. relay/, docs/dsa, docs/api, panel/src не менялись. check-openapi.sh: операций 151 (built 145, spec 6, proposed 0), сходятся.
1. Дефект. sosed тёмные темы: --line #3a2e20 к --bg #0d0b0a 1.49:1, --surface ~1.3:1 (blocks.css:84,91,95,107); док «рамка контрола ≥3:1, WCAG 1.4.11». Правка: поднять line в web/themes/sosed/dark*.json, ворота check-web-tokens.sh.
2. Дефект. neighbro/index.tsx:139-150 article role=button aria-label — оффер, условия, счётчик не читаются диктором (1.3.1, 4.1.2).
3. Дефект. neighbro/index.tsx:154 role=status «лайк уйдёт через n с» объявляется каждую секунду (тик useDeferredLike.ts:42); кнопка снятия внутри live-региона.
4. Дефект. neighbro/index.tsx:135-171 порядок обхода: сердце после цели, фокус не переносится; цель с aria-disabled — пустая остановка.
5. Мелочь. stickers.css:25 vs :30 .target перекрывает :focus-visible (2.4.7).
6. Противоречие. Док: кольцо 2px --accent-text offset 2; код styles.css:123 3px --focus offset 3, stickers.css:25 offset 6, :30 пунктир. Контраст проходит — отставший документ.
7. Противоречие. sosed/blocks.css:35 transition при reduced-motion (глушится только .ui-burst-pop, styles.css:134).
8. Мелочь. li role=button ломает список (neighbro/index.tsx:60-67, sosed/index.tsx:67-70, Feed.tsx:131).
9. Мелочь (3.1.2). Новые aria-метки по-русски в 15 словарях (de.json web.card.*).
Не нашёл описания: тема в localStorage (theme.ts:73) не в article-30/dpia.
Закрыто: 2.2.1 окно сердца (Likes.tsx:38-66), 2.5.7 drag дублирован.

### ops

Линза «Эксплуатация», comic-web @ d373afde, только чтение.
1. Критично. Стенды, убитые SIGKILL (таймаут Bash/артели), не подбираются: trap EXIT INT TERM не срабатывает, имя проекта с PID. scripts/run-web-two-people.sh:12,21-22, run-web-tests.sh:13,27, run-web-depth-mixed.sh:23,43, design/shoot-web.sh:28,35. Правка: жнец по docker compose ls -a, префиксы web-(two|e2e|mixed)-|shoot-web-, kill -0 pid, down -v --rmi local; звать в check-all.
2. Дефект. scripts/prune-web-images.sh:6 шаблон ^web-(e2e|report)-[0-9]+- не ловит web-two/web-mixed/shoot-web; только образы, контейнеры и тома не трогает. Правка: по метке com.docker.compose.project.
3. Дефект. check-all.sh:164 + run-e2e-paths.sh:28-38 --breaks поднимает стенд на каждую поломку (>10 сборок); кеш BuildKit растёт. Правка: собрать один раз под тегом; builder prune --filter until=24h.
4. Дефект. --keep / SHOTS_KEEP (run-web-tests.sh:24, shoot-web.sh:32) — стенд без срока. Правка: метка времени, жнец гасит старше N ч.
5. Мелочь. trap на INT/TERM не завершает скрипт (run-web-tests.sh:27, run-web-two-people.sh:22, run-web-depth-mixed.sh:43) — идёт дальше и поднимает контейнеры снова. Правка: trap 'exit 130' INT; 'exit 143' TERM как run-e2e-paths.sh:69-70.
6. Дефект. run-moderation-bench.sh:21-25 up -d guard без down — тяжёлый контейнер с моделью живёт.
7. Противоречие. verify-logs-local.sh:24,134 up -d --build relay/local без trap.
8. Противоречие. docs/deploy-prod_RU.md:47,52-53,61-66 описывает Supabase, который выведен.
9. Дефект. deploy-prod_RU.md:61 откат = прежний тег, при миграциях только вперёд (deployment_RU.md:341) — нужен шаг про дамп.
10. Мелочь. check-all.sh:150-160 не смотрит диск; при 96% сборка падает как красный тест.
Не нашёл описания: политика уборки docker на машине; алерт на диск боксов p1/n1; совместимость образа со схемой на шаг назад.

### consistency

Линза «Согласованность», comic-web @ d373afde, только чтение.
1. Дефект. docs/design-system-app_RU.md:496-526 (+EN до :542) описывает k-comic*, --comic-tilt, золото, сцены, «эталон красный» — удалено e7b4424e; тема теперь data-brand/data-theme из web/themes (794875ee/b77b706d), ворота против листов брендов (eb647f6f).
2. Противоречие. README.md:32 / README_RU.md:32 «терракота sosed, золото neighbro» — теперь blocks/stickers + light/dark/mono. Синхронизировать README sosed.place/neighbro.place.
3. Противоречие. roadmap_RU.md:33 «Веб-приложение»: эталон, «43 теста в 34 спеках» (сейчас 54 файла спеков, 55/9 на бренд), жалоба на ссылку решена 01.10 (c026fd10), «только moderation-path» устарело (51378f65).
4. Противоречие. roadmap_RU.md:168-171 «70 файлов, последняя 083» — сейчас 71, 084_chat_starters_message.sql; 875 тестов от 29.09.
5. roadmap_RU.md:165 «14 тестов в 12 спеках» против :33 «43 теста».
6. roadmap_RU.md:1,6-7 срез 29.09 day58=941388f0.
7. roadmap_RU.md:166 «жалоба на ссылку недостижима» — решено 01.10; в decisions.tsv нет.
8. roadmap_RU.md:207-208 акценты/шрифт бренда — решены 02.10.
9. decisions.tsv нет решений 02.10 (blocks/stickers, темы JSON, окно 5 с).
10. open.tsv не заведены задачи панели 02.10.
11. Мелочь. web-vs-sheets_RU.md:3 и коммит 1ac19904 называют разные эталоны на 02.10.
12. Мелочь. web/design/gen/themes.md не закоммичен.
prose_RU.toml: все as_of 29.09; :35 веб → бренды/темы; :31/:34 узел + W13-OR/HF/LN; :41-49 matrix vs flows :133; :62 W11-C, :64 бренды + W13-WL; :70-80 [day] целиком устарел (волны 11–13, W12-MRc, W13-WL, комикс→бренды); :88 has_not «сигнал об отказе модерации» неправда (cc205c50); :89 mig 084; :95, :97, :158 убрать сделанное/решённое; :113 salvage-wave6 устарело; :115 ворота на листы брендов + бренд-спеки skip; :127 замок web=yes (8e9e42b6); :128 W11-C; :125 смешанные пути; :153 summary.ready; :157 next[0] salvage сделано → задачи панели 02.10; :159 pagehide/sendBeacon — решение владельца; :19-24 среды 29.09.
Не нашёл описания: решение blocks/stickers как продуктовое; окно 5 с сердца; выбор темы на «я».

## Опровержения

Опровергающий (чтение):
D2 держится — useFeed.ts:39-50 нет флага live; смена радиуса во время подгрузки (useFeed.ts:52); cursor.ts:79 без радиуса. Правка: флаг live как useFeed.ts:62.
D3 опровергнута — Feed.tsx:154 прячет кнопку при loading, React 18 перерисовывает синхронно после клика.
D1-node опровергнута — hidden_messages личное скрытие (routes/hidden.ts:55), лента фильтрует (feed.ts:480,735); блок отсекается (likes.ts:163-165). Веб-часть (undo перед hide) — уже задача панели 02.10.
S2 держится — Me.tsx:278, Departure.tsx:98, Offer.tsx:72 только иконка; решения в docs не найдено.
S3 держится, риск низкий (оператор стенда).
S4 опровергнута сейчас — выката веба нет; панель: deploy/panel-security-headers.mjs. Пробел при будущем выкате.
O2 держится. O5 держится (нет exit в обработчике). O6 держится.
O8 опровергнута — deploy-prod_RU.md:3-12 баннер «прежний стек, история». O9 опровергнута — тот же исторический документ.
O10 частично — проверки места нет, пожелание.

## Сводка ведущего

Проверено ведущим:
- P1 контраст: скриптом по `web/themes/sosed/*.json` — 7 тёмных тем `line/bg` 1.49, `surface/bg` 1.22; светлые 3.53. ПРОВЕРЕНО.
- S1 предупреждения под ⓘ: `web/src/screens/Me.tsx:268-271` в Info; в day58 было `<p className="warn">` (Me.tsx:240). ПРОВЕРЕНО.
- C1 `docs/design-system-app_RU.md` упоминает k-comic/comic-tilt (2 строки), в коде этого нет. ПРОВЕРЕНО grep.
- C4 миграций 71, последняя 084. ПРОВЕРЕНО ls.
- O8/O9 сняты: баннер «прежний стек» `docs/deploy-prod_RU.md:3-12`. ПРОВЕРЕНО.
- D1-node снята опровергающим (личное скрытие, лента фильтрует); веб-часть — задача 1 панели 02.10.
- D3, S4 сняты опровергающим. Не проверено ведущим.
- prose_RU.toml обновлён агентом под 03.10 (см. diff).

## Нарезка на задачи

| # | Уровень | Задача | Цена |
|---|---|---|---|
| 1 | дефект | Предупреждения сброса и переезда вернуть видимыми над кнопкой (`Me.tsx:268-271`, `Departure.tsx:90-93`) | 30 мин + e2e |
| 2 | дефект | Рамка контрола в тёмных темах sosed до ≥3:1, пара line/bg в `check-web-tokens.sh` | 1 ч |
| 3 | дефект | Жнец брошенных стендов по PID в имени проекта + `prune-web-images.sh` по метке проекта (O1, O2, O4) | 2 ч |
| 4 | дефект | `trap 'exit 130' INT` в run-web-tests / two-people / depth-mixed (O5) | 15 мин |
| 5 | дефект | Флаг `live` в `useFeed.load` против устаревшей страницы (D2) | 30 мин + тест |
| 6 | дефект | Доступность карточки neighbro: имя статьи, live-регион отсчёта, фокус на цель, focus-visible (P2–P5) | 2–3 ч |
| 7 | противоречие | `design-system-app_RU/EN` раздел веба, README пары трёх репозиториев, roadmap срез 03.10, decisions.tsv 02.10, open.tsv задачи панели 02.10 | 2 ч |
| 8 | решение владельца | Кнопки необратимых действий только иконкой (S2) — видимый текст? | — |
| 9 | мелочь | reduced-motion у свайпа sosed (P7), li role=button (P8), aria-метки по-русски в словарях (P9), кольцо фокуса в доке (P6), guard в moderation-bench (O6), VITE_BRAND в psql (S3), проверка диска в check-all (O10) | по 15 мин |

## Закрыто 03.10 тем же заходом

- Задача 1 панели 02.10 (лайк при hide/block в окне сердца): `web/src/brands/neighbro/index.tsx` снимает сердце перед hide/block; `heart.spec.ts` шаги 5–6. Без правки красный «hidden inside the window: no POST /feed/:id/like». ПРОВЕРЕНО прогоном neighbro.
- Задача 2 панели 02.10 (бренд в воротах): `check-all.sh` гоняет `run-e2e-paths.sh` и на `VITE_BRAND=neighbro` (27/27 зелёные 03.10); `run-web-tests.sh` отказывает чужому бренду (закрывает S3).
- S1: предупреждения сброса и переезда видимы над кнопкой, `me.spec.ts`/`transfer.spec.ts` их держат.
- P1: `line` тёмных тем sosed 1.49 → 3.13:1 (mono-dark 3.08); `themes-css.py` краснеет на line/bg < 3:1, проба `test_themes-css.sh` это держит. Порог `web-design-baseline.tsv` для 8 тёмных кадров sosed поднят вручную на 0.6–1.7 п.п.: видимая рамка расходится с листом сильнее невидимой; кадры осмотрены.
- O5: `exit` по INT/TERM/HUP в трёх скриптах стендов; INT в `run-web-tests.sh` проверен — проект не остался.
- `neighbro-Feed-dark` +3.5px: внесён d373afde (кнопки ленты потеряли вид таблетки); опытом — со стилями родителя 36/36 зелёные; правило возвращено для `.feed`, ворота 36/36, e2e neighbro 55/9.
- `scripts/create-panel-user-local.sh` после SEC-1: кладёт бутстрап-запись и даёт токену окружение; проверено на стенде.
- C1–C10: документы и реестры (агент), пары 80/80.
- D2 (задача 5): `useFeed.ts` — поколение на каждый радиус, ответ прошлого поколения отбрасывается; `feed-stale.spec.ts` держит. Поломка (снят флаг) — 1 failed «a card of the old circle was drawn in the new one», 55 passed; с правкой 56/56. 7bd16fb8.
- P2–P5 (задача 6): карточка neighbro — `aria-labelledby`/`describedby`, отдельный скрытый `role=status`, фокус на цель, `:focus-visible`; `heart-a11y.spec.ts` краснел на каждой из четырёх поломок (агент). Экранным диктором не проверено. 58d76d40.
- Задача 3 (O1/O2/O4): ручной жнец `scripts/reap-web-stands.sh` (мёртвый PID и ничего не бежит), `prune-web-images.sh` берёт и two/mixed; вызов из раннеров не встроен — классификатор отказал автоснос чужих стендов. 281faffe.
- Задача 9 (агент): P6 док кольца, P7 reduced-motion свайпа, P8 `li` + кнопка `CardOpen` (`feed-list.spec.ts`), P9 пять меток на 15 языков + правило SAME_AS_RU в `check-web-i18n.sh`, O6 guard в moderation-bench (`test_moderation-bench.sh`), O10 `check-disk.sh`; S3 закрыта раньше. Каждые ворота видены красными. Веб против листов 36 кадров без роста; check-all быстрый 16/0/0. Около 300 ключей `web.*` в нерусских словарях — по-прежнему русская копия: отдельная задача.
