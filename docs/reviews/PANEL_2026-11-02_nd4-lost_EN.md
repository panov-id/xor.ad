# Panel 02.11.2026: newdesign4 families, Lost on the node

Lens coverage: about 69 of 1137 files by line, overlaps not removed. Unread: docs/newdesign4 (993), docs/newdesign3 (4), bodies of generated screens and texts.

Lenses: security node, security app and scripts (grep over the rest), consumer, correctness, generator; one refuter.

## Fixed
- Taken-down lost could return at once: 3-day wait, own answer with `until` (feed_limits.ts, feed.ts). Red seen.
- Blocked neighbour could mark and complain (lost.ts). Mark red seen; complaint not broken separately.
- A live lost took a phrase slot in the composer (identity.ts, composer-logic.ts). Red seen on the client.
- Generator tests were outside the unit script; map test was red (run-app-unit-tests.sh, MAP pair).
- Theme colors, chip literals, map count, orphans, villages (nd4-extract.py, nd4-map.py, build-villages.py). Refutation failed.

## Open, minor
- Marks limit race (lost.ts:104-142), timing of complaint answer (lost.ts:246-277).
- No wording for the new `until` refusal in depth/web-platform/phrase.ts; no client sends a lost yet.
- Offer exit strip at 1440 (Offer.tsx:53), not seen on screen. Tables «Mine» stays lit when emptied (Tables.tsx).
- Old measures read removed rail classes (measure-app-wide.mjs:81). loading-look guards have no successor.
- 36 of 41005 theme values off the archive on icons of screens 46 and 79.
