# Карта: состояния дизайнера sosed и приложение app/

Сверка листов дизайнера sosed (пакеты `docs/newsdesign/all/sosed-1..5-*.zip`, правила движения `sosed-motion-svg.zip` → `MOTION.md`) с оболочкой `app/src/`. Пути в таблице — от `app/src/`, если не сказано иное. Статус ставился по коду; вид листов по картинкам не сверялся (в листах текст переведён в кривые).

## Итог

- Состояний (мобильных листов 390 px, SCREENS.md): **79**. В пакетах 1 и 2 (анимированные) те же 79 экранов плюс 4 перехода; в пакетах 3 и 4 (статичные) 79 файлов; в пакете 5 планшет 834 (7) и монитор 1440 (7) и 1920 (2) для семи экранов.
- Статусы: **есть 71**, **частично 3**, **нет 5** (сумма 79).
- Правил движения MOTION.md: 8. Реализовано полностью **1 из 8**, частично 4, нет 3; хоть в какой-то мере 5 из 8.
- `useLayers` вызывается только в `screens/feed-card.tsx:81` (открыть) и `:142` (закрыть) и в `screens/tables/Table.tsx:41` — проверено grep по `app/src`, других вызовов нет (определение — `shell/layers.tsx:10`).
- Статусы «нет» (экрана нет вовсе или заглушка): wizard-1, wizard-2, wizard-3, wizard-4, wizard-5.
- «Частично»: feed, card-matched, me.

## Правила движения

| Код | Правило MOTION.md | Реализовано | Где в коде |
|---|---|---|---|
| S | Слой-шторка (слой снизу, база сжимается до 0,93 и темнеет) | частично | shell/layers.tsx:25-43, shell.css:18-49 (View Transitions + запасной CSS); вызовов useLayers: feed-card.tsx:81,142 и tables/Table.tsx:41 (проверено grep, других нет); чат, написать, шторка чата — нет или своя шторка (chat.css:76-81) |
| K | Заглушка с переливом (1,3 с) и правило 300/600 мс | частично | shell.css:86-95, shell/Skeleton.tsx:4, shell/loading.ts:5-39; используется Feed.tsx:214, Tables.tsx:107; нет в Беседах, «Где я в деле», офферах кабинета, скрытом, заблокированных |
| R | Кольцо-индикатор (дуга 28%, оборот 0,9 с) | частично | Loading.tsx:16 + screens.css:55; на кнопке screens.css:186-191; ожидание переноса move.css:77 (рамка-дуга); кольцо «ждём ответа» MatchWaiting.tsx:65 не вращается |
| T | Волна нажатия (0,3 → 1,2 за 0.45 с) | частично | screens.css:183-185,192 только на кнопке с aria-busy (16 файлов); волны на строках списков (переход 02) нет |
| D | Точки «печатает» (прыжок 5 px, 0,9 с, сдвиг 0.15 с) | нет | нет: токены motion.css:42-44 заданы, var(--d-typing/--o-typing/--stagger-typing) нигде не читаются (grep: 0) |
| E | Ступенчатый вход (шапка, лист, элементы с шагом 0.08 с, кнопка, панель вкладок) | есть | shell.css:52-79 (rise, sheet-up, bar-up), screens.css:85,145,165,175 (шаг --stagger-item), feed.css:4,18, me.css:11-24, tables.css:8-52, cabinet.css:9-28, move.css:6-20 |
| M | Всплытие сообщения (0.85 → 1, 0.35 с, шаг 0.38 с) | нет | нет: токены motion.css:45-47 заданы, var(--d-bubble/--scale-bubble-from/--stagger-bubble) не читаются (grep: 0); chat.css без keyframes |
| P | Окно «оба в деле» выпрыгивает (0.85 → 1.03 → 1) | нет | нет: токены motion.css:56-57 заданы, var(--d-popup/--scale-popup-peak) не читаются (grep: 0); Match.tsx:51 — целый экран без анимации окна |

Дополнительно (не в счёте): пульс 1 → 1.07 → 1 за 1,6 с есть на `.lock-circle` и плитке (`screens.css:15,158`), на пустых состояниях, «вы отошли» и «письмо отправлено» его нет (NOT VERIFIED по каждому: смотрел только css).

## Таблица состояний

Движение: коды из таблицы выше, у каждого — есть / частично / нет и место в коде. E (вход) считается по общему правилу экрана. Ширины: 390 — мобильный лист; 834, 1440, 1920 — листы пакета 5 для этого экрана.

| № | Волна | Состояние | Ширины | Компонент (файл:строка) | Как открывается | Статус | Чего не хватает | Движение |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `feed` Лента | 390/834/1440/1920 | screens/Feed.tsx:44 | после входа, /feed; вкладка «Лента» | частично | нет выбора места, поиска/меню в шапке, строки плотности, столов между фразами, своей отправленной фразы над списком (Feed.tsx:8-9) | E есть (shell.css:52-62); K есть (Feed.tsx:214; shell/loading.ts:5-39) |
| 2 | 1 | `feed-error` Лента · ошибка | 390 | screens/Feed.tsx:180 | лента, ответ узла не получен; кнопка retry | есть | - | E есть (shell.css:52-62) |
| 3 | 1 | `feed-hidden-return` Лента · скрыто, вернуть (5 с) | 390 | screens/Feed.tsx:170 | карточка → «…» → Скрыть → возврат в ленту | есть | - | E есть (shell.css:52-62) |
| 4 | 1 | `feed-blocked` Лента · автор заблокирован | 390 | screens/Feed.tsx:177 | карточка → «…» → Заблокировать автора (два нажатия) | есть | - | E есть (shell.css:52-62) |
| 5 | 2 | `feed-empty` Лента пустая | 390 | screens/Feed.tsx:190 | лента без карточек; кнопка «шире» (wider) | есть | - | E есть (shell.css:52-62) |
| 6 | 1 | `card` Карточка | 390/834/1440 | screens/feed-card.tsx:69 | нажатие на плитку в ленте; Feed.tsx:228 | есть | - | E есть (shell.css:52-62) |
| 7 | 1 | `card-liked` Карточка · вы в деле | 390 | screens/feed-card.tsx:73-75 | кнопка «Я в деле» на карточке | есть | - | E есть (shell.css:52-62) |
| 8 | 1 | `card-matched` Карточка · оба в деле | 390 | screens/feed-card.tsx:33,121 | ответ узла state=matched после «Я в деле» | частично | только строка-пояснение web.card.matched под рядами, отдельного вида листа нет (вид листа по картинке не сверялся) | E есть (shell.css:52-62) |
| 9 | 1 | `card-details` Карточка · детали | 390 | screens/feed-card.tsx:116 | ряды dl на карточке (куда, язык, сколько в деле) | есть | - | E есть (shell.css:52-62) |
| 10 | 1 | `card-more` Карточка · меню «…» | 390 | screens/feed-card.tsx:141 (MoreSheet), открытие :81 | кнопка «…» в шапке карточки | есть | - | E есть (shell.css:52-62); S есть (feed-card.tsx:81,142 useLayers) |
| 11 | 1 | `register-1` Регистрация · шаг 1 | 390 | screens/Register.tsx:143 | сплэш → «Начать», /register | есть | - | E есть (shell.css:52-62) |
| 12 | 1 | `register-2` Регистрация · шаг 2 | 390 | screens/Register.tsx:171 | шаг 1 → «Дальше» | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 13 | 1 | `register-3` Регистрация · шаг 3 | 390 | screens/Register.tsx:178 | шаг 2 → «Создать» | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 14 | 2 | `splash` Заставка | 390 | screens/Splash.tsx:42 | / без сохранённой личности | есть | - | E есть (shell.css:52-62) |
| 15 | 2 | `splash-lang` Заставка · выбор языка | 390 | screens/Splash.tsx:16 | первый запуск на устройстве, до заставки | есть | - | E есть (shell.css:52-62) |
| 16 | 2 | `lang` Язык (из «Я») | 390 | screens/me/LangPicker.tsx:6 | Я → строка «Язык» (sub=lang, Me.tsx:44) | есть | - | E есть (shell.css:52-62) |
| 17 | 2 | `loading` Загрузка приложения | 390 | screens/Loading.tsx:10 | старт, если ожидание дольше 300 мс (shell/App.tsx:83,282) | есть | - | E есть (shell.css:52-62); R есть (Loading.tsx:16; screens.css:55) |
| 18 | 2 | `unlock` Вход по ПИНу | 390 | screens/Unlock.tsx:21 | /unlock или любой путь при сохранённой личности | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 19 | 2 | `locked` Блокировка по бездействию | 390 | screens/Locked.tsx:18 | 5 минут без ввода, App.tsx:155 | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 20 | 2 | `away` Вы отошли | 390 | screens/Away.tsx:14 | /away; вход, пока шаг «отойти» активен (App.tsx awayCheck) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 21 | 2 | `departure-start` Перенос · отправление: начало | 390 | screens/Departure.tsx:113 | Я → «Перенос», /move | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 22 | 2 | `departure-code` Перенос · одноразовый код | 390 | screens/Departure.tsx:156 | после ПИНа на /move | есть | - | E есть (shell.css:52-62) |
| 23 | 2 | `departure-claimed` Перенос · сверка символов | 390 | screens/Departure.tsx:136 | новое устройство ввело код; опрос раз в 2 с | есть | - | E есть (shell.css:52-62) |
| 24 | 2 | `departure-done` Перенос · выполнен | 390 | screens/Departure.tsx:96 | после «Да» на сверке | есть | - | E есть (shell.css:52-62) |
| 25 | 2 | `arrival-code` Перенос · прибытие: код | 390 | screens/Arrival.tsx:73 | сплэш → «Перенести сюда», /arrival | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 26 | 2 | `arrival-check` Перенос · прибытие: ждём подтверждения | 390 | screens/Arrival.tsx:124 | после кода | есть | - | E есть (shell.css:52-62); R частично (Arrival.tsx:129 .mv-wait, move.css:77: рамка-дуга, а не дуга 28%) |
| 27 | 2 | `arrival-pin` Перенос · прибытие: новый ПИН | 390 | screens/Arrival.tsx:100 | после подтверждения старым устройством | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 28 | 3 | `chat` Беседа | 390/834/1440/1920 (Talks) | screens/Chat.tsx:128 (ChatPane :37) | Беседы → строка, /chat (запись истории); на планшете и шире рядом со списком, Chat.tsx frame=pane | есть | - | E есть (shell.css:52-62); S нет (App.tsx:217 openChat: setScreen, не useLayers; чат сам выезжает chat.css:81 без сжатия слоя под ним); D нет (токены motion.css:42-44 есть, использований 0); M нет (токены motion.css:45-47 есть, использований 0) |
| 29 | 3 | `chat-game` Беседа · игра | 390 | screens/chat-game.tsx:87 (панель :41), вставка Chat.tsx:152 | в беседе кнопка «игра» (quick-game) | есть | - | E есть (shell.css:52-62) |
| 30 | 3 | `chat-more` Беседа · меню «…» | 390 | screens/chat-menu.tsx:37, открытие Chat.tsx:147,160 | кнопка «…» в беседе; запись истории sheet=menu | есть | - | E есть (shell.css:52-62); S частично (chat.css:76-81: своя шторка sheet-up и тень, слой под ней не сжимается) |
| 31 | 3 | `chat-over` Беседа · закончена | 390 | screens/Chat.tsx:87-91 | беседа закончена или закрыта блокировкой (view.over / view.blocked) | есть | - | E есть (shell.css:52-62) |
| 32 | 3 | `inbox` Беседы | 390/834/1440/1920 (Talks) | screens/talks/Inbox.tsx:109 (TalksList :63) | вкладка «Беседы», /inbox; на 1440+ панель TalksPane.tsx:8 | есть | - | E есть (shell.css:52-62); K нет (заглушек списка нет) |
| 33 | 3 | `tables` Столы | 390/834/1440 | screens/tables/Tables.tsx:24 | вкладка «Столы», /tables | есть | - | E есть (shell.css:52-62); K есть (Tables.tsx:107) |
| 34 | 3 | `new-table-1` Новый стол · шаг 1: игра | 390 | screens/tables/NewTable.tsx:76 | Столы → «Новый стол», /tables/new | есть | - | E есть (shell.css:52-62) |
| 35 | 3 | `new-table-2` Новый стол · шаг 2: вариант | 390 | screens/tables/NewTable.tsx:93 | шаг 1 → «Дальше» | есть | - | E есть (shell.css:52-62) |
| 36 | 3 | `new-table-3` Новый стол · шаг 3: предпросмотр | 390 | screens/tables/NewTable.tsx:126 | шаг 2 → «Предпросмотр» | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 37 | 3 | `table-dots` Стол · Dots | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:57 DotsBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 38 | 3 | `table-checkers` Стол · Checkers | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:141 SquaresBoard (chess=false) | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 39 | 3 | `table-chess` Стол · Chess | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:141 SquaresBoard (chess=true) | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 40 | 3 | `table-durak` Стол · Durak | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-deck.tsx:13 DurakBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 41 | 3 | `table-hangman` Стол · Hangman | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:83 HangmanBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 42 | 3 | `table-backgammon` Стол · Backgammon | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:167 BackgammonBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 43 | 3 | `table-dominoes` Стол · Dominoes | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:207 DominoesBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 44 | 3 | `table-chapayev` Стол · Chapayev | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-physics.tsx:10 ChapayevBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 45 | 3 | `table-reversi` Стол · Reversi | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:122 ReversiBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 46 | 3 | `table-four` Стол · Four in a row | 390 | screens/tables/Table.tsx:35 + screens/tables/boards.tsx:40 FourBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 47 | 3 | `table-battleship` Стол · Battleship | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-sea.tsx:11 SeaBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 48 | 3 | `table-poker` Стол · Poker | 390 | screens/tables/Table.tsx:35 + screens/tables/boards-poker.tsx:15 PokerBoard | Столы → «Смотреть», /table (id в записи истории); доска выбрана Board, boards.tsx:18 | есть | - | E есть (shell.css:52-62); S есть (Table.tsx:41,103 useLayers (меню стола) |
| 49 | 3 | `composer` Написать | 390/1440 | screens/Composer.tsx:104 (ComposerPane :38) | лента → кнопка «сказать», /write; на 1440 кнопка рельса | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191); S нет (App.tsx openComposer: setScreen, не useLayers; нет сжатия ленты) |
| 50 | 3 | `likes` Где я в деле | 390 | screens/talks/Likes.tsx:25 | Беседы → круг «Предложения», /likes | есть | - | E есть (shell.css:52-62); K нет (заглушек списка нет) |
| 51 | 3 | `match` Оба в деле · предложение поговорить | 390/834 | screens/talks/Match.tsx:19 | Беседы → строка-совпадение, /match (строка в записи истории) | есть | - | E есть (shell.css:52-62); P нет (экран целиком (Match.tsx:51), не окно; токены motion.css:56-57 не используются) |
| 52 | 3 | `match-waiting` Оба в деле · ждём ответа | 390 | screens/talks/MatchWaiting.tsx:21 | Match → «Давайте поговорим», если второй ещё не согласился | есть | - | E есть (shell.css:52-62); R частично (MatchWaiting.tsx:65 .tk-wait-ring: кольцо есть, не вращается (talks.css без animation)) |
| 53 | 4 | `me` Я | 390/834/1440 | screens/me/Me.tsx:34 | вкладка «Я», /me | частично | строка «Новый бумажный код» теперь открывает Reissue (Me.tsx:67); статус здесь не пересматривался | E есть (shell.css:52-62) |
| 54 | 4 | `me-edit-name` Я · имя и возраст | 390 | screens/me/EditName.tsx:24 | Я → «Править» (Me.tsx:46) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 55 | 4 | `me-pin` Я · сменить ПИН | 390 | screens/me/ChangePin.tsx:20 | Я → «ПИН» (sub=pin) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 56 | 4 | `me-reset` Я · начать заново | 390 | screens/me/Reset.tsx:19 | Я → «Начать заново» (sub=reset) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 57 | 4 | `step-away` Я · отойти | 390 | screens/me/StepAway.tsx:15 | Я → «Отойти» (sub=away) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 58 | 4 | `statements` Ограничения | 390 | screens/me/Statements.tsx:14 | Я → строка с числом ограничений, видна при n>0 (Me.tsx:85) | есть | - | E есть (shell.css:52-62) |
| 59 | 4 | `reissue-1` Новый бумажный код · шаг 1 | 390 | screens/me/Reissue.tsx:26 (Me.tsx:67) | Я → «Новый бумажный код» (sub=reissue) | есть | текущий код спрашивается и проверяется на устройстве (recovery.ts isCurrentCode) до показа нового, как в вебе; на листе ПИНа нет и веб его не спрашивает; прогнано вживую на узле стенда 23.10 (см. reissue-2) | E yes (me.css:19); T yes (screens.css:182-191)
| 60 | 4 | `reissue-2` Новый бумажный код · шаг 2 | 390 | screens/me/Reissue.tsx:26 | reissue-1 → «Дальше», когда текущий код верен | есть | новый код показан один раз, вторая и четвёртая группы вводятся заново (иначе web.reissue.mismatch), «Готово» = recovery.ts reissue, затем vault.ts rememberWrappedLongKey; вживую на узле стенда 23.10: регистрация, новый код, очистка устройства, /restore со СТАРЫМ кодом → отказ (404), с НОВЫМ → лента; «назад» шага 2 ведёт на шаг 1, как рисует лист (в вебе там «назад» нет) | E yes (me.css:19); T yes (screens.css:182-191)
| 61 | 4 | `restore` Восстановить по бумажному коду | 390 | screens/Gate.tsx:95 | сплэш/ПИН → «Есть код», /restore | есть | после входа по коду льгота перезагрузки взводится, как в вебе (app/src/vault.ts отдаёт armGrace); прогнано вживую на узле стенда 23.10: верный код + новый ПИН → лента; перезагрузка сразу → лента без ПИН; перезагрузка через 35 с → ПИН, новый ПИН → лента; с закомментированным armGrace перезагрузка сразу спрашивает ПИН (Gate.tsx:1-8) | E есть (me.css:19); T есть (screens.css:182-191) |
| 62 | 4 | `hidden` Скрытое | 390 | screens/me/Hidden.tsx:11 | Я → «Скрытое» (sub=hidden, строка me-hidden; своего маршрута нет); «Вернуть» = client.unhide | есть | на листе «Я» (w4_me) такой строки нет: добавлена как в вебе, без числа | E есть (me.css:19); K нет (нет скелетона списка) |
| 63 | 4 | `blocked` Заблокированные | 390 | screens/me/Blocked.tsx:13 | Я → «Заблокированные» (sub=blocked, строка me-blocked; своего маршрута нет); «Снять» = client.unblock | есть | на листе «Я» (w4_me) такой строки нет: добавлена как в вебе, без числа | E есть (me.css:19); K нет (нет скелетона списка) |
| 64 | 4 | `theme` Тема | 390 | screens/me/Theme.tsx:14 | Я → «Тема» (sub=theme) | есть | - | E есть (shell.css:52-62) |
| 65 | 4 | `age-filter` Фильтр по возрасту | 390 | screens/me/AgeFilter.tsx:15 | Я → «Фильтр» (sub=filter) | есть | - | E есть (shell.css:52-62) |
| 66 | 4 | `legal` Документы | 390 | screens/me/Legal.tsx:19 | Я → «Документы» (sub=legal) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 67 | 4 | `cabinet-sign-in` Кабинет · вход | 390 | screens/cabinet/SignIn.tsx:16 | отдельная страница adv.<витрина> или /adv (main.tsx:30, Cabinet.tsx:15) | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 68 | 4 | `cabinet-sent` Кабинет · письмо отправлено | 390 | screens/cabinet/SignIn.tsx:52 | после отправки адреса на входе | есть | - | E есть (shell.css:52-62) |
| 69 | 4 | `cabinet-venues` Кабинет · заведения | 390 | screens/cabinet/Venues.tsx:91 | кабинет после входа | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 70 | 4 | `cabinet-new-offer` Кабинет · новый оффер | 390 | screens/cabinet/Offers.tsx:75 | кабинет → «Новый оффер» | есть | - | E есть (shell.css:52-62); T есть (screens.css:182-191) |
| 71 | 4 | `cabinet-offers` Кабинет · офферы | 390 | screens/cabinet/Offers.tsx:52 | кабинет → «Офферы» | есть | - | E есть (shell.css:52-62); K нет (заглушек списка нет) |
| 72 | 4 | `offer` Переход по ссылке оффера | 390 | screens/Offer.tsx:17 | /o/<код>, router.ts:68; App.tsx:107-109 | есть | - | E есть (shell.css:52-62) |
| 73 | 4 | `wizard-1` Мастер · 1 фразы рядом | 390 | - | нет маршрута; в router.ts типа Screen такого экрана нет | нет | экрана нет (grep wizard в app/src находит только комментарий про «Новый стол») | E нет |
| 74 | 4 | `wizard-2` Мастер · 2 «я в деле» | 390 | - | нет маршрута; в router.ts типа Screen такого экрана нет | нет | экрана нет (grep wizard в app/src находит только комментарий про «Новый стол») | E нет |
| 75 | 4 | `wizard-3` Мастер · 3 столы и игры | 390 | - | нет маршрута; в router.ts типа Screen такого экрана нет | нет | экрана нет (grep wizard в app/src находит только комментарий про «Новый стол») | E нет |
| 76 | 4 | `wizard-4` Мастер · 4 ничего не уходит наружу | 390 | - | нет маршрута; в router.ts типа Screen такого экрана нет | нет | экрана нет (grep wizard в app/src находит только комментарий про «Новый стол») | E нет |
| 77 | 4 | `wizard-5` Мастер · 5 место | 390 | - | нет маршрута; в router.ts типа Screen такого экрана нет | нет | экрана нет (grep wizard в app/src находит только комментарий про «Новый стол») | E нет |
| 78 | 4 | `place` Место | 390 | screens/me/Place.tsx:18 | Я → «Место» (sub=place) | есть | - | E есть (shell.css:52-62) |
| 79 | 4 | `place-qr` Место · QR | 390 | screens/me/PlaceQr.tsx:26 | Место → QR (sub=place-qr) | есть | - | E есть (shell.css:52-62) |

## Листы шире телефона (пакет 5, не в счёте состояний)

Это те же экраны в других ширинах. Соответствие имён листов экранам — по именам и комментариям кода (`tokens/wide.css:1-14`, `shell/App.tsx:40-44`), не по картинкам.

| Лист | Экран | Статус в коде |
|---|---|---|
| tablet_834_Feed / desktop_1440_Feed | feed | есть: wide.css, App.tsx:44 PANE_BESIDE |
| desktop_1920_Feed | feed | не подтверждено: в коде нет упоминания 1920 для ленты (есть только 1920_Talks, wide.css:247) |
| tablet_834_Phrase / desktop_1440_Phrase | card | есть: wide.css:1-14, feed-card.tsx:69 (more) |
| tablet_834_Talks / desktop_1440_Talks / desktop_1920_Talks | inbox + chat | есть: Inbox.tsx:109 (beside), TalksPane.tsx:8, wide.css:247 |
| tablet_834_Write / desktop_1440_Write | composer | есть: App.tsx:44 (composer рядом с панелью), кнопка рельса App.tsx:232 |
| tablet_834_Tables / desktop_1440_Tables | tables | есть: wide.css:256 |
| tablet_834_Me / desktop_1440_Me | me | есть: wide.css:1-14,62-64 |
| tablet_834_BothIn | match | есть: wide.css:147 |
| desktop_1440_BothIn | match | не подтверждено: в коде нет упоминания |

Переходы анимации (в состояния не входят): 01 feed-loading, 02 open-chat, 03 send-phrase, 04 both-in. Что из них в коде — см. таблицу правил: 01 → K, 02 → S, T, D, M (S, D, M не сделаны), 03 → S, T (S не сделано), 04 → P (не сделано).
