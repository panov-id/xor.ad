# UI kit: one set of elements for web, showcases, and terminal

Revision 3, 10.10.2026. Wave `К` (`docs/plan-goal-2026-10-10_RU.md`). Review lenses: round 1 — completeness 22, accessibility 27, consistency 17; round 2 — 30. Everything is accepted into the text except what is handed to the owner in §8.

**Rule.** A screen is assembled only from kit elements. If the needed element does not exist, it first appears in the kit: this text, `web/src/ui/`, `depth/ink/kit.ts`. Only then does it go onto a screen. The `check-web-kit` gate turns red on raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<a>` in `web/src/screens/`, `web/src/adv/`, `App.tsx`, and on a class outside the kit vocabulary. It works as a ratchet: it starts at the current count, cannot grow, and the target is zero.

**Three faces.** sosed — «блоки» (blocks), neighbro — «стикеры» (stickers), depth — terminal. The landing pages `sosed.place` and `neighbro.place` take token values from the kit (§1.4). Element texts — dictionary keys only, for all 17 languages. All 17 languages are written left-to-right (`web/src/locales/*.json`). Properties are logical regardless (`margin-inline`, `padding-block`).

`docs/brutalism_RU.md` describes the moderator panel; this kit does not apply to it.

## 1. Tokens

### 1.1. Color

Source — `web/themes/<brand>/*.json`, generation — `scripts/design/themes-css.py` → `web/src/themes.gen.css`.
The kit names colors on the left. Names on the right are theme keys. The mapping lives in `web/src/styles.css:7-12`;
kit names are not added to the JSON.

| Kit name | Theme key | Note |
|---|---|---|
| `--bg` | `--bg` | |
| `--panel`, `--panel-2` | `--surface`, `--surface-2` | |
| `--fg`, `--muted` | `--fg`, `--fg-muted` | |
| `--border` | `--surface-2` | border without a contrast requirement |
| `--border-control` | `--fg-muted` | control border, not below 3:1 |
| `--accent`, `--accent-ink`, `--accent-text` | `--accent`, `--accent-fg`, `--accent-text` | |
| `--err` | `--danger` | |
| `--ok` | `--fg` | **there is no separate "ok" color**: success is shown by a word and ✓ |
| `--focus` | `--focus` | |
| `--shadow` | `--shadow` | hard shadow color of neighbro |
| `--tile-1..4` | `--tile-1..4` | `--tile-5` exists only in neighbro |

Contrast is held by `scripts/design/themes-css.py --check` (line `check-web-themes` in `check-all.sh`):
text 4.5:1, focus and control border 3:1.

### 1.2. Size

Currently declared in `panel/design/kit/tokens.css`; the web app imports this file (`web/src/main.tsx:13`).
Step `К7а` moves the declarations to `web/src/tokens.css`, shared by the web app and the landing pages.

| Token | Value | Where |
|---|---|---|
| `--s-1 --s-2 --s-3 --s-4 --s-6 --s-8 --s-12` | 4 8 12 16 24 32 48 px | `tokens.css:28-30` |
| `--r-1 --r-2 --r-pill --r-round` | 8 / 13 / 999 px / 50 % | `tokens.css:24-27` |
| `--control-h` | 44 px, as `min-height`, not `height`: a long label (de, el) wraps | `tokens.css:31` |
| `--focus-w` | 3 px | `К7а`; now a literal in `styles.css:130` |
| `--fs-meta --fs-body --fs-title --fs-card --fs-big` | 14 / 16 / 20 / 20 / 36 px, in rem | `К7а`; values taken from `blocks.css:14,17,23,40`, `stickers.css:14,23,29` |
| `--dur-1` | 160 ms; with `prefers-reduced-motion: reduce` — 0 | `К7а`; now `blocks.css:35` |

Font size is set in rem. Elements hold up at 200 % zoom and 320 px width without horizontal scrolling.

### 1.3. Brand: shape, not color

The brand layer (`web/src/brands/<brand>/*.css`) sets only the parameters of this table. One token per parameter, value per brand. Now the values are literals; step `К7а` turns them into tokens. No new values are invented.
`--line` is a theme key (border-line); in §1.1 it corresponds to `--border`.

| Parameter | Token (`К7а`) | sosed «блоки» (blocks) | neighbro «стикеры» (stickers) | Source |
|---|---|---|---|---|
| Feed card radius | `--card-r` | 24 px | 18 px | `blocks.css:13`, `stickers.css:12` |
| Large card radius | `--card-big-r` | 32 px | 18 px | `blocks.css:32`, `stickers.css:12` |
| Card inner padding | `--card-pad` | 16 px; large — 32/24/24 | 18 px 20 px | `blocks.css:13,32`, `stickers.css:11` |
| Card rim | `--card-rim` | none | 7 px `--panel` | `stickers.css:12` |
| Card shadow | `--card-shadow` | none | `1.5px 3px 0 5px var(--shadow)` | `stickers.css:12` |
| Card tilt | `--card-lean` | 0 | by zero-based index: even index (first, third…) −1°, odd +1° | `neighbro/index.tsx:62`, `stickers.css:16-17` |
| Tile color | `--tile-*` | `--tile-((i mod 4)+1)`; every fifth starting from the first (i mod 5 = 0) is wide | `--tile-((i mod 4)+1)`; `--tile-5` is not used in the feed | `sosed/index.tsx:62-65`, `neighbro/index.tsx:62` |
| Card focus ring offset | `--card-focus-offset` | 3 px | 6 px | `blocks.css:25`, `stickers.css:25` |
| Primary button: radius, height | `--btn-r`, `--btn-h` | 32 px, `--control-h` | 28 px, 56 px | `blocks.css:74`, `stickers.css:80` |
| Primary button: shadow | `--btn-shadow` | none | none (`stickers.css:80` overrides `:65` by cascade; contradiction — §8.2) | |
| Secondary button: radius, background | `--btn2-r`, `--btn2-bg` | `--r-2`, transparent | 28 px, `--panel` | `stickers.css:81` |
| Field: radius, height, font size, letter-spacing, border | `--field-r --field-h --field-fs --field-ls --field-border` | 28 px, 56 px, 20 px, 0.08em, 1.5 px `--line` | 10 px, 56 px, 22 px, 0.6em and uppercase, 0 | `blocks.css:86`, `stickers.css:75-78` — now this is the transfer-code field; `К7а` makes it a CodeField view, a regular field takes `--r-1` and `--control-h` |
| Like | `--like-size` | `block-like` button 64×64, radius 18 px | heart sticker 56×56, circle, tilt −8° | `blocks.css:51`, `stickers.css:37-38` |
| neighbro code-field border | `--field-border` | — | **not 0**: now 0 on `--surface` against `--bg`, contrast about 1.1:1 (`neighbro/azure.json`) — violates the 3:1 from §1.1 (WCAG 1.4.11). `К7а` sets 1.5 px `--border-control`; `themes-css.py --check` gets an added check of the field border against the background | `stickers.css:75-78` |

### 1.4. Landing pages

`sosed.place/landing/index.html:53-79` and `neighbro.place/landing/index.html:85-119` keep their own hex values.
Step `К9` generates their `:root` from the same themes. The sosed landing has `--border: #725a3f` (`:61`) and green `--ok` (`:71`); the theme has neither. Whose value is the truth is for the owner to decide (§8.3). Until that decision, `К9` compares only matching names.
Landing-page buttons, fields, and links take the same kit CSS (`web/src/kit.css`, `К7а`), linked as a file. The landing pages do not need React.

## 2. Common rules for an element

Each element in §3 is a table row with six required fields:
1. **Name** — where the accessible name comes from.
2. **Role** and attributes.
3. **Keys.**
4. **Focus** — where it lands and where it goes.
5. **Target** — touch target.
6. **Channel** — what, besides color, carries the state.

A dash means "not applicable"; a cell is never empty. `kit.spec.ts` checks each row on `/kit`.

Shared rules, not repeated in the rows:
- **Focus** — `:focus-visible`, ring `--focus-w` in color `--focus`, offset 3 px; for cards `--card-focus-offset`. The 2 px rule in `styles.css:65` is removed (`К7б`). The ring must not go under the TabBar and the «написать» («write») button: `scroll-padding-bottom` equals their height (WCAG 2.4.11).
- **Target** — 44×44 by default ("44" in the table). Exceptions: an inline link in text (WCAG 2.5.8) and a board cell, 24 px.
- **Unavailable** — `aria-disabled="true"`, not `disabled`. Focus is set, the reason is given in words next to it, linked by `aria-describedby` (`Н1`).
- **Waiting** — `aria-busy="true"`; the label stays in the tree; the result goes to `role="status"`.
- **Modal** (ActionSheet, Confirm) — on open, focus goes to the `h2` heading (`tabindex="-1"`), not to a button. Tab is trapped inside, Esc closes, focus returns to the button that opened it.
- **Motion** — `--dur-1`; with `reduce`, everything appears in one frame.
- **Texts** — by dictionary keys. No internal id is shown: "dots" → «точки» (dots), "ru" → «русские слова» (Russian words), "36" → «колода из 36 карт» (a deck of 36 cards), "3x3" → «поле 3×3» (a 3×3 field), "stub: a link" → the reason from the dictionary. Numbers and dates — via `Intl`; plurals — by forms in the keys.

## 3. Elements

The **Now** column («сейчас») — where the element lives in code, or the raw markup that stands in for it. «есть» (exists) — already in `web/src/ui/`. The step in brackets — which step builds it. `К2а` — input elements, `К2б` — display elements. An element needed by one screen is built by that screen's step.

### 3.1. Actions

| Element | Now | Name | Role | Keys | Focus | Target | Channel |
|---|---|---|---|---|---|---|---|
| Button `primary` | exists, `ui/Button.tsx:15` | word | `button` | Enter, Space | its own place | `--btn-h` | one filled button per frame |
| Button `secondary` | exists | word | `button` | Enter, Space | its own place | 44 | outline `--border-control` |
| Button `danger` | exists | verb of irreversibility («удалить» (delete), «сдаться» (give up)) | `button` | Enter, Space | its own place | 44 | word + `--err` outline |
| Button `text` | exists | word | `button` | Enter, Space | its own place | 44 | — |
| IconButton | exists, `Button icon=`; raw `Chat.tsx:38`, `App.tsx:252` | `aria-label` required (type); `title` does not replace it | `button` | Enter, Space | its own place | 44 | icon from 41 (`ui/Icon.tsx`); `К2а` adds `chevron` |
| LinkButton (`К2а`) | `<a class="ui-button">`, `Offer.tsx:72` | word | `link` | Enter | its own place | 44 | Button look |
| Link (`К2а`) | raw `<a>`, `Legal.tsx:86-90` | link text; external — «(новая вкладка)» (new tab) in the name | `link` | Enter | its own place | inline — exception 2.5.8; standalone — 44 | underline + `--accent-text` |
| Actions (`К2а`) | `.actions`, duplicates in `styles.css:47`, `chat.css:10` | — | `group` without a name | Tab | primary last | — | order "from quiet to loud" |
| ActionSheet (`К2б`) | none | sheet heading `h2` | `dialog`, `aria-modal` | Tab inside, Esc | on `h2`; on close — on "…" | 44 per row | the loud action last and by word |
| Confirm (`К2б`) | `.confirm`, `Card.tsx:100,126` | heading `h2` «что исчезнет» (what will disappear) | `alertdialog` | Tab inside, Esc | on `h2`; on close — on the button | 44 | the list and the cost in numbers; no default |

### 3.2. Input

| Element | Now | Name | Role | Keys | Focus | Target | Channel |
|---|---|---|---|---|---|---|---|
| Field (`К2а`) | raw `<input>` (52 openings, `scripts/count-raw-controls.sh`) | `<label for>`; placeholder is not a name | `textbox`; hint and counter — `aria-describedby`; error — `aria-invalid` and `aria-errormessage`; `kind` view and its `autocomplete` (WCAG 1.3.5): `text` (name — `nickname`), `number` (age, `inputmode=numeric`), `email` (`Card.tsx:103`, `adv/Cabinet.tsx:117` — `email`), `decimal` (coordinates, `adv/Cabinet.tsx:136-140`), `datetime` (`adv/Cabinet.tsx:493`), `url` (`adv/Cabinet.tsx:502`) | input | its own place | `--control-h` | error: the word «ошибка:» (error:) and a `--err` border |
| FieldGroup (`К2а`) | `<fieldset><legend>`, `Cabinet.tsx:132-133` | `legend` | `group` | Tab | first field | — | — |
| PinField (`К2а`) | `Register.tsx`, `Unlock.tsx`, `Locked.tsx:50`, `Me.tsx:263`, `Departure.tsx:97` | «ПИН, 6 цифр» (PIN, 6 digits); the pair «ПИН / ещё раз» (PIN / once more) — two PinFields | one `<input>`, `maxlength=6`, `inputmode=numeric`, `autocomplete=one-time-code` | input, paste (3.3.8), Enter submits | after the 6th digit it stays in the field | 44 | digits hidden; «показать» (show) — Button text; mismatch — ErrorLine |
| CodeField (`К2а`) | `Register.tsx:153,157`, `Reissue.tsx:88,92` (groups 2 and 4), `Restore.tsx:50`, `Arrival.tsx:31`, cabinet codes `Cabinet.tsx:221,289` | `role=group` «бумажный код» (paper code); group — «группа N из M» (group N of M) | `group`, inside `textbox` | pasting the whole code is split across groups; Backspace in an empty group — back; Shift+Tab | after the 4th character — next group | 44 | `groups=[2,4]` view shows only the requested groups; case and separator normalization — in the component |
| Select (`К2а`) | raw `<select>`: `Splash.tsx:33`, `Feed.tsx:88`, `NewTable.tsx:64,75,81`, `Cabinet.tsx:144,474` | `<label>` | native `select` | arrows | its own place | 44 | value in words; in the language picker each `<option>` has its own `lang` and self-name |
| Segments (`К2а`) | composer, `ChatActions.tsx:28` (`role=group`), `Me.tsx:354-357` | group name | `radiogroup`, inside `radio` and `aria-checked` | Tab once, arrows | selected | 44 | fill and border thickness; at 320 px — wraps onto two lines |
| Choice (`К2а`) | theme and language, `Me.tsx:129-135,152-156` | group name | `radiogroup` | Tab once, arrows | selected | 44 | ✓ and border thickness; a theme sample next to the word |
| RangePair (`К2а`) | `AgeFilter.tsx:79,88` — two sliders | «от» (from), «до» (to) | two native `range`, `aria-valuetext` («от 25 лет» (from 25 years)) | arrows by step | its own place | 44 | value in words next to it; edge — «без ограничения» (no limit); «от» > «до» — ErrorLine |
| Textarea (`К2а`) | `Composer.tsx`, complaint `Card.tsx:101-117` | `<label for>` | `textbox` multiline | input | its own place | 44 | remaining-count in words |
| Checkbox (`К2а`) | consent, `Register.tsx`, `Legal.tsx:86` | label; links inside it — Link | native `checkbox` | Space | its own place | 44 together with the label; square 24 | ✓ (in mono too); error — `aria-invalid` and ErrorLine |
| Disclosure (`К2а`) | `<details><summary>`, `Composer.tsx:80-81` | `summary` text | native `details` | Enter, Space | `summary` | 44 | ▸/▾ sign and the browser's `aria-expanded` |
| MessageInput (`К2а`) | `ui/Composer.tsx` (rename), chat `Chat.tsx:133-136`, table `Table.tsx:109-115` | `<label>` «реплика» (reply) | `textbox` + Button | Enter sends | after sending it stays in the field | 44 | empty — button with outline, not `disabled` (`Н7`) |
| Starters (`К5`) | exists, `ui/Message.tsx:57`; screen `Chat.tsx:68` | heading «начать с фразы» (start with a phrase) (`h2`) | `section` with an `ol`; each phrase has its place and a mark | — | — | — | the phrases the talk began from, with the mark in words; a removed phrase says so |
| MoveInput (`К6`) | exists, `ui/MoveInput.tsx:13`; screens `TableBoards.tsx:68,144,158`, the table's line `Table.tsx:127` | move-field labels from the dictionary | `form`, `FieldGroup` of Field | input; Enter — move | first field | 44 | «так нельзя» (not allowed) — ErrorLine |

### 3.3. Display

| Element | Now | Name | Role | Keys | Focus | Target | Channel |
|---|---|---|---|---|---|---|---|
| Screen (`К2б`) | `<main data-screen>`; `Table.tsx` (`:65`, `:72`) has no `data-screen` | screen `h1` | `main`, `header`, `nav` | — | on screen change — to `h1` (`tabindex=-1`); «к содержимому» (to content) — first | — | `document.title` "экран · бренд" (screen · brand) |
| Header | exists: `HeaderScreen`, `HeaderFeed` | `h1` | `header` | — | — | «назад» (back) — IconButton 44 | title in words |
| Step (`К4`) | `ui-step` "1/2", `Register.tsx:110,131` | «шаг 1 из 2» (step 1 of 2) | `aria-label` | — | — | — | number visible |
| Tabs (`К5`) | exists, `ui/Tabs.tsx:12`; screen `Inbox.tsx:200-209`, `.ui-tab-on` `styles.css:281` | word; a new count goes in the name («разговоры, новых: 3» (conversations, new: 3)): hidden «новое» (new) (`Tabs.tsx:32`) and a Dot | `tablist`/`tab`/`tabpanel` | arrows wrap around, Tab enters on the selected one | selected | 44 | selected: colour `--fg` and an `--accent` underline; every tab has the same weight (`styles.css:280`) |
| TabBar (`К2б`; four items — feed, tables, conversations, me, §8.4, `К6б`) | exists, `ui/TabBar.tsx:9`; screen `App.tsx:254-266` — four items, as decided | word under the icon | `nav aria-label`, `aria-current=page` | Tab | — | 44 | label under the icon, weight and a bar over the open item (`feed.css:28-30`); what is new goes in the item's `label` in words, no dot |
| Nav (`К6`) | exists, `ui/Nav.tsx:10`; screen `adv/Cabinet.tsx:73` — the cabinet page without a TabBar | word; the place (`where`) in mono on the left | `header` with `nav aria-label`, `aria-current=page` | Tab | — | 44 | underline and weight on the current one (`styles.css:352`) |
| Dot (`К2б`) | `ui/Dot.tsx`; `ui/Tabs.tsx:34`, `ui/InboxRow.tsx:26` | — | `aria-hidden` | — | — | — | the word «новое» (new) in the row or tab name is required |
| Card (exists) | `ui/Card.tsx:8,11`: now `kind` = `plain`, `nested`, `own`. `К2б` adds entity parameter `of` = `phrase`, `table` (now `kind="nested"`, `Feed.tsx:134`), `offer` (now `<span className="offer">`, `Feed.tsx:145`), `match`, `venue` (`adv/Cabinet.tsx:265-290`), `preview` (`adv/Cabinet.tsx:435`); `own` and `fading` are states | CardOpen: only the phrase text; caption — `aria-describedby` | `article`/`li` + `button` over it | Enter | its own place | whole card | mode in words, language by name, ♥ and a count; `own` — Chip «на проверке» (under review) (`Н6`); `fading` — expiry in words (`Н2`) |
| Swipe and like | sosed `useSwipe.ts` | — | every gesture has a button (2.5.1, 2.5.7) | Enter on the button | — | 44 | — |
| Message (`К5`) | exists, `ui/Message.tsx:14,24`; screens `Chat.tsx:124-140`, `Match.tsx:126-127`. The table's lines `Table.tsx:121-126` are still a raw `ul.ui-lines` | «вы» (you), name, «система» (system) (hidden, before the text) + text + time | `MessageLog`: `role=log`, `aria-live=polite`, the name comes from the caller | — | after sending it stays in MessageInput | «ещё раз» (retry) — 44 | own or other — in words for screen readers and by side (`ui-msg-mine`…); «не доставлено» (not delivered) in words; variant `extra` (a later like), mark `mark` |
| Tombstone (`К5`) | exists, `ui/Message.tsx:44`; screens `Chat.tsx:105`, `Match.tsx:119` (`Н4`) | `h2` — the tombstone title, the text below | `section role=status` once | — | — | — | word |
| Chip (exists) | `ui/Chip.tsx:4`, tones `amber teal violet accent muted` | word | — | — | — | — | word always; tone is the second channel |
| InboxRow (exists) | not used; raw `button` at `Inbox.tsx:180` | name + last line + «новое» (new) | `button` | Enter | its own place | 44 | time and «новое» (new) in words |
| SettingRow (`К2б`) | `Me.tsx:80-102`, `Blocked.tsx:26`, `Hidden.tsx:28` | label + value | `button` | Enter | its own place | 44 | `danger` — word and `--err` |
| List (`К2б`) | `Legal.tsx:139-144`, hidden, blocks | list name | `list` | Tab | — | row 44 | «вернуть» (restore) in words |
| EmptyState (`К2б`) | markup of `Feed.tsx` | `h2` | — | — | does not take focus | action 44 | heading and line |
| Notice (`К2б`) | `.warn`: `Chat.tsx:44,91`, `Card.tsx:75-79`, `Feed.tsx:103`, `Departure.tsx:94`, `Me.tsx:209,322` | «внимание:» (attention:) as the first word | `role=note` | — | — | — | word |
| ErrorLine (`К2б`) | `.error` | «ошибка:» (error:) as the first word | `role=alert`; one error — one announcement | — | after a failed send — first field with an error | — | word; reasons from the model — in the interface language |
| Toast (`К2б`) | `Card.tsx:116` | text | `role=status` | Esc; «закрыть» (close) — Button text | does not take focus | 44 | does not disappear while it has focus |
| UndoRow (`К5`) | exists, `ui/Message.tsx:77`. Screens: «отклонено · вернуть» (declined · restore) `Inbox.tsx:161` (callback `App.tsx:364`) — no timer; neighbro's heart «лайк уйдёт через 5 с · отменить» (the like goes in 5 s · cancel) `brands/neighbro/index.tsx:214-221` — with a timer `UNDO_S = 5` (`:73,130-135`). sosed has no like with an undo: `sosed/index.tsx:142` sends at once | text + «вернуть» (restore) / «отменить» (cancel) | `div`; the mark inside is `role=status` | Enter on the button; at neighbro «отменить» is first in Tab after the card (`:213`) | at neighbro after a cancel — back to the heart | 44 (Button text) | mark in words. neighbro's timer stands while **focus** is in the row (`:114-118,216-217`, WCAG 2.2.1): a pointer hovering does not hold it, or a resting mouse would never let the like go. Inbox has no timer — the row stays until the screen is left |
| Pair (`К6`) | exists, `ui/Pair.tsx:6,10`; screens `Statements.tsx:26-31`, `Departure.tsx:110-113`, the table's score `Table.tsx:99-101` | caption | `dl`/`dt`/`dd` (`Pairs` is one `dl`) | — | — | — | caption in words, not only the `--muted` colour |
| Status `header` (`К2б`) | none | outcome in words | `role=status`; «устарело» (outdated) — `role=alert` once | — | — | — | four outcomes in words: «на связи» (online), «соединяемся» (connecting), «нет сети» (no network), «у нас не получилось» (we could not do it) |
| Status `inline` (`К5`) | exists, `ui/Status.tsx:20`; screens `Chat.tsx:65` (`peer-away`), `Chat.tsx:80` | word | `p role=status`, in the page before it has words | — | — | — | word |
| Stat (`К6`) | exists, `ui/Stat.tsx:6`; screen `adv/Cabinet.tsx:297` | caption + number | `p` | — | — | — | bad values in words («много» (a lot), `web.ui.many`), not by the `--err` colour alone |
| Code (`К2б`) | `Chat.tsx:68`, `Departure.tsx:120`, `Offer.tsx:58-59` | «код» (code) + value | — | — | — | «скопировать» (copy) 44 | monospace |
| Info (exists) | `ui/Info.tsx:12` | ⓘ with `aria-label` | `button`, `aria-expanded`, `aria-controls` | Enter, Esc | on open — into the callout (`Info.tsx:23`); Esc and a click outside return to ⓘ (`:19,31`) | 44 | not by timer and not by a single hover (1.4.13) |
| Skeleton (exists) | class `.skeleton` | hidden «загрузка» (loading) | list `aria-busy`; skeleton `aria-hidden` | — | does not jump | — | — (`Н3`) |
| Board `dots` (`К6`) | exists, `ui/Board.tsx:17` (`DotsGrid`); the table and the game in a talk via `TableBoards.tsx:188` | edge: «линия: ряд N, колонка M, по горизонтали» (line: row N, column M, horizontal), not `h:0:0` | `svg role=group`; a free edge is `rect role=button`; a taken one is `role=img` | Tab, Enter, Space | its own place | 24 (board exception, `HIT` `Board.tsx:10`) | taken — in words in the name («занято» (occupied)); a closed box — the owner's initial and a name for screen readers, own filled, other's outlined |
| Board `cells` (`К6`) | exists, `ui/Board.tsx:81` (`CellsGrid`); `TableBoards.tsx:141` | «доска: e2 P, …» (board: e2 P, …) — the position in words | `pre role=img` | — | — | — | move — via MoveInput |
| Hand (`К6`) | exists, `ui/Hand.tsx:8,12,20`; screens `TableBoards.tsx:44` (cards), `:96` (dominoes) | a card in words: visible text and name «дама пик» (queen of spades), button name «карта дама пик» (rank and suit are `web.rank.*`, `web.suit.*`, word order is `web.table.cardName`, the word comes from `cardWord`, `api/tables.ts`); on the table «на столе: дама пик» (on the table: queen of spades); the dice of a roll — «пять и два» (five and two) (`dieWord`, `web.die.*`). Dominoes: a bone as `[3:4]`, ends named «{кость} слева» / «{кость} справа» (bone on the left / on the right) (`web.table.left`, `.right`) — **«в начало» / «в конец» (to the start / to the end) are not done**, the ← → glyphs are visible | `ul role=list` of `button`; dominoes: a bone and a button for each end | Enter | its own place | 44 | word |
| TableList (`К6б`) | exists, `screens/TableList.tsx:20`; the «столы» (tables) tab (`App.tsx:314`), the table cards are the feed's (`Feed.tsx:147`) | heading «столы» (tables) (`h1`); card: «стол · «name» · game set» in words (`classWord`, `setWord`), below players, watchers, free seats, ♥ | `ul` of `li` `Card of=table`, `CardOpen` over it | Enter on a card seats the person (`App.tsx:enterTable`); leaving the table comes back here (П19) | its own place | whole card | game and set in words, not ids; empty — `EmptyState` with the word «новый стол» (new table) |
| Illustration (`К2б`) | `Splash.tsx:42-44`, zone diagram `Composer.tsx:65` | decoration — none; diagram — `<title>` | decoration `aria-hidden` | — | — | — | — |

## 4. Terminal (depth)

Step `К8` moves screens onto `depth/ink/kit.ts`: instead of their own `h(Box)` and `h(Text)`, screens take kit elements.
Measured 10.10, `grep -o "h(Box\|h(Text"` over `depth/ink/*.ts`: `rooms.ts` 52, `screens.ts` 33, `move.ts` 17,
`table_boards.ts` 12, `table.ts` 11, `chat_game.ts` 9, `app.ts` 3, `parts.ts` 5 (moves into `kit.ts`). After `К8` — only in `kit.ts`.

Rules for this face:
- Color is the terminal's. Meaning is carried by the word and the sign; `NO_COLOR` loses nothing.
- Focus — `>` before the element, and inversion.
- Error — a line «ошибка: …» (error: …), not `!`.
- `DEPTH_PLAIN=1`: no alternate buffer, no `─│` frames and no `▋` cursor; a stream of lines with no in-place redraw.
- Key hint — a text line at the bottom.
- Check with a terminal screen reader is NOT VERIFIED; the text walkthrough does not replace it.

| Kit | depth/ink | Exists or `К8` | Glyph | Keys |
|---|---|---|---|---|
| Button, Actions | `Menu` (`parts.ts:108`) → rename to `Actions` | exists; rename in `К8` | `> [ слово ]` (`> [ word ]`) | ←/→, Enter |
| Field, PinField, Textarea | `Fields` (`parts.ts:159`); type `Field` → `FieldSpec` | exists | `подпись: значение` (`label: value`) | input, Tab/↓ |
| Form | `Form` (`parts.ts:224`) | exists | fields and Actions | Tab, Enter |
| Header | `Head` (`parts.ts:209`) | exists | heading and rule | — |
| Select, Choice | `Select` | `К8` | `‹ значение ›` (`‹ value ›`) | ←/→ |
| Segments | `Segments` | `К8` | `( ) один  (•) компанией` (alone / with company) | ←/→ |
| Checkbox | `Check` | `К8` | `[x] текст` (`[x] text`) | Space |
| Link | `Link` | `К8` | `‹текст›` (`‹text›`), address on the next line | Enter |
| Card | `Card` | `К8` | block of three lines | ↑/↓ |
| Message | `Line` | `К8` | `имя  время` (name  time) and text | — |
| EmptyState, Notice, ErrorLine | `Empty`, `Notice`, `ErrorLine` | `К8` | the word first | — |
| Board | `Board` | `К8` | ASCII grid | arrows, Enter |

## 5. How the kit is checked

| What | How |
|---|---|
| Screens only from the kit | `scripts/check-web-kit.sh` with ratchet `web/kit-baseline.tsv`. Done in branch `worktree-agent-a71a8ba1ff8db32b7` (0d959605), not yet merged into day59. Dictionary — `.ui-*` classes from `web/src/styles.css`. A screen class is allowed if there is no raw control under it |
| Raw count now | `scripts/count-raw-controls.sh` (tag openings): on 10.10 input 52, button 13, select 6, textarea 1, a 4; px in brand CSS 234. `check-web-kit.sh` has its own parser; its numbers are in `kit-baseline.tsv`. Documents show only numbers from a run, with the command |
| Color by token only | `scripts/check-web-tokens.sh` |
| Size by token only | `check-web-tokens`, extended to px outside `tokens.css` (`К7а`) |
| Each element by the six §2 fields | `/kit` + `web/e2e/specs/kit.spec.ts`: axe-core on both brands and all themes, Tab order, `reducedMotion: "reduce"`. No snapshots |
| Person walks the path | `scripts/textwalk/run.sh` (scenario `scripts/textwalk/textwalk.mjs`): visible text, control names, errors, time. No screenshots |
| Terminal | `run-depth-tests.sh` + text walkthrough in `DEPTH_PLAIN=1` |
| Landing pages | `К9`: token values match the theme |
| Screen reader (NVDA, VoiceOver) | NOT VERIFIED; no manual pass was done |

## 6. Order of steps

The same as in the plan (`docs/plan-goal-2026-10-10_RU.md`, wave `К` table):
`К1` → `К2а`, `К2б` and `К7а` → merge `К3` → `К4` → `К5` and `К6` → `К7б` → `К9` → `К10`. `К8` runs in parallel with `К4`.

## 7. Texts

- A field label is a noun, in Russian in lowercase («имя» (name)).
- A button is a verb. In English it is capitalized («Continue»); in Russian, lowercase.
- `<html lang>` equals the interface language and changes with it.

## 8. Decided by the owner (10.10.2026)

1. The service line on the feed («ключи: печать хранилища сходится» (keys: the vault seal matches), «отперто ПИНом, обёртка та же») — **remove**.
   The vault check stays in code; on a mismatch, an ErrorLine in human words. The `data-sealed` attribute stays. Step `К6`.
2. neighbro primary button shadow — none (`stickers.css:80`); the dead rule `:65` was removed in `К7а`. Not asked; settled by the cascade.
3. Landings vs the theme — **the web theme is the truth**: the landings' `:root` is generated from `web/themes/*.json`, their own hex
   values go, there is no green `--ok` (success by word and ✓). Step `К9`.
4. Bottom navigation — **four items: feed, tables, conversations, me**. The "tables" item is a list of tables nearby; step `К6б`.
   The kit's TabBar (§3.3) has four items.
5. neighbro heart undo for 5 s — **build** in `К6`: the heart goes to the node after 5 s, UndoRow `role=status`
   "like goes in 5 s · undo", the timer stops while focus is in the row (WCAG 2.2.1).
