# Panel 2026-10-26: solo play, watcher «apply», crowd moves, tables list look

Subject: uncommitted work on release/1.0.0 (handoff d04eb330, steps 1, 3, 5). Lenses: security (fable), correctness (opus).
Both read code and diffs only; nothing was exercised live by them. Second check: the lead against the code and by a test break.

## Fixed in this pass

| # | Lens | Where | Finding | Check |
|---|---|---|---|---|
| 1 | security | app/src/screens/tables/tables-logic.ts TABLES_LOOK_MS | a look every 15 s took 240 of the node's shared 300/h read bucket (/tables, /feed, /likes; relay/node/src/lib/rate_limit.ts:172) | now 60 s; crowd-plan test reads the bucket, red at 15 s |
| 2 | correctness | app/src/screens/tables/Table.tsx soloOpen | the puzzle never closed when the node cleared the mark (round started) | follows view.solo both ways; solo.test.ts red under a break |
| 3 | correctness | Table.tsx setSolo | a refused mark left the puzzle open | taken back on refusal; red under a break |
| 4 | correctness | Table.tsx apply | double press sent two applications, the second showed «failed» | shut while on the way; table.test.ts red under a break |

## Open: node or out of plan scope (owner's word)

| # | Lens | Where | Level | Finding |
|---|---|---|---|---|
| 5 | security | relay/node/src/routes/tables.ts:644 | important | POST/DELETE solo has no per-identity rate limit; each call writes and notifies the table's stream |
| 6 | security, correctness | relay/node/src/lib/tables.ts:309-313 | minor | the mark clears only when the last player leaves; it can stay on with two players |
| 7 | correctness | routes/tables.ts:459-466 | minor | POST solo does not check that one player is seated |
| 8 | correctness | routes/tables.ts:372-379 | minor | one application per game is SELECT then INSERT, no lock |
| 9 | correctness | Table.tsx:66-101 | minor | leaving the table screen does not clear the mark |
| 10 | correctness | tables-logic.ts freshTables | minor | after more pages, closed tables stay and drawn rows are not refreshed |
| 11 | correctness | scripts/flow/crowd.mjs tryMove | minor | a late 200 followed by a 409 counts the move as refused |
| 12 | security | Table.tsx:64-77 | minor | every table open POSTs /seat; navigation can burn the sit limit (pre-existing route) |

## Not found

Auth of the solo routes, SQL injection, the 086 migration, the solo_since leak (a boolean only), canApply bypass, the local solo save.
