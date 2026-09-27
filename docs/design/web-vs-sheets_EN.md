# Web vs sheets · WD0 · 27.09.2026

The baseline for wave 4. Every screen in `web/src/screens` is shot at 375×812 (@2x), in the
light and the dark scheme, and set next to its sheet in `panel/design/sheets/screen-*.svg`.

To reshoot: `scripts/design/shoot-web.sh`. It brings up a throwaway `docker-compose.web.yml`
stand with the PID in the project name. Two people, Аня and Борис, walk the screens the way
the e2e specs do. The sheets are rendered with the same `render-design-mockup.mjs`.
Shots and sheets go to `testing/screenshots/web/` (gitignored), and the outcome goes to
`shots.tsv`. Run of 27.09.2026 on `2830b75`: **27 states shot, 3 screens did not open**,
18 sheets rendered, exit 0.

## Main findings

1. **The web has no light scheme.** `web/src/styles.css:4` sets `color-scheme: dark` and has
   no `prefers-color-scheme` query. The `-light` and `-dark` shots are byte-identical
   (checked with `cmp`). The kit has both schemes: `.k-dark` and `.k-light`
   (`panel/design/kit/tokens.css:19-27`).
2. **Typeface.** The sheets use Golos Text (scale 26/400, 20/600, 16/400, 16/600, 14/600,
   14/400, with JetBrains Mono 13 for monospace). The web uses `system-ui 16px/1.4`
   (`styles.css:13`), h1 at 22 bold, and code in `ui-monospace` 22.
3. **Palette** (`.k-dark` vs `:root` in `styles.css:5-10`):

   | Token | Sheet | Web |
   |---|---|---|
   | bg | #0d0b0a | #0d0d0c |
   | fg | #f0e7dc | #ece9e2 |
   | muted | #9a8d7c | #8f8a80 |
   | accent | #bd4b2a | #c8623a |
   | err | #ef7a6a | #e0604f |

   The web has no `--panel` #262019, `--panel-2` #302720, `--border` #3a2e20,
   `--border-control` #80705a or `--accent-ink` #fff6f0.
4. **Surfaces.** On the sheets, cards, fields and bubbles are filled with panel or panel-2.
   On the web they are transparent with a 1px #2a2926 border.
5. **Buttons.** The primary button on the sheets is 44 tall, rx 13, with #fff6f0 16/600
   text and a 3px shadow. On the web it is ≈48, radius 10, dark text, no shadow. A disabled
   button on the web is `opacity .4`, where the sheets use panel-2 with a caption giving the
   reason. Focused fields get a double ring: the border plus a 2px outline.
6. **Navigation.** The sheets have a 64px bottom tab bar with icons and a 56px header with a
   back icon on the left. The web has three full-width buttons at the top (≈200px at 375)
   and a text "back" button on the right.
7. **The table screen has no layout.** Its root `<main className="table">`
   (`web/src/screens/Table.tsx:68`) does not get the `.screen` styles. Content starts at
   x=0, and the header breaks into 4 word-wrapped columns.
8. **Spacing.** The 16px side edge matches. Vertically, web content starts at y=24, while
   on the sheets the header takes 0–56.

## Screens

The rows were drafted by the comparison agent from the sheets' SVG and `styles.css`. Web
sizes marked ≈ are estimated from the shots, not measured. Main findings 1, 3 and 7 were
checked separately: `cmp` on the shots, `tokens.css:19-24`, and `Table.tsx:68` with its shot.

| screen | shot(s) | sheet | spacing | type | colour | components |
|---|---|---|---|---|---|---|
| Arrival | Arrival | 12-13 (13) | top 24; sheet header 56 | title ≈22 bold; sheet Golos 20/600 | disabled via opacity; unfilled field | sheet `field-code`, web a plain input; full-width back button |
| Blocked | — | — | — | — | — | **did not open on the stand:** after the match Борис has no card of Аня's in the feed, so there is nothing to block (waitFor, 30 s) |
| Card | Card, Card-liked, Card-matched | 23 | buttons in a wrapping row, gap 10 | phrase ≈26, same size as display 26 but a different face | "like" is accent with dark text; sheet `button-accent-pill` rx 22 | sheet `icon-back`, `icon-more`, `lifespan`, chips; web "← feed" and raw codes "alone · und" |
| ChatGame | ChatGame | 14-15-18 (18) | selects touch each other | captions 14; sheet uses mono 13 for system text | transparent fields | sheet `system-line` and the board in the chat; web two native selects above the messages |
| Chat | Chat | 08 | "game" and "safety code" buttons touch | time ≈14 system-ui; sheet mono 13 | own bubble is an accent outline; sheet fills it with panel-2, rx 13 | sheet `header-chat`, `message-input` with a round send button; web an input and a "send" button |
| Composer | Composer | 01-04-05 (04) | counter on its own line under the field | counter 14 system-ui; sheet mono 13 inside the field | double focus ring | sheet `segments`, web a native select |
| Departure | Departure | 12-13 (13) | as Arrival | warning in accent 16 | disabled via opacity | sheet `field-pin` of 6 dots, web a text field |
| Feed | Feed | 03, brands, light-03-08-23 | content from y≈225 below three tabs; sheet from y=108 | "Лента" ≈22; sheet header 20/600 | card transparent, radius 12; sheet panel, rx 13 | no `composer-float`, tab bar, filter icon (a "1 км" select instead), or category chip |
| Hidden | Hidden | no sheet; closest 06-07-10 (10) | top 24 | title ≈22 | — | empty state is one muted line; the sheets use display 26 plus muted body |
| Inbox | Inbox | 06-07-10 (07) | card padding 14 | "Разговоры" ≈22; sheet `tabs` 14/600 with a 3px bar | accent unread dot | sheet `row-chat` without borders, tabs "Предложения / Беседы"; web a card with a button, plus "refresh" |
| Likes | Likes | 25 | empty state centred | "Пока ничего" ≈18 | — | sheet `header-center`, `row-undo`; web "← feed" on the right |
| Match | Match, Match-waiting | 06-07-10 (06) | card padding 14 | name ≈22 | "talk" is accent with dark text | sheet `card-match`, `countdown`; web a text card and two buttons |
| Me | Me, Me-edit-name, Me-pin, Me-reset, Me-away | 06-07-10 (10), 12-13 (12), 20-21-22-24 | 8 rows of ≈48, gap 8 | "Я" ≈16 bold; sheet 20/600 | bordered rows, radius 10 | sheet `row-setting` without border, value on the right, chevron; web "имя Аня" as one label; an extra back button on the tab |
| NewTable | NewTable | 19 | fields with gap 16 | captions 14, same as k-meta | transparent selects | web three native selects |
| Offer | Offer | 17-venue | "home" pinned to the bottom | title ≈22 | accent go-button | the sheet probably has no "offer link" screen; checked by component list, not the PNG |
| Register | Register-1, Register-2, Register | 02 | blocks with gap 16, gaps of ≈60 | code `ui-monospace` 22 | disabled "done" via opacity | sheet `field-code`, `header-center`, `checkbox`; web plain inputs |
| Reissue | Reissue | 12-13 (13) | as Arrival | title ≈22 | disabled via opacity | sheet `field-code`, web an input |
| Restore | Restore | 12-13 (13) | fields 16/16 | — | disabled via opacity | sheet `field-pin` for the PIN, web two text fields |
| Splash | Splash | 01-04-05 (01) | centred block, 343-wide buttons — matches | brand accent ≈16; tagline ≈22 | "Начать": #0d0d0c on #c8623a; sheet #fff6f0 on #bd4b2a, rx 13, shadow | secondary buttons: #2a2926 border, radius 10; sheet #80705a, rx 13 |
| Statements | — | — | — | — | — | **did not open on the stand:** a new identity has no restrictions, so "me" has no `me-statements` row (click, 30 s) |
| TableBoards | — | — | — | — | — | **did not open on the stand:** Борис did not find the table's card in the feed, so the game never started (waitFor, 30 s) |
| Table | Table | 19 | **no padding at all:** content from x=0 | title ≈26 over 4 lines | — | `Table.tsx:68` without `.screen`; sheet `header-table` 96px, `bar-connection`, `message-input`, `system-line` mono 13 |
| Unlock | Unlock | 12-13 (13) | top 24 | "ПИН" ≈22 | double focus ring; disabled via opacity | sheet `field-pin` 327×48 of six dots, web a text field |

## Not checked

- Web sizes marked ≈ are not measured from the DOM.
- Blocked, Statements and TableBoards were not shot. The reasons in the table are read from
  the script's last step and were not investigated further.
- Sheets 17 and 25 were checked by component list, without looking at the PNG.

## WD3 · 27.09.2026 · feed

Run of `scripts/design/shoot-web.sh` on `e052cd5` with the WD3 changes: **34 states shot,
0 did not open**. Blocked, Statements, TableBoards and the cabinet (sign-in, "sent",
venues, offers) were added. Web e2e: 28 passed.

- Navigation is the bottom tab bar from the kit's `tabbar` symbol: 64px, the kit's icons, and
  a 32×3 accent bar under the active tab (`web/src/App.tsx`, `web/src/screens/feed.css`). The
  three top buttons are gone.
- Feed, Card, Composer, Likes, Unlock and Register have a 56px header with a 20/600 title and back on the
  left. On the feed, "write" sits where the floating 327×52 composer is, 12px above the bar.
  On Splash, Register and Unlock the primary button is at the foot, 343 wide.
- Tabbed screens wrap long lines. The inbox footer printed raw JSON `{"new_matches"…}`
  631 wide, which widened a phone's layout viewport to 656 for a 393 screen and moved the
  bar out from under taps. Printing the JSON remains an inbox defect.
- The shoot renders the built sheets `panel/design/screen-*.svg`. The sources in `sheets/`
  rendered as empty phones: the WD0 sheet PNGs were blank; the table above was built from
  the SVG and is unaffected.

Stage 2 (on `830f603`): the seven screens are built on `web/src/ui/*` — `HeaderScreen` (Composer, Likes, Card, Unlock, Register), `Button` (all seven; "write" is a `pill`), `Card` (feed, likes, the table card as `nested`). The phrase's mode is shown in words (`modes()`), not as a code. The composer screen got its own class `composer-screen`: `.composer` from `chat.css:15` made it a flex row. e2e: 33 passed (two `test.fail()` in other specs are expected). Shoot: 34 opened, 0 not.

Left for WD3: the offer complaint form in Card still uses the old buttons; the phrase language is the code "und"; focused fields have a double ring.

## WD6b · 28.09.2026 · the comparison map

The gate `scripts/check-web-design.sh` sets 29 shots against phones on the built sheets
(`scripts/design/web-design-map.tsv`: each pair records the phone's caption on the sheet).
The shoot opens 35 states. The cabinet is shot with its data: a venue proved by its
envelope code and an offer published, so the shot measures the layout, not an empty list.

The edge threshold dropped from 40 to 16: a card's fill (#262019 on #0d0b0a) is about 25
off the ground, and at 40 the edge was measured by the text, not the card. The edge now
meets the sheet for Feed (17→0), Match (15→0) and Inbox (5→0).

No pair on the sheets (dark shots):

| shot | why there is no pair |
|---|---|
| Hidden | no sheet of the hidden list; U–W on 06-07-10 show a hidden phrase in "me", not the list |
| Restore | 12-13 restores only by a move (13 Б); no paper-code entry from the splash |
| Reissue | a new paper code is an item of the 12 list, with no phone of its own |
| Me-pin | changing the PIN is an item of the 12 list, with no phone of its own |
| Me-reset | "start again" is a priced row of the 12 list; no confirmation screen |
| Card-liked, Card-matched | "after a like" on 23 shows the next card, not the "liked" line on this one |
| ChatGame | 18 shows only a game in progress; the choice and the offer the web shoots are not drawn |
| Cabinet-sent | sign-in on 17 is one phone; there is no "letter sent" state |

Light shots other than the feed (`Feed-light` ↔ `screen-brands` #9) have no pair: the
other sheets are dark.

## WS1 · WD6c · 28.09.2026 · splash

- **Stop: no language choice.** Sheet 01 shows "RU" in the corner as the language code. The
  web shows it as a label, not a button: the web has no language switch. The language is
  picked once at load from the browser's languages (`web/src/locales/say.ts:18`, `:26`).
- The splash icons come and go, so the shoot runs with `reducedMotion: "reduce"` and sets
  Splash against sheet 01's second phone, where the icons stand. Without it two shoots in a
  row gave 4.97% and 12.06% off the sheet.
