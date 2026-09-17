# Drawing brief — 2026-09-17

One document for whoever draws the application's screens. Nothing is decided here again: every line points
to where the decision is recorded. Pair — `drawing-brief_RU.md`.

## 1. What we draw, and in what order

Twenty-five storefront screens `sosed.place/docs/NN-*_EN.md` (`neighbro.place` holds the same files up to brand,
`check-screens-mirror`), the mechanics — `00-mechanics_EN.md`, the catalogue of states and texts — screen 11.
Screen 16 "Stickers" is outside the alpha and is not drawn. The order is the build order of chat spec §13, because
a screen cannot be checked without the data behind it:

1. Identity: 01 splash, 02 about you, 12 identity and security, 13 move and recovery, 22 appearance, 24 hints.
2. Feed: 03 feed, 04 composer, 05 message actions, 09 my messages, 23 phrase full screen, 25 my likes, 17 offer.
3. Match and chat: 06 match, 07 chats, 08 chat, 18 game in a chat.
4. Table: 19 table.
5. The rest: 10 settings, 14 support, 15 legal documents, 20 step away, 21 console.

The terminal client `depth` is drawn after the web by the same protocol (`depth-client_EN.md`); this brief is about the web.

## 2. The states of every screen

Source — the matrix `reviews/MATRIX_2026-09-15_screen-states.md`: 336 cells, 0 empty, exactly 14 columns per
screen, every "present" cell points to a line of the screen. The mockup must show every state of its list;
"not applicable" is not drawn, the reason is in the matrix.

| Screen | States of 14 | Which |
|---|---|---|
| 01 Splash | 0 | — |
| 02 About you | 5 | loading, no network, node unreachable, moderation / limit refusal, other |
| 03 Feed | 12 | empty, loading, no network, node unreachable, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 04 Composing | 13 | loading, no network, node unreachable, moderation / limit refusal, pause after refusals, hold, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 05 Feed Message Actions | 11 | no network, node unreachable, moderation / limit refusal, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 06 Match | 12 | loading, no network, node unreachable, moderation / limit refusal, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 07 Conversations | 12 | empty, loading, no network, node unreachable, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 08 Conversation | 13 | empty, loading, no network, node unreachable, moderation / limit refusal, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 09 My Messages | 14 | empty, loading, no network, node unreachable, moderation / limit refusal, pause after refusals, hold, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 10 Settings | 14 | empty, loading, no network, node unreachable, moderation / limit refusal, pause after refusals, hold, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 12 Identity and security | 10 | loading, no network, node unreachable, moderation / limit refusal, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, other |
| 13 Moving and recovering the identity | 10 | loading, no network, node unreachable, moderation / limit refusal, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, other |
| 14 Support | 12 | empty, loading, no network, node unreachable, moderation / limit refusal, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 15 Legal Documents | 6 | loading, no network, tab locked, stepped away, documents changed, other |
| 17 Offer | 12 | no network, node unreachable, moderation / limit refusal, pause after refusals, hold, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 18 A game inside a conversation | 13 | loading, no network, node unreachable, moderation / limit refusal, pause after refusals, hold, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 19 A table: pull up a chair and play together | 14 | empty, loading, no network, node unreachable, moderation / limit refusal, pause after refusals, hold, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 20 Stepping away | 9 | no network, node unreachable, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, other |
| 21 Console | 7 | empty, no network, node unreachable, moderation / limit refusal, tab locked, stepped away, other |
| 22 Appearance | 9 | loading, no network, node unreachable, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, other |
| 23 A phrase full screen | 12 | empty, no network, node unreachable, moderation / limit refusal, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, stepped away, documents changed, other |
| 24 Hints at the first encounter | 1 | other |
| 25 My likes | 13 | empty, loading, no network, node unreachable, moderation / limit refusal, pause after refusals, frozen: move, frozen: closed, frozen: PIN limit, tab locked, away, documents changed, other |


Beyond the matrix every screen has "the app is out of date" — one state for all (11:51).

## 3. Texts

State texts are not invented: the table of screen 11 (`11-empty-and-edge-states_EN.md`, section "Texts") gives the
heading, the line under it and the action for every state; seven lines there deliberately lack a heading or a second
line (11:191). Moderation refusals, the pause, the name and the Article 17 statement — `refusal-wordings_EN.md`
§1–6 (a proposal until read aloud). Russian texts are in the `_RU` pairs of the same files; the mockup is drawn in
both languages, because labels have no fixed width and the layout is checked on the longest (`accessibility-and-i18n_EN.md`).

## 4. Tokens and numbers

Tokens — `design-system-app_EN.md` §"Tokens": colours `--bg`, `--panel`, `--fg`, `--muted`, `--border`, `--accent`,
`--accent-ink`, `--accent-text`, `--ok`, `--err`; faces `--sans`, `--mono`; radii `--r-1: 8px`, `--r-2: 13px`,
`--r-pill`, `--r-round`; spacing `--s-1: 4px` … `--s-12: 48px`. Theme — light, dark and system, three contrast
steps, an accent from the storefront's set (screen 22).

Accessibility numbers — `accessibility-and-i18n_EN.md`, the "numbers" table: text contrast 4.5:1, controls and marks 3:1,
a 2px focus ring with a 2px gap, a 44×44 px touch target (board cells no less than 24×24 px), text no smaller than 16px,
line height 1.5, the layout survives 200% zoom and a 320 CSS px width, no `transition` by default.

## 5. Component vocabulary

`design-system-app_EN.md` §"Component vocabulary": 50 components with screens, states and rule; six rules R1–R6 the
system did not have (disabled state, fading, skeleton, tombstone, status strip, muted own phrase) — the mockup must
show them; ten screen disagreements with the direction of settling.

## 6. What drawing settles

Seventeen questions on screens 01, 03, 04, 05, 06, 07, 13, 15, 17, 19, 22, 23, 24 are marked "settled by drawing
(2026-09-15)" in the "Open questions" sections — icons, the look of the tab switch, the remaining quota, the hidden
list, the like line in a chat, the fading line, the move confirmation lines, the re-acceptance screen, the offer
creation screen, a table in the feed, appearance samples, text size in the viewer, the look of a hint. These are the
only open screen questions; there are no behaviour questions (gate 2 of the route).

## 7. Working rule

SVG first at true geometry (`design-in-svg-first`): a screen's mockup is an SVG at the screen's size, project fonts
through Vite, numbered questions at the end, agreement — and only then CSS. Judge the mockup as a whole picture:
one baseline per row, no double borders and no wandering padding (`visual-review-standards`).

## 8. Known and not blocking

Open items of `docs/facts/open.tsv` that hold drawing — zero (`check-facts-open`). Items that hold code — two: the
moderation model (a measurement) and the table move window against WCAG 2.2.1. Neither hinders drawing.
