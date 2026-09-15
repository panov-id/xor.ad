# App UI — audit + new-concept checklist

Status: notes/checklist. Code is a separate step. This is about the app itself (not the landing); the aesthetic carries over from the neighbro landing (dark/gold) plus we add brutalism and concrete.

## Audit of current (neighbro landing)

What works and carries into the app:
- Dark base + gold, fonts Unbounded (display) / Golos Text (body) / JetBrains Mono (labels).
- Large, bold typography, mono labels, clear hierarchy.
- The logo mark (house + chat tail) — strong, works as an icon button.

What to change:
- **Feed preview** — too tidy a "chat list", dull and doesn't convey the liveliness/ephemerality. Rework into a "scattered" feed (below).
- Not enough "character": elegant now, not brutal. Add **concrete and brutalism** — heavy borders, raw concrete-gray surfaces alongside the gold, exposed grid, blocky offsets.

## Overall aesthetic: brutalism + concrete

- [ ] Add a concrete palette next to dark/gold: concrete grays (`#6b6b66`/`#3a3a37`/`#1a1a18`), maybe a subtle grain texture (inline SVG noise) on surfaces.
- [ ] Hard thick borders (3–5px), sharp corners, hard un-blurred drop shadows.
- [ ] Exposed structure: visible grid/dividers, mono labels as "technical captions".
- [ ] Gold as a spot accent (buttons/logo/active), not a fill.

## Wide screen: split feed + chats

- [ ] Two-column layout: **feed on the left** (scrollable), **chats on the right**.
- [ ] On the right — switch **tabs** (e.g. "City feed" / "Chats"), made convenient and on-trend (large, tactile, clear active state; can be brutalist — blocky tabs with a hard border).
- [ ] Both columns scroll independently.
- [ ] A width threshold below which the split collapses into a single-column (mobile) layout.

## Feed — "scattered" messages

- [ ] Messages are **scattered** across the area (not a neat list): varied positions/sizes, collage/masonry, slight tilt/offset — a "living board", not a table.
- [ ] Each message has **its own interaction mechanic**; the primary action is the **logo button** (the brand mark = the like/react button on a message). Tapping the logo = like/react (→ possible match).
- [ ] Scroll to browse the feed.
- [ ] Tap a message → it **opens fullscreen**; move between messages by **swiping left/right** (a finger "whoosh").
- [ ] Fullscreen mode: large text, meta (distance/timer/how many of us), action via the logo button.

## Vertical screen (mobile)

- [ ] **Bottom navigation** — like everywhere: 3–5 buttons (e.g. Feed / Chats / Add / Profile/Settings). Brutalist style: blocky, with a hard top border.
- [ ] The feed/chats split isn't available — switch via the bottom tabs.
- [ ] "Add message" button — prominent (center of the bottom nav or a FAB).

## Open questions

- The exact set of bottom-nav buttons.
- What exactly the per-message "mechanic" is beyond a like (reactions? a timer visual? swipe actions?).
- How strong the message "scatter" should be while staying readable and accessible (a11y, no horizontal overflow).
- The right-side tabs: only "Chats" or also sub-sections (chat requests, active, match history).
- Concrete texture: inline SVG noise or a CSS pattern (no external assets, so it works under PWA/CSP).

## What of this has been decided (2026-08-27)

These notes were written on 2026-07-06, before the twenty storefront screens
existed. The five open questions above are closed — not here but there, and the
answers are worth keeping next to this file:

- **The bottom-nav set** — four: `Feed` / `Conversations` / `Say` / `Me` (§9 of
  `chat_EN.md`). A fifth does not fit a narrow screen, so the "Offers" and
  "Conversations" tabs live inside the section (screen 7).
- **The per-message "mechanic"** — a like by tapping the logo button, plus a "…"
  menu with three actions: hide, block, report (screen 5). Swipe actions were
  considered and rejected: they fight the scroll.
- **How strong the "scatter" is** — columns are set by width
  (`column-width: 330px`), cards never shrink below ~330px, and horizontal
  overflow is zero in every state (§4 and §10 of `app-prototype-spec_EN.md`).
- **The right-side tabs** — "Offers" and "Conversations", a count on the first
  only (screen 7). Match history is not among them and will not be: it would
  outlive the thing that is supposed to disappear.
- **The concrete texture** — inline SVG grain via a data-URI, no external assets
  (§1 of `app-prototype-spec_EN.md`).

## Sixteen wishes — where each went (2026-09-15)

| # | Wish | Outcome |
|---|---|---|
| 1 | a concrete palette next to dark and gold, grain | grain accepted (above); the prototype's grey tokens — refused: neutrals come from the storefronts (`design-system-app_EN.md`, "Open", 2026-09-15) |
| 2 | 3–5px borders, sharp corners, unblurred shadows | unblurred shadows accepted; the borders and radii are not: a border as in the panel, radii from the landings' measurement (`design-system-app_EN.md`, "Tokens") |
| 3 | exposed structure, mono captions | accepted: `--mono` (`design-system-app_EN.md`) |
| 4 | gold as a spot accent, not a fill | accepted: the accent marks the active and the main action; gold is neighbro.place's default (screen 22) |
| 5 | two columns: feed and chats | changed: three columns from 900px (screen 3, "Wide screen", 2026-09-15) |
| 6 | tabs on the right | accepted: "Offers" and "Conversations" (above, screen 7) |
| 7 | columns scroll independently | accepted (screen 3, "Wide screen") |
| 8 | a width threshold below which there is one column | accepted: 900px |
| 9 | a "scattered" feed, tilt and offset | width-based columns accepted (above); card tilt is settled by the drawing and does not change reading order (`accessibility-and-i18n_EN.md`, rule 2) |
| 10 | a like via the logo button | accepted (screen 5) |
| 11 | scroll to browse | accepted |
| 12 | a tap opens full screen, swipe between messages | accepted with a change: screen 23 — swipe right like, left hide, touch screens only (2026-09-15) |
| 13 | full screen: large text, distance, timer, "how many of us" | text, mode and remaining time — yes (screen 23); no distance and no "how many of us": a number by place is a measuring instrument (§4 of the mechanics) |
| 14 | a bottom nav of 3–5 buttons | accepted: four (above) |
| 15 | no split on mobile | accepted: below 900px one column |
| 16 | a prominent "add" button | accepted: "Say" in the middle of the nav, in the feed header on a wide screen |

The file itself stays as it is. It records what was wanted in July, and shows
which of it survived to the screens and which quietly fell away.
