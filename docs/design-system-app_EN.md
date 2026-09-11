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
- **The accent is a brand, not a setting.** The panel offers eleven accents to
  choose from; the application has one and it arrives with the storefront.

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

## Open

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
- **A light theme for the application.** Both storefronts are dark; the panel has
  a light theme, the application has not decided.
- **What to do with the July prototype.** It is closest of the three to the shape
  of an app and furthest in vocabulary; what it gives is layout by eye, not tokens.
