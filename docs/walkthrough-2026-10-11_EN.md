# Text walkthrough of the product, 11.10.2026 (`K10`)

Branch `day59` @ `3a702a93`. Text only, no screenshots (owner, 10.10). No code was changed.
Each line below is what a person sees, verbatim, and why it is embarrassing to show.

## How it was walked

**Web, both brands.** A stand of its own per brand: `docker-compose.web.yml` under the name `xor-k10-<brand>`, ports 4273/4283.
The `xor-local-*` stands were not touched: a person may be using them. Clean database, `WALK_STABLE=1 scripts/textwalk/run.sh`,
read through `scripts/textwalk/read.py`. After the walk the stand was removed (`down -v`).
Result: 51 steps per brand, all passed. Node responses ≥ 400 — three, all intended: phrase with a contact 422,
name with a contact 422, wrong paper code 404.

**Terminal.** A node of its own, as in `scripts/run-depth-live-ui.sh`: Postgres, migrations, the node from the sources.
`depth/ink/main.ts` with `DEPTH_PLAIN=1` under a pty: `script(1)` in a `node:24.21.0-alpine` container plus `util-linux-misc`.
Two people at once, keys from a scenario. Walked: registration, PIN, paper code, point, feed, own phrase,
card, like, inbox.
**NOT WALKED in the terminal:** match, chat, table, «я» («me»), restore. The feed did not refresh by itself (`Т15`), after the like
it went empty (`Т16`), and the two did not reach a match.

## Web — sosed (11 lines)

| # | Screen | What is seen, verbatim | Why it is embarrassing |
|---|---|---|---|
| `С1` | Feed, «столы» («tables») | a bare «0», «1» under a phrase; next to a table «♥ 0» | a number without a word or sign, and with a sign at the table: inconsistent |
| `С2` | Feed, card in the feed | «один · русский» («alone · Russian») | «один» is the mode; without a hint it reads as a word of the phrase |
| `С3` | Card | the screen and tab title is «фраза» («phrase») | whose phrase and about what is not said |
| `С4` | Match | «Борис, 31» («Boris, 31») — the heading, and right away «Борис, 31» again above his phrase | doubled |
| `С5` | Match, «Ждём ответа» («Waiting for an answer») | two phrases in a row without labels | which is one's own and which is his is not visible |
| `С6` | Inbox | under Boris's phrase «иду к мосту с собакой» («walking to the bridge with the dog») — «ваша фраза: ещё 4 ч 20 мин» («your phrase: 4 h 20 min more») | reads as if that phrase were one's own |
| `С7` | Composer | «режим» («mode»), «схема, не карта» («a scheme, not a map»), «зона» («zone») | «схема, не карта» with no explanation of what it is |
| `С8` | Table, game over | «вы 2 · Борис 2 · Б · В» («you 2 · Boris 2 · B · Y», line by line) | the letters are the owners of the cells (Б — Boris, В — «вы», "you"), but there is no legend; for Boris the same «В» means "you", i.e. himself |
| `С9` | Table | «Борис — сыграю» («Boris — I'll play») stays after the game starts and after it ends; before the start, next to it, «заявка: Борис» («application: Boris») | the old application does not go away; doubled |
| `С10` | «я» («me») | «отойти» («step away») | no explanation of what this mode is |
| `С11` | «Who you are», EN | checkbox «…the community rules», link «community guidelines (revision of September 15, 2026)» | one document under two names |

## Web — neighbro (12 lines)

The screen text matches sosed line by line except the card. So `С1`–`С11` are here too, plus one line of its own:

| # | Screen | What is seen, verbatim | Why it is embarrassing |
|---|---|---|---|
| `Н1` | Card, after the like | to the eye only «0» turning into «1»; «Лайк отправлен…» («Like sent…») is for the screen reader only; for Boris, after the answering like, «Мэтч!» («Match!») is not visible | the person does not know the like went out or that a match happened. Possibly the 5 s undo (decision 02.10) and the scenario read the screen earlier — NOT VERIFIED |

## Terminal (17 lines)

| # | Screen | What is seen, verbatim | Why it is embarrassing |
|---|---|---|---|
| `Т1` | Registration | heading «Operator.» | an English word in the Russian interface (key `reg.title` = «Operator.» in all 17 languages) |
| `Т2` | Registration | fields «имя» («name»), «возраст» («age») — and that is all | no consent to the documents, while on the web it is required; whether by design — NOT VERIFIED |
| `Т3` | Registration, PIN, code | «дальше      перенести личность сюда      выход» («next · move the identity here · exit») while the cursor is on the fields | which action is selected is not visible; Enter on a field does nothing |
| `Т4` | Paper code | button «записал» («I wrote it down», masculine) | masculine for everyone |
| `Т5` | Point | «радиус:  ‹ 1000 ›» («radius: ‹ 1000 ›») | a number without a unit |
| `Т6` | Feed | «↑↓ · 1/0» on an empty feed; above a non-empty one «1/0», at the bottom «1/1» | a wrong counter, "1 of 0" |
| `Т7` | Empty feed | «открыть (недоступно: ничего не выбрано)» («open (unavailable: nothing selected)») and four more like it in a row | noise: one reason five times |
| `Т8` | Feed | «пожаловаться (недоступно: только для предложения)» («report (unavailable: only for an offer)») | «предложение» ("offer") is an internal word (advertising) |
| `Т9` | Feed | «> гуляю у реки, кто со мной» / «иду к мосту с собакой» — text only | no author, age or distance; one's own phrase without a mark |
| `Т10` | Feed, own phrase selected | «[ открыть ]    лайк      скрыть      заблокировать» («open · like · hide · block») | on one's own phrase one can «лайк» and «заблокировать» |
| `Т11` | Your phrase | «Уйдёт от точки из фильтра. Выйдет сразу или встанет на проверку — что именно, скажет узел после отправки.» ("Leaves from the filter's point. Goes out at once or waits for review — which, the node will say after sending.") | jargon: «точка из фильтра», «узел» ("node") |
| `Т12` | Card | «+ 0» | a bare number |
| `Т13` | Card, first → | «внимание: вправо — лайк, влево — скрыть; скрытое вернёте в me · [enter] понятно» ("attention: right — like, left — hide; you get hidden ones back in me · [enter] got it") | the English «me»; a hint in the «внимание» tone; the first press does not like |
| `Т14` | Card, like without one's own phrase | «ошибка: Что-то пошло не так: Сначала напишите свою фразу: лайк — это встреча двух фраз.» ("error: Something went wrong: First write your phrase: a like is two phrases meeting.") | «Что-то пошло не так» before the real reason; «лайк» is not marked unavailable in advance |
| `Т15` | Feed | the neighbour's phrase did not appear within 30 s | the feed does not refresh by itself |
| `Т16` | Feed after the card | «рядом пока никого…» ("nobody nearby yet…"), «у вас пока нет своей фразы» ("you have no phrase yet") — 40 s after «опубликована» ("published") | one's own and the other phrase are gone; cause NOT VERIFIED |
| `Т17` | Inbox | heading «входящие» ("inbox") in lowercase; cursor on «[ согласиться (недоступно: ничего не выбрано) ]» ("agree (unavailable: nothing selected)") | the heading is not like the other screens'; focus on an unavailable action |

## Result

Embarrassing: sosed — 11, neighbro — 12, terminal — 17. The terminal was not walked to the end: match, chat, table, «я» and restore
were not walked. Not compared line by line with the 10.10 walkthrough.
