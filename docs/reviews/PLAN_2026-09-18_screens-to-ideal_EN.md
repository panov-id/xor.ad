# Plan: the application's screens to the ideal, with periodic lensing

Drawn up 2026-09-18, 11:10, at the owner's word after the panel
`PANEL_2026-09-18_mockups-design.md`. The starting state is a measurement, not
memory: 14 SVG sheets for 22 of 25 screens (09, 11, 16 missing), the six-step type
scale and the surfaces applied this morning, motion decided; 111 "[text not set]"
placeholders on the sheets; zero open design items in the registry — because
design has not been filing them there yet.

## 1. What "ideal" means — measurably

The ideal is not taste but eight gates, each green by machine or by panel:

| # | Gate | Measured by | Now |
|---|---|---|---|
| I1 | Every element from the scale | script: type sizes ∈ {26, 20, 16, 14, 13, 11}, stroke width ∈ {1, 2}, radii ∈ {8, 13, pill, round}, colours ∈ tokens | sizes — yes (70 rules); strokes and radii — no |
| I2 | Not one placeholder | `grep -c 'текст не задан'` over the sheets = 0; each either got its text, its frame, or a registry row | 111 |
| I3 | Accessibility | text contrast ≥ 4.5, controls ≥ 3; targets ≥ 44 (board ≥ 24); focus drawn; timers by the "number and tone" rule | 9 accent texts, 40×20 tiles, chips at 32, no focus |
| I4 | The product's three signs in form | disappearance, the table, the radius have a plastic sign, not only a word | none |
| I5 | One accent per screen | accent-filled surfaces per frame ≤ 1, accent texts ≤ 3 | not counted |
| I6 | Three languages and two themes | EN/DE/HY frames of 03/08 with nothing "cut"; the light theme on every screen | 17 lines "tight", light only on 03/08/23 |
| I7 | Motion described for every screen | the screen description in `sosed.place/docs/NN-*` has a "Motion" section pointing at the catalogue | 0 of 25 |
| I8 | The panel finds nothing critical | the last panel: zero 🔴, 🟡 only with a recorded price | 4 🔴 this morning |

Gates I1–I3 and I5 are written as the script `scripts/check-design-sheets.sh` in
the first step and join `check-all.sh`; each with an injection that turns it red.

## 2. Trends 2026–2027 — what we take and what we do not

Sources are public overviews (links at the bottom). Only what matches the product's
character — "a quiet neighbour, warm terra, a dark room" — is taken; the rest is
named and rejected so that it does not surface again.

| Trend | Decision | With us |
|---|---|---|
| Calm interfaces, the end of "visual theatrics" | take | these are the panel's laws: nothing for decoration's sake |
| Expressive typography, oversized headings | take | display 26 on the phrase, empty states, confirmation sheets; a candidate to grow — phrase 23 to 30 |
| Dark theme as the first one | already | both storefronts are dark, the application starts from the same side |
| Micro-interactions as feedback, not ornament | take | the catalogue of 18 animations, "only what happened moves" |
| `prefers-reduced-motion` as a quality norm | take | an appearance is one frame, no cycles |
| Haptics together with the visual response | take pointwise | the like, sitting down at a table, "not allowed" — three events, no more; in a PWA `navigator.vibrate` with a fallback to nothing |
| Glass "surgically": only on a layer above content | take in one place | the filter sheet and its scrim; nowhere else |
| Large buttons, air | take | 44 by the rule, the primary button 48; `--s-6` between groups |
| Gesture navigation | partly | the swipe only in viewer 23 (`pointer: coarse`); not on feed cards (decision of 2026-08-27) |
| Neumorphism, 3D, parallax, AI personalisation of the look | do not take | against the law "no decoration for decoration's sake" and against the motion rule; personalising the look is screen 22 and only it |
| Voice interface | do not take | the product has no voice by design: a short phrase to a neighbour |

What makes a screen **inviting** inside this frame is not effects but four
things: scale (one large step per screen), warm light (panel lighter than bg, one
terracotta surface), the product's sign (the lifespan bar, the tabletop, the radius
ring), and a response to an action within 200 ms.

## 3. The lensing cycle

Lenses run not at the end but after every cluster of screens. One cycle:

1. **Edit** the cluster by the cut (sheets + descriptions in `sosed.place/docs` + tokens).
2. **Render** with `scripts/render-design-mockup.sh` and judge every sheet whole.
3. **Machine gates**: `check-design-sheets.sh`, pairing, the storefront mirror.
4. **Panel**: 3–5 lenses in parallel, the set per cluster (below), a refuter on
   every finding above "minor", the protocol `PANEL_<date>_<cluster>.md`.
5. **The owner's decisions** — by questionnaire, up to five, only forks.
6. **Edit by the decisions**, commit the cluster.

The lens set per cluster:

| Cluster | Mandatory | By subject |
|---|---|---|
| Feed and viewer | visual, UX, accessibility | typography (card density), i18n |
| Conversations and the game | UX, motion, accessibility | consistency (08 ↔ 18 ↔ 19) |
| The table | UX, accessibility, motion | game design (tempo, whose move is clear) |
| Entry and identity | UX, security (here it is by subject!), accessibility | copywriting |
| "Me" and settings | consistency, accessibility | visual |
| Support, documents, the offer | consistency, the legal lens | UX |
| The final pass | all five + a "fresh eye" without context | — |

Cadence: a cycle per cluster (≈ once per working day), plus a full pass of all
five lenses over all sheets at the end (step 9). What a panel finds and the same
cycle does not close goes to `docs/facts/open.tsv` with the area `design`, not to memory.

## 4. Steps

Ordered by what fires first; the estimate is hours of clean work.

| # | Step | Output | Gates | Cost |
|---|---|---|---|---|
| 0 | ~~Commit the morning~~ ✓ 2026-09-18 11:10 | the 19 files of the scale and surfaces in day55 | check-all | 0.1 h |
| 1 | ~~The sheet-gates script~~ ✓ 2026-09-18 11:17, `check-design-sheets.sh` | `check-design-sheets.sh`: I1, I2, I3 (contrast and targets from SVG), I5; with an injection; in check-all | itself | 2 h |
| 2 | ~~Accessibility and uniformity~~ ✓ 2026-09-18 11:17 (case — 6 pairs, the rest in the clusters) | 9 texts → `--accent-text`; hand tiles; chips at 44; the focus ring; seconds by the rule; label case; strokes 1/2; "seated" → "playing" | I1, I3 | 2.5 h |
| 3 | ~~The product's three signs~~ ✓ 2026-09-18 11:20, quorum | a 2 px lifespan bar without animation (03/07/08/23); a tabletop with the game's icon (03/19/25); the radius ring with a backing (03 filters/04) — SVG first, questions, then sheets | I4, panel "Feed" | 3 h |
| 4 | ~~Empty states and header/tab bar~~ ✓ 2026-09-18 11:24, quorum: the tab bar kept its underline | the eight splash icons as a set (11); display on empty states; a 56 header without a line; the tab bar — a filled icon instead of an underline | I1, panel "Me" | 2 h |
| 5 | Cluster "Feed and viewer" to zero placeholders — **the first cycle ran 2026-09-18 11:25–11:40** (`PANEL_2026-09-18_feed-cluster.md`): placeholders on the four sheets 17 → 0, the remainder in the protocol's cut (8 tasks) | 03, 23, 24, 25 + 09 (no sheet yet); accent ≤ 1 per frame; i18n 03 with nothing cut | I2 per cluster, I5, I6 in part, panel | 4 h |
| 6 | Cluster "Conversations and the game" — **the first cycle ran 2026-09-18 11:40–11:50** (`PANEL_2026-09-18_chat-cluster.md`, 3 lenses): placeholders in the frames of 06/07/08/10/18 — 0, nine forks by quorum, the two-player timers removed per 18:85; the remainder — 8 cut tasks, among them the 🔴 55 % fade | 06, 07, 08, 18: the frame "match accepted → conversation", losing typed text on 4003, whose move on the board, the piece's snap-back | I2, panel | 4 h |
| 7 | Cluster "The table" — **the first cycle ran 2026-09-18 11:52–11:58** (`PANEL_2026-09-18_table-cluster.md`, 3 lenses): placeholders on 19 — 0 (was 8), seven forks by quorum, targets at 44; the 'start the game' frame and the 🔴 fade are in the cut | 19 + the states sheet 11 (no sheet yet): the seating frame, re-seating (25), confirming the line-up by names, one's own move opens the board | I2, panel | 4 h |
| 8 | The remaining clusters — **"Entry and identity" ran its first cycle 2026-09-18 12:33–12:40** (`PANEL_2026-09-18_entry-cluster.md`, 4 lenses, 15 texts by quorum, placeholders 0); **"Support, documents, offer" — 2026-09-18 12:45–13:05** (`PANEL_2026-09-18_support-cluster.md`, 3 lenses, 8 forks by quorum, placeholders on 14/15/17 — 0, seven tasks in the cut); **"Me" — 2026-09-18 13:05–14:35** (`PANEL_2026-09-18_me-cluster.md`, 3 lenses, ten converged findings applied, placeholders on all 14 sheets — 0, seven tasks in the cut). Step 8 done for every cluster | 01/02/12/13 (the code large, the confirmation field above the fold), 10/20/21/22 (a segmented control for durations), 14/15/16/17 (support CTAs, stickers — no sheet yet) | I2, panel | 5 h |
| 9 | Motion for every screen | a "Motion" section in the 25 descriptions in `sosed.place/docs` pointing at the catalogue; a demo page of 6 animations in `panel/design/motion-demo.html` (Playwright checks durations and reduced-motion) | I7 | 3 h |
| 10 | Three languages and two themes | EN frames of every screen (the night brief §3), the light theme on every sheet, DE/HY stress with nothing cut | I6 | 4 h |
| 11 | The final panel and the freeze | all five lenses + a "fresh eye"; `design-system-app` gets the mark "v1, 2026-xx-xx"; the remainder cut into the registry | I8 | 2 h |

In total ≈ 36 hours of clean work; at 6–7 hours a day — six working days,
2026-09-19 to 2026-09-26, if the owner's forks close the same day.

## 5. What this plan does not do

- Application code. Except the motion demo page (step 9), needed as a measuring
  instrument, not as a product.
- New screens beyond the 25. A screen comes from a description in `sosed.place/docs`;
  no description — no sheet.
- The storefronts' tokens. The application diverges from them in values (surfaces),
  the names are shared; the storefronts are not touched.
- Trends marked "do not take" in the table of §2.

## 6. Risks named in advance

- 🟠 `--muted` on `--panel-2` holds with a margin of 0.01 — any change to `--panel-2`
  needs a recount. Gate I3 catches it.
- 🟠 Category labels at 16/600 after the scale are heavier than the card's text;
  settled at step 5 by eye: 14/600 as a second exception, or muted uppercase.
- 🟠 Sheets 09, 11, 16 are drawn from scratch — 1.5 h each on top of the estimates of
  steps 5, 7, 8, if the owner wants them in this plan.
- 🟠 The estimates are mine, with no measurement from past clusters; after step 5 the
  plan is recounted by the actual pace.

## Sources on trends

- [UX/UI design trends for 2026: calm interfaces, transparent AI and the end of visual theatrics — Envato](https://elements.envato.com/learn/ux-ui-design-trends)
- [Top Web Design Trends for 2026 — Figma](https://www.figma.com/resource-library/web-design-trends/)
- [Mobile App Design Trends 2026: UI Patterns — Muzli](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)
- [UI Design Direction 2026–2027 — Michal Malewicz](https://medium.com/@michalmalewicz/ui-design-direction-2026-2027-2b4b6eb88336)
- [Design trends for 2026-2027 — Icons8](https://icons8.com/blog/articles/design-trends-for-2027/)
- [Motion Design & Micro-Interactions in 2026 — Techqware](https://www.techqware.com/blog/motion-design-micro-interactions-what-users-expect)
- [How Micro-Interactions & Motion Design Improve User Experience in 2026 — Acodez](https://acodez.in/micro-interactions-motion-design/)
- [20 Web Design Trends in 2027 — WebFX](https://www.webfx.com/blog/web-design/web-design-trends/)
