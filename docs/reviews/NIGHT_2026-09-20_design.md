# Night 2026-09-19/20 — storefront characters (A) and depth terminal screens (B)

Owner's request (19.09.2026 23:30): "Нужно сделать дизайн и для соседа и для нейбро. Так чтобы было интересно и отличимо. А так же надо экраны для терминальной версии. Если есть вопросы, то решай кворумом." Run as a self-paced `/loop` until 10:00. No commits, no pushes.

**Quorum:** three independent agents per fork, each without the others' output; majority wins; raw output is kept here unedited, the lead's check goes next to it.

## Log

### 23:45 · A2, experiment: can a brand own the corner radius
Probe `scratchpad/rx/probe.mjs` in `panel-tests-runner` (Chromium of the sheet renderer), a 100×100 black rect on white, `rx="0"` as attribute, corner pixel (2,2):
- attribute only → `rx=0px`, pixel `0,0,0` (square — the control);
- `:root{--r:40px} .c{rx:var(--r)}` → `rx=40px`, pixel `255,255,255` (rounded);
- the variable set on an ancestor group class `.k{--r:40px}` → `rx=40px`, pixel white.
**VERIFIED:** CSS `rx` from a variable overrides the attribute geometrically. Shape can be a brand token: the kit keeps its literal `rx` as the fallback (the ratchet still reads it) and brand classes override it. No second kit needed. The first run of the probe was invalid (body margin 8 px put the pixel outside the rect — the control came out white); fixed and rerun.

### 00:10 · A1, the quorum on the storefronts' characters
Three authors, each from its own angle and without the others' output: type (`a5e50ca`), shape and material (`a47d0d3`), rhythm and voice (`a09cb8b`). Their raw briefs are in the session transcript; here is what the majority settled, axis by axis.

**Agreed 3 of 3:** sosed dark by default, terracotta accent, Golos Text as body; neighbro light by default, Manrope as body; sosed strokes 2 px, neighbro 1.5 px.
**Agreed 2 of 3:** sosed tight shape — radii {0,4,8,13}, a 1 px border, no shadow; neighbro rounded — cards 24, pills 999, no borders, a soft shadow; neighbro accent sea blue with the landing's gold as the second; neighbro display Commissioner; neighbro signature — a line of light along the card's top edge, as long as the life left.

**Two axes had no majority and went to a vote (each author voted once, including against their own proposal):**
- *sosed display face:* Oswald 2 (`a5e50ca`, `a09cb8b`), Rubik 1 (`a47d0d3`). Unbounded got none: it is neighbro's landing face today, and moving it would blur the two. **Oswald 600/700, uppercase, headers only.**
- *sosed signature:* door tag 2 (`a5e50ca`, `a47d0d3`), tear-off dashed edge 1 (`a09cb8b`). **The door tag**, a square tag in the card's corner.

**Lead's corrections on top of the vote:**
- The tag must not show another person's remaining time as a number (decided 2026-09-15, `sosed.place/docs/23-*_RU.md:16`). So: a number only on your own phrase; on someone else's the tag is empty until the last 65 minutes, then it says «скоро» in the accent. In the kit the tag draws only when it has something to say (`data-if="tag"`).
- The vote put the tag in the bottom-right corner; in the render it ran into the like row. Moved to the top-right, where nothing stands.
- The fonts' coverage was NOT VERIFIED by two authors; **VERIFIED by me** against Google's own CSS: Oswald has Cyrillic, Commissioner and Manrope have Cyrillic and Greek. All three are now self-hosted in `panel/design/fonts`.
- Voice and wording are out of this brief: the screens are mirrored word for word between the storefronts, and the strings belong to the product docs, not to the character.

### 00:40 · A2–A3, what was built
- `scripts/design-palettes.py`: schemes `.k-neighbro-sea` and `.k-neighbro-sea-light`. 18 schemes, 96 pairs, none below the bar. Gold as text on white does not reach 4.5, and the generator darkened it to `#8f722e` on its own — the third author had named exactly this risk.
- `panel/design/kit/tokens.css`: the brand classes `.b-sosed` and `.b-neighbro` — faces, `rx` through CSS, border against shadow, and the signatures. Without a brand class nothing applies: the renders of sheets 03 and 19 are **identical to the pixel** before and after the kit edit.
- `panel/design/kit/components.svg`: tags `k-card` (11), `k-ctl` (4), `k-pill` (3), `k-chipr` (2), `k-head` (5), the two signatures in `card-phrase`; the five zone steps and the table's «сесть» became parameters, or the English column kept Russian words.
- `panel/design/sheets/screen-brands.svg`: 8 screens × 2 characters, 16 frames.
- `scripts/check-design-sheets.sh`: the generated palette block is skipped in the colour count — but only when it matches `kit/schemes.css` byte for byte, so a hand-edited block still counts. Two probes, 14 in total.

### 03:10 · B, the terminal screens and their gate
- `panel/design/sheets/screen-depth-term.svg`: 18 frames — every screen of `docs/depth-client_RU.md` §4.1–§4.11 and §4a, one narrow-terminal frame, three of them repeated on a light terminal. A character cell of 9×20 px: JetBrains Mono 15 px advances exactly 9, which is why 15 is the size.
- **Measured, not assumed:** the kit's mono face had no Cyrillic at all, so every Russian mono line in **every** sheet had been falling back to a proportional face (cell 8.26–8.74 instead of 9.00). Cyrillic and Greek subsets are now self-hosted, the Latin face is range-restricted, and the duplicate declarations that kept the new faces idle are gone. After the fix the cell is 9.00 on the sheets' own Cyrillic lines. This also made three lines on sheets 17 and 19 overflow — they had fitted only because the fallback was narrower; all three are corrected.
- `scripts/check-design-grid.mjs` + `.sh` + 6 probes: for every run inside `g.term` the column and the row must be whole, a declared `textLength` must equal the cells claimed, and an undeclared run must not draw wider. Wired into `check-all.sh`.
- The ratchet skips terminal sheets: their scale is the cell, not the product's seven type steps and radius set. With a probe.

### 04:20 · B, the review quorum on the terminal sheet
Two independent lenses: consistency with the spec (`a58410d`) and «does this behave like a real terminal» (`a089ee8`). Raw reports are in the session transcript.

**Closed after the spec lens:** `[r] report` added to the chat's key row (§4.8 lists it for a chat); the sticker line is spoken by this conversation's Аня, not by «соседка» copied from the §4a illustration; the narrow frame now draws at its real 44 columns, wraps on words instead of hyphenating, and shows the terminal's own warning; `me` gained the row that leads to `depth pin · reissue · reset`; the composer no longer promises «через пару секунд» and says «проверяется»; the offer card keeps the sentence about blocking and complaining; the table claims only what §4.9 claims.

**Closed after the terminal lens:**
- 🔴 **Every ambiguous-width glyph is gone.** `─ ♥ ● ○ ▋ → ← … — › ‹ ⊞ ₪ ✓` are East-Asian-Width A: a terminal with `ambiguous=wide` gives them two cells and every column to their right slides. The sheet is ASCII now. **The gate now measures this** — it was blind to it, because the width branch only ran when `textLength` was absent, and the generator emits `textLength` on every run.
- The cursor is a drawn cell, not a printed block: a printed one copies into the buffer and a screen reader calls it «left five eighths block».
- One glyph, one role: `(*)`/`( )` for a radio, `*` only for «new», `>` for a prompt.
- Every screen says how to leave it.
- The sheet states that the colours belong to the terminal, not to us.

**Fixed in the spec itself** (both languages): the composer's mode triple was «один / вдвоём / компанией» while the whole product says «один / компания / туса»; the counters said 86/128 and 50/128 over strings of 40 and 48 characters.

**Left for the owner — not decided by me:**
1. The real client must not repaint the terminal's background and should take the foreground from SGR 39, choosing dark or light from OSC 11 / COLORFGBG. Measured by the lens: our `#f0e7dc` on solarized-light is 1.13:1, and the light frames' `#1c140d` on solarized-dark is 1.21:1. This is a decision about the client, and `docs/depth-client_RU.md` says nothing about it.
2. `td` (rules) is 3.53:1 on the light ground — below 4.5, fine for rules, a call to make.
3. The spec's ASCII art still uses the wide glyphs the sheet just dropped. Either the spec follows the sheet, or the sheet is wrong — I did not touch §4's code blocks beyond the two fixes above.

### 06:30 · What is left uncommitted, and how it splits
Nothing was committed or pushed (the owner's standing rule). Proposed split, for the morning:

**xor.ad — five commits**
1. *Gates:* `check-design-text.mjs` (text inside its own block, text on an icon), `check-design-spacing.mjs` (app-kit, a covered button, a sheet with no buttons, the bottom edge), `check-design-sheets.sh` (the generated palette block, terminal sheets), the new `check-design-grid.mjs/.sh`, their four probe files, `check-all.sh`, and the lowered ratchet baseline.
2. *Kit:* `components.svg` (brand tags, the two signatures, the word slot, parameterised zone steps and «сесть»), `tokens.css` (the Cyrillic and Greek mono subsets, the brand classes and faces), `schemes.css` + `design-palettes.py` (the neighbro sea scheme), the font files in `panel/design/fonts`.
3. *Sheets:* every `sheets/*.svg` touched plus their built twins — the 15 text-gate fixes, the complaint button, «один» on the like line, and the three lines that only fitted while the mono fell back.
4. *Place QR:* `protocol_{RU,EN}` §4.2, `test-map_{RU,EN}` §25, the sheet `screen-26-place-qr.svg`, `PANEL_2026-09-19_place-qr.md`.
5. *The night:* `screen-brands.svg`, `screen-depth-term.svg`, `design-system-app_{RU,EN}` (the two new sections), `depth-client_{RU,EN}` (the mode triple and the counters), this log, the facts registries.

**sosed.place — one commit:** screen 26 and the three cross-references (00, 03, 04), both languages.
**neighbro.place — one commit:** the same files, verbatim copies.

**Not mine, left alone:** `sosed.place/design/sosed-notice-*.pdf/svg`, `sosed-poster-a5-notice-ru.svg`, `neighbro.place/design/neighbro-poster-a5-cyprus.svg`, `neighbro-sticker-70mm-cyprus.svg` — untracked poster files from earlier work. They are in no commit above.

**Gates at the time of writing:** `check-all.sh --with-tests` — 45 passed, 0 failed. Sheets: 17, frames 201 phone + 18 terminal, captions 3446, buttons 314, grid rows 435.

### 02:30 · Second pass: what the eye caught that the gates did not
- **The text gate was blind to a stroked icon.** On the new stress frame the uppercase header «Александруполис · рядом десятки» ran 20 px under the filter icon, and the gate said nothing: it probed one point at the glyph's centre, and an icon drawn with strokes is hollow there, so the probe fell through to the text beneath. It now samples nine points and accepts a glyph drawn above the text. The defect is real and measured (overlap 20×20 px); after the fix the gate names it and finds no false positive on the other 202 frames. Probes: 7, still green.
- **The rule it exposed** is now written down (`design-system-app_{RU,EN}`, the feed header row): a long place name truncates with an ellipsis and never runs under the filter icon.
- **A stress frame was added to the brand sheet** — the same long German and Russian lines in both characters, because Oswald and Commissioner carry other metrics than Golos. It immediately caught a phrase line overflowing its card in both columns; the lines were rewrapped.
- **The depth spec gained the glyph rule** (§4, both languages): only unambiguous-width glyphs are printed, the cursor belongs to the terminal, and the ASCII set is named. The §4 examples are still drawn with the old glyphs — that rewrite stays the owner's call.

### 03:30 · Each character in its second theme
The brand sheet gained a row: sosed on paper (`k-light b-sosed`) and neighbro at night (`k-neighbro-sea b-neighbro`). Both signatures survive the swap — the 1 px border carries sosed on a light ground, the line of light carries neighbro on a dark one — and the ratchet did not grow. 20 frames, 324 captions, 22 buttons, all gates green.

### 07:40 · Owner's three decisions on depth, and a correction to my own rule
1. **The colours belong to the terminal.** The client paints no background, prints in the default foreground (`SGR 39`), takes accents from the terminal's 16 colours, and reads dark or light from `OSC 11` with a `--theme` override. Written into `depth-client_{RU,EN}` §4. The price is named: the product's terracotta is not recognisable in a terminal.
2. **`border-control` stays at 3.53 on the light ground.** The 3.0 bar is the one for graphics and control outlines (WCAG 1.4.11), and a rule meets it. Recomputed by me: 3.53 light, 4.10 dark.
3. **The §4 examples are redrawn in ASCII** — 30 blocks, both languages, by the same mapping the sheet uses; the slider's handle became `|` (it is not a radio), the device block's column was re-aligned and one key row split, and the box-drawing of the storage tree became `+`/`|`. Measured after: no line over 80 columns, no wide glyph left.

**🔴 And a correction to what I wrote at 04:20.** The rule «печатаем только знаки однозначной ширины» is wrong as stated: by UAX #11 **Cyrillic itself is East-Asian-Width A**. Counted, not assumed: the Russian spec's examples hold 3242 Cyrillic letters against 43 other ambiguous glyphs. A Russian client cannot avoid the class, so the rule has two halves instead: the client measures column widths with the same `wcwidth` and the same `ambiguous` mode as the terminal, and the *structure* — rules, markers, cursor — is ASCII so its width does not also depend on the font's coverage. The specs and the design system now say this; the gate is unchanged, since what it actually enforces is the second half.
