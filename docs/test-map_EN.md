# Test map: what to check in every flow

The spec says **what** we build (`chat_EN.md`), the diagrams say **how it moves**
(`chat-flows_EN.md`). This is the third thing: **what proves that what was built
matches what was described**.

Assembled on 2026-08-26 by walking all 22 flows.

## How to read it

Every row is a claim that can be put to a machine. Not "the module is covered",
but "this must be true, and here is the query that lies if it is not".

| State | Meaning |
|---|---|
| **have** | the test is written and its failure has been seen |
| **nothing to check** | there is no code — physically nothing to test |
| **possible now** | the code exists, the test does not; a debt, not a wait |

The **step** column is the number of the build-order step (`chat_EN.md` §13)
after which the claim becomes checkable. Do not open a row before it: it will go
red from a missing table, not from a mistake.

Three rules apply to every row, from the project's `CLAUDE.md`:

- **A test that has never failed proves nothing.** Once written, break what it
  guards, watch it go red, restore.
- **Behaviour is checked, not the schema.** "There are no messages in the
  database" is proven by a `SELECT`, not by reading a migration.
- **An open client is not a place to check anything.** Everything the client
  "does not let you do" is checked by a request that goes around it.

## What is covered today

| Where | Cases | About |
|---|---|---|
| `relay/node/test` | 348 | storefronts, panel, tenancy, DSA, keys, limits, request signature, identity routes, the PIN counter, the first PIN, recovery by paper code, freezing a session, the identity sweeper |
| `testing/e2e` | 10 | the waitlist and storefront headers |
| **Total** | **358** | **about the feed — 42 (sending, the verdict, delivery by intersecting circles, the grid and the bands, take-downs, terms, the density step, the Article 17 statement and the visible boundary sitting on the published centre and the per-identity read limit and the microsecond cursor, the counters row made on the spot `und` passing the language filter and the radius widening through the box index the capped density count, the old node during the 027 deploy the backfill on the same grid and the hourly density limit, 2026-09-21), about chat — 0; about the request signature — 12, about step 1 — 61: routes 34, the transfer 8, the sealing key 5, freezing 3, the sweeper 10 against a live Postgres, the shared brake 3 by the clock; plus 4 about connection timeouts, the sweepers for invitations and nonces, the counters a closure writes and the brake gauge read on the scrape (2026-09-21) and 5 about the queue's metrics (2026-09-20, overnight, after the review panel)** |

Five of them (`chat_stub.test.ts`) guard exactly one thing: that the chat stub
answers `501` and does nothing. That is a correct test — it will fail on the day
the chat is switched on, and remind us the map is due.

The numbers are recounted by `scripts/count-tests.sh --check` — which also compares them with this table and goes red on a mismatch. Until 2026-09-08 this named `scratchpad/count-tests.sh`, a file that has never existed here: the number could not be checked, and it had drifted (158 against 168 on the day the script appeared); the cases are declared
through three different wrappers and cannot be counted by eye.

---

## 1. The first visit: an identity is created (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 1.1 | The node holds no private halves of any key | `SELECT` across every column of `identities`: no private key anywhere | nothing to check |
| 1.2 | Name and age are `NOT NULL` from the first row | an `INSERT` without them fails in the database, not in the app | nothing to check |
| 1.2a | **A name longer than 24 graphemes is refused by the node, not truncated** | a request around the client with 25 graphemes → refused; the old name stays in the database | nothing to check |
| 1.2b | The limit counts graphemes | a name of 24 emoji with modifiers → accepted; 25 → refused | nothing to check |
| 1.2c | An age below 13 cannot be created, and there is no upper bound | an `INSERT` with 12 fails on the `CHECK`; an `INSERT` with 130 goes through | nothing to check |
| 1.2d | An obvious PIN **warns but does not lock** | registration with `000000` succeeds, the response carries a warning flag | nothing to check |
| 1.3 | Registration without a PIN creates no identity | around the client: three steps, skip the second → refused | nothing to check |
| 1.4 | The paper code is shown once and confirmed by typing two groups | without the confirmation registration does not finish | nothing to check |
| 1.5 | Every client starts as a separate identity | two clients in a row → two different `identity_id` | nothing to check |
| 1.6 | Before the first post the name is neither checked nor visible | the moderation queue is empty after registration | nothing to check |

## 2. What signs every request (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 2.1 | An unsigned request does not pass | a bare `curl` at a guarded route → refused | **held** — "the profile answers a finished registration and refuses an unsigned request" (`identity_routes.test.ts`) |
| 2.2 | A signature outside the ±5 minute window is not accepted | client clock moved 6 minutes → refused | nothing to check |
| 2.3 | **The signature covers method, host, path with query, sha256 of the body and time** (2026-09-21: host and query added, G18) | one byte of the body changed under the same signature → refused; the same signature on another host and with another cursor → refused | **held** — "a changed body breaks the signature", "a request signed for one node does not verify on another", "a cursor cannot be moved under a valid signature" (`identity_auth.test.ts`) |
| 2.4 | A frozen session is accepted **nowhere**, delivery subscription included — except a new support request when frozen by the PIN limit (`frozen_reason = pin_limit`, 2026-09-14, §8.2) | `frozen_at` set → both REST and WS refuse | **partly** — REST: "the tenth miss closes entry and leaves the share intact" (`identity_routes.test.ts`); the WS half has nothing to check, there are no sockets (G14, G15) |
| 2.5 | ECDSA P-256 works in engines without Ed25519 | `scripts/check-webcrypto-support.sh` across three engines | **have** |

## 3. The PIN, the node's share and the vault key (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 3.1 | The node checks the PIN, not the device | no share is handed out before the `auth` half is verified | **held** — "the right PIN hands over the share and resets the counter" and "a wrong PIN spends one try and says how many are left" (`identity_routes.test.ts`) |
| 3.2 | **Ten wrong PINs lock access until the paper code, the share kept** (§8.2, 2026-09-14; "burn the share, the database opens with nothing" [retired]) | ten misses → the right PIN refused ("locked"); the paper code on the same device → the old PIN opens the base | nothing to check |
| 3.3 | The counter resets only on a correct PIN | nine misses, one hit, nine more → the share survives | **partly** — "the right PIN hands over the share and resets the counter" (`identity_routes.test.ts`) proves the reset after one spent attempt; the word "only" and nine misses in a row are not covered |
| 3.3a | **The tenth mistake freezes the session with the reason `pin_limit`** (§8.2, 2026-09-14) | ten misses → a signed `POST /feed` from that session is refused; live and pending phrases, queued table lines, matches and `chat_games` taken down, table seats free; one support request a day is accepted, a second is not, the list of earlier ones is not; a session frozen by a move — refused; the recovery handle accepts the paper code and issues a new share | nothing to check |
| 3.3b | **The PIN delay grows after the fifth attempt** (§8.2, 2026-09-14) | five misses → a sixth attempt before 30 seconds is refused and `attempts_left` does not drop; ninth miss → a tenth before 4 hours is refused | **partly** — "the delay starts after the fifth miss, and waiting is not a way to test a PIN" (`identity_routes.test.ts`) holds that a delay exists and that an early attempt spends nothing; **the numbers are not covered** — the case clears the delay after every miss, which is the very thing the row measures (review panel 2026-09-20) |
| 3.3c | **A PIN attempt is atomic, a correct PIN clears the wait** (§8.2, 2026-09-14) | three parallel attempts after the wait → the counter drops once; a correct PIN during the wait is refused, after it — counter 10, no wait | nothing to check |
| 3.4 | The `local` half never leaves the device | intercept the registration traffic: only `auth` in the body | nothing to check |
| 3.5 | A share belongs to a device, not to an identity | another live session of the same identity cannot reach it | **held** — "two sessions of one identity hold two different shares" (`identity_routes.test.ts`). [retired] This used to cite "another session's share cannot be reached from this one": that case uses **two different identities** and catches the guard refusing a stranger's key, which is row 2.3, not this one (review panel 2026-09-20, consistency lens) |
| 3.6 | The warning appears with three attempts left | the seventh miss → a warning flag in the response | nothing to check |
| 3.7 | **`POST /vault/init` only against a one-time first-PIN grant** (review panel 2026-09-19) | a signing key without the grant → 409 `unauthorized`; after an approved transfer → accepted, a repeat → 409 | **held** — "the first PIN needs a grant, spends it, and works only once" (`identity_routes.test.ts`); the grant is left by both paths now: `POST /recovery/claim` and an approved transfer (`transfer_routes.test.ts`, 2026-09-21) |
| 3.8 | **A wrong PIN answers `attempts_left`, the tenth `pin_locked`** (2026-09-19) | three misses → `attempts_left` 7; the tenth → code `pin_locked` | **held** — "a wrong PIN spends one try…" and "the tenth miss closes entry…" (`identity_routes.test.ts`) |

## 4. Moving an identity to another device (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 4.1 | **One live session per identity is held by an index, not by code** | two live-session `INSERT`s → the second fails on the unique index | nothing to check |
| 4.2 | Without "it's me" on the old device nothing moves (§14) | `claim` without confirmation → the identity stayed | **held** — "a refusal kills the code and moves nothing" and "a second claim cancels the transfer" (`transfer_routes.test.ts`) |
| 4.3 | An invitation lives 120 seconds | an attempt at second 121 → refused | **held** — "an expired invitation cannot be claimed, and says so like a wrong code" (`transfer_routes.test.ts`): the term is aged in the database rather than waited out |
| 4.4 | **Claim misses are limited as recovery's, per address and across the node** (§8.2, 2026-09-15) | 50 claims with wrong codes in an hour from different addresses → the 51st is refused for everyone for 15 minutes; a mistyped code gets "the code did not fit or has expired" | nothing to check |
| 4.5 | The node sees a `lookup_id` and two opaque envelopes | node log and table contents: no long key | nothing to check |
| 4.6 | The old device freezes at the same moment | `frozen_at` set before the new one is answered | **held** — "an identity moves to another device, and the old one goes quiet" (`transfer_routes.test.ts`): one transaction, and the order inside it is the reverse of the obvious one — the old session goes quiet **before** the new one is written, or the partial unique index refuses it |
| 4.7 | The old device's disk is not wiped, but its share is burned | move the identity back → its own PIN does not open the old device's history: the move burned its share (`chat_EN.md` §8.2; edited 2026-09-15: this said "opens the whole history" [retired]) | **held, through recovery** — "a device left behind cannot open its history even with the right PIN" (`identity_routes.test.ts`): the move there is by paper code, the voluntary transfer waits on G15 |
| 4.8 | The move works across faces: code shown in `depth`, typed in the web, and back (§14) | a pair of clients, both directions | nothing to check |
| 4.8a | **`depth` does not start without its wrapper** (`depth-client_EN.md` §2.1, 2026-09-14) | the image without `DEPTH_WRAPPED=1` → refuses and says why; through the wrapper → starts, `docker inspect` gives `LogConfig.Type = none` | nothing to check |
| 4.9 | **No link and no QR: no separate page exists for the pairing** | there is no route for an invitation; the node accepts only a `lookup_id` | nothing to check |
| 4.10 | The second half of the code never leaves for the server | intercept the move traffic: only `lookup_id` and envelopes in the requests | nothing to check |
| 4.11 | **"It's me" and "doesn't match" — only by a session of the inviting identity, once** (review panel 2026-09-19) | `approve` with another signature → `not_found`; a second `approve` → `not_found`; `reject` → the code dies | nothing to check |

## 5. Recovery by the paper code (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 5.1 | **The code raises the identity on a clean device** (§14) | browser wiped → code → the same identity | **held** — "the paper code raises an identity that has no live session left" (`identity_routes.test.ts`) |
| 5.2 | **And when a live session exists** — it is frozen (§14) | recovery with a live device → `frozen_at` on the old one | **held** — "the paper code raises the identity on a clean device" (`identity_routes.test.ts`) |
| 5.3 | **The previous code stays good until the new one is confirmed** (§8.2, 2026-09-10) | reuse right after a raise → 200 again | **held** — "the paper code raises the identity on a clean device" (`identity_routes.test.ts`). [retired] This used to read "the previous code is dead after recovery → reuse → refused": the moment of its death moved to the confirmation of the new code, or a break between unwrapping the key and copying sixteen characters leaves an identity with no insurance at all |
| 5.4 | The new paper code is born **on the device**; the node never sees it | after a raise the device sends the derivatives of a new code and the old one goes out in the same transaction (`POST /recovery/reissue`) | nothing to check — the reissue route does not exist. [retired] This used to read "the response carries a new code exactly once": the node never sees a code (§8.2, 2026-08-28) and cannot hand one back |
| 5.5 | The node cannot unwrap the long key itself | only the wrapped key is stored; the second half of the code unwraps it | nothing to check |
| 5.6 | Attempts are counted by the endpoint, not by the identity row | misses from one address on different codes → the shared counter grows | nothing to check |
| 5.6a | **The shared miss counter: 50 an hour per node, a 15-minute pause** (2026-09-08) | 50 wrong paper codes in an hour from different addresses → the 51st attempt is refused for everyone for 15 minutes; after 15 minutes recovery accepts again | **held** — "fifty wrong codes across the node pause the route for everyone" (`identity_routes.test.ts`) holds the threshold and the price for an honest code; the fifteen minutes expiring, the hour-long window and knocking not extending the pause are held by the clock in `recovery_misses.test.ts` (added 2026-09-20: "recovery accepts again" used to be proved by calling `reset()`, the test answering itself) |
| 5.7 | Alphabet and parameters: 16 Crockford base32 characters, salt `xor.ad/recovery/v1`, 80 bits | a vector: the same code → the same `lookup_id` | nothing to check |
| 5.8 | Recovered chats stay silent until the key is re-issued | a message into an old chat → `error`, not silence | nothing to check |

## 6. Publishing a phrase, and moderation (step 2)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 6.1 | While `visible_at` is empty the phrase is in nobody's feed but the author's | a third party's feed does not contain it | nothing to check |
| 6.2 | `expires_at` = `visible_at` + 4:20, not the time of sending | a slow queue → the phrase's life is not eaten | nothing to check |
| 6.3 | **A queue failure closes**: nothing to check with → the phrase waits | the model is down → nothing is published | nothing to check |
| 6.3a | **One moderation threshold for all languages, not tuned per language** | the node's configuration holds a single number; a phrase's language does not change it | nothing to check |
| 6.3b | The lexicon over the original stands before the translator | abuse that translation launders is caught by the first layer (§8.3) | nothing to check |
| 6.3c | Latin script is returned to its own alphabet before language identification | `ty durak` is identified as Russian, not Slovak | **have** |
| 6.3d | **The operating point lives in the node's config, not in code** (2026-08-28) | changing the false-block budget moves the threshold with no rebuild and no retraining | nothing to check |
| 6.3e | **The number promised by the community rules matches the config** | the test reads the share from the config and from the published rules; a mismatch is red. This is exactly what diverged on 2026-08-27 and went unnoticed for half a day | nothing to check |
| 6.4 | The fifth refusal **within an hour** gives 15 minutes in which nothing goes to checking; another refusal in the same hour — another 15 minutes; feed, likes on phrases and conversations keep working (edited 2026-09-14: "15 minutes without posting" [retired]) | five refusals → `POST /feed`, a table line, a name change and an offer like with a name not yet accepted refused, `GET /feed` 200; a sixth refusal in the same hour → a new pause; an expired queue wait does not touch the counter | nothing to check |
| 6.4a | **A phrase goes to checking one at a time** (§8.3, 2026-09-14) | test "while one phrase is being checked the next is not taken", feed_publish | **yes** |
| 6.4b | **The table hold does not outlive the pause** (§8.3, 2026-09-14) | five refusals 50 minutes ago, empty queue → a line accepted; four refusals and one's own line in checking → a new one waits for the verdict | nothing to check |
| 6.4c | **The first publication is written as a UTC date, "long ago" is 24 to 48 hours** (§8.3, 2026-09-14) | a publication at 23:58 UTC → a report a day later does not count, two days later it does; a publication on the offer's day does not count | nothing to check |
| 6.5 | **A successful publication does not zero the refusal counter** (edited 2026-09-07) | four refusals, a success, one more → the mute is there. The old entry demanded the opposite and enshrined the bypass: four probes, a clean phrase, four more | nothing to check |
| 6.5b | **The "checking…" line becomes "taking longer than usual" after 60 seconds** (2026-09-08) | a phrase in the queue, 60 seconds pass → the copy changes, no refusal arrives, the phrase is still queued | nothing to check |
| 6.5a | **Stepping away lifts neither the hourly limit nor the pause** (2026-09-07) | four publications, twenty minutes away, return → `POST /feed` refused on the hourly limit | nothing to check |
| 6.6 | **A phrase goes out only when both it and the name are accepted** (2026-08-26) | name rejected → the phrase waits; name fixed → it publishes itself | nothing to check |
| 6.7 | While a phrase waits for the name, a second one cannot be sent | a second `POST /feed` → refused | nothing to check |
| 6.8 | Limits: ≤4 live phrases, ≤4 per hour (2026-08-28) | tests "four an hour counts moments…" and "four live phrases is its own limit…", feed_publish | **yes** |
| 6.9 | Taking a phrase down frees the slot but not the hourly ceiling | test "taking a phrase down frees the slot but not the hour", feed_publish | **yes** |
| 6.10 | **A phrase longer than 128 characters is refused by the database, not the app** | an `INSERT` with 129 characters fails on the `CHECK` | nothing to check |
| 6.11 | **A zone is one of five steps and nothing else** (rewritten 2026-08-31) | test "a radius between the steps is refused…", feed_publish | **yes** |
| 6.12 | A link in the text is stripped, and the person is told | a phrase with a link → the feed shows it without one, the author gets an explaining line | nothing to check |
| 6.13 | A non-empty discount turns a phrase into a private offer | a like on it yields a match at once, with none back (§8.5) | nothing to check |

## 7. Building the feed (step 2)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 7.1 | Visibility is symmetric: I see you → you see me | a pair with crossing circles, both feeds | nothing to check |
| 7.2 | `band(20) = [18,22]`, `band(21) = [19,∞)`: 20 and 21 meet, 19 and 22 do not | tests "the band is two worlds that touch at the edge" and "an adult's band has no upper edge…", feed_geo | **yes** |
| 7.3 | The band never widens, not even on an empty feed | test "the band cuts the feed, and it is never widened to fill it", feed_publish | **yes** |
| 7.4 | The user's filter is clamped into its band on write | an attempt to set it wider → the value is clamped in the database | nothing to check |
| 7.5 | Widening the radius does not change the stored setting | after widening, `radius` in the profile is unchanged | nothing to check |
| 7.6 | Cards from the widened radius are marked | test "an empty screen grows the radius, says so…", feed_publish | **yes** |
| 7.7 | The quota: no more than one commercial card per ten ordinary | a feed with twenty offers → two in the response | nothing to check |
| 7.8 | Own phrases, blocks and hidden ones are excluded | all three cases in one feed | nothing to check |
| 7.8a | **Language is a filter of up to three, not a mix of shares** | a feed filtered to `ru` holds no Greek phrases; the response carries the "N more in other languages" count | nothing to check |
| 7.8b | The node detects the language locally | the phrase's text does not leave: the node's network is silent on publication | nothing to check |
| 7.8c | **An offer is not hidden by the language filter** | filter `ru`, a Greek offer in the circle → present in the feed | nothing to check |
| 7.8d | Tables and offers arrive in the same stream, labelled | one feed carrying a phrase, an offer and a table, each with its own type | nothing to check |
| 7.9 | **The node returns a step, not an exact number** (2026-08-26) | 7 live phrases in the circle → the response says `about a dozen`, the seven appears nowhere | nothing to check |
| 7.10 | The step boundaries are exactly as written: 0 · 1–4 · 5–14 · 15–99 · 100+ | one phrase at each boundary: 4→`a few`, 5→`about a dozen`, 14→`about a dozen`, 15→`dozens` | nothing to check |
| 7.11 | The counter carries a rate limit of its own | a hundred requests in a row → refused, while the feed keeps working | nothing to check |

## 8. A like (step 3)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 8.1 | One's own phrase cannot be liked | a request around the client → refused | nothing to check |
| 8.2 | **Liking is unavailable without a live phrase of one's own** (2026-08-26) | an identity with no phrase → refused, not a silent `liked` | nothing to check |
| 8.3 | A double tap inflates no counter | two identical requests → `like_count` grew by 1 | nothing to check |
| 8.4 | The counters move in the same transaction | a crash after `INSERT likes` → no drift | nothing to check |
| 8.5 | 64 likes in 32 minutes is the ceiling | the 65th → refused | nothing to check |
| 8.6 | The client is never told who it liked | the response carries only `{state}` | nothing to check |
| 8.7 | **The author sees their phrase's `like_count` as the same number everyone else does** | the author's response and a stranger's carry one value | nothing to check |
| 8.8 | **Who liked is disclosed neither to the author nor to anyone** | the response for one's own phrase holds no list and no trace of a particular like | nothing to check |

## 9. The match and the double consent (step 4)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 9.0 | **"Not now" clears the card for the refuser only** (2026-08-28) | `declined_at` is set; the other participant's response is unchanged and the match's span is the same | nothing to check |
| 8.9 | **The accepted revision is checked by hash** (2026-08-29) | editing a document file → identities holding the old hash are shown the documents again; without an edit they are not | nothing to check |
| 8.10 | **A document's date is held against its text** (2026-08-29) | text edited without the date → red; date edited without the text → red; both → "new revision", the deploy waits for a decision | `deploy/check-legal-revisions.py`, self-test `--self-test` |
| 8.11 | **The `legal_reacceptance_required` refusal** (2026-08-29) | the terms changed → publishing and opening a chat refused with 409, feed delivery unchanged; the guidelines changed → no refusal, a log row appears on its own | nothing to check |
| 8.12 | **A sticker carries a name into all three faces** (2026-08-29) | the terminal prints `[name]`, the reader speaks the same word, the node receives neither name nor image — only an identifier inside the ciphertext | nothing to check |
| 8.13 | **The discount has its own term, the card has its own** (2026-08-29) | `discount_until` is required and ≤90 days; the card leaves the feed after 4:20, a saved one lives on and greys into "the term has passed" past `discount_until` | nothing to check |
| 8.14 | **The board moves from a keyboard and speaks in words** (2026-08-29) | arrows+Enter move a piece without a mouse; the other's move arrives as "put a piece on e4"; a free table announces adjacency, physics announces "flicked" | nothing to check |
| 8.15 | **Play-again and undo take everyone's agreement** (2026-08-29) | one of two at a table agrees — nothing happens; all agree — one step back; all decline to play again — the board closes; in a pair one leaves — the game ends; at a table one remains — the table lives | nothing to check |
| 8.16 | **A table spends no quota** (2026-08-30) | four live phrases plus a table put up → a fifth phrase is still refused and the table stands; the table goes → the quota is unchanged | nothing to check |
| 8.17 | **A break takes what is in the queue too** (2026-08-30) | a phrase sent and not yet judged → after leaving it is in neither the feed nor the queue, and the quota is free | nothing to check |
| 8.18 | **Coordinates in a response are rounded to a cell** (2026-08-31, tightened the same day) | two phrases by one author, same radius, same cell arrive with **identical** `lat`/`lon`; in the database they differ **in latitude as well as longitude** — otherwise the test stays green against a naive cosine of the exact latitude; the intersection is computed from the exact ones | nothing to check |
| 8.19 | **The radius is a step and nothing else** (2026-08-31) | `area_radius = 437` → refused at publication; 300 and 1000 pass | nothing to check |
| 9.1 | A match is born only while **both** phrases live | one expired → the like yields no match | nothing to check |
| 9.2 | The match TTL is `least()` of both phrases, with no safety floor | a phrase with 3 minutes left → a 3-minute match | nothing to check |
| 9.3 | A new mutual like does not extend the match | a like near the end → the same `expires_at` | nothing to check |
| 9.4 | No chat if one accepted and the other did not make it | the timer ran out → neither `chats` nor a row | nothing to check |
| 9.5 | The text snapshot is taken at the match, not at the opening | the phrase expired in between → the card still shows the text | nothing to check |
| 9.6 | A race on the second acceptance creates no second chat | two simultaneous `accept`s → one `chat_id` | nothing to check |
| 9.7 | An identity closed between the two consents yields no chat | `closed_at` on one → no `INSERT chats` | nothing to check |
| 9.8 | A block on a pending match puts it out immediately | block → the match is gone, as if expired | nothing to check |
| 9.9 | **The paper code is not asked for at this step** (2026-08-26) | an identity's first chat opens with no extra screen | nothing to check |
| 9.10 | **Whoever accepted first is told nothing about the other's action** | their response carries neither the peer's `accepted_at` nor any sign of a view | nothing to check |
| 9.11 | The card returns name, age, mode and the remainders of both phrases (one for a match from an offer) — and nothing else (edited 2026-09-14: "timer" [retired]) | the response holds neither the peer's `identity_id` nor their other phrases | nothing to check |
| 9.12 | No match opens while the name stands rejected | `name_state = rejected` → a mutual like creates no card | nothing to check |
| 9.13 | **"Not now" is written at once and undone only within the undo seconds** (2026-09-19) | `POST /matches/{id}/decline` → declined; `DELETE` in time → back; after it → refused | nothing to check |

## 10. A match from an offer is one-sided (step 4)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 10.1 | Liking an offer creates a match at once, with no like back | one side → `matched` | nothing to check |
| 10.2 | The offer's author may decline, and there is no chat | the author refuses → no chat | nothing to check |
| 10.3 | `message_id` and `text_snapshot` are optional | a match from an offer with no phrase of one's own passes | nothing to check |
| 10.4 | The TTL follows the only live phrase — the offer | the offer expired → the match went out | nothing to check |
| 10.5 | Venue offers carry no like at all | an attempt to like → refused | nothing to check |
| 10.6 | **An offer can be liked with no live phrase of one's own** | an identity with no phrases likes an offer → the name goes to the queue, the match is created after an "accepted" verdict; name refused → no match (S7, 2026-09-14); the same identity likes an ordinary phrase → refused | nothing to check |
| 10.7 | **Age bands do not cut venue offers** | a 15-year-old and a 40-year-old see the same offer in range | nothing to check |
| 10.8 | A private offer disappears on stepping away, with the phrases | "step away" → the offer is gone from the feed | nothing to check |

## 11. Opening a chat, and the keys (step 6)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 11.1 | The identity's long key takes no part in encryption | a leaked long key does not decrypt intercepted ciphertext | nothing to check |
| 11.2 | A chat's death erases `K`, the ephemeral keys and the wraps | saved ciphertext cannot be decrypted afterwards | nothing to check |
| 11.3 | Keys of live chats are not rotated on a move | after a move `chat_key_wraps` are unchanged | nothing to check |
| 11.4 | A re-issue requires a signature by the **long key**, not chat membership | signed by the session → the other side refuses | nothing to check |
| 11.5 | A re-issue requires the other side's consent | refusal → the chat stays silent | nothing to check |
| 11.6 | The safety code does not change on a re-issue | it comes from the long keys — compare before and after | nothing to check |
| 11.7 | The old `K` is not recoverable by anything after a re-issue | the previous device cannot read new messages | nothing to check |

## 12. A message (step 5)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 12.1 | **No plaintext in the database, and the queue is empty after delivery** (§14) | a direct `SELECT` over every table, `pending_deliveries` empty | nothing to check |
| 12.2 | The only database read on the path is the membership check | the query log during delivery | nothing to check |
| 12.3 | A non-participant cannot post into a chat | another session's signature → refused | nothing to check |
| 12.4 | **The ciphertext byte limit is enforced by the node** (§14, `max_ciphertext_bytes` = 2048) | a request around the client with 2049 bytes → refused | nothing to check |
| 12.5 | `max_message_length` = 256 is a client counter, not a node rule | 300 characters that fit into 2048 bytes are accepted | nothing to check |
| 12.6 | **A message to an offline peer yields `accepted` and waits for their return** (§14) | the recipient is on no node → `ack {accepted}`, a queue row, handed over on connect | nothing to check |
| 12.7 | A retry with the same `local_id` produces no duplicate | two sends → one message on screen | nothing to check |
| 12.8 | The pause grows ×3: at once, 5 s, 15 s, 45 s, 135 s, ceiling ~10 min | measure the intervals in a row | nothing to check |

## 13. The life and death of a chat (step 7)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 13.1 | **Each side has its own span, counted from their own last message** | Petya 10 min, Kolya an hour; Petya silent for 11 → `gone_at` for Petya, alive for Kolya | nothing to check |
| 13.2 | The other side's span and remainder are not handed out | the open response carries neither the peer's value nor their `gone_at` time | nothing to check |
| 13.3 | The span changes inside an open conversation at any time | 10 → 60 on a live conversation → accepted, recounted from the same `last_own_message_at` | nothing to check |
| 13.3a | The other person's message does **not** reset my count | Kolya writes every 5 minutes, Petya stays silent for 11 → it ended for Petya | nothing to check |
| 13.4 | **Your own move pushes your own count exactly as your own message** | only your moves, an hour of verbal silence → the conversation lives for the one who moved | nothing to check |
| 13.4a | **Their move does not push my count** | the peer moves, I only watch → the conversation ends for me on my span | nothing to check |
| 13.4b | Board and key go out for both at the first death | the other still counts the conversation alive, the board is already gone | nothing to check |
| 13.5 | **The conversation disappears for whoever's span ran out** (§14) | after the first `alive` check it is empty for them, the other's history intact | nothing to check |
| 13.5a | **The key and the board go out for both at the first death** (§8.13) | `chat_key_wraps` empty for both, while the other's history still reads | nothing to check |
| 13.5b | Neither side can write into an ended conversation | sending around the client from both sides → the node refuses | nothing to check |
| 13.5c | The node deletes `chats` only once `gone_at` is set for both | after the first death the row is there; after the second it cascades | nothing to check |
| 13.6 | **Whoever was looking keeps the headstone until "close", and it does not return to the list** (§14) | the chat is on screen at the moment of death | nothing to check |
| 13.7 | One chat per pair is held by a unique `pair_key` | a second `INSERT` → conflict | nothing to check |
| 13.8 | After death the `pair_key` is released | the same pair matches again | nothing to check |
| 13.9 | The server knows only **when** there was movement | `chats` holds no text, no author, no count | nothing to check |
| 13.10 | **"End it" closes for both at once, unlike expiry** | one presses → `gone_at` is set for the other too | nothing to check |
| 13.11 | The safety code derives from both identities' long-term keys | it matches on both sides; a chat-key re-issue does not change it (§8.13) | nothing to check |
| 13.12 | With the peer stepped away a label sits above a live input, and a send is accepted and waits in the queue (edited 2026-09-14: "the input is replaced and the node refuses sends" [retired]) | a send to the stepped-away peer → accepted into `pending_deliveries`; the conversation ended for them before the return → the queue rows are deleted | nothing to check |
| 13.12a | **The "stepped away" label is a participant boolean** (§8.2, 2026-09-14) | leaving → `away_marked` in all live conversations; early return does not clear it; a message or move in the conversation does; only `peer_stepped_away` goes out | nothing to check |
| 13.12b | **A silent participant's span counts from the conversation's creation** (§8.6, 2026-09-14) | no own message → `gone_at` arrives at `created_at + idle_ttl_minutes`; the client receives `created_at` on opening | nothing to check |

## 14. An extra like into an open chat (step 7)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 14.1 | A like with a chat already open creates no new match | `matches` did not grow | nothing to check |
| 14.2 | The `chat_starters` row outlives the bubble | local history wiped → the `position` is still there | nothing to check |
| 14.3 | The wording is computed for the viewer | two clients see different texts of one event | nothing to check |
| 14.4 | The card number matches the number in the `Liked, in order` header | compare the positions | nothing to check |

## 15. A game and a table (step 8)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 15.1 | The board syncs encrypted and stays opaque to the node | intercept: the board state is unreadable | nothing to check |
| 15.2 | **The exception is named: the node sees decks and dice** (2026-08-26) | shuffling happens on the node, the one place where §8.13 does not hold | nothing to check |
| 15.2a | **A sticker is invisible to the node: its id sits inside the ciphertext** | intercept a line with a sticker → no identifier in the clear | nothing to check |
| 15.2b | **Sticker packs are fetched at app start** (2026-09-14) | network log: catalogue requests only in the first seconds after start; opening a conversation and receiving a sticker produce none | nothing to check |
| 15.3 | A private hand arrives encrypted to its own player | the other sees backs, not cards | nothing to check |
| 15.4 | Physics converges for both on a shared seed | one flick → the same final position | nothing to check |
| 15.5 | The word to guess goes through the moderation queue | a forbidden word → "think of another one" | nothing to check |
| 15.6 | A game is described by primitives: a new game is added by description, not by code | add a set without touching the engine | nothing to check |
| 15.7 | The game cache leaves with the conversation | delete `chats` → `SELECT` in `chat_games` empty (cascade, not span) | nothing to check |
| 15.8 | **Table:** bands are checked each with each | sitting down outside one sitter's band → refused | nothing to check |
| 15.9 | **Table:** a newcomer gets no history | the board as it stands, talk from the moment of sitting | nothing to check |
| 15.10 | **Table:** talk is public and goes through the queue | a line shows after the check, not before | nothing to check |
| 15.11 | **Table:** the majority removes a sitter, nobody owns it | whoever set up the table cannot remove alone | nothing to check |
| 15.12 | **Table:** a block separates at the seat (edited 2026-09-14: "hides the whole table" [retired]) | a table with the blocked person is not shown; you cannot sit with them nor they with you; already at one table → whoever blocked leaves, the game goes on for the others, their move is a pass on `table.move.window` | nothing to check |
| 15.13 | **Table:** one span for everyone, from anyone's last move | one plays while others stay quiet for an hour → the table lives for all | nothing to check |
| 15.14 | **Table:** speech and board travel in the clear, the node sees them | a line at a table is readable by the node — otherwise the queue has nothing to check | nothing to check |
| 15.15 | **Table:** the band is its current sitters' and is recomputed (2026-09-08) | two adults at a table → a teenager gets no table in the feed; one leaves and the band differs → the table appears; a table with nobody at it is shown to no one. In both cases the feed **has no table**, rather than "has it, greyed out" | nothing to check |
| 15.16 | **An Article 16 notice is accepted about a line at a table** (2026-08-28) | `target_kind = table_line` goes through; the snapshot holds the line's text and `table_id` | nothing to check |
| 15.16a | **A table report without the box only hides for oneself** (2026-09-14) | a report without the box → the line hidden for the reporter, no new row in the notice register; with the box → a `table_line` row exists | nothing to check |
| 15.17 | **The board does not go into a notice's snapshot** | the line's snapshot holds no state of the match: it is the text that can be unlawful, not the game | nothing to check |

## 16. Three different actions against a person (step 7)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 16.1 | Hiding is visible only to the one who hid | the author's feed and like counter unchanged | nothing to check |
| 16.1a | **Hiding sends nothing into the moderation queue** | after hiding, the queue is empty and the phrase's report counter has not grown | nothing to check |
| 16.5a | **A report without a justification is not accepted** | a notice `POST` with empty text → refused, no record | nothing to check |
| 16.5b | **There is no offence category in the form** | the notice schema has no category field and the API does not accept one | nothing to check |
| 16.2 | A block is symmetric | neither of the two sees the other's phrases | nothing to check |
| 16.3 | A block closes the shared chat | the chat is gone for both | nothing to check |
| 16.4 | A like under a block yields no match | mutual likes → no match | nothing to check |
| 16.5 | A report closes nothing by itself | after the report the phrase is alive | nothing to check |
| 16.5c | **Neither reporting nor blocking changes the author's quota** | before and after: the live-phrase ceiling is the same, so is the hourly one | nothing to check |
| 16.6 | A report carries the reporter's words, not a copy of the conversation | the client uploads nothing, `snapshot_state = not_accessible` | nothing to check |
| 16.7 | **A content report through support lands in the same register** | a message describing something illegal → a record in the notices register, not in the support table | nothing to check |
| 16.8 | **The answer is shown in the app at the next visit, with no email** | a message with no address → the answer waits with the identity and appears on entry | nothing to check |
| 16.8a | **The request number is not a key** (§13, 2026-09-14) | `GET` of an answer by `public_no` unsigned or signed by another identity → empty; the numbers of two consecutive requests are not neighbours | nothing to check |
| 16.8b | **Three requests a day, a fourth refused with an email address** (§13, 2026-09-14) | three `POST` → accepted; a fourth → refused, the storefront's support address in the body; a day later — accepted | nothing to check |
| 16.8c | **The team gets a daily digest with no text** (§13, 2026-09-14) | ten requests in a day, one from a frozen session → one letter with three numbers, not a line from `body` | nothing to check |
| 16.8d | **The request cap holds under parallel requests** (§13, 2026-09-14) | two requests exist, two parallel `POST` → one accepted | nothing to check |
| 16.8e | **A second answer lights the dot again** (§13, 2026-09-14) | an answer read, a second one written → `answer_seen = false` | nothing to check |
| 16.9 | **A notice decision is visible by receipt with no email** (`dsa/SPEC_EN.md` §6, 2026-09-14) | a notice with no email → the node holds only `receipt_hash`; once decided → a request with the code shows it | nothing to check |
| 16.9a | **A receipt cannot be guessed** (§6) | an unknown code and "not decided yet" → status 200 for both, bodies identical byte for byte, `Cache-Control: no-store`, response time no less than one shared minimum on both branches; the code sent in a `POST` body; no address in the log | nothing to check |
| 16.9b | **The receipt hash goes with the notice** (§9) | `prune_dsa_records` after a year → neither the notice nor `receipt_hash` remains | nothing to check |

## 17. Changing the name and the age (step 1, fully — from step 2)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 17.1 | An accepted name is frozen while a phrase or a chat lives | an edit → refused | nothing to check |
| 17.2 | A rejected name is always editable | an edit passes with a live phrase | nothing to check |
| 17.3 | A refused name is not stored, the previous one keeps working | after a refusal the profile holds the old one | nothing to check |
| 17.4 | A name change sends no system messages | the chats are silent | nothing to check |
| 17.5 | Age 20 → 21 is allowed and irreversible | back again → refused | nothing to check |
| 17.6 | On an age change the filter is re-clamped into the new band | the stored values are clamped | nothing to check |
| 17.7 | An age change sends a system message into every open chat | the line appeared for the peers | nothing to check |
| 17.8 | Re-asked once a year, and silence changes nothing | a year later with no answer → the same age, no blocks | nothing to check |
| 17.9 | **The paper code is re-issued only on presenting the current one** | a request without it → refused; with the right code → a new one issued, the old one dead | nothing to check |
| 17.10 | Changing the PIN re-encrypts the base and takes a new share | the old PIN opens nothing afterwards | nothing to check |
| 17.11 | "Start over" closes the identity rather than deleting the row | `closed_at` set, phrases out of the feed, the paper code no longer raises it | nothing to check |

## 18. The inbox (step 8)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 18.1 | There is no `notifications` table | the table list | nothing to check |
| 18.2 | The inbox is derived from `matches`, `chats`, `chat_starters`, `last_activity_at` | all five reasons on one dataset | nothing to check |
| 18.3 | No push leaves anywhere, in any face | the network is silent with the tab closed | nothing to check |
| 18.4 | A missed message is inferred, its text is not recovered | the "you missed one" line is there, the text is not | nothing to check |
| 18.5 | A burnt match never appears in the inbox | expired while the client was closed → it is not there | nothing to check |
| 18.6 | **Fading counts from my own silence, not from shared activity** | the peer writes every minute while I stay silent → my inbox marks the conversation as fading | nothing to check |
| 18.7 | A counter is returned only for offers awaiting my answer | the inbox response carries no number for open conversations | nothing to check |

## 19. Three timers and the cleanup (step 7)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 19.1 | A phrase's expiry takes its likes with it | `likes` is empty | nothing to check |
| 19.2 | `chat_starters` outlive the death of the source phrase | the text was copied, not referenced | nothing to check |
| 19.3 | A chat's death cascades participants, starters and wraps | four tables empty | nothing to check |
| 19.4 | **`POST /chats/alive` answers 503 on an unreachable database and the client deletes nothing** (§14) | Postgres down → the local history survives | nothing to check |
| 19.5 | One `alive` check settles an expired TTL, a closed identity, a block and "away for a month" | four reasons in one response | nothing to check |

## 20. Delivery between nodes (step 5)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 20.1 | **A conversation survives a node restart** (§14, replacing the two-node criterion) | the node is killed mid-way → clients reconnect, the history is the same | nothing to check |
| 20.2 | A message reaches participants on different nodes | two boxes on a shared database — **once the pool exists** | nothing to check |
| 20.3 | A node with no socket for the recipient does nothing | the third node's log is empty | nothing to check |
| 20.4 | The message payload fits the 8 KB `NOTIFY` | a message of maximum length passes | nothing to check |

## 21. The ladder of disclosure (step 4)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 21.1 | The feed carries nothing about the author | the response holds no `identity_id`, no name, no age | nothing to check |
| 21.2 | Name and age appear exactly at the match card | responses before and after | nothing to check |
| 21.3 | Another person's `identity_id` is never handed out | in no API response | nothing to check |
| 21.4 | Who liked is never handed out | the phrase's response carries only a number | nothing to check |
| 21.5 | Two phrases by one person cannot be linked from outside | no shared key in the feed | nothing to check |

## 22. Stepping away (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 22.1 | Phrases are deleted, not hidden | `SELECT` — no rows; quota slots free at once | nothing to check |
| 22.2 | Matches go out and the other side learns no reason | the offer vanished with no explanation | nothing to check |
| 22.3 | Chats are not frozen: the TTL runs | `last_activity_at` did not move | nothing to check |
| 22.4 | The session's sockets close the same way as on a freeze | the connection is torn down by the node | nothing to check |
| 22.5 | The peer in an open chat sees a `stepped_away` label above a live input | the only exception to "we do not report presence"; lifted by the first message or move, not by the span (2026-09-14) | the span ran out with no message — the label stays; the returner wrote — no label; the peer's message sent during the step-away is delivered on connection |
| 22.6 | The in-app timer never reaches the node | neither a column nor a request next to the identity | nothing to check |
| 22.7 | Leaving early works, the frequency is not capped | three departures in a row → no refusal | nothing to check |
| 22.8 | **A table survives its founder's break while they stand up from it** | "step away" → the table is in the feed, the leaver is not among the sitters | nothing to check |
| 22.9 | A private person's offer goes with the phrases | "step away" → the phrase with a discount is deleted | nothing to check |

---

## What can be checked today

**The first table arrived on 2026-09-20** — migration
`relay/node/db/022_identity_and_sessions.sql` put `identities`, `sessions`,
`vault_shares`, `nonces`, `legal_acceptances` and `identity_appearance` in the
database (measured: `scripts/check-facts-schema.sh` sees 15 tables against 9 before
it). Row **1.1** is therefore no longer "nothing to check": a `SELECT` across every
column of `identities` can now be run. Beyond it, **2.5** is checkable (the WebCrypto
measurement — done, `scripts/check-webcrypto-support.sh`) and, indirectly, **the whole
rest of the list** — through `chat_stub.test.ts` guarding the `501`. Everything else
waits for its §13 step, and that is a state rather than an excuse: there are no
product routes yet, `/feed` answers 404 and `/chat` answers 501.

That is exactly why the map comes before the code. When the first table appears
there will be nothing to argue about: the list is already written and derived from
the spec, not from whatever turned out to be convenient to check.

## 23. The contract: version, error shape, pagination, stepping away, blocks (2026-09-16)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 23.1 | A request without `x-protocol-version` or with an unsupported one → 400 `protocol_version_unsupported`, the update command in `message` (protocol §6) | two requests to any signed route | nothing to check |
| 23.2 | A signed route's refusal is `{error: {code, message, reason?}}`; a 429 carries `Retry-After` in seconds (§6) | exceed `identities.create.hour` and read the body and the header | nothing to check |
| 23.3 | `GET /feed` and `GET /inbox` answer `{items, next}`; `?after=<next>` neither repeats nor skips rows when a phrase fades between pages (§6) | two pages with a phrase withdrawn in between | nothing to check |
| 23.4 | Tables come on the first page only, `kind: table`; `items` under a cursor hold none (§4.2) | a second page with live tables | nothing to check |
| 23.5 | While stepped away every signed request except `DELETE /away`, `GET /identities/me` and `POST /identities/close` → 409 `stepped_away` (§4.9) | `POST /away`, then `GET /feed` and `POST /chats/:id/ticket` | nothing to check |
| 23.6 | `POST /blocks` → 204 always, a repeat → 204; `DELETE /blocks/:id` → 204 on a foreign `id` too; tables are recomputed only on the next entry into the feed (§4.8) | three requests and `GET /feed` before and after | nothing to check |
| 23.7 | `POST /hidden {feed}` → `{id}`, `DELETE /hidden/:id` brings the phrase back; `{line}` is accepted only from the complaint form without the checkbox (§4.8) | hide, bring back, compare `GET /hidden` | nothing to check |
| 23.8 | A repeat of any of the seven §2 routes (`/tables`, `/away`, `/support`, `/recovery/reissue`, `/identities/close`, `/vault/pin`, `/blocks`) with the same `nonce` within ten minutes answers the first answer and does not act twice (§2) | two identical requests | nothing to check |
| 23.9 | A move with a foreign board version → 409 `stale_seq`; the same body at the same `seq` → the same board (§4.6) | three moves in a row | nothing to check |
| 23.10 | The feed filter: any `min <= max` inside the band is accepted, outside the band → `filter_out_of_band` (§4.11; steps lifted 2026-09-17) | `PATCH /identities/me` with 21–23 for a 40-year-old — 200; with 15–30 — 400 | nothing to check |
| 23.11 | What is liked leaves the delivery: after `POST /feed/:id/like` the phrase is absent from this person's `GET /feed` but present in `GET /likes` with `state: liked`; after `DELETE` it is back (2026-09-17) | a like, two deliveries, a take-back | nothing to check |
| 23.12 | A table like: `POST /tables/:id/like` does not seat (`GET /tables/:id` without a seat — 404), `like_count` +1 is seen by those seated, the table is in `GET /likes`; a repeat the same; `DELETE` → 204 and −1 (2026-09-17) | two people, one seated | nothing to check |
| 23.13 | A table name: `POST /tables` with `name` — the table is delivered at once without `name`, after the queue's verdict `name` is there; refused — a `name_verdict` frame with `table` to the author, the table lives; 25 graphemes → 400 (2026-09-17) | three settings | nothing to check |

## 24. Offers (step 10, `offers/SPEC_EN.md`, protocol §4.13)

| # | What must be true | What proves it | State |
|---|---|---|---|
| 24.1 | The cabinet lives on its own origin, the `__Host-adv` cookie never goes to the storefront (SPEC §2.1, 2026-09-19) | a storefront request with a cabinet session → no cookie in it | nothing to check |
| 24.2 | Every cabinet request checks ownership, not the role (SPEC §2.1) | another's `venue_id` in `PATCH /adv/venues/{id}` → refused | nothing to check |
| 24.3 | Only a `verified` venue publishes; the automatic checks refuse with a reason (§6.1) | `unverified` → refused; a shortener in the link → 422 with a reason | nothing to check |
| 24.4 | The envelope code: a wrong one — 422 and the attempt counted, a burnt one — 409 (§2.1) | a run of wrong ones → the code burnt → 409 | nothing to check |
| 24.5 | "It's not us" answers 204 to any code and spends the same counter as entering the code (§11, 2026-09-19) | wrong codes in `not-us` burn the code for `/verify` | nothing to check |
| 24.6 | A discount complaint counts by the complainant's first publication, the value frozen (§3, §10) | a complainant without a publication older than a day → 202 with `counts_towards_autohide: false` | nothing to check |
| 24.7 | Three counting complaints from different people hide the offer (§10) | three → `hidden`; two and one not counting → `active` | nothing to check |
| 24.8 | Two counting link reports disable it at once, a non-counting one goes to the moderator (§10.1) | two at once → `redirect_disabled_at` set once | nothing to check |
| 24.9 | `/o/{code}/go`: `no-store`, `no-referrer`, previews not counted, an unknown code — 404 (§6.2, 2026-09-19) | response headers; `HEAD` does not change `redirect_hits` | nothing to check |
| 24.10 | A published offer is never edited; "show again" is a new one with `repeated_from` (§3.1, §8) | no edit of a published one; a repeat → a new row | nothing to check |

## 25. Place QR (screen 26, protocol §4.2, 2026-09-19)

| # | What must be true | What proves it | State |
|---|---|---|---|
| 25.1 | Making a QR sends no request to the node | the browser's network log on "make QR", "share", "save as picture" → empty | nothing to check |
| 25.2 | Fragment parsing is strict; a broken one — the ordinary feed without a sheet; the cell's node equals `grid_round_lat/lon` | an input table: `#p=17472.4457&s=2`, `s=0`, `s=6`, `p=abc`, `p=1.5e9.1`, latitude beyond ±90°, negative indices; the rebuilt node against `grid_round_*` (`chat_EN.md` §8.3) | nothing to check |
| 25.2a | The QR never reaches a server: the storefront and CDN logs hold no `p`/`s`; a poster link `?p=&w=&l=` keeps its own rules | open a QR → the storefront request has no fragment; a poster → a line over the feed, not a sheet | nothing to check |
| 25.3 | An opened QR never moves the point by itself, does not change the view radius, offers no point beyond 25 km; the fragment is removed whatever the outcome | open a QR → the point is unchanged; "put it here" → the point at the cell's centre, the radius unchanged; a cell 30 km away → no "put it here"; after the sheet → the address has no `#` | nothing to check |
| 25.4 | The zone of a phrase at a QR point: by default the larger of the QR's step and 300 m | a 1 km QR → 1 km; a 100 m QR → 300 m; move the point → the usual rules | nothing to check |
| 25.5 | The node cannot tell a phrase came by a QR: the `POST /feed` body has the same keys as any phrase | compare the body's keys with a phrase without a QR → equal; no `place`/`qr` field in `openapi.yaml` | nothing to check |
| 25.6 | One cell and step give one link, whoever makes it | two profiles, one point and step → the link strings are equal | nothing to check |

## Read together with

- [`chat_EN.md`](chat_EN.md) — the spec: §13 build order, §14 acceptance criteria.
- [`chat-flows_EN.md`](chat-flows_EN.md) — the same flows, drawn.
- [`retired-terms.txt`](retired-terms.txt) — wordings a decision retired; checked
  by `scripts/check-retired-terms.sh`.
- `scripts/check-mermaid.sh` — parses every diagram in `docs/*.md` inside a
  container: a broken picture stays silent on GitHub, the script names it.
- [test-map_RU](test-map_RU.md)
