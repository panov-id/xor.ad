# Panel 2026-10-31: screens 23–29 generated from the archive (nd4-extract)

Subject: scripts/design/nd4-extract.py and .test.py, app/src/nd4/screens/place-map.gen.tsx, app/tokens/nd4-kit.css,
app/src/screens/me/Place.tsx, app/src/screens/me/place-map.test.ts, app/src/main.tsx, app/tokens/nd4.css (36 hand rules
removed), scripts/check-app.sh, scripts/design/nd4-map.py and .test.py, docs/newdesign4/MAP_EN.md / MAP_RU.md.
Lenses: security (fable), correctness (opus). Lens coverage: 13 of 13 files of this piece. Not read by a lens: the
earlier uncommitted files of the tree (Feed.tsx, feed-logic.ts, feed.test.ts, i18n.ts, place-map.ts, GOALS, MAP_*,
map.edges), reviewed in PANEL_2026-10-31_material-hooks.md or older.

## Fixed, each with a check broken red and restored

| # | Lens | Finding | Level | Fix | Check |
|---|---|---|---|---|---|
| 1 | security | ⟦⟧⟪⟫ in archive text would become JSX code | important, latent (0 in the archive today) | render refuses a screen holding a marker | nd4-extract.test: marker refused |
| 2 | security | any *.gen.tsx with "generated from" anywhere opts out of the px gate, not tied to the generator | important | only line 1 counts; check-app runs nd4-extract.py --check | check-app GREEN with the new step |
| 3 | correctness | night map background lost the archive's color-mix with the sky | medium | per-theme rule with the whole fill from each theme file | test: amber night fill |
| 4 | correctness | slider focus invisible (input opacity 0) | medium | :focus-visible outline on the track, marked "not in the archive" | test: focus rule |
| 5 | correctness | fallback wrapped twice var(--kit-x, var(--kit-x, …)) | cosmetic | colorize colors an @hex slot once | test: wrapped once |
| 6 | correctness | no heading on the page; «?» labelled with the title | low | title role=heading level 1; «?» aria-hidden until the help tour exists | test: heading |

## Open, not fixed

- CTA keeps the archive's literal #fff and rgba(160,70,40,.8) glow: per theme not verified. Low.
- The CTA gradient (#d0714d, #b0563a) is a per-theme token, not derived from --accent: a changed accent leaves it. Low.
- Space fires on keydown on span role=button, a native button fires on keyup. Low.
- Lost vs the old view: EntryScene portal and the app.place.feed line on the map view; the radius name is aria-label only.
- MAP: "with an app file" 93 of 283 is an upper bound (id match by word, i18n.ts hits). Families other than place-map not
  checked against pictures.
- Gate fix 2 was not broken on purpose (no hand file with line-1 header tried).

Checks: nd4-extract.test 13/13, 3 fixes broken at once → 4 red, restored green; place-map.test broken twice (a class in
the view, the nd4-kit import) red, restored; app unit 369/369; check-app GREEN; nd4-map.test OK, --check rc 0.
