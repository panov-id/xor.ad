# Panel 31.10.2026: place-map laptop variant and the whole uncommitted diff

Subject: `git diff --name-only` + untracked (34 files, list in the session scratchpad panel-files.txt).
Lenses: security (fable, 19 files), correctness (sonnet, 14 files), remaining files (sonnet, 20 of 20).
Lens coverage: 34 of 34 files.
Second check: F1 and F2 of correctness given to a refuting agent.

## Findings and status

| # | Lens | File | Level | Finding | Status |
|---|---|---|---|---|---|
| S1 | security | scripts/design/nd4-extract.py js_str | important | `${` and `\` of archive text not escaped in generated JS strings | FIXED; test with break red (2 checks) |
| S2 | security | scripts/check-app.sh px gate | important | any hand `*.gen.tsx` with "generated from" line 1 was exempt; basename exclude | FIXED: exempt only `nd4-extract.py --list`; hand `app/src/foo.gen.tsx` with 12px → RED |
| S3 | security | nd4-extract.py tag_to_jsx | minor | raw `>` in text breaks build | open |
| C1/F1 | correctness | Place.tsx `widenedFor` | important | widened line shown after the point moved off the saved place | HOLDS (refuter); FIXED: `atSaved`; test, break red |
| C2/F2 | correctness | place-map.test.ts | important | "no own markup" count can never fail | REFUTED (refuter): it counts inside the slice; gap: `<main>`'s own class unchecked |
| C3 | correctness | Place.tsx:81 onSea "" | minor | string into boolean|null | NOT VERIFIED (tsc 0 errors in check-app) |
| C4 | correctness | TabBar.tsx desktop | minor | aria-disabled for missing onSelect lost | open |
| C5 | correctness | Place.tsx Screen pick | minor | map remounts when width class changes | open |
| R1 | remaining | nd4-map.py:99-113 | important | screens 23..29 mapped to nav/laptop file; MAP stale (--check DIFFER) | VERIFIED (--check rc 1); FIXED: phone family file first, nav not a screen; MAP regenerated |
| R2 | remaining | nd4-map.test.py | important | test never ran --check | VERIFIED; FIXED: --check and screen-23 checks; red on the stale MAP, green after |
| R4 | remaining | app/tokens/nd4-kit.css:2,13,22 | important | archive's global rules (`p{margin:0}`, `.cta:active,.btn:active`, reduced-motion `*`) reach old screens | VERIFIED by grep; open (scope by generator) |
| R5 | remaining | nd4-kit.css:11 `.fab` | important | Carnelian pulse on the live button | REFUTED: Feed uses `k-fab` (Feed.tsx:340) |
| R6-R13 | remaining | kit css dup `.rise`, cascade order, rail gap, LOST_SPOTS line refs, map.edges stale, GOALS wording, old panel numbers | minor | open |

## Checks run after fixes
- nd4-extract.test.py: OK 0 failed; nd4-map.test.py: OK; check-app: GREEN; app unit 371 of 371.
