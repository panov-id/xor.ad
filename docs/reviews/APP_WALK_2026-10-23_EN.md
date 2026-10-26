# App walk, sosed, 23.10.2026 (plan step 4)

Source: 136 DOM snapshots (34 scenes × 390/834/1440/1920), `walk.tsv` machine hits, sheets of packs 3–5 read with `scripts/design/sheet-geometry.mjs`. Contrast recomputed against the nearest enclosing filled rect. Read only; nothing was run on the stand.

## Summary

- Rows in the table: 41 (39 defects, 1 "not snapped, cannot judge" for 11 game sheets, 1 wizard "not built, step 6h"). `grep -c '^| '` over this file gives 42: the 41 rows plus the header line.
- By point: 1 – 3, 2 – 2, 3 – 7, 4 – 2, 5 – 0, 6 – 1, 7 – 1, 8 – 6, 9 – 7, 10 – 10, 11 – 1, 12 – 1.
- By group: a (navigation, wide layout) – 16, b (clipping, scroll) – 3, c (texts) – 1, d (screens) – 11, e (place) – 2, f (games) – 4, g (cabinet) – 3, h (wizard) – 1.
- The owner's three defects are rows 1–2 (Me @1920), 4 (rail on Blocked and Place) and 8 (Place).
- Rail rule: every desktop sheet (Feed, Talks, Tables, Write, Phrase, Me, BothIn) keeps the rail x 0–224, including the match overlay (desktop_1440_BothIn). The tablet 834 sheets have no rail. So NAV-MISSING at 1440/1920 is real for every signed-in screen.
- Table sticker strip: w3_table-four draws 4 chips ending at x 327 of 356, no sideways scroll. The scroll in code is a defect.
- Point 10 rows marked "sheet … drawn so" match the sheet size and still break the 44 px rule; the owner decides whether they count.

## Defects

| scene | width | point | what is wrong (concrete numbers) | sheet | group |
|---|---|---|---|---|---|
| me | 1440, 1920 | 1 | Owner defect 1. Right column of rows ends at x 1132 (970.9 + 161), panel ends at 1016: 116 px cut; 25 elements clipped (Theme, filter, PIN, Place, Blocked…) | desktop_1440_Me | b |
| me | 1440, 1920 | 2 | Owner defect 1. Horizontal scroll in div.me-body: 883 px of content in 767 | desktop_1440_Me | b |
| me | 1440, 1920 | 8 | Panel 767 wide plus the talks pane at x 1040; sheet: one panel x 249–1415 (1166 wide), no talks pane, rows in 2 columns of 302 at x 773 / 1085. Snapshot rows are 188 / 161; "Start again" squeezed to 80×135 **Fixed (23.10, step 6a): wide.css `.me-panel` to the window's edge, `.me-home .me-rows` align-content start, `.me-danger` nowrap. Snapshot @1440: panel x 248.6, 1167.4 wide, rows at x 772.9 / 1084.5 × 301.6, no talks pane (App.tsx PANE_BESIDE), "Start again" 80×18.6; @1920: panel 1647.4, rows 541.6.** | desktop_1440_Me | a |
| me-blocked, me-place | 1440, 1920 | 3 | Owner defect 2. No left rail (data-nav=missing); all 7 desktop sheets keep the rail x 0–224 **Fixed (23.10, step 6a): Rail in TabBar.tsx + SubPage (me/parts.tsx), data-nav=present @1440 and @1920.** | desktop_1440_Me (rule of all desktop sheets) | a |
| me-away, me-filter, me-hidden, me-lang, me-legal, me-name, me-pin, me-reissue, me-reset, me-statements, me-theme | 1440, 1920 | 3 | No left rail (11 sub-screens) **Fixed (23.10, step 6a): the same (SubPage renders Rail); measure NAV-MISSING 0.** | desktop_1440_Me (rule) | a |
| me-* (all 13 sub-screens) | 1440, 1920 | 4 | Back at x 449, y 23 and title at x 501 sit above and outside the panel (panel x 249, y 84); in the desktop sheets the title is inside the panel at x 279 **Fixed (23.10, step 6a): wide.css `.screen.me-sub` panel; Back at x 266.6, title at x 318.6, inside the panel (x 248.6, y 24).** | desktop_1440_Me | a |
| me-* (all 13 sub-screens) | 1440, 1920 | 8 | Body is a 390 px phone column at x 437–827 inside a 767 panel, with the talks pane beside; the Me sheet uses the full 1166 panel and has no talks pane **Fixed (23.10, step 6a): panel full width, no talks pane; the column keeps the phone's width (450 with its sides) at the panel's left under the title, because no sheet draws the sub-pages.** | desktop_1440_Me | a |
| me-place | 390, 834, 1440, 1920 | 6 | Owner defect 3. Two empty fields "City" and "Or paste a point from a map" (356×56 each) plus "Place from a QR"; no map, no "Now: …" line | w4_place, place-flow.svg | e |
| me-place | 390, 834, 1440, 1920 | 12 | The empty place screen does not say what the place is for or what to do first | place-flow.svg | e |
| match | 1440, 1920 | 3 | No rail: dim covers the whole 1920×1080, card 420×532 at x 750; desktop_1440_BothIn keeps the rail and the feed behind the card (card 419×531 at x 510) **Fixed (23.10, step 6a): Rail in Match.tsx, `.dim-screen { left: 224.65px }` (dim over the content area only); card at x 510.2, 419.7 wide as the sheet; nav present @1440/1920.** | desktop_1440_BothIn | a |
| likes | 1440, 1920 | 3 | No rail (no wide sheet; every desktop sheet keeps it) **Fixed (23.10, step 6a): Rail in Likes.tsx, nav present @1440/1920.** | — (rule) | a |
| likes | 1440, 1920 | 4 | Back at x 449, y 23 and title above the panel, panel starts at x 249, y 120 **Fixed (23.10, step 6a): Back x 266.6 and title inside the panel (x 248.6, y 24); cards in a grid (358.5 wide, x 278.6 / 653).** | — | a |
| table | 1440, 1920 | 3 | No rail; main[table] is 1016 wide, board panel 356 at x 453 **Fixed (23.10, step 6a): Rail in Table.tsx (both returns), the panel as the sub-pages; board 356 at x 278.6; the sticker strip scroll is group f, left.** | — (rule) | a |
| new-table | 1440, 1920 | 3 | No rail; sheet spans full 1920, body 390 at x 765, back at x 776 **Fixed (23.10, step 6a): Rail in NewTable.tsx, the panel; nav present @1440/1920.** | — (rule) | a |
| departure | 1440, 1920 | 3 | No rail; sheet spans full width **Fixed (23.10, step 6a): Rail in Departure.tsx, the panel; nav present @1440/1920.** | — (rule) | a |
| departure | 1440, 1920 | 8 | Column 358 at x 781; content ends at y 332, button "Get a one-time code" at y 996: a 660 px hole **Fixed (23.10, step 6a): wide.css `.screen.mv` — the foot follows the words; button at y 387.8, the warning ends at y 252.7 (was 996 and 332).** | w2_departure-start | a |
| feed, feed-table, card | 1920 | 8 | Panel 767 + talks pane x 1040–1416, so 504 px empty on the right; sheet desktop_1920_Feed: panel x 248–1496 (1248) with 3 card columns of 385, pane at x 1520 **Fixed (23.10, step 6a): wide.css `--panel-w` follows the window, `.tk-pane` stands at the right edge, `--fd-cols: 3` from 1920. Snapshot @1920: panel 1247 at x 248.6, pane at x 1519.6, 3 cards of 385 at x 278.6 / 679.6 / 1080.6; @1440 unchanged (767, pane 1039.6).** | desktop_1920_Feed | a |
| tables | 1440, 1920 | 8 | No talks pane on the right; desktop_1440_Tables has the pane at x 1040–1416 **Fixed (23.10, step 6a): App.tsx PANE_BESIDE has "tables"; @1440 pane x 1039.6, panel 767, rows 345.6, tiles 226.4 as the sheet; @1920 panel 1247, rows in 2 columns of 385, 5 tiles per line.** | desktop_1440_Tables | a |
| talks, chat | 834 | 1 | Match strip clipped at x 725 (strip 293 wide); sheet strip runs x 432–801 with 5 faces, the 5th face is cut | tablet_834_Talks | b |
| table | 390, 834, 1440, 1920 | 1 | Sticker strip holds 8 chips (607 px) in 356: Good move, Rematch, I give up clipped **Fixed (24.10, group f): tables.css — the sticker strip wraps (wrap-reverse), all 8 on screen, the first row where the sheet draws it; games run: no clipping at 320, 375, 390, 834, 1440, 1920; break (old strip) — red.** | w3_table-four | f |
| table | 390, 834, 1440, 1920 | 2 | Sticker strip scrolls sideways (607 > 356); w3_table-four draws 4 chips ending at x 327, no scroll **Fixed (24.10, group f): no sideways scroll, the .tg-chips exemption removed from the run; 452 of 452 within 2 px.** | w3_table-four | f |
| table | 390, 834, 1440, 1920 | 10 | Four-in-a-row columns 39 px wide (sheet cells are 39 too: drawn so, still under 44) **Fixed (24.10, group f): drawn 39 px as on the sheet, hit area 44 px (.tg-col::after, beyond the sheet); the run asks the browser (elementFromPoint): 44 on 7 of 7, break — 38.6, red.** | w3_table-four | f |
| chat | 390 | 7 | Header line cut mid-word: "Fades after 38 min of si…" | w3_chat | c |
| me | 390 | 11 | "Start again" #f0705f on row #3a3157: 4.09:1 (needs 4.5) **Fixed (23.10, group d): row colour #F28172 (beyond the sheet), 4.64:1 on #3a3157; DOM probe at 390.** | w4_me | d |
| me | 834 | 10 | "Start again" row 778×19 (under 44 high) **Fixed (23.10, group d): wide.css — hit area 44 px (padding 12.5 and shifted margins), text in place; DOM probe: 44 at 834 and 1440, WIDE 407 of 407.** | tablet_834_Me | d |
| me | 390, 834, 1440, 1920 | 10 | "Edit" 56×36 (sheet 55×36: drawn so) **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | w4_me | d |
| feed, feed-table, card | 390, 834, 1440, 1920 | 10 | "Open" link fd-open 250–285×24; table "watch" 66×32 (sheet 66×32) **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | w1_feed | d |
| feed, feed-table, card | 1440, 1920 | 10 | Radius chips 57–68×40 (sheet 40 high) **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | desktop_1440_Feed | d |
| tables | 390, 834, 1440, 1920 | 10 | "Watch" 66×32 (sheet 66×32) **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | w3_tables | d |
| composer | 390, 834, 1440, 1920 | 10 | Zone chips 57–68×40 (sheet 40 high) **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | w3_composer | d |
| chat, talks | 390, 834, 1440, 1920 | 10 | Quick chips 40 high, "Hi" 43–44 wide (sheet 44×40) **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | w3_chat | d |
| me-away | 390, 834, 1440, 1920 | 10 | Chips 46 / 50 / 74 × 42 **As drawn (23.10, group d): code untouched; rule "under 44 stays as the sheet draws it" from the handoff session-handoff-9e64b2a1.md (.claude), owner's own words NOT VERIFIED.** | w4_step-away | d |
| cabinet-offers, cabinet-venues | 390, 834, 1440, 1920 | 10 | Home button cb-nav 98×36 | w4_cabinet-offers | g |
| cabinet-offers, cabinet-sign-in, cabinet-venues | 1440, 1920 | 8 | Phone column 390 at x 765 on a bare page, no wide layout | — | g |
| likes, table, new-table, departure, me-* (13) | 834, 1440, 1920 | 9 | No wide sheet for these screens **Left (23.10, step 6a): no sheet exists for these screens; the panel is built from desktop_1440_Me, the designer must draw them; 834 untouched.** | — | a |
| splash, register-1..3, restore | 834, 1440, 1920 | 9 | No wide sheet (column 390 at x 765) **Left (23.10, group d): no sheet; handed to the design session xor-ad-1e (open-questions-app-games).** | — | d |
| cabinet-* (3) | 834, 1440, 1920 | 9 | No wide sheet | — | g |
| match, card, composer, tables, me | 1920 | 9 | No 1920 sheet (only Feed and Talks have one) **Left (23.10, step 6a): no 1920 sheet exists; 1920 follows desktop_1920_Feed and the 1440 sheets (panel grows to the pane), the designer must draw it.** | — | a |
| me-hidden, me-blocked | 390 | 9 | w4_me draws no "Hidden" / "Blocked" rows; the rows exist only in code **Left (23.10, group d): handed to the design session xor-ad-1e (open-questions-app-games).** | w4_me | d |
| 10 games w3_table-* (all but four), w3_chat-game | all | 9 | Not snapped: no scene in the walk, cannot be judged **Shot (24.10, group f): games run over 16 sheets (12 w3_table-* and 4 poker), 452 of 452 within 2 px, shots in session b1ecf811's scratchpad; w3_chat-game is measured by measure-app-w3-chat — run 24.10, exit 0, every chat-game line ok.** | w3_table-*, w3_chat-game | f |
| wizard-1..5 | all | 9 | Not built, step 6h (not a defect) | w4_wizard-1..5 | h |

## False hits

- point 6, 12 hits: "adv.sosed.place" on the cabinet screens is the cabinet domain, not raw data.
- point 11, 122 hits: computed against the page; against the nearest block fill only me@390 "Start again" stays under 4.5 (row above). The other 121 are false.
- point 3, splash, register-1..3, restore @1440/1920: no identity yet, so there is nothing for the rail to open; the register sheets have no rail.
- point 3, cabinet-* @1440/1920: the cabinet is a separate site with its own header (cb-home), not the app tabs.
- point 1, talks and chat @1440/1920 "clipped (L)": the strip starts at x 277.4, its clip at 278.6; a 1.2 px sub-pixel edge.
- point 7, me-hidden ×4 "Lost a grey cat near the…": w4_hidden draws the row as one line with "Return" on the right, so the ellipsis is the design.

## Not judged from SVG (needs a ~400 px raster)

- Point 12 and the states empty, loading, error, long text: the 34 scenes hold only data states.
- 10 of 11 `w3_table-*` games and `w3_chat-game`: no scenes.
- Icons, glyph shapes, images and colour overlays (dim, gradients) that snap-svg.mjs does not carry.
- Whether the texts match the sheets word for word: sheet text is outlined into glyphs.
