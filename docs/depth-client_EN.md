# `depth` — the terminal client

The platform's third face. Not a storefront and not an operator's tool, but the
same product — feed, matches, chat — entirely in a terminal, launched through
Docker.

The chat spec (`chat_EN.md`) describes **what** happens and is the same for every
face. This document describes **how it looks and what constrains it here**, and
introduces no rule that is not already in the spec. Where the two disagree,
`chat_EN.md` wins.

---

## 1. Why this face exists

### 1.1. What a terminal gives that the web cannot

The spec admits the limit of any web application (§8.13): **we hand over the very
script that encrypts**, and a person trusts not the mathematics but the promise
that we will not swap the code tomorrow. That is exactly why Signal is an
application rather than a page.

`depth` closes that hole, and it is its main purpose:

- the image is pinned by **digest**, not by tag — what ran yesterday is not
  quietly replaced today;
- the sources live in this repository;
- the image is **rebuildable by anyone** and comparable against the published
  one.

The promise "the server will not read the conversation" cannot be checked in the
web; here it can. This is the one place in the project where the word "verifiable"
is used literally.

The second reason is less obvious: a terminal **keeps the protocol honest**.
While there is one face and it is ours, client and server quietly grow together —
whatever suits a particular page seeps into the API. A client with no DOM, no
cookies and no browser storage cures that by force. Which is why the terminal
comes **first** in §13 of the spec, and the web follows over a proven protocol.

### 1.2. An open client is a position, not a concession

A public client means a publicly documented protocol. Anyone can write their own
in an hour. That is not an argument against — it is an argument for the server
**treating the client as hostile from the start**.

The practical consequence runs through this whole document: everything described
here as client behaviour is a convenience. The rule lives on the node. A
character counter, a disabled button, a hidden entry — hints to their author, not
defences. Believing otherwise is self-deception.

### 1.3. What `depth` is not

- **Not an admin CLI.** Node management lives in `relay/wizard` and stays there:
  this is a face for a neighbour, not for an operator.
- **Not an API wrapper.** There is no `--json`, no scripting mode, no export. A
  feed and a conversation are not data for a pipeline.
- **Not a second way into the same place.** By default it is a **separate
  identity** (§8.2), not "the same account in a console".

---

## 2. Install and run

### 2.1. The image

```
ghcr.io/panov-id/depth
```

The same place as `relay-node`. The tag is a version, but the right way to run it
is **by digest**: tags move, digests do not.

```
docker run --rm -it \
  -v depth-identity:/data \
  ghcr.io/panov-id/depth@sha256:…
```

To check that what runs is what was published:

```
docker buildx imagetools inspect ghcr.io/panov-id/depth:vX.Y.Z
```

### 2.2. The volume

`/data` inside the container, mounted wherever you like outside. All of the
identity's state lives there and nowhere else.

```
/data
├── identity.age      keys, encrypted with the vault key (PIN + node share)
└── accepted.json     the accepted terms revision and its date
```

Mode is `0600`. If it is wider the client **refuses to start**, rather than
printing a warning nobody reads:

```
  /data/identity.age is readable more widely than 0600.
  nobody but you should be able to read your identity keys.
  fix the permissions and run again.
```

### 2.3. The PIN

Asked at **every start** — six digits, the same as in the web (§8.2 of the chat
spec). Half the key is derived from the PIN with Argon2id; the node hands over
the other half, and only after the device has proven it knows the PIN. The
assembled key decrypts `identity.age`.

A stolen or copied volume is useless: half the key is not in it, and getting
that half means going through the node, which counts the attempts. This closes
the terminal's main weakness: in a browser the keys sit as non-extractable
`CryptoKey` objects, whereas here they are a file after all.

Hence a consequence worth knowing up front: **without a network `depth` does not
open at all** — no share, no key.

The price is stated plainly, before the identity is created rather than after:

> Forget the PIN and you lose this device's conversations: ten wrong attempts
> burn the share. The paper code brings the identity back; the conversations do
> not come back.

### 2.4. First run

```
$ depth

  Operator.

  ─────────────────────────────────────────────
   there is no identity on this device.

   depth new      create one
   depth move     move an identity here from the
                  device it is on now
   depth restore  raise an identity with the paper code
  ─────────────────────────────────────────────
```

### 2.5. The key inside the image

The image carries a publishable key for the `depth` brand. It is **baked in and
public** — exactly like the storefront keys that sit in `config.js` and are
visible to anyone through "view source". A person never types it and never hears
about it.

That is safe precisely because the key is **not authentication**. It answers the
question "which face did this request come through", and nothing else; a person
is identified by the signature of their own pair (§8.2 of the chat spec).
Stealing the key is pointless: everybody has it already.

Three requirements follow, all of them on the node's side:

- **`client_type: native`.** A terminal has no `Origin` header by nature rather
  than by oversight, so no allowed-origin list is created or checked for such a
  key. The type is written into the key rather than inferred from an empty list:
  "empty means everyone may" is the kind of implicitness someone eventually slips
  on.
- **No per-key daily quota.** The key is shared by every container in the world,
  so a per-key counter is one bucket for everyone: a single script burns it in a
  minute and locks `depth` for the rest. The limits live per address and per
  identity.
- **Revocation replaced by overlap.** The image is pinned by digest and lives on
  people's machines for months; revoking the key would break everything running
  at once, including what will never update. So several keys are live at a time
  and the old one fades on an announced window (8.2).

The `depth` brand is its own entry in the brand registry: it shows how many people
arrived through the terminal, it has its own terms texts and its own key to
rotate. It does **not affect visibility**: the feed is shared across all faces,
recorded as a separate principle in §8 of the chat spec.

---

## 3. Commands

| Command | What it does |
|---|---|
| `depth` | sign in; with no identity, the prompt above |
| `depth new` | create an identity on this device |
| `depth move` | move the identity here from the device it is on now |
| `depth restore` | raise an identity with the paper recovery code |
| `depth device` | this session, and the code to move it |
| `depth report` | a notice of illegal content (DSA Article 16) |

Everything except `depth` is also reachable from inside the running client: the
commands are a door for whoever arrived from a shell, not a second interface.

### 3.1. `depth new`

Name, age, paper recovery code, PIN, area — and the person is in the feed. The
order is mandatory: age is asked before the feed because it decides what the feed
hands out (§8.2, age bands), and the paper code comes before the PIN because
without it the first lost volume is irreversible.

```
  write this code down. we will not show it again.

      RTQ4 - 8FMK - 2PZN - XW9D

  type the second and fourth groups back: ›
```

### 3.2. `depth move`

An identity lives on one device (§8.2). The command does not "add another one",
it **moves** it: alive here, frozen there.

```
$ depth move
  the code from the device the identity is on now:
  › K7Q-M3F-2X9▋
```

Nine characters, Crockford base32 without `I`, `L`, `O`, `U`. Case does not
matter and the dashes are optional. The code lives two minutes, applies once, and
a sixth entry attempt burns the invite. Until "that's me" is pressed on the other
device, nothing happens here. The whole mechanism is in §8.2 of the spec.

After the move, the line without which a person will assume their chats are gone:

```
  moved. the conversations are here, the history is not:
  it stayed on the previous device and comes back with the
  identity if you bring it back.
```

The other side, when this terminal is the one showing the code:

```
  a device is asking to take the identity

  called itself   Chrome, Android
  network         different from this terminal's
  when            just now

  nobody from support will ever ask for this code.

  [y] that's me    [n] decline
```

### 3.3. `depth device`

```
  this device

   ●  depth, this terminal          identity here since 9 August
      last activity                 now

  [enter] show a code to move it      [q] back
```

There is no list of other devices, because there are none: one live session.
The screen shows this one and offers the single action — hand the identity to
another device.

### 3.4. `depth report`

The Article 16 path has to exist in every face, this one included. From the feed
it is `r` on an entry; as a command it is for when the client is closed and
something needs saying.

The notice carries a copy of what is being reported: the server has no copy and
cannot have one (§8.8).

### 3.5. What is **not** a command

The transfer code is neither an argument nor an environment variable. Never:

```
depth move K7Q-M3F-2X9        ✗ an argument is visible in `ps` to everyone
                                on the machine and lands in shell history
DEPTH_CODE=K7Q-M3F-2X9        ✗ `docker inspect` shows the variable
```

Standard input only. The transfer screen is drawn in the terminal's **alternate
buffer** and cleared on exit — otherwise those nine characters stay in the
scrollback and in the multiplexer's log.

The PIN and the paper code follow the same rules, and are never echoed.

---

## 4. Screens

The same flow as the web: splash → area → name and age → feed → matches → chat.
The layout assumes 80 columns; narrower is a warning, not a breakage.

### 4.1. Splash and voice

```
$ depth

  Operator.

  ─────────────────────────────────────────────
   signal              48 neighbours in range
   broadcast depth     800 m
   depth of field      13 — 61
  ─────────────────────────────────────────────

  [d] depth   [f] field   [/] speak   [q] hardline
```

`Operator.` — one word on the first line. Those who know will smile; those who do
not will read it as "the operator is ready".

The names were not invented for style; each describes a mechanism:

| Word | What it actually is |
|---|---|
| `signal` | the feed |
| `broadcast depth` | the area radius |
| `depth of field` | the age range |
| `hardline` | quit |
| `speak` | posting |

### 4.2. The area — `broadcast depth`

There is no map in a terminal. Coordinates are typed by hand:

```
  broadcast depth

  latitude    › 41.6458▋
  longitude   › 41.6417
  radius      › 800

  ─────────────────────────────────────────────
  coordinates come from any map application:
  long-press a point — "copy coordinates".

  you choose the area, not your location —
  they are not the same thing.
```

That last line is not decoration: per the spec (§8.3) the point is tied to a
**chosen area** rather than to where the person is, which is why it needs no
blurring.

The value is remembered in the volume, so it is typed once.

A side benefit of this choice: the client makes **no** request to any external
service. There is no geocoding, and therefore no record of what place a person
searched for — neither with us nor with a third party.

### 4.3. Name and age — `depth of field`

```
  depth of field

  name     › Zhenya▋
  age      › 38

  filter   21 ────────●──────────── 61
```

Age bands work exactly as in the spec and are not softened here: the filter is
clamped into its own band, the 20/21 border is crossed upwards only, and the
client warns that this is irreversible before saving.

### 4.4. The feed — `signal`

```
  signal                                    48 in range

  › does anyone know if the bakery on the corner
    opens on sunday                        ♥ 3   14:22

  › looking for someone to run to the sea at 7:00
                                           ♥ 11  14:19

  › two chairs to give away, pick up, yard of no. 14
                                           ♥ 0   13:58

  [j/k] scroll  [l] like  [/] speak  [r] report  [tab] chats
```

The author is not shown in any form: no name, no label, no hint. A phrase, a like
count and a time — exactly as in the web.

### 4.5. Posting — `speak`

```
  speak

  › two chairs to give away, pick up, yard of no. 14▋

  ────────────────────────────────────────────  50 / 128

  how many of us   ● alone   ○ two of us   ○ a group
```

**128 characters** is the feed's limit. The counter is the client's; the node is
what refuses.

Feed moderation is **synchronous, before publication** (§8.3): a refusal arrives
at once and with a reason, not in silence.

### 4.6. Matches

```
  matches

   ●  "looking for someone to run to the sea"
      mutual 4 minutes ago
      waiting for your consent

   ○  "two chairs to give away"
      you consented, waiting for them        6:12 left
```

Double consent and the live window work as in §8.5. The terminal adds nothing to
them.

### 4.7. Chat

```
  ────────────────────────────────────────────────────────
   Anya, 34                      chat fades after 1h of silence
  ────────────────────────────────────────────────────────

   Anya  hi! I'm usually at the second entrance at 7   14:22

   you   great, see you tomorrow                       14:23  ✓

   ──  a game was proposed: dots and boxes  ──

  ────────────────────────────────────────────────────────
  › ▋                                            0 / 256
```

- **256 characters** is the chat limit and it **comes from the server**
  (`max_message_length`, §8.6) rather than being baked in here. The client draws
  the counter; the node decides.
- `✓` is `delivered`; `error` produces a retry line instead of vanishing quietly.
- The silence counter appears by the `min(20 min, ttl/3)` rule and is reset by any
  delivered message.
- **No history on disk.** The process exits and the conversation is gone. The
  scrollback is held in the live process's memory and nowhere else.

### 4.8. Keys

| Key | Action |
|---|---|
| `j` / `k`, `↑` / `↓` | scroll |
| `enter` | open |
| `esc` | back |
| `tab` | `signal` ↔ `chats` |
| `l` | like |
| `/` | speak / write |
| `d` | `broadcast depth` — the area |
| `f` | `depth of field` — age and filter |
| `g` | a game inside an open chat |
| `r` | report |
| `?` | help |
| `q` | `hardline` — quit |

---

## 5. What a terminal lacks, and what replaces it

### 5.1. The map → coordinates

See 4.2. The least friendly step of a first run, and a deliberate one: the price
of a client that goes nowhere.

### 5.2. Notifications exist, pushes do not — a platform rule, not a quirk of this face

**Notifications about new messages, matches and consents exist**, and here they
are the same as in the web: an inbox inside the client.

**There are no pushes anywhere** — no system notifications in the terminal, no
`BEL`, no browser web push. This is a decision for the whole platform rather than
a terminal limitation: a push needs an intermediary (a service worker and
somebody else's delivery service in the web, a system bus in a terminal), and
through it leaks outward exactly what we do not hand outward — that a
conversation happened, and when. For a product that stores no correspondence, it
would be odd to give its metadata to a third party for convenience.

Hence the honest consequence, stated plainly rather than in small print:

> While `depth` is closed you receive nothing. A match in a live window can
> expire while you are away.

The same is true of a closed browser tab. The match window is short (§8.5), and
no face will catch you beyond it.

### 5.3. The game board — present

A terminal is the native environment for text games, and the board draws more
simply here than in the web:

```
   ·───·───·   ·       game: dots and boxes
   │you│   │           your turn
   ·───·   ·   ·
   │   │anya
   ·   ·───·   ·

  [hjkl] pick an edge   [enter] move   [esc] leave
```

The board is transit state of the chat: encrypted with the same key, held in
memory, gone with the chat, never written to the database (§8.8).

### 5.4. No links, no QR, no clipboard — by construction

A transfer is a nine-character code (§8.2). No links are needed, so no separate
domain, no page and no `#` handling are needed either. The QR existed for the
sake of a long link, and left with it.

---

## 6. Storage

**In the volume:** keys (`identity.age`, under the vault key) and the accepted
terms revision with its date.

**Not in the volume:** conversations, feed, matches, game boards, logs. None of it
reaches the disk.

Hence the consequence for revocation (§8.2): a disconnected `depth` retains
**nothing** beyond what was in the live process's memory before it exited. A
browser keeps local history at this point — the terminal is stricter here.

A forgotten phrase equals a deleted volume. That is said twice: when the identity
is created, and in the device list.

---

## 7. Legal

### 7.1. Accepting the terms

Before the first screen, not after. A face does not work without accepted
documents; the terminal is no exception and gets no leniency.

### 7.2. A new revision

We have no email, so the only way to announce a change is to **show it on entry
and ask for acceptance again**. The date and version of what was accepted live in
`accepted.json`, and the comparison happens at start.

### 7.3. Reporting

The Article 16 path exists here too: `r` in the feed and `depth report` from the
shell (3.4). Refusing to accept a notice of illegal content is refusing to
perform an obligation, which is why the limit on this path is looser than on the
others.

### 7.4. Age

Self-declared, as in the web. The bands separate teenagers from adults as far as
that is possible without documents, and the terminal adds nothing to it.

---

## 8. Compatibility

### 8.1. Protocol version

The client sends its version and the node knows the minimum it supports. Below
that, a refusal **with a legible message** rather than a silent breakage:

```
  this image is older than the node's protocol.
  update:  docker pull ghcr.io/panov-id/depth
```

### 8.2. Stale images

Because the client is pinned by digest, old images will live on people's machines
for a long time. So the refusal has to be legible, and the support window has to
be announced rather than implied.

### 8.3. Third parties: your own client, your own network

An open client means other clients will appear. That is fine, and the server is
ready for it: it treats the client as hostile by default (1.2). Two different
wishes need telling apart.

**"I want my own client"** — go ahead. The node does not distinguish what drew the
screen, and should not. Terms for client authors set the frame:

- **the node guarantees** permission checks, length and rate limits, feed
  moderation before publication, age bands;
- **the node does not guarantee** that somebody else's client will draw a counter,
  show the terms or erase history — whoever built the fork answers for that;
- **you may not** collect our people's data with your client; showing the terms and
  the Article 16 path is an obligation, not a courtesy;
- a client that abuses this we may cut off.

**"I want my own network"** — then run your own node. That is not a brush-off but
the cheapest answer for both sides: the protocol is documented, the client is open,
and the node's sources live in this same repository. You are your own operator on
your own infrastructure, and we are not a party at all.

Hosting somebody else's network is not on offer, and that is a decision rather than
a gap. A separate world would mean a brand boundary inside the feed — exactly what
§8 of the chat spec forbids in its second principle. And legally it is a different
role: we would become that operator's **processor**, with everything that entails —
an Article 28 contract, a sub-processor list, assistance with data-subject
requests, a split of DSA roles. There is no such service, so there is no need for
such a contract.

---

## 9. Open questions

- **Interface language.** The storefronts speak several languages; the terminal is
  so far conceived in one. Whose choice that is — an environment variable, a flag
  or the system locale — is undecided.
- **Colour.** `NO_COLOR` support and behaviour in a terminal without 256 colours.
- **Narrow terminals.** What exactly breaks at 60 columns, and what to show.
- **Accessibility.** Behaviour under a screen reader in a terminal has not been
  studied.
- **Argon2id parameters** for the PIN: 64 MB / t=3 were taken by analogy with
  the transfer code (§8.2), but a PIN has a different threat model — six digits,
  typed at every start, and what guards it against guessing is the node's
  counter rather than the cost of the hash.
- **The image support window** (8.2): how many versions back the node must accept.
- **Re-asking for age** (§8.2 re-asks every few months) — what that looks like in
  a terminal is undecided.
