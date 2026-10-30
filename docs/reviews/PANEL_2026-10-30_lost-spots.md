# Panel 30.10.2026: lost-* and spot-* (SCREENS_spec.md:699-741) against the code

Lenses: author's intent (opus), security (fable), product (opus), node and db (opus), moderation (sonnet). Read only, nothing run.
Second refuting pass: not run; every finding below is NOT VERIFIED by a second agent.

## Forks for the owner (deduplicated across lenses)
1. Lifetime and limits of Lost: 3 days vs one 4h20m; does it hold one of 4 live slots (feed_limits.ts:34) — product, node, security 14/18.
2. Radius: spec 300 m–10 km vs CHECK 100/300/1000/3000/10000 (db/025:41); empty feed widens to 25 km — product 1, node 1.
3. Anonymous "seen": no device without an account, only IP (rate_limit.ts:289); fake marks lure the owner; marker location — security 1,2,5,6; product 4; moderation 4,9.
4. Who sees marks with author: spec :707 vs :716 — intent 3, product 8.
5. Complaint → takedown without a human: report.ts is operator-decided; only offers auto-hide at 3 complaints (offer_complaints.ts:88) — moderation 1-3, security 14.
6. Photo: on flyer only, not in app; neighbour cannot recognise — intent 1, product 6.
7. Spot membership: per-identity row vs signed token; cap race; "inside" counter — node 12, security 8,10.
8. Live code: HMAC per minute, grace window, uses per code — node 11, security 7, product 18.
9. Pinned message visible before check-in (Wi-Fi leak) and stale verdict — intent 14, moderation 6, security 12.
10. Organiser sees only numbers vs no way to remove a troublemaker; small-group deanonymisation — product 20, security 11.

## Raw findings
author's intent 20, security 18, product 23, node 15, moderation 12 = 88 (texts in the session transcript fb184746, 30.10).
