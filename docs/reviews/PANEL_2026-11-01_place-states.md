# Panel 01.11.2026: place-map states 24-29, laptop nav and frame, sea ground

Subject: files changed after PANEL_2026-10-31_place-laptop.md (find -newer): scripts/design/nd4-extract.py,
nd4-extract.test.py, app/tokens/wide.css, app/tokens/nd4-kit.css, app/src/screens/me/Place.tsx, place-map.test.ts,
app/src/nd4/nav-laptop.gen.tsx, app/src/nd4/screens/place-map.gen.tsx, place-map-laptop.gen.tsx, place-map-tablet.gen.tsx.
Lenses: security (fable, all 10), correctness (sonnet, Place.tsx, place-map.test.ts, nd4-extract.py, nd4-extract.test.py,
nd4-kit.css, wide.css, plus kit.css and TabBar.tsx for context).
Lens coverage: 10 of 10 files (the generated .gen.tsx read by security only).
The rest of the 37-file uncommitted diff was covered by the 31.10 panel and is unchanged since.

## Findings and status

| # | Lens | File | Level | Finding | Status |
|---|---|---|---|---|---|
| C1 | correctness | Place.tsx:179 | high | laptop drawing chosen at main >= 1000, its frame and nav only from 1440 (nd4-kit.css @media, --bp-desktop): window 1000..1439 got a frameless laptop panel with the phone nav | VERIFIED by code; FIXED: laptop only with useMinWidth("--bp-desktop"); test, break red; live: 1200 → tablet, nav 0; 1440 → laptop, nav 1 |
| C2 | correctness | Place.tsx:232 | medium | Me pane at >= 1920 gets the tablet drawing (pane 680 wide), comment says phone; from about 2800 the pane could pass 1000 | open: with C1 the laptop drawing needs 1440 viewport and 1000 main; the pane case not measured |
| C3 | correctness | place-map.test.ts | medium | tests are source matches; no render of Place, no land-reset test | open |
| C4 | correctness | Place.tsx:76-86 | minor | old land stays while new tiles load | open |
| S1 | security | nd4-extract.py live_map_rules | minor | archive values written raw into css | FIXED: css_value rejects `{` `}` `@import` and non-data url(); test, break red |
| S2-S8 | security | gen files, Place.tsx, wide.css | - | not found (escaping, overlap, slider cover, slot markers) | - |

## Shots against the archive (day theme in the archive, our shots at night: the theme follows the sun)
- phone 024-029, tablet 024-029, laptop 024-029: texts match (3 km, 10 km, "around you", widened line).
- Fixed: the map had no sea ground (data-sea never set). Now land over sea from 3 km, as 024 and 026.
- Open: the tablet archive has an 80 px icon rail at the left on every screen; the app has none at 820.
- 028 "no land" in the archive is drawn without land data; the node has land, so the app shows sea there.

## Checks after fixes
nd4-extract.test.py OK; unit 371 of 371; check-app GREEN; e2e in the report.

## Second round 01.11: the tablet rail (nav-tablet.gen.tsx from kypros-tablet.html screen 23)
Files: scripts/design/nd4-extract.py, nd4-extract.test.py, app/src/nd4/nav-tablet.gen.tsx, app/src/shell/TabBar.tsx,
app/src/screens/me/Place.tsx, place-map.test.ts, app/tokens/nd4-kit.css. Lenses: security (fable, 5 files), correctness
(sonnet, 7 files). Lens coverage: 7 of 7.

| # | Lens | File | Level | Finding | Status |
|---|---|---|---|---|---|
| T1 | correctness | Place.tsx:176-184 | high | at 1920+ Me's pane (680) measured as tablet: tablet drawing + rail inside the pane, 100dvh overflows it | VERIFIED by code; FIXED: InPane → phone; test, break red; live 1920: in pane, width phone, main = pane 680×1048, rail 0 |
| T2 | correctness | nd4-extract.test.py:93-99 | medium | tablet nav/frame tests are substring checks; dropping onClick/onKeyDown/tabIndex would stay green | open |
| T3 | security | nav-tablet.gen.tsx | low | no aria-disabled for a tab that cannot open (phone bar has it) | open (same as C4 of 31.10) |
| T4 | security | TabBar.tsx:52-54 | low | without TabsContext a press is a silent no-op | open (same as the laptop Rail) |
| T5 | security | Place.tsx:244 | low | from Me the rail marks Feed current | open (same as the laptop) |
| - | both | overlay, archive text into code, wide.css clash at 834-1439 | - | not found | - |

Shots: 820 and 700, place map 023 and 024 beside the archive's tablet png: rail 80 at 16,16, screen from 112.

## Third round 01.11: the files no lens had read
Lens coverage of the whole uncommitted diff: 38 of 40 files (archive unpack and zip excluded); not read by a lens: the two panel reports themselves.

| # | Lens | File | Level | Finding | Status |
|---|---|---|---|---|---|
| L1 | sonnet | docs/newdesign4/LOST_SPOTS_EN.md:7, _RU.md:7 | medium | file:line refs drifted from code (feed.ts:111, App.tsx:104/212, report.ts:36) | open: file outside the session contract |
| L2 | sonnet | nav-laptop.test.ts:10-23 | low | source regex, 400-char slice | open |
| L3 | sonnet | LOST_SPOTS section 4 | low | first-person wording | open |
| - | sonnet | pairs MAP_CHANGES, BRIEF_REWORK, LOST_SPOTS; secrets | - | not found | - |

## Fourth round 01.11: screen 22 «Your place» (main view from kypros-* screen 22)
Files: scripts/design/nd4-extract.py, nd4-extract.test.py, app/src/nd4/screens/place{,-tablet,-laptop}.gen.tsx,
place-row{,-tablet,-laptop}.gen.tsx, app/src/screens/me/Place.tsx, place-map.test.ts, app/src/shell/entry-scene.test.ts,
app/src/i18n.ts, app/tokens/wide.css, app/tokens/nd4-kit.css. Lenses: security (fable, 13 files), correctness (sonnet, 11 files).
Lens coverage of the whole uncommitted diff: 45 of 47 files; not read by a lens: the two panel reports themselves.

| # | Lens | File | Level | Finding | Status |
|---|---|---|---|---|---|
| P1 | correctness | nd4-extract.py:59-63 | high | the archive's 1 km chip kept its lit inline look: 1 km always lit, two lit at 3/10 km | VERIFIED by code; FIXED: every chip takes the unlit 300 m look, lit only by [data-on]; test, break red |
| P2 | correctness | Place.tsx:290 | high | error and QR question only in a k-sr line, a sighted person sees nothing | VERIFIED by code; FIXED: shown in the archive's caption slot; test, break red |
| P3 | correctness | tests | medium | no render test of the main view | open |
| P4 | correctness | Place.tsx:249-257 | low | Enter does not take a pasted point; no «nothing found» | open, to the brief (empty state) |
| P5 | correctness | Place.tsx here() | low | chips set a radius, Done keeps only the centre | open (by design 15.10, shown not kept) |
| P6 | correctness | measure-app-w4.mjs:314,323 | low | still uses place-point | open |
| P7 | security | Place.tsx:51 | low | coarse tile key to the app's own host | not a defect; privacy note |
| - | security | gen files, search, pasted point, feed() fallback, i18n | - | not found | - |

Checks: nd4-extract.test.py OK; unit 372 of 372; check-app GREEN before P1/P2.
