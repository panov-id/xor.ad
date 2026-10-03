# blocks — lens pass (02.10.2026)

> **Where things are now (W15-D1, 2026-10-04).** This is the design log of the sosed "blocks" direction as
> it was kept in the untracked `web/design/gen/dir-blocks/lens.md` on 2026-10-02; the text below is that log, unchanged.
> Its paths moved: `gen.py` is `scripts/design/sosed-sheets.py`, `build.sh` is `scripts/design/brand-sheets.sh`,
> `../lint_svg.py` is `scripts/design/lint_svg.py`, `../themes/sosed/*.json` is `web/themes/sosed/` (written by
> `scripts/design/sosed-themes.py`), `../themes.md` is `docs/design/themes_EN.md`, and the sheets are in
> `panel/design/sheets-sosed/`. Russian: `lens-sosed-blocks_RU.md`.

Machine asserts in gen.py (fail the build): 48 WCAG pairs over 3 themes (text 4.5, non-text/focus 3;
min measured 5.39), every role=button >= 48x48 (81 targets), type only on scale 14/16/20/28/40 with
14 limited to captions <= 24 chars, no "!" and no stars in screen text. Checked by eye on PNG previews
rendered by build.sh from the same SVGs.

## Type
- Golos only, two weights (400/600, 700 for wordmark). Body 16, card phrase 40, titles 28.
- FIX 1: Feed bottom tile ("кто знает хорошего мастера") wrapped to 3 lines in a 165px tile and ran into
  the mode icon — last row is now one 255px tile, 2 lines.

## Colour / contrast
- Tile text colour chosen per tile by max contrast and asserted >= 4.5 (night tiles deepened to carry white).
- Like/hide accents asserted >= 4.5 on background; focus ring >= 3 on bg and panel.
- No gradients, no shimmer.

## Grid / spacing
- 16 gutter, 8-grid, radii 24 (tiles) / 32 (card) / pill buttons.
- FIX 2: Feed FAB sat on top of a tile — moved to free space beside the wide last tile.
- FIX 3: Card-more — the pulled-down card ran under the action row; peek card height 420 -> 336.
- FIX 4: Profile "перенос / на другое устройство" overflowed its tile — caption shortened to "устройство".
- FIX 5: Profile short rows (код, заново) stacked text onto the icon — icon left, text column at x+60.

## A11y
- Every button carries aria-label; card is role=group with the gesture explanation in its label
  (swipe has tap equivalents: hide / peek / like buttons under the card).
- FIX 6: right-swipe hint arrow pointed left ("♥ <") — new `fwd` icon, now "♥ >".
- Focus: :focus-visible outline 3px in theme focus colour.

Total fixes: 6. Not verified: rendering in a real browser / screen reader (only inkscape PNG + PDF).

## Owner-rule pass (coordinator, 02.10)
- FIX 7: foreign phrase time is no longer a number on Card, Card-liked, Card-more, Card-dark. It is a thin
  bar, with the words "скоро исчезнет" only near the end. Compose keeps numbers (own phrase).
  gen.py now asserts that no digit followed by "мин" or "ч" appears on any Card* screen. Seen red once by
  putting "ещё 40 мин" back, then restored.
- FIX 8: Card-more detail tiles show icon + value only; the words moved into aria-label.
- FIX 9: Card-more had eye (hide) and × (collapse), and they do different things. × is now an ↑ button
  on the edge of the peek panel ("свернуть подробности"): the card goes back up and the phrase stays.
  The bottom row keeps only the eye ("скрыть фразу из ленты": the phrase leaves the feed) and like.
Total fixes round 1: 9.

## Round 2 (English + geometry lint + 2x visual pass)
Gate: build.sh runs `../lint_svg.py screens/*.svg` and stops on any problem. It reports
`lint: 0 problems in 11 files`. Every <text> has an id. There is no Cyrillic in the screens,
behavior.svg or gen.py. The Card* check for foreign time now looks for "<digit> min" or "<digit> h".
- FIX 10: all visible text and aria-labels are in English (Boris, Anya; brand names stay). This also makes
  Feed-neighbro consistent with the other screens.
- FIX 11: Profile tiles show icon + value only; the caption words moved into the button aria-label.
- FIX 12: Match has no subtitle sentence, so the screen is title + icon buttons.
- FIX 13: card screens had an empty header <text> (Inkscape returns an empty bbox for it): it is no longer emitted.
- FIX 14: Card-liked's tilted card ran off the right edge and clipped its text. A scaled-down card failed the
  lint (rotated lines overlapped) and its text came out below 16 px, so the leaving card is now a full-scale
  phrase tile pushed right, 140..359, upright, with 28 px text.
- FIX 15: the Compose text cursor sat in the middle of "join?" because its width was estimated for Russian; removed.
  The blue focus ring already shows focus.
- FIX 16: Card-more was the only card screen without a tab bar. The peek card is shorter (300) and the buttons
  moved up to 668; the tab bar is added.
Looked at all 11 screens at 2x after the fixes. Known, left as is: on Card-more the third phrase line sits close to "solo".
Not looked at: behavior.svg at 2x (rendered, not inspected by eye); the lint does not cover it.
Arrival, Compose, Match and Chat have no tab bar on purpose: they are entry or modal flows with back.

## Round 3 (shortlist)
- FIX 17: Card-liked is one deliberate state: the card stays full width and a like medallion (r 34, ring in bg colour)
  overlaps its top-right corner, inside the 16 px gutter. The salmon half-block and the pushed tile are gone.
- FIX 18: the small floating swipe-hint row under the card (Card, Card-dark) is dropped. The hide, peek and like
  buttons are the visible equivalents, and the swipe stays described in the card's aria-label.
- Checked, no change: Feed and Feed-neighbro, captions per row. First lines of text share a baseline in every row, and the
  meta row (mode icon + heart count) shares a baseline inside each tile. The short right-column tiles carry no meta.

## Round 4 (sosed themes, owner chose blocks)
- Themes are data: ../themes/sosed/{light,dark,mono,warm,berry}.json (contract in ../themes.md). The optional key `night`
  names the theme that Card-dark uses: dark for light, warm and berry; mono for mono, because there is no hue-free dark theme yet.
  gen.py --theme <json> --out out/<id>/ ; build.sh renders, lints and adds to the PDF every *.json in the folder.
  sheet.pdf = 1 overview page (Card in all 5 themes, nested vector) + 5 sections x (10 screens + behavior) = 56 pages, 0 raster.
- Light colours, shifted a little deeper and less pastel (calm, ink text still >= 4.5 on every tile):
  tile-1 #f6c453 -> #eeb641 · tile-2 #f4a58a -> #ec9a7c · tile-3 #bfe0d4 -> #a9d2c3 · tile-4 #d9c8f2 -> #cdb9ec ·
  surface-2 #ffe2c2 -> #fbdcbc. bg, ink and accent are unchanged.
- FIX 19: the empty band under the card on Card and Card-dark: the card is taller (420 -> 480), and the buttons moved
  from 640 to 612.
- FIX 20: Feed-neighbro is dropped from the sosed set; there are now 10 screens per theme.
- FIX 21: mono tile-3 #ededed was almost the colour of the bg #f4f4f4 and the tile edge disappeared -> #dfdfdf.
Looked at Card + Feed of all 5 themes at 2x.

## Round 5 (fonts gate, mono-dark)
- FIX 22: the overview page fell back to Noto. fonts.conf pointed at the deleted screens/fonts folder, and out/ had no fonts copy.
  It now points at gen/ (golos.ttf).
- FIX 23: DejaVuSans in behavior pages came from the ♥ character, which Golos does not have (checked against
  `fc-query --format=%{charset}`). It is replaced by words.
- FIX 24: CairoFont Type 3 on Arrival and Match came from weight 700 (golos.ttf has no bold, so Inkscape faked one). 700 -> 600.
- Gate: build.sh fails if pdffonts lists anything but GolosText/RussoOne. Seen red once: putting ♥ back gave
  "fonts: DejaVuSans GolosText-Medium / FONT GATE", then restored from a copy.
- mono-dark.json added (greys only); mono's night points to it. Now 6 themes, sheet.pdf = 67 pages, 0 raster.

## Round 6 (kit palettes only)
Themes are generated by make_themes.py from the kit: grounds SOSED_LIGHT/SOSED_DARK (scripts/design-palettes.py:40-41;
err from panel/design/kit/tokens.css .k-light/.k-dark), accents from panel/design/kit/schemes.css:3-14. No invented hex.
Mono and mono-dark: each kit hex is replaced by the neutral grey of equal relative luminance. Tile text uses the kit
accent inks #fff6f0 / #1a1509 (or the theme's fg/bg), not invented inks. berry and warm are deleted.
dark-<accent> files exist only as the Card-dark night pair ("section": false, so they get no section of their own).
- KIT CONTRAST FAIL, reported and not changed: amber #d68a1f on bg #ece4d8 = 2.22, turquoise #1fa99a on bg = 2.31
  (non-text fill such as the FAB or the active like; the limit is 3). The heart icon uses accent-text, which passes.
- Visible consequence of the kit: line = border #221a12 (near-black) on light, so outlined buttons and the tab bar get
  dark 1.5 px outlines.

## Round 7 (coordinator decision)
- FIX 25: the big card (Card, Card-liked, Card-more, Card-dark) and the Arrival brand tile wear the theme accent, with
  accent-fg text. Feed keeps the 4-tile mix. On the overview the colour variants now read as different colours.
- FIX 26: light themes use line = border-control #857562 (SOSED_LIGHT control) for button and tab outlines instead of
  #221a12. Mono greys it (#777777). Dark keeps border #3a2e20.
Overview looked at at 2x. Lint 0 x 9 themes, font gate GolosText-Medium only, 100 pages, 0 raster.

## Round 8 (Match hero, owner crop)
- FIX 27: the medallion is the theme accent (not accent-text) at 112 px, with a 4 px surface ring, a soft shadow made of
  3 translucent vector circles (no filter, so the PDF stays vector), and the heart in accent-fg with a 3 px stroke so it reads at size.
- FIX 28: the two cards are picked per theme from the 4 tiles: neither is the accent, hue >= 30 deg from it, >= 60 deg apart.
  Mono (no hue): pick for the widest grey separation, surface-2 allowed. The ring falls back to bg/fg only when the surface ring would
  vanish on a card (mono, mono-dark: ring = fg).
- FIX 29: accent-text is no longer a fill anywhere (liked button, Card-liked medallion). gen.py asserts that no fill equals
  accent-text unless that hex is also another token. Seen red: "('Card-liked', 'accent-text used as a fill', '#983c22')", restored.
- Kit contrast, reported and not changed: accent vs surface ring: amber 2.68, turquoise 2.80 (< 3). Ring vs card below 3 on the
  amber/turquoise cards (2.68 / 2.80) on light grounds; still visible as a light band.
- The overview page now carries a strip of all 9 Match heroes under the Card row; looked at at 2x.
