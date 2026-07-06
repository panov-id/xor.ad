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
