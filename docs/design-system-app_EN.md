# The application's design system

**Decided 2026-08-31, the first decision of stage 1.** Not one of the twenty
screens named a source for its visual decisions, and drawing twenty mock-ups out
of three different sources means reconciling them afterwards at a higher price
than drawing them again.

**Structure comes from the panel, the palette from the storefronts.** What is
expensive here is not the palette but the structure: laws, token roles, the dark
theme, the way things are checked — four hundred lines already written for the
panel (`design-system_EN.md`). A palette moves across in an hour.

This document describes the **application**. The panel has a system of its own
and the storefronts have their landings; where they differ is named below by
name, rather than left to the eye.

## What was measured before deciding

The three sources were described as "partial". A measurement on 2026-08-31 put it
more sharply:

| source | tokens | covers | does not cover |
|---|---|---|---|
| the landings | 13 and 12, 11 shared | colour, fonts | spacing, radii, shadows, controls, the dark theme |
| the July prototype | 14 | colour, fonts, the shape of an app | no system behind it; **three** names in common with a landing |
| the panel's system | 9 roles, laws, 400 lines | laws, roles, the dark theme, controls, layout, checks | built for an admin surface |

**Two facts the route did not have.**

First: **the landings had drifted apart** — one storefront had `--ok` which the
other did not, the other had `--mono` and `--sans` which the first did not, and
the font stacks sat written into eighteen rules. Reconciled on 2026-08-31 to a
shared set of **15 names** and held there by a check
(`scripts/check-landing-tokens.sh`): the values differ by design — an accent is
the brand — while the names must not.

Second: **the claim "the storefronts use sharp corners", made in the panel's
system, is false**. The live landings carry **37 radius declarations with 17
distinct values**; there are no sharp corners there. So the application does not
inherit a radius scale, it **establishes** one — said plainly, so nobody goes
looking for a source that does not exist.

## Tokens

The roles follow the panel's; the names are the storefronts' wherever those exist.

| Token | Role | From |
|---|---|---|
| `--bg` | behind everything | the storefronts |
| `--panel`, `--panel-2` | a card; a surface inside it | the storefronts' names, **own values** — the "Surfaces" section |
| `--fg`, `--muted`, `--muted-2` | text, second plane, third | the storefronts |
| `--border` | a decorative line: a divider, a sheet's frame | the storefronts |
| `--border-control` | a control's border: a field, a chip, a secondary button on bare ground — not below 3:1 to its ground | **established here** |
| `--accent`, `--accent-ink`, `--accent-text` | the brand; ink over it; accented text | the storefronts |
| `--ok`, `--err` | outcome | the storefronts |
| `--sans`, `--mono`, `--disp` | three faces | the storefronts |
| `--r-1`, `--r-2`, `--r-pill`, `--r-round` | the radius scale | **established here** |
| `--s-1` … `--s-12` | the spacing scale | **established here** |
| `--fs-display` … `--fs-mono` | six steps of text | **established here**, the "Typography" section |

**The radius scale is derived from the measurement, not chosen by taste.** The
seventeen values across the two storefronts fall into three heaps: small 7–9
(five uses), the main body 11–20 (seventeen), and pills 30–46 (six). Hence:

- `--r-1: 8px` — small: an icon, a badge, an input;
- `--r-2: 13px` — the main one: a card, a button, a dialog;
- `--r-pill: 999px` — whatever was meant to be a pill;
- `--r-round: 50%` — a circle: an avatar, a dot, a counter.

Four tokens instead of seventeen values. The price is named: some of the
landings' roundings will shift by one to three pixels when they move, and that is
the right trade — a scale of four steps reads as a decision, seventeen values
read as the absence of one.

## How the application differs from the panel

The delta is kept here and only here. Every difference carries its reason.

- **A press fires on hover.** The panel rejected that for itself and wrote down
  that it is right for a storefront (`design-system_EN.md` §8): there a pointer
  crosses the toolbar on its way somewhere, here it does not.
- **The radii are its own** (above). The panel uses 6px for its controls; the
  application has a four-step scale for feed cards and conversation bubbles.
- **The display face is per brand.** One storefront uses it nine times, the other
  not at all and points `--disp` at the same stack as `--sans`. The application
  inherits that as it is: `--disp` always exists, and whether it equals `--sans`
  is the brand's decision.
- **The set of accents is a brand, the choice within it a setting** (decided
  2026-09-15, storefront screen 22). The panel offers eleven accents to choose from;
  for the application the set arrives with the storefront — six on sosed.place, five
  on neighbro.place — and the person chooses within it. [retired] This said "the application has one".

## What is taken from the panel unchanged

- **The four laws** and the ban on decoration for decoration's sake.
- **The dark theme as a first-class one** rather than an inversion: both
  storefronts are dark by default, and the application starts from that side.
- **A shadow as distance**, not as blur; a press shortens the distance.
- **Nothing slides on hover** — but not "nothing slides": the application has
  events the panel does not, and those move. The "Motion" section below.
- **The way things are checked** — contrast, and the page judged whole rather
  than component by component.

## Typography

**Six steps and two weights — the owner's decision of 2026-09-18:** the review
panel (`reviews/PANEL_2026-09-18_mockups-design.md`, the "Typography" lens) counted
16 type sizes across the sheets at two weights, with family C holding six roles on
17/16/15/14 — a one-pixel step of hierarchy, and a heading told from body text by
nothing but weight. Hence "a wireframe". The scale is established here, adjacent
steps differ by 1.25–1.3×, and line height belongs to the step, not to the sheet.

| Step | Size / line height | Weight | Face | Where |
|---|---|---|---|---|
| `--fs-display` | 26 / 34 | 400 | `--disp` = Golos Text | the full-screen phrase (23), an empty state's heading, a confirmation sheet ("Step away", "Enter the PIN"), the transfer code — same size, but `--mono` |
| `--fs-title` | 20 / 28 | 600 | Golos | the screen header, the interlocutor's name, the table's name |
| `--fs-body` | 16 / 24 | 400 | Golos | a phrase, a reply, a document's body, an input |
| `--fs-body-strong` | 16 / 24 | 600 | Golos | button text, "your move" |
| `--fs-meta-strong` | 14 / 20 | 600 | Golos | a tab, a chip, a category label ("offer", "table") in `--accent-text` — the "Feed" cluster panel of 2026-09-18: at 16/600 the label equalled the card's heading |
| `--fs-meta` | 14 / 20 | 400 | Golos, `--muted` | captions, conditions, "2 playing · 3 watching" |
| `--fs-mono` | 13 / 20 | 400 | `--mono` = JetBrains Mono | where tabular width matters: the timer, `9/256`, the score, a ticket number |

The seventh step `--fs-meta-strong` 14/600 was added by the "Feed" cluster panel the same day. The screen header is 20/600, not 18: the "Screen header" row of
`reviews/NIGHT_2026-09-18_mockups-consistency.md` was rewritten the same day. Outside
the scale: board coordinates at 11 mono — a single exception, below 11 the dark theme
at 375 px is unreadable. The scale was applied to the `<style>` of every
`panel/design/screen-*.svg` sheet by one script (70 rules); the sheets were then
rendered and judged whole, no overflow appeared at 375 px, and the key-check icon in
header 08 moved 14 px to sit after a 20 px name.

## Surfaces

**A card by fill, a field by border; the owner's decision of 2026-09-18.** The
storefronts' `--panel #17130f` on `--bg #0d0b0a` gives 1.06:1: a card without a
border vanishes, which is why all three "hands" outlined every container. The
review panel named this the second cause of "a wireframe". The application takes
the storefronts' names but its own values, and separates two kinds of border:

| Token | Dark | Light | Checked |
|---|---|---|---|
| `--bg` | `#0d0b0a` | `#ece4d8` | the storefronts |
| `--panel` | `#262019` | `#fdfaf4` | to `--bg` 1.22 / 1.21; `--fg` 13.2 / 17.4; `--muted` 4.97 / 5.99 |
| `--panel-2` | `#302720` | `#e6dbc9` | to `--panel` 1.10 / 1.31; `--muted` 4.51 / 4.56 — at the limit, it cannot go lower |
| `--border` | `#3a2e20` | `#221a12` | decorative, no threshold |
| `--border-control` | `#80705a` | `#857562` | to `--panel` 3.36 / 4.27, to `--bg` 4.10 / 3.53 (WCAG 1.4.11) |

The rule: a feed card, a reply bubble, the board, a tombstone — `--panel` fill with
no outline; an input, a chip, a secondary button on bare ground — a 1 px
`--border-control` outline; the line under the header and above the navigation —
`--border`. The storefronts raised their own `--border` to 3:1 on the morning of
2026-09-18 (`#725a3f`) and keep one token — their decision for pages where the border
is the control; the application needs two. The figures were recounted by a script
with the WCAG formula on 2026-09-18; on the sheets 291 outlines were removed from
cards and bubbles and 94 control borders moved to `--border-control`.

## The product's signs

**Three signs in form — the lens quorum's decision of 2026-09-18** (the owner gave
the word to work unattended until 13:00; the mock-up `panel/design/signs-mockup.svg`
with variants A/B and four questions, three lenses — visual, UX, accessibility —
voted independently; the record is in `reviews/PANEL_2026-09-18_mockups-design.md`, section 6).

- **Disappearance — a lifespan bar**, 3 px, at the bottom of the card under the
  caption (3 votes of 3): the track `--border-control`, the fill `--accent`, the
  length the share of the lifespan, a step once a minute, no animation. Only on
  one's own phrases, in a conversation above the input, and in viewer 23 under the
  words "disappears soon" (3 of 3): a stranger's phrase in the feed is a voice, not
  a timer, and twenty bars in a row turn the feed into a table of gauges. For the
  screen reader the bar is `aria-hidden`, the lifespan is a word or a number beside
  it (N2); in the "no colour" step the bar moves to `--fg`. Rejected: a 3 px left
  edge — it merges with the quote's rule on 08 and with the border.
- **The table — a game icon** at 14 px `--accent-text` before the "table" label
  (3 of 3); the "tabletop" strip is rejected: `--panel-2` on `--panel` gives 1.10:1
  and would become a third border next to the lifespan bar.
- **The radius — a ring with a backing** `--accent` at α 0.08, a 2 px rim, a 20 px
  handle without a shadow (2 of 3; the visual lens was for a rim without a backing,
  the shadow on the handle was rejected by two): "−"/"+" at 44×44 remain the targets
  and get an `aria-label`, the value is an `output` with `aria-live="polite"`, the
  ring and the backing are `aria-hidden`.

**Empty states, the header and the tab bar — the lens quorum's decision of 2026-09-18, second round**
(the mock-up `panel/design/empty-nav-mockup.svg`, the same three lenses; the votes
split and the third decided): an empty state gets a splash icon at 48 px `--muted`
above the display heading (UX + accessibility against visual; the icon is
`aria-hidden`, the heading and the button carry the meaning); the tab bar keeps the
32×2 `--accent` underline (UX + accessibility: only a shape gives the state without
colour, 1.4.1; a `--panel-2` plate under the icon failed 1.4.11 at 1.34:1; the active
item is `aria-current="page"`); the header loses its 1 px bottom line (visual +
accessibility: `--border` on `--bg` at 1.49:1 is decoration, not a boundary), the
boundary is air, a 56 header on `--bg`. The splash icons: eight subjects, a 2 px
stroke, a 56 grid — a house, a bench, a mug, a domino, a knight, a bicycle, a cat, a
tree; in an empty state the subject follows the place (the feed — the bench,
conversations — the mug, one's own phrases — the house).

## Motion

**Only what happened moves — the owner's decision of 2026-09-18:** the panel's rule
"nothing slides" (`design-system_EN.md`; the reason was a smoothed shift tearing a
control's state in two) narrows, for the application, to controls. Hover, focus, press,
the chosen segment, the tab, the counters — snap, and `transition: none` is written
explicitly. An event moves: a reply or a phrase arrived, someone else's move came in, a
sheet slid out, the table dimmed after a removal. The review panel of 2026-09-18
(`reviews/PANEL_2026-09-18_mockups-design.md`, section 1.3) produced a catalogue of 18
animations with code; here is what of it is the rule.

**Time is a number and a step of tone, with no pulsing.** The conversation's remainder,
the move deadline, the 30 seconds of confirming the seating are shown as a figure; the
figure updates by minutes, seconds only in the last minute; the "urgent" threshold is a
snap of colour to `--err` plus a word for the screen reader. The N2 fade is a 55 % step
set on entering the last quarter, not a gradual slide. There are no remainder bars, no
timer rings and no pulsing labels: motion longer than five seconds would need a pause
(WCAG 2.2.2), and blinking is banned outright (2.3.1). The price is named: the sign
"it disappears" is visible only as a word, a number and a tone — and that is accepted.

**Tokens.** Five durations and four curves; the properties are only `opacity`,
`transform`, `clip-path`.

| Token | Value | Where |
|---|---|---|
| `--dur-0` | 0 ms | control states, tabs, figures |
| `--dur-1` | 120 ms | touch, delivery check mark, a row leaving |
| `--dur-2` | 200 ms | a row, bubble or card appearing, the "undo" toast |
| `--dur-3` | 280 ms | the bottom sheet, collapsing the board, the viewer's card swap |
| `--dur-4` | 600 ms | half-period of the skeleton's breathing and the "reconnecting" dot |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | everything that enters |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | everything that leaves |
| `--ease-io` | `cubic-bezier(0.65, 0, 0.35, 1)` | carrying a piece, a keyboard step of the slider |
| `--ease-heart` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | the like's heart — the only spring |
| `--shift-2` | 8 px | entry offset of rows and bubbles |

Composition rules: an entry is `opacity` and `translateY(--shift-2)` with one duration
and one curve; an exit is `opacity` only and shorter than the entry; a cascade only on
entry and at most three elements at 40 ms; a chain no longer than 300 ms. Errors appear
with a snap and without shaking. Layout properties are never animated: height collapses
after the fade, not with it.

**What never moves:** controls on hover and focus; figures; background, borders,
shadows; text; the header and the bottom navigation; one's own piece on the board (the
finger is already there); a theme change; the skeleton by shimmer — only by breathing
`opacity`.

**`prefers-reduced-motion`:** offsets and `clip-path` go to zero, an appearance is one
frame (16 ms) rather than none: an element that came from nowhere gets missed; cycles —
the skeleton's breathing, the reconnecting dot — stop; the swipe in viewer 23 replaces the
phrase without movement. The number and the step of tone do not depend on this mode,
because they are not motion.

**How to check:** stylelint lets only the three properties through
`transition-property` and `@keyframes`; `document.getAnimations()` is empty at the end
of every scenario; a hard-coded `ms` outside `:root` is a red grep; reduced-motion is
emulated in Playwright with a positive control — the same checks are red first without
emulation. None of this has been run yet: there is no application code.

## How to check

- `xor.ad/scripts/check-landing-tokens.sh` — the storefronts' name sets match
  (broken by injection in three ways: a token removed, renamed, and drifted).
- Every screen's mock-up is an SVG at true geometry, with numbered questions at
  the end, agreed there, and only then CSS.
- `scripts/check-design-sheets.sh` — the sheets against the system, as a ratchet:
  seven counts (type sizes off the scale, strokes other than 1/2, radii off the
  scale, colours that are not tokens, placeholders, text in the raw accent,
  bordered controls under 44) are held in `docs/facts/design-sheets-baseline.tsv`
  and may not grow; the probe `test_check-design-sheets.sh` turns them red with
  eleven injections (2026-09-18).
- `scripts/check-design-text.sh` — the sheets' text in a browser: no line inside a
  375×812 frame leaves its edge or lies on another visible line; what a sheet or a
  card hides is not counted. Established 2026-09-18 after three clipped lines and
  two toasts the text ratchet never saw; the probe `test_check-design-text.sh`
  plants five injections.

## Component vocabulary

Collected 2026-09-16 from the storefront screens 01–24 (research agent; every row checked by the lead against the screens while preparing the drawing brief). Screen 16 "Stickers" is outside the alpha and not in the vocabulary. Fifty components; "none — mockup" means the design system has no rule and the screen's mockup sets it.

| Component | Screens | States the mockup must show | Rule or token |
|---|---|---|---|
| Primary button | 01 02 04 06 08 13 14 19 20 | disabled without consent, until the node answers, with no seats, without a refusal text; focus ring 2px | `--r-2`; shadow as distance; disabled — rule R1 |
| Secondary button | 01 06 08 20 | equal weight against the default | no role yet — mockup |
| Icon button with a name | 01 02 03 08 | a name for the screen reader is mandatory | `--r-1`; the name — accessibility §5 |
| Labelled text field | 02 04 08 13 14 | closed, the "stepped away" label, the typed text survives, the text stays on refusal | `--r-1`; 16px — accessibility |
| Remaining characters counter | 02 04 08 | a hint, the node holds the limit | none — mockup |
| Remaining quota counter | 04 09 11 | look not drawn; a slot under the ceiling | none — mockup |
| PIN field | 02 12 13 | "easy to guess", waiting, "attempts left", locked, skeleton | as a text field |
| Grouped code field | 02 13 | did not match / expired, the move cancelled, intake closed | none — mockup |
| Acceptance checkbox | 02 05 11 15 | unchecked; blocks "next", publishing and the name | none — mockup |
| Tab switch | 04 07 | a count on the first, a dot on the second; the look on 04 undecided | `--r-pill` — not bound |
| Mode segments | 03 04 23 | every phrase has one | none — mockup |
| Bottom navigation, 4 items | 03 07 10 | a dot on "Me"; never a fifth | none — mockup |
| Phrase card | 03 04 05 06 23 25 | fading in the last quarter, "further than you asked", muted own, refused as a block | `--r-2`; fading — rule R2, muting — R6 |
| Table card | 03 09 19 23 25 | invisible with nobody seated or outside the band; the name after the verdict, a like count; a like does not seat (2026-09-17); look undecided | inherits `--r-2` |
| Offer card | 03 17 24 | discount and term mandatory; "not in the feed", "expired", "link off"; a word, not a frame | none; a word, not a colour — accessibility §1 |
| Match card | 06 | "no answer yet", "vanished", "waits for your name", one phrase for an offer | none — mockup |
| Loading skeleton | 02 07 08 09 12 19 | no caption; the button disabled until the answer | rule R3 |
| Empty state | 07 09 14 21 · экран 11 | heading + line + action; seven lines without a heading | none — mockup |
| Conversation tombstone | 07 08 | until touched; marked by your own attempt | rule R4 |
| "Documents changed" strip | 11 15 | the list and one checkbox; the feed stays readable; not set offline | none — mockup |
| Connection status strip | 08 11 19 21 | four socket outcomes; "no network" versus "we failed"; "the app is out of date" | rule R5; `--ok`, `--err` |
| "You are at a table — return" line | 03 07 19 23 | exactly one; stays when the table left the feed | none — mockup |
| Undo line | 06 07 23 | a few seconds; the refusal is recorded at once | none — mockup |
| "…" action sheet | 05 08 17 19 23 | quiet to loud; none on moves; sets differ per screen | none — mockup |
| Confirmation with what disappears | 05 08 12 13 20 | the price in numbers before the tap | none — mockup |
| Countdown / remaining time | 06 08 09 13 19 20 23 | a word on others' phrases; no counter for two | accessibility §86 |
| Game board by class | 18 19 | piece highlight, keyboard moves, "not allowed", "overdue — pass", "three passes", "no table" | cell ≥ 24 px — accessibility |
| Viewing radius handle | 03 | no numbers; density on release; by tap too | none — mockup |
| Phrase area handle, stepped | 04 10 | five steps | none — mockup |
| Age slider | 03 | by the year inside the band, not beyond the band, the edge is "no limit" | none — mockup |
| Silence span control | 08 10 | any time; the other's is not visible | none — mockup |
| List with undo / lifting | 10 12 | hidden, blocks, receipts; short-lived | none — mockup |
| Support requests list | 10 14 | "no requests"; none for a frozen session | none — mockup |
| Complaint / Art. 16 form | 05 11 14 17 | the first line dissuades; grounds mandatory; the checkbox unchecked | none — mockup |
| First-encounter hint | 10 23 24 | one at a time, once; "got it" ≥ 44 px | none — mockup |
| Accent and contrast samples | 22 11 | labelled by a word; at once; "applied, will save" | `--accent*`; the storefront set |
| Home mark in the header | 10 22 | cycles the accent; must not diverge from 22 | `--accent` |
| Like icon | 05 17 19 23 25 | muted but visible; a like takes the card to "My likes" and is taken back there; on a private author's offer it makes a match at once; on a table it is a bookmark (2026-09-17) | 44 px — accessibility |
| Like count | 09 | goes down; who — never | none — mockup |
| System line of a conversation | 08 18 19 | not encrypted; no menu | none — mockup |
| Key check mark | 08 | a tap opens the code; unchanged on a device change | ≥ 3:1 — accessibility |
| "I offer a discount" line | 04 17 | unfolds into three fields; one offer at a time | none — mockup |
| "Show more" | 03 23 | N as a step; the end leads to the feed; no auto-refresh | none — mockup |
| Language filter in the header | 03 10 | one tap; an offer is not hidden | none — mockup |
| Count and dot on a tab | 07 10 14 | the count fades with answers, the dot with a visit | `--r-round`, `--r-1` |
| Warning text | 02 06 12 | wherever a code is; not a second consent | none — mockup |
| Modal question, two buttons | 08 | no default; a line about the risk | `--r-2` |
| Lock screen | 12 | PIN only; "your move at the table"; "forgot the PIN?" | none — mockup |
| Console | 21 10 | empty without a heading; "we did not answer"; ≤ 200 lines | `--mono` |
| Step-away choice screen | 20 | three spans and the price; does not leave offline | none — mockup |

### Rules the design system did not have

Six patterns the screens demand without a rule. Their look is settled by the mockup; here is what the mockup must show.

- **R1. Disabled state** (02, 05, 11, 19): the control stays visible, the reason sits next to it in words, not only in colour; it takes focus.
- **R2. Fading in the last quarter of the span** (07, 08, 23): the span is visible as a word or a number; fading is a second channel, never the only one (accessibility §86). Surfaces and graphics fade (0.55) and `--fg` text fades (0.65, staying ≥ 4.5:1); `--muted` text does not fade at all — at 0.85 it already gives 4.0:1, at 0.55 2.4:1 (the cluster panels of 2026-09-18, recounted with the WCAG formula).
- **R3. Skeleton** (11:30): no caption and no text; the card's geometry; the button that started the action is disabled until the answer.
- **R4. Conversation tombstone** (08, 11:47): stays until touched; neither an error nor an empty state — a third kind.
- **R5. Status strip in the header** (08:79): one slot, four socket outcomes, "no network" and "we failed" in different words, "the app is out of date" on every screen.
- **R6. Muted own unchecked phrase** (03:10): your own phrase before the verdict differs from others' and from a refused one; not by colour alone.
- **R7. The send button is filled only with input** (08, 18, 19; the lens quorum of 2026-09-18, 3 of 3): with an empty field — a `--border-control` outline and a `--muted` arrow, not `disabled` (the screen reader must not hear "unavailable" on every empty field; a press sends nothing and returns focus to the field); the outline → fill transition snaps on the first character. So a frame with another primary button keeps one filled accent.

### Screen disagreements the mockup settles

Ten places where one control is described differently; the direction is named, the mockup fixes it.

1. The smooth viewing-radius handle (03) and the stepped area handle (04) are two controls — give them two names.
2. The "…" sheet with five sets (05, 08, 17, 19, 23) is one component with per-screen sets; "quiet to loud" is shared.
3. "A tap on the logo button" (notes) and "the like icon" (05) are the same thing; the name is "like icon".
4. The tab switch is settled on 07 and not on 04 — one component, 04 takes 07's look.
5. "Declined · undo" (06, 07) and "hidden · undo" (23) are one "undo line" pattern.
6. Three controls called "language" (01, 02, 10) are three different ones: interface switch, registration list, feed languages.
7. "Next" as an icon was removed from 01 and kept on 02 — a word on 02 too.
8. The line-up confirmation counter exists at a table (19) and not for two — both right by the canon.
9. "Delete / withdraw / stand up / sit" on your own entries (09, 23) — verbs by entity, one component.
10. The "support answered" dot on "Me" (10, 14) stays; the support icon does not come back.

### What the design system has that no screen needs

`--r-round` as an avatar (there are no avatars), `--r-pill` (no screen asks for a pill), `--ok` as a separate outcome (only ✓ and an error are needed), "press on hover" (interactions are by touch and keyboard). The tokens stay, but the mockup is not obliged to use them. The motion tokens `--dur-*`, `--ease-*`, `--shift-*` are the "Motion" section; they are introduced here.

## Nothing open

The application design system has no open items: below is the recorded decision
on the spacing scale and two closed questions kept as history.

**A spacing scale exists as of 2026-08-31 — and the storefronts do not inherit it.**
With the radii the measurement gave three clean heaps; with spacing it gave the
opposite answer. The corpus is the same two files `scripts/check-landing-tokens.sh`
reads — both storefronts' `landing/index.html`: **201 declarations** of
`margin`/`padding`/`gap` holding **62 distinct values**. There is no scale in there.
Of 201 pixel values, 64 (32%) land exactly on the seven steps of a four-based scale
and half are multiples of four at all; converting would move 137 declarations. So
the application takes the ordinary four-based one — `--s-1: 4px`, `--s-2: 8px`,
`--s-3: 12px`, `--s-4: 16px`, `--s-6: 24px`, `--s-8: 32px`, `--s-12: 48px` — and
**the storefronts are not converted**: they are live pages that work, and nobody
asked for 137 declarations in them to be moved. The scale fitting the landings badly
is not an argument against the scale, because there is nothing to convert.
(Recounted 2026-08-31: the previous wording said "30 distinct values across 164
uses" and never named what it measured; it could not be reproduced under any of
four corpora.)
- ~~A light theme for the application~~ — **there is one: light, dark and as in the
  system, with three contrast steps and an accent from the storefront's set**
  (storefront screen 22, 2026-09-15). The theme sat on screen 10 from 2026-08-26, and this line did not see it.
- ~~What to do with the July prototype~~ — **it stays a reference for layout by eye,
  and no tokens are taken from it** (decided 2026-09-15: this followed from this very line;
  the light mode of its §2 is replaced by storefront screen 22).
