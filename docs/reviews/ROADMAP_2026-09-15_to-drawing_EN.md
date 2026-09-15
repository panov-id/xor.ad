# The road to drawing, 2026-09-15

The goal the owner named on 2026-09-14 and 2026-09-15: close the screens and the mechanics and move on to
drawing — but before drawing, reach **100%** on documentation, mechanics, screens, legal texts,
facts, patterns and rules: everything the start needs. This document is the route the process
follows without asking. The cycle rules are `PROCESS_2026-09-14_spec-hardening_EN.md`, still in force.

## What "ready to draw" means — the readiness gates

Drawing starts when all seven hold, each checked by a machine or a panel:

1. **Gates are green.** `scripts/check-all.sh` — 0 failed, 0 skipped; the landing gates of both
   storefronts green (legal revisions, translation consistency, the bar, i18n, security headers).
2. **Screens 01–21 have no open questions about behaviour, text or rule.** Only "what it looks
   like" questions may remain, each marked "settled by drawing" with a reference to its screen.
3. **Mechanics and canon:** the final full panel (five lenses and the refuter) — zero confirmed
   findings above trivia.
4. **Legal texts:** one edition, the revision baseline recorded, lawyer questions in the brief and
   marked as blocking publication or not. They do not block drawing.
5. **Facts:** the registries cover every date, number and item (`check-facts-coverage` green); every
   `open.tsv` item is either closed or marked "does not block drawing".
6. **Patterns and rules:** the app design system has no open items; the `app-ui-notes` wishes are
   sorted — into the design system, rejected with a reason, or deferred; the "screen × state" matrix
   is complete (screen 11 named for every screen).
7. **Drawing brief:** one RU/EN document — screen order, the states of each, texts in both
   languages, tokens, the rule "SVG at true geometry first".

## Measured at the start (2026-09-15)

| What | How many | Where from |
|---|---|---|
| Red `check-all.sh` gates | 2 of 18 | `check-facts-coverage` (dates 15.09, 14.09 in two places, "50 min", "8 h", offers CHECKLIST items 38 against 37), `check-docs-pairing` (`chat_RU.md:830` "11.09" without a year) |
| Open screen questions | 20 on 12 screens | the "Open questions" sections, not struck through |
| — "what it looks like" | 16 | icons, tabs, remaining quota, table and offer marks |
| — about behaviour | 2 | screen 2 (identity-loss warning later in settings?), screen 15 (how the re-acceptance screen looks — behaviour decided 2026-09-15) |
| — decisions sitting in the questions section | 2 | screen 15, screen 19 — move into "Logic" |
| Open in the app design system | 2 | light theme, July prototype |
| `app-ui-notes` wishes without a status | 16 | concrete palette, frames, feed/chat split, masonry, bottom navigation |
| Open `open.tsv` items | 24 | legal 9, product 12, comfort 3 |

## Stages

### S0. The tool and the red — today

- Fix the two red gates: 2026-09-15 decisions into `decisions.tsv`, the duplicate out of `noise.tsv`,
  limits "50 min" and "8 h" into the registry or into noise with a reason, the offers CHECKLIST count,
  the year on "11.09".
- `scripts/harden-cycle.sh` — one command per cycle: `check-all.sh` plus both storefronts' landing
  gates (Node in a container) plus the brand-modulo comparison of legal texts; one verdict and an exit
  code. Probe: break a file on purpose and see red. The manual checks of past cycles missed red twice —
  this replaces them.
- `scripts/batch-edit.py` — a batch of edits from JSON: "exactly one match", RU/EN pair required,
  mirrored to both storefronts with brand substitution, dry run; retired wordings are appended to
  `docs/retired-terms.txt` on their own, and the manual control grep moves into `check-retired-terms`.

**Exit:** `harden-cycle.sh` green.

### S1. The rest of plan v1 stage 4, documents only

- The receipt without email (R2): `dsa/SPEC_*` §6 "email only" → [retired], `receipt_hash` in §8, a
  line on screens 5 and 11, item `dsa.article16.no-email` closed.
- The Art. 18 message log in the spec; the Europol address stays an open item until confirmed.
- "What changed" in the new-edition bar against terms §19 — a fork, see below.
- Plan v1 stage 1 watchdogs — as specification only (notice age, notification failure, re-arming jobs,
  the "retention without a sweeper" gate, an external pinger as an item).

**Exit:** a panel over S1 — zero confirmed above trivia.

### S2. Screens and mechanics — a full pass over 01–21

- Each screen: sort "Open questions" into three piles — decided (move into "Logic"), "settled by
  drawing" (mark), about behaviour (decide from the mechanics and neighbouring screens; if it does not
  follow — into the forks).
- The "screen × state" matrix: for each screen — empty, loading, refusal, offline, frozen, pause,
  stepped away, documents changed; a screen 11 row or "not applicable" with a reason.
- The text of every state — RU and EN, identical in both storefronts (`check-screens-mirror`).
- Mechanics `00-mechanics` against the screens: every mechanic rule found on at least one screen,
  every screen behaviour in the mechanics.

**Exit:** 0 behaviour questions; a panel over S2 — zero confirmed above trivia.

### S3. Patterns and rules

- The app design system: close "light theme" and "July prototype" (forks, see below).
- `app-ui-notes`: 16 wishes — each into the design system, rejected with a reason, or deferred with
  an item; contradictions with `design-system-app` removed.
- A component vocabulary from the S2 screens: which controls and patterns are needed, which the design
  system already has.
- `accessibility-and-i18n`: requirements for drawing stated as numbers (contrast, touch sizes, languages).

**Exit:** nothing open in the design systems; a panel over S3.

### S4. Facts

- `check-facts-coverage` green; `count-tests` agrees; the "period without a doer" gate from
  `docs/watchdogs_EN.md` §W4 built and probed red.
- Every `open.tsv` item marked: blocks drawing, blocks publication, blocks code, blocks nothing.
  Zero block drawing.

### S5. The final full panel

Five lenses (law, security, data and database, autonomy, consistency) and the refuter over the whole
scope of the process rules. Confirmed above trivia — in batches, and the panel repeats. Zero — onward.

### S6. The drawing brief

`docs/drawing-brief_RU/EN.md`: screen order, states, texts, tokens, component vocabulary, the
SVG-first rule; linked from the process rules. After it — the question about pushing and the start of drawing.

## When the process asks

Only here, in one form at the start of the stage where the fork occurs:

| Stage | Fork | Why it does not follow on its own |
|---|---|---|
| S1 | "What changed": a changes page linked from the bar, or soften the §19 promise | published legal text or storefront code |
| S2 | Screen behaviour questions that do not follow from the mechanics | a product decision |
| S3 | App light theme; the July prototype — basis, reference or archive | a product decision about the look |
| S6 | Pushing the day branches to `dev`; starting to draw | going outside |

Everything else follows from decisions taken, the code, a measurement or the project rules, and is
reported with its price.

## Order and pace

S0 → S1 → S2 → S3 → S4 → S5 → S6. Inside a stage — batches per the process rules; `harden-cycle.sh`
after every batch, a panel every two or three batches and at the end of a stage. The day branch —
`scripts/new-day-branch.sh`; pushing — only on the owner's word.
