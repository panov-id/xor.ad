# Goals — one summary

13.10.2026 · branch day59 · Russian pair — `GOALS_RU.md`.
Memory: `~/.claude/projects/-home-eugene-panov-Projects-panov-id-xor-ad/memory/` (below `mem/`).
Checked against the tree on 13.10 with grep/git/ls. Anything not run is marked NOT VERIFIED.

## 0. THE GOAL — single (owner's word, 12.10 evening)

**16.10.2026, the main goal (owner's word): «the main goal is a working app in the new design».**
The web face of both brands works on the stand in the new design: the 15.10 decisions, the concept
`testing/redesign/2026-10-15/brief/concept/`, own fonts if the owner accepts them. The goal below
("every flow liked") is what "working" means. The work is split between two sessions: code (`web/`,
`relay/`, `depth/`, e2e) and the design source (`testing/redesign/`: brief, concept, fonts). Criteria —
`mem/goal-app-in-new-design.md`.


**We need a product.** Every flow works on the local stand, and everyone who goes through it
likes it. **Done = 100% of flows: walked, verified, liked.** Not "tests green", not "sheet
drawn" — a person went through and is pleased.

How I go:
1. Local stand for both brands, e2e, gates — all green after every change.
2. I walk every flow myself (textwalk + SVG walk at 6 widths) and write the experience as text.
3. Lens review (`review-panel`, security mandatory) on large pieces.
4. Unclear things are not asked at once: they pile up in §6; the owner gets the list when they ask.

Goals G2–G7 below are parts of this one; G7 (`docs/goal-web-whole_EN.md`) is its work plan, accepted.

**Owner's word of 13.10.2026 (wins over every document):**
- EVERYTHING is in alpha. "Outside alpha", "after the chat", "later" are lifted for everything below.
- Everything except complaints is decided by the model: pre-publication check, refusal, hiding, flags.
  No human queue and no "hide now" button for that. COMPLAINTS (about a phrase, an offer, a table,
  DSA Art. 16 notices, appeals) are handled by a HUMAN.
- Stickers stay, in alpha: a small fixed set of standard stickers to express a reaction, tappable
  (in chat and at a table). No catalog admin, payments or uploads.
- One device. Identity can be MOVED to another device; the moment it moves, the old one stops working.
  Two devices never work at the same time. No device list, no "connect a second device".
- Offers from a private person and from a business are in alpha; a business offer carries a promo code
  (copy button), a private offer is a phrase with a discount (no link, no code).
- Games in alpha are more varied; creating a table must be beautiful.
- Polish goes to zero too: not only critical and defect.

**Accepted earlier:**
- widths — the 6 from G6 (12.10, the latest decision);
- place on first entry — a wizard step before the feed, not silent Rome.

## 1. All goals

| # | Date | Source | Goal in one sentence | Status | Evidence |
|---|---|---|---|---|---|
| G1 | 26.09 | mem/no-deploy-of-unready-product.md:12 | Do not offer a rollout until the owner calls the product ready. | active (a rule, not a goal) | — |
| G2 | 10.10 | mem/goal-self-walkthrough-first.md:11 | I walk the product locally myself and write a report; then the owner tests. | absorbed by G4 (final step) | mem/goal-local-100-adaptive.md:25 "Includes" |
| G3 | 10.10 | mem/goal-new-design-everywhere.md:11 | Everything on the 02.10 design: kit rev. 4 from the sheets, then code. | absorbed by G4 | VERIFIED: kit §9 "revision 4" exists, `docs/design/kit_RU.md:260`; mem/goal-local-100-adaptive.md:25 |
| G4 | 11.10 | mem/goal-local-100-adaptive.md:11 | Product 100% on the local stand and adaptive; every adaptive-* sheet works on the stand; the person's path runs without failures. | active, main | — |
| G4.C1–C11 | 11.10 | mem/goal-local-100-adaptive.md:53-60 | Sub-goals: place, new design, less text, wizard, filters, fade, report, theme, chat cleanup, tables, route gate. | partial | C1 place: VERIFIED `web/src/geo/place.ts` (search, coordinates, here()). C4 wizard: VERIFIED `web/src/screens/Wizard.tsx`, commit 52d578ff. C7 phrase report: VERIFIED absent (only offers' `/o/.../report` in `web/src`, `useCard.ts:45`). Others — NOT VERIFIED |
| G5 | 11.10 | mem/goal-local-100-adaptive.md:67 | "Draw all screens 100%": every screen and state has a sheet. | done per commit | VERIFIED: commit ec918f83 "77 of 77"; 182 `panel/design/adaptive-*.svg` (91 per brand). Whether the coverage gate is green now — NOT VERIFIED |
| G6 | 12.10 | mem/goal-beautiful-every-width.md:11 | Every screen beautiful at 6 widths × 2 brands; perfectionist rounds to 0 critical/defect. | active; part of G7 (condition 4) | round 1: VERIFIED 12 files `testing/walk-svg/round1/*.notes.md`; round 2 stopped (mem/session-handoff.md:21) |
| G7 | 12.10 | docs/goal-web-whole_EN.md:15 | Every promised flow is on screen, walked by a newcomer, beautiful at 6 widths in both brands. | accepted by the owner 12.10; work plan of §0 goal | §0 of this document |
| G8 | 10.10 | mem/owner-decisions-2026-10-10b.md:12 | P18: real GET /tables, model proofreads translations, delete only merged worktrees. | P18 done; rest NOT VERIFIED | VERIFIED: `relay/node/src/routes/tables.ts:608` |
| — | 03.10 | docs/roadmap_RU.md:1 | Roadmap "state as of 03.10". | stale as a goal source | date in title |

## 2. Hierarchy

Main — **G4** (100% local, adaptive). Without it there is no readiness for the owner's testing.

- G7 "web whole" — today's working plan of G4. It is G4's task list, not a separate goal.
  - G6 "beautiful at every width" = condition 4 of G7.
  - G3 "new design" = G4's "sheets work on the stand"; closed by kit rev. 4 and the sheets.
  - G5 "all screens drawn" = G4 prerequisite, done.
- G2 "I walk it first" — G4's final step: my walk and report, then the owner.
- G1 — frame for all: rollout is not a goal.

## 3. Mismatches

**M1. Widths.** G4: "393/768/1440/2560/3440" (mem/goal-local-100-adaptive.md:19) and "375 / 768 / 1440 / 2560+" (same file :24). G6 and G7: "375 393 768 1024 1440 2560" (mem/goal-beautiful-every-width.md:14, docs/goal-web-whole_EN.md:16). Conflict: 3440 and 1024 appear in one list only. The 6 widths of G6 are accepted (§0): 375, 393, 768, 1024, 1440, 2560; G4's 3440 drops; the question is open (§6, question 2).

**M2. What "done" means.** G4: sheets on the stand + widths.sh + e2e (mem/goal-local-100-adaptive.md:16-19). G7: five conditions incl. "newcomer, 0 stalls" and the perfectionist (docs/goal-web-whole_EN.md:20-30). G2: my walk and report (mem/goal-self-walkthrough-first.md:12). Conflict: three finishes. Proposal: finish = G7's 5 conditions + G4's "sheets on the stand" (check-adaptive on all screens, G7 task 11).

**M3. Geolocation.** Decision 11.10 (C1 result): "(3) geolocation — a 'where am I' button" (mem/goal-local-100-adaptive.md:66). Decision 12.10: "remove the 'where am I' button" (mem/session-handoff.md:16; docs/goal-web-whole_EN.md:38). Code is still old: VERIFIED `web/src/geo/place.ts:108` calls `navigator.geolocation`. Proposal: the later 12.10 decision holds; mark the 11.10 entry as revoked.

**M4. Place QR: fragment or path.** Owner decision 12.10: the QR is bound to coordinates; the device camera opens `https://sosed.place/location#p=<cell>&s=<step>`; code = grid cell + step. Protocol: "the link `<storefront>/location#p=<cell>&s=<step>` is parsed on the device from the fragment, which never reaches the server" (docs/protocol_EN.md §4.2); G7 task 3 says the same (docs/goal-web-whole_EN.md:49). Conflict was: a path carrying the code reaches the CDN and logs, a fragment does not; the protocol deliberately keeps the point off the server. Options were: the code in the path or in a fragment. **Decided by the owner 12.10: `/location#p=<cell>&s=<step>`** — the code is in the fragment and never reaches the server; protocol updated (docs/protocol_EN.md §4.2).
No conflict with geolocation: removing here() does not hurt, the QR itself carries the coordinates.

**M10.** docs/goal-web-whole_EN.md:71 wrongly mixes the offers' in-app scanner refusal with the place QR; the place QR is a plain link opened by the device camera.

**M9. QR and "no id" routes.** Router in xor.ad worktree `agent-ad575525bf51d2d8e` (`web/src/router.ts:1-5`): "URL ... carries no id and nothing of the person". VERIFIED: no `/location` route there (path table `router.ts:60-92`) nor in the main tree (grep `/location` over `web/src` empty). The code is neither an object id nor personal data, but it would have been a path parameter. After the M4 decision there is no path parameter: `/location` is a plain path, the code is in the fragment. Proposal: add `/location` to the table, next to the offer's `/o` (`router.ts:66`), with an exception comment.

**M5. Default place.** G4 C1: "place cannot be set (App.tsx:111 hard-codes Rome)" (mem/goal-local-100-adaptive.md:50). Now Rome is `FALLBACK` in `web/src/geo/place.ts:12` (VERIFIED), place choice exists. G7 task 2 wants to ask the city before the feed (docs/goal-web-whole_EN.md:48). Conflict: C1 counts as done, yet a newcomer silently sees Rome. Proposal: C1 is not closed until G7 task 2 is done.

**M6. Icons vs words.** G4 11.10: "icon buttons ≥80%" (mem/goal-local-100-adaptive.md:56). Perfectionist: icon-only primaries are critical/defect, T4 "product decision" (docs/reviews/WALK_2026-10-12_svg-perfectionist.md:81). Decision 12.10: icons stay, the word goes into a tooltip (mem/owner-decisions-2026-10-12.md:28). Proposal: close T4 by the 12.10 decision; C3 "explanations on tap, not hover" (:56) — check against `web/src/ui/iconTips.ts`, NOT VERIFIED whether tap works.

**M7. Work order.** 10.10b: "red mixed tests, web e2e, T13–T18, P18, translations, final walk" (mem/owner-decisions-2026-10-10b.md:19). G7: "truth, newcomer's main path, missing parts, the rest" (docs/goal-web-whole_EN.md:43). Proposal: 10.10b order is stale (P18 done); G7's order holds.

**M8. Error in the inventory.** GAPS: "768/2560 runs (not evidenced)" (docs/reviews/GAPS_2026-10-12_web-vs-promise.md:57). Handoff: "it has an error — 768/2560 were shot in round 1" (mem/session-handoff.md:32). Proposal: fix the GAPS row.

## 4. Blockers

| Goal | What blocks | Who clears | Next step |
|---|---|---|---|
| games | No break test on `judgeWord`; wizard sheets (poker 2–8) vs node (2–6), durak variants | me | Break test; align sheets with node, default "as in node" (§6) |
| G7 web | Table wizard (3 steps per sheets), stickers at the table and in a conversation — done 13.10, e2e of both brands after them NOT RUN; boards of the new games (reversi, four in a row, battleship, poker, durak) — in progress; no report on a table or a table line in the web (the node takes `table_line`, `relay/node/src/routes/report.ts`). The phrase report exists: `web/src/screens/Card.tsx:140`, e2e `report-phrase.spec.ts` (the earlier "none" was a grep error on `/reports`) | me | Boards, table report, full e2e |
| G4 | Adaptive decisions not in `docs/facts/decisions.tsv` | me | Add from kit §10 (`docs/design/kit_RU.md:311`) |
| all | 503 uncommitted paths in day59 (VERIFIED `git status`); commit only on word | owner | Word to commit after green e2e |

Cleared 13.10 (VERIFIED grep): no `navigator.geolocation` in `web/src`; `/location` route and QR exist (`web/src/screens/PlaceQr.tsx`, `web/src/geo/qr.ts`).

Cleared 13.10 by session 66db4f22: `dsa_snapshot_columns` — a `;` in a DDL comment of `docs/chat_*` broke the parse; node 314/314, database-tests rc=0. The model was called before the signature in `speak`, `move` (tables) and `play` (pair) — signature first now; test `relay/node/test/judge_after_signature.test.ts` 4/4 red on the break, green after. Set words (poker, reversi, four in a row, battleship, 17 word languages) in all 17 locales, check-web-i18n rc=0; e2e `table.spec.ts:106` expects two deck sets. Poker on sheets is 2–6 (question 9 §6, default). Open: in `POST /tables` the model runs before the nonce and the rate limit (`routes/tables.ts:130` vs `:152`).

## 5. Owner decisions (summary)

- 2026-10-13: everything is in alpha; everything except complaints is decided by the model (complaints are handled by a human); stickers stay (a small fixed set, tappable); one device, identity is moved and the old device stops at once; offers from a private person and a business (with a promo code) are in alpha; games more varied, table creation beautiful; polish to zero.
- 2026-10-12: the place QR is bound to coordinates. The person points the device camera; the QR opens `https://sosed.place/location#p=<cell>&s=<step>`; code = grid cell + step, parsed on the device. Needed: a `/location` route and QR generation. In the app — a place-QR screen: show the QR, save as image, share, copy the link. Mock-up exists: `panel/design/screen-26-place-qr.svg` (show, "save as image", "share" via the system menu); no "copy link" button in the mock-up — add it.
- 2026-10-12: remove "where am I"; routes "tabs + nested, no id"; icons with the word in a tooltip; language as a list; "back" inside the Split; from 1024 framed fields.
- 11.10: adaptive widths and columns, brand mark, like = logo outline, place = coordinates + offline city list.
- 26.09: do not offer rollout.

**QR criteria (panel 12.10, `docs/reviews/PANEL_2026-10-12_goals.md`):** malformed `p`/`s` → as if no QR; after parsing `history.replaceState` without `#` (pattern `web/src/adv/Cabinet.tsx:55`), e2e: `page.url()` has no `#`; e2e: no `navigator.geolocation` in `web/src`.

## 6. Open questions for the owner

1. **Which goal is main?** a) G4, G7 its plan (recommended): one goal, nothing lost. b) G7 instead of G4: simpler wording, but "every sheet on the stand" and 3440 are lost. By default: the single goal of §0 (G4, G7 its plan).
2. **Widths.** The 6 widths of G6 are accepted (§0); the question is open. a) 7 widths incl. 3440: +1 frame per screen, a round ~15% dearer. b) 6 widths without 3440: G4's 3440 drops.
3. **Place on first entry** (G7 question 2). a) screen before the feed: newcomer never sees Rome, +1 entry step. b) feed with a banner: faster, but a stranger's feed first. Accepted: a wizard step before the feed (§0).
4. ~~**Polish to zero?**~~ Decided 13.10: to zero, polish included; 1–2 more rounds, 12 agents each.
5. ~~**Out of goal** (G7 question 1): promo codes, stickers, device list.~~ Decided 13.10: nothing is out of the goal, everything is in alpha; promo codes and stickers are in the goal, the device list is replaced by moving the identity to the single device.
6. ~~**QR code in path or fragment?**~~ Decided 12.10: `/location#p=<cell>&s=<step>`.
7. ~~**Step "house" (100 m) in the QR?**~~ Already decided by the owner on 19.09: all five steps, a price line at 100/300 m; a phrase's zone by QR is no narrower than 300 m (sosed.place repo `docs/26-place-qr_RU.md`). New 12.10: "copy link" under the QR (spec 26 said "no link as text" — replaced by the owner's word).
8. **Reload on a nested path** (routes 12.10): the page opens what the path names (an object screen → its tab); 8 old e2e rewritten for it. Alternative — always to the feed.
9. **Poker: 2–8 or 2–6 seats?** Wizard sheets: "poker · chips 2–8" (`panel/design/adaptive-*-new-table-game-*.svg`); node: at most 6 (`relay/node/src/routes/tables.ts:100`). a) 2–6 as in the node: only the sheets change. b) 2–8: the node, seat limits and e2e change. Default: a.
