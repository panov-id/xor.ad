# Panel 2026-10-02 · comic-web

Range: `git diff 1ac19904..d373afde` (branch comic-web, 241 files, +7943/−5220).
Lenses: security, consistency, correctness/operations. Gates before panel: check-all 19/0, check-web-design 36 frames, brand-sheets 4 themes — all exit 0.

## Raw · security lens (verbatim summary of agent report)

1. Design defect: deferred neighbro like is sent after hide/block — `web/src/screens/logic/useDeferredLike.ts:46` cleanup fires pending like on unmount; `web/src/brands/neighbro/index.tsx:173` hide disabled only by `busy`; same for block in `web/src/screens/Card.tsx` CardExtras. Fix: `deferred.undo()` before hide/block, or disable on `deferred.pending`.
2. Minor: no double send found; narrow window relies on `act` setting `busy` synchronously (`useCard.ts:61-63`).
3. Minor: undo after send honestly absent.
4. Contradiction/minor: `web/vite.config.ts:105` puts raw `VITE_BRAND` into `data-brand`, bundle uses normalised `brandName`; fix: use `brandName`.
5. Minor (sosed): swipe-left hides immediately without undo (`web/src/brands/sosed/index.tsx:93-98`).
6. Not found where handled: place switch with pending like (place currently fixed in App.tsx).
Clean: theme id from localStorage whitelisted (`web/src/theme.ts:21-34`); themes-css.py HEX whitelist except `tile-ink` values; no innerHTML; CSP not weakened.

Status: #1 and #4 VERIFIED by lead (read of `useDeferredLike.ts:46`, `neighbro/index.tsx:173`, `vite.config.ts:105`); refutation pass pending. Others NOT VERIFIED.

## Raw · consistency lens (summary of agent report)

No critical. Design defects: (1) neighbro `tile-5` has no `tile-ink` → `--tile-5-ink: #000000` in themes.gen.css, token unused; (2) `--cat-amber/teal/violet` all = `--accent-text` (`web/src/styles.css:12`), chips one colour.
themes.md ↔ JSON: missing `accent-text`, `tile-5`, `night`, `section`, `tile-ink`; screen count 11 (themes.md, brief.md) vs 10 (sheets, web-vs-sheets docs); colour variants named warm/berry/sea/mint vs real 5+3; generator named gen.py/build.sh vs themes-css.py/brand-sheets.sh; brief.md:10 neighbro "teal/gold".
design/gen JSON == web/themes JSON (diff -rq empty).
Leftovers: comments "gold medallion" (App.tsx:236, ui/Card.tsx:15), `--comic-tilt` ref, "comic 2026-10-01" refs, `ui/Icon.tsx:1` points to untracked `web/design/comic-2026-10-01.svg`; dead alias tokens styles.css:8-12.

## Raw · correctness/operations lens (summary of agent report)

Critical: (1) same as security #1 — hide during 5 s heart window sends like on unmount.
Design defects: (2) pending like lost on reload/close (no pagehide); (3) like sent on unmount — failure invisible; (4) neighbro drag `press.current={moved:true}` stub can eat next real tap (`neighbro/index.tsx:116-127`); (5) sosed card: no role/tabIndex/keyboard though comment promises ↓/↑ (`sosed/index.tsx:83,105-112`); (6) neighbro heart target role=button aria-disabled before heart, keyboard path hidden (`neighbro/index.tsx:136-144`).
Contradictions: (7) `web/index.html:2,6` still `class="k-dark k-acc-terra"` and dark theme-color vs main.tsx comment; first-paint flash; (8) = security #4; (9) first theme by device TZ, then by lon 12.5 → flip after mount (`main.tsx:22` vs `App.tsx:105-107`).
Minor: (10) readChoice accepts night-only ids; (11) auto swatch always light; (12) swipe/heart e2e skip by brand — heart.spec red only when neighbro run; no gate requires both; (13) theme.spec meta==--bg compares same source.

## Refutation pass (agent, read-only)

HOLDS: 1 (hide/block sends like), 2 (no pagehide), 3 (unmount failure invisible), 4 (drag stub eats tap after undo), 9 (heart.spec never runs in gates: default build sosed, neighbro only in a comment of run-web-tests.sh:7).
HOLDS conditionally: 8 (theme flip only if device TZ ≠ place zone at phase boundary).
REFUTED: 5 (keyboard path via `peek` button, sosed/index.tsx:131-132 — only comment wrong), 6 (keyboard path exists, awkward), 7 (`[data-brand]:not([data-theme])` 0,2,0 beats `.k-dark`; theme-color rewritten by applyTheme — leftover class only), 10 (chips never shown side by side).

## Verifier (agent, executed; numbers re-read by lead from run logs)

e2e sosed 55 passed / 9 skipped, neighbro 55 / 9 (different sets: swipe only sosed, heart only neighbro); two-people 1/1 both; depth-mixed browser 0 terminal 0 both; unit 16/0 with control break 15/1. Wrong `data-brand` makes brand specs skip silently, run stays green (shown on heart: 1 skipped, exit 0). 7 mixed-* specs never run (MIXED_RUN unset).

## Lead summary

Fixed in this pass: nothing (report only).
Dropped: refutation items 5, 6, 7, 10.

## Tasks

1. [defect] hide/block during heart window sends like — `deferred.undo()` before hide/block + red test. ~30 min.
2. [gate] brand specs skip silently — fail when `data-brand` ≠ VITE_BRAND; run neighbro e2e in check-all (+~12 min per run).
3. [defect] like lost on tab close (pagehide/sendBeacon or keep-until-sent) — product choice.
4. [defect] unmount-sent like failure invisible.
5. [defect] drag stub eats next tap after undo (`neighbro/index.tsx:116-127`).
6. [minor] `vite.config.ts:105` use brandName; neighbro tile-5 ink; leftover k-dark class, gold/comic comments; themes.md vs JSON.
7. [open] 7 mixed-* specs not exercised; sosed layout vs sheets (Card-more 54%, Match 42%, Feed 36%).
