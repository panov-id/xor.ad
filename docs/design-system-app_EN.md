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
| `--panel`, `--panel-2` | a card; a surface inside it | the storefronts |
| `--fg`, `--muted`, `--muted-2` | text, second plane, third | the storefronts |
| `--border` | a line | the storefronts |
| `--accent`, `--accent-ink`, `--accent-text` | the brand; ink over it; accented text | the storefronts |
| `--ok`, `--err` | outcome | the storefronts |
| `--sans`, `--mono`, `--disp` | three faces | the storefronts |
| `--r-1`, `--r-2`, `--r-pill`, `--r-round` | the radius scale | **established here** |
| `--s-1` … `--s-12` | the spacing scale | **established here** |

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
- **Nothing slides**: not one `transition` by default.
- **The way things are checked** — contrast, and the page judged whole rather
  than component by component.

## How to check

- `xor.ad/scripts/check-landing-tokens.sh` — the storefronts' name sets match
  (broken by injection in three ways: a token removed, renamed, and drifted).
- Every screen's mock-up is an SVG at true geometry, with numbered questions at
  the end, agreed there, and only then CSS.

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
| Phrase card | 03 04 05 06 23 | fading in the last quarter, "further than you asked", muted own, refused as a block | `--r-2`; fading — rule R2, muting — R6 |
| Table card | 03 09 19 | invisible with nobody seated or outside the band; look undecided | inherits `--r-2` |
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
| Like icon | 05 17 23 | muted but visible; taken back by a second tap; not for an offer | 44 px — accessibility |
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
- **R2. Fading in the last quarter of the span** (07, 08, 23): the span is visible as a word or a number; fading is a second channel, never the only one (accessibility §86).
- **R3. Skeleton** (11:30): no caption and no text; the card's geometry; the button that started the action is disabled until the answer.
- **R4. Conversation tombstone** (08, 11:47): stays until touched; neither an error nor an empty state — a third kind.
- **R5. Status strip in the header** (08:79): one slot, four socket outcomes, "no network" and "we failed" in different words, "the app is out of date" on every screen.
- **R6. Muted own unchecked phrase** (03:10): your own phrase before the verdict differs from others' and from a refused one; not by colour alone.

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

`--r-round` as an avatar (there are no avatars), `--r-pill` (no screen asks for a pill), `--panel-2` (no nested surface), `--disp` (no display font named), `--ok` as a separate outcome (only ✓ and an error are needed), "press on hover" (interactions are by touch and keyboard). The tokens stay, but the mockup is not obliged to use them.

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
