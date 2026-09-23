# `depth` — the terminal client

The platform's third face. Not a storefront and not an operator's tool, but the
same product — feed, tables, matches, chat — entirely in a terminal, launched through
Docker.

The chat spec (`chat_EN.md`) describes **what** happens and is the same for every
face. This document describes **how it looks and what constrains it here**, and
introduces no rule that is not already in the spec. Where the two disagree,
`chat_EN.md` wins.

---

> **Code status, 2026-09-21.** The core lives in `depth/core/` of this repository:
> Deno and Web Crypto, no Ink and no DOM (§13 of the chat spec). It signs per §2,
> registers with the paper code, reads the profile, sends a phrase, reads the
> feed with its cursor, likes and takes a like back, consents and says "not
> now"; checked against a live node (`scripts/run-depth-tests.sh`). **Not yet:**
> drawing (Ink), the image, the volume and `identity.age` of §2 and §6 — keys live
> in memory only. **Placeholders:** the PIN proof (Argon2id — its parameters are
> not written down), the paper code's halves and the node's share that opens no
> vault yet; registering with them takes the `testOnly` flag.

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
docker run --rm -it --log-driver none -e DEPTH_WRAPPED=1 \
  -v depth-identity:/data \
  ghcr.io/panov-id/depth@sha256:...
```

**`--log-driver none` is mandatory — added 2026-09-14** after the review panel (S16).
Docker writes a container's output through its log driver even with `-it`: by
default that is `json-file` under `/var/lib/docker/containers/<id>/`, and while the
client runs, the decrypted conversation sits there on the host's disk. `--rm` erases
the file only on exit, and the `journald` and `syslog` drivers never erase it.
Measured in a container: without the flag the output was found in `…-json.log`, with
it there is no log file at all.

**Launch only through the `depth` wrapper — added 2026-09-14 (S10).** A flag that has to be
remembered will be forgotten. So the `depth` command is a short script with the line above
built in whole, and the client checks at start for `DEPTH_WRAPPED=1`, which only the wrapper
sets, and without it refuses to start and says why. This guards against a mistake, not intent:
the variable can be set by hand without the flag, and that is said. **The whole interface, not
only the transfer screen, is drawn in the alternate buffer** of the terminal and cleared on exit:
otherwise the conversation stays in the scrollback. **The buffer does not keep it out of a multiplexer's log:**
`tmux pipe-pane` writes the raw stream, alternate buffer included (container experiment 2026-09-14: a
marker from the alternate buffer is in the `pipe-pane` log and absent from the scrollback). A multiplexer
log that is switched on keeps the conversation, and the client cannot know — `depth --help` says so.

To check that what runs is what was published:

```
docker buildx imagetools inspect ghcr.io/panov-id/depth:vX.Y.Z
```

### 2.2. The volume

`/data` inside the container, mounted wherever you like outside. All of the
identity's state lives there and nowhere else.

```
/data
+-- identity.age      keys, encrypted with the vault key (PIN + node share)
+-- accepted.json     the accepted terms revision and its date
+-- prefs.json        interface language and closed hints (2026-09-17)
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

**After 5 minutes without input the client locks — 2026-09-17** (storefront screen 12).
A terminal left in `tmux` is open to whoever sits down at the machine — exactly what the
web's lock was introduced against on 2026-09-04. On the lock the screen is wiped to a single
line `PIN ›` — no name, no number of conversations, no "new" dot; one exception: if it was
your move at a table when the lock fell, the line `your move at the table` (the move's clock
runs behind the lock too). The keys are dropped from memory: a locked client does not post,
does not read new messages and holds no socket — it has nothing to sign a request with. The
counter is the same as at start: ten attempts, **from the sixth a wait, and it grows**
(30 s, 2 min, 10 min, an hour, 4 hours; kept by the node, `chat_EN.md` §8.2), and a correct
PIN during the wait is not accepted. The price: step out for five minutes and it is six
digits and 144 ms of Argon2id again (§9). "Leaving the tab" does not count here — a terminal
has no `visibilitychange`, only idleness.

The price is stated plainly, before the identity is created rather than after:

> Forget the PIN and you lose access to this volume: ten wrong attempts lock it until
> the paper code, and without the old PIN nothing decrypts the keys in the file. The paper code
> brings the identity back on any device — it is issued right here, when the
> identity is created, and must be copied onto paper: a screenshot lives on the
> very device that gets lost.

No conversations are lost in the terminal — there were none there to lose:
nothing but the keys, the accepted revision of the Terms and `prefs.json` ever reaches
the disk (§6). The terminal is stricter than the browser, and the price of a PIN is a
different one here.

### 2.4. First run

```
$ depth

  Operator.

  ---------------------------------------------
   there is no identity on this device.

   depth new      create one
   depth move     move an identity here from the
                  device it is on now
   depth restore  raise an identity with the paper code
  ---------------------------------------------
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
| `depth appearance` | appearance: the accent and the contrast step (§9, storefront screen 22; added 2026-09-15) |
| `depth report` | a notice of illegal content (DSA Article 16) |
| `depth pin` | change the PIN: asks the old one, re-encrypts `identity.age` with a new node share (2026-09-17) |
| `depth reissue` | a new paper code — only on presenting the current one; the old one fades in the same transaction (`POST /recovery/reissue`; 2026-09-17) |
| `depth reset` | start over: a new identity in place of this one, with the price in numbers before confirming (2026-09-17) |

Everything except `depth` is also reachable from inside the running client: the
commands are a door for whoever arrived from a shell, not a second interface.

### 3.1. `depth new`

Name, age, PIN, paper code, area — and the person is in the feed. The order is
mandatory: age is asked before the feed because it decides what the feed hands out
(§8.2, age bands), the PIN because without the node's share the local key file
stays unencrypted, and the code because until it exists the identity is insured by
nothing.

**The paper code is here again — edit of 2026-08-26, overriding the move of
2026-08-18.** [retired] It had moved to the opening of the first chat: before that chat
there is nothing worth insuring, and sixteen characters were demanded before the
person had seen the product. The argument holds for property and fails for
identity: a screen that fails to convince mends itself — the person returns a day
later — while a device lost without a code never comes back. The screen looks like
this:

```
  write this code down. we will not show it again.

      RTQ4 - 8FMK - 2PZN - XW9D

  type the second and fourth groups back: >
```

### 3.2. `depth move`

An identity lives on one device (§8.2). The command does not "add another one",
it **moves** it: alive here, frozen there.

```
$ depth move
  this device's PIN:  > ******
  the code from the device the identity is on now:
  > K7Q-M3F-2X9

  check   Q7MX      -- show it on the previous device
```

Nine characters, Crockford base32 without `I`, `L`, `O`, `U`. Case does not
matter and the dashes are optional. The code lives two minutes, applies once; a
mistyped one gets "the code did not fit or has expired", and a second claim cancels the move. Until "that's me" is pressed on the other
device, nothing happens here. The whole mechanism is in §8.2 of the spec.

**A four-character check line — 2026-09-17** (storefront screen 13): derived from the new
device's public keys, and a different device gets a different one. It is the only verifiable
sign of the transfer — the "called itself" label is sent by the same side that is asking.
The PIN is asked before the code: the vault share belongs to the device.

After the move, the line without which a person will assume their chats are gone:

```
  moved. the conversations are here, the history is not:
  it stayed on the previous device and will not open
  there again, even if you bring the identity back.
```

The other side, when this terminal is the one showing the code:

```
  a device is asking to take the identity

  check           Q7MX   -- does it match the new device's screen?
  called itself   Chrome, Android
  when            just now

  nobody from support will ever ask for this code.

  [y] it matches, that's me    [n] decline
```

### 3.3. `depth device`

```
  this device

   (*)  depth, this terminal        identity here since 9 August
        last activity               now

  [enter] show a code to move it    [q] back
  [p] extend -- a new code, the old one fades
```

There is no list of other devices, because there are none: one live session.
The screen shows this one and offers two actions: hand the identity to another
device, and extend the code — issue a new one, fading the old (storefront screen 13,
2026-09-17).

### 3.4. `depth report`

The Article 16 path has to exist in every face, this one included. From the feed
it is `r` on an entry; as a command it is for when the client is closed and
something needs saying.

The notice carries the reporter's words: the server has no copy and cannot have
one, and the client uploads none (§8.8, 2026-09-11). Quoting is done by hand.

### 3.5. What is **not** a command

The transfer code is neither an argument nor an environment variable. Never:

```
depth move K7Q-M3F-2X9        ✗ an argument is visible in `ps` to everyone
                                on the machine and lands in shell history
DEPTH_CODE=K7Q-M3F-2X9        ✗ `docker inspect` shows the variable
```

Standard input only. The transfer screen is drawn in the terminal's **alternate
buffer** and cleared on exit — otherwise those nine characters stay in the
scrollback (a multiplexer's log is not kept out by the buffer, §2.1).

The PIN and the paper code follow the same rules, and are never echoed.

### 3.6. `depth pin`, `depth reissue`, `depth reset`

Three actions of storefront screen 12 that were missing here (added 2026-09-17): a PIN
someone had glimpsed could not be changed except by moving, the code could not be reissued
at all, and an identity could not be closed at all.

- **`depth pin`** — the old PIN, the new one twice; mistakes on the old one go into the same
  counter of ten.
- **`depth reissue`** — the current code, then the new one on the screen from 3.1, with the
  same repetition of two groups; a miss on the current one goes into the same counters as
  recovery.
- **`depth reset`** — before confirming, what will vanish is counted on the spot: live
  phrases, open conversations, waiting offers to talk; on a separate line — that the paper
  code becomes useless. `prefs.json` is erased together with the identity (§6). The
  confirmation is the PIN.

---

## 4. Screens

**The colours belong to the terminal, not to us — 2026-09-20, the owner's decision.** The
client paints no background at all: text is printed in the default foreground (`SGR 39`) and
accents come from the terminal's 16 colours, not from the product's palette. Dark ground or
light is read through `OSC 11` with `COLORFGBG` as the fallback, and can be named by hand with
`--theme`. The reason is measured: our `#f0e7dc` on someone's solarized-light gives 1.13:1 —
the text disappears unless the client repaints the whole background, and under tmux or in the
scrollback that does not always work. The price is named: the product's terracotta is not
recognisable in a terminal, everyone has their own scheme, and that is right — the terminal
belongs to the person, not to us.

**The drawing is ASCII, and the width is measured by the same `wcwidth` the terminal uses —
2026-09-20, after the review panel over the mock-up and the correction of the same day.** This was
first written as "only unambiguous-width glyphs are printed", and that is wrong: by UAX #11
**Cyrillic itself is "ambiguous"**, and a Russian client cannot avoid it (the Russian examples hold 3242 Cyrillic letters against 43 other ambiguous ones). So the rule has two halves.
First: **a column's width is measured by the rule the terminal measures it with** — the client uses
`wcwidth` with a pinned table and the `ambiguous` mode taken from the environment, never "one code
point, one cell". Where `ambiguous=wide` (the default in East Asian locales, a switch in iTerm2,
PuTTY, mintty), Cyrillic and `·` double as well, and the columns line up only if we count the same.
Second: **structure — rules, markers, the cursor — is drawn in ASCII**, because its width must not
depend on the font's coverage as well: `─ ♥ ● ○ ▋ → ← … — › ‹ ⊞ ₪ ✓` are substituted from another
file in half the terminal fonts and arrive at another width. So the client prints: `-` for a rule, `(*)` and `( )` for a radio, `*` only for "new", `>` for
the prompt, `+` for the like counter, `#` for a table, `%` for an offer, `ok` for an accepted line.
**The cursor is drawn by the terminal itself** — a printed block would land in the clipboard and a
screen reader would call it "left five eighths block". The mock-up
`panel/design/sheets/screen-depth-term.svg` is built by this rule and is held by
`scripts/check-design-grid.sh`. The examples below in §4 are still drawn with the old glyphs:
changing them is a separate decision for the owner.

The same flow as the web (§13 of the spec and `chat-flows_EN.md`, flow 1): splash
→ name and age → PIN → paper code → area → feed → matches → chat (edit of
2026-08-26: the code returned to registration).
The layout assumes 80 columns; narrower is a warning, not a breakage.

### 4.1. Splash and voice

```
$ depth

  Operator.

  ---------------------------------------------
   signal              dozens in range
   broadcast depth     800 m
   depth of field      your band
  ---------------------------------------------

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
| `table` | a table (4.9) |
| `liked` | what you liked (4.10) |
| `me` | me — settings and lists (4.11) |

**Counts are named in bands — edit of 2026-08-27.** This said "48 neighbours in
range", and the feed header carried the same number. An exact count that moves
with the radius is an instrument: stepping the handle and reading the numbers
works out the ring a particular phrase appeared in, which goes around the area
its author chose (§8.3, screen 3 of the storefronts). So all three faces name a
band — `nobody here yet` · `a few` · `about a dozen` · `dozens` · `hundreds` —
and the boundaries come from the storefront mechanics rather than being invented
here: "roughly" without numbers means three different roughlys in three faces.

### 4.2. The area — `broadcast depth`

There is no map in a terminal — **and none in the browser either, decided
2026-08-28**. The area is chosen on a diagram: a circle, a radius, a density band
and the place named in words. Coordinates can still be typed by hand if you
already have them:

```
  broadcast depth

  latitude    > 41.6458_
  longitude   > 41.6417
  radius      > 800

  ---------------------------------------------
  coordinates come from any map application:
  long-press a point -- "copy coordinates".

  you choose the area, not your location --
  they are not the same thing.
```

That last line is not decoration: per the spec (§8.3) the point is tied to a
**chosen area** rather than to where the person is. It still leaves rounded to a
cell (§8.3, decided 2026-08-31) — for a different reason: not to hide the place,
but so that an exact centre does not join up one author's phrases.

The value is remembered in the volume, so it is typed once.

A side benefit of this choice: the client makes **no** request to any external
service.

**A place can be typed in words — edit of 2026-08-28.** This used to say
"[retired] there is no geocoding, and therefore no record of what place a person
searched for". Geocoding has arrived and the promise stayed: the list of places —
districts and cities — is delivered together with the area and searched **on the
device**. There is still no record of "what place was searched for" with us or
with a third party, because there is nobody to search with. The terminal gets the
same field as the web:

```
  broadcast depth

  place       > Kolonaki_
  radius      > 800

  ---------------------------------------------
  the list of districts and cities arrived with the area
  and is searched right here: no request leaves the client.
```

### 4.3. Name and age — `depth of field`

```
  depth of field

  name     > Zhenya_
  age      > 38

  filter   < ------|----------------- >   36 -- no upper limit
           by the year, inside your band
```

Age bands work exactly as in the spec and are not softened here: the filter is
clamped into its own band, the 20/21 border is crossed upwards only, and the
client warns that this is irreversible before saving.

**The band's stops carry no numbers, and narrowing goes by the year — 2026-09-17**
(storefront screen 3). A labelled edge would suggest which number to put in the form to get
around it, so the handle simply goes no further, and the splash shows `your band` in place
of `13 — 61` [retired] — the numbers are gone. The right edge for an adult is the words `no
upper limit`: the band is not closed at the top, and `61` was invented. The step is a year;
the node accepts any bounds inside the band, and the price is named right there: narrowing
by the year and watching what disappears, an author's age can be learned before a match. The
band shifted — the person turned a year older — gets one line at the next start: `your band
shifted, the filter was clamped again`.

**The other two feed filters live here too — added 2026-08-27** (screen 3, §8 of
the mechanics). They were missing, and the terminal was showing a feed the web no
longer shows:

```
  languages  (*) ru   (*) el   ( ) en   ( ) fr      12 more in other languages
  mode       (*) alone   (*) company   ( ) party
```

- **Up to three languages**, taken from the locale by default. The line "N more in
  other languages" always sits under the feed: a person has to know the
  neighbourhood is livelier than their filter, and not read the filter's silence
  as the neighbourhood's.
- **The language filter never hides an offer** — the one exception: the bakery
  across the street is just as useful whatever language you read in.
- **Mode** — three toggles, `alone` / `company` / `party`, on a phrase's `mode`.
  Until now the terminal could set a mode when posting but could not search by
  one.

### 4.4. The feed — `signal`

```
  signal                                     dozens in range

  > does anyone know if the bakery on the corner
    opens on sunday                        + 3   14:22

  # table · "dominoes after work" · dominoes
    2 playing · 1 watching                 + 1   14:19
    [l] like  [enter] sit down

  % offer · −20% · the bakery on the corner
    code CORNER20, until sunday            + 1   14:04

  > two chairs to give away, pick up, yard of no. 14
                                           + 0   13:58

  [j/k] scroll  [l] like  [L] liked  [/] speak  [h] hide
  [b] block  [r] report  [tab] chats  [enter] full screen
```

The author is not shown in any form: no name, no label, no hint. A phrase, a like
count and a time — exactly as in the web.

**The feed holds three things, each of them marked — edit of 2026-08-27** (screen
3): a neighbour's phrase, a **table** (4.9) and an **offer** (screen 17 of the
storefronts). They run in one stream by time rather than on shelves, because a
shelf turns a neighbour's offer into an ad block people scroll past without
looking. The terminal was showing phrases only.

- **An offer is marked by the word and the size of the discount.** A venue also
  gets a code and an external link — opened through our own redirect and behind a
  warning; a private person gets neither, and their offer is an ordinary phrase
  with a non-empty discount.
- **The share of offers in the feed is capped**: no more than one commercial card
  per ten ordinary ones (§8.3).
- **An offer can be liked without a live phrase of your own** (§8.4, decided
  2026-08-27). An ordinary like requires a live phrase on both sides or no match
  can ever happen; an offer's match is one-sided, and without the exception you
  would have to write something of your own before claiming the free chairs.
- **What you liked is not in the feed — the owner's decision of 2026-09-17** (storefront
  screen 3). `l` takes the card out of `signal`: the **node** filters the feed by its own
  `likes` and `table_likes` (`GET /feed`, `protocol_EN.md` §4.2), not the client. In the
  card's place, for a few seconds, the line `liked · [u] undo` [built differently on
  2026-09-23: the terminal removes the card at once and there is no "undo" line in the feed —
  the like is taken back on the `liked` screen, while still on it (review panel
  2026-09-23)]; after that it is in `liked`
  (4.10), and taking the like back is done there — until an offer to talk has come out of
  it. [retired] Before, the card stayed in the feed after `l` with a filled-in counter, and
  the like was taken back with a second `l`. The price is the web's: for an active person
  a page of 30 cards runs out sooner, and the `— 30 more —` line comes more often.
- **A table is marked by its game, its name if one was given, two numbers — playing and
  watching — and the number of likes** (storefront screen 19; the numbers 2026-09-10, the
  name and likes 2026-09-17). You can sit down right from here (4.9); **`l` on a table is a
  bookmark, not a seat** (`POST /tables/:id/like`): the table goes to `liked`, and sitting
  down happens from there; everyone seated sees the number of likes, nobody sees who liked;
  a table's like breeds neither a match nor an offer to talk, and is taken back in the same
  place while the table lives. `enter` while you hold a live seat at another table asks:
  `you will get up from the table "…" — [y]/[n]` (storefront screen 4).

**There are three actions on a phrase, not one — edit of 2026-08-27** (screen 5):
`h` hide, `b` block, `r` report. A single report used to stand here, which meant
the quiet exit — "stop showing me this" — existed only in the web, and in the
terminal every irritation had to be taken to a moderator.

#### 4.4.1. A card full screen

**Introduced 2026-09-17** (storefront screen 23). `enter` on a card opens it across the
whole width — one card, no neighbours:

```
  --------------------------------------------------------

     does anyone know if the bakery on the corner
     opens on sunday

     alone · + 3 · disappearing soon

  --------------------------------------------------------
  [->] like  [<-] hide  [Space/j/k] page  [esc] back
```

- **Every card of the feed is paged** — phrases, offers, tables — in feed order; your own
  phrase still being checked and what is already liked are skipped (they are on screen 9
  and in `liked`). `esc` returns to `signal` on the same card.
- **The arrows repeat the web's gesture:** `→` is whatever reversible action the card has
  (a like on a phrase, a bookmark on a table; on a private person's offer `→` only pages,
  because its like breeds an offer to talk at once and cannot be taken back); `←` hides. A
  slip is undone by the same `hidden · [u] undo` line as in the feed. `Space`, `↓`, `j` go
  forward; `↑`, `k` go back. `Shift+Space` is not bound: most emulators send the same byte
  for it as for `Space`. **A table is never joined with an arrow** — only with `enter`,
  because that stands you up from the previous table.
- **The first press of `←` or `→` does not act, it explains** (storefront screen 24, since
  2026-09-17 for keys too): the line `right — like, left — hide; hidden things come back in
  me · [enter] got it` over the card; until `enter`, neither a like nor a hide. That it has
  been shown, the terminal remembers in `prefs.json` (§6).
- The remainder of someone else's phrase is not shown as a number (§8.11 of the spec): in
  the last 65 minutes — the words `disappearing soon`. Your own phrase keeps the number.
- The node does not know whether a card was opened full screen: the like and the hide are
  the same as from the card, and viewing time is written nowhere.

### 4.5. Posting — `speak`

```
  speak

  > two chairs to give away, pick up, yard of no. 14_

  --------------------------------------------  48 / 128

  mode             (*) alone   ( ) company   ( ) party
  discount         ( ) no      (*) yes   −20%, until sunday

  [s] put up a table instead of a phrase
```

**128 characters** is the feed's limit. The counter is the client's; the node is
what refuses.

**The discount and the table were added on 2026-08-27**, following the
storefronts' composer (screen 4). A filled-in discount turns the phrase into a
**private person's offer** — there is no separate entity here and there will not
be one; the whole mechanic of a post comes free with it. Until this edit the
terminal could sit down at a table it had no way of putting up. `s` switches to putting
up a table (4.9):

```
  table

  game     (*) dominoes   ( ) draughts   ( ) chess
  name     > dominoes after work_                  19 / 24
  area     > 300 m

  the name is optional. it is published text and is checked
  by the same queue as a phrase: the table enters the feed
  at once, unnamed, and the name appears after the verdict.

  [enter] put up -- you will sit down at it and get up from the previous one
```

**A table's name — an optional field of up to 24 graphemes, the owner's decision of
2026-09-17** (storefront screen 4, `POST /tables name`, `protocol_EN.md` §4.6). The table
enters the feed at once, without a name; the verdict arrives as a `name_verdict` frame — the
terminal keeps the state `name being checked` on its own table, the same word as on a phrase
(below), and shows a rejected name as a line with the reason and a field to fix it; the table
lives on without a name meanwhile. The limit is enforced by the node.

Feed moderation runs as a **queue before publication** (§8.3), which is not the
same as "at once": `POST /feed` answers `202` immediately, the phrase sits with
an empty `visible_at` and appears in nobody's feed, and the verdict arrives
later — a refusal with a reason, not in silence. The client must show that state:
"being checked". Measured on production-class hardware — a 2.8 second median and
a maximum near 12; the terminal must not pretend to an instant answer that does
not exist.

### 4.6. Conversations — `chats`

`tab` from the feed. Two tabs, as on storefront screen 7; rewritten 2026-09-17 — only a
list of matches, `matches`, stood here [retired], and there was no conversations screen
although `tab` led exactly there.

```
  chats            [1] offers (2)   [2] conversations

  (*) Anya · "great, see you tomorrow" · 0:47
    waiting for your reply

    Kostya · "ok, until saturday" · 3:12

    Masha · "..." · ended
```

- **The counter is on offers only** — how many are waiting for your reply. Conversations
  carry no number: an offer has a hard deadline and someone else waiting, a conversation is
  your own talk.
- **A conversation's entry: the name, a snippet of the last line and the remainder of your
  own span.** In the last quarter of the span the line is dim (4.7). `waiting for your
  reply` — if the last line is theirs; counted here, never reported to the node.
- **`●` is the "new" dot (the owner's decision of 2026-09-17):** it stands while the
  conversation holds lines the conversation screen has not yet shown, and goes out on
  opening. No number, on purpose. The process counts it, not the node and not the disk
  (§6): after a restart, everything that arrived by catch-up shows as new once.
- **`ended`** — the mark is set by your attempt to open or write, not by their clock
  (2026-09-10): at the moment their span expires the list does not change.
- Sorted by the time of the last line. A table is not here (4.9).

**The offers tab** — a card for every mutual like:

```
  offers

   Anya, 34 · company
   -----------------------------------------
   hers   "looking for someone to run to the sea"   1:48 left
   yours  "two chairs to give away"                 2:10 left

   the chat is not checked. nobody reads what you
   write here -- not us, not a filter. the conversation is
   encrypted on your devices: the node carries it but
   cannot read it. a game is the exception: the node
   sees the moves and the board.
   if someone behaves badly -- block them and
   report in your own words.

   [enter] talk   [n] not now
```

- **The name and the age are the first place where a stranger becomes someone** (§8.11 of
  the spec): the feed has neither and cannot. The age next to the name is here and in the
  conversation header (4.7).
- **Both phrases' remainders, one per phrase** — the match dies with the first. One timer,
  `6:12 left`, stood here [retired] — lifted in the web on 2026-09-14, the terminal caught up
  on 2026-09-17.
- **The warning is the only one, and it is here:** the last moment when nothing is open yet.
  Not a second consent: `enter` stays the single press.
- **`n` — "not now".** The refusal is recorded at once and invisible to the other side: they
  wait until expiry, as they would have anyway. For a few seconds at the bottom,
  `declined · [u] undo` [**built 2026-09-23** in `depth/ink/rooms.ts` (`Inbox`): "not now" and
  "undo" are menu items, `n` and `u` are not keys (navigation is arrows and enter,
  2026-09-22); the "declined" line keeps its place until the person leaves the inbox rather than
  for a few seconds — "undo" has no timer (owner's decision 2026-09-18); the live walk declines
  and brings back a match against the node]; then the card is gone and the like is spent — a new match only with
  a new phrase.
- While only you have pressed — the line `no reply yet`, and nothing more: no "seen", no
  "opened".
- A private person's offer: one phrase on the card — the offer itself — and the line
  `is interested in your offer`.

### 4.7. Chat

```
  --------------------------------------------------------
   Anya, 34                 fades after 1h of YOUR silence
  --------------------------------------------------------

   Anya  hi! I'm usually at the second entrance at 7   14:22

   you   great, see you tomorrow                       14:23  ok

   --  a game was proposed: dots and boxes  --

  --------------------------------------------------------
  > _                                            0 / 256
```

- **256 characters** is the chat limit and it **comes from the server**
  (`max_message_length`, §8.6) rather than being baked in here. The counter is the
  client's; the node refuses by a different parameter — `max_ciphertext_bytes`,
  2048 bytes — because what it sees is ciphertext, not characters (edit of
  2026-08-25).
- `✓` — **the node has accepted it and answers for delivery** (2026-09-12, storefront
  screen 8): if the other person is offline, the line waits for them while the conversation
  lives. `error` produces a retry line instead of vanishing quietly. There is no
  "delivered" and no "read", and there will not be — this said `delivered` [retired]: the
  name of a status the product does not have.
- **The span is each person's own and changes right here** — `t` (§5, §8.6, settled
  2026-08-26): 10 minutes, 30 minutes, an hour, "while we're talking". The header
  shows **your own** remainder; the other side's span is neither shown nor sent.
  It counts from **your** last message — theirs does not reset it, because reading
  is not talking.
- The silence counter appears in the **last quarter of your own span** and is reset
  by any **of your own** delivered messages. The old `min(20 min, ttl/3)` rule is
  retired along with the pick at consent.
- **The conversation ended for the peer** — a line replaces the input: neither of
  you can write, the key is out for both (§8.13). Your own history stays — exactly
  until your own span.
- **The other person has stepped away** — a label saying "away" above a live input
  field, with no time of leaving and no time of return (screen 8, §13 of the
  mechanics). The label is lifted by the returning person's first message or move in that
  conversation, not by the span (edited 2026-09-14, `chat_EN.md` §8.2; this said
  "instead of the input field" [retired]). It is the only place in the whole product where someone else's
  presence is reported, and it is allowed because the person declared it rather
  than the system inferring it.
- **You can step away too** — `a`: 20 minutes, an hour, or 4 hours. It is a
  real absence, not a pause: live phrases go with their likes — the ones received and the
  ones you placed, on phrases and tables (2026-09-17) — offers to talk burn out, short-span
  conversations will not survive it, and the price is counted on
  the spot, before the confirmation. A table you were sitting at stays: the person
  leaving gets up from it and the game goes on (screen 20, decided 2026-08-27).
- **A conversation can be closed by hand** — `x`, with a confirmation, and it
  closes **for both at once**: the other person sees the same gravestone as on
  expiry (2026-08-26, confirmation added 2026-08-27). Staying silent until expiry
  to get out of an unpleasant conversation is a poor only exit, and a block is too
  large a step for it.
- **No history on disk.** The process exits and the conversation is gone. The
  scrollback is held in the live process's memory and nowhere else.

### 4.8. Keys

| Key | Where | Action |
|---|---|---|
| `j` / `k`, `↑` / `↓` | everywhere | scroll |
| `enter` | feed, `liked` | the card full screen (4.4.1); on a table — sit down, with a confirmation if you are already seated |
| `enter` | `chats` | open the conversation; on an offer to talk — "talk" |
| `esc` | everywhere | back |
| `tab` | everywhere | `signal` ↔ `chats` |
| `l` | feed, viewer, `liked` | like: a like on a phrase, a bookmark on a table, an offer to talk on a private person's offer; in `liked` — take it back |
| `L` | everywhere | `liked` — what you liked (4.10; 2026-09-17) |
| `←` / `→` | viewer only | hide / the card's reversible action (4.4.1; 2026-09-17) |
| `Space` | viewer only | next card (2026-09-17) |
| `u` | feed, viewer, `liked`, `chats` | undo: lifts "liked", "hidden", "taken back", "declined" while the line is visible |
| `n` | `chats` → offers | "not now" |
| `/` | feed, conversation, table | speak / write |
| `s` | in `speak` | a table instead of a phrase |
| `h` | feed, viewer | hide a phrase |
| `b` | feed, viewer, conversation | block the author |
| `x` | conversation | close the conversation (with a confirmation) |
| `t` | conversation | your own span: 10 / 30 / 60 / "while we're talking" |
| `a` | everywhere | step away and come back |
| `m` | everywhere | `me` — the "Me" screen (4.11) |
| `d` | everywhere | `broadcast depth` — the area |
| `f` | everywhere | `depth of field` — age, languages, mode |
| `g` | conversation | a game |
| `r` | feed, viewer, conversation, table | report |
| `?` | everywhere | help |
| `q` | everywhere | `hardline` — quit |

The "Where" column was added 2026-09-17 (applied 2026-09-18): there are more keys now, and
`r` on the board (5.3) means "play again" while in the feed it means report.

### 4.9. The table — `table`

The terminal gets the table in full, not just its card in the feed: a face that
shows you something you cannot enter irritates exactly as much as a face that
shows you nothing.

```
  --------------------------------------------------------
   table · "dominoes after work" · dominoes   fades after 1h of shared silence
   seated  you · Anya · Kostya
  --------------------------------------------------------

   [7|3] [3|3] [3|5]                    your hand
                                        [1|4] [2|2] [6|6]
   Anya    dibs on going first           14:19
   Kostya  fine                          14:20

  --------------------------------------------------------
  > _                                            0 / 128
  [hjkl] choose  [enter] move  [/] say  [esc] get up
```

The rules in full are screen 19 of the storefronts; here is what the terminal
shows and what it is obliged to say out loud:

- **A table is not a conversation.** It lives by the feed's rules: visible by
  radius, and speech at it is public and goes through **the same moderation
  queue** as a phrase. A median of 2.8 seconds per line is felt more at a table
  than in the feed, and that has to be shown as a state rather than disguised as
  an instant send.
- **There is no end-to-end encryption here, and the screen says so.** The
  conversation key is derived for two (§8.13) and does not extend to a table; the
  node sees both the board and the lines, or there would be nothing to moderate.
  Anyone who read about encryption in a conversation will carry the expectation
  here unless told.
- **One span for everyone, counted from the last move** — unlike a conversation,
  where each side has its own. The seating at a table changes, and separate counts
  would mean the table exists in different states for the people sitting at it.
- **Someone who sits down late sees nothing from before**: the board arrives as it
  stands, the lines from the moment they sat. The same rule as moving an identity.
- **Bands are checked each against each.** You may sit down only if you are in
  everyone's band and they are in yours; to someone outside the bands the table is
  **not visible at all** — no line, no greyed-out card, because such a card would
  itself report who is sitting where.
- **A majority of those seated removes someone**, and whoever put the table up
  does not own it. Nobody holds sole power over a table.
- **A block separates at the seat**: if someone you blocked is sitting at a table,
  you do not see it, and sitting beside each other is refused both ways. If you are
  already at one table, whoever blocked leaves and the game goes on for the others
  (screen 19, 2026-09-14; the old price "one person can hide someone else's game
  from you simply by sitting down at it" [retired] was lifted on 2026-09-10).
- **A table is not in the conversation list**, because it is not a conversation.
  While you are at one, the `signal` header carries a line "you are at a table —
  [enter] to return": narrow your circle or leave the radius and the line will
  still take you back, while finding the table again in the feed will not work.
- **A table can be liked without sitting down** (2026-09-17, 4.4): in the table header the
  number of likes stands next to the numbers of players and watchers — `♥ 2` — and that is
  the only thing a like changes for those seated.
- **`table` is never written to the volume**, like everything else: the board
  lives in the process's memory.

### 4.10. What you liked — `liked`

**Introduced 2026-09-17 together with the rule "what you liked is not in the feed"** (4.4,
storefront screen 25): a like takes the card out of `signal`, and without this screen there
would be nowhere to take the like back.

```
  liked                                        newest on top

  + does anyone know if the bakery on the corner
    opens on sunday                        + 4   liked 14:31

  # table · "dominoes after work" · dominoes
    2 playing · 1 watching                 + 2
    [enter] sit down

  (*) "looking for someone to run to the sea"
    offer to talk · [enter] to the offer

  -- 30 more · [enter] show --
  [l] take back  [j/k] scroll  [esc] back
```

- Cards of the same shape as in `signal`, **in the order of liking, not of the feed**; the
  list comes from the node — `GET /likes`, cursor `?after`, in pages of 30
  (`protocol_EN.md` §4.3). The node knows the likes, and after an identity move the list is
  the same.
- **`l` on a card takes the like back** (`DELETE /feed/:id/like`, for a table
  `DELETE /tables/:id/like`): the card leaves here and returns to the feed; in its place,
  for a few seconds, the line `taken back · [u] undo`.
- **A phrase an offer to talk came out of** stands here as an offer card: the node answers
  `{state: 'spent'}`, `l` does nothing on it, `enter` leads to `chats`. A private person's
  offer lies here **always** as an offer to talk — its match is one-sided and is born by the
  like at once (4.4).
- **On a table `enter` is sit down.** A like does not seat you; you can sit at one table,
  and before seating, if you are already at one, the line `you will get up from the table
  "…" — [y]/[n]`.
- `enter` on a phrase opens it full screen (4.4.1); only the liked ones are paged there.
- **It leaves by itself**, as in the feed: an expired or withdrawn phrase, a closed table,
  the phrases of a blocked author; your own step-away (`a`, 4.7) removes your likes too — on
  phrases and tables — along with your phrases: coming back, a person finds this empty.
- Empty — the line `nothing liked`, as on storefront screen 11.

**Built 2026-09-23 for phrases** (`depth/ink/rooms.ts`, `Liked`; the node — `GET /likes` in
`relay/node/src/routes/likes.ts`, and `GET /feed` no longer serves what was liked). The
terminal has no letter keys (owner's decision 2026-09-22, navigation is arrows and enter), so
the mockup's `l` and `u` are the menu items "take the like back" and "undo"; "taken back"
stands in the card's place until the person leaves the screen. A match card is `(*)`, "offer
to talk", and its item leads to the inbox. "Show more" takes the next page. The node has no
tables and no one-sided offer match yet, so neither is here yet; on a private author's offer
"take the like back" is greyed, because the node answers `spent` to it. Opening a phrase
full screen with `enter` (4.4.1) is not built either.


### 4.11. Me — `me`

`m` from anywhere. The fourth navigation item of §9 of the spec (`Me`), which the terminal
did not have; added 2026-09-17. The screen is a list, one row per item; the rules are
storefront screen 10:

```
  me

   name        Zhenya               changes on a clean slate
   age         38                   your contacts will see the change
   languages   ru · el              [f]
   interface language               ru
   appearance                       depth appearance
   default silence span             1 h · for new conversations
   default area and mode            300 m · alone
   liked                            [L]
   hidden                           3
   blocked                          1 · lift
   hints                            show again
   step away                        [a]
   support                          requests and replies
   what happened                    console
   this device                      depth device
   PIN · paper code · start over    depth pin · reissue · reset (3.6)
```

A change of age goes into every open conversation as the line `your contact changed their
age: 39` (§8.2 of the spec), and the terminal says so before saving. The "hidden" and
"blocked" lists come with an undo (`GET /blocks`, `DELETE /blocks/:id`). "Hints — show again"
erases the list of closed hints from `prefs.json` (§6). "Support" and "what happened" are
only named here — their terminal mechanics are not described (§9).

**The Article 17 statement of reasons — built 2026-09-23** (`depth/ink/rooms.ts`, `Statements`).
The terminal has no e-mail, so the statement (`GET /statements`, `dsa/SPEC_EN.md` §7) is
delivered here. On the first entry
to the feed in a run the restrictions are shown whole, in a red frame, one at a time, the up
and down arrows between them; the five lines are those of `refusal-wordings_EN.md` §6
(without the heading "Your phrase has been hidden.", since what was restricted need not be
a phrase),
including the two different "How decided" lines by `automated_used` and "law:" or "terms:"
by `ground_kind`. "Got it" folds them back into the feed, and the red "Restrictions: N" row
is the first row of the `me` screen, which opens them again (since 2026-09-23; before `me`
the row stood above the feed). Nothing is kept on disk (§6), so the next run is again the
"next entry" of §7, and the statements are shown again.

**Blocked — built 2026-09-23** (`depth/ink/rooms.ts`, `Blocked`; `GET /blocks`,
`DELETE /blocks/:id`). A line per block — "blocked since <date>", no names and no phrases,
as on screen 10 of the storefronts; the item "lift". "Blocked: N" is a row of the `me` screen
only while there are blocks, and after the last one is lifted the screen goes back by itself —
the terminal never draws "Blocked: 0" and does not answer the storefronts' Q-48.

**The `me` screen — built 2026-09-23 in a small form** (`depth/ink/rooms.ts`, `Me`). It is
reached by the item "me" in the feed's menu: there is no `m` key, navigation is arrows and
enter (2026-09-22). On top, the name and age from `GET /identities/me`, read-only; below, rows
that open the screens already built: the red "Restrictions: N" (if any), "liked", "hidden · N",
"Blocked: N" (if any). These items left the feed's menu — the row no longer fit a hundred
columns. Not built: editing the name, age and languages (the `name_frozen` refusal has no
terminal text), appearance, the silence and area defaults, hints, stepping away, support, the
console.

---

## 4a. Stickers

Stickers are beyond the alpha (screen 16 on the storefronts), but in a text
client their fate is peculiar, and it is recorded here on **2026-08-29**,
because until that day the word "sticker" did not appear in this document once.
The decision "one sticker, and instead of the text" made a line the terminal
could not render at all.

Every sticker has a name. The terminal prints it:

```
  neighbour   [waving]
  you         hey :)
```

The brackets are not decoration but a mark: this is a sticker, not somebody's
two-word message. The terminal does not draw the image and does not try — not in
block graphics, not in `sixel`: the neighbouring line would be no clearer for it,
and the output would stop being copyable.

The name comes **from the catalogue** the client has already fetched whole;
only the identifier travels inside the ciphertext. The terminal knows no more
than the web does, and the node no more than the terminal.

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
   ·---·---·   ·       game: dots and boxes
   |you|   |           your turn
   ·---·   ·   ·
   |   |anya
   ·   ·---·   ·

  [hjkl] pick an edge   [enter] move   [esc] leave
  [u] put it back   [r] play again
```

**The web took this grammar on 2026-08-29** (screen 18 on the storefronts): until
then a board in a browser worked by dragging alone, which is to say it worked
neither from a keyboard nor with a screen reader. Here it existed from the start —
a terminal cannot do it any other way.

`u` and `r` are **requests, not actions**: they go to the others and fire once
everyone agrees. Once everyone has declined to play again, the board closes; in a
pair, one person leaving ends the game; at a table the last one left waits for
someone to sit down.

The board is transit state of the chat: not encrypted since 2026-09-09 (only whoever sees the board can judge the play), with the position held in a game cache on the node
(`chat_games`) and leaving with the chat by cascade — rewritten 2026-09-10, where
this read "never written to the database" (§8.8).

### 5.4. No links, no QR, no clipboard — by construction

A transfer is a nine-character code (§8.2). No links are needed, so no separate
domain, no page and no `#` handling are needed either. The QR existed for the
sake of a long link, and left with it.

---

## 6. Storage

**In the volume:** keys (`identity.age`, under the vault key), the accepted terms revision
with its date, and `prefs.json` — the interface language (§9) and the list of closed hints
(storefront screen 24; added 2026-09-17). The third file is not about the conversations:
it holds no conversation identifiers and no times, only the names of hints. The mode is the
same `0600`, and `depth reset` erases it together with the identity. This said "keys and the
accepted terms revision" [retired] — the language had been in the volume since 2026-08-27
(§9), and the tree did not show it.

**The "new" dot in `chats` (4.6) is not written to disk:** which lines have been shown is
remembered by the process, and after every start everything that arrived by catch-up shows
as new once. The web pays this price only on a move (storefront screen 7); the terminal at
every start, because remembering it on disk would mean keeping a list of conversations with
times there — exactly the metadata §5.2 refused pushes over.

**Not in the volume:** conversations, feed, matches, game boards, logs. None of it
reaches the disk — **when run with `--log-driver none`** (§2.1): without the flag
all output settles in Docker's log (clarified 2026-09-14).

Hence the consequence for freezing (§8.2): a frozen `depth` retains
**nothing** beyond what was in the live process's memory before it exited. A
browser keeps local history at this point, though after a move nothing opens it
either — the share is burned (§8.2); the terminal keeps not even that.

A forgotten PIN equals a deleted volume — but not a lost identity: the paper code
raises it again (§2.3). That is said twice: when the identity
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

- ~~Interface language~~ — **asked at first run** (decided 2026-08-27). One
  question in `depth new`, and the answer goes into the volume next to the accepted
  revision of the terms. Neither the system locale nor a flag: a shell's locale is
  often not the language a person speaks to their neighbours in, and choosing
  silently is the same thing as the feed's language shares, already retired. Price:
  one more step in a long registration.
- ~~Colour~~ — **the emulator's sixteen colours** (decided 2026-09-15, storefront screen 22): 256 colours are not needed. The accent — the `depth` face's own appearance row (chat spec §8.2), any of the seven names — becomes an ANSI name, and the contrast steps are colour, colour and bold, no colour; `NO_COLOR` switches on the last. The choice is kept with the identity on the node and is not written to the volume; before the node answers and with no connection the terminal draws the default — normal contrast, no accent.
- **Support, the console and notifications in the terminal.** On the `me` screen (4.11)
  they are named as items, the mechanics are not described: a terminal has no disk for
  receipts (§6).
- **Narrow terminals.** What exactly breaks at 60 columns, and what to show.
- **Accessibility.** Behaviour under a screen reader in a terminal has not been
  studied.
- ~~Argon2id parameters for the PIN~~ — **they stay at 64 MB / t=3, measured
  2026-08-28** (`scripts/measure-argon2-pin.sh`, container `python:3.12-slim`):

  ```
      memory  iterations    ms      offline search of a million PINs
       16 MB           2    21       5.9 h on one core
       32 MB           3    70      19.4 h
       64 MB           3   144      39.9 h      <- taken
      128 MB           3   308      85.5 h
      256 MB           3   693     192.6 h
  ```

  The measurement closed the question not by naming the best number but by showing
  that **this handle does not tune the PIN's security**. Six digits are a million
  possibilities, and even 256 MB buys forty machine-days on one core — hours on a
  dozen graphics cards. The only real defence here is the node's counter and its
  ten attempts, exactly as written above; raising the parameters means paying a
  delay at **every** launch for something that does not work.

  So the choice is made by latency, and 144 ms is the edge of imperceptible. We
  keep 64/3: the same parameters as the transfer code, where the hash's cost does
  decide (45 bits against 20), and one implementation instead of two. The honest
  caveat: the measurement was made on a developer's machine, while the delay is
  paid by someone else's hardware — on a weak device the number will be several
  times larger.
- ~~The image support window~~ (8.2) — **the current major only** (decided
  2026-08-27). An older image gets a legible refusal with the command to update,
  and the sunset date is announced in advance. Price: one major version switches
  off everyone who is not watching; accepted for the opposite reason — every
  supported old branch is code nobody touches and nobody checks.
- **Re-asking for age** (§8.2 re-asks **once a year**: "are you still 38?", one
  line that closes on a tap) — what that looks like in a terminal is undecided.
