# Design system

The 2026-07-07 draft set the direction. This revision — 2026-07-31 — records what
has since become code: the panel is built, the values are measured, several of the
draft's open questions are closed, and two requirements have been added — a dark
theme as a first-class citizen, and a palette that can be swapped.

Read alongside:

- `panel/src/App.css` — the implementation. Every rule here exists there.
- `panel/ui-kit.html` — the live kit, painted by that same stylesheet.
- `panel/public/*.svg` — the drawings the decisions were made on.
- `docs/brutalism_EN.md` — the study of the open libraries much of this grew from.

## Sources

- [The Modern Color Palette: UI/UX Color Trends That Define 2026](https://recursion.software/blog/ui-color-trends-2026)
- [Top Web Design Trends for 2026 — Figma](https://www.figma.com/resource-library/web-design-trends/)
- [Neo-Brutalism design trends in 2026](https://pixso.net/articles/neo-brutalism-design/)
- [Neobrutalism — NN/G](https://www.nngroup.com/articles/neobrutalism/)
- [UX/UI design trends for 2026 — calm interfaces](https://elements.envato.com/learn/ux-ui-design-trends)
- [ekmas/neobrutalism-components](https://github.com/ekmas/neobrutalism-components) — 46 components, read from source

## Overall direction

"Black and white, high contrast, no decoration for decoration's sake" stands. The
draft's sharpenings held up in practice, with one exception:

- Hard borders — **2px**, everywhere: cards, controls, ticks, badges.
- **6px radius, not a sharp corner.** The draft proposed sharp corners; the
  reference libraries keep 5px and we keep 6. Brutalism here is weight and
  flatness, not a right angle — and on a tick, 6px rounds the square into a circle,
  which is why a tick gets half the radius. There is one more, `--radius-small`
  at 3px, for things smaller than a control — a badge and the head of a histogram
  bar, where 6px eats the whole corner. Those two were the file's five hand-written
  radii; every corner now follows a token, which §5 declares mandatory.
- Hard, unblurred shadows — **4px 4px 0 0**.
- Dark theme first — yes, with the caveat in §4: it is not the same drawing with
  inverted values.
- Large display typography — one display face (Unbounded) for headings, Inter for
  everything else. Base weight **500**, not 400: hairline text under 2px frames
  reads as two products sharing a page.

---

## 1. The four laws

Everything below follows from these. If a new component contradicts one, the
component is wrong.

**1 — A shadow means you press this. Flat with a fill means you type here.**
A field is told apart by its fill and its frame, never by relief. Depth is carried
by pressable things **and by the surfaces that hold them**: a card stands off the
page for the same reason a button does, and its `--shadow-card` is deliberately
equal to `--depth-rest`. The law says who may carry depth, not that two of them
may not stand at the same height.

**2 — Nothing moves but a press, and nothing but a press changes the depth.**
The shadow is the control's height above the page, so hovering may not touch it:
a button does not change height because a pointer is over it. Under the pointer
the fill steps toward the ink and everything else is left alone. Only `:active`
travels, exactly its own 4px, giving the shadow up and landing where the shadow
was. Hover used to grow the gap 4 → 6, which announced a rise one pixel before
the press announced a fall, and left a row of buttons breathing as a pointer
crossed it.

**3 — What persists fills, and keeps its place.** `aria-pressed="true"` inverts
and does not move. A chosen thing that stepped 4px out of its row would break the
row it belongs to, and it is read later, at rest, with nothing beside it to
measure against.

**4 — Focus is the frame, one line.** The frame turns accent. No ring, no outline,
nothing drawn around it. Measured before the ring was dropped: the resting frame
against the accent is 3.07:1 in light and 3.35:1 in dark, over the 3:1 WCAG 2.2
asks of a state change.

The exceptions are where there is nothing to turn, or where turning it cannot be
seen:

- **Nothing to turn** — links, `summary`: no frame, so the outline stays.
- **The change is invisible** — a control that coloured its own frame first:
  `.button-danger` (`--danger-line`), a chosen range and a ticked scope (both
  accent). Red to blue at the same lightness measures **1.08:1**. For those the
  state is drawn as a **ring outside**, where it has the page to be seen against.
  Still one line: the frame carries the intent, the ring carries the state.

The focus rule sits **after** the control rules and is written at their weight. It
used to sit above them, where `input:focus-visible` (0,1,1) tied with the base
field rule (0,1,1) and lost on file order: the select beside it lit up and the
text field did not.

## 2. Tokens

### Colour, by role

| Token | Role |
|---|---|
| `--page` | behind everything; the ink of an inverted control |
| `--surface` | cards, and anything standing on the page |
| `--surface-sunken` | the inside of a field; a table head |
| `--ink`, `--ink-muted` | text, and text that is secondary |
| `--line`, `--line-strong` | a hairline rule; a control's frame |
| `--accent`, `--accent-ink` | the chosen one of a set; the label on top of it |
| `--warn-*`, `--danger-*` | outcome, in a `-line` / `-ink` pair |
| `--ok-ink` | ink only: there is no ok badge, so the pair's other half was never needed |
| `--shadow-ink` | every offset shadow — a role of its own, see §4 |
| `--shadow-card` | a card's shadow; deliberately equal to `--depth-rest`, see §1 |

A component names a role and never a colour. That is what makes the dark theme a
second set of values rather than a second set of rules.

### Everything else

```
--space-1…7        4 8 12 16 24 32 48
--radius           6px          (half of it for a tick)
--border-w         2px          everywhere
--control-h        36px         --control-h-small 28px, for a number inside a table cell
--depth-rest       4px 4px 0    --depth-small 2px 2px 0. There is no hover depth.
--press            4px          exactly --depth-rest's offset; --press-small 2px for a tick
--surface-hover    fill only    the whole of what hover changes; --accent-hover for a filled button
--text             15px         --text-micro 12px. The page title is the one exception.
```

Heights are **stated**, never inherited from the font. Chromium refuses
`line-height` on a `<select>`, so a select left to itself comes out 2px taller
than the input beside it and a toolbar sits on three lines.

**Nothing eases.** There is no `transition` in the stylesheet: easing a 4px jump
was the one soft thing in an idiom of hard edges, and it split every state in half
— the movement gliding while fill and frame snapped.

## 3. Colour: two axes, and an accent is two tokens

The mechanism does not need inventing: it **already runs on the storefronts** and
is proven there.

**Two independent axes.** Light/dark governs surfaces and text. The accent governs
exactly two things: `--accent` and `--accent-ink` — the colour, and the ink
printed **on top of** it. Changing the accent touches nothing else.

**The accent is picked at random on every load**, never repeating the previous
one, and a person can pin theirs — which switches the randomness off.

### Where things stand

| | theme | accent | storage keys |
|---|---|---|---|
| sosed | `data-theme="light\|dark"` | `data-accent` — 6: terra `#bd4b2a` · amber `#d68a1f` · teal `#1fa99a` · azure `#336eb2` · violet `#8550c5` · crimson `#cc2f27` | `ss-theme`, `ss-accent-pick`, `ss-accent-prev` |
| neighbro | `data-mode="light"`, absent = dark | `data-theme` — **four values**: crimson · teal `#1fb39a` · azure · violet; gold `#c6a24e` is the **absence of the attribute**, exactly as dark is | `nb-mode`, `nb-accent`, `nb-accent-prev`, `nb-accent-active` |
| panel | `data-theme="light\|dark"` | none — one blue, `#3355dd` / `#7d9bff` | `panel_theme` |

Every accent carries **its own** ink: `#d68a1f` prints in dark `#241206`,
`#336eb2` in light `#eaf2ff`. That pairing is what holds the contrast when the hue
changes — a pair, not a single colour.

### A divergence worth resolving

The idea is the same on both storefronts but the names are not — and `data-theme`
means the **opposite** thing on each: light/dark on sosed, the accent on neighbro.
The panel has a third set of names. The same switch has to be written three times,
and anyone moving between the repositories will read the attribute wrong.

sosed has the right form: `data-theme` for light/dark, which is the web
convention, and `data-accent` for the accent. Bring all three to it.

### The palette direction stands

- **sosed** — red, a reference to constructivism (Rodchenko: black/white/red). In
  practice that is `terra` and `crimson` from the set above.
- **neighbro** — warm gold/bronze: not the obvious "EU blue" but the common
  denominator between the UK/France/Germany and Cyprus/Greece — copper, the gold
  of the tricolour, the bronze of classical antiquity. In practice the default
  accent `#c6a24e`.
- **The panel** — blue. It is not a storefront and carries nobody's brand.

## 4. The dark theme is first class

The panel ships **light and dark**, and neither is a filter over the other. The
theme follows the system until someone chooses; the choice is written to
`localStorage.panel_theme` and stamped on `<html data-theme>`, which must outrank
the media query — hence the explicit selectors rather than a value inside one.
`index.html` reads it before the first paint so a dark operator never sees a flash
of light.

**Dark is not the same drawing with inverted values.** Two rules exist only there,
and both came from measurement:

- **The shadow goes lighter than the page.** `--shadow-ink` is a role of its own,
  not the frame's colour borrowed. Ours used to borrow `--line-strong`, which in
  dark is `#4a4a52`: every shadow fell at 2.06:1 on the surface it was cast on.
  The reference libraries keep the shadow pure black in both themes; on our
  near-black page that measures **1.08:1 — no shadow at all.** Dark takes
  `#9a9aa6`, 6.99:1.
The recess inside a field was a third such rule and **no longer exists**:
`--sunk` and `--sunk-ink` outlived the rule that made them and have been removed —
twelve declarations with not one consumer. If a hole is ever wanted again it is
`inset` in light and `inset -` in dark, for the same reason: there is nothing
darker than a near-black page to reach.

## 5. Recolouring — the requirement, and how it is met

**Requirement.** Colours change without touching a single rule; only token values
change. The storefronts already work this way — their accent changes on every
load.

**What may change:** the values in the colour blocks — the accent and its ink, the
surfaces, the inks, the outcome pairs, the shadow.

**What may not:** the geometry (`--border-w`, `--radius`, `--control-h`, the depth
scale, `--press`) and the rules that use them. A recolour that also moves things is
a redesign.

**The gate is contrast.** A palette is not adopted until the checker passes **in
every theme and on every accent**. The storefronts' trick is useful for exactly
half of it: their `check-contrast.mjs` **discovers blocks** — every one declaring
`--accent` and `--accent-ink`, every one declaring `--bg` and `--fg` — but the list
of **pairs** is hardcoded there just as it is here. A seventh accent checks itself;
a new "this ink on that surface" pair does not.

Our `panel/check-contrast.mjs` does not discover blocks either: it knows one
accent. If the panel gains a second palette, it has to be rewritten to discover.

**It used to check two of the four blocks**, iterating `[data-theme="light"]` and
`[data-theme="dark"]` while `:root` and the media query — exactly what a person
sees **before** touching the toggle — went unchecked. Widening it to all four
found the drift this section warns about in its least interesting form: the two
unchecked blocks were byte-identical to the two checked ones. It now reads the
single block and resolves each `light-dark()` pair twice, so the two themes
cannot disagree about which tokens exist.

**The panel's obstacle, since removed.** Every colour token used to be declared
**four times**: in `:root`, in the `prefers-color-scheme: dark` query, and in
`[data-theme="light"]` and `[data-theme="dark"]`. Two of the four were exact
copies of the other two. Changing one colour was four synchronised edits, and the
failure was silent — a theme that quietly kept the old value.

The storefronts do not have this illness precisely because their accent lives on
its own axis: two accent declarations per palette, not eight.

**Two steps to fix it. The second one is done.**

1. **Move the accent onto its own axis**, as the storefronts do:
   `[data-accent="…"] { --accent; --accent-ink }`. Adding a palette becomes two
   lines instead of edits in four blocks. **Not done.**
2. **Collapse the themes to one declaration** with `light-dark()` — **done**:

```css
:root {
  color-scheme: light dark;
  --page: light-dark(#f2f2f0, #0d0d0c);
  /* …one line per token, both themes side by side… */
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }
```

Four blocks became one: seventeen colours written once each, and the theme chosen
by stamping a scheme on the root. Verified in the browser across all six
combinations of choice and system setting — the three light ones resolve to one
set of values, the three dark ones to another.

Stamping the scheme rather than overriding values also fixes what the old blocks
could not: a scrollbar, a select's dropdown and a date picker are drawn by the
browser from `color-scheme`, so choosing dark on a light system used to leave
those parts light.

The price is stated rather than assumed: `light-dark()` needs Chrome 123, Edge
123, Firefox 120 or Safari 17.5. There is no fallback — a custom property accepts
an unknown function at parse time and fails at use time, which drains the colour
from the whole page — so the floor is written into the panel's `browserslist`.

## 6. Controls

### The state matrix

| | rest | hover | press | focus | held | disabled |
|---|---|---|---|---|---|---|
| geometry | shadow 4 | unchanged | +4, no shadow | unchanged | no move, no shadow | no move, no shadow |
| colour | by intent | fill → `--surface-hover` (`--accent-hover` when filled) | unchanged | frame → accent | inverts | frame `--ink-muted`, label `--ink-muted` |

`:active` carries `:not([aria-pressed="true"])`, or it outranks the held rule —
0,2,1 against 0,1,1 — and shoves a chosen segment out of its row while the mouse
is down.

Disabled is **named, not faded**. `opacity` dims the frame, the fill and the label
together, and on an inverted control produces a grey block. It applies the same way
to fields and ticks, or two disabled controls in one row look disabled two
different ways.

### Intent

Two: `.button-primary` (filled accent) and `.button-danger` (outlined). Intent
chooses the fill and the ink and **never the geometry**, so a row of mixed buttons
still sits on one line and presses the same way.

Danger comes in two forms and they are not interchangeable: **outlined** for danger
among other actions — in a row, a table, a menu, where it opens a confirmation and
says so with an ellipsis — and **filled** for the confirmation itself, only inside
a dialog, once, as the thing that does it. Filled red is a scarce resource; spent
everywhere it means nothing where it matters.

### Fields

Flat, filled, framed. Focus swaps the fill to `--surface` and the frame to accent —
being in a field is the only loud state it has.

**Every form field carries a real `<label>`.** A placeholder is an example of a
value; it leaves the moment anyone types, and a field named only by its placeholder
has no accessible name at all. Five of the panel's forms were built that way and
have been corrected.

The exception is the log toolbar: four of its controls (two dates, the facet and
the search) are named by `aria-label`. They have an accessible name but no visible
label. A toolbar is not a form and labels there would be noise — but "every field"
does not cover it.

### Forms

One column: label above, control under it, hint below, error replacing the hint,
the action last and alone. Short fields pair up in a row, each still carrying its
label. On a narrow screen the action takes the full width.

**Controls are never welded.** `.auth-form` fused two fields and a button into a
single box; the weld cost four rules that existed only to hold it together, its
parts lost their own affordances, the seams were ambiguous to hit, and it is where
"boxes inside boxes" came from. A group is a heading and a distance.

## 7. Layout

- One content column, `--content-max` 1280.
- Toolbars: gap 12. At 8 the shadow of one control lands against the frame of the
  next and the row reads as a wall. Two places still hold 8 and should be brought
  to 12: `.log-ranges` inside the toolbar, and `.log-controls` itself below 751px.
- The table has no sticky header. One was declared and never worked: the card sets
  horizontal overflow, the browser turns on the vertical axis with it, and `sticky`
  then resolves against a box that never scrolls vertically. Bringing it back needs
  the table to have a scrollport of its own with a height — a decision about how
  tall a log page should be.
- Below 751px a table row becomes a card of label/value pairs, built from the
  `data-label` each cell already carries — layout only, nothing to keep in sync.
- The page body never scrolls sideways. A wide table scrolls inside its card.

## 8. What we took from the reference, and what we left

The study is `docs/brutalism_EN.md`; the drawing is
`panel/public/reference-behaviour.svg`.

**Taken:** the hard unblurred shadow as a **distance** that a press spends; 2px
frames everywhere; stated control heights; `inline-flex` centring and
`white-space: nowrap` on buttons; base weight 500.

**Left, with reasons:** their press fires on **hover** — right for a landing page,
wrong for a panel where a pointer crosses a toolbar on its way elsewhere; their
focus is a black ring over a black frame — one event drawn twice; `opacity` for
disabled; `transition-all`; and the black shadow in dark, which does not work on
our page.

**Worth taking, not yet taken:** their `reverse` variant — a control that lies flat
and pops out when addressed, which we have nothing for — and `noShadow` as a named
variant rather than an exception per place.

## 9. How to verify

```bash
node panel/check-contrast.mjs          # every ink on its surface, both themes, 4.5:1 — in CI
bash scripts/screenshot-panel-all.sh   # 10 pages × 2 themes × desktop/390, no sideways scroll
bash scripts/run-panel-tests.sh        # the E2E suite
bash scripts/run-panel-unit-tests.sh   # the permission map, and the relay's list read from disk
```

And open `http://localhost:62173/ui-kit.html`. It imports `src/App.css` rather than
copying it, so anything broken there is broken in the product.

## 10. Open

Closed from the draft: `border-width` (2px), `border-radius` (6px) and
`shadow-offset` (4/4) are decided; the display face is chosen (Unbounded); the dark
theme is built. Closed since: the tick is stated in pixels (18) and no longer
travels on hover — law 2 reached the checkbox and the radio; the two toolbar gaps
are at 12. The histogram has a scale: its top rule is the peak and says so, and
its floor took the colour of the axis labels (6.9:1 dark, against 1.19:1 before).
In the audit log the badge is spent on `denied` alone — the norm is printed as a
word rather than as fifty-six frames down a column.

Remaining:

- The storefront accents' exact hexes are not finalised — they need picking by eye.
- No variable font as such: Unbounded and Inter are wired as weight files.
- Whether the direction applies identically to both storefronts is undecided.
- The second axis, `data-accent` (§5), is proposed, not implemented.
  `light-dark()` is done.
- Three classes render with no rules behind them: `row-action`, `state-loading` and
  `panel-invite-form` (the last held by the tests). Either style them or drop them.
- 32 of the 46 components in `panel/public/kit-full.svg` are drawn only.
