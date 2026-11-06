# "Lost / Found" and "Spots": what the code has (30.10.2026)

Source: `kit/sosed-design-2026-10-29/SCREENS_spec.md`, sections "Пропал / Нашёлся (`lost-*`)" and "Точки (`spot-*`)"; 15 new screens, `inventory.csv` rows 64–78. Code references checked by grep on 30.10.

## 1. What already exists
| What | Where | Today |
|---|---|---|
| Phrase lifetime | `relay/node/src/lib/feed_verdict.ts:158` | one for all: 4 h 20 min; no extension |
| Phrase radius | `relay/node/src/routes/feed.ts:111` | 100 / 300 / 1000 / 3000 / 10000 m |
| Feed by radius | `relay/node/src/routes/feed.ts:530` | distance to centre ≤ phrase radius + viewer radius; empty widens to 25 km |
| Model check of the text | `relay/node/src/lib/feed_verdict.ts` | before publishing; no human moderator |
| Complaint (DSA) | `relay/node/src/routes/report.ts:36` | a notice to the operator; no counted "take the phrase down" |
| Public short link | `relay/node/src/routes/offer_links.ts:140` | `GET /o/:code` for offers, no key |
| Public request limit | `relay/node/src/lib/rate_limit.ts:90` | per IP (IPv6 by /64) |
| Place QR | `depth/core/place_qr.ts` | built on the device, the cell in `#`, the node learns nothing |

## 2. What is missing
| Mockup rule | Screens | What it needs |
|---|---|---|
| Lost / Found kind of phrase | lost-feed, lost-compose, lost-found | a kind field; Found fades after a day |
| 3-day lifetime, owner extends | lost-compose, lost-open | a lifetime per kind; an extend route |
| "Seen" marks: point, time, line | lost-open, lost-seen | a new table; the owner sees all, others dots without author; fade after 3 days |
| Page `/l/<id>` and a mark with no account | lost-scan | the first public phrase page; an anonymous write with a per-device limit and captcha-lite |
| A4 flyer with a photo, PDF on the device | lost-print | print/PDF on the device; the photo never reaches the node |
| The flyer's QR after "found" | lost-found | `/l/<id>` says "Found, thank you!" |
| Spot: name, closed, term, cap | spot-new, spot-mine | a new entity; the name checked as a phrase |
| Live code every minute, paper code that can change | spot-live, spot-gone, spot-mine | code rotation; an old code shows "expired" |
| Entry by code and a closed feed | spot-scan, spot-feed | membership with no list of people; the spot's feed apart from the street |
| Pinned message | spot-pin | up to 140 chars + useful lines; checked as a phrase |
| Poster with one's own picture | spot-poster | laid out on the device, the picture never leaves |
| Numbers only for the organiser | spot-mine | scans, inside, phrases — no people |
| Complaint on a phrase or spot → takedown | both sections | no complaint route for a phrase |

## 3. Count
Screens 15 of 15 analysed. Fully ready — 0; partly standing on what exists — 6 (lost-feed, lost-compose, lost-open, spot-new, spot-scan, spot-feed: feed, radius, text check, QR).

## 4. Owner's decisions 30.10
- "Lost" lives 3 days in its own slot: 1 live, up to 3 extensions; the 4 phrase slots are untouched.
- Complaint → takedown by count, as for offers (`relay/node/src/routes/offer_complaints.ts:88`).
- Spots: membership is a row (spot, identity) in a new table; the organiser sees numbers only (technique, my decision).

## 5. "Seen": no geolocation, the flow is not lost
The app has no map and no geolocation, so "seen" is a "where" line in words and a time step (now / 15 min / 1 h / earlier). The text goes through the model as a new kind `seen_note` (`relay/node/src/lib/moderator.ts:38`); a model failure refuses.

Three paths from the page `sosed.place/l/<id>`:
1. **Already signed in on this device.** The keys live in the site's IndexedDB (`depth/web-platform/vault_store.ts:27`), a page on the same address sees them; the phrase opens inside the app, the mark goes from the account, no hash, no captcha. As the place QR opens today: `app/src/shell/App.tsx:47` reads the address at load, `:212` asks over the feed after entry.
2. **Not signed in, wants to.** "Open sosed" → registration; the phrase id is held as the place QR is (`qrUsed`, `app/src/shell/App.tsx:104`), after the place screen comes this phrase, not an empty feed. New code for `/l/`.
3. **Does not want to sign in.** "I saw him" anonymously: the model, 3 refusals → a 24-hour block on marks only, by a daily hash (IP by /64 + User-Agent + language, salt changes daily). Viewing the page always works.

Weak spot: a camera scanner may open the link in its built-in browser with no keys — the person sees path 2 or 3; a hint "open in the browser where you signed in".

## 6. Privacy policy and the hash
The text in force: repository sosed.place, `landing/legal/privacy_EN.md`. Line 17: "We do not fingerprint your browser". Line 30: IP and User-Agent are technical data "for security". A daily hash of IP + browser + language with a term in the limits table is security technical data, but the word "fingerprint" argues with line 17: before code the policy needs a line on the daily hash for the anonymous marks limit (an edit in sosed.place and neighbro.place). Canvas, fonts, GPU — not taken.
