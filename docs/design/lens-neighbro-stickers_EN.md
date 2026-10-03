# stickers — lens pass (02.10.2026)

> **Where things are now (W15-D1, 2026-10-04).** This is the design log of the neighbro "stickers" direction as
> it was kept in the untracked `web/design/gen/dir-stickers/lens.md` on 2026-10-02; the text below is that log, unchanged.
> Its paths moved: `gen.py` is `scripts/design/neighbro-sheets.py`, `render.sh` and `build.sh` are
> `scripts/design/brand-sheets.sh`, `../lint_svg.py` is `scripts/design/lint_svg.py`, `../themes/neighbro/*.json` is
> `web/themes/neighbro/` (written by `scripts/design/neighbro-themes.py`), the themes contract is
> `docs/design/themes_EN.md`, and the sheets are in `panel/design/sheets-neighbro/`. Russian: `lens-neighbro-stickers_RU.md`.

Machine lenses run inside `gen.py` (`./render.sh` calls it with `--strict`):
- colour: 60 WCAG pairs asserted (text 4.5, mu 4.5, ink-on-every-sticker-hue 4.5, focus/line/button 3) for day, sunset, night, neighbro;
- targets: every role=button/tab >= 48x48, has aria-label, inside the screen, no two targets overlap (70 targets);
- type: scale 14/16/18/22/28/36, body (Golos 400) >= 16 on screens; no "!" in text; no name outside Match/Chat/Profile;
- icons: stroke 1.5 with non-scaling-stroke.
Final run: `screens=11 targets=70 contrast_pairs=60 problems=0`.

Visual pass (PNG previews, then fixed in gen.py and rerun):
1. Card-liked — freshly placed heart sticker covered the last word of the phrase. Moved to the empty lower-right of the card.
2. Card-liked — orphan "✓" on the undo row read as a stray glyph. Removed; the undo chip with 5 s is the confirmation.
3. Profile — "перенести на другое устройство" ran into the chevron. Shortened to "перенести личность".
4. Chat — "срок беседы" target sat in the middle of the row, away from its icon. Target now covers the timer icon and label (16..296).
5. Arrival — text cursor sat on the gap instead of in the ninth slot. Moved inside slot 9.
6. Early draft: target-overlap check added after noticing the tray and the bottom pad could collide on Card; layout keeps 24 px between them.

Not checked: real focus order in a browser; drag on touch devices (the screens are static SVG).

## Round 2 (02.10.2026): English, lint gate, visual pass at 2x

Gate: `render.sh` runs `gen.py --strict`, then `../lint_svg.py` on all 11 screens, then a Cyrillic check on behavior.svg; any failure stops the build.
Last run: `lint: 0 problems in 11 files`.

Fixes:
1. All visible text and aria-labels translated to English (Boris, Anya; brands sosed/neighbro kept). Every <text> gets an id.
2. Card / Card-liked / Card-dark: big empty area between card and sheet — card now runs down to the sheet as the drop zone, with reactions and ⓘ in its footer and a dotted drop target in the middle.
3. Card-liked: undo (5 s) moved into the bottom pad in place of the sheet button; it no longer floats below the card.
4. Card-more: drag trail no longer crosses text — it runs from the empty tray slot through the empty middle of the card; hint moved to the pad.
5. Chat: the heart sticker under a bubble overlapped the next bubble — extra 12 px after a bubble that carries a sticker.
6. ⓘ anchoring: Arrival next to "code", Compose next to "zone", Card in the card footer, Match beside the "talk" button, Chat inside the term row.
7. Compose: "3 km" ran past the right gutter — four zone chips now share 343 px exactly (79.75 each).
8. Compose: phrase overflowed the card (lint t42 x..379) — split onto two lines.
9. Die-cut shadow had a duplicate fill attribute (invalid XML); fixed.
10. Chat: "talk term" target was an empty group (no bbox, broke the inkscape query); given a transparent rect.
11. Feed/Match: widow "in" on its own line — sample phrase shortened.
12. Reaction counts touched their sticker (visible on night) — count moved 5 px right.
13. Chat: safety button touched the phase sticker — moved 18 px left.

Not looked at: behavior.svg at 2x (only lint-free of Cyrillic), hover/focus states, real browser focus order, touch drag.

## Round 3 (02.10.2026, owner shortlist)
1. Card / Card-liked / Card-dark: phrase at 36; lone dotted circle removed — at rest no drop marker, the full-card dashed outline only on Card-more (drag). 36 alone still left an empty card, so the card now hugs its content (272) and the next two phrases peek below it at 55 % — the screen reads as a stack, not a hole. Phrase shortened to avoid a one-word last line.
4. Card-more: drag trail rerouted along the right edge; it crossed the ⓘ and the peek text after the layout change.
2. Feed: cards no longer rotated — left edges on the 16 px gutter, die-cut border and shadow kept.
3. Arrival: sticker, code and both buttons pulled into one block (buttons at 400/468) instead of buttons pinned to the bottom.
Lint after rebuild: 0 problems in 11 files.

## Round 4 (02.10.2026): neighbro is the brand, themes as data
- Themes: ../themes/neighbro/{light,dark,mono,sea,mint}.json (themes.md contract; extra optional token tile-5 for the fifth reaction, falls back to tile-1). gen.py --theme/--out; no theme lives in code. Card-dark (night phase) uses the brand's dark.json.
- build.sh: per theme gen --strict + lint_svg + no-Cyrillic in behavior.svg; sheet.pdf = overview (Card in every theme) + per theme a token title page, 10 screens, behavior = 61 vector pages.
- sosed removed; Feed-neighbro dropped (10 screens per theme).
- Card-more: trail now leaves the empty slot, runs in the gap above the sheet, and enters the card perpendicular at the sticker column — no run along the dashed outline, clear of ⓘ and text.
- Dark: cream die-cut border read as a heavy outline — die = 30 % fg over surface.
- Reaction counts touched the next sticker (dark Feed) — spacing 58 → 64.
Looked at 2x: Card, Feed, Card-more in all 5 themes.

## Round 5 (02.10.2026)
- Mint and Sea were near-copies of Light on the overview. Mint now has mint background, header and tiles (bg #d9f2e2, surface-2 #8fd9ad, all-green tiles); Sea is blue throughout (bg #d6e7f7, surface-2 #86b9e8, blue tiles). Light moved to a neutral bg #f4f4f0 so the three separate. Contrast asserts unchanged and passing.
- Match: phrase cards were still tilted while Feed was straight — tilt 0, left edges on the gutter.
- Arrival (dark): code cells merged into one band — cells 28 wide with a 10 px gap.
Looked at 2x, light + dark: Arrival, Compose, Match, Chat, Profile, Card-dark. Seen and left: Compose has free space above the send button (kept for the keyboard).

## Round 6 (02.10.2026): kit palettes replace invented ones
Themes regenerated from panel/design/kit/schemes.css (exact hex): gold-dark (.k-neighbro), gold-light (.k-neighbro-light), sea-dark (.k-neighbro-sea), sea-light (.k-neighbro-sea-light), mono = luminance-equal greys of gold-light. light/dark/mint/sea removed.
Mapping: bg<-bg, surface<-panel, surface-2<-panel-2, fg<-fg, fg-muted<-muted, line<-border, accent<-accent, accent-fg<-accent-ink, danger<-err, tile-1..3<-cat-amber/teal/violet, tile-4<-ok, tile-5<-accent-text, shadow<-shadow, focus<-accent-text (kit has no focus var).
Header gradient = surface -> bg; dark die-cut border = surface-2; light die-cut stays #ffffff.
Icon/text ink on tiles = theme fg or bg, whichever contrasts more (kit light tiles are dark, so a fixed ink failed).
Palette contrast failures are reported, colours kept (gen prints PALETTE lines):
- gold-dark line/bg #3a331f on #0c0b09 = 1.57 (< 3)
- gold-light accent/bg #c6a24e on #e9e6dd = 1.94 (< 3)
- mono accent/bg #a7a7a7 on #e6e6e6 = 1.93 (< 3)
- sea-dark line/bg #23383d on #0b1416 = 1.51 (< 3)
- sea-light line/bg #c9d1ce on #f3f1ea = 1.38 (< 3)
Visible effect: ⓘ outline faint on dark themes; kit solid shadow reads as a hard offset edge, heaviest on sea-light (#14201e).
- Gold gradient (owner 02.10, overrides brief's "no gold gradients"): optional token accent-gradient ["#a5822f","#c6a24e","#f1dc9a","#c6a24e"] in gold-dark/gold-light only; diagonal (~135deg) static, no glow. Applies to fills equal to accent or tile-1 (accent buttons, FAB, gold stickers). Ink on gold = accent-fg #1a1509, asserted >= 4.5 on every stop (darkest stop raised from #8f6f2a to #a5822f because #8f6f2a gave 3.9).

## Round 7 (02.10.2026): landing palette, sosed-like structure
Source: neighbro.place landing/index.html lines 85-129 (read-only). make_themes.py writes themes/neighbro: light, dark (gold), crimson, teal, azure, violet (light ground, night = own dark-<accent>, section:false), mono, mono-dark (equal-luminance greys). gold-*/sea-* removed.
Mapping: bg<-bg, surface<-panel, surface-2<-panel-2, line<-border, fg<-fg, fg-muted<-muted (light) / muted-2 #928979 (dark), accent<-accent, accent-fg<-accent-ink, accent-text and focus<-accent-text per mode, danger<-err, shadow<-border, tile-1..4<-the other four accents, tile-5<-ok, tile-ink<-each accent's accent-ink.
Big card wears the theme accent (gold: metallic gradient). Dark panel #14120e is 1.06:1 on bg; cards stay visible through the die-cut border (panel-2), so panel kept.
Font gate as dir-blocks: sheet.pdf fonts GolosText + RussoOne only; ✓ ✕ ⓘ in behavior.svg (not in Golos, fell back to DejaVu/VL Gothic) replaced by words.
Reported, kept: accent fill on light ground < 3:1 — gold #c6a24e 1.94, teal #1fb39a 2.11, mono #a7a7a7 1.93.

## Round 8 (02.10.2026): no gold, cool neutrals
Gold removed (accent, gradient, sticker). Base light/dark = teal #1fb39a (ink #04201c, accent-text dark #1fb39a / light #126a5c). Themes: light, dark, crimson, azure, violet, mono, mono-dark. Stickers: teal, crimson, azure, violet, green.
Neutrals: same WCAG luminance, hue 215, saturation 8 % (make_themes.py cool()):
| old | new |
|---|---|
| #0c0b09 | #0b0b0c |
| #14120e | #111314 |
| #26221a | #202326 |
| #6a5d39 | #585e67 |
| #ede8dd | #e7e8eb |
| #928979 | #838a95 |
| #e9e6dd | #e5e6e9 |
| #f4f1e8 | #f1f1f3 |
| #ded9cc | #d7d9dd |
| #1e1b14 | #1a1b1e |
| #181510 | #141618 |
| #5f5a4e | #545b63 |
#8a8172 and #5c5749 are not used (fg-muted takes #928979 dark / #5f5a4e light).
Green: ok #9ecb7a -> #7fd19a (dark), #4b712c -> #3f9a5c (light).
Accent-text values: only gold's #735b25 was brown; it left with gold. Crimson #b32922/#e0625b, azure #2d609c/#548dce, violet #793fbe/#a077d2, teal #126a5c are not brown.
mono-dark line grey rounded to 2.99:1; stepped one level to pass 3:1.
Reported, kept: teal fill on light bg 2.11, mono accent 2.12 (< 3). Seen: teal heart sticker on the teal card (light/dark) separates only by its die-cut border.

## Round 9 (02.10.2026): Match hero, same-colour sticker
- Match hero: two solid stickers r52 — accent + first sticker colour >= 60 deg away in hue (asserted; mono: the grey most different in lightness), crisp #ffffff ring 8, soft translucent shadow, 28 px overlap, no blends. Icons: accent-fg on accent, contrast-picked ink on the other.
- Reaction sticker equal to the accent card colour: white fill, icon in the sticker hue, falling back to accent-text / accent-fg when the hue is under 3:1 on white (teal 2.63, mono grey 2.65).
- Overview page: strip of all Match heroes under the Card row.
- build.sh: bash + pipefail — a failing gen.py assert was swallowed by the `| sed` pipe before.
Looked at 2x: Match and Card in all 7 themes, overview.

## Round 10 (02.10.2026): one sticker — the heart
- REACT = heart only (node knows like/unlike). Tray = heart pad: one heart on the strip with two hearts stacked behind; drag-onto-card, tap-then-card, 5 s undo kept.
- Cards show a single heart count; Match hero = two hearts (mine accent, theirs >= 60 deg away).
- Chat-line reaction removed with its behavior row (no like on chat lines in the node).
- Placed / dragged heart on the accent card was teal on teal: drawn white with an accent-ink icon (>= 3:1 on white).
- behavior.svg rows reworded to the heart pad. Tokens tile-2..5 stay in JSON, used only by the Match hero and the phase sticker.
Looked at 2x: Card, Card-liked, Card-more, Match in light and dark.
