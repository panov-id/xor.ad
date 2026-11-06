# Brief for the designer: rework of the archive sosed-design-2026-10-29

Pair: `BRIEF_REWORK_RU.md`. Material: `sosed-design-2026-10-29_2.zip` (283 screens × 3 widths × 8 themes).
Goal: the app is built from the archive without the developer's guesses. Below: what the archive has, what is
missing and what exactly to send. Everything checked against the archive files on 01.11.2026. The brief grows as
the work goes on.

## What the archive does well
- 283 screens of ready HTML at 3 widths, 8 themes (4 stones × day/night), PNGs, a screen spec, icons.
- The app already takes the markup from the archive by script, not by hand.

## 1. No rules between widths (the main gap)
**Has:** three fixed frames: phone, tablet 820×1180, laptop 1440×900. Each screen is a fixed-size `.scr`,
everything inside placed in pixels. The only `@media` in the files is `prefers-reduced-motion`.
**Missing:** how a screen behaves on real windows: 1000–1439 (small laptop, tablet landscape), 1920, 2560,
phone 360 and 430, tablet 600–819.
**Send:**
- breakpoints: from which width the tablet layout, from which the laptop layout;
- what stretches and what is fixed (nav, map, right panel, gaps), in words or as a second frame at the far
  end of each range (e.g. 1000 and 1920 for the laptop);
- height: what happens with a window below 900 (laptop) and above 1180 (tablet).
_The developer picked the 1000 threshold alone and got it wrong (caught by review on 01.11)._

## 2. Markup without components
**Has:** `kypros-phone.html` holds 14,298 inline styles and about 10 classes (`btn`, `rise`, `cta`, `scr`…).
The nav, the «Here» button, the slider, the card are drawn anew on every screen.
**Missing:** a set of components that is the same on every screen.
**Send:** a component kit (phone, tablet and laptop nav, buttons, field, slider, tile, phrase card, screen
header, bottom sheet) with tokens (colors, radii, shadows, spacing, fonts) and states. HTML plus CSS classes
is fine.

## 3. Element states
**Missing:** pressed, keyboard focus, hover (laptop), disabled, loading, error, empty.
They do not show in a picture; the slider's focus was invented by the developer.
**Send:** every state for each component of item 2.

## 4. The live place map (screens 23–29)
**Has:** the map is a still picture: a given coast, given towns.
**Missing rules for a live map** (coast and towns come from data):
- town labels: how many at most, what to do when they overlap, which to hide;
- the scale for each radius 100 m…10 km;
- 028 «no land» does not tell «no land data» from «you are on open sea»: two states are needed;
- the map's loading state;
- night colors of sea and land exist only in HTML, there are no pictures (item 6).

## 5. The nav at each width and nested screens
- Tablet: the archive has an 80 px rail at the left on every screen. Is it the same at 600–819 and in landscape?
- Laptop 1440: «Me» opens its sub-pages in the right panel. How the place map looks there: no frame
  (now the phone drawing is shown there).
- Sub-screens (a table, a talk, a match's wait): does the nav stay or hide, at each width.

## 6. Pictures of one theme only
**Has:** HTML for 8 themes, PNG only for `kypros-day` (284 per width).
**Send:** PNGs of the night themes for at least 20 key screens, so night is checked by machine, not by eye.

## 7. Texts in English only
**Missing:** Russian texts (the app's main language). Russian runs longer: where it wraps, where it
truncates, where a button grows.
**Send:** Russian strings for all screens, or at least the wrapping rules for titles, buttons, captions.

## 8. Motion
**Has:** the `rise` class (appearance) and `:active` press.
**Missing:** transitions between screens, opening a sheet and a panel, the map's radius change: duration and curve.

## Priority
1 → 2 → 5 → 4 → 3 → 7 → 6 → 8. Without items 1 and 2 every width is built by guessing.

## Found along the way
- [QUESTION] **01.11, tablet: where it starts.** The tablet frame is 820, the app's old layout starts the tablet at 834.
  One number is needed: from which width the tablet layout applies (see item 1).
- [QUESTION] **01.11, tablet: top gap.** In the archive a screen starts at 62 px because a device status bar (9:41) is drawn
  on top. The app has none: it takes 16, as at the sides. Confirm.
- [QUESTION] **01.11, tablet: the 80 px rail.** Shown only beside the screens already taken from the archive (the place map);
  the other tablet screens are still the old layout. Items 1 and 2 are needed to move them without guessing.

- [QUESTION] **01.11, screen 22 «Your place»: what the archive lacks.** The app has «Place by QR» (a café or square code) and
  «paste a point from a map»; the archive has no tiles for them, QR is only named in the caption at the bottom. Needed: where they go.
- [QUESTION] **01.11, screen 22: what the app lacks.** The archive has «Recent» places and radius chips 300 m / 1 / 3 / 10 km right
  on the screen. Confirm recent places are kept on the device (how many).
- [RESOLVED] **01.11, screen 22 on the laptop — answered.** The narrow column is the intent: the archive gives it `max-width:560px`
  and the `data-form` mark. Done so. Left: is every form screen on the laptop a 560 column (see item 1)?
- [RESOLVED] **01.11, screen 22: «Where I am now».** The app does not take the place from the device: on a press it says it
  cannot yet. A decision is needed: ask the device for its location (and what to show when the person refuses) or drop the tile.
- [QUESTION] **01.11, screen 22: the row icon.** «Recent» in the archive has a clock. The app shows found cities and «more ways»
  (QR, a point) with the same row; a clock does not fit there. Icons for these rows are needed.
- [QUESTION] **01.11, screen 15 «Update» on the tablet and the laptop.** In the archive the window stands in the panel, with the nav
  visible at the left. In the app it is a window over everything: the nav is closed until the person picks «Later» or
  «Update». Confirm that is the intent, or should the nav stay usable.
- [QUESTION] **01.11, screens 14 and 15: «sosed» in the markup.** The archive writes the brand name as text. The app puts it in
  itself; there are no pictures for the second brand (neighbro).
- [QUESTION] **01.11, screens 17–20 «How it works»: «Skip» does not fit.** The archive gives «Skip» a 46 px width; the Russian
  «Пропустить» is cut to «Пропуст». The mockup's texts (phrases, «Eleni, 34», tables) are taken as is and translated
  by the developer. Needed: a link width by its text, or a shorter Russian word (see item 7).
- [QUESTION] **01.11, screen 283, the phrase tile: the «fades» bar.** In the archive each tile's bar has its own length (how
  long the phrase has left). The node does not send another person's remaining time, only a «fades soon» flag for
  the last 65 minutes (owner's decision of 23.09, §8.11). Now the bar is full, and short in the last hour. Needed:
  keep it so, drop the bar, or draw «fades soon» another way.
- [QUESTION] **01.11, screen 283: the phrase's font size.** The archive has 25 px up to ~20 characters, 21 px up to ~40,
  18 px longer. The owner's decision of 26.10 says 25 up to 40, 21 up to 100, 18 longer; kept so. One rule is needed.
- [QUESTION] **01.11, screen 283: what the archive's tile lacks.** The app's tile had a one-tap «like», the mode word and the
  discount badge. The archive's tile is only distance, likes and text; liking is on the open phrase. Done so. The
  discount tile stays the old one: its family in the archive is not found yet.
- [RESOLVED] **01.11, screen 283: the All / Neighbours / Activities / Things filters.** The composer (59) picks no topic and a
  phrase has none. Needed: where the topic comes from (picked when writing — then a composer frame with it; or the
  node decides) and what a person sees on an empty filter.

- [QUESTION] **01.11, screen 283: the head.** The archive's row has no search and no menu; search screen 43 is drawn, the way into it is not.
  The menu's «New table» and the line «about ten people nearby» are not drawn on this screen either. For now search and menu
  stand beside the archive's row, the line under it. Needed: where they go.
- [RESOLVED] **01.11, screen 283 at 1440: the Talks pane.** The archive's feed takes the whole width, four columns, no pane; the app keeps the
  pane at the right (the owner's 25.10 three panels were about 1920). Needed: does it stay at 1440.
- [QUESTION] **01.11, radius buttons at 1920.** Removed with the old head: screen 283 has none. The radius is picked in the sheet. Needed: confirm.
- [RESOLVED] **01.11, ad slot in the laptop nav.** The laptop file's screen 283 draws «ad slot, sidebar, 200×200» under the tabs.
  The app has none. Needed: is it shown, and what is in it when there is no ad.
- [QUESTION] **01.11, phone nav.** The current tab's mark is blue `#2f5a8f` on all 39 phone navs, terracotta on tablet and laptop.
  Taken as drawn. Needed: confirm the difference is meant.

- [QUESTION] **02.11, screen 42.** The line «We’ll also try again by ourselves» is not taken: that the app refetches the feed by itself is NOT VERIFIED. The app's title «No answer from the server» is wider than the archive's «No connection». Needed: is an auto retry wanted, and which words.

- [QUESTION] **02.11, screen 79.** The archive's row has no «plays alone» mark; such tables keep the old tile for now. Own tables and the wizard's preview are also still old. Game icons come from the app's set. That the node gives a table's distance «450 m» is NOT VERIFIED; the line has none. Needed: how to draw a «plays alone» table.

- [RESOLVED] **02.11, location: policy (owner).** We have no location detection: we do not ask the device for this data. A person types the place; we can only suggest by IP, and the person confirms or changes it. Do not draw «find my location» buttons or states, permission prompts or refusal screens. Screen 22's «Where I am now» tile does not fit this: replace or remove it (this decision closes the item above). The app dropped the tile on 02.11: «On the map» fills the row alone; the designer's answer is pending.

- [QUESTION] **02.11, screen 37: «talks opened».** The node does not give how many talks a phrase of one's own opened, and an inbox row has no phrase id. The tile is off; half of the row beside «liked it» stays empty. Needed: the node gives the count, or the tile goes and «liked it» takes the row.
- [RESOLVED] **02.11, screen 37: «Keep 2 h longer».** The node extends only a lost notice (by 3 days, up to 3 times), not a phrase. The button is off. Needed: a decision on extending a phrase; for now the row holds only «delete».
- [QUESTION] **02.11, screen 37: a long phrase.** The archive has 30 px on a short phrase; 128 characters are not drawn. Longer ones take the feed tile's sizes (21 and 18 px). Needed: a size rule.
- [RESOLVED] **02.11, screen 37 at 1440: the Talks panel.** The archive draws no panel beside this screen; the screen covers the app's. Needed: a decision together with the 1440 panel question above.
- [QUESTION] **02.11, screen 36: delete while checking.** The archive's tile has no cross; the tile opens screen 37, delete is there. Screen 37 with «checking» is not drawn in the archive: the label is the tile's, no fade line. Needed: a frame.
- [RESOLVED] **02.11, screen 262: the ad slot.** The empty feed with «Ad slot» is not shown: it is a reserve (the archive's brief says what to show is decided separately), and a dashed box is not for people. Screen 41's block in 262 is the same, checked by a test.

- [QUESTION] **02.11, screen 38: refused phrase.** «Nothing is counted against you» is left out: `refusePhrase` remembers the refusal. Only the generic reason is shown; the rules row is off, the composer has no route to the rules.
- [QUESTION] **02.11, screen 39: faded phrase.** «2 talks opened» and «unless you keep them» are not node data; «Say it again» is off: the composer takes no starting text.
- [QUESTION] **02.11, screen 63: offer exit.** «Nobody on sosed sees that you opened it» is not shown: NOT VERIFIED that it holds.
- [RESOLVED] **02.11, screens 267, 272: ad slot.** Not drawn, same as screen 262.
- [QUESTION] **02.11, screen 158: stopped offer.** Not wired: `cabinet/Offers.tsx` has no such state.
- [QUESTION] **02.11, screen 124: talk ended.** The app's words are kept, not the archive's.

- [QUESTION] **02.11, screen 44 at 820 and 390: empty pane.** The app has the pane on wide only: at 820 talks open the first one, a phone has no pane. Needed: whether to show the tablet frame when the talks list is empty.
- [QUESTION] **02.11, screen 44: words.** «Pick a talk on the left» replaces «Pick a phrase or a talk»: a phrase does not open in the app's pane. Tables keep the app's words; the archive's icon (a bubble) serves both zones. Needed: a frame for the tables pane.
- [QUESTION] **02.11, screen 46: toast.** The archive's bar is frozen at 64%; here it runs 5 s (`UNDO_HIDE_MS`). Screens 64 (feed with «Lost») and 261 (ad reserve) draw no toast and are not closed by this batch.
- [QUESTION] **02.11, screens 49, 50: «?» and words.** The «?» button is drawn but does nothing: no help screens yet. The title stays the app's «Я в деле» / «You're in on», not the archive's «Liked». «4 still here» shows only once the whole list is loaded. An offer's tile has no badge: the discount stands beside the distance.
- [QUESTION] **02.11, screens 49, 50 at 1440: the feed's head.** The list stands under the feed's head with the talks pane (decision of 28.10), not under 49's head with its back button. The hand in the head is pressed only by aria-pressed: the archive draws no state for it. At 820 and 390 the head is 49's.
- [QUESTION] **02.11, screen 49: skeleton.** The grey loading tiles stay old (`k-tile k-ghost`): the archive has no loading of this screen.

- [QUESTION] **02.11, screen 51: what is not drawn.** «?» is drawn but does nothing: no help screens yet. «fades in 3 h» became «Fades»/«Fades soon»: the node gives only `soon`. At 1440 the feed beside it is not dimmed (55 % in the archive). «Like sent…» is the app's word (`web.card.liked`), not the archive's. A third chip was added: the phrase's language when it differs (not in the archive). Needed: a decision on the chip.
- [QUESTION] **02.11, screen 51: «more nearby» on the tablet.** The list under a phrase's card is gone: the archive has none.
- [QUESTION] **02.11, screen 52: the name.** «Eleni, 34»: the node's talks give a name and no age; only the name is shown. The button says the app's «Talk», not «Open talk». Reopening an already matched phrase shows screen 51, not 52: the card does not know of the match.
- [QUESTION] **02.11, screen 53: when the sheet shows.** Pressing the hand opens it, as the archive draws; before, «Write a phrase» stood on the card at once. `crowd.mjs` line 333 counts `need-say` on the open card (`p.need`), now 0; nothing reads that value, and the crowd's `card-need` shot shows the card without the sheet. `scripts/flow` was not edited in this batch.
- [QUESTION] **02.11, screen 54: words and panels.** «Report» stays «report as illegal» and «Block» stays «Block the author»: the app's words (an Art. 16 DSA notice). «Report» and «Block» still open the old panels (`k-stack`, `k-field`) until map rows 57 and 8 (screen 56), so `.k-sheet-title`, `.k-two`, `.k-check` were not removed.
- [RESOLVED] **02.11, an offer's card.** Taken from family 62 on 02.11.
- [QUESTION] **02.11, two icons one token cannot tell apart.** Screens 46 and 79: the same icon tag with the same parent style has two colors in some themes of the archive; the app shows the more frequent. List: `python3 -I scripts/design/nd4-extract.py --colors`. In the same list, places a theme's file does not draw (a mark's dot, a card's section): the app draws them with the color that value has elsewhere in that theme.

- [RESOLVED] **02.11, owner's decisions.** Filters of screen 283: the author picks the topic in the composer; a composer frame with the choice is needed from the designer. «Talks» panel at 1440: as in the archive, no panel, panel from 1920. «Keep 2 h longer» of screen 37: not given, no button. Search and menu of screen 283: stay next to the row. Ad screens 261, 262, 263, 267, 271, 272: behind a flag, not visible to people. Screen 44: wide only. Screen 52 after a reload: the node gives the match.

- [QUESTION] **02.11, screen 62: the offer's hand.** The archive's «Say it with this offer» opens composing, as drawn; the old «I'm in» on an offer is gone. How a phrase is tied to the offer is not drawn and the node has no such link: the composer opens empty. Needed: what the button means. The card has no «more nearby» any more. The offer's tile in the feed stays old: no family of it in the archive.
- [QUESTION] **02.11, screen 52: reopening.** Reopening a matched phrase now shows 52: the node gives `match_id` on the card (replaces that part of the line above). «Talk» opens the talks list, not that talk. Needed: confirm or open the talk itself.
- [QUESTION] **02.11, ads behind the flag.** `VITE_ADS` off: no slots. On: the slot carries the archive's annotation words as drawn, and the sponsored tile (261) a sample text. Needed: real words before the flag is ever on.
- [QUESTION] **02.11, screen 283 at 390: the quiet label.** The «quiet» line stands under the head: not drawn so in the archive. Needed: its place.
- [QUESTION] **02.11, screens 49, 50 at 1440: the rail.** The rail covers the title of the likes list. Developer's defect or layout gap: to be measured when this family is next opened.

_(grows)_
- [RESOLVED 02.11] Screen 62: the venue's promo code is shown in the card's terms line. The archive has no promo code; a drawing is needed if the terms line does not suit.
- [RESOLVED 02.11] Screen 62: «No discount given» is the third row of the «…» menu on a venue's offer (screen 54) and opens the report page `report.html` with the kind and id; the e-mail there is optional, without it the person gets a code. The archive has no such row; the icon stays from block.
- [QUESTION] `report.html` is written for illegal content and in English: does «no discount given» need its own text? Today the page itself says a refused discount is filed from the offer and goes to a different place, and promises that a person reads every report.
- [RESOLVED 02.11] Screen 63: the exit opens in the same tab; direct `/o/…` links stay without the report button, no PIN and no anonymous report.
- [QUESTION 06.11] Screens 11–13 (moving here): the archive draws a 5-digit code on a digit keypad and «the same 4 pictures» to compare; the move protocol gives a 9-character code of letters and digits (depth/core/move_flow.ts:16 MOVE_CODE_LENGTH) and 4 check characters. Either the drawing takes 9 cells and a letter keyboard with characters to compare, or the protocol changes (shorter code, pictures) — a protocol change touches the web, depth and the node. The screens stay on the app's own drawing (Arrival.tsx) until then.
