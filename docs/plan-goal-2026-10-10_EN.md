# Plan toward the goal, 10.10.2026

**Goal (owner, verbatim):** «довести его до вида, когда не стыдно показать людям» (bring it to a state where it is not embarrassing to show people)
**Order:** first I walk the product myself and write the experience down as text. When I am satisfied with it, the product is ready for the owner to test.
**Scheme:** skill `goal-steps`: a wave of at most 10 steps; step = edit + machine check + text walkthrough. Screenshots — only with owner approval; Chrome is forbidden.
**Artel:** 2 sessions, low cost (sonnet-runner/haiku-runner execute, Opus — review and verdict).

## Wave `К` — unified UI kit (10 steps)

Starting point (inventory 10.10). The web kit has Button, Card, Chip, Header, Icon, Info. Composer and InboxRow sit unused.
There are no fields: about 37 `<input>`, 4 `<select>`, 1 `<textarea>`, 4 `<a>` and 18 `<button>` in screens are built bypassing the kit.
Brand CSS has 234 px literals and not a single spacing token. Rules fight by load order: `.tabbed .screen` is declared three times, `.actions` and `.row` twice. Terminal depth: the `parts.ts` primitives exist, yet screens still build their own `Box/Text`. The landing pages sosed.place and neighbro.place keep their own hex tokens; they share only names with the web app.

| # | Step | After | Session | Check |
|---|---|---|---|---|
| `К1` | Kit text `docs/design/kit_RU.md` and `_EN.md` | — | f0 | lenses on the text until «ок» (OK); EN pair |
| `К2а` | Web, input elements of kit §3.1–3.2 marked «К2а» | `К1` | f0 | `/kit` + kit.spec.ts: six fields of §2, axe |
| `К2б` | Web, display elements of §3.1, §3.3 marked «К2б» | `К1` | f0 | same |
| `К7а` | Size and brand tokens (`kit_RU.md` §1.2–1.3) in `web/src/tokens.css`, brands on them | `К1` | d8 | token gate + px; textwalk without text changes |
| `К3` | Gate `check-web-kit`, ratchet | — | d8 | done: branch `worktree-agent-a71a8ba1ff8db32b7`, 0d959605; to merge |
| `К4` | Entry screens: Register, Restore, Arrival, Reissue, Unlock, Splash | `К2`, `К7а` | f0 | e2e of both brands + textwalk; ratchet down |
| `К5` | Me, Composer, Inbox, Chat, ChatActions, AgeFilter, Blocked, Hidden | `К2`, `К7а` | d8 | same |
| `К6` | Table, NewTable, TableBoards, ChatGame, Legal, Offer, Card, Feed, Match, adv/* | `К4` | f0 | same; `П1`, `П7` |
| `К6б` | Bottom navigation with four items: "tables" is a list of tables nearby (owner's decision 10.10, `kit_RU.md` §8.4) | `К6` | f0 | e2e table-feed, table-deck for both brands + textwalk |
| `К7б` | CSS: duplicates and fights (`.actions`, `.row`, `.tabbed .screen`, focus 2 px), screen rules overriding the kit | `К4`–`К6` | d8 | gates + textwalk |
| `К8` | Terminal: `depth/ink/kit.ts`, screens only on it, `DEPTH_PLAIN=1` | `К1` | d8 | run-depth-tests + terminal text walkthrough |
| `К9` | Landing pages: `:root` from the themes, kit CSS as a file | `К7а`, decision §8.3 | f0 | gates compare values |
| `К10` | Full text walkthrough of two brands and terminal | all | f0 | report: 0 lines «стыдно» (shameful), 0 screens `[?]`, ratchet `check-web-kit` = 0 |

File split: f0 — `web/src/ui/*`, screens `К4` and `К6`, landing pages; d8 — `web/src/tokens.css`, `web/src/brands/*`, `web/src/*.css`, screens `К5`, `depth/ink/*`. Shared files (`styles.css`, `App.tsx`) are edited by one session at a time — a `lock` line on the board.

## Wave `П` — items embarrassing to show, from the 10.10 text walkthrough (sosed)

| # | Where | What the person sees |
|---|---|---|
| `П1` | Table | «стол · «точки» · **dots**» (table · dots · **dots**) — the internal id of the game class, in English |
| `П2` | Feed card | «один · **ru**» (alone · **ru**) — a bare language code |
| `П3` | Splash, EN | `<html lang="ru">` with the English interface; language names mixed: "Belarusian, Armenian, Georgian, Kazakh, Kyrgyz, Tajik" in English, the rest — by self-name |
| `П4` | Splash, EN | "move the identity here" — jargon, lowercase initial letter |
| `П5` | Moderation refusal | «Фраза не принята: stub: a link.» (Phrase not accepted: stub: a link.) — the stub reason in English. The language of the real model's reasons is not known to me: NOT VERIFIED |
| `П6` | Feed | «ключи: печать хранилища сходится» («keys: storage seal matches») — service line; the owner decides |
| `П7` | Table before the game | «сдаться» («give up») is visible although the game has not started |
| `П8` | Card neighbro | Undo of the heart for 5 s (decision 02.10, `design-system-app_RU.md:500`) is not in the code; the owner decides (`kit_RU.md` §8.5) |
| `П9` | «ПИН» → «дальше» («PIN» → «next») | The node answered `POST /identities → 429` (per-address registration limit); the screen is silent: for 30 s no error line, the button stays in place. Measured by `scripts/textwalk/run.sh`, 10.10 |
| `П10` | «Кто вы» («Who are you»), age 12 | «дальше» («next») does not respond to a press; no reason next to it — only the general hint «сюда с 13 лет» (only from age 13) (violates `Н1`) |
| `П11` | «Кто вы» («Who are you»), documents | «редакция от 2026-09-16» («revision of 2026-09-16») — the date in machine form, not "16 сентября 2026" (16 September 2026) |
| `П12` | Terminal, tests | Red on a clean day59 (measured by xor-ad-d8, 10.10, NOT RE-VERIFIED by me): `run-depth-tests.sh` — `client.test.ts:207` (202 vs 200); `run-depth-live-ui` fails on the 22nd (`name_pending`), the live ones after it are not checked |
| `П13` | Table, end of the game | Under «счёт: Аня 2 · Борис 2» («score: Anya 2 · Boris 2») come bare «2 2 1 1» — whose cells is told neither to the eye nor to the screen reader; the button is again «начать игру» («start the game»), not «ещё партию» («another game») |
| `П14` | Lock | Screen text «ПИН / ПИН» («PIN / PIN»): the ⓘ button is named like the field («ПИН»), the screen reader hears one word twice |
| `П15` | Restore | The PIN fields are labelled «новый» («new») and «новый ещё раз» («new again») — new what? ⓘ buttons are named like headings («Бумажный код» («Paper code»), «новый») |
| `П16` | Feed | The like count is a bare «1»: the ♥ sign is not in the text, the screen reader hears "one". After restore the feed caption is «ключи: отперто ПИНом, обёртка та же» («keys: unlocked with the PIN, same wrapper») — jargon, see `П6` |
| `П17` | Table, sets and hands | Game sets by internal ids («checkers», «36», «ru»); cards as «карта {card}» («card {card}»), not in words |
| `П18` | «Столы» («Tables») | The node has no separate tables request: the screen takes tables from the first feed page; with a long feed some tables are not visible |
| `П19` | Leaving a table | Leads to the feed even when one came from «столы» («tables») |
| `П20` | «Кто вы» («Who are you»), documents | after each link «(новая вкладка)» («(new tab)») is visible to the eye (should be for the screen reader only); an extra space before «(редакция от …)» («(revision of …)») |
| `П21` | Feed, card | good news marked «внимание:» («attention:») — «внимание: Ваша фраза вышла…» («attention: Your phrase is out…»), «внимание: Лайк отправлен…» («attention: Like sent…»), «внимание: Мэтч!» («attention: Match!»); needs a success tone (Toast/Status), not Notice |
| `П22` | Feed and «столы» cards | the like count is doubled: «0» and «лайков: 0» («likes: 0»), «♥ 0» and «лайков: 0» |
| `П23` | Open card | the screen and tab title is «один» («alone», the mode), not the phrase or the author |
| `П24` | Inbox | «ваша фраза: ещё 260 мин» («your phrase: 260 min more») — not «4 ч 20 мин» («4 h 20 min») |
| `П25` | Table | «сказать / сказать» («say / say») — the field label and the button are one word |
| `П26` | Match, waiting for an answer | a bare field label «строка» («line») under «Ждём ответа» («Waiting for an answer») |
| `П27` | Name change | the hint «меняется на чистом счету» («changes on a clean score») — jargon, unclear to a person |
| `П28` | Feed, «столы» | «стол · «точки w1» · dots 2x2» («table · "dots w1" · dots 2x2») — class and set id (`П17` in progress at xor-ad-d8, not merged) |

### Terminal (depth), text walkthrough 10.10: the real `main.ts`, `DEPTH_PLAIN=1`, pty (xor-ad-d8)

| # | Where | What the person sees |
|---|---|---|
| `Т1` | Name change, refusal | «ошибка: Что-то пошло не так: the profile edit was refused: 422» («error: Something went wrong: …») — English and a code instead of a reason |
| `Т2` | Table, spectator | «ещё партию» («another game») is visible to a spectator; pressed — «внимание: не принято: refused» («attention: not accepted: refused») |
| `Т3` | Feed header | «signal · 59.9343, 30.3351 · 1000 м · 18–99» — raw coordinates and a service word |
| `Т4` | Own phrase | «твоя фраза: «…» · на проверке» («your phrase: "…" · under review») although it is published (hypothesis, NOT VERIFIED) |
| `Т5` | Feed | «фразы пока нет» («no phrase yet») under a non-empty feed |
| `Т6` | Inbox | «● 2», «■■■■■», «чат открыт · до 16:52» («chat open · until 16:52») — signs without words |
| `Т7` | Inbox | «гаснет после 1ч вашего молчания» («goes out after 1h of your silence») — durations not as on the web («1 ч», "1 h") |
| `Т8` | Chat field | «> >: _» — a doubled focus sign; «истории на диске нет» («no history on disk») — service text |
| `Т9` | Table | «стол · dots 3x3» («table · dots 3x3») — class and set id (fixed on the web, `П17`) |
| `Т10` | Table | «играют 1 · смотрят 1» («playing 1 · watching 1») with a free seat; «узел видит доску… реплика ждёт модерации» («the node sees the board… the line awaits moderation») — service text |
| `Т11` | «я» («me») | «лайкнутое» («liked») — as on the web, but an awkward word |
| `Т12` | Feed | «…Где ты?» («…Where are you?») — no context for what is being asked |

Fixed in the same step (xor-ad-d8, the test goes red on revert): the feed drew «?, ? · 0 м · 0 мин» above every phrase;
one's own line was labelled «отправить:» («send:») instead of «вы:» («you:»).

Walkthrough 10.10 after the scenario fix (`scripts/textwalk/run.sh`, sosed, clean database): 44 steps, 0 failed; a game of 12 moves,
both sides show the same count of taken lines on every move.

`П1`–`П5`, `П7`, `П9`–`П11`, `П13`–`П16` are included as steps in `К4`–`К6` (the screen is rebuilt anyway). `П6` — goes to the owner.
