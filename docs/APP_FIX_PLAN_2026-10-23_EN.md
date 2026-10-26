# App fix plan, 23.10.2026 (rev. 2, after three lenses)

The owner approved the plan with /go on 23.10.2026 and asked to save it and run it through lenses. What the lenses found and what changed because of them is at the end.

**Scope:** the new shell `app/`, both brands, branch `release/1.0.0`.
**Order:** sosed to the end (steps 0–8), then neighbro (step 9), then the final run (step 10).

**How we use the stand:**
- One runner at a time. `scripts/up-app.sh` removes the `xor-local-app` container on start, and port 5174 is shared by every measure, so no agent runs on the stand in parallel.
- Within a group of fixes, the measure covers only the changed screens. The full measure runs at the end of each group and in step 10.

## Why this plan

On 23.10 the owner opened three screens at width 1920 and found three defects that every measure had passed:

- "Me" is clipped: the name card, the right column of rows, and a horizontal scroll;
- the left rail is gone on the "Me" sub-screens ("Blocked", "Place");
- "Place" is still two empty fields.

The measures counted only overlapping blocks. They did not look for clipping, scrolling or missing navigation, and nobody looked at the screens themselves.

## Steps

| # | What | Files | Check |
|---|---|---|---|
| 0 | Failure line | `~/.claude/failures.md` via `brain ledger-add` | **done**: line #342 |
| 1 | Stop the partial-screens agent | — | **done**, see below. Its 12 files are kept; the walk in step 4 judges them. A copy of the tree is in scratchpad `partial-agent/tree-15-20.tgz`. check-app GREEN, unit 192 of 192 |
| 2 | Screen snapshot in SVG from the DOM: blocks, text, clipping, scroll, icons | `scripts/design/snap-svg.mjs`, `scripts/snap-svg.sh` | the SVG of "Me" @1920 shows the clipped name; the SVG of "Blocked" @1920 has no `nav` |
| 3 | The measure catches clipping, scroll and missing navigation (this was step 7) | `scripts/design/measure-app-overlap.mjs` | on today's code it goes red exactly on "Me" @1920, "Blocked" @1920 and "Place" @1920 |
| 4 | Walk sosed: every screen and state (empty, loading, error, data, long text) at 390/834/1440/1920, including the games inside a match (11 `w3_table-*` sheets and `w3_chat-game`) and the advertiser cabinet. Each screen is checked against the 12 points and against its sheet (`sheet-geometry.mjs`). The wizard is marked "not built, step `6h`", not as a defect | `docs/reviews/APP_WALK_2026-10-23_RU.md`, `_EN.md`, one table row per defect: `\| screen \| width \| point \| what \| sheet \|` | the owner's three defects are in the list |
| 5 | The list goes to the owner: groups by cause, with counts. Then straight on | — | the count in the report equals `grep -c '^| '` over the file |
| 6 | Fix sosed by group: a) navigation on sub-screens and the wide layout; b) clipping and scroll; c) texts; d) screens; e) place (see below); f) games inside a match; g) advertiser cabinet; h) wizard wizard-1..5 from its sheets (first entry, skip, replay from "Me") | `app/tokens/wide.css`, `app/src/screens/**`, `app/src/i18n.ts`; the wizard in `app/src/screens/wizard/` | per group: a measure of the changed screens, SVG snapshots of what was fixed, walk rows marked "fixed"; a full measure at the end of the group. For h: unit red → green, and the map recount by script (`yes` in the status column of `docs/APP_MAP_EN.md`) goes from 71 to 76 |
| 7 | Live runs on the stand node. Path 1: registration → place → feed → like → match → chat → game in the chat → table → "Me" → reissue. Path 2, separate: restore by code (`/recovery/claim` last, because of the limit). Cabinet: sign-in by the link from mailpit, then an offer. A new identity on every run | scripts in scratchpad | every step prints its line; at most two runs; on a 429, stop and report |
| 8 | Sosed summary: what was fixed, what is left | walk files | every walk row says "fixed" or "left: why" |
| 9 | neighbro in app. The lens showed that `scripts/design/neighbro-sheets.py` covers only 10 screens at 390, and the new design's sheets exist only for sosed. So: a) neighbro sheets for the new screens are generated from the sosed sheets with the neighbro theme (`scripts/design/neighbro-themes.py`, `themes-css.py`); shrunk copies go to the owner. This is the look, not a product fork, so the work does not wait for an answer; b) the brand: `app/vite.config.ts:101-103` (now pinned to `"sosed"`) and `app/src/brands/neighbro/`; c) the stand: `scripts/up-app.sh neighbro` (needs the web stand `xor-local-neighbro`) | as named | measure and SVG walk on neighbro against its sheets; path 1 from step 7 on the neighbro node |
| 10 | Final: `measure-app-overlap.sh` for both brands, `check-app.sh`, `run-app-unit-tests.sh`, `run-e2e-paths.sh` for both brands, and the walk again | — | every command green; every walk row has "before / after" |

### The 12 points of the walk

1. A block runs past the edge of its panel or is clipped.
2. Horizontal scroll.
3. No navigation.
4. "Back" or the title is out of place.
5. Blocks overlap.
6. Empty fields that mean nothing; raw data on screen (coordinates, ids, dictionary keys).
7. Texts: not translated, cut where it matters, wrapping onto 3+ lines.
8. Width or gaps do not match the sheet.
9. The screen or state has no sheet.
10. A button under 44 px, or buttons stuck together.
11. Text contrast below 4.5:1.
12. An empty state does not say what to do.

When an SVG is not enough to judge, a raster image of about 400 px on the long side is taken.

## Place: our own map, no external services

**The map is ours, there are no services.** We have no external map service and will not have one.

**Data:**
- Cities: `web/src/geo/cities.json` (GeoNames cities15000, CC BY 4.0, 34,159 cities). It is already on the device.
- Land and sea: Natural Earth 1:10m, cut into 1°×1° tiles in `app/public/geo/<lat>_<lon>.json`.
  - The build script is `scripts/geo/build-land.sh`: mapshaper in a node container, `-clip bbox` and `-simplify`.
  - The source is downloaded once by hand. The result is committed, so no gate needs the network.

**An honest limit (lens):** Natural Earth 1:10m draws the coast in segments of about 0.5–1 km.
- At 3–10 km the shape of the coast is recognisable.
- At 100 m–1 km it is coarse, so at those radii the map shows only city dots and the circle, with no land layer.

**First sub-step.** Measure the size of a 3×3 load in a container.
- If it is over 100 KB, use the 1:50m coastline as one file instead of tiles.
- Sizes, licence and density near Limassol are NOT VERIFIED yet; this sub-step measures them.

**Screen** (sketch `docs/newsdesign/place-flow.svg`):
1. The line "Now: Rome", with a city search with suggestions under it.
2. A map we draw ourselves in SVG: land and sea, nearby cities with names, the marker and the radius circle. Drag and pinch work on Pointer Events with `touch-action: none`, with no libraries. The radius has 5 steps: 100 m, 300 m, 1 km, 3 km, 10 km. These are the same steps as `RADII` in `app/src/screens/feed-logic.ts:7` and on the node (`relay/node/src/routes/adv.ts:218`).
3. "Here" and the line "Near Limassol, 1 km". No coordinates on screen.

**Files:**
- `app/src/screens/me/Place.tsx`;
- the logic in `app/src/screens/me/place-map.ts`, with a test;
- the build script `scripts/geo/build-land.sh`.

**Node:** unchanged. The format `storePlace` saves (`depth/core/place.ts:9,22`) stays as it is.

**Privacy:**
- The device sends the exact point to our node.
- Other people see the centre snapped to a grid whose step equals the radius (`relay/node/src/lib/feed_geo.ts:28-36`). At 100 m that is a 100 m cell, not a house.

**Fallback:** if a tile did not load, the map shows city dots and the circle on a plain background.

**Check:**
- a unit test of the search, the radius steps and the tile choice: red on a break, then green;
- scenes in the measure;
- the SVG walk at 390 and 1920;
- live: two places give two different feeds.

## Not in the plan

- commit, push, deploy;
- node changes;
- external maps and geocoders.

## Lenses (23.10) and what changed

| Lens | Main findings | What changed |
|---|---|---|
| The owner's intent (sonnet) | every request is covered; the plan has no trace of the lenses; the place is more complex than "simple" | this section added; the place simplified: no land at small radii, a one-file fallback |
| Order and checks (sonnet) | 11 findings. The measure fix came after the fixes, so "red first" could not be shown (HIGH); there are no neighbro sheets for the new screens (HIGH); the wizard was walked before it was built; a shared stand port; checks without commands | the measure became step 3, before the walk; neighbro sheets are generated from the sosed sheets with its theme; the wizard is group `6h`; one runner at a time; commands and the count script are named |
| Map feasibility (opus) | CSP allows JSON from our own origin; the node needs no change; privacy holds through the grid snap; the claims "a few KB" and "zoom to 1 km" for 1:10m are unproven (defect) | measure sizes first, then choose; the limit is named; the build tool is mapshaper in Docker |
