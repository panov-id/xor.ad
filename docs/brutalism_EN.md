# Brutalist interfaces: how the mechanism actually works

Written 2026-07-30, from the source of the open libraries rather than from their
landing pages — the documentation sites render their examples with JavaScript and
say almost nothing about the values, so everything below was read out of the
repositories.

Read with `panel/src/App.css`, which is where these rules live in this project,
and `panel/ui-kit.html`, which shows them running.

## 1. Where this was read from

| Source | What was taken |
|---|---|
| [ekmas/neobrutalism-components](https://github.com/ekmas/neobrutalism-components) (MIT) — `src/styling/globals.css`, `src/components/ui/{button,input,select,checkbox}.tsx` | the tokens and the whole interaction mechanism |
| [neobrutalism.dev](https://www.neobrutalism.dev/) | the gallery this is a fork of shadcn's structure for |
| [RetroUI](https://retroui.dev/) | a second implementation of the same idiom, used to check that the mechanism is a convention and not one author's habit |
| [GOV.UK Design System](https://design-system.service.gov.uk/components/button/) | not brutalist at all — taken for the shape of a component page: example, code, when to use, when not to |

## 2. The tokens, verbatim

From `src/styling/globals.css`:

```css
--border-radius: 5px;
--box-shadow-x: 4px;
--box-shadow-y: 4px;
--reverse-box-shadow-x: -4px;
--reverse-box-shadow-y: -4px;
--shadow: var(--box-shadow-x) var(--box-shadow-y) 0px 0px var(--border);
--heading-font-weight: 700;
--base-font-weight: 500;
--border: oklch(0% 0 0);      /* the shadow's colour is the border's colour */
```

Three things worth noticing before anything else:

- **The radius is not zero.** Brutalism in this sense is not "sharp corners"; it
  is weight and flatness. 5px is a soft corner on a hard box.
- **The shadow has no blur and no spread.** `0px 0px` — it is a solid shape
  offset from the element, not a gradient. This is the single most defining
  value in the whole idiom.
- **There is a reverse offset.** It exists because the move below needs an
  opposite.

## 3. The one move everything is built on

From `src/components/ui/button.tsx`:

```ts
default:  "border-2 border-border shadow-shadow
           hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
reverse:  "border-2 border-border
           hover:translate-x-reverseBoxShadowX hover:translate-y-reverseBoxShadowY hover:shadow-shadow",
noShadow: "border-2 border-border",
```

Read it as one sentence: **the element travels exactly as far as its shadow was
offset, and gives the shadow up.** It lands on the spot the shadow occupied.
Nothing dims, nothing inverts, nothing gets an inset.

That is why the shadow must be hard-edged: it is not a lighting effect, it is a
**distance**, drawn. Pressing spends it. A blurred shadow cannot be spent,
because there is no exact place to land.

The three variants are the three things you can do with that distance:

- `default` — stands off the page, presses in.
- `reverse` — starts flat, pops out on hover. The same grammar backwards, for a
  thing that should not look raised until you address it.
- `noShadow` — no distance at all. This is the variant for a control living
  inside a bordered container, where travelling would tear the box it shares.

## 4. A field is flat

From `src/components/ui/input.tsx` and `select.tsx`:

```ts
"flex h-10 w-full rounded-base border-2 border-border bg-secondary-background
 px-3 py-2 text-sm font-base
 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2
 disabled:cursor-not-allowed disabled:opacity-50"
```

**No shadow.** Not an inset, not a raised one — none. A field is told apart from
a button by two things only: the 2px border it shares with everything, and a
different fill (`secondary-background`). The depth vocabulary is spent entirely
on the things you press.

This is a real choice with a real consequence, and it is where this project
differs — see §7.

## 5. The height is stated, never inherited

```ts
size: {
  default: "h-10 px-4 py-2",   // 40px
  sm:      "h-9 px-3",         // 36px
  lg:      "h-11 px-8",        // 44px
  icon:    "size-10",
}
```

and every field: `h-10`. Every control in the library has an explicit height, and
buttons additionally carry `inline-flex items-center justify-center
whitespace-nowrap`.

This is not a detail. Left to itself, a control's height is whatever its type and
the font's metrics work out to — and the types disagree. Chromium refuses
`line-height` on a `<select>` entirely, so a select comes out taller than the
input beside it in the same toolbar. A library that did not state its heights
would have a ragged toolbar on every page, and no amount of care with padding
fixes it.

## 6. The rest of the states

- **Focus:** `focus-visible:ring-2 ring-black ring-offset-2` — a ring drawn
  outside the box, not a change of border colour. It reads on any fill.
- **Disabled:** `opacity-50` plus `pointer-events-none` / `cursor-not-allowed`.
  Note what is absent: the shadow is not removed by the disabled rule itself —
  it is removed because a disabled thing never reaches hover.
- **Checkbox:** `size-4 outline-2 outline-border`, filled with the accent when
  checked. Drawn with `outline` rather than `border` so the box does not change
  size between states.
- **Weight:** body 500, headings 700. A hairline body text under 2px frames reads
  as two products sharing a page.

## 7. How this project maps onto it

| Mechanism | Reference | Here | |
|---|---|---|---|
| Hard shadow, no blur | `4px 4px 0 0` | `--depth-rest: 4px 4px 0` | same |
| Radius | 5px | `--radius: 6px` | same idea |
| Border | 2px everywhere | `--border-w: 2px` everywhere | same |
| Spend the shadow | translate 4/4, `shadow-none` | `--press: 4px`, `box-shadow: none` | same |
| Stated height | `h-10` / `h-9` | `--control-h: 36px`, `--control-h-small: 28px` | same |
| Buttons centre their label | `inline-flex … whitespace-nowrap` | the same three declarations | same |
| Focus | ring, offset | `outline: 2px solid var(--accent); outline-offset: 2px` | same |
| Base weight | 500 / 700 | `body { font-weight: 500 }` | same |
| `noShadow` variant | a class | `.auth-form` / `.invite-link` opt out and say so | same idea, named by place |
| The press happens on… | **hover** | **`:active`** | differs, §8 |
| A field is… | **flat** | **a hole** | differs, §8 |
| Shadow colour in dark | **black, as in light** | **lighter than the page** | differs, §8 — and this one is not a preference |

## 8. Where this project deliberately differs, and why

**The shadow in a dark theme cannot be copied.** The reference keeps the shadow
pure black in both themes. Measured against this project's palette:

| | how far the shadow stands out from what it falls on |
|---|---|
| light, `#14140f` on the page | 16.5:1 |
| dark, the border colour we used to borrow (`#4a4a52`) | 2.2:1 |
| dark, **black, as the reference does it** | **1.08:1 — gone** |
| dark, `#9a9aa6` | 6.99:1 |

They can afford black because their dark background is a mid grey
(`oklch(29.12%)`); this project's page is `#0d0d0c`, near black, and a black
shadow on it is not a shadow. So `--shadow-ink` is a token of its own — not the
border colour borrowed — and in the dark theme it is **lighter** than what it
falls on. The same arithmetic decides the sunken field: there is no colour that
makes a dark step inside a dark field visible (1.49:1 at best), so in the dark
theme the recess is lit on its far wall instead: `inset -4px -4px`.

**The press is on `:active`, not on hover.** In the reference, pointing at a
button presses it. That is striking on a marketing page and wrong in a panel
where a pointer crosses a toolbar on its way somewhere else: every button it
passes would fire the press. Here hover only raises — `--depth-hover`, 6px — and
the press is the click.

**A persistent pressed state inverts.** `aria-pressed="true"` is read later, at
rest, with nothing beside it to measure 4px against, so losing the shadow alone
looks like a button whose shadow was forgotten. It fills with `--ink` and prints
in `--page`. The reference has no equivalent because it has no long-lived pressed
state.

**A field is a hole, not a flat box.** The reference spends the depth vocabulary
only on things you press. Here the field is sunk by the same 4px, drawn hard and
opaque — because the panel is mostly tables and toolbars, where a reader has to
tell "you can type here" from "you can press here" at a glance, and a fill
difference alone is thin.

## 9. What to check after touching any of this

```bash
node panel/check-contrast.mjs          # every ink against its surface, both themes, 4.5:1
bash scripts/screenshot-panel-all.sh   # 10 pages x 2 themes x desktop/390, no sideways scroll
bash scripts/run-panel-tests.sh        # the E2E suite, which asserts no horizontal overflow
```

And open `http://localhost:62173/ui-kit.html`: it imports `src/App.css` rather
than copying it, so anything broken there is broken in the product.
