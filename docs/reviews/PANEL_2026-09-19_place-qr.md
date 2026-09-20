# Review panel 2026-09-19 — place QR (screen 26)

**Subject:** uncommitted work on day56 in three repos — `sosed.place/docs/26-place-qr_{RU,EN}.md` (new), one paragraph in `00-mechanics`, one bullet in `03-feed-screen`, one line in `04-post-composer` (neighbro.place carries verbatim copies); `xor.ad/docs/protocol_{RU,EN}.md` §4.2 paragraph, `xor.ad/docs/test-map_{RU,EN}.md` §25, `xor.ad/panel/design/sheets/screen-26-place-qr.svg`.
**Lenses:** Security (mandatory), Consistency. Two independent read-only agents, run in parallel.
**Reproduce:** `git -C ../sosed.place diff; git diff docs/protocol_RU.md docs/test-map_RU.md` before the fix commit.
**Owner decisions not under review:** any neighbour makes a QR; the cell is in the link, no code on the node; no proximity check; all five steps allowed.

## Raw — Security lens

1. Design defect — `26:54,56`, `04:19`: a 100 m QR makes the default zone 100 m, below the usual 300 m; the poster analysis (NIGHT §3.2, mechanics:493) argues the opposite for a point the person did not set; `chat_RU.md:1524` measures a 100 m cell at ~0.07 foreign phrases. A 100 m QR on a door → scanners publish into that building's cell, and "one point — one link" (`04:18`) glues all their phrases. Fix: default zone = max(QR step, 300 m).
2. Contradiction — `26:57`, `protocol_RU.md:116`: "no by-QR field, it would glue phrases" — at 100/300 m the identical node+step already glues them (`chat_RU.md:1524`). Qualify; name the cost in the warning at `26:31`.
3. Contradiction in rationale — `26:56`: "a 100 m phrase in a 1 km QR names what the QR's author hid" — the cell is public in the link (`26:20`); the rule is client-only (`26:57`) and one arrow press resets it. Restate or drop.
4. Design defect, logs — `26:7` "node knows nothing": `?p=&s=` in the query lands in storefront/CDN logs next to the IP; the poster review raised it (NIGHT §3.1 ~l.263-268). Fix: privacy line + log rule, or read `p`/`s` from the fragment `#p=…`.
5. Minor — `26:45`: the link is removed only on "not now"; after "put it here" and while it "waits in the address" (`26:64`) it stays in tab history. Clear on every outcome.
6. Not found — no `Referrer-Policy` rule for the storefront; `?p=&s=` may leak in `Referer`.
7. Not found — the poster's 25 km guard (NIGHT §3.3 l.~303-307) is not carried to screen 26; spam QRs across a city could herd scanners into one cell.
8. Not found — parsing: no sign rule, no |lat|≤90 bound, no length limit, `p=5241.1338` looks like a float. Strict regex + bounds; add to 25.2.
9. Not found — rebuilding the node needs Δλ from cos of the rounded latitude (`chat_RU.md:1517-1520`); not stated; test 25.6 should compare with `grid_round_*` (`chat_RU.md:1672`).
10. An overlaid 100 m sticker is a standing attack turning scanners' phrases into a visitor list of the building; only defence is item 1.

## Raw — Consistency lens

1. Contradiction — `26:21` poster link through the QR parser unchanged, yet registered people get a sheet (`26:41`) and a zone floor (`26:56`); posters give a line and no floor (`00-mechanics_RU.md:493`, `04:19`, `02:50`). Same in test 25.2.
2. Design defect — `26:50` new person: view circle not stated (poster gives 5 km).
3. Contradiction — neighbro copies carry verbatim `https://sosed.place/?p=…` (`26:12`) and "where sosed.place does not work yet" (`:62`); protocol names only `sosed.place/?p=` (`protocol_RU.md:117`).
4. Minor — `p=5241.1338` is the poster's 1 km example, paired with `s=2` (`26:17-18`, test 25.2).
5. Minor — the sheet uses the kit's step words (дом/улица/район/город/шире), the description only metres (`26:18,30`).
6. Minor — the sheet shows only 1 km examples, the text 300 m.
7. Possible gap — "one point — one link" (`04:19`): a QR gives everyone the same point and step, gluing strangers' and one author's phrases; 26 does not address it.
Not found: the filter panel section in 03 (`:25-31`) does not list the entry; whether the step can be lowered in screen 2's "adjust on the diagram"; a QR opened during an active table.

## Adversarial pass

Done by the lead against the files, not by a second agent (two lenses, a doc-only change): every reference was opened.
- S1, S2, S3, S7, S9: **VERIFIED** — `chat_RU.md:1522` ("на 100 и 300 метрах в клетке единицы"), NIGHT `:303-307` (25 km), `chat_RU.md:1672` (`grid_round_*`).
- S4: **VERIFIED** — the query string is sent to the server by definition; NIGHT §3.1 names the same for the poster.
- S6: **NOT VERIFIED** against live headers; closed by the design change (fragment never goes into `Referer`).
- C1, C2, C3, C5, C7: **VERIFIED** by reading the lines named. C4: kept as a note — the example indices are illustrative, not recomputed.
- Refuted: none.

## Lead's summary

Closed in the same pass:
- **S4 + S6 + C3:** the link moves to the fragment, `<storefront>/#p=&s=`. Nothing reaches a server or `Referer`, and the storefront name is no longer hard-coded.
- **S1 + S2 + S3 + S10 + C7:** the "not below the QR's step" rule is dropped. The zone default becomes the larger of the QR's step and 300 m, and the caveat is named in 26 and in protocol §4.2.
- **S5:** the fragment is removed whatever the outcome.
- **S7:** the 25 km guard is carried over.
- **S8 + S9:** a strict regex, the bounds, and the node rebuilt through `grid_round_*`; tests 25.2 and 25.2a.
- **C1:** the poster link is a separate path.
- **C2:** a new person gets a 5 km circle.
- **C4:** a new example.
- **C5:** the steps are the composer's buttons, with metres in the place line.
- The sheet is updated.

Left as-is:
- C6 (examples at 1 km) is minor.
- The three "not found" items of the Consistency lens (listed as tasks below).

## Tasks left

1. Minor: in 03, list "QR of this place" in the filter panel section (`03-feed-screen_RU.md:25-31`) as well. Cost: two lines per language, times three storefront copies.
2. Minor: decide whether a QR point's step can be lowered in screen 2's "adjust on the diagram". Today the general rule applies.
3. Minor: a QR opened with an active table (screen 7/19) — the sheet goes over the table bar. Not described.
