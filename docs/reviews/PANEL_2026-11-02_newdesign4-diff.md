# Panel, 2 November 2026: uncommitted diff of release/1.0.0

Lenses: Security (fable), Correctness and Consumer (sonnet). Static reading; the fixes were then run.

Lens coverage: both lenses read about 25 files of 121. Not read by any lens: scripts/design/*, scripts/geo/*, docs/*, app/src/shell/App.tsx, app/src/shell/TabBar.tsx, app/src/screens/me/Place.tsx, app/src/screens/tables/Tables.tsx bodies, *.gen.tsx except offer-exit, app/tokens/*, relay/node/legal/*.

## Fixed

- Security, important: `relay/node/src/routes/lost.ts` POST /l/:id/seen was limited only by a hash of headers the caller sets. Added LOST_ANON_ADDRESS_LIMITS, 30 an hour by address. Test in `relay/node/test/lost.test.ts`, seen red with the limit off.
- Correctness, important: `app/src/screens/Feed.tsx` CardScreen had no key: at 1440 the next tile kept the last card's outcome. Added `key={card.id}`.
- Correctness, important: `app/src/screens/feed-card.tsx` a venue offer's tile showed a count and mode it does not have, and its round button liked an id that is no feed message. Now it opens the card.
- Correctness, important: the same file, «Say it with this offer» fell back to a like with no composer. Now the hand is not drawn.

## Open

- Security, minor: `lost.ts` the sweep of old hashes runs on each anonymous mark; now bounded by the address limit.
- Security, design note: three identities can end a neighbour's lost, and the author then waits 3 days. For the owner.
- Correctness, minor: `Composer.tsx:139` matches a refusal by wording; `feed.ts` match_id has LIMIT 1 without an order; two main landmarks on the exit in the pane.


## Second pass, 02.11 evening: three lenses over files unread before

Devices in crowd run flow-1102-222346: {'Chloe': 'Pixel 7 412 915', 'Boris': 'iPhone SE 375 667', 'Anna': 'iPhone 14 390 844', 'Dmitri': 'Galaxy S8 360 740', 'Fotis': 'iPad mini 768 1024', 'Elena': 'small phone 320 568', 'Hana': 'laptop 1280 800', 'Giorgos': 'iPad Pro 11 834 1194', 'Irakli': 'desktop 1440 900', 'Nino': 'full HD 1920 1080', 'panel': 'desktop 1440 900'}

Security (fable): no critical or important defect in auth_hash. Minor: no key rotation path (vault_share.ts:48-50); key in the same dump still allows offline PIN search (documented); report.html:260 in sosed.place and neighbro.place puts out.data.error into innerHTML and shows [object Object]; the report host is not pinned to the brand (feed-logic.ts:109, accepted trust boundary).
Scripts and docs (sonnet): no blocker. Comments name deleted measures (back-walk.mjs:4,25, chat-stand.tsx:2, composer-stand.tsx:2); screen 14 has no successor to loading-look.test.ts; crowd.sh mounts report.html with no guard; privacy _RU not updated; BRIEF_REWORK_EN 165 lines, _RU 164.
Correctness (opus), not run live:
- Chat key={beside.id} (App.tsx:353): switching chats in two panes drops acked lines; read by me, not reproduced for the pair. Crowd harvest cannot see a pane (crowd.mjs:168).
- Replay: seal.ts:374 throws on a seen nonce; catch at chat_state.ts:236-238 appends with no id check: the source of the duplicate key warning. Read by me, not exercised.
- Squeezed list at 834-1439: CSS read only, wide.css:61-79, 82, 295; kit.css:7,16.
- Offer click in TalksPane at 1440+ sets besideMatch, Inbox not mounted (App.tsx:295, 351, 372-374): read by me, not exercised.
- Medium: beside not cleared on a new identity (App.tsx:240-247); Place.tsx:175 old city name; Place.tsx:47-63 failed loads cached; Tables.tsx:67,78 filter stuck in Mine; Tables.tsx:66,70,120-124 blank no-match.
Not read by any lens: nd4-extract.py, *.gen.tsx except offer-exit, nd4-kit.css, docs/newdesign4 MAP/LOST_SPOTS/BACKEND_GAPS bodies, older PANEL files, most of app/src and relay/node/src diffs. Second refuting agent not run.
