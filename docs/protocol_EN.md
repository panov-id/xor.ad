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
| **proposed** | the operation is described in the spec but had no name; the name is given **here** and needs agreement |

The distinction is not a formality. A project rule forbids inventing API fields
and endpoint behaviour; separating what was collected from what is proposed is the
only honest way to write this document without breaking it.

## 1. General

- **Transport:** HTTPS for requests, WebSocket for delivery. The socket is needed
  only by chats and tables; the feed, likes and matches live on requests.
- **Format:** JSON bodies, UTF-8. There is no binary protocol and none is planned.
- **Time:** unix seconds, UTC. There are no time zones anywhere in the protocol.
- **Not one user identifier leaves the node** (§8.11): a client knows exactly two
  kinds of uuid — a feed phrase and a chat.

## 2. Request signing — from the spec, verbatim

```
signed      <method>\n<path>\n<sha256 of body>\n<unix time>
headers     x-identity-session   uuid of the live session
            x-identity-time      the same time as in the string
            x-identity-sign      the signature, base64url
window      ±5 minutes
algorithm   ECDSA, namedCurve P-256, hash SHA-256
```

- **The body enters as a hash, not whole** — otherwise the signature would be
  computed over a stream.
- **The path enters without its query string**: anything can end up there, and a
  signature has to be reproducible.
- **A window instead of a nonce** is a deliberate trade (§8.2): whoever intercepts
  a request can replay it within five minutes; a nonce would require shared memory
  across nodes.

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
- **How exactly a client states its version is open** (see §8). The spec says "the
  client sends its version, the node knows the minimum supported" without naming a
  field.

## 4. Routes

### 4.1. Identity and session (step 1 of §13)

| Route | What it does | Origin |
|---|---|---|
| `POST /identities` | creates an identity: the public half of the key, name, age; the node returns `identity_id` | **proposed** (§8.2) |
| `POST /vault/share` | exchanges proof of knowing the PIN for the node's share of the vault key; ten wrong attempts burn the share | **proposed** (§8.2) |
| `POST /sessions/invite` | a transfer code for another device: nine characters, two minutes, one use | **spec** |
| `POST /sessions/claim` | using the code on the new device; the old one goes still | **spec** |
| `POST /recovery/claim` | raising an identity from the paper code | **proposed** (§8.2, §13) |
| `GET /legal/manifest` | the three documents' revisions: date, substance `sha256`, re-acceptance policy | **proposed** (2026-08-29) |
| `POST /legal/accept` | records an acceptance: document, date, hash; one row each | **proposed** (2026-08-29) |

**Registration is three steps, all mandatory:** name and age, then the PIN and the
exchange with the node for its share, then the paper code. Without the share the
local database stays unencrypted; without the code a lost device means a lost
identity.

### 4.2. The feed (step 2)

| Route | What it does | Origin |
|---|---|---|
| `POST /feed` | publishes a phrase; answers **202** at once, `visible_at` stays empty until the queue's verdict | **spec** |
| `GET /feed` | delivery by intersecting circles, with the language, mode and age filters | **spec** (named in the test map) |
| `DELETE /feed/:id` | withdraws your own phrase; the slot is freed, the 64-minute ceiling is not | **proposed** (§8.3) |
| `GET /feed/density` | the density band under the radius handle: `nobody here yet` … `hundreds`, on release | **proposed** (§8.3, screen 3) |

A feed response carries `{id, text, mode, lat, lon, area_radius, like_count,
created_at}` — **a circle, not a point**, and nothing about the author. `lat`/`lon` are **rounded to a grid node stepped by `area_radius`** (the formula is in `chat_EN.md` §8.3); the exact ones never leave and stay only for computing the overlap.

### 4.3. Like, match, chat (steps 3–6)

| Route | What it does | Origin |
|---|---|---|
| `POST /feed/:id/like` | likes a phrase or an offer; an offer's match is one-sided and needs no live phrase of your own | **proposed** (§8.4) |
| `POST /matches/:id/consent` | consent to talk; the chat opens when both have consented | **proposed** (§8.5) |
| `GET /inbox` | offers and conversations in one response; a count only on offers | **spec** |
| `POST /chats/:id/ticket` | a one-time ticket for the socket, short-lived | **spec** |
| `POST /chats/alive` | a reconciliation: which chats are still alive; the client wipes the rest | **spec** |
| `DELETE /chats/:id` | closes a conversation by hand — for both at once | **proposed** (§5, screen 8) |
| `PATCH /chats/:id` | your own span handle: 10 / 30 / 60 minutes or "while we're talking" (260 minutes, 4:20) | **proposed** (§8.6) |

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

The difference between 4002 and 4003 is not politeness: in the first case
reconnecting is pointless forever, in the second it is pointless for this
conversation. A client that does not tell them apart either hammers a closed door
or takes a live identity for a dead one.

## 5. Limits

| What | Value | Who enforces it |
|---|---|---|
| phrase length | 128 characters | a `CHECK` in the database |
| chat message length | `max_message_length`, 256 by default | the client's counter |
| ciphertext size | `max_ciphertext_bytes`, 2048 bytes by default | the node |
| `NOTIFY` payload | 8 KB | Postgres |
| live phrases | 4 | the node |
| publications | 4 per hour | the node |
| a phrase's area radius | five steps: 100, 300, 1000, 3000, 10000 metres | a `CHECK` in the database |
| coordinate rounding in a response | to a grid node stepped by the phrase's radius | the node |
| PIN attempts | 10, then the share burns | the node |
| transfer code attempts | 5, then the invitation burns | the node |
| queue throughput | ~20 phrases per minute, **not yet measured** | the node |
| false-block budget | 7% — the moderation threshold is derived from it | the node's config |
| report threshold | 5% of a phrase's possible audience | the node's config |
| floor of the report threshold | 3 people | the node's config |

**The last three rows are deploy-time parameters, not constants of the code**
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
`error` — the same behaviour as being offline; routes that do not exist yet answer
**404** (`/feed`) and **501** (`/chat`).

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
reply gets the conversation, not a legal text (screen 11). The guidelines never
appear in this list — the node records their new revision itself (§8.2).

**There is no single error shape in the spec, and I did not invent one here** —
see §8. It is the first thing to agree on: without a common shape the two faces
diverge exactly where §13 promises they will not.

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

1. **The error shape** — code, machine name, text for a person, and a field for
   the reason a moderation refusal gives.
2. **The names of the proposed routes** — the nine rows marked "proposed" above.
3. **How a client states its protocol version** — a header, a body field, or a
   path segment.
4. **Pagination of the feed and the inbox** — a cursor or an offset; the spec is
   silent.
5. **The response shape when a rate limit is hit** — a 429 with what inside.
6. **The wordings of moderation refusals** — they do not exist at all, and §7 of
   the storefront mechanics admits it; without them the Article 17 statement of
   reasons has nothing to fill it.
7. **The threshold of the shared miss counter in recovery** — a count per address
   plus a shared counter are named in `chat-flows_EN.md` §5, and the shared one
   has no number at all, nor a consequence for reaching it. The neighbouring
   numbers were chosen (10 PIN attempts, 5 transfer-code attempts); this one was
   not, and it must not be invented here: too low a threshold locks out someone
   who merely misread a character on paper, too high leaves brute force over the
   whole base.
