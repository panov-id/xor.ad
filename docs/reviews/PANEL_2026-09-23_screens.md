# Панель ревью · 23.09.2026 · экраны терминала и GET /likes

- **Что:** ветка `day56`, коммиты `0b3abad` (мотивировка по ст. 17 в `depth`) и `3fd4faa`
  (`GET /likes` на узле, лайкнутое вне `GET /feed`, экран «лайкнутое» в `depth`).
- **Воспроизвести диапазон:** `git diff 8e05b0a..3fd4faa`.
- **Линзы:** безопасность, данные и СУБД, согласованность. Эксплуатация не звалась: новых
  задач, почты и порядка выката в кусках нет.
- **Опровержение:** один агент на четыре существенные заявки (S1, D1, D2, C2); мелкие ведущий
  сверил сам по коду.

## 1. Сырьё линз (без правки)

### Безопасность

Линза «Безопасность», диапазон 8e05b0a..3fd4faa. Я только читал код, ничего не запускал: на хосте нет `node`, в контейнер я не ходил.

**Нашёл дефекты**

1. **Дефект дизайна: лайк вслепую плюс GET /likes дают оракул и позволяют читать мимо геофильтра.** Узел отвечает на POST /feed/:id/like одинаковым `liked`, засчитан лайк или нет (relay/node/src/routes/likes.ts:82, :129). В INSERT (likes.ts:110-126) проверяются возрастной диапазон, блок и `closed_at`, но **не расстояние**. Сценарий: A узнаёт id фразы из ленты знакомого в другом городе, ставит лайк, потом вызывает GET /likes (likes.ts:386-399). Там геофильтра тоже нет, и в ответ приходят `text`, `lat`, `lon`, `like_count` фразы, которой нет в ленте A. Появилась карточка в списке или нет — это ответ на вопрос, скрытый одинаковым `liked`: жива ли фраза, в диапазоне ли автор, закрыт ли он. Исправление точечное: в INSERT на likes.ts:110 добавить то же условие пересечения кругов, что в feed.ts, либо фильтровать по гео в `myLikes`.

2. **Мелочь: мусорный курсор даёт 503 и строку в логе ошибок.** Проверка на likes.ts:372 пропускает 19-значное `at` больше int8 max, `at`, которое выводит метку за пределы timestamptz, и `id` из 36 дефисов, потому что `UUID = /^[0-9a-fA-F-]{36}$/` (likes.ts:28). Postgres отвечает ошибкой, `query` возвращает null, узел пишет в лог «database query failed» с SQL, отвечает 503 и увеличивает `relay_likes_list_total{result="unavailable"}` (likes.ts:401-403). Так можно засорить алерты недоступности; скорость ограничена 300 запросами в час на личность. Для сравнения: лента на том же мусоре отдаёт пустую страницу (`?? []`). Исправление: строгий UUID-регэксп и верхняя граница `at`, например `BigInt(at) <= 2^53*1000`, иначе 400.

3. **Мелочь: текст с узла попадает в терминал мимо `plain()`.**
   - depth/ink/rooms.ts:383: `say(\`statements.${s.restriction}\`)`. Для неизвестного ключа `say` возвращает сам ключ (depth/ink/strings.ts, `?? key`), так что строка `restriction` с ESC-последовательностью печатается как есть.
   - rooms.ts:460: `${r.like_count}` без проверки, что это число.
   - Исправление: список допустимых значений для `restriction`, `Number(r.like_count)` для счётчика.

4. **Мелочь: `id` с узла подставляется в путь без кодирования.** В depth/core/client.ts:206 и :211 путь собирается как `` `/feed/${phraseId}/like` ``. Если `id` из /likes равен `../hidden/X`, клиент подпишет DELETE на чужой маршрут. Узел и так своя сторона, поэтому риск низкий. Исправление: `encodeURIComponent`.

5. **Мелочь, не проверено: даты с узла могут уронить экран постановлений.** `Intl.DateTimeFormat.format(Invalid Date)` бросает RangeError (rooms.ts:377, 384). Если `created_at` или `until` не число, упадёт отрисовка, а экран открывается сам при первом входе в ленту (depth/ink/app.ts:53-61). Экспериментом не подтверждено: `node` на хосте нет.

6. **Мелочь: `CONTROL` не вырезает управляющие символы направления текста.** Регэксп в depth/ink/parts.ts:162 пропускает U+202A–202E и U+2066–2069. Фраза в ленте или в /likes может визуально переставить свой хвост, это подмена вида внутри строки. Исправление: добавить эти диапазоны в `CONTROL`.

**Проверил, проблем нет**
- Лимит скорости: GET /likes списывает из того же ведра `feed-read`, 300 в час (rate_limit.ts:168; likes.ts:357). Обхода не видно.
- SQL-инъекция: всё передаётся параметрами, `LIMIT` — константа.
- Исключение лайкнутого из ленты (feed.ts:361-364) и поле `matched` (likes.ts:381-384) смотрят только на личность `$1`/`$15`. Чужие лайки и чужие совпадения не раскрываются.
- Блок: /likes фильтрует блок в обе стороны (likes.ts:392-394). Карточка, пропавшая после блока, — тот же сигнал, что и пропажа из ленты. Нового оракула нет.
- Во всех остальных местах, где печатается текст с узла, `plain()` стоит: `facts` (rooms.ts:398), `ground_text` (:404), `text` (:452).

**Не нашёл, где это обрабатывается**
- Заявитель в постановлении. В клиентском типе `Statement` (client.ts:50-59) поля заявителя нет. Раскроет ли его свободный текст `facts`, зависит от маршрута GET /statements на узле и от того, что пишет модератор. Маршрута нет в этом диффе, я его не открывал.
- Подмена экрана постановлений. Узел, который отдаёт `items`, может показать поддельное «ограничение» под красной рамкой. Подписи или проверки происхождения я не нашёл, но узел и так доверенная сторона.
- Лайк на скрытую фразу. /likes не проверяет `hidden_messages`. Это касается только самого зрителя, утечки нет.

### Данные и СУБД

Линза «Данные и БД», диапазон 8e05b0a..3fd4faa. Код я читал, но ничего не запускал: ни EXPLAIN, ни тестов.

**Нашёл дефекты**

1. **Противоречие. Плотность считает лайкнутые фразы, лента их больше не показывает.**
   - Где: исключение по `likes` добавлено в ленту в `relay/node/src/routes/feed.ts:363-364`. В запросе плотности (`feed.ts:538-575`) его нет. Там нет и `hidden_messages`, этот пробел был и раньше.
   - Сценарий: вокруг 5 фраз, я лайкнул все 5. `GET /feed/density` отвечает «есть» (не «пусто»). `GET /feed` на первом радиусе пуст, поэтому цикл в `feed.ts:282-383` расширяет радиус до `RADIUS_CEILING` и отдаёт чужие фразы с `farther_than_asked`. На том же круге ручка говорит «здесь есть», а лента — «здесь пусто».
   - Исправление: добавить в `density` тот же `NOT EXISTS (SELECT 1 FROM likes l WHERE l.liker_identity = $12 AND l.feed_message_id = f.id)`. Для `hidden_messages` сделать то же.

2. **Противоречие, в коде оно задокументировано. Оффер в списке помечен `liked`, а удалить лайк нельзя.**
   - Где: `likes.ts:420` ставит `state: "liked"` любому лайку, у которого нет матча, в том числе на оффер. `unlikePhrase` на оффер отвечает `spent` без условий (`likes.ts:260-268`).
   - Сценарий: клиент рисует у оффера кнопку «забрать лайк», а сервер отказывает. В комментарии `likes.ts:327-328` это названо, но отличить такую карточку клиенту нечем.
   - Исправление: отдавать `matched` (или отдельное состояние), когда `f.discount_value IS NOT NULL`. Так сойдётся с правилом удаления лайка.

3. **Мелочь. Курсор длиной 19 цифр даёт 503 вместо 400.**
   - Где: `likes.ts:372` пропускает `^[0-9]{1,19}$`, то есть и `9999999999999999999`, а это больше максимума bigint. Приведение `$2::bigint` падает, `query` глотает ошибку и возвращает `null` (`src/lib/db.ts:118-123`), дальше `likes.ts:402` отвечает 503 `unavailable`.
   - В ленте та же проблема (`feed.ts:272`). Исправление: сравнить с `9223372036854775807` до запроса.

**Не нашёл, где проверяется**

4. **Мелочь. Тест пагинации не проверяет то, что должен.** В `test/feed_publish.test.ts:3416` лайки отстоят друг от друга на целые секунды. Совпадения по времени и микросекундная точность курсора не проверяются: тест прошёл бы и с курсором в миллисекундах, от которого предостерегает `feed.ts:244-263`. Нужен кейс с 31+ лайками в одну миллисекунду, как у ленты (`test/feed_publish.test.ts:1020-1070`), и контрольная поломка курсора (перевести его на `getTime()`, тест должен покраснеть).

**Проверил, дефекта нет**

- **`matched` для другой фразы того же автора.** `likes.ts:384-387` связывает матч с конкретной фразой: `p.message_id = f.id` плюс я участник матча. Это то же правило, что у удаления лайка (`likes.ts:285-289`: `pair_key` и `p.message_id = target`). Проследил по `likes.ts:152-220`: при взаимном лайке у автора записывается именно та его фраза, которую я лайкнул. Лайк на другую фразу автора остаётся `liked`, удаление по нему тоже не ответит `spent`. Совпадает.
- **Индекс.** Индекса `(liker_identity, created_at)` нет, `likes.ts:388-398` сортирует строки одного лайкера в памяти. На их число есть потолок: `LIKE_LIMITS` 300 в час (`rate_limit.ts:188`), а просроченные фразы удаляются вместе с лайками каскадом (`feed_verdict.ts:257-263`). Значит, на странице максимум несколько сотен строк, и индекс здесь мелочь, а не дефект. `NOT EXISTS` в ленте попадает прямо в PK `(liker_identity, feed_message_id)`.
- **Совпадения по времени лайка.** `ORDER BY l.created_at DESC, f.id DESC` (`likes.ts:397`) и курсор `(l.created_at, f.id)` сходятся. `f.id = l.feed_message_id`, поэтому пара уникальна.
- **Изоляция тестов.** Все фразы сеются в одну точку 60.17/24.94 (`test/feed_publish.test.ts:1414`), а `feedIds` читает только первую страницу (`:3339`). Тесты не ломаются, потому что проверяемые фразы всегда самые новые: сортировка идёт по `visible_at DESC`. Но если тесты начнут идти параллельно или в тесте появится больше 30 фраз новее проверяемой, это начнёт сбоить. Надёжнее своя точка для каждого теста.
- **Блокировка в тесте** (`:3399`). Статус ответа не проверяется, но провал блокировки косвенно ловит следующая проверка.

### Согласованность

Линза «Согласованность», диапазон 8e05b0a..3fd4faa. Всё проверено чтением файлов и `git diff`. Код не запускал.

**Противоречия (что сказано в документах и что делает код)**

1. **Дефект дизайна: оффер частника в «лайкнутом».**
   - Узел отдаёт оффер со `state: liked` (`relay/node/src/routes/likes.ts:328`, `:420`).
   - Там же `DELETE` на оффере сразу отвечает `spent` (`likes.ts:266`).
   - Экран всё равно предлагает «снять лайк» (`depth/ink/rooms.ts:478`), а после `spent` переворачивает карточку в `matched`, и её пункт ведёт во входящие (`rooms.ts:495`). Но одностороннего мэтча нет, так что во входящих пусто.
   - Документы говорят другое:
     - `docs/depth-client_RU.md:915` и `_EN.md:955` — оффер лежит «всегда как предложение».
     - `openapi.yaml:1854` — «offer is liked here until it is».
   - Точечно: в `GET /likes` отдавать оффер как `matched`, либо прятать пункт «снять» при `offer`, и одной строкой согласовать §4.10.

2. **Противоречие: строка «лайкнуто · вернуть» в ленте.**
   - Документ: на месте карточки несколько секунд стоит `лайкнуто · [u] вернуть` (`docs/depth-client_RU.md:572`, `_EN.md:593`).
   - Код: карточка убирается сразу (`depth/ink/screens.ts:190`).
   - Новый абзац §4.10 (`depth-client_RU.md:925-931`) это отличие не называет.

3. **Противоречие: RU-строка «скрыто из ленты».**
   - `refusal-wordings_RU.md:170`: «скрыта из ленты» (согласовано с «Ваша фраза», `:168`).
   - `depth/ink/locales/ru.json`, ключ `statements.hidden`: «скрыто из ленты».
   - Заголовка «Ваша фраза скрыта.» на экране нет (`rooms.ts:388-392`). Поэтому фраза `depth-client_RU.md:976` «пять строк — те же» верна только для пяти строк без заголовка.

**Не нашёл описания**

4. **`liked_at` нет в схеме.** В `FeedItem` (`openapi.yaml:201-222`) есть `state` (`:212`), а `liked_at` нет, хотя узел его отдаёт (`likes.ts:421`) и о нём говорит описание маршрута (`openapi.yaml:1854`). `additionalProperties: false` не стоит, так что поле схемой разрешено, но не описано. Страница `/likes` отдаёт схему `FeedPage`, а её `radius_used` к `/likes` не относится. Мелочь.

5. **Пагинация в протоколе §6 не называет `GET /likes`.** Там перечислены только `GET /feed` и `GET /inbox` и курсор (`visible_at`/`created_at`, `id`) (`protocol_RU.md:459`, `_EN.md:470`). У `/likes` курсор — (`liked_at`, `id`) (`likes.ts` в `myLikes`). Мелочь.

6. **Карта тестов не указывает на новые тесты.** Строка 23.11 (`test-map_RU.md:425`, `_EN.md:441`) по-прежнему «нечего проверять». При этом тест «a liked phrase leaves my feed… and waits in my likes» теперь есть в `relay/node/test/feed_publish.test.ts`. Мелочь.

7. **Старое, не из этого коммита: статус `GET /feed`.** В протоколе `GET /feed` стоит как «**спека**» (`protocol_RU.md:157`, `_EN.md:167`), а в `openapi.yaml:1795` — `x-status: built`. Мелочь.

8. **Непостроенное в §4.10 не помечено.** `enter` на фразе «во весь экран» заявлен в `depth-client_RU.md:919` и `_EN.md:959`, но в `Liked` этого нет (`rooms.ts:474-481`). Новый абзац перечисляет, что не построено (столы, односторонний мэтч), а это не называет. Мелочь.

**Совпадает**
- RU и EN новых абзацев совпадают: `depth-client` §4.10 и §4.11, строки `GET /likes` в протоколе, `roadmap_{RU,EN}` (строки 116 и 122).
- Шесть строк мотивировки в `ru.json` и `en.json` совпадают с `refusal-wordings` §6 (`RU:170-199`, `EN:183-213`) и с `dsa/SPEC_RU.md:441-447`.
- Статус «spec» у `GET /likes` нигде не остался. Фраза, что лента отдаёт лайкнутое, тоже нигде не осталась.
- Пустое состояние: `liked.empty` = «лайкнутого нет». Это совпадает с репозиторием sosed.place: `sosed.place/docs/11-empty-and-edge-states_RU.md:181` и `25-my-likes_RU.md:26`. Подсказку экрана 11 «Лайкните фразу или стол в ленте…» терминал не показывает, и §4.10 это оговаривает.

**Остальные 15 локалей**
- Плейсхолдеры `{n}`, `{date}` и `{time}` на месте во всех 15.
- Мелочь: в de, az, hy, ka, kk, ky, tg, uz коммерческий «оффер» (`statements.offer_taken_down`) и «предложение поговорить» (`liked.offer`, `liked.toOffer`) переведены одним словом. В de это «Angebot» в обоих местах, плюс «Angebot zu reden» звучит коряво, лучше «Gesprächsangebot». В ru эти два понятия разведены.
- Мелочь: `el` `liked.empty` = «τίποτα δεν σας αρέσει ακόμα» значит «вам пока ничего не нравится» — смысл сдвинут.

## 2. Опровержение (без правки)

## Adversarial check, 8e05b0a..3fd4faa. Read-only: nothing edited, nothing run against a live node

**S1: the mechanism is CONFIRMED. The "new leak" part is mostly REFUTED.**
- The mechanism is real. The INSERT at `relay/node/src/routes/likes.ts:110-126` checks the phrase is alive, the author is not closed, the age band and blocks. It has no distance check. The `myLikes` SQL (`likes.ts:379-400`) filters only liveness and blocks, and returns `text`, `lat_published`/`lon_published` and `like_count`.
- Where ids come from: only `GET /feed` gives a phrase id to an identity, and it is geo-gated (`feed.ts:325-378`). `inbox.ts:105-106` returns the match id plus `{text, mode}`, with no phrase id. `matches.ts` and `v1.ts` expose no feed ids. So an attacker needs an id that they, or a colluder, already saw in a feed, and that person already saw the text.
- No doc decided the geo question either way. `chat_RU.md` §8.4 (lines 1903-1960) never mentions geo for likes. Line 1806 talks about liking through a widened radius as ordinary use. The feed also widens itself up to 25 km (line 1773), so "outside my feed" is a fuzzy line anyway.
- Before 3fd4faa, a remembered id's text was already readable with no geo check. `POST /hidden` plus `GET /hidden` use `MAY_SEE` (`hidden.ts:24-32`), which checks liveness, band and blocks but not distance. The comment at `hidden.ts:20-22` records that the panel closed the band and block holes there, not geo.
- What `GET /likes` adds is `like_count` over time and the rounded coordinates. `lat_published` is the rounded cell, the same value the feed would publish.
- Verdict: a real but low-severity gap that an existing route already had. Both routes need the same fix.

**D1: CONFIRMED.**
- Density's own comment contradicts its code (`feed.ts:496-500`): "It reads what the feed would deliver … a handle that promised company and then showed an empty screen … would be worse than no handle." The density SQL (`feed.ts:541-575`) has no `likes` filter and no `hidden_messages` filter. `deliver` excludes both (`feed.ts:358-364`).
- The hidden gap is older than this diff. The likes gap comes from 3fd4faa.
- I did not check the "grows the radius" part. As far as I read, the feed widens itself when its own result is empty, not because density said so.

**D2: CONFIRMED.**
- The node marks an offer as "liked": `state: row.matched ? "matched" : "liked"` (`likes.ts:~421`). Its comment says an offer stays `liked` until the one-sided match exists.
- `DELETE` on an offer always answers `spent` (`likes.ts:~262-266`).
- The client offers "take back" whenever the state is not `matched` (`depth/ink/rooms.ts:484-488`). On `spent` it turns the card into `matched` (`rooms.ts:505-506`). "To the offer" then calls `onInbox` (`rooms.ts:500`). No one-sided match row exists, so the inbox shows nothing for it.
- This contradicts `docs/depth-client_RU.md` §4.10 (around line 913): "Оффер частника лежит здесь **всегда** как предложение — … мэтч … рождается лайком сразу". The new "Построено 23.09" note says only that the node has no offer match yet. It does not say the terminal shows a take-back that fails.

**C2: CONFIRMED.**
- `docs/depth-client_RU.md:569-573` says that after `l` the feed card leaves, and "На месте карточки несколько секунд строка `лайкнуто · [u] вернуть`; дальше она в `liked` (4.10)". The EN twin says the same with `liked · [u] undo` (`docs/depth-client_EN.md:~589-592`). This line predates 3fd4faa.
- `depth/ink/screens.ts` (3fd4faa hunk at ~177-186) removes the card as soon as the like succeeds. There is no temporary line and no undo in the feed. Its comment says the card "leaves at once, and 'liked' in the menu is where it can be taken back".
- The new "Построено" paragraph in §4.10 describes "снято" only for the liked list. It does not mention that the feed skips the promised temporary line.
- The uncommitted changes in `screens.ts` only add the blocked-list menu item. They do not touch this.

## 3. Сводка ведущего

| Заявка | Итог | Проверка |
|---|---|---|
| S1: лайк вслепую + `GET /likes` читают фразу мимо геофильтра | подтверждено, **не исправлено** — решение владельца; та же брешь раньше была через `POST/GET /hidden` | опровергатель: `hidden.ts:24-32` без расстояния — **ПРОВЕРЕНО** опровергателем, не мной |
| S2 / D3: мусорный курсор даёт 503 | **исправлено** в `/likes`, `/feed`, `/statements`: 16 цифр, строгий UUID; тест на два мусорных курсора | тест «the likes list pages…» |
| S3: `restriction` и `like_count` печатаются без проверки | **исправлено**: список видов, `Number()` | `rooms.ts` |
| S4: id с узла в путях без кодирования | **исправлено**: 12 путей через `encodeURIComponent` | `grep -n encodeURIComponent depth/core/client.ts` |
| S5: нечисловая дата роняет экран | **исправлено**: проверка на конечность, иначе «?» | `rooms.ts` |
| S6: `plain()` пропускает управляющие символы направления | **исправлено**: U+200E/F, U+202A–202E, U+2066–2069 | `parts.ts` |
| D1: плотность считает лайкнутое (и скрытое) | **исправлено** обоими `NOT EXISTS`; тест увиден красным | тест «density leaves out what the viewer liked or hid» |
| D2 / C1: у оффера в «лайкнутом» есть «снять», узел отвечает `spent` | **исправлено** в клиенте: пункт погашен; тест увиден красным | `rooms.ts` |
| D4: тест пагинации не ловит миллисекундный курсор | **исправлено**: 32 лайка в одну миллисекунду одной инструкцией; с курсором в миллисекундах тест красный (30 из 32) | ведущий, прогон |
| C2: «лайкнуто · вернуть» в ленте не построено | документ поправлен: построено иначе, вернуть — на экране `liked` | `depth-client` §4.4 |
| C3, C8: род «скрыто», `enter` во весь экран | документ поправлен | `depth-client` §4.10, §4.11 |
| C4, C5, C6: `liked_at` в схеме, `/likes` в §6, строка 23.11 карты | **исправлено** | `openapi.yaml`, протокол §6, `test-map` |
| C7: `GET /feed` в протоколе «спека» при `built` в `openapi` | отложено — старое, не из этих коммитов | — |
| Переводы: de «Angebot», el «liked.empty» | de и el **исправлены**; «оффер» и «предложение поговорить» одним словом ещё в az, hy, ka, kk, ky, tg, uz — отложено до носителя | — |

Найдено по ходу ведущим: ряд меню ленты не помещался в 100 колонок, и Ink рвал подписи посреди
слова («заблокиров / ать»). **Исправлено** переносом целыми пунктами (`flexWrap`), тест увиден красным.

## 4. Нарезка на задачи

1. **S1 — лайк без проверки расстояния.** Решение владельца: требовать, чтобы лайкали только
   видимое (нужна точка зрителя в `POST /feed/:id/like` и `POST /hidden`), или принять, что id,
   увиденный кем-то, открывает текст. Уровень: дефект дизайна, низкая тяжесть.
2. **Меню ленты растёт.** 11 пунктов; §4.11 предлагает экран `me`, который заберёт «лайкнутое»,
   «скрытое», «заблокировано» и мотивировки. Уровень: мелочь.
3. **C7** — статус `GET /feed` в протоколе. Мелочь.
4. **Переводы «оффер» / «предложение поговорить»** в семи языках. Мелочь.
