# Panel 06.11.2026: distance without a chosen place, screens 110/111 at 834

Lens coverage: 11 of 18 files of the two turns. Not read by a lens: scripts/design/nd4-extract.py (checked by --check), docs/newdesign4/BRIEF_REWORK_EN.md, BRIEF_REWORK_RU.md, MAP_EN.md, MAP_RU.md (generated), memory/project-neighbro-legal-sync.md, MEMORY.md. The branch's other uncommitted files (173 in all) were not in this panel.

## Correctness lens (opus), raw
1. Important, defect: app/src/screens/talks/Likes.tsx:66-69 measured from the fallback place. FIXED: Likes uses talks-logic.ts farWord; test in talks.test.ts, red on a break.
2. Not found: Tables, NewTable, Composer, Feed show no distance.
3. Minor, defect: talks.test.ts had no chosen:false case for matchWho (an earlier insert had not applied). FIXED; break test red.
4-6. Not found: hook order, 1440 pane, resize (focus loss on resize, minor).
7. Minor: MatchGoneScreen (45/112) has no tablet drawing; at 834 the phone drawing sits in the tablet frame. Open.
8. Minor, not verified: .k-tk-offer exit animation inside the tablet frame. Open.
10. Not reviewed: generated tablet files' testids against e2e.

## Security lens (fable), raw
1-3, 5-6, 8: not found (published centre only, quantised at publish; distance computed on device; policy §6 matches).
4. Minor, pre-existing: radius grids 300/1000 and 3000/10000 are not nested, so an intersection can narrow to 100 m. Not this change.
7. Minor, outside subject: feed-logic.ts:111 offerReportUrl does not whitelist the scheme of the node's redirect host.

No second refutation pass: no important finding was left unfixed.
