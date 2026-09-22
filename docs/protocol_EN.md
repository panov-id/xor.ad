# The protocol: the contract between a client and a node

The chat spec (`chat_EN.md`) describes **what** happens, the flow diagrams
(`chat-flows_EN.md`) **how it moves**, the test map (`test-map_EN.md`) **what
proves it**. This is the fourth thing: **which wires it travels on**.

Written on 2026-08-28, and by a count rather than by taste: the spec names **six**
routes scattered across eight sections, while it describes three times as many
operations. By §13 the terminal client is written first, precisely so that the
protocol becomes checkable — but there is nothing to check while it is not
gathered in one place.

## How to read it: two kinds of row

Every route row carries its **origin**, and that is what to read first:

| Mark | What it means |
|---|---|
| **spec** | the route is named in `chat_EN.md` or in the flow diagrams; here it is only collected |
| **spec** (agreed 2026-09-17) | the operation is described in the spec but had no name; the name is given **here** and needs agreement |

The distinction is not a formality. A project rule forbids inventing API fields
and endpoint behaviour; separating what was collected from what is proposed is the
only honest way to write this document without breaking it.

## 1. General

- **Transport:** HTTPS for requests, WebSocket for delivery. The socket is needed
  only by chats and tables; the feed, likes and matches live on requests.
- **Format:** JSON bodies, UTF-8. There is no binary protocol and none is planned.
- **Time:** unix seconds, UTC. There are no time zones anywhere in the protocol. In the
  contract that is `{type: integer, format: unix-seconds}` — a format name of our own,
  which OpenAPI 3.1 allows. **Settled 2026-09-20 after the review panel:** before it, 21
  fields stood in `format: date-time` and exactly one in seconds, so a single screen handed
  the client two representations of time at once. The edit stops where the protocol does:
  the venue cabinet's six fields (`/adv/*`, cookie `__Host-adv`) stay in ISO on purpose —
  that is a browser surface for a person, and the protocol does not describe it. Held by
  `scripts/unix-time-in-contract.py` and a rule in `scripts/check-openapi.sh`.
- **Not one user identifier leaves the node** (§8.11): only things have uuids — a phrase,
  a chat, a match, a table, a proposal, a block and a hidden item — and none reduces to a
  person (refined 2026-09-16; this said "exactly two kinds of uuid" [retired]).

## 2. Request signing — from the spec, verbatim

```
signed      <method>\n<host>\n<path with normalised query>\n<sha256 of body>\n<unix time>
headers     x-identity-session   uuid of the live session
            x-identity-time      the same time as in the string
            x-identity-sign      the signature, base64url
window      ±5 minutes
algorithm   ECDSA, namedCurve P-256, hash SHA-256
```

- **The body enters as a hash, not whole** — otherwise the signature would be
  computed over a stream.
- **The storefront's key goes beside the signature — since 2026-09-22.** `x-api-key`
  on a signed request names the face (`caller.brand`), the signature the person
  (chat spec §8: "the brand comes from the API key and from nowhere else"). No key
  is not a refusal — a terminal has no face, the phrase lands `unattributed`; a key
  nobody issued is a 401. Before, a signed caller never had a face, and every phrase
  sent through a storefront sat in the platform's queue, out of its moderator's sight.
- **The host enters the signature — since 2026-09-21.** [retired] It was not
  there at all before, and §2 said nothing about it: a signed request was
  accepted by **any** node of the pool where that session lives, and `api.sosed`
  was no different from `api.neighbro` for the whole five-minute window. RFC 9421
  keeps `@authority` in the covered components for exactly this reason.
  Normalised: the host lowercased and a default port dropped, so
  `API.Sosed.Place`, `api.sosed.place` and `api.sosed.place:443` are one host.
- **The path enters with its query string, normalised — since 2026-09-21.**
  [retired] This used to read "the path enters without its query string: anything
  can end up there, and a signature has to be reproducible". The argument was
  right and the conclusion was not: reproducibility comes from normalising, not
  from leaving out. The price of leaving out was named by the panel on
  2026-09-20 — the `?after` cursor of `GET /feed` and `GET /inbox` rode outside
  the signature, and anything able to rewrite a request in flight could move it
  inside the window. Normalised: parameters sorted by name then by value and
  re-encoded by one encoder; a repeated parameter keeps both values; an empty
  query signs as a bare path, so `/feed` and `/feed?` agree. **Made precise on
  2026-09-21 after the depth-core panel:** the decoded pairs are sorted by UTF-16
  code units, then each half is encoded with `encodeURIComponent` (RFC 3986 less
  `!'()*`); the node and the depth core do this independently, and
  `depth/core/sign.test.ts` checks them against each other on Cyrillic and on
  `!'()*`. The `x-protocol-version` and `content-type` headers stay outside the
  signature on purpose: the hash of the raw body is signed, and changing the
  type does not change it.
- **The major version stays 1.** The change breaks compatibility and there was
  nothing to break: measured on 2026-09-21, the signature is implemented by this
  node and its tests alone — there is no client in `sosed.place` or
  `neighbro.place`, and `depth` is not written (that evening the depth core
  appeared — a second implementation, already on the new signature). A version exists so as not to
  diverge from whoever holds the previous protocol; nobody holds it.
- **A window instead of a nonce** is a deliberate trade (§8.2): whoever intercepts
  a request can replay it within five minutes; a nonce would require shared memory
  across nodes.
  **Caveat of 2026-09-16 (panel, SEC-3):** for one-shot actions the price of a replay exceeds the
  trade — a second table and standing up from the first, a spent support quota, a repeated
  step-away after coming back. So `POST /tables`, `POST /away`, `POST /support`,
  `POST /recovery/reissue`, `POST /identities/close`, `POST /vault/pin` and `POST /blocks` carry a `nonce` field in
  the body (16 bytes, random, base64url): it enters the signature through the body hash, the node keeps
  the pair (session, nonce) with the first answer for ten minutes in the `nonces` table of the database (DDL in chat spec §8.2) —
  shared by the pool and surviving a restart; the nonce is bound to its route, the same nonce on another route answers 409 `invalid_body` (SEC-25); the replay is looked up after the signature and version checks, and only 2xx and state-409 answers are kept (SEC-2, SEC-4 of pass 5); the "shared memory" argument is withdrawn for these seven
  routes (2026-09-16, OPS-1, SEC-17), the sweeping is `nonce.ttl` in the limits registry. Everything
  else lives by the window.

## 3. Face, version and compatibility

- **The brand key** is public and baked into the client: it answers "which face
  did this request come through", and nothing else. A person is identified by the
  signature of their own key pair.
- **`client_type: native`** is recorded in the terminal's key itself: a terminal
  has no `Origin` header by nature, so no list of allowed origins is kept for such
  a key (`depth-client_EN.md` §2.5).
- **A daily quota per key is forbidden** for the terminal: the key is shared by
  everyone, so a counter on it is one bucket for all. Limits live **per address
  and per identity**.
- **The support window is the current major version of the protocol only**
  (decided 2026-08-27, `route-to-code_EN.md`). An older image gets a legible
  refusal with the command to update, and the sunset date is announced in advance.
- **A client states its version in the header `x-protocol-version`** — decided 2026-09-16; the spec said "the
  client sends its version, the node knows the minimum supported" without naming a
  field, and this said "how exactly a client states its version is open" [retired]. **In full:** the header `x-protocol-version` on every request and the
  subprotocol `xor.p1` on the socket (§6, §4.4). **The sunset date is announced by the response
  header `x-protocol-sunset: <unix time>`** on every answer of the node from the day it is set (the value is the environment variable `PROTOCOL_SUNSET_AT`, empty — no header; OPS-6) — so
  "in advance" reaches the terminal image `depth` too, which has no other channel (2026-09-16, OPS-15).
  **Where the contract names the header — settled 2026-09-20 after the review panel:** the node
  sends it on every answer, while `openapi.yaml` names it on the common refusal and on the three
  answers a client reads on the way in — `GET /legal/manifest`, `GET /identities/me`, `GET /feed`.
  Before this it stood on the refusal alone, so `depth` learned the sunset date only by being
  refused — exactly the case the header exists for. Carried out by `sunsetHeader()` in
  `relay/node/src/lib/identity_auth.ts`, from the variable `PROTOCOL_SUNSET_AT`.

## 4. Routes

**The eight areas entered the contract on 2026-09-16 — §4.6–4.12 below.** [retired] This said "tables, games for two, blocks, stepping away, support, editing the profile, reissuing the paper code and 'My notices' … have no rows here and no operations in `docs/api/openapi.yaml`" (final panel of 2026-09-15, CON-5). The canon named no path for any of them, so every row of those sections carries the origin **spec** (proposed 2026-09-16, agreed 2026-09-17): the names are mine, the behaviour comes from the chat spec and the storefront screens, and each row says where from. "My notices" got no routes of their own: the decision on your own notice is `POST /report/decision` (§4.5), new editions of the documents are `GET /legal/manifest` (§4.1), and the Article 17 statement to an author is `GET /statements` (§4.5; added 2026-09-16, LAW-1: this said "is not kept on the node" [retired], while `dsa/SPEC_EN.md` §6 keeps it for a year).

### 4.1. Identity and session (step 1 of §13)

| Route | What it does | Origin |
|---|---|---|
| `POST /identities` | creates an identity: the public half of the key, name, age, the PIN's `auth_hash` with the node's share and the paper code's `lookup_id` at once (`IdentityCreate`, 2026-09-19); under 13 — `too_young`; the node returns `identity_id`; at most 10 per hour and 30 per day per address (2026-09-15) | **spec** (agreed 2026-09-17) (§8.2) |
| `POST /vault/share` | exchanges proof of knowing the PIN for the node's share of the vault key; a wrong PIN answers `pin_mismatch` with `attempts_left` (2026-09-21), the tenth `pin_locked` (2026-09-19); ten wrong attempts lock access until the paper code, the share kept (2026-09-14; "burn the share" [retired]) | **spec** (agreed 2026-09-17) (§8.2) |
| `POST /sessions/invite` | a transfer code for another device: nine characters, two minutes, one use; **requires a PIN proof** (§8.2, 2026-09-11). Body `{lookup_id, auth}`, answers `{expires_in}`. A second invitation for the same identity **cancels the first** rather than standing beside it: two live codes are two devices racing for the one live session (2026-09-21, route built) | **spec** |
| `POST /vault/pin` | changing the PIN `{nonce, current_auth, next_auth_hash, next_share}`: the proof of the old PIN is `auth` of §8.2 (the node compares its hash with `vault_shares.auth_hash`), the new hash and the reissued share — **spec** (proposed 2026-09-11, agreed 2026-09-17), body 2026-09-17 (SEC-1 of pass 5), the handle does not exist yet | **spec** (agreed 2026-09-17) (§8.2) |
| `POST /identities/close` | "start over": closing an identity `{nonce, auth}` — the PIN proof is the same `auth` of §8.2, not the stored hash — **spec** (proposed 2026-09-11, agreed 2026-09-17), body 2026-09-17, the handle does not exist yet | **spec** (agreed 2026-09-17) (§8.2) |
| `PUT /identities/appearance` | the identity's appearance for the face named by the API key, one row per face: theme, contrast step, an accent from that face's set; the initial value comes in `POST /identities` — **spec** (proposed 2026-09-15, agreed 2026-09-17) (storefront screen 22), the handle does not exist yet | **spec** (agreed 2026-09-17) (§8.2) |
| `POST /sessions/claim` | using the code on the new device. Misses are limited per address and across the node, as recovery's; a second claim on the same invite cancels the transfer on both sides (2026-09-15). Body `{lookup_id, envelope}` — the new device's key pairs sealed to the code's other half, which the node never sees; answers `{state: "claimed"}`. **The old device does not go still here**: only `approve` quiets it (clarified 2026-09-21 with the route — "the old one goes still" read as though it happened at this step) | **spec** |
| `POST /recovery/claim` | raising an identity from the paper code: `{lookup_id}`, plus `{sign_pub, wrap_pub, label}` from a clean device; answers `{identity_id, session_id, recovery_wrapped_key}`. **Two paths, told apart by the signature rather than by a field in the body (2026-09-20, route built):** an unsigned request is a clean device — a new session is born and the live one goes quiet with reason `transfer` (one live session per identity; the support exception of §8.2 stays with `pin_limit`); a request signed by the device's **own session, frozen or not**, is the same device — the freeze is lifted, `locked_at` is cleared, the counter goes back to ten, and the old PIN opens this device's history again. A frozen session is admitted here and nowhere else: §8.2 names recovery as the one exception, or the tenth PIN mistake would have no way out at all. Both paths leave the first-PIN grant: a clean device has no old PIN to prove, and on the old one the PIN may be exactly what was forgotten. **The old code does not die here** — §8.2 moved its death to the confirmation of the new one (2026-09-10), or the gap between unwrapping the key and copying sixteen characters would leave an identity with no insurance at all; rotation is `POST /recovery/reissue`. A miss is `404 not_found`, one wording for "no such code", "the identity is closed" and "that registration never finished"; the ceilings are per address plus the shared brake `recovery.miss.shared`/`recovery.miss.pause` | **spec** (agreed 2026-09-17) (§8.2, §13) |
| `POST /recovery/confirm` | the paper code is written down — finish the registration: `{recovery_wrapped_key}`; sets `identities.signup_completed_at` with `UPDATE … WHERE signup_completed_at IS NULL RETURNING`, a second call answers 409. **The fifty-seventh name, added 2026-09-20 by quorum of two review lenses:** the column was promised by the canon on 2026-09-10 with nothing to fill it, and `identities.recovery_wrapped_key` was written by no operation at all — so recovery did not work. Handing this cargo over is what confirming the code means; the node never sees the code itself (§8.2). The caveat on the `POST /recovery/reissue` row below — the confirmation stays on the device and the node knows nothing of it — still holds **for a reissue**: there the wrapped key arrives in the same request and the node has nothing left to wait for | **spec** (added 2026-09-20) (§8.2, §13) |
| `GET /legal/manifest` | the three documents' revisions: date, substance `sha256`, re-acceptance policy — `required` for all three since 2026-09-15 | **spec** (agreed 2026-09-17) (2026-08-29) |
| `POST /legal/accept` | records an acceptance: document, date, hash; one row each | **spec** (agreed 2026-09-17) (2026-08-29) |
| `POST /vault/init` | set the first PIN on a new device after a transfer or a recovery: `{auth_hash, share}`; the old PIN is not needed, but only against a one-time first-PIN grant after an approved transfer or a recovery, otherwise 409 (screen 13; 2026-09-19). **The `nonce` field was dropped on 2026-09-20:** §2 above gives the mechanism to seven routes and this is not one of them, and a required field with no mechanism is decoration. What makes this call one-time is the grant itself: the node spends it with the same statement that reads it — `UPDATE identities SET first_pin_grant_at = NULL WHERE id = :me AND first_pin_grant_at > now() - interval '1 hour' RETURNING id` — and an empty result is a 409 `no_first_pin_grant` (2026-09-21; `unauthorized` [retired]). **The grant lives `vault.first_pin.ttl`, an hour** (owner's decision of 2026-09-21): until then the quote here had no deadline, and §4.1 contradicted its own table of limits two hundred lines further down. The grant's carrier is the column `identities.first_pin_grant_at`, added 2026-09-20 after the review panel: before it there was nothing to refuse by | **spec** |
| `POST /sessions/:lookup_id/approve` | the old device confirms the transfer, "it's me", once the four characters matched; only a session of the identity that issued the invite, once, within its 120 seconds (screen 13; 2026-09-19). Body `{reply, sign_pub, wrap_pub, label}`: the reply envelope with the long key, plus the new device's keys — the node cannot read them out of an envelope it has no key for, so the device that opened it passes them on. One transaction: the old session is frozen as `transfer` and its share burned, the new session is written, and the identity keeps a first-PIN grant (2026-09-21, route built) | **spec** |
| `POST /sessions/:lookup_id/reject` | the old device refuses, "doesn't match"; the code dies (screen 13; 2026-09-19). Answers 204; the identity does not move, nothing is frozen and nothing is burned | **spec** |
| `GET /sessions/:lookup_id` | the state of an invitation, and the envelope meant for whichever side is asking: `waiting` / `claimed` (with `claim_envelope`, for the old device to show the four check characters) / `approved` (with `reply_envelope` and `session_id`, for the new one) / `rejected` / `cancelled` / `expired`. **The fifty-eighth name, added 2026-09-21 by the owner's decision:** without it the transfer could not be finished at all — neither side had any way to learn the outcome, §8.1's sockets do not exist yet, and polling with a repeated `POST /sessions/claim` is impossible because a second claim cancels the transfer (review panel 2026-09-20, item G15). Unsigned: the new device has no session yet, and the `lookup_id` is what authorises here | **spec** (added 2026-09-21) (§8.2, screen 13) |

**Registration is the two steps of screen 2, both mandatory:** who you are — name and age; what
brings you back — the PIN with the share exchange and the paper code (two requests in the second step).
[retired] This said "three steps". Without the share the
local database stays unencrypted; without the code a lost device means a lost
identity.

### 4.2. The feed (step 2)

| Route | What it does | Origin |
|---|---|---|
| `POST /feed` | publishes a phrase; answers **202** at once, `visible_at` stays empty until the queue's verdict | **spec** |
| `GET /feed` | delivery by intersecting circles, with the language, mode and age filters; what the viewer liked is not in it — it is in `GET /likes` (2026-09-17) | **spec** (named in the test map) |
| `DELETE /feed/:id` | withdraws your own phrase; the slot is freed, the hourly ceiling is not | **spec** (agreed 2026-09-17) (§8.3) |
| `GET /feed/density` | the density band under the radius handle: `nobody here yet` … `hundreds`, on release | **spec** (agreed 2026-09-17) (§8.3, screen 3) |

Each card in `items` of the feed answer (`{items, next}`, §6) carries `{kind, id, text, mode, lat, lon, area_radius, like_count, created_at}`; `kind` is `phrase` or `table`, and a table carries `{game, playing, watching}` instead of `text`. **Tables travel outside the cursor:** the random quarter (§6.1) is given only on the first page, when `after` is empty — a table has no `visible_at`, and the cursor cannot position it (2026-09-16, DATA-23). A phrase carries `{id, text, mode, lang, lat, lon, area_radius, like_count,
created_at}` (`created_at` carries `visible_at`, 2026-09-15) — **a circle, not a point**, and nothing about the author. `lat`/`lon` are **rounded to a grid node stepped by `area_radius`** (the formula is in `chat_EN.md` §8.3); the exact ones never leave and, since 2026-09-21, **take no part in computing the overlap either**: the node compares against the same rounded pair it hands out (`relay/node/db/027`). Before that the inequality was measured against the exact pair, and a viewer — who supplies their own centre and radius as query parameters — could bisect the boundary and recover the exact centre to within metres.

**The band's price is named, not closed (owner's decision of 2026-09-21).** The §8.3 age band is symmetric: an author aged `a ≤ 20` is visible to a viewer aged `v` exactly when `|a − v| ≤ 2`. So the set of viewers who see a phrase is the interval `[a−2, a+2]`, and it fixes the author's age uniquely even where the edge truncates it (13–14 and 19–20). Not one field about the author's age leaves the node, and that changes nothing: the delivery itself carries the signal. We accept this as the price of the band and **make the fan-out expensive**: reading the feed is limited by `feed.read.hour` — 300 requests an hour **per identity**, not per address — and density by `feed.density.burst`, 100 an hour per identity. Counting by address would be useless: a fan-out of identities is exactly what one address is used for, and a shared address is a household behind one router.

**A place QR is not an operation (screen 26, owner's decision of 2026-09-19).** The link `<storefront>/#p=<cell>&s=<step>` is parsed on the device from the fragment, which never goes to a server: `p` is the indices of a node of the same grid as `lat`/`lon` above, `s` is the `area_radius` step from 1 (100 m) to 5 (10 km); a poster link `?p=&w=&l=` is a separate path. The node knows nothing about the QR: making one is no request, opening one is no request, and a phrase at a QR point goes by an ordinary `POST /feed` with the same `lat`, `lon`, `area_radius`. There is no "by QR" field in the contract on purpose: it would link the phrases of one QR to one another; for the same reason the zone default of such a phrase is no narrower than 300 m.

### 4.3. Like, match, chat (steps 3–6)

| Route | What it does | Origin |
|---|---|---|
| `POST /feed/:id/like` | likes a phrase or an offer; an offer's match is one-sided and needs no live phrase of your own; answers `liked` or `matched`; with no live phrase of your own (not an offer) — 409 `refused` (2026-09-21) | **built** 2026-09-21, was: spec (agreed 2026-09-17) (§8.4) |
| `DELETE /feed/:id/like` | takes a like back until a live match has come of it: `{state: 'unliked'}`, also when there was nothing to take; otherwise, and on an offer, `{state: 'spent'}` (2026-09-21) | **built** 2026-09-21, was: spec (agreed 2026-09-17) (§8.4) |
| `GET /likes` | everything this identity liked that is still alive: cards of the same shape as `GET /feed` — phrases and private authors' offers with `state` (`liked` \| `matched`) and tables — by the `?after` cursor and `{items, next}` (§6); screen 25 "My likes" | **spec** (proposed and agreed 2026-09-17) (§8.4, mechanics §11) |
| `POST /matches/:id/consent` | consent to talk; the chat opens when both have consented; until chats exist (step 5) the answer is `waiting` or `agreed`, someone else's or an expired match — 404 (2026-09-21); since 2026-09-22 it carries `{ephemeral_public_key, ephemeral_signature}` — the mandatory ephemeral half of §8.13, signed by the long key over `"xor.ephemeral.v1\n<match_id>\n" ‖ SPKI`; the node checks it and binds it to the match, no half — 400, a different half again — 409 `half_published`; the peer gets the half, `match_id`, `peer` and `me` from `GET /inbox` | **built** 2026-09-21, the half 2026-09-22, was: spec (agreed 2026-09-17) (§8.5, §8.13) |
| `GET /inbox` | offers and conversations in one response; a count only on offers | **built** 2026-09-21, was: spec |
| `POST /chats/:id/rekey` | reissue the conversation's keys after a lost pair (§8.13): `{epoch, ephemeral_public_key, ephemeral_signature}`, signed by the long key over `"xor.rekey.v1\n<chat_id>\n<epoch>\n" ‖ SPKI`; the side without keys starts the next epoch, the other answers at the same one — `{state: waiting \| agreed, epoch}`; out of step — 409 `rekey_out_of_step`; the chat's open rooms get a `rekey` frame, a device that was away learns from `GET /inbox` (`rekey_requested`); on `agreed` the delivery queue under the old keys is cleared | **built** 2026-09-22 (§8.13) |
| `POST /chats/:id/ticket` | a one-time ticket for the socket, 30 seconds; someone else's chat, a finished one or one closed by a block — 404; built 2026-09-21 | **built** 2026-09-21, was: spec |
| `POST /chats/alive` | a reconciliation: which chats are still alive; the client wipes the rest | **built** 2026-09-21, was: spec |
| `DELETE /chats/:id` | closes a conversation by hand — for both at once | **built** 2026-09-21, was: spec (agreed 2026-09-17) (§5, screen 8) |
| `PATCH /chats/:id` | your own span handle: 10 / 30 / 60 minutes or "while we're talking" (260 minutes, 4:20) | **built** 2026-09-21, was: spec (agreed 2026-09-17) (§8.6) |
| `POST /chats/:id/messages` | send a ciphertext `{local_id, ciphertext}` — **202** `{local_id, accepted}`; the node stores it in `pending_deliveries`, moves `last_activity_at`, hands it to the other at once or on connection; could not — `{local_id, error}`; size — `max_ciphertext_bytes`; at most `chat.messages.minute` a minute per identity (SEC-18); order of refusals: 409 `stepped_away` (while away), then 404 in the same shape as for a chat that does not exist (not a member), then 429 (SEC-22, SEC-29) | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (§8.8; panel, SEC-8) |
| `POST /chats/:id/received` | confirm receipt `{ids}` — **204**; the node deletes what was delivered from `pending_deliveries` — only rows with your own `recipient_session` in this chat, foreign `ids` are silently skipped (SEC-19) | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (§8.8) |
| `POST /matches/:id/decline` | "not now": the match decline is written at once (screens 6, 7; 2026-09-19) | **built** 2026-09-21, was: spec |
| `DELETE /matches/:id/decline` | undo the decline — while the match lives: the undo row has no timer (screen 7, owner's decision 2026-09-18) | **built** 2026-09-21, was: spec |

### 4.4. The socket

```
1. POST /chats/:id/ticket   → a one-time, short-lived ticket
2. new WebSocket(...)       the ticket goes in Sec-WebSocket-Protocol,
                            NOT in the query string: that is not signed
                            and stays in logs
3. the node exchanges the ticket for a socket bound to the session, and burns it
```

The reason for that order was measured rather than reasoned: a browser's
`new WebSocket()` sets no arbitrary headers at all — not one of the `x-identity-*`
reaches the node (verified on Chromium 151, 2026-08-21) — and cookies are ruled
out in this scheme.

**Freezing a session cuts its sockets**: `NOTIFY session_frozen` in the same
transaction as `frozen_at`.

**How the node closes a socket — proposed 2026-09-02; until that day not one code
was named.** RFC 6455 §7.4 splits the range: 1000–2999 belong to the protocol
itself, 4000–4999 are the application's. Hence:

| Code | When | What the client does |
|---|---|---|
| `1000` | the person closed the conversation or left the page | nothing |
| `1001` | the node is going down for a restart | reconnects after a delay |
| `1011` | an error on the node | reconnects after a delay |
| `4001` | the ticket is expired, spent or wrong | takes a new ticket and retries |
| `4002` | the session was frozen by an identity transfer | does not reconnect, shows "the identity has moved" |
| `4003` | the conversation ended: your span ran out or it was closed | does not reconnect, shows the tombstone (§5) |
| `4004` | the protocol version is not supported | does not reconnect, asks to update (§3) |
| `4005` | the seat is lost: stood up, removed, left by a block or a step-away — `left_at` is set with `NOTIFY seat_left` in the same transaction | does not reconnect; `GET /tables/:id` and the ticket answer 404 in the same shape as for a table that does not exist (2026-09-16, SEC-4) |

**Socket frames flow from the node to the client only; a person's actions travel as signed requests — decided 2026-09-16.** §7 of the chat spec said "game-board state, game requests go through the WebSocket" without naming a single frame; the choice fell on requests: a request has a signature, a rate limit and the 409 "accept again" refusal, a frame has only the ticket. The games are turn-based, and a request's latency does not hurt them. One socket per conversation and one per table (`POST /chats/:id/ticket`, `POST /tables/:id/ticket`), and it delivers:

| Frame `type` | What it carries | From |
|---|---|---|
| `message` | an encrypted message of the conversation: `{id, ciphertext, created_at}` | chat spec §8.8 |
| `line` | a line at the table after the queue's verdict: `{id, seat, kind, text, sticker, created_at}`; `move` lines at once | §6.1 |
| `board` | the whole board minus what is hidden: `{seq, state, turn, score, expires_at}`; your own hand arrives encrypted to you | §6, §6.1 |
| `seat` | someone sat down, stood up, was removed or became a spectator: `{playing, watching}` — counts, not identities | §6.1 |
| `proposal` | an offer to play again, a draw or an undo, and the answer to it: `{id, kind, class, set, answer}` | §6 |
| `confirm` | the countdown of confirming a new game: `{confirmed, of, until}`; for two, `confirmed`/`of` are not sent | §6 |
| `peer_stepped_away` | the other person stepped away: `{}` — no span; nobody's timestamps leave the node | §8.2 "stepped away" |
| `rekey` | the other side asked for new keys for the conversation, or agreed: `{epoch}` (§8.13, 2026-09-22) — the client rereads `GET /inbox` and asks the person |
| `name_verdict` | the queue's verdict on a name change: `{accepted, reason}` — only to the socket of your own session; on a table name the same with `table: id` (2026-09-17) | §8.2, §6.1 |
| `sys` | a system line of the conversation, not encrypted: `{kind, text}`, `kind` is `chat_opened`, `game_offer`, `age_changed`, `move` (chat spec §6 and §8.6); added 2026-09-16, CON-14. **`age_changed` is built (2026-09-22) without `text`:** `{kind: age_changed, age}` — the number, the client words the line in its own language (the owner's decision) | §6, §8.2 |
| `closed` | the reason before code 4002/4003: `{code}` | this section |

The frame envelope is `{type, seq, data}`; `seq` grows on the socket and lets the client notice a gap and re-read the state with a `GET`; `GET /tables/:id` and `GET /chats/:id/game` return the open proposal and the running countdown (`pending`) along with the board, so after code 1001 the state comes back whole (2026-09-16, OPS-12). The protocol version rides in `Sec-WebSocket-Protocol` next to the ticket: `xor.p1, ticket.<ticket>`; an unsupported one gets code 4004.

The difference between 4002 and 4003 is not politeness: in the first case
reconnecting is pointless forever, in the second it is pointless for this
conversation. A client that does not tell them apart either hammers a closed door
or takes a live identity for a dead one.

### 4.5. Notices (`dsa/SPEC_EN.md` §7; corrected from §6 on 2026-09-20)

| Route | What it does | Origin |
|---|---|---|
| `GET /statements` | your own Article 17 statements without the notifier's identity, fields as in `statement_of_reasons` of the DSA spec: `{id, restriction, until, facts, ground_kind, ground_text, automated_used, created_at, appeal}` (`until` absent — indefinite; `ground_kind` is `legal` or `contractual`); the first delivery sets `delivered_at` (LAW-1 of pass 3) — shown on the next entry with this identity, kept a year (`dsa/SPEC_EN.md` §7, the entity `statement_of_reasons` in §8, the retention in §9; corrected from §6 on 2026-09-20 — that section is the reply to the notifier under Art. 16(5), not the statement to the author); added 2026-09-16, LAW-1 | **spec** (proposed 2026-09-16, agreed 2026-09-17) (`dsa/SPEC_EN.md` §7) |
| `POST /report/decision` | the decision on a notice by the device's receipt code, the code in the body; not signed by an identity; "no such receipt" and "not decided yet" get the same answer — status 200, the body byte for byte, `Cache-Control: no-store`, one minimum response time for both branches; the per-address limit lives in memory and is not logged — **spec** (proposed 2026-09-15, agreed 2026-09-17) (final panel, SEC-9) | **spec** (agreed 2026-09-17) (`dsa/SPEC_EN.md` §6) |

### 4.6. Tables (chat spec §6.1, screen 19)

All proposed 2026-09-16; the behaviour is §6.1's and screen 19's, the paths are mine.

| Route | What it does | Origin |
|---|---|---|
| `POST /tables` | sets a table: board class, set, the set's number of seats (`tables.set`, `tables.seats`), area (`lat`, `lon`, `area_radius` from the five steps), an optional `name` of up to 24 graphemes — into the moderation queue, the verdict as a `name_verdict` frame with `table` (2026-09-17), `nonce`; the `table_games` row is created empty, the first round is opened by "start the game" — a `rematch` proposal with no finished game (2026-09-18); the author takes seat 1 and stands up from their previous table as the first statement of the same transaction — the screen warns before the tap; answers `{id}`; at most `tables.create.hour` per identity | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6.1, schema `tables`) |
| `GET /tables/:id` | the whole table minus what is hidden: the board with `pending`, `{playing, watching}`, `name` and `like_count` (2026-09-17), lines since your own seating, your `seat` and `playing`; your own hand, the backs of others'; **only with a live seat** — otherwise 404 in the same shape as for a table that does not exist (SEC-4). A spectator sits too: `seat` is there, `playing: false` | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6.1 "what is seen") |
| `POST /tables/:id/like` | likes a table without sitting down: a bookmark with a counter, neither a match nor an offer; `like_count` grows, the table leaves this person's feed for `GET /likes`; answers `{state: 'liked'}`, a repeat the same | **spec** (proposed and agreed 2026-09-17) (§6.1) |
| `DELETE /tables/:id/like` | takes a table like back; `like_count` goes down, the table returns to the feed; **204** | **spec** (proposed and agreed 2026-09-17) (§6.1) |
| `POST /tables/:id/seat` | sit down; refusals in this order: `already_seated` when you sit at another, then `unavailable` when the "everyone with everyone" age bands fail or a blocked person sits there — one answer, so as not to be an oracle; at most `seat.attempts.hour` attempts per identity (SEC-2); the lowest free `seat_no` is handed out under the table's lock | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6.1, the index `table_seats_one_at_a_time` and UNIQUE(table_id, seat_no)) |
| `DELETE /tables/:id/seat` | stand up: `left_at` and `NOTIFY seat_left`, the socket closes with code 4005; the last one to stand up sets `tables.closed_at = now()` in the same transaction (DATA-27); coming back is the same `POST`, a new seat and history afresh from the seating; the outward score is by live seat, whoever left does not carry it (SEC-12) | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6.1) |
| `POST /tables/:id/ticket` | a one-time ticket for the table's socket, as for a conversation (§4.4); only with a live seat (otherwise 404, SEC-4); the ticket lives `ticket.lifetime`, 30 seconds (SEC-15) | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§7) |
| `POST /tables/:id/lines` | a line `{kind: line \| application \| refusal, text}` — **202**, published by the queue's verdict; a sticker `{kind: sticker, sticker}` — **200**, no queue, at most `sticker.minute` a minute per identity (SEC-5); one application per game, a refusal without text is not accepted, a `refusal` is accepted only from a player | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6.1, schema `table_lines`) |
| `POST /tables/:id/moves` | a move `{seq, move}` or a pass `{seq, pass: true}` in the board class's terms; `seq` is the expected **board version** (`table_games.seq`, monotonic, grows on an undo too): a repeat of the same body at the same `seq` answers the same `board`, a foreign version gets `stale_seq` (DATA-24, SEC-11); refusals `not_your_turn`, `illegal_move` with the engine's reason; three passes in a row — to the spectators; the move deadline `turn_due` sits in the database; the auto-pass is placed by a scheduler job every 30 seconds and by any request to the table after the deadline, overdue deadlines are applied in order with their own `seq`, an overdue `pending` is cleared the same way and `GET` answers `pending: null` (OPS-12, OPS-3, OPS-4) | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6, §6.1; `table.move.window`, `table.pass.limit`) |
| `POST /tables/:id/confirm` | "I'm here" for a new game inside `table.confirm.window`; not confirmed — a spectator | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /tables/:id/proposals` | propose `{kind: rematch \| draw \| undo, class, set}`; answers `{id}`; from a player only, a spectator gets 409 `refused` (SEC-28); one open proposal per table — a second one answers 409 `pending_exists` (SEC-5, DATA-7), kept in `table_games.pending` and surviving a restart; the undo fires on every player's consent and steps back one snapshot, which the engine keeps in memory (§6) — after a restart it answers `nothing_to_undo` (OPS-12) | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /tables/:id/proposals/:pid` | the answer `{answer: accept \| decline \| counter, class, set}` | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /tables/:id/resign` | resign — a one-sided announcement, no result | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /tables/:id/congratulate` | congratulate `{seat}` — as a `kind: congratulation` line composed by the engine; one per seat per game (SEC-5) | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6, screen 19) |
| `POST /tables/:id/kick` | a vote to remove `{seat}`; one vote per identity, a repeat does not count; the node counts the majority of **players** (`playing_from` set), spectators do not decide (SEC-24); at least two votes — with one player there is no removal, with two both are needed (2026-09-18), the votes live in memory until the game ends, no trace remains | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6.1) |

Blocking someone seated is `POST /blocks` with `{table: id, seat}` (§4.8): the one who blocks leaves the table. A table in the feed is a `GET /feed` card with `kind: table`, the game's name and two numbers.

### 4.7. Games in a chat (chat spec §6, screen 18)

| Route | What it does | Origin |
|---|---|---|
| `POST /chats/:id/game` | propose or change the game `{class, set}`; the other person gets a `proposal` frame | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6, screen 18) |
| `POST /chats/:id/game/answer` | `{answer: accept \| decline \| counter, class, set}`; on `accept` the board opens for both | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `GET /chats/:id/game` | the position, whose turn and the score after a drop — from the game cache, no lines and no one else's hand | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6, `chat_games`) |
| `POST /chats/:id/game/moves` | a move `{seq, move}` or a pass; `move` by class: a cell, an edge, a piece, a letter, `{roll}`, `{deal}`, `{flick, impulse}` — the node shuffles and rolls; a move extends **your own** conversation span | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6, §8.6) |
| `POST /chats/:id/game/word` | set the hangman word `{word}` — **202**, the same queue as a phrase; a refusal is "pick another" and feeds the pause counter | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6 "hangman") |
| `POST /chats/:id/game/confirm` | "I'm here" inside `table.confirm.window`; there is no "N of 2" counter | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /chats/:id/game/proposals` | `{kind: rematch \| draw \| undo, class, set}` and the answer via `POST /chats/:id/game/proposals/:pid` `{answer}` | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /chats/:id/game/proposals/:pid` | the answer to a proposal | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `POST /chats/:id/game/resign` | resign | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§6) |
| `DELETE /chats/:id/game` | end the game; the conversation's death takes the game with it by cascade anyway | **spec** (proposed 2026-09-16, agreed 2026-09-17) (`chat_games ON DELETE CASCADE`) |

### 4.8. Blocks and hiding (chat spec §8.9, screens 5 and 10)

| Route | What it does | Origin |
|---|---|---|
| `POST /blocks` | block by a phrase `{feed: id}`, a conversation `{chat: id}` or a seat `{table: id, seat}`, with a `nonce`; **204** always, a repeat too: the answer is not an oracle; the match dies, the shared chat closes, phrases are hidden from both; at most `blocks.hour` per identity — the price is acknowledged: a block by a phrase shows the blocker which other phrases of the same author vanished (SEC-1) | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (§8.9, schema `blocks`) |
| `GET /blocks` | your own blocks: `{id, since}` — `id` is opaque (`blocks.id`) and does not reduce to an identity; screen 10 shows the list and lifting without identities (decided 2026-09-16) | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (§8.9 "until lifted") |
| `DELETE /blocks/:id` | lift a block; **204** on a foreign or unknown `id` too (SEC-14); the set of visible tables is recomputed on the next entry into the feed | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (§8.9, §6.1) |
| `POST /hidden` | hide (at most `hidden.hour` an hour per identity) a phrase `{feed: id}` for yourself only — from the "…" menu; a line `{line: id}` — as the outcome of a complaint without the "illegal" checkbox (screen 19), a line has no menu item; **200** `{id}` for bringing it back; the author does not learn | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (§8.9, schema `hidden_messages`) |
| `GET /hidden` | the hidden list for screen 10: `{id, kind, text}` — short by construction: a phrase lives until it dies, a line until the table is swept (`DELETE FROM tables`, §6.1; DATA-8) | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (screen 10) |
| `DELETE /hidden/:id` | bring the hidden back by `hidden_messages.id`; **204** on a foreign `id` too (SEC-14) | **built** 2026-09-21, was: spec (proposed 2026-09-16, agreed 2026-09-17) (screen 5) |

### 4.9. Stepping away (chat spec §8.2 "stepped away", screen 20)

| Route | What it does | Origin |
|---|---|---|
| `POST /away` | step away `{span: short \| hour \| long, nonce}` (`away.span.*`); in one transaction the phrases go with their likes and so do the likes given (`likes`, `table_likes`; 2026-09-18), matches die, games are deleted, the seat is freed, every conversation gets `peer_stepped_away`; answers `{until}`; the client counts the price before the tap | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§8.2) |
| `DELETE /away` | come back early: `stepped_away_until = now()`; the mark at the other person's end is lifted by your first line, not by this request | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§8.2) |

While stepped away, **every** signed request except `DELETE /away`, `GET /identities/me`, `POST /identities/close` and `POST /support` (since 2026-09-22, the owner's decision: the step-away may have been set by whoever took the identity, and the channel to a person is not cut) answers **409** `stepped_away`, socket tickets included: "until then the product does not exist for the person" (chat spec §8.2), screen 20 — "emptiness: no feed, no conversations". Refined 2026-09-16 (panel, SEC-9); this said "reading and conversations stay open" [retired]. Stepping away also takes the table lines waiting for a verdict (DATA-26). **The contract has carried this since 2026-09-20, after the review panel:** of the 69 signed operations 67 describe a 409 — the two without one are exactly `DELETE /away` and `GET /identities/me`. Forty-nine carry the shared `components/responses/Conflict`; eighteen keep a 409 of their own with their own codes (`already_seated`, `not_your_turn`, a reused nonce and the rest), and in all eighteen the body admits `ApiError`, so `stepped_away` can be expressed in it. The body is a `oneOf` of `ApiError` and `LegalReacceptance`: refusals are told apart by `error.code`, and re-acceptance arrives without one. Before the edit six operations out of sixty-nine described a 409, so a client written from the contract met an undescribed status on most screens while away. The `Reaccept` component, which admitted re-acceptance only, is gone: `stepped_away` could not be expressed in it. Held by a rule in `scripts/check-openapi.sh`.

### 4.10. Support (chat spec, schema `support_requests`; screen 14)

| Route | What it does | Origin |
|---|---|---|
| `POST /support` | a request `{body, email, nonce}`, written during a step-away too (the owner's decision of 2026-09-22) (`email` optional; `body` at most 2000 characters, `support.body.length`); **201** `{public_no}` — 10 Crockford base32 characters at once; the fourth in a day — **429** with the storefront's support address in `message`, `Retry-After` and `until` (`support.requests.day`, `support.frozen.day`) | **built** 2026-09-22, was: spec (agreed 2026-09-17) (schema `support_requests`) |
| `GET /support` | your own requests: `[{public_no, created_at, body, answer, answered_at, answer_seen}]`; by number without a signature the node answers nothing; a frozen session sees no list | **built** 2026-09-22, was: spec (agreed 2026-09-17) (screen 14) |
| `POST /support/:no/seen` | clear the "an answer is waiting" dot: `answer_seen = true`; **204** on a foreign, unknown or out-of-alphabet number too (SEC-23); a failed write — 503 | **built** 2026-09-22, was: spec (agreed 2026-09-17) (schema, `answer_seen`) |

Turning a request into an Article 16 notice is the client's act: the text is carried into the `POST /report` form and the request row is deleted in the same transaction (chat spec, the comment on `support_requests`).

#### 4.10a. Support — the team's side (described 2026-09-22, the owner's decision: after the DSA queue)

Until 2026-09-22 the team could not see requests at all: the digest came as numbers, and there was nothing to read with or answer with. Panel routes, a panel session, permissions `support.read` and `support.answer` (moderator; a storefront's administrator — their own brand).

| Route | What it does | Origin |
|---|---|---|
| `GET /admin/support` | requests of one's own brand (the platform — all, those without a brand too): `[{id, public_no, brand, created_at, body, email, from_frozen, answer, answered_at}]`, waiting ones first, frozen sessions on top, at most 200, `x-total-count` — the whole queue; **the author's identity is not given out** | **built** 2026-09-22 (`routes/support_admin.ts`; the panel's Support page) |
| `POST /admin/support/:id/answer` | an answer `{answer}` (up to 4000 characters, `support.answer.length`, the owner's decision of 2026-09-22): `answer`, `answered_at = now()`, `answer_seen = false` — the person's dot lights again on a repeated answer too (§13); another brand's — 404; an audit record without the text | **built** 2026-09-22 |

**Turning a request into an Article 16 notice — the owner's decision of 2026-09-22: by an answer linking to the screen-5 form.** The good-faith statement is the person's own, in the form; the request row stays. The text of such an answer is the owner's; the page has no button until the text exists. This said before "open, and the reason is named": [retired] The protocol says "the client's act" (the line above), chat spec §13 says "support recognised a complaint". A team's single press cannot do it: `dsa_notices.bona_fide` is required (`CHECK (bona_fide)`, Art. 16(2)(d)) — the good-faith statement is the notifier's own, and the team cannot sign it for the person. The owner decides.

### 4.11. Profile (chat spec §8.2, §8.3, screen 10)

| Route | What it does | Origin |
|---|---|---|
| `GET /identities/me` | your own profile: `{name, name_pending, age, filter_age_min, filter_age_max, languages, stepped_away_until, phrases: [{id, expires_at}], table: {id, seat}}` — your own live things with their timers for screens 9 and 10 (CON-17) | **spec** (proposed 2026-09-16, agreed 2026-09-17) (screen 10) |
| `PATCH /identities/me` | edit `{name, age, filter_age_min, filter_age_max, languages, filter_modes}` (`filter_modes` — 2026-09-19) — any subset; a name goes to the moderation queue (**202**, the verdict as a `name_verdict` frame), refusal `name_frozen` with a live phrase or an open chat and `paused` during the pause after refusals; age across the 20/21 border only upwards, `age_step_down`; the filter — bounds anything inside the band (by the year, 2026-09-17), not wider than the band — `filter_out_of_band`; up to three languages (`identities.languages`); at most `profile.patch.day` edits a day per identity | **built** 2026-09-22 (`routes/profile.ts`; the `name_verdict` frame and `filter_modes` — no, `filter_modes` answers 400), was: spec (agreed 2026-09-17) (§8.2, §8.3; `name.length`, `profile.patch.day`; `filter.age.step` and `filter.age.min_width` were retired 2026-09-17 and are not in the registry — panel 2026-09-22) |
| `GET /identities/appearance` | read the appearance `{theme, contrast, accent}` kept on the node; the device copy draws the first frame (screen 22; 2026-09-19) | **spec** |

Appearance is separate, `PUT /identities/appearance` (§4.1): it belongs to each face.

### 4.12. Reissuing the paper code (chat spec §8.2 "paper code", screen 12)

| Route | What it does | Origin |
|---|---|---|
| `POST /recovery/reissue` | change the code: `{current: {lookup_id}, next: {lookup_id, wrapped_key}, nonce}`; at most `reissue.day` a day per identity — proof of the current code and the derivatives of a new one born on the device; the new one works and the old one dies **in one transaction**; a miss on the current code counts where `POST /recovery/claim` misses count and towards the `recovery.miss.pause`; the shown-and-confirmed step stays on the device, the node knows nothing of it | **spec** (proposed 2026-09-16, agreed 2026-09-17) (§8.2; `recovery.code.length`, `recovery.miss.shared`) |

### 4.13. Offers (`offers/SPEC_EN.md`, screens 3, 17, 23, 25)

Described 2026-09-19 after auditing the screens against the contract (`docs/screens-api-map_EN.md`):
until then the contract had no offers at all. A venue offer is a feed card of its own, `kind: offer`
with an `offer` field; a private author's offer is a phrase with `offer` filled (`discount_value`,
`conditions`, `discount_until`), sent by `POST /feed`. The venue cabinet talks to the same relay by
the same e-mailed link as the panel, with the `advertiser` role (`offers/SPEC_EN.md` §2.1); the
session is a cookie `__Host-adv` on its own origin `adv.<storefront>` (2026-09-19), and every request checks ownership.

| Route | What it does | Origin |
|---|---|---|
| `GET /o/:code` | the exit screen: the full domain and whether the link is disabled; counts nothing (§6.3) | **spec** |
| `GET /o/:code/go` | 302 to the venue's site, `redirect_hits + 1` without a person; a disabled one — 410, an unknown code — 404; `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, link previews are not counted (§6.2; panel 2026-09-19) | **spec** |
| `POST /o/:code/report` | a link complaint without an e-mail; two counting ones from different people disable the link at once (§10.1) | **spec** |
| `POST /offers/:id/complaints` | "the discount was not given": the e-mail is required, private; 3 counting ones hide the offer; 202 with `{id, counts_towards_autohide}`, no e-mail — 422 (§10, §10.2) | **spec** |
| `POST /adv/signup` | open an account: e-mail and contact; always 204, confirmed by a link (§2.1) | **spec** |
| `GET /adv/venues` | your venues with their verification status | **spec** |
| `POST /adv/venues` | add a venue: name and address, `unverified` until the code; 201 with `Location` (§11) | **spec** |
| `PATCH /adv/venues/:id` | change it; a new address is `unverified` again and a new envelope (§11) | **spec** |
| `POST /adv/venues/:id/envelope` | order the envelope with the code, 30 days (§11) | **spec** |
| `POST /adv/venues/:id/verify` | enter the code; attempts counted, the code burnt after several wrong ones; a wrong one — 422, a burnt one — 409 (§2.1) | **spec** |
| `POST /adv/venues/not-us` | "it's not us" without a session: the code from an unordered envelope puts `suspended` at once (owner's decision of 2026-09-19) | **spec** |
| `GET /adv/offers` | my offers: live and expired, `redirect_hits` and the complaint count — no other figures | **spec** |
| `POST /adv/offers` | publish from a `verified` venue; the automatic checks or 422 with a reason; "show again" is `repeated_from` (§6, §8) | **spec** |
| `GET /adv/complaints` | complaints on your offers: text and date, without the complainant and the time (§10) | **spec** |
| `POST /adv/complaints/:id/response` | answer the moderator privately (§10.3) | **spec** |
| `POST /admin/offer-complaints/:id/decision` | a decision `resolved` \| `rejected` with a reason; to the complainant by e-mail; one instance (§10.2) | **spec** |
| `POST /admin/venues/:id/suspend` | suspend a venue by hand after 3 resolved complaints within 90 days (§10.2) | **spec** |

## 5. Limits

| What | Value | Who enforces it |
|---|---|---|
| phrase length | 128 graphemes | the node; the database holds a wide net, `octet_length(text) <= 2048` |
| table name | 24 graphemes | the node; the database holds a net, `octet_length(name) <= 256` |
| chat message length | `max_message_length`, 256 by default | the client's counter |
| ciphertext size | `max_ciphertext_bytes`, 2048 bytes by default | the node |
| `NOTIFY` payload | 8 KB | Postgres |
| live phrases | 4 | the node |
| publications | 4 per hour | the node |
| a phrase's area radius | five steps: 100, 300, 1000, 3000, 10000 metres | a `CHECK` in the database |
| coordinate rounding in a response | to a grid node stepped by the phrase's radius | the node |
| PIN attempts | 10, then access locked until the paper code, the share kept | the node |
| transfer-code claim misses | per address, and 50 an hour per node, then a 15-minute pause — as recovery | the node |
| identity creation | 10 per hour and 30 per day per address | the node |
| raising by paper code | 10 an hour and 30 a day per address, plus the shared brake of 50 misses an hour | the node |
| transfer window (`POST /sessions/invite`) | 10 an hour and 30 a day per address | the node |
| a like and taking it back | 300 an hour per identity | the node |
| the list in `POST /chats/alive` | 200 ids | the node |
| the first-PIN grant | 1 hour after a recovery or a transfer, then the paper code again | the node |
| tables set | 4 an hour per identity | the node |
| seating attempts | 30 an hour per identity | the node |
| blocks | 20 an hour per identity | the node |
| hidings | 60 an hour per identity | the node |
| stickers at a table | 6 a minute per identity | the node |
| profile edits | 10 a day per identity | the node |
| paper-code reissues | 3 a day per identity | the node |
| socket ticket lifetime | 30 seconds | the node |
| messages in a chat | 60 a minute per identity | the node |
| nonce lifetime | 10 minutes | the node |
| density requests | 100 an hour per identity — more is a density profile being taken | the node |
| feed reads | 300 an hour per identity — a fan-out of identities computing an author's age gets expensive | the node |
| queue throughput | ~20 phrases per minute, **not yet measured** | the node |
| false-block budget | 7% — the moderation threshold is derived from it | the node's config |
| report threshold | 5% of a phrase's possible audience | the node's config |
| floor of the report threshold | 3 people | the node's config |

**The node states them itself: `GET /limits` (2026-09-22).** The public route answers `{phrase_length, chat_ciphertext_chars}` — the very numbers `POST /feed` and `POST /chats/:id/messages` refuse by. A face shows them before a person types rather than after the refusal: the terminal carried 146 in its own source while the node refused at 128, and the first to learn of it was the person who had finished the sentence (review panel, 2026-09-22). The route guarantees nothing on its own — the client is open, and the check stays where the work happens.

**The seven "per identity" rows and the ticket lifetime were added 2026-09-16 (panel, OPS-13):** each limit's key is in its row; `Retry-After` for a daily or hourly counter is the seconds until the oldest counted event leaves the sliding window; **per-identity counters live in the node's memory and are not journaled** — a restart resets them and every node of the pool keeps its own, and that is accepted: none of them guards a secret (OPS-2, LAW-5 of pass 3); moves have no rate limit of their own — the move window holds them. **The last three rows are deploy-time parameters, not constants of the code**
(decided 2026-08-27–2026-08-28, `route-to-code_EN.md`). The environment variable names are
proposed here and need agreement: `MODERATION_FALSE_BLOCK_BUDGET`,
`REPORT_THRESHOLD_SHARE`, `REPORT_THRESHOLD_FLOOR`. They are not in the node's
config today and should not be: the moderation queue arrives at step 2, and
creating keys for a subsystem that does not exist leaves numbers in the code that
nobody reads.

**Two limits on message length are not a duplicate.** The client counts
characters, the node counts ciphertext bytes: what it sees is ciphertext, and
counting characters in it is impossible either exactly or approximately.

## 6. Errors

What the spec states: `POST /feed` answers **202**; an undelivered message yields
`error` — the same behaviour as being offline. [retired] This said "routes that do not
exist yet answer 404 (`/feed`) and 501 (`/chat`)": both were built on 2026-09-21, and
`GET /chat` without an upgrade answers **426**.

**The "accept again" refusal is the one shape already needed** (2026-08-29).
Any signed request that publishes or opens a chat answers **409** with the
documents whose revisions have parted from the accepted ones:

```
{ "error": "legal_reacceptance_required",
  "documents": [ { "document": "terms",
                   "revision_date": "2026-09-14",
                   "revision_sha256": "…" } ] }
```

Reading the feed is **not** closed by this refusal: someone who came to read a
reply gets the conversation, not a legal text (screen 11). The guidelines appear in
this list like the other two: since 2026-09-15 they need the checkbox too (§8.2).
[retired] This said "the node records their new revision itself".

**The error shape — decided 2026-09-16:** the one `/v1` already has (`relay/node/src/routes/v1.ts`):

```
{ "error": { "code": "not_your_turn",
             "message": "it is the other player's turn",
             "reason": "…" } }
```

`code` is a machine name from the closed list in `docs/api/openapi.yaml` (`ApiError`), `message` is text for a person in the request's language, `reason` appears only on moderation refusals and carries a text from `refusal-wordings_EN.md`. The 409 "accept again" refusal does not move into this shape: it has its own, named above; the client tells the two bodies under one 409 apart by the presence of `error.code` — the re-acceptance has none, and `POST /feed` and the like are described in `openapi.yaml` as `oneOf` (CON-6). The codes `stale_seq` and `nothing_to_undo` were added 2026-09-16 (DATA-24, OPS-12). **A rate limit is a 429 in the same shape with `code: rate_limited` and a `Retry-After` header in seconds**, as the built `POST /report` and `POST /waitlist` do (`report.ts`, `waitlist.ts`). **The protocol version is the header `x-protocol-version` carrying the integer major version** on every request; an unsupported one answers **400** `protocol_version_unsupported` with the update command in `message`; the header is not signed, and forging it only refuses that same request. **Pagination is a cursor:** `GET /feed` and `GET /inbox` take `?after=<opaque string>` and answer `{items, next}`; an empty `next` is the end; the cursor encodes (`visible_at`, `id`) for the feed and (`created_at`, `id`) for the inbox (DATA-5) and reveals nothing beyond what was already given out. The intake routes from the storefronts (`/waitlist`, `/report`, `/pageview`) keep the flat string `{error: "…"}` — they are built and not signed by an identity.

[retired] This said "there is no single error shape in the spec, and I did not invent one here".

## 7. What the protocol does not have and will not

- **Push** — neither in the web nor in the terminal: an intermediary would get the
  rhythm of a conversation.
- **Exports and `--json`** — a feed and a conversation are not data for a pipeline.
- **People's identifiers in responses** — neither a phrase's author nor whoever
  liked it.
- **The area in a notice's snapshot** — it is the text that can be unlawful, not
  the place.

## 8. Open

The list is deliberately short: this is what cannot be derived from the spec, and
it has to be settled before the first line of step 1.

1. ~~**The error shape**~~ — **decided 2026-09-16:** `{error: {code, message, reason?}}`, §6.
2. ~~**The names of the proposed routes**~~ — **all 56 agreed as they are on 2026-09-17** (`docs/api/ROUTES_2026-09-17_naming_EN.md`); the status in `openapi.yaml` is `spec`. The §8 list is empty: code may begin.
3. ~~**How a client states its protocol version**~~ — **decided 2026-09-16:** the header
   `x-protocol-version`, on the socket the subprotocol `xor.p1`; §6, §4.4.
4. ~~**Pagination of the feed and the inbox**~~ — **decided 2026-09-16:** a cursor `?after`,
   the answer `{items, next}`; §6.
5. ~~**The response shape when a rate limit is hit**~~ — **decided 2026-09-16:** a 429 in the
   common shape with `code: rate_limited` and `Retry-After`; §6.
6. ~~**The wordings of moderation refusals**~~ — **they exist since 2026-09-08** in
   `refusal-wordings_EN.md` §1–6 as a proposal until read aloud; in an answer they travel in
   the `reason` field (§6). [retired] This said "they do not exist at all".
7. **The shared miss counter has its number: 50 an hour per node, a 15-minute
   pause. Decided 2026-09-08.** Fifty wrong paper codes in an hour across the
   node and recovery stops accepting codes for fifteen minutes, for everyone. The
   per-address count (`chat-flows_EN.md` §5) stays: it catches one persistent
   person, the shared one catches distributed guessing, for which changing address
   costs nothing. The numbers live in `docs/facts/limits.tsv`
   (`recovery.miss.shared`, `recovery.miss.pause`), not only here.

   Why not "an alert in the log" at a higher threshold: an alert needs a reader,
   and at night there is none — a defence that rests on someone being present is
   not a defence by morning. The price of the pause is stated plainly: during an
   hour when guessing is under way, an honest person holding their paper gets a
   refusal and waits fifteen minutes. That is worse than nothing and better than
   brute force over the whole base; the band was picked so ordinary typos do not
   reach it — the neighbouring number (10 PIN attempts) is an order of magnitude lower and
   counted per session, not per node (clarified 2026-09-15, final panel SEC-10:
   this said "5 transfer-code attempts… per address" [retired]).

   **Since 2026-09-14 the pause has a second price, and it is accepted too.** The
   paper code became the only way out for a session frozen by the PIN limit as well
   (`chat_EN.md` §8.2), so distributed guessing, even unsuccessful, keeps that way out
   closed for everyone — for roughly fifty misses an hour: while the sliding hour holds
   fifty or more, the pause renews right after the previous one ends and has no end
   (clarified 2026-09-14; this said "two hundred requests" [retired]). The review panel of
   2026-09-14 proposed replacing the pause with a growing cost; it was decided to keep
   the pause and name the price on storefront screen 12.
8. **"No network" and "the node is down" are told apart like this — decided 2026-09-15
   after the final panel (OPS-10).** A network error or a timeout means "no network"
   only if a probe of an outside address fails too; otherwise it, and any 5xx from the
   node including 503, means "it is on our side".
