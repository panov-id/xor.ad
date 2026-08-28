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
| `relay/node/test` | 158 | storefronts, panel, tenancy, DSA, keys, limits |
| `testing/e2e` | 10 | the waitlist and storefront headers |
| **Total** | **168** | **about chat and feed — 0** |

Five of them (`chat_stub.test.ts`) guard exactly one thing: that the chat stub
answers `501` and does nothing. That is a correct test — it will fail on the day
the chat is switched on, and remind us the map is due.

The numbers are recounted by `scratchpad/count-tests.sh`; the cases are declared
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
| 2.1 | An unsigned request does not pass | a bare `curl` at a guarded route → refused | nothing to check |
| 2.2 | A signature outside the ±5 minute window is not accepted | client clock moved 6 minutes → refused | nothing to check |
| 2.3 | The signature covers method, path, sha256 of the body and time | one byte of the body changed under the same signature → refused | nothing to check |
| 2.4 | A frozen session is accepted **nowhere**, delivery subscription included | `frozen_at` set → both REST and WS refuse | nothing to check |
| 2.5 | ECDSA P-256 works in engines without Ed25519 | `scripts/check-webcrypto-support.sh` across three engines | **have** |

## 3. The PIN, the node's share and the vault key (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 3.1 | The node checks the PIN, not the device | no share is handed out before the `auth` half is verified | nothing to check |
| 3.2 | **Ten wrong PINs burn the share, and the database opens with nothing** (§14) | on a live node: ten misses, then the right PIN → the base is dead | nothing to check |
| 3.3 | The counter resets only on a correct PIN | nine misses, one hit, nine more → the share survives | nothing to check |
| 3.4 | The `local` half never leaves the device | intercept the registration traffic: only `auth` in the body | nothing to check |
| 3.5 | A share belongs to a device, not to an identity | another live session of the same identity cannot reach it | nothing to check |
| 3.6 | The warning appears with three attempts left | the seventh miss → a warning flag in the response | nothing to check |

## 4. Moving an identity to another device (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 4.1 | **One live session per identity is held by an index, not by code** | two live-session `INSERT`s → the second fails on the unique index | nothing to check |
| 4.2 | Without "it's me" on the old device nothing moves (§14) | `claim` without confirmation → the identity stayed | nothing to check |
| 4.3 | An invitation lives 120 seconds | an attempt at second 121 → refused | nothing to check |
| 4.4 | **The sixth attempt burns the invitation** (§14) | five misses, then the correct code → refused | nothing to check |
| 4.5 | The node sees a `lookup_id` and two opaque envelopes | node log and table contents: no long key | nothing to check |
| 4.6 | The old device freezes at the same moment | `frozen_at` set before the new one is answered | nothing to check |
| 4.7 | The old device's disk is not wiped | move the identity back → its own PIN opens the whole history (§14) | nothing to check |
| 4.8 | The move works across faces: code shown in `depth`, typed in the web, and back (§14) | a pair of clients, both directions | nothing to check |
| 4.9 | **No link and no QR: no separate page exists for the pairing** | there is no route for an invitation; the node accepts only a `lookup_id` | nothing to check |
| 4.10 | The second half of the code never leaves for the server | intercept the move traffic: only `lookup_id` and envelopes in the requests | nothing to check |

## 5. Recovery by the paper code (step 1)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 5.1 | **The code raises the identity on a clean device** (§14) | browser wiped → code → the same identity | nothing to check |
| 5.2 | **And when a live session exists** — it is frozen (§14) | recovery with a live device → `frozen_at` on the old one | nothing to check |
| 5.3 | The previous code is dead after recovery | reuse → refused | nothing to check |
| 5.4 | Recovery issues a new paper code | the response carries a new code exactly once | nothing to check |
| 5.5 | The node cannot unwrap the long key itself | only the wrapped key is stored; the second half of the code unwraps it | nothing to check |
| 5.6 | Attempts are counted by the endpoint, not by the identity row | misses from one address on different codes → the shared counter grows | nothing to check |
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
| 6.4 | The fifth refusal in a row gives 15 minutes without posting; feed, likes and chats keep working | five refusals → `POST /feed` refused, `GET /feed` 200 | nothing to check |
| 6.5 | A successful publication zeroes the refusal counter | four refusals, a success, four more → no mute | nothing to check |
| 6.6 | **A phrase goes out only when both it and the name are accepted** (2026-08-26) | name rejected → the phrase waits; name fixed → it publishes itself | nothing to check |
| 6.7 | While a phrase waits for the name, a second one cannot be sent | a second `POST /feed` → refused | nothing to check |
| 6.8 | Limits: ≤5 live phrases, ≤8 in 64 minutes | the sixth live one → refused; the ninth in an hour → refused | nothing to check |
| 6.9 | Taking a phrase down frees the slot but not the 64-minute ceiling | take down and repost in a loop → the ceiling holds | nothing to check |
| 6.10 | **A phrase longer than 128 characters is refused by the database, not the app** | an `INSERT` with 129 characters fails on the `CHECK` | nothing to check |
| 6.11 | **A zone outside 100–10000 metres cannot be created** | an `INSERT` with `area_radius = 50` and with `20000` fails on the `CHECK` | nothing to check |
| 6.12 | A link in the text is stripped, and the person is told | a phrase with a link → the feed shows it without one, the author gets an explaining line | nothing to check |
| 6.13 | A non-empty discount turns a phrase into a private offer | a like on it yields a match at once, with none back (§8.5) | nothing to check |

## 7. Building the feed (step 2)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 7.1 | Visibility is symmetric: I see you → you see me | a pair with crossing circles, both feeds | nothing to check |
| 7.2 | `band(20) = [18,22]`, `band(21) = [19,∞)`: 20 and 21 meet, 19 and 22 do not | a table of ages, both feeds | nothing to check |
| 7.3 | The band never widens, not even on an empty feed | empty result → the radius grew, the band did not | nothing to check |
| 7.4 | The user's filter is clamped into its band on write | an attempt to set it wider → the value is clamped in the database | nothing to check |
| 7.5 | Widening the radius does not change the stored setting | after widening, `radius` in the profile is unchanged | nothing to check |
| 7.6 | Cards from the widened radius are marked | a "further than you asked" flag in the response | nothing to check |
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
| 9.11 | The card returns name, age, mode and timer — and nothing else | the response holds neither the peer's `identity_id` nor their other phrases | nothing to check |
| 9.12 | No match opens while the name stands rejected | `name_state = rejected` → a mutual like creates no card | nothing to check |

## 10. A match from an offer is one-sided (step 4)

| № | What must be true | What proves it | State |
|---|---|---|---|
| 10.1 | Liking an offer creates a match at once, with no like back | one side → `matched` | nothing to check |
| 10.2 | The offer's author may decline, and there is no chat | the author refuses → no chat | nothing to check |
| 10.3 | `message_id` and `text_snapshot` are optional | a match from an offer with no phrase of one's own passes | nothing to check |
| 10.4 | The TTL follows the only live phrase — the offer | the offer expired → the match went out | nothing to check |
| 10.5 | Venue offers carry no like at all | an attempt to like → refused | nothing to check |
| 10.6 | **An offer can be liked with no live phrase of one's own** | an identity with no phrases likes an offer → a match is created; the same identity likes an ordinary phrase → refused | nothing to check |
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
| 12.1 | **After all of it there is not one message in the database** (§14) | a direct `SELECT` over every table, not trust in the schema | nothing to check |
| 12.2 | The only database read on the path is the membership check | the query log during delivery | nothing to check |
| 12.3 | A non-participant cannot post into a chat | another session's signature → refused | nothing to check |
| 12.4 | **The ciphertext byte limit is enforced by the node** (§14, `max_ciphertext_bytes` = 2048) | a request around the client with 2049 bytes → refused | nothing to check |
| 12.5 | `max_message_length` = 256 is a client counter, not a node rule | 300 characters that fit into 2048 bytes are accepted | nothing to check |
| 12.6 | **A message to an offline peer yields `error` rather than vanishing** (§14) | the recipient is on no node → `ack {error}` | nothing to check |
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
| 13.12 | With the peer stepped away the input is replaced and the node refuses sends | an attempt around the client → refused | nothing to check |

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
| 15.3 | A private hand arrives encrypted to its own player | the other sees backs, not cards | nothing to check |
| 15.4 | Physics converges for both on a shared seed | one flick → the same final position | nothing to check |
| 15.5 | The word to guess goes through the moderation queue | a forbidden word → "think of another one" | nothing to check |
| 15.6 | A game is described by primitives: a new game is added by description, not by code | add a set without touching the engine | nothing to check |
| 15.7 | The board is not written to the database | `SELECT` after a game — empty | nothing to check |
| 15.8 | **Table:** bands are checked each with each | sitting down outside one sitter's band → refused | nothing to check |
| 15.9 | **Table:** a newcomer gets no history | the board as it stands, talk from the moment of sitting | nothing to check |
| 15.10 | **Table:** talk is public and goes through the queue | a line shows after the check, not before | nothing to check |
| 15.11 | **Table:** the majority removes a sitter, nobody owns it | whoever set up the table cannot remove alone | nothing to check |
| 15.12 | **Table:** a blocked person at a table hides the whole table | the table is not shown at all | nothing to check |
| 15.13 | **Table:** one span for everyone, from anyone's last move | one plays while others stay quiet for an hour → the table lives for all | nothing to check |
| 15.14 | **Table:** speech and board travel in the clear, the node sees them | a line at a table is readable by the node — otherwise the queue has nothing to check | nothing to check |
| 15.15 | **Table:** it is not served at all to someone outside the bands | the feed response has no table, rather than "present but greyed" | nothing to check |
| 15.16 | **An Article 16 notice is accepted about a line at a table** (2026-08-28) | `target_kind = table_line` goes through; the snapshot holds the line's text and `table_id` | nothing to check |
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
| 16.5c | **Neither reporting nor blocking changes the author's quota** | before and after: the live-phrase ceiling is the same, so is the 64-minute one | nothing to check |
| 16.6 | A report carries its copy from the reporter's device | the node has no copy and nowhere to take one from | nothing to check |
| 16.7 | **A content report through support lands in the same register** | a message describing something illegal → a record in the notices register, not in the support table | nothing to check |
| 16.8 | **The answer is shown in the app at the next visit, with no email** | a message with no address → the answer waits with the identity and appears on entry | nothing to check |

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
| 22.5 | The peer in an open chat sees `stepped_away` | the only exception to "we do not report presence" | nothing to check |
| 22.6 | The in-app timer never reaches the node | neither a column nor a request next to the identity | nothing to check |
| 22.7 | Leaving early works, the frequency is not capped | three departures in a row → no refusal | nothing to check |
| 22.8 | **A table survives its founder's break while they stand up from it** | "step away" → the table is in the feed, the leaver is not among the sitters | nothing to check |
| 22.9 | A private person's offer goes with the phrases | "step away" → the phrase with a discount is deleted | nothing to check |

---

## What can be checked today

Exactly two rows: **2.5** (the WebCrypto measurement — done,
`scripts/check-webcrypto-support.sh`) and, indirectly, **the whole rest of the
list** — through `chat_stub.test.ts` guarding the `501`. Everything else waits for
its §13 step, and that is a state rather than an excuse: there is no `identities`
in the database, `/feed` answers 404 and `/chat` answers 501.

That is exactly why the map comes before the code. When the first table appears
there will be nothing to argue about: the list is already written and derived from
the spec, not from whatever turned out to be convenient to check.

## Read together with

- [`chat_EN.md`](chat_EN.md) — the spec: §13 build order, §14 acceptance criteria.
- [`chat-flows_EN.md`](chat-flows_EN.md) — the same flows, drawn.
- [`retired-terms.txt`](retired-terms.txt) — wordings a decision retired; checked
  by `scripts/check-retired-terms.sh`.
- `scripts/check-mermaid.sh` — parses every diagram in `docs/*.md` inside a
  container: a broken picture stays silent on GitHub, the script names it.
- [test-map_RU](test-map_RU.md)
