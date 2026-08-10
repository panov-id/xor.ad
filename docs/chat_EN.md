# Chat — specification

Single document for the chat functionality. Consolidates requirements from `app-prototype-spec_EN.md`, `app-ui-notes_EN.md`, `backlog_EN.md`, `roadmap_EN.md`. Status: foundation (implementation in later steps).

## 1. Purpose

Chat is a private **ephemeral** conversation between two people, opened **only after a mutual like** (a match) in the city feed. It is not a messenger: a chat lives for a limited time and disappears together with its context. The goal is a shared "moment" here and now, not a forever correspondence.

Principles:
- **Ephemerality** — a chat has a lifetime; on expiry it fades and disappears.
- **Match context** — you can see what made you match (the liked phrases).
- **Low entry cost** — ice-breaking over "features": short messages, rules-free shared games.

## 2. Match model

Path from feed to an open chat (data model — §8.5):

1. **Like** — tap the logo button on a feed phrase.
2. **Mutual like** — if that person once liked your phrase and **both phrases are still alive in the feed** → a match appears. An expired phrase produces no more matches.
3. **`Matches`** — the match card: the peer's phrase, its mode (`alone` / `company` / `party`), name and age, a `match expires · Nh Nm` timer. The chat is **not open yet**.
4. **Double consent** — **both** press "open chat". Once one does, the other sees "waiting for you". This is also where each picks the chat's lifetime (§5).
5. **Open chat** — it appears in `Chats` and the sliding timer starts.

A match lives until the first of the two phrases dies. If both did not press in time, the match disappears and there was no chat.

System message on open: `you both liked this — chat is open`.

Liking again when a chat with that person is already open creates **no new match** — the phrase arrives straight into the chat as an `extra_like` card (§8.7).

## 3. Chat list

- Tabs: **`Chats N`** / **`Matches N`** (brutalist blocks, active one has an accent fill).
- **Thread** (`.thread`): letter avatar, name, last-activity time, **last-message preview** (its own line), **timer** (accent, its own line), a `›` chevron as a click-affordance.
- **`Matches`** — match cards: phrase + mode + name and age, a timer to expiry, an "open chat" button; after your own press, "waiting for you".
- Click a thread → opens the conversation.
- The tab counters *are* the inbox (§8.12): unread items and matches awaiting a decision are derived from state, and there is no separate notifications screen.

## 4. Conversation

- Header: "back" button, name and age + timer (accent; the disappearance counter only appears past the silence threshold, §5), a 🎲 **"propose a game"** button.
- **Liked phrases (match context):** at the start of the conversation, a `Liked, in order` block — a numbered list of phrases in **like order**, tagged `You liked` / `They liked` with the quote. Shows why you matched.
- **Bubbles:**
  - `them` — left, surface `--ink-2`, offset shadow;
  - `me` — right, accent fill `--gold` + `--gold-ink`;
  - `sys` — centered, mono (system events: chat opened, game proposal, the peer changing their name or age);
  - `extra_like` — centered, a card with the quote and a number matching the one in `Liked, in order` (§8.7);
  - each bubble shows a time (`HH:MM`).
- **Composer** (`.composer`): a `Write a message…` field + a send button (arrow, accent fill). Submit appends a `me` bubble and scrolls to the bottom. The length limit **comes from the server**, 256 characters by default; the client draws the counter but does not decide it (§8.6).

## 5. Ephemerality

- A chat's TTL is **sliding**: it lives no longer than the chosen span **after the last activity**. Activity means a delivered message or a move in a game.
- **Each person picks the span** when consenting to the chat ("delete after N hours if we don't talk"), and the **smaller of the two** applies: one person's caution is not overridden by the other's generosity. The value is visible to both; who set it is not. It cannot be changed inside an open chat.
- **The silence counter** appears not immediately but after `min(20 minutes, span / 3)` of silence, and counts down to the chat's disappearance. Any message or move resets it.
- As expiry approaches — visual **fading**; on expiry the chat **disappears for both** with all its content (messages, liked phrases, game board).
- The span and last-activity time are stored on the server; the conversation itself lives only in browsers (§8.8), and the client sweeps it via `POST /chats/alive` (§8.10).
- The **feed** has its own span — a phrase lives N hours; a **match** has its own — until the first of the two phrases dies. Three different timers for three different reasons.
- Open questions: the set of spans offered; behavior at the exact expiry moment (hide instantly / show "expired").

## 6. Rules-free shared games

Inside a chat — a shared visual board for two: **dominoes, checkers, chess**. The twist: **no hard-coded rules** — the engine only draws the board and lets players move/place pieces freely; players invent and enforce the rules themselves. It is an ice-breaker, not a competition.

- Start/switch is **request-based**: the 🎲 "propose a game" button → pick a board → the other person gets a request → they accept → the board opens for both. Switching games is the same request.
- No move validation, no score, no winner — only board state + dragging.
- Both players can move pieces (there are no rules).
- The board lives within the chat and **disappears with it** (ephemerality).
- Sync in real time (see §7).

## 7. Realtime

- Message exchange, game-board state, and game requests go through **our own WebSocket** on the relay node (`src/chat/relay.ts`), over the **api proxy** (same-origin, via the gateway). Not Supabase — see §8.1.
- New messages arrive without a reload; the city feed refreshes separately (`Refresh` / `Auto` ~6s).

## 8. Data model

Requirements level — schema as sketches; implementation is a separate step (migration `relay/node/db/005_chat.sql`, applied by `tools/migrate_db.ts`).

**Core principle: no user identifier ever leaves the server.** A client knows exactly two kinds of UUID — a feed phrase id and a chat id. Who wrote a phrase, who liked it, who is in a chat with whom, how many chats someone has — all of it stays inside the database and never appears in an API response.

**Second principle: a brand is a face, not a boundary of visibility.** `identities` and `feed_messages` have no `brand` column and never will. There is one world, divided only by geography and the age band.

This is a decision, not an oversight. A neighbourhood network split by which website you arrived from stops being a neighbourhood network: two people on the same street must see each other whether they came through one storefront, the other, or the terminal. And for a face whose own storefront is only just starting, the shared feed is the only thing standing between a person and an empty screen.

A brand still decides a great deal — just not this:

| A brand decides | A brand does not decide |
|---|---|
| texts, emails, styling, the legal entity | who is visible in the feed |
| where waitlist leads land (`scoped_storage`) | who a match is possible with |
| who sees them in the panel | who ends up in a chat |
| attribution: which face a person came through | — |

Technically the brand comes from the API key and from nowhere else (`lib/tenant.ts`), while a person is identified by their own signature (§8.2). These are different questions and must not be conflated: the key answers "which face", the signature "which person".

### 8.1. Stack

Our own node, not Supabase: Deno + our own Postgres (`relay/node/src/lib/db.ts`, driver `jsr:@db/postgres`).

- **Realtime** — our own WebSocket: `relayUpgrade()` in `src/chat/relay.ts` terminates the room by `chat_id` and fans messages out. No table subscriptions — messages are never written to the database.

**Which node it is must not matter.** If a room lives in one node's memory, both participants have to land on that same node — stickiness on the balancer — and losing the node tears down every conversation on it. Instead the nodes talk over a bus on the Postgres we already run:

```
peer A ──ws── node 1 ──┐
                       ├── NOTIFY chat_<id>, payload  →  LISTEN on every node
peer B ──ws── node 2 ──┘        ↓
                          node 2 finds B's socket locally and delivers
```

`LISTEN` / `NOTIFY` fits unusually well here: it is **transit** delivery with no write — exactly what a chat without history needs. The 8 KB payload limit covers a 256-character message many times over, and if the recipient is on no node at all the message simply never arrives and the sender gets `error` — the same behaviour as an offline peer (8.8).

What it buys: any participant can connect to any node, no stickiness is needed, and a node failure takes down only its own sockets — reconnecting to a neighbour resumes the same chat. Zero new dependencies: Postgres is already there, Redis is not needed.

The limit to remember: the bus works within one database. The node pool in 8.1 assumes a shared Postgres; geographically separate independent databases would need something else — but that is a conversation for `chat-decentralized-ideas_EN.md`, not for v1.
- **No RLS needed**: the client never talks to Postgres directly, a handler always sits in between. "Participants only" is a plain check in code.
- **Geo without PostGIS**: circles are computed from `lat`/`lon` + haversine (see 8.3). PostGIS is only needed once arbitrary polygons replace circles.

### 8.2. Identity and sessions

An identity lives **on the device**: `identity_id` + a secret, signing every request (the server stores the secret's hash). Where exactly depends on the face: in the web it is IndexedDB, in the terminal client `depth` it is a file in the mounted volume. There is no email and no password by construction; the only way back after losing the device is the **paper recovery code**, handed to the person at registration, which we can neither look up nor reset.

**Every client starts as its own identity.** The key is born locally and nothing ties it to any other: the web on a phone, the web on a laptop and `depth` in a container are three different neighbours until the person transfers an identity there. The consequence is accepted deliberately: one person holding two separate identities appears twice in the feed and can like themselves. That is the price of refusing to recognise devices, and it is cheaper than a fingerprint (below).

```sql
CREATE TABLE identities (
  id               uuid PRIMARY KEY,
  name             text NOT NULL,
  age              integer NOT NULL,
  identity_public_key text NOT NULL,    -- long-lived key: proves the identity (§8.13)
  recovery_auth_hash  text NOT NULL,    -- hash of half the paper code: how the node finds the identity
  recovery_wrapped_key bytea NOT NULL,  -- the long-lived key under the other half; the node cannot open it
  recovery_attempts_left smallint NOT NULL DEFAULT 10,
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz          -- NULL = live
);
```

- **Name and age** are the only registration data, asked **on the first visit**, before the feed. There is no anonymous browsing: age comes before everything else because it decides what the feed hands out (see "Age bands"). Hence both columns are `NOT NULL` from the start.
- **Name and age can be changed** without losing the identity or its chats. A deliberate trade: "registration data" stops being immutable, and nobody has to erase themselves over a typo or a birthday.  Every few months the app re-asks: "still 38?".
- **Starting over** remains a separate action: the old identity gets `closed_at` and everything goes with it, including its long-lived key.

**There is no browser fingerprint — by decision, not by omission.** It used to be here: computed on the server from the IP subnet, the connection's TLS fingerprint and the header order, holding up the "one live identity per device" rule and a block that survived a new identity. It was removed for two reasons.

First, it stopped working. Everything it was built from came **from the connection itself** — and the application's traffic goes through the CDN, so what reaches the node is the CDN's connection, not a person's. The TLS fingerprint and header order became identical for everyone arriving through the same edge. Two of four inputs survived.

Second, it misled. The spec itself called it "a barrier, not a guarantee", yet it closed other people's identities and blocked neighbours behind one home NAT: the cost of a mistake fell on the uninvolved, while shedding it took ten seconds of clearing site data. A mechanism that fails to stop the person it aims at, and hits the person it does not, is worse than no mechanism.

What replaces it is what actually works and already exists: **per-address rate limiting**, **synchronous feed moderation before publication** (§8.3) — which cuts the text, not the author — and **a chat door that opens only on a mutual like with double consent**.

**One live session per identity.** At any moment an identity exists on one device. Moving to another is not an addition but a **transfer**: the new one comes alive, the previous one freezes.

```sql
CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  identity        uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  sign_public_key text NOT NULL,       -- request signing; one per device
  wrap_public_key text NOT NULL,       -- chat keys are wrapped to it (§8.13)
  label           text,                -- "Chrome, Android" — what the device called itself
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  frozen_at       timestamptz          -- NULL = live; set on transfer
);
CREATE UNIQUE INDEX ON sessions (identity) WHERE frozen_at IS NULL;
```

The partial unique index is the rule itself: the database will not accept a second live session, and no code path can work around it.

**Why one and not several.** The earlier design had many devices and symmetric revocation: any of them could disconnect any other. That had a hole no rule could close. Whoever talked a person out of their linking code could disconnect every device the owner had, leaving nowhere to come back to — and that is indistinguishable from the legitimate case ("was talking from the terminal, moved to the phone, killing the terminal"): to the node both are the same picture, a fresh session ending an old one. A rule like "younger than a day cannot revoke" broke exactly the case we needed, not the attack.

With one session that action does not exist. Transfer is the only mechanism, and it is performed by whoever is holding the device.

The price is stated plainly: **a phone and a laptop do not work at the same time**. There is no reading from two screens; there is only transferring back and forth, and transfers are cheap.

There are four kinds of key, and keeping them apart is the point:

| Key | Whose | For what |
|---|---|---|
| The identity's long-lived key | one per identity, travels with it | proving to a peer that this is the same identity |
| A session's signing key | one per device | signing requests; freezing strikes here |
| A chat key | one per conversation | encrypting the talk; dies with the chat (§8.13) |
| A vault key | one per device, from the PIN and the node's share | encrypting what sits on disk (below) |

Freezing works because the first two are separate: the server stops accepting a frozen session's signature, while the identity travels on with its long-lived key.

**Identity transfer — a code, not a link.** The device that is already signed in shows nine characters; the person types them on the new device. No link and no QR code: the transfer lives entirely inside the clients, there is no page for it and no domain is registered for it.

```
      K7Q - M3F - 2X9        alive for 2 minutes, applied once
```

The alphabet is Crockford base32 without `I`, `L`, `O`, `U`: they get confused with one and zero. Case does not matter and the dashes are optional.

```
device with  code = 9 random characters
the identity material = Argon2id(code, salt "xor.ad/device-link/v1", 64 MB, t=3)
             lookup_id  = material[0..32]    ─► goes to the server
             secret_key = material[32..64]   ─► goes NOWHERE
             POST /sessions/invite {lookup_id, ttl: 120s}
new          the person types the code, the same Argon2id yields the same 64 bytes
device       generates ITS OWN pairs: one for signing, one for wrapping
             POST /sessions/claim {lookup_id, enc_secret(sign_pub, wrap_pub, label)}
first        decrypted the envelope ─► so the code was typed correctly
             ASKS THE PERSON (below) ─► only after "that's me":
             puts the identity's long-lived key into the reply envelope
             and sets its own frozen_at — the identity has left
```

**Stretching is not hardening, it is the precondition.** Nine characters are 45 bits: under a plain hash they fall in hours, and the server, which holds `lookup_id`, would derive `secret_key` itself. Argon2id makes each attempt cost about 0.1 s, turning an offline search into hundreds of thousands of years. The online one is closed by the server: **five attempts per invite**, after which it burns.

**What the server sees and does not see.** It sees `lookup_id` and two opaque envelopes — enough to match the two sides, and nothing else. The identity's long-lived key passes through it encrypted.

**Confirmation with context is a required step.** Decrypting the envelope proves the code was typed correctly, and that is enough against a typo. But a typo threatens nobody: the person at risk here is the one who read the code out over the phone, and they make no mistakes. So the old device stops and shows what it knows:

```
  a device is asking to take the identity

  called itself   Chrome, Android
  network         different from this device's
  when            just now

  Nobody from support will ever ask for this code.

  [ that's me ]                        [ decline ]
```

Three lines, chosen because each can be substantiated and none pretends to be more than it is.

**"Called itself", not "device".** The label is sent by the other side, is backed by nothing, and can say anything. Presenting it as fact would be lying on the very screen built against deception.

**"Network"** compares the addresses of both sides, both of which the node sees. No geo database and no new dependency. It is the most useful signal there is: a laptop and a phone at home give one network, a voice on the line a thousand kilometres away gives another. And it is **a hint, not a verdict**: a phone on mobile data next to you also reads "different", so the text reports an observation rather than passing judgement.

Until "that's me" is pressed, the other side receives nothing. Silence or a closed tab means the code expired in two minutes and no transfer happened.

What this step does not do: if the person has been talked into pressing it, it will not save them. It provides a pause and a fact — the decision stays with the person.

**The invite is single-use and lives minutes.** Applied or expired, it does nothing.

**In `depth` the code is read from standard input only** — never as a command argument and never as an environment variable: an argument is visible in `ps` to every process on the machine and settles into the shell history, and a variable is shown by `docker inspect`. The transfer screen is drawn in the terminal's alternate buffer and cleared on exit, or those nine characters would stay in the scrollback and in the multiplexer's log.

**What freezing does.** A frozen device loses node access at once: its signature is accepted nowhere, delivery subscription included, so it receives no new messages **even in the chats that were open on it**. Nor are the keys of new conversations wrapped for it.

What freezing does **not** do is wipe the disk. The local database stays where it is, encrypted with that device's vault key (below), and that is deliberate: bringing the identity back brings the whole conversation history back with it.

```
laptop is talking ─► transfer to the phone ─► laptop frozen, disk intact
        ...later...
the phone shows a code ─► the laptop wakes and asks for ITS old PIN
                          ─► the history is all there
```

On the phone the chats are the same and the windows are empty: the new device has no history and no way to get any — messages are not in the database (§8.8), there is nothing to download. That is not a loss but "nothing here yet", and it should be said that way.

**The keys of live chats are not rotated on transfer.** Rotation protects against a participant who keeps receiving ciphertext; a frozen one receives none, so there is nobody to rotate against. Written down here so the question does not come back.

The interface says so plainly, not in small print:

> The identity has moved to another device. Here it is frozen: new messages will stop arriving, and the conversations stay on disk encrypted — they come back if you bring the identity back.

**A delayed freeze was considered and rejected.** The idea was to keep the previous device alive for a day and show "you are being disconnected — [that's not me]" on it the whole time. Against identity theft that works, but it breaks the main legitimate case: someone talked from a borrowed laptop, walked away, and the laptop stays live for another day — where whoever sits down at that desk can cancel the disconnection. Leaving means closing the door now. The paper code (below) serves as the insurance instead: being locked out for good is not possible anyway.

**The transfer risk is social, not cryptographic.** Nobody will guess the code; they will ask a person to read it out. Hence the defences — two minutes, one application, five entry attempts, confirmation with context, and the paper code as the owner's last word.

**What became of "a different browser is a different person".** It stands, and now covers every face: **a different device is a different person**, unless the identity was transferred there deliberately. For `depth` it reads the same way: a different volume is a different person.

#### The PIN and local storage

**A PIN is mandatory and asked at registration** — six digits, twice. It does two things at once: it locks an open tab against whoever picks the device up, and it takes part in encrypting everything on disk.

Six digits are a million combinations, and on their own they are not protection: whoever copies the profile brute-forces them at home in minutes. So the vault key **cannot be assembled from the disk alone**: half of it comes from the node.

```
device  material = Argon2id(pin, device salt, 64 MB, t=3)
        auth  = material[0..32]   ─► goes to the node
        local = material[32..64]  ─► goes NOWHERE
node    compares the hash of auth; match ─► hands over the share, resets the counter
                                  no    ─► counter minus one
device  vault key = HKDF(local ‖ share)
```

**The node checks the PIN, not the device.** This is the easy thing to get wrong: hand the share to anyone who asks and an attacker takes it once, then brute-forces a million combinations offline, and the whole scheme collapses. Proof of knowing the PIN comes **before** the share is released, and the node keeps the attempt counter.

```sql
CREATE TABLE vault_shares (
  session       uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  auth_hash     text NOT NULL,       -- hash of half the material; the PIN itself is unknown to the node
  share         bytea NOT NULL,      -- 32 random bytes, meaningless to the node
  attempts_left smallint NOT NULL DEFAULT 10,
  burned_at     timestamptz,
  last_used_at  timestamptz NOT NULL DEFAULT now()
);
```

**A share belongs to a device, not to an identity.** Otherwise changing the PIN on a new device would break the previous device's database, and whoever took the identity and set their own PIN would read someone else's old conversations. So each device has its own share, its own PIN and its own counter, and nothing reaches another device's share — including a live session of the same identity.

**The tenth wrong attempt burns the share, and that device's conversations are gone for good** — there is nothing left to decrypt them with. The identity itself is unharmed. Burning someone's conversations silently is not acceptable, so from the seventh attempt the screen says it outright:

> 3 attempts left. After that the conversations on this device are gone — neither we nor you can bring them back.

Two prices are stated plainly. **Without a network the chat does not open at all**: no share, no key, nothing old to read and nothing new to see. And **the node now holds the thing without which people lose their conversations**: losing the share table means everyone loses their history at once, so its backups deserve stricter handling than the rest.

A share lives as long as its session. A session unseen for a year is cleaned up together with its share — otherwise the node accumulates an endless list of dead devices; the period belongs in the retention policy.

#### The paper recovery code

**Shown exactly once at registration, and mandatory.** With a single live session, losing the device is the end of the identity, and the piece of paper is the only way out; it cannot be made optional.

```
      RTQ4 - 8FMK - 2PZN - XW9D
      → "written down" is confirmed by typing two of the four groups back
```

The same two-halves trick: `Argon2id(code)` yields one half by which the node **finds** the identity, and one half that **wraps the long-lived key**. The node stores the wrapped key and cannot open it.

```
recovery  code typed on a clean device
          ─► the node found the identity, returned the wrapped long-lived key
          ─► the device unwrapped it, created a new session,
             a new PIN and a new share
          ─► the previous session is frozen (the one-live rule)
          ─► the chats are there, the history is not
```

**The paper code can only be replaced by presenting the current paper code.** Without that rule, whoever takes an identity issues themselves a new one first and locks the owner out for good — the insurance would vanish exactly when it is needed.

Entry attempts are counted as they are for the PIN: the code is long-lived, so there is plenty of time to guess at it.

**The key file in `depth` is encrypted with the same vault key** — the PIN plus the node's share, with no exception for the terminal. A stolen or copied volume is useless: half the key is not in it, and getting that half means proving knowledge of the PIN to the node, which counts the attempts. This closes the terminal's main weakness: unlike the browser, where keys sit as non-extractable `CryptoKey` objects, here they are a file after all. The file itself is `0600`, and the client **refuses to start** if the permissions are wider, instead of a warning nobody reads. The price is the same as everywhere: **forget the PIN and that device's conversations are gone**, while the identity comes back with the paper code.

**Changing age and the band.** Age is freely editable **within your own pool**, but the 20/21 border can only be crossed upwards:

```
20 → 21   allowed (they turned 21)
21 → 20   refused — an adult does not walk into the teenage sandbox
```

Otherwise free age editing becomes the door into the sandbox and the whole band system is pointless. The rule is one-way and irreversible, which the UI must say before saving.

When age changes, `filter_age_min/max` are re-clamped into the new band, and every open chat receives a system message — the peer sees that a name or age changed, and when:

```
name changed  → "they now call themselves Anya"
age changed   → "they changed their age: 39"
```

Silently swapping a name mid-conversation is not allowed: the peer agreed to talk to a particular person, and a traceless swap is a way to deceive, not a convenience.

Disclaimers (both required in the UI):

> Your identity lives on one device — this one. You can move it to another yourself, and then it freezes here. Clearing browser data or deleting the volume erases both the conversations and the session; after that the only way back is the paper code you wrote down at registration. The conversations do not come back: they exist nowhere else, including with us.

> Creating a new identity loses every chat — yours and your peers'. Nothing can be restored: conversations live only on the participants' devices, never on the server.

**Age bands.** Age is not decorative — it cuts the feed. Two worlds that never meet:

```
band(A) = A ≤ 20  →  [max(13, A - 2), A + 2]      -- the sandbox
          A ≥ 21  →  [min(21, A - 2), ∞)          -- the adult pool
```

The line between 20 and 21 is soft rather than solid: right at the edge both rules reach across by the same ±2 years. A 20-year-old sees `[18, 22]`, a 21-year-old sees `[19, ∞)`, and they meet. Further from the edge the overlap ends: 19 and 22 no longer see each other, because 22 ∉ `[17, 21]` and 19 ∉ `[20, ∞)` — the rule breaks on both sides at once, with no one-way holes.

What matters is preserved. To reach the adult pool a teenager needs `A + 2 ≥ 21`, meaning they must be 19 or 20; everyone younger than 19 is cut off from 21+ entirely. And an adult never reaches deeper than 19: the lower bound `min(21, A - 2)` drops to 19 only for a 21-year-old, and by 23 it settles at 21 and goes no lower.

The rule applies **symmetrically**:

```sql
-- a pair is visible only if each falls inside the other's band
other.age BETWEEN band_low(me.age) AND band_high(me.age)
AND me.age BETWEEN band_low(other.age) AND band_high(other.age)
```

Asymmetry is unacceptable here: one side would like a phrase the other cannot see in their feed, and a match would be impossible in principle — the like would go nowhere.

On top of the band sits a **user filter**, clamped to it: narrower than your band is fine, wider is not.

```sql
ALTER TABLE identities
  ADD COLUMN age CHECK (age BETWEEN 13 AND 120),
  ADD COLUMN filter_age_min integer,   -- clamped into band(age) on write
  ADD COLUMN filter_age_max integer;
```

Age is self-declared, with no verification whatsoever. The bands separate teenagers from adults as far as that is possible without documents, and that limit should be understood plainly.

### 8.3. Feed and geography

A phrase is tied not to a city but to **an area the person picks on a map** — not to where they are. So there is nothing to coarsen: the point does not reveal a location anyway.

```sql
CREATE TABLE feed_messages (
  id               uuid PRIMARY KEY,
  author_identity  uuid NOT NULL REFERENCES identities(id),   -- never exposed
  text             text NOT NULL,                             -- ≤128
  mode             text NOT NULL,                             -- alone | company | party
  lat              double precision NOT NULL,                 -- area centre
  lon              double precision NOT NULL,
  area_radius      integer NOT NULL,                          -- metres, 100 .. 10000
  like_count       integer NOT NULL DEFAULT 0,
  discount_value   text,                                      -- NULL = an ordinary phrase
  conditions       text,                                      -- limits on the discount
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL                       -- now() + N hours
);
```

**A private offer is a phrase with a discount, not a separate entity.** The neighbour giving away two stools writes the same phrase into the same feed; a non-empty `discount_value` is what makes it an offer. Everything else — geography, lifetime, likes, matching, chat — works without a single new line, because it is a post. What a private author may put in an offer (text, discount, conditions — and nothing else: no link, no promo code) is decided in `offers/SPEC_EN.md` §2.

**A business offer does not live in this table.** There is no identity behind it, and `author_identity` is `NOT NULL`. It stays a separate object (`offers/SPEC_EN.md` §3) and joins the feed when the delivery is assembled, by its venue's coordinates. It carries no like by construction: a like leads to a match, a match to a conversation, and there is nobody to converse with.

The quota counts **both** kinds of commercial card together — phrases with a discount and business offers alike: no more than one per ten ordinary phrases in a given person's feed. Otherwise "selling a stool" walks around the very limit the quota exists for.

What goes out is `{id, text, mode, lat, lon, area_radius, like_count, created_at}` — **a circle, not a point**, and nothing about the author. The client draws an area, not a pin.

The area can be placed **anywhere** — there is no check against a real location and no geolocation permission is required. That is deliberate: it lets you set something up in a city you are only travelling to.

**A phrase is moderated before publication.** The priority here is higher than in chat: the feed is public, anyone in range sees it, and unchecked text there is a shop window. The check is **synchronous**, on submit:

```
POST /feed  → moderation → passed   → INSERT feed_messages, the phrase is live
                         → rejected → refusal + reason, nothing reaches the database
```

Synchronous rather than after the fact: an asynchronous check means a window in which the phrase is already visible to everyone, and "taking it down quickly" does not undo the people who read it. A couple of seconds on submitting a phrase is tolerable — this is not a conversation where pace matters.

**A rejection has consequences.** Otherwise moderation can be hammered endlessly and for free:

```sql
ALTER TABLE identity_stats ADD COLUMN rejected_count integer NOT NULL DEFAULT 0;
```

The counter grows on every `rejected`. After N rejections — a **temporary sending block** on that identity, alongside the per-address rate limit. Only sending is blocked — the feed, likes and reading chats stay available, so the penalty fits the offence.

The block used to hang on the browser fingerprint so that a new identity would not lift it. There is no fingerprint any more (§8.2), and there is no point pretending: an identity takes ten seconds to make, and an address changes by switching to mobile data. This is **a speed bump, not a wall**. The feed's real defence is the synchronous check itself: refused text is never published, however many identities are created.

The counter is fed **by the feed alone**: a chat is not moderated (§8.8), so there is nothing there to refuse. This is the only place where the server remembers something bad about a person, and what it remembers is a number, not a text: the rejected message itself is never written anywhere.

**What does the moderating.** Calling an external model on every phrase costs both money and latency. So it goes as a ladder, cheapest first:

1. **Rules** — length, links, contact details, stop-word lists. Instant, free, and it catches the bulk of crude abuse and spam.
2. **A local model on the node** — a small toxicity classifier running on the node itself. No per-call charge at all, tens of milliseconds of latency, and better privacy: the text never leaves our infrastructure. The price is the node's memory and CPU, and lower quality than a large model — especially on sarcasm, context and mixed languages.
3. **An external model** — only for what the first two steps found borderline. That is a small share of the flow, hence a small bill.

"Free" for the local model means no per-call charge; it does consume node resources, and for the pool in §8.1 that has to be budgeted into machine size. No specific model is fixed here: the choice depends on the languages and on how much RAM we are willing to give up — that is a measurement, not a decision on paper.

Visibility is **circle intersection** plus the age band (8.2): if I can see you, you can see me.

```sql
SELECT f.id, f.text, f.mode, f.lat, f.lon, f.area_radius, f.like_count, f.created_at
FROM feed_messages f
JOIN identities author ON author.id = f.author_identity
WHERE f.expires_at > now()
  AND f.lat BETWEEN :lat - :deg AND :lat + :deg                     -- cheap index prefilter
  AND f.lon BETWEEN :lon - :deg / cos(radians(:lat))
                AND :lon + :deg / cos(radians(:lat))
  AND haversine(f.lat, f.lon, :lat, :lon) <= :viewer_radius + f.area_radius
  AND author.age BETWEEN :band_low AND :band_high                   -- the viewer's band
  AND :viewer_age BETWEEN band_low(author.age) AND band_high(author.age)
  AND author.age BETWEEN :filter_age_min AND :filter_age_max        -- the viewer's filter
  AND f.author_identity <> :me                                      -- no liking your own
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE ...)                 -- 8.9
ORDER BY f.created_at DESC
```

`:deg = (viewer_radius + 10000) / 111320` — the maximum phrase radius is known up front (10 km), so the box needs no data. Index: a plain `btree (lat, lon)`.

The area is modelled as an object, not a pair of numbers: a circle today, an arbitrary polygon tomorrow — storage and the intersection test change, the API and UI do not.

### 8.4. Likes and counters

Counting must happen **at event time**: `likes` are cleaned along with the phrase, so a day later there is nothing left to count.

```sql
CREATE TABLE likes (
  liker_identity   uuid NOT NULL REFERENCES identities(id),
  feed_message_id  uuid NOT NULL REFERENCES feed_messages(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liker_identity, feed_message_id)
);

CREATE TABLE identity_stats (
  identity        uuid PRIMARY KEY REFERENCES identities(id),
  likes_received  integer NOT NULL DEFAULT 0,
  likes_given     integer NOT NULL DEFAULT 0,
  matches         integer NOT NULL DEFAULT 0,
  chats_opened    integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

In the same transaction as the like: `INSERT ... ON CONFLICT DO NOTHING` (a double tap must not inflate anything), and on an actual insert — `feed_messages.like_count + 1` plus the `identity_stats` increments.

- **`like_count` is visible to everyone** — it is an aggregate, it gives nobody away, and it makes the feed feel alive.
- **`identity_stats` outlives the feed**: phrases expire, likes are deleted, the numbers remain. It is the only "history" the server keeps about a person, and it is nameless — how many, never with whom or for what. A new identity starts from zero — whatever was accumulated dies with the old one, and that is accepted deliberately.
- The client sends only `feed_message_id` and gets back `{state: 'liked'}` or `{state: 'matched', match_id}` — never who was liked.
- **Self-likes are forbidden**: a handler-level check, `feed_messages.author_identity <> :liker`. Otherwise both `like_count` and `likes_received` can be inflated at will.

### 8.5. Match: mutuality in a live window, and double consent

**A match is a meeting of current moods, not an archive of sympathies:** it counts only if **both phrases are still alive in the feed**.

```sql
SELECT their_msg.id, my_msg.id
FROM feed_messages their_msg                       -- the phrase I just liked
JOIN likes his_like ON his_like.liker_identity = their_msg.author_identity
JOIN feed_messages my_msg ON my_msg.id = his_like.feed_message_id
WHERE their_msg.id = :liked_now
  AND my_msg.author_identity = :me
  AND their_msg.expires_at > now()
  AND my_msg.expires_at > now()                    -- this is the "while alive" part
ORDER BY his_like.created_at DESC
LIMIT 1
```

A match is **not a chat**: it is an invitation to talk that both must accept.

```sql
CREATE TABLE matches (
  id          uuid PRIMARY KEY,
  pair_key    text NOT NULL UNIQUE,     -- sha256(min(a,b) || ':' || max(a,b))
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,     -- least() of both phrases
  chat_id     uuid                      -- filled once both accepted
);

CREATE TABLE match_participants (
  match_id          uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  identity          uuid NOT NULL REFERENCES identities(id),
  message_id        uuid NOT NULL,
  text_snapshot     text NOT NULL,      -- snapshot taken at match time
  mode              text NOT NULL,      -- alone | company | party
  accepted_at       timestamptz,        -- NULL = has not pressed "open chat" yet
  idle_ttl_minutes  integer,            -- chosen chat lifetime
  PRIMARY KEY (match_id, identity)
);
```

Participants are rows, not `_low`/`_high` columns: no handler has to work out "am I the first or the second", and "my row / their row" is the same query up to `WHERE identity = / <> :viewer`. The pair is normalised exactly once — into `pair_key`, whose unique index prevents a duplicate match.

Flow:

```
mutual like     → INSERT matches + two match_participants rows
                  both see: "match — open chat?" + peer's phrase and mode
one presses     → the "not checked" disclaimer + the idle_ttl choice
                  → generates an EPHEMERAL pair for this chat (§8.13)
                  → UPDATE match_participants SET accepted_at = now(),
                      idle_ttl_minutes = :n, ephemeral_public_key = :epk
both press      → INSERT chats + chat_participants + chat_starters, matches.chat_id = <new>
                  both get chat_id and the system line "you both liked this — chat is open"
expired         → the match quietly disappears; there was no chat
```

**The disclaimer at consent.** Right here, beside the choice of span, a person reads what they are stepping into:

```
This chat is not checked. Nobody reads what you write here —
not us, not a filter.

It is encrypted on your devices: our server carries it and
cannot read it.

If someone behaves badly, block them and report them, attaching
a copy from your own device.
```

This is **not** another consent or a checkbox: the text sits on the same screen as the span choice, and "open chat" stays the single press. It is said here because this is the last moment at which nothing has been opened yet.

- **Match TTL** = `least()` of both phrases' `expires_at`, with no safety floor. Either phrase dies and the match dies with it, even if one side already accepted; a new mutual like does **not** extend it. The consequence is accepted deliberately: a match born on a dying phrase may leave a pair only minutes for two presses, and then burn out. The rule matters more than the match count — the reason died, so the invitation dies too.
- **The text snapshot is taken at match time**, not at opening: otherwise a phrase can expire between "match" and "both pressed", and someone would consent without seeing why.
- The card shows a `match expires · Nh Nm` timer; once one accepts, the other sees "waiting for you".

**A match born from an offer is one-sided.** A like on a phrase with a discount creates the match immediately, without waiting for one back.

The ordinary rule breaks against its own meaning here: to collect the stools you would have to wait for the neighbour giving them away to like some phrase of yours. A mutual like checks that two people's moods coincided; an offer has a different occasion — it is stated in the announcement itself, and there is nothing to coincide with.

```
ordinary phrase        I liked theirs → they liked mine → match
phrase with a discount I liked theirs → match
```

From there the machinery is unchanged: two `match_participants` rows, the disclaimer, the `idle_ttl` choice, double consent. The author of the offer may decline, and then there is no chat, exactly as in any other match.

One schema change follows: whoever came to the offer has no phrase of their own.

```sql
ALTER TABLE match_participants
  ALTER COLUMN message_id    DROP NOT NULL,   -- NULL for whoever came to an offer
  ALTER COLUMN text_snapshot DROP NOT NULL;
```

The occasion in such a match is **one for both** — the offer itself, shown to both on the card. The author sees not the other side's phrase, which does not exist, but their own announcement and "is interested in your offer", plus a name and an age — exactly the same disclosure as in an ordinary match.

The `TTL` is taken from the single live phrase, the offer: the offer dies and the match goes with it.

This cannot be used to spam beyond the usual: `pair_key` is unique, so a second like from the same pair creates no new match, and a private author has at most `PRIVATE_ACTIVE_OFFERS` live offers at a time (`offers/SPEC_EN.md` §4).

**Business** offers carry no like at all, so this path does not reach them either.

**Edge cases** — all three are real, and staying quiet about them is not an option:

- **A block while a match is pending** — the match dies immediately, as if expired. Blocking someone and keeping their invitation is a contradiction.
- **An identity closed between the two consents** — the chat is not created: before `INSERT chats` both `identities` rows are checked for `closed_at IS NULL`. Otherwise a conversation opens with a dead peer who will never answer.
- **A race on the second press** — both confirmations can arrive at once, so creating the chat must be atomic: `INSERT ... ON CONFLICT (pair_key) DO NOTHING` followed by a read. The unique `pair_key` works here not only as "one chat per pair" but as the latch against double creation.

**What is revealed at this step.** Before the match — nothing. On the match card: the peer's phrase, its `mode` (a property of the phrase, not the person: alone today, a party tomorrow), name and age. Name and age can never appear in the feed — otherwise every phrase of one person glues together under "Zhenya, 38". Disclosure is stepwise and irreversible, which is why "open chat" is a deliberate press rather than automatic.

### 8.6. Chat

```sql
CREATE TABLE chats (
  id                uuid PRIMARY KEY,
  pair_key          text NOT NULL UNIQUE,
  idle_ttl_minutes  integer NOT NULL,      -- min() of both choices
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
  -- expires_at is not a column but a derivation: last_activity_at + idle_ttl_minutes
);

CREATE TABLE chat_participants (
  chat_id   uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  identity  uuid NOT NULL REFERENCES identities(id),
  PRIMARY KEY (chat_id, identity)
);

CREATE TABLE chat_starters (
  chat_id        uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  position       integer NOT NULL,
  text_snapshot  text NOT NULL,       -- a copy: the feed expires, the chat header must not
  mode           text NOT NULL,
  liked_by       uuid NOT NULL,       -- internal identity, never exposed
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, position)
);
```

- Access check is "is there a row": `SELECT 1 FROM chat_participants WHERE chat_id = :id AND identity = :me`.
- `chat_starters` stores a **copy** of the text rather than a reference to `feed_messages`: the phrase lives N hours, the chat lives by its own clock, and the header must not empty out mid-conversation. `feed_message_id` is deliberately not stored — the link "this phrase → this chat" is better off not existing in the database at all.
- Opening a chat returns: `idle_ttl_minutes`, `last_activity_at`, `max_message_length`, the `chat_starters` list by `position` labelled `you liked` / `they liked` (resolved per viewer), and the peer's name and age. **That is all** — the history comes from the client's own local storage under the same `chat_id`.

**Message length is a server parameter, not a client constant.** `max_message_length` arrives when the chat opens, defaults to **256 characters**, and changes without shipping a client. The client draws the counter and will not let you send more — but that is a convenience, not a limit: **the node decides**, and a message longer than the limit is refused with `error`, delivered to nobody.

The separation is not pedantry. Our client is **open**: the `depth` image can be rebuilt by anyone, and the web script is edited in the debugger in a minute. Any check that lives only on the client is a hint to its author, not a rule of the system. Treating it as a defence would be self-deception, so the limit is enforced where it cannot be rewritten.

The limit is not cosmetic — it holds up the arithmetic in §8.1 and §8.13. 256 characters of UTF-8 come to ~1 KB, the ciphertext with nonce, tag and base64 to about 1.4 KB, and all of it must fit inside the 8 KB `NOTIFY` payload with room to spare. Raising the value is allowed, but not blindly: there is a transport behind it.

**One chat per pair.** The unique `pair_key` means that while a chat lives there will be no second one:

- **a chat already exists** → no match is created; a special message lands in the chat and the phrase is appended to `chat_starters` (8.7);
- **an unclosed match is pending** → no second match; the phrase is appended to the card.

**A sliding TTL, measured from the last activity.** On every **delivered** message and every **move in a game**: `UPDATE chats SET last_activity_at = now()`. This is the only thing the server learns about a conversation: **when** something moved, with no text, author or count.

Moves count deliberately: a game (§6) is an ice-breaker where staying silent in words is the point, and it would be absurd for the chat to die under the hands of two people happily pushing checkers around. Activity is any shared action, not text alone.

Each side picks `idle_ttl_minutes` on consent; the **smaller of the two** wins — one person's caution cannot be overridden by the other's generosity. The value is visible to both (`chat fades after 1h of silence`), **who set it is not**. It cannot be changed inside an open chat: it is a rule that was agreed to, not a setting.

**The silence counter** — two different thresholds:

```
threshold = min(20 min, idle_ttl_minutes / 3)

silence < threshold   → no timer
silence ≥ threshold   → counter: chat deletes in Nm
last_activity + ttl   → the chat disappears for both
```

20 minutes is a **display** threshold, not a deadline — and it is not taken literally, but against the chosen TTL: at `ttl = 30 min` a fixed twenty would light the counter almost immediately and keep it up for two thirds of the chat's life. A third of the span feels the same on an hour-long chat and on a half-hour one.

Any delivered message resets both the counter and the countdown. The server pushes nothing: the client knows `last_activity_at` and `idle_ttl_minutes` and computes the rest.

A chat can outlive its originating phrases by a long way if people keep talking — that is fine: the texts are already copied, and the feed has nothing to do with the conversation any more.

### 8.7. An extra like into an open chat

Liking a phrase by someone you already have a chat with creates nothing new — it arrives **in that chat**:

```
INSERT chat_starters (chat_id, position = next, text_snapshot, mode, liked_by)  -- outlives everything
relay: a special message to both, worded per viewer                             -- in transit only
```

```json
{
  "kind": "extra_like",
  "position": 3,
  "text": "anyone heading to the embankment tonight",
  "mode": "company",
  "direction": "they_liked_yours"
}
```

Rendered as a centred card (like `sys`) holding the quote and a number matching the one in the `Liked, in order` header. Styling is the starters' styling: it is the same thing, arriving later. Wordings: "they liked one more of yours" / "you liked one more of theirs". The bubble goes away with the local history; the `chat_starters` row does not.

### 8.8. Messages: not in the database

**There is no `messages` table.** A message passes **through** the node encrypted: membership check → realtime delivery → **history is stored only in the participants' browsers**. The node does not look into the text — not because it promised, but because it cannot: it holds no keys (§8.13).

```
client: local record {local_id, text, status: pending}
        encrypts with the chat key (§8.13)
   → server: membership in chat_id  [the only database read]
   → realtime to the peer + UPDATE chats.last_activity_at
        ↓ accepted     → ack {local_id, delivered}
        ↓ none/timeout → ack {local_id, error}
client: updates its record by local_id; decrypts what arrives
```

Statuses are state **on the sender's client**, not a database row:

```
pending    — sent, no acknowledgement yet
delivered  — the peer accepted it
error      — not delivered (offline, drop, timeout) → a "send again" button
```

`local_id` is generated by the sender; the server echoes it back and stores it nowhere.

**Resending** is always available on `error`, regardless of whether the peer is online. The pause grows geometrically (×3): immediately, 5 s, 15 s, 45 s, 135 s, capped around 10 min. The counter belongs to a specific `local_id` rather than the chat, and lives on the sender. A retry reuses the same `local_id` so the recipient can drop the duplicate.

**A chat is not moderated.** That is the whole project's position, not this document's decision: the privacy policy of both faces says chats are not checked, the same is written in the Article 30 register and in the chat-screen notes. The reasoning is simple. The feed is public — anyone within the radius sees it, and unchecked text there is a shop window. A chat is two people talking, opened by mutual consent, and that is not publication; a platform is under no duty to watch private correspondence.

**What protects a chat instead of moderation** — four things, working together:

- **the door** — a chat opens only on a mutual like and double consent: you cannot write to a stranger;
- **blocking** (§8.9) — killing phrases, the match and the shared chat;
- **reporting** (§8.10) — carrying a copy from the reporter's own device, because the server has none and can have none;
- **ephemerality** — a conversation does not accumulate, and disappears for both.

The refusal counter and the moderation ladder moved to §8.3: they belong to the feed, and the chat no longer has anything to feed them with.

**The game board** (`game_sessions` from §6) is synced as transient chat state, encrypted with the same key, and disappears with the chat; nothing is written to the database.

### 8.9. Blocks

Recorded by identity, on both sides:

```sql
CREATE TABLE blocks (
  blocker_identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  blocked_identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_identity, blocked_identity)
);
CREATE INDEX ON blocks (blocked_identity);
```

The check is symmetric — one row either way is enough:

```sql
SELECT 1 FROM blocks
WHERE (blocker_identity = :me    AND blocked_identity = :other)
   OR (blocker_identity = :other AND blocked_identity = :me)
LIMIT 1
```

The effect applies at all three levels at once: phrases are hidden from both sides; a like produces no match; a shared chat is closed.

**The limit, plainly.** A block holds until the person makes a new identity — which takes ten seconds (§8.2). They will be back in the feed, and that is true. But getting back to **you** takes more than returning: it takes a fresh mutual like on live phrases and your consent to open a chat. Blocking does not guard the door to a conversation — the entry model does.

**Hiding a phrase is not blocking a person.** The community guidelines promise it outright: blocking a message hides it for you only, not for everyone. That is a third action, with consequences of its own:

```sql
CREATE TABLE hidden_messages (
  identity         uuid NOT NULL REFERENCES identities(id),
  feed_message_id  uuid NOT NULL REFERENCES feed_messages(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identity, feed_message_id)
);
```

The feed query (§8.3) gains `AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.identity = :me AND h.feed_message_id = f.id)`.

| Action | What it covers | Who learns of it | How long it lasts |
|---|---|---|---|
| Hide a phrase | one phrase, for me only | nobody | until the phrase dies (`CASCADE`) |
| Block a person | all their phrases, the match and the shared chat, both ways | nobody | until lifted |
| Report | nothing immediately — it is a signal to us | a moderator | per the procedure (§8.10) |

Hiding is **silent and one-way**: the author is not told, their feed does not change, the like count is untouched. It is a viewer's filter, not a sanction, and it must not be confused with reporting — otherwise someone who simply does not want to see a thing ends up in the moderation queue.

### 8.10. Ephemerality and cleanup

- **Feed** — `expires_at` (N hours): the phrase drops out of results, a background job deletes the row, `likes` cascade away. Starters survive — the text was copied.
- **Match** — `least()` of both phrases; expired means gone.
- **Chat** — `last_activity_at + idle_ttl_minutes`; the node closes the room and deletes `chats`, with `chat_participants` and `chat_starters` cascading.
- **Local history** — cleaned by the client, always on the client's initiative:

```
POST /chats/alive  { ids: [uuid, ...] }  →  { alive: [uuid, ...] }
```

Anything missing from `alive` is deleted from IndexedDB along with its messages. This covers, in one move: an expired TTL, a peer's closed identity, a block, and "hasn't opened the app in a month" — the very next session sweeps the dead away.

**Local history is encrypted with the identity's secret.** Since everything lives in the browser and entry has no barrier, anyone opening the app on a shared device would otherwise read someone else's conversations. The key is derived from the same secret that signs requests (`identity_id` + secret, 8.2), so erasing an identity makes the old records unreadable even before the `alive` sweep removes them.

**A pair can match again.** `pair_key` is freed when the `chats` row is deleted, so after a chat dies a new match is possible — but only under the usual rules: both phrases must be alive, and both people must consent again. That is intended, not a side effect.

**A report carries its own copy.** There is no text on the server, so reporting "a message" is technically only possible by attaching a local copy from the reporter's device. Which means a report is one side's word, and should be treated accordingly: as a signal, not as evidence.

**What it looks like.** Reporting a conversation is its own path in the form,
because the copy has to come from the reporter:

```
"report" inside the chat
  → the client takes the last N messages around the disputed one from local history
  → shows them to the reporter BEFORE sending: "this is what goes, trim what you want"
  → sends {kind: chat, chat_id, the attached copy, reason, good faith}
```

The reporter sees and edits what they send: otherwise a report about one line
drags half a private conversation along, including their own words.

**In the panel it is marked as one side's word.** The copy came from the
reporter and we have nothing to check it against — no original, no second
version. The moderator sees that mark beside the text rather than inferring it.
A decision leans on it as a **signal**, not as evidence: measures against an
identity only follow from independent grounds (§5.2 in `dsa/SPEC_EN.md`).

### 8.11. What is visible from outside

| Level | Available |
|---|---|
| Feed | `feed_message.id`, text, `mode`, circle (centre + radius), `like_count`, time |
| Match | `match_id`, peer's phrase + `mode`, name, age, timer |
| Chat | `chat_id`, `chat_starters`, name, age, `idle_ttl_minutes`, `last_activity_at` |
| Never | anyone else's `identity_id`, private keys, **authorship of feed phrases**, who liked, chat counts, conversation text |

**The line runs at the chat, not at the phrase.** In the feed the author is never shown — that is the core rule. But once a chat is open, authorship inside it is known by construction: the peer sees a name and age and knows whose phrases sit in `chat_starters`. Every `extra_like` (8.7) adds one more phrase by the same person to that list.

So over a long conversation a peer will accumulate a set of one author's phrases with a name and age — and that is not a leak but the very point of an open chat: these people chose to meet. What matters is the other half — **that set never leaves the chat**: it is not published, not handed to third parties, and it dies with the chat.

What a traffic observer sees: uuids, feed phrase texts (public anyway), and the **ciphertext** of a conversation. What they do not see: what was said, who wrote what, who liked what, or whether two phrases belong to one person.

### 8.12. Notifications: the inbox only

There is one layer. The **inbox** answers "what happened while I was away", works always and costs almost nothing. The second layer — the one that pulls at a person from outside — does not exist in this system, and that is a decision rather than an omission (see "There is no push" below).

#### Inbox

There is **no** `notifications` table — the server state already holds every event, and the inbox is assembled by a query on app start:

```sql
-- matches waiting for my decision
SELECT m.id FROM matches m
JOIN match_participants me ON me.match_id = m.id AND me.identity = :me
WHERE m.expires_at > now() AND me.accepted_at IS NULL;

-- "waiting for you": I accepted, they have not  (and the reverse)
-- chat opened: a chats row that is missing from my local database
-- one more phrase liked: chat_starters with a position beyond what I have seen
-- chat fading: last_activity_at + idle_ttl_minutes is close
```

This is the rare case of a feature that adds not a single line to the schema: everything derives from `matches`, `chats`, `chat_starters` and `last_activity_at`. The inbox honestly survives a closed tab, a reload and a node switch — because it lives in the data, not in memory.

**A missed message is recovered indirectly.** There is no text on the server, but there is a trace of activity:

```
server.last_activity_at > the time of my last local message
   → "something happened here and you do not have it"
```

The client shows a line — "you missed a message, ask them to send it again" — and a button that nudges the peer with an "I'm here" signal. The text itself is never recovered, which follows directly from 8.8.

**While the tab is open the inbox works in real time** — events arrive over the same WebSocket (8.1), with no extra request. The initial `GET /inbox` is only for a cold start.

In the UI this is the counters on the `Chats N` / `Matches N` tabs (§3) and highlighted threads, not a separate notifications screen: there are few events and they all live in those two lists anyway.

**A burnt-out match will not appear in the inbox.** The `matches` row is deleted on expiry, so there is nothing to show — and that is for the better: instead of a graveyard ("you had three matches, all dead") a person sees only what is alive. The price is honest and worth knowing: **what was missed disappears silently and for good**.

#### There is no push — in any face

No Web Push in the browser, no system notifications in the terminal, no `BEL`. The decision is taken for the whole platform, which is why it is recorded here rather than in one face's document.

**The reason is metadata, not difficulty.** A push is impossible without an intermediary: in a browser that is a service worker plus somebody else's delivery service (Google, Mozilla, Apple), in a terminal a system bus. Even with a fully opaque payload, that intermediary receives what we hand to nobody: a durable subscription identifier tied to an identity, and the **rhythm** — when exactly somebody spoke to this person, how often, at what hours. The whole of §8 is built on the fact that not even our own server keeps the correspondence; handing its metadata to a third party for convenience is a contradiction with nothing to justify it.

A good deal disappears along with it: VAPID keys and their rotation, the subscription table and the sweeping of dead rows, a separate sub-processor in the Article 30 register, a dependency on Apple's and Google's policies, and a different set of capabilities on every platform.

**What it costs, stated plainly, because the cost is real.** Everything in this model lives in minutes and needs an answering action: a match fades and waits for **two** taps, a chat dies of silence, a message to an offline peer is not stored (8.8). There is **nothing** with which to call a person who is not in the application right now. They learn about all of it only when they open the client themselves, and a match that burned out they will never see — the inbox shows only what survived until the opening.

The direct consequence: **this system works for someone who comes back on their own, regularly**, and does not work for someone waiting to be called. That is how it should be described — to people, too, and not only in the spec.

What is left in place of a push:

| Layer | When it works |
|---|---|
| The live connection (8.1) | the client is open — events arrive instantly |
| The inbox | the client was opened again — everything that survived is visible |
| — | the client is closed — nothing arrives |

**A missed message** is recovered indirectly through `last_activity_at`, and the mechanism is described above in this same section. The sender gets an `error` and a retry button; the loop is closed not by a notification but by the other person opening their client one day.

### 8.13. End-to-end encryption

A chat is encrypted on the devices: the node carries ciphertext and holds no keys. This became possible exactly when the chat stopped being moderated — you cannot read text and be blind to it at the same time.

**A key per conversation, not per person.** It is born when two people consent and dies with the chat. The identity's long-lived key (§8.2) takes no part in the encryption at all: it only vouches that a public half belongs to that identity. Losing the long-lived key exposes no conversation — it lets someone impersonate a person, not read them.

```
consent      each side generates an EPHEMERAL pair for this chat
             and publishes its half, signed with the long-lived key
opening      K = HKDF( ECDH(my ephemeral, their ephemeral), salt = chat_id )
message      AES-GCM(K, nonce, text) → node → the peer decrypts
chat death   K and the ephemeral keys are wiped, the wraps are deleted
             ─► old ciphertext can no longer be opened, by anyone
```

**How the key survives an identity transfer.** Whoever consented wraps `K` under their live session's `wrap_public_key` (§8.2) and puts the wrap on the server. The server cannot unwrap it — it stores opaque bytes. There is one live session, so there is one wrap; on transfer the new session gets the wraps of new chats, while the old ones stay with the frozen session and come back with it.

```sql
CREATE TABLE chat_key_wraps (
  chat_id     uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wrapped_key bytea NOT NULL,        -- K under this session's key
  PRIMARY KEY (chat_id, session_id)
);
```

`ON DELETE CASCADE` carries meaning here rather than hygiene: the chat dies and its wraps go; a session is deleted and its wraps go with it.

**Freezing becomes real.** With a single long-lived key a frozen device would lose only access while keeping the ability to decrypt for ever. With wraps it loses the ability itself: nobody will wrap a future chat's key for it. This is not cosmetic — transfer without this would be a feature that looks like protection without being one.

**A device that joins later starts on an empty screen.** The keys of chats opened before it appeared had nobody to be wrapped for, and we will not backfill them. The rule is simple and honest, and ephemerality makes it nearly invisible: conversations live hours.

**Forward secrecy holds.** The ephemeral keys and `K` are wiped when the chat dies, and the wraps go with it. Even someone who later obtains the identity's long-lived key cannot open an old conversation.

**A key that cannot be extracted.** The pairs are created with `extractable: false` and live in IndexedDB as `CryptoKey` objects. They can encrypt; their material cannot be exported, not even by our own code: a foreign script running on the page reads what is open right now but carries no key away.

**There is one exception, and it is permanent — which is how it should be stated.** The identity's long-lived key has to reach a new device during a transfer (§8.2), and WebCrypto cannot wrap a non-extractable key: `wrapKey` requires `extractable: true`. So the long-lived key is extractable **always**, not "for exactly as long as the transfer takes" as this said before — and a foreign script will carry it off at any moment, not only during a transfer. What that buys an attacker is bounded by §8.13 above: they can impersonate the person, but not read the conversations, because the long-lived key takes no part in the encryption. `depth` does not have this hole: there the keys are a file anyway, and what protects them is the vault key — the PIN with the node's share — rather than a property of the browser's store.

**Size.** The ciphertext of a 256-character phrase is up to ~1 KB with nonce, tag and base64. The 8 KB `NOTIFY` limit (§8.1) still holds with room to spare.

**What it does not give — and this must be said plainly.**

- **We serve the very script that encrypts.** That is the ceiling of any web application: a person trusts not the mathematics but our not swapping the code tomorrow. It is why Signal is an app rather than a page. The honest wording: **the server cannot read a conversation after the fact** — not through a breach, not through a seized database, not on request. That is a great deal, but it is not "we are physically incapable", and it must not be sold that way.
- **Metadata remains.** The node knows `chat_id`, both participants, when something moved and how long the messages were. What is encrypted is the content, not the fact of the conversation.
- **Encryption does not protect you from the person you are talking to.** They have the plaintext on their screen: they can keep it and attach it to a report. That is by design (§8.10) — otherwise there would be nothing to report with.

**Us substituting a key.** The public halves are handed out by our server, so in theory we could slip in our own and read a conversation live. Cryptography does not stop that; comparison does: a **safety code** derived from both identities' long-lived keys and shown in the chat header, which two people can check in person or over a call. Using it is optional, but without it one has to trust us regardless.

**Edge cases.** The peer closed their identity — the chat is killed like an expired one. Reconnecting to a different node does not touch the keys: they live on the clients, and the node holds only public halves and wraps, from which nothing can be derived.

### 8.14. Open

- The value of N for the feed TTL, and the set of `idle_ttl_minutes` options offered.
- The feed's auto-block threshold: how many `rejected` in a row, and for how long sending is blocked.
- Anti-flood on the rate of likes and phrases (messages already have a pause, but a client-side one).
- Picking the local moderation model and its weight: languages, RAM, quality on mixed languages (§8.3).
- How often to re-ask for age, and what to do when someone ignores the question.
- Offline delivery: a message to an offline peer is lost, and there is nothing left to call them with (8.12). What remains is a manual retry once they come back on their own; whether to auto-retry on their return is undecided, and that question now weighs more than it did when there was a push.
- The match window (§8.5) was chosen when there was something to call a person
  with. There is no push any more and nothing compensates for it — whether to
  lengthen the window is undecided.
- What to show when the band and filter come up empty — the teenage sandbox will be sparse at launch.

## 9. UI states and breakpoints

- **`≥900px`** — three-column workspace: **[Feed] | [Open chats] | [Active chat]** (feed `flex:1`, chats `300px`, active chat `400px`). Columns collapse into vertical rails. Before a chat is picked, the active column shows an empty `Pick a chat` state.
- **`≤899px`** — single column, bottom navigation (`Feed` / `Chats` / `Say` / `Me`); the conversation is a full-screen overlay (`position:fixed`), "back" → list.
- **`≤560px`** — compact header.

## 10. Accessibility / quality

- `:focus-visible` — accent outline; `prefers-reduced-motion` — disables fading/pulsing.
- `overflow = 0` horizontally in every state (list / conversation / game), baseline screen iPhone 12 mini (375px).

## 11. Logo: house and text (shared behavior — landing and app)

The logo has two clickable parts with **different** actions. The rule is identical on the landings (sosed.place / neighbro.place) and in the app.

- **House mark** — changes the theme (as now). On the landing this is the accent-color cycle (button `#logoBtn`); light/dark is a separate ☀/🌙 button. The house behavior does not change.
- **Name text** (`SOSED` / `NEIGHBRO`) — navigates **"home"**, where "home" depends on auth:
  - **has an identity** (`identity_id` + secret in the browser, see §8.2) → the app's **chat window**;
  - **no identity** → the **landing**.
- **"Has an identity" is defined** as an `identity_id` with a live secret in the browser. Until that exists there is no identity → the name text always goes to the landing.
- Accessibility: the name text is a semantic link/button with an `aria-label`; house and text are distinguishable by focus.

## 12. Open questions

What is settled moved into §8; what remains here is UI and product.

- Behavior at the expiry moment (hide instantly / show "expired").
- Right-side tabs: only "Chats" or sub-sections (matches / active / fading).
- Notifications are designed in §8.12 (including why there is no push and what that costs). There will be no settings, no quiet hours and no coalescing: there is nothing to silence and nothing leaves the device. What remains is the inbox UI — tab counters and thread highlighting.
- The open list for data and moderation lives in §8.14.

## 13. Build order

The spec describes **what** gets built; this is the order, because here the
order is not a matter of taste. Without an identity there is no feed, without a
feed no like, without a like no match, and without a match nobody to open a chat
with. Starting "with the chat" is physically impossible.

There are two orders here and they are perpendicular. The first is by data: it
is the numbered list below and it does not depend on the face. The second is by
face, and it is decided separately: **the terminal goes first**.

**The core first, the faces after.** Protocol, cryptography and state live in a
shared module — **with no DOM and no Ink**. Two thin rendering layers sit on
top: one draws into a terminal, the other into a browser.

```
        ┌──────────────────────────────────────────────┐
        │  core: protocol, crypto, state               │
        │  not one reference to the DOM or to Ink      │
        └──────────────────────────────────────────────┘
                   ▲                        ▲
        ┌──────────┴─────────┐   ┌──────────┴─────────┐
        │  depth: Ink layer  │   │  web: DOM layer    │
        └────────────────────┘   └────────────────────┘
```

Without that split the client doubles whole rather than only in its screens:
Argon2id twice, key wrapping twice, two implementations of the code transfer —
and two chances to diverge in behaviour where divergence means incompatibility
rather than cosmetics.

**The terminal first — a choice, not a convenience.** The reason is that it
makes the protocol checkable. While there is one face and it is ours, "client"
and "server" quietly grow together: whatever suits a particular page seeps into
the API. A terminal client draws the same thing with no DOM, no cookies and no
browser storage — and everything that was implicitly propping up the web client
surfaces at once.

The web follows it over a protocol that is by then already proven. The reverse
order would produce an API the terminal would have to be bent to fit.

1. **Identity and session** (§8.2) — `identities`, `sessions`, `vault_shares`,
   request signing, the code transfer with confirmation. Registration is longer
   here than it looks: name and age, then the paper recovery code with a
   write-down check, then the PIN and the exchange with the node for a share.
   All three are mandatory and none can be deferred — without the paper code the
   first lost device is irreversible, and without the share the local database
   sits unencrypted. Everything else rests on "who is this".
2. **Feed and geography** (§8.3) — `feed_messages`, delivery by circle overlap,
   age bands, synchronous moderation before publication. **With this step, not
   after it:** the Article 17 statement screen for an author with no email
   (`dsa/SPEC_EN.md` §7). We never ask for an address, so an author usually has
   none, and without that screen the first restriction is a silent removal. The
   first screen on
   which the product does anything at all.
3. **Likes** (§8.4) — `likes`, `identity_stats`, the count on a phrase.
4. **Match and double consent** (§8.5) — `matches`, `match_participants`; the
   chat's ephemeral keys are born here.
5. **Chat: transport** (§8.1, §8.6, §8.8) — rooms by `chat_id`, the
   `LISTEN`/`NOTIFY` bus, delivery and acknowledgements. The largest part, and
   it depends on none of the open questions.
6. **Encryption** (§8.13) — the ephemeral exchange, `chat_key_wraps`,
   unwrapping on a second device. A separate step after transport: first let
   messages travel, then let them travel encrypted.
7. **Blocks and hiding** (§8.9), **cleanup and `alive`** (§8.10).
8. **Notifications** (§8.12) and **games** (§6) last: the scheme works without
   them, only worse.
9. **The web face** last, over the protocol the terminal has proven by then.
   Steps 1–8 are done in `depth`.

Steps 1–4 are not worth queueing behind one another: each adds a working
screen, and each is a place one can stop. That screen is a terminal one — the
web catches up in a single step at the end.

## 14. Acceptance criteria

What "the chat is done" means, checkable rather than eyeballed:

- Two clients on **different nodes** hold a conversation, and in at least one
  pair one of them is `depth`. That tests the bus, not a room living in one
  process's memory — and along with it, that the face does not affect the
  protocol.
- A node falling over breaks the socket but **not the conversation**: on
  reconnecting to a neighbour, the person continues the same chat with the same
  history.
- An identity transferred to a second device shows **the same chats and empty
  windows** there; the previous device freezes and, once the identity comes
  back, shows its entire history again. An empty window on the new device is not
  a defect (§8.13).
- Ten wrong PINs burn the share, and the local database then **opens with
  nothing** — tested against a live node, not by reasoning.
- A frozen session stops receiving messages **immediately**, including in the
  chat that was open on it, and receives no keys for new chats. Tested by
  transferring during a live conversation.
- The code transfer works across faces: a code shown in `depth` and typed in the
  web, and the other way round. An expired or already-applied code does
  nothing, a sixth entry attempt burns the invite, and without "that's me" on
  the old device no transfer happens at all.
- The paper code restores the identity on a clean device when no live session is
  left, and the previous session is frozen afterwards. Tested on an identity
  whose browser was wiped.
- A message longer than `max_message_length` is refused by the **node**, not
  merely by the counter in the client. Tested with a request that bypasses the
  client.
- An expired chat disappears **for both**, together with the game board and the
  local history, on the first `alive` sweep.
- A message to an offline peer yields `error` and a retry button rather than
  vanishing quietly.
- After all of the above the database holds **not one message**. Verified by
  querying it, not by trusting the schema.

