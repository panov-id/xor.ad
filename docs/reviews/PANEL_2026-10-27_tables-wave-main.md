# Review panel 27.10.2026: main uncommitted diff (tables wave TAB3/TAB4, kit.css R1-R8, wide.css 1440 frame, App.tsx talks pane, Me pane)

Lenses: security (fable), correctness (opus), CSS (sonnet). Coverage: 22 of 23 diff files read by some lens; i18n.ts read by security only (key lines).

## Findings kept
| # | file:line | level | lens | status | owner |
|---|---|---|---|---|---|
| 1 | boards-sea.tsx:14-18 module-level fleet store never resets: rematch repeats a known fleet; two panes share it | important | security + correctness | VERIFIED by two lenses reading the code | TAB3 xor-ad-b3 |
| 2 | boards.tsx:106 hangman guessed non-string -> TypeError in render | minor | security | VERIFIED: reproduced in node:24 | TAB4 xor-ad-26 |
| 3 | boards.tsx:264-265 domino boneyard missing -> TypeError | minor | security | VERIFIED: reproduced in node:24 | TAB4 xor-ad-26 |
| 4 | boards.tsx:179 CHESS_BODY prototype lookup | minor | security | not exploitable | TAB4 |
| 5 | boards-poker.tsx:44 own chip stack not drawn | medium | correctness | NOT VERIFIED (no pair checked) | TAB3 |
| 6 | poker-logic.ts:31 top-row stack pill above the stage; test pins it | low-medium | correctness | NOT VERIFIED | TAB3 |
| 7 | App.tsx:325 EmptyPane shown while a talk is chosen and keys load | low | correctness | FIXED: `wide && !beside` | coordinator |
| 8 | boards.test.ts tests 2-5 are source-regex tests | low | correctness + security | VERIFIED by reading | TAB4 |
| 9 | wide.css:296 `.screen.k-screen` frame now applies to table, new-table, match, arrival, away, departure, cabinet at >=1440 | moderate | CSS | NOT VERIFIED on screen; next shots | coordinator |

## Dropped
- dead `.k-tb-menu`, `.k-tb-ring`, `.k-cta[data-strong]`: users are in TAB2's Table.tsx, not merged yet.
- dead `.k-tb-new`: TAB1's, not merged yet.
- `.tb.tb` rules in wide.css: dead, pre-existing, out of this diff (note for cleanup).
- XSS, i18n injection, hidden-card leaks, hangman word leak: not found.
EOF
