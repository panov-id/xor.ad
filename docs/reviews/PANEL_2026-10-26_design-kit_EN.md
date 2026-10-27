# Panel 26.10.2026: diff moving sosed onto the prototype's kit

Subject: the diff of `release/1.0.0` over `b7dacae5` (now in commit `9c890354`). 77 files, +1507/−1529 (the correctness lens's count). Three lenses, read only.

## Security (fable)

Critical: 0.

| # | Where | Level | Finding | Status |
|---|---|---|---|---|
| 1 | `app/src/screens/me/Me.tsx:54-60` | important | Opening Me calls `client.statements()`, and `statements.ts:111-116` marks statements delivered without showing them. Pre-existing | VERIFIED by reading `statements.ts:111-116`. Fixed in M2 by a `restricted` field |
| 2 | `Unlock.tsx:38`, `Locked.tsx:28` | important → dropped | The PIN goes to the node by itself on the 6th digit | REFUTED: 10 attempts then a freeze, `relay/node/src/lib/pin_attempts.ts`, `identity.ts:815-818` |
| 3 | `register-parts.tsx:62` | minor | The PIN has `autoComplete="one-time-code"` | M1a |
| 4 | `NdIcon.tsx:11-12` | minor | `PROTO_ICONS` is a plain object | unreachable now; recorded |
| 5 | `app/index.html` | minor | No CSP; pre-existing | out of the goal |

Not found: SVG injection, bypasses of danger confirms, leaks into localStorage, extra network calls.

## Correctness (opus)

| # | Where | Level | Finding | Status |
|---|---|---|---|---|
| 1 | `Feed.tsx:180` | — | Search and the menu are gone from the feed | REFUTED by the prototype: `feed.html` has neither; a new table starts from the plus on `tables.html` |
| 2 | `Feed.tsx:48,53`, `App.tsx:313` | minor | Dead prop `onNewTable` | M1a |
| 3 | `me/LangPicker.tsx:9` | medium | `lang-list` has no rule | M2 |
| 4 | `Gate.tsx:132` | low | `restore-code` has no rule | M1a |
| 5 | `shell/EmptyPane.tsx:8` | low | `nd-pane` has no rule | M7 |
| 6 | `scripts/design/*.mjs` | high | 88 old classes in measurement selectors; `measure-app-overlap.mjs:361-366` presses removed testids | moved from M6 to M1a |
| 7 | `cabinet.css` | low | Dead `.reg-cells` | M5 |

## Fidelity to the prototype (sonnet)

Important, all in M1a:

1. Icon colour in badges and buttons per theme (`pc-20`, `pc-7`, `pc-26`; the CTA `pc-9`) — `kit.css:44`.
2. Bar buttons in `accent` — `kit.css:118`.
3. Tables tile: the badge and the count overlap — `feed-card.tsx:67-69`.
4. Phrase tile: life ring, 48 px «I'm in», mode badge, heights 236/224 — `feed-card.tsx:56-61`.
5. Offer tile is a button 132 tall — `feed-card.tsx:53`.
6. Card: foot with a ring, distance in the facts — `feed-card.tsx:160-175`.
7. Composer: offer switch, letters ring — `Composer.tsx:7`.
8. Registration: round «info»; 2b has two icons — `register-parts.tsx:13-18`.
9. Registration 3: 4 cells against 2 groups — a deliberate deviation by the SDK rule, to be recorded in the code.
10. Away: a 110 circle in acc-2 with a door and a ring — `Away.tsx:37-50`.
11. Arrival 1: a `move` header, a clock row, a quiet CTA — `Arrival.tsx:76-88`.

Minor: radii and icon sizes, the quiet CTA's and picked mode's colours, a stale comment in `Feed.tsx`.

## Result

Critical 0, important confirmed 2, important for fidelity 11, refuted 2. No owner decision is needed.
