# Plan: sosed = prototype (26.10.2026)

Goal: `docs/GOALS_EN.md` §0, first block. Built after the owner's answers of 26.10 (questionnaire), passed through lenses (§9).

## 0. Owner's word, verbatim

- Me pages: «как в прототипе + код узла + карта проекта + ну как обычно» (as in the prototype + node code + project map + the usual way).
- Motion: «Прототип, старое удалить» (prototype, remove the old).
- Commits: «Локальные по вехам» (local, per milestone).
- Autonomy: «/go на всю цель» (/go for the whole goal).

Effect on the goal: item 7 narrows. The node is in where the Me pages need it; commits are local per milestone. neighbro, push, deploy stay out.

The answer «как в прототипе…» closes the Me talk (goal item 3, `GOALS_RU.md:12`); what each page does is in §1 by the prototype's tiles.

My reading of «код узла»: what the Me pages need and the node lacks. An empty cell = a tile with no route, or a route that does not return a field the tile shows.

My reading of «как обычно»: a test for each decision, a break check, the project map, review-panel, a commit per milestone.

## 1. Inventory at 26.10 23:20 (measured this turn)

- Prototype: 148 screens in `docs/newdesign/proto/*.html` (+ `index.json`, `tokens.css`).
- Prototype motion (README in `docs/newdesing2/sosed-plum-2026-10-25.zip`, lines 36–45): `--dur-0` 90 ms press, `--dur-1` 160 ms state change, `--dur-2` 240 ms tab / scrim, `--dur-3` 360 ms deeper/back, sheet, tiles staggered 28 ms, `--dur-ambient` 16 s; `--ease-out`, `--ease-spring`. 14 keyframes: badge, bothp, dotpop, drift, fadein, fadeout, float, hintp, rise, selpop, sheetdown, sheetup, tabpop, twinkle. Moments: windows of «Я тоже тут» light one by one (90 ms step), «Вы оба тут» popup with pulse, sticker flies with spring, life and turn rings. reduced-motion: durations 0.
- App: `app/tokens/kit.css` has only its own `k-spin`; `app/tokens/motion.css` has 0 `@keyframes`. The old ones run: `rise` ×16, `sheet-up` ×8, screen-up/down, under/unlayer, match-in/out, tile-in, press, shimmer, bubble-pop, typing-jump, spin (`shell/shell.css`, `screens/screens.css`, `screens/chat.css`).
- `app/src/main.tsx` imports 21 sheets, 17 of them old: sosed.gen, layout, me, talks, tables, cabinet, chat, legacy-bridge, nd-icons, wide, shell, screens, me/me, talks/talks, tables/tables, cabinet/cabinet, screens/chat.
- Me pages in the prototype are hubs: tiles over existing screens.
  - `me`: profile, visibility, security, step away, documents, about + tabs;
  - `me-profile`: name, age, theme, language;
  - `me-visibility`: age filter, hidden, blocked;
  - `me-security`: PIN, paper code, transfer, start over;
  - `me-restrict`: Me with a restriction banner.
- Node: name and age are taken by `relay/node/src/routes/profile.ts`; restrictions are given by `statements.ts` (art. 17 statements, `access_restricted` and others from `dsa.ts:149`).

## 2. Order and milestones

Each milestone ends with: unit all, `check-app`, `proto-extract.test.py` 8/8, crowd over the touched steps; green → **local commit** to `release/1.0.0`, no push.

**Motion is checked in every milestone M2–M7, not only M1:** every transition and moment on the milestone's screens gets a frame pair next to the prototype (`measure-app-motion.mjs`); the milestone check states N of M.

### M0. Record and baseline
1. Owner's word from §0 into `docs/GOALS_RU.md`/`_EN.md` §0 and `memory/goal-sosed-equals-prototype.md`. Check: diff matches §0.
2. unit, `check-app`, full crowd on the current tree (the last session's crowd result was not found). Check: ok of N in `summary.txt`.
3. Move the probe `proto-shot.mjs` from the last session's scratchpad to `scripts/design/proto-pairs.mjs`: app screen next to prototype screen, count N of 148; its test red under a break. First run = baseline.
4. Rewrite goal item 7 in `GOALS_RU/EN` per §0 (node for Me, local commits).
5. Fix red, if any. Commit M0 (~95 files of the last session).

### M1a. Entry, wizard, feed, card (already on kit — bring to pairs)
Entry (15): splash, splash-lang, register-1/2/2b/3, unlock, unlock-error, forget-confirm, locked, restore, arrival-1/2/3, loading. Wizard wizard-1…5. Nearby (18): feed* (7), radius, my-marks, my-marks-empty, card, card-in, card-both, card-need, card-more, block-confirm, composer, composer-refused. Check: pairs for these 38 screens plus motion.

### M1. Motion from the prototype
1. `app/tokens/motion.css`: `--dur-*`, `--ease-*` tokens and the 14 keyframes taken verbatim from the archive's `prototype/index.html` by an extractor added to `scripts/design/proto-extract.py` (no hand copy).
2. Deeper/back screen transition (shift by width, old screen goes 28% and darkens, 360 ms), tabs (fade + 98→100%, 240 ms), sheet on spring, tiles staggered 28 ms, press 90 ms — `shell/layers.tsx`, `kit.css`.
3. Moments: twinkle windows in «Я тоже тут», bothp/badge, dotpop of PIN dots, drift clouds, rings.
4. Before any deletion: the M0 commit and a copy in the scratchpad. `css-unused.py` reports classes built at runtime separately (7 such `className={`…${` in `app/src`) and never deletes them. After each deletion: pairs over all screens, not only touched ones, and a grep that a removed keyframe has 0 `animation:` references.
5. Remove old keyframes (shell.css, screens.css, chat.css) and their rules; `css-unused.py`.
6. reduced-motion: all durations 0, background still; checked by a frame run with `prefers-reduced-motion`.
7. Check: extend the existing `scripts/design/measure-app-motion.mjs`; it takes frames at 0/90/240/360 ms for each transition and compares with the prototype in the same browser; the test reads the animation list from the prototype, so a new or forgotten one fails (rule 39); coverage N of 14 and M of transitions; red under a break (one animation removed).

### M2. Me pages with the node
1. Project map: `scripts/project-map.py` over `screens/me/*` and node routes `profile`, `statements`, `blocks`, `hidden`, `transfer`, `identity`, `away`; each prototype tile linked to a route. Check: table "tile → screen → route" with no empty cell.
   **Result 26.10:** name and age → EditName → `PATCH /identities/me`; filter → AgeFilter → same; hidden → Hidden → `GET/DELETE /hidden`; blocked → Blocked → `GET/DELETE /blocks`; reset → Reset → `POST /identities/close`; step away → StepAway → `POST /away`; documents → Statements → `GET /statements`; theme, language, place, QR need no node. One empty cell: the restriction banner. A live bug found too: `Me.tsx` calls `client.statements()` on every open, which records statements as delivered. Fix: a `restricted` field in `GET /identities/me` computed by `EXISTS` with no write; `Me.tsx` no longer calls `statements()`.
2. Screens on prototype markup and `kit.css`: `Me.tsx` hub; `MeProfile`, `MeVisibility`, `MeSecurity` new; `me-restrict` banner when `statements` holds a standing restriction. Paths `/me/profile`, `/me/visibility`, `/me/security` in `router.ts`.
3. Node code only where the map shows an empty cell. Known candidate: a "standing restriction" flag so the banner does not pull the whole list. Security lens requirements: (a) the flag reads `EXISTS` with no UPDATE; a node test checks `delivered_at` stays NULL after the call (`statements.ts:111-116` stamps delivery on all it returns); (b) the banner predicate (owner 26.10, questionnaire): only `access_restricted` with `until` null or in the future, tested over all 4 kinds from `dsa.ts:149`; (c) `allowSteppedAway: true`, checked in `run-relay-tests.sh` with a stepped-away session; (d) the answer's key set is pinned by a test, no notifier data. Age in me-profile: 20→21 asks once, 21→20 refused with the right line (`profile.ts:151`), filter re-read after save — a crowd step. Danger tiles of me-security: reset needs the full PIN and `aria-disabled` until ready, wrong PIN shows attempts left, motion never moves focus onto a danger CTA. The usual way: node test, `run-relay-database-tests.sh` whole, `run-relay-tests.sh`, web e2e of both brands (memory: web-e2e-with-node-change), the node fake repeats the real one.
4. Remaining Me screens on kit: Place, PlaceQr, Theme, lang, AgeFilter, Statements, Legal, departure-1/2/3, departure-done, away, EditName, edit-age, Hidden, Blocked, ChangePin, Reissue, StepAway, Reset. Remove `me.css` and `screens/me/me.css`.
5. Check: shot pairs next to the prototype for all `me*` screens; crowd Me steps ok.

### M3. Talks
Inbox, inbox-empty, chat (10 states), notice, notice-sent; «Вы оба тут» lives in card-both (M1a). Remove `talks.css` (both), `chat.css` (both). Check: shot pairs, crowd talks ok.

### M4. Tables and games
Tables (5 states), table (9), new-table 1–3, 12 games with their states (39 screens). Remove `tables.css` (both). Boards on the prototype's art (`proto-art.gen.ts`). Check: shot pairs, crowd 12 of 12 games ok.

### M5. Cabinet and offers
cab-* (8), offer* (5), composer-offer. Remove `cabinet.css` (both).

### M6. Zero old
`main.tsx` imports only fonts, themes, kit, motion. Remove layout, legacy-bridge, wide (live parts → M7 layout), sosed.gen, nd-icons, screens, shell.css (live parts → kit), `shell/icons.ts`, `nd-icons.gen.ts`. Fix scripts broken by renames: `measure-app*.mjs`, `back-walk.mjs`, `snap-svg.mjs`. Check: grep of old classes in `app/src` = 0, `css-unused.py` = 0.

### M7. Wide 1440 and 1920
From the archives' SVG sheets (1440: 109 sheets; 1920: 148 incl. 39 games); 834 = phone layout with the rail, checked by a shot at 834 over all screens with no overlaps (`measure-app-overlap.mjs`). A screen with no wide sheet (e.g. me-profile): phone layout with the rail, no question. Check: `measure-app-wide.mjs`, pairs next to SVG for all sheets, N of M.

### M8. Scripts and tests
Tests for `css-drop-class.py`, `css-unused.py`, `class-rename.py`, each red under a break.

### M9. Final
review-panel (security on fable), 0 critical/important; then the whole goal check §0.6 and a pass against GOALS; shot pairs 148 of 148, motion pairs N of M, wide N of M stated separately. Report "goal reached" with numbers.

## 3. When I stop

Money, keys, deleting others' work, the 8-hour rule (handoff to memory; the new session continues at once from the same milestone). Questionnaire only for a product fork that neither the prototype nor the README answers.

## 4. Not doing

neighbro, push, deploy, CI edits, node beyond what the Me pages need.

## 9. Lenses (26.10, three agents, read only)

Second reader (sonnet): the plan matches the task.

| Lens | Critical | Important | Minor | Applied |
|---|---|---|---|---|
| Owner understanding (sonnet) | 1 | 5 | 4 | motion in every milestone; Me talk closed; readings of «код узла» and «как обычно»; goal item 7; wide without a sheet; three final numbers; continue after handoff |
| Completeness (sonnet) | 2 | 5 | 6 | M1a: 38 entry, wizard, feed screens; pairs script N of 148 in M0; lang, departure, away in M2; match removed; numbers: 21 imports (17 old), chat 10, games 12 (39 screens), 1920 = 148; wide.css in M6; 834 check |
| Risk and security (fable) | 2 | 5 | 3 | flag without delivery write; banner predicate; stepped-away; key set; age 21; danger tiles; deletion after commit and copy, runtime classes; reduced-motion; away in the map |

Numbers checked by commands this turn: 21 CSS imports in `main.tsx`, 10 chat* files, no match.html, `statements.ts:111-116` is the delivered_at UPDATE.

Not verified: `proto-extract.test.py` 8 of 8 — from the handoff, run in M0.
