# Notices and statements of reasons: a specification to build from

What to build so that Arts. 16 and 17 DSA are met in fact rather than in words.
The reasoning behind the decisions is in [README_EN.md](./README_EN.md).
Russian version: [SPEC_RU.md](./SPEC_RU.md).

## 1. Terms

| Term | Meaning |
|---|---|
| **Notice** | a report that content is illegal (Art. 16). Not a complaint |
| **Notifier** | whoever submitted the notice. Anyone, not only a user |
| **Statement of reasons** | the explanation of a restriction to its addressee (Art. 17) |
| **Snapshot** | a copy of the content taken the moment a notice arrives |
| **Addressee of a restriction** | the author whose content was restricted |

A complaint about a message and a complaint about an offer are **different
entities**, described in `../offers/SPEC_EN.md` and in the feed mechanic. This
document covers notices only.

## 2. Where it is submitted

Two channels, both obliged to accept the same thing:

1. **The form** `report.html` on the face — the main route. Opened from the
   hidden menu of a message or an offer (the location is then pre-filled), and
   by a direct link from the footer and the legal pages.
2. **The support address** — the fallback route, and the route for authorities.
   A letter without the form's fields is accepted: whatever is missing is
   requested in reply.

**The `POST /report` route refuses a notice under no key-related circumstance
whatsoever.** A storefront's publishable key answers only "which face did this
come through", and if it is unknown, revoked, called from an unexpected origin or
out of its daily quota, the notice is accepted **unattributed** rather than
rejected. In the database that is `brand = NULL` (migration `007`).

This is a correction, not a flourish: until 2026-08-11 the refusal happened
**before** the content snapshot and **before** the insert, so the notice simply
did not exist — no Article 16(4) acknowledgement went out, nothing reached the
queue, and the only trace was a counter. The daily quota is spent by page views
as well: a storefront passed around in chats would have been enough to stop
accepting reports of illegal content for the rest of the day.

The quota is neither checked nor charged on this route: an obligation is not
metered. What guards it against a flood is its own per-address limit (10 an hour,
40 a day) — a bound on volume rather than on who may speak.

Art. 16(1) requires the mechanism to be **easy to access, user-friendly and
exclusively electronic**. Telephone and paper are deliberately absent.

## 3. Fields of the form

Mandatory (Art. 16(2)):

| Field | Type | Note |
|---|---|---|
| `target_kind` | enum | `feed_message` \| `offer` \| `table_line` \| `chat` \| `other` |
| `target_id` | string | pre-filled when opened from a card |
| `reason_text` | text | **the reasoning** why the notifier believes the content is illegal |
| `notifier_name` | string | asked for, not required — see below |
| `notifier_email` | string | asked for, not required — see below |
| `bona_fide` | checkbox | "the information is accurate and complete to the best of my knowledge" |

Three fields the form sends that are not the notifier's to fill in, and are
therefore not in the table above:

| Field | Type | Note |
|---|---|---|
| `source` | string, ≤120 | which page the notice came from, for the server log |
| `lang` | string, ≤8 | the language the acknowledgement letter is written in |

`brand` used to be sent as well. It named the storefront, and it stopped
deciding anything the day the tenant came from the key instead — it is no longer
sent and no longer read.

**Every text field is bounded, and the bound is a refusal rather than a trim** —
except where a trim is harmless. The numbers, so that a form built against this
document does not discover them by having its text cut in half:

| Field | Limit |
|---|---|
| `reason_text` | 4000 |
| `notifier_name` | 200 |
| `target_id` | 400 accepted, and anything over 200 is not used to look the content up — a truncated identifier finds nothing, and "found nothing" would be recorded as "the content was already gone" |
| `facts` (Art. 17) | 4000 |
| `ground_text` (Art. 17) | 2000 |
| `recipient_identity` (Art. 17) | 200 |

There are no further free fields. The notifier does not pick an offence category
from a list: any list would be incomplete, and a wrongly chosen category hinders
the examination more than its absence would.

**The reasoning is mandatory.** An empty notice creates no "actual knowledge"
under Art. 16(3) and gives nothing to examine. The form does not submit without it.

**The form says something about chat specifically, and it is not decoration.**
Choosing "in a chat" reveals a warning: a conversation is stored nowhere, us
included, so a description in one's own words will not be enough — **the quote
has to be pasted from your own device**, and it will be the only copy.

A permanent notice would be wrong here: a warning shown to everyone about a case
that applies to one kind in four stops being read. It appears with the choice and
goes away when the choice changes.

Without it there was a quiet trap: a person describes the situation and there is
nothing to examine — while Article 16 still obliges us to examine it and answer
with reasons.

## 4. The snapshot

On **creation** of a notice, before any examination:

    if the target still exists → store a snapshot:
        phrase  id, text, mode, created_at, author_identity
        offer   id, offer_text, discount_value, conditions, published_at, venue_id
        line    id, text, created_at, author_identity, table_id
        (names per chat_EN.md §8.3 and offers/SPEC_EN.md §3; a test holds them there)
    if the target already expired → snapshot = null, snapshot_state = target_gone

The state of the snapshot lives in **its own column**, not in `status`. This is
what migration `006` fixed: while "there is no snapshot" was a status value, such
notices never reached the moderator's queue (`WHERE status IN
('received','in_review')`) and were never examined at all — contrary to Art. 16.
`status` answers "what did we decide", `snapshot_state` answers "did we manage to
take a copy", and the two must not be mixed.

**The table was added on 2026-08-28 — a consequence, not a new decision.** The
table was introduced on 2026-08-27 (screen 19 of the storefronts), and speech at
it is **public**: lines go through the same moderation queue as the feed, and the
node sees both the board and the text, because the conversation key does not
extend to a table. Public content has to have an Article 16 path — otherwise a
notice about an unlawful line would land in `other`, which has neither a target
nor a snapshot shape. What is captured is the **line**, not the whole table: it is
the text that can be unlawful, not the game, and capturing the board would mean
keeping someone's match for a year.

**The area is not copied into a snapshot.** A notice asks whether a text is
illegal, and the text is what answers; where the phrase was shown has no bearing
on that, while a snapshot is kept for a year. Copying coordinates would mean
keeping a year of people's locations for nothing.

**A failed query is `not_accessible`, not "no copy was needed".** If the table
exists but the `SELECT` breaks — a renamed column, a changed schema — the old code
returned `received` with an empty snapshot, filing the notice as though a copy had
never been required. That case now logs an error and tells the notifier plainly
that we could not look.

The snapshot is held inside the notice record. There is no separate table of
"retained messages": a snapshot does not outlive its notice and is used for
nothing else.

The legal basis is compliance with a legal obligation (Art. 6(1)(c) GDPR), not
consent. Retention: one year, together with the notice.

## 5. Lifecycle

    received → confirmation to the notifier (automatic, immediate)
        │
        ├─ snapshot_state = target_gone ───┐  no copy, but the notice stays
        │                                  ├─ in the queue and is examined
        ├─ snapshot_state = not_accessible ┘  by a human all the same
        │
        └─ examined by a human
               │
               ├─ well-founded ────► restriction + statement of reasons ──► reply to notifier
               └─ unfounded ───────► content stays ──► reply to notifier with the reason

Timing:

| Step | Deadline | Basis |
|---|---|---|
| Confirmation of receipt | immediate, automatic | Art. 16(4) |
| Decision and reply to the notifier | target: 72 hours | Art. 16(5), "without undue delay" |
| Threat to life or safety | immediately, ahead of the ordinary flow | Art. 18 |

The 72 hours are an internal target, not a promise in the Terms: a promised
deadline that one person cannot hold through a holiday is worse than no deadline.

### 5.1. The exception for offences against children

Where a notice concerns child sexual exploitation, the notifier's name and email
are **not required** (Art. 16(2)(c)).

This is implemented not as a separate form but by leaving those fields optional
**for everyone**, with a line beside them: "if your report concerns the sexual
abuse of children, leave the name and email empty". The node never requires them
under any circumstance (`routes/report.ts`).

That is deliberate. A separate path would have a person label their own notice
"this is about children" before writing a word, choosing it on the screen where
mistakes are easiest. And refusing a notice over a missing name is precisely what
Art. 16(2)(c) does not allow — so nothing is mandatory anywhere, ordinary cases
included. The price is stated plainly: some notices arrive with no return
address, and there is nobody to answer under Art. 16(4). Such a notice jumps the queue and is accompanied by a report to law
enforcement under Art. 18.

### 5.2. A notice about chat content

A chat is not stored on the server, is not moderated and is **encrypted** with a key
we do not hold (`chat_EN.md` §8.13) — there is nothing to
execute a removal against. The reply to the notifier says so plainly: chat
content is unreachable for us, so we cannot examine it. What we do instead:

- take measures **against the account** where independent grounds exist (other
  notices, behaviour in the feed);
- explain that the notifier still holds the conversation and that it is evidence
  for law enforcement;
- act under Art. 18 where life is threatened, regardless of our inability to check.

Refusing to examine without an explanation is forbidden: a reply is always owed.

### 5.2a. Advertising: Article 26 and why it may not apply here

**Recorded 2026-08-29, and this is not a lawyer's conclusion.** Until that day
there was no section at all, although the product has exactly one form of
advertising — the neighbourhood offer — and a blank where the article should be
reads as an oversight rather than a decision.

**First reading — the article does not apply.** The Regulation ties advertising
to **remuneration for promotion**: an advertisement is information placed in
return for payment specifically for promoting it. Our placement is free, with no
money and no barter of any kind (`xor.ad/docs/offers/SPEC_EN.md`), and by the
letter of the definition an offer falls outside it.

**Second reading — it applies in substance.** An offer looks like advertising,
works like advertising and is commercial by design. Leaning on the fact that we
take no money is a defence that holds exactly until somebody tests it.

**What we do regardless of which reading is right:**

- an offer is **labelled with the word "offer"** and the discount amount right on
  the card — not with a frame and not with an icon, because a venue's icon reads
  as a neighbour's avatar, which is advertising disguised as a person (screen 17);
- **whose it is, is visible**: the venue's name on the card, verified by an
  envelope sent to its physical address;
- **there are no targeting parameters** — placement is decided by location, not
  behaviour, which is also what §5.3 records about Article 28(2);
- **paid placement does not exist**, so "who paid" has no answer by construction
  rather than by omission.

**What is left for a lawyer:** which reading is right, and whether a separate
advertising repository under Article 39 is needed (it is required of very large
platforms, which we are not, but it hangs on the same definition).

### 5.3. Protection of minors (Article 28)

The platform is accessible to children, so an Article 28 measure is required. We
claim exactly what we do, with no promises we do not keep:

- **Age bands.** Age is asked before the feed and cuts what the feed returns, and
  it is checked not only in the feed query but on the like and at the moment of a
  match — otherwise editing an age after the fact would empty the band of
  meaning. The rule is symmetric: if I cannot see you, you cannot see me.

  **The wording was corrected 2026-08-21: it claimed more than the construction
  does.** It used to read "an adult is never shown anyone under 18, and for a
  minor the top of the range never reaches adults". By the rule in `chat_EN.md`
  the bands meet at the edges within ±2 years: a 19- or 20-year-old can see a
  21–22-year-old, and an 18-year-old sits in the teenage pool and sees
  16-year-olds. What can be shown to be true: **a person in the adult pool (21
  and over) is never shown anyone under 19**, and everyone below 19 is cut off
  from 21+ entirely. The break is synchronous on both sides, with no one-way
  holes.
- **No profiling for what is shown.** Article 28(2) forbids advertising based on
  profiling a minor. We do no profiling at all: both the feed and the offers are
  decided by place rather than behaviour — the prohibition is met by the absence
  of the mechanism, not by a setting.
- **Explicit content is refused for everyone.** No switch turns it on, so there
  is nothing to circumvent.
- **The door to a conversation opens only on mutuality.** A stranger cannot
  write first: it takes a mutual like and both people's consent.

**What we do not do, and why.** Age is self-declared: we ask for no documents,
scan no faces, query no databases. Article 28(3) says plainly that the measure
need not require additional personal data — and verifying age would mean
collecting documents from children in order to protect them. For a service
without accounts that is a losing trade, and it is named here rather than
hidden.

Hence the honest wording: the bands separate teenagers from adults as far as it
is possible **without documents**. Self-declaration can be circumvented, and we
know it.

**The queue is bounded by the reader's brand.** A tenant's operator sees the
notices of their own face and no others; the platform sees all of them. Deciding
a notice checks the same thing: somebody else's answers `404` rather than `403` —
whether another brand has a notice with this id is not this brand's business.

**An unattributed notice (`brand IS NULL`) stays with the platform.** It arrived
without a usable key, so which face it concerns is precisely what nobody knows,
and handing it over on a guess would be worse than holding it.

**`acknowledged_at` is written only when a letter actually left.** Not on insert.
It used to be set unconditionally, so every notice claimed that the Article 16(4)
confirmation had been sent — including the ones with no address to send it to. In
the `POST /report` response, `acknowledged` meant `Boolean(email)` — "an address
was supplied" — under a name that reads as "the duty was discharged". For our own
form the difference never showed; for anyone else's client it is a trap, and for
an inspector reading the row it was simply untrue.

Both now state the fact: a letter went, the mark is there; it did not, and it is
not. An empty `acknowledged_at` next to a non-empty address reads as **an
outstanding duty**, which is correct — nothing retries the send, so such rows
should be visible rather than painted over.

## 6. The reply to the notifier (Art. 16(5))

Contains:

- what was decided: removed / kept / the content was already gone / unreachable;
- why — briefly and to the point;
- **whether automated means were used.** Here a human takes the decision on the
  notice; automated means were applied only to publication (the pre-publication
  check, including AI models). We state that distinction explicitly;
- the redress routes: reply to us, the Digital Services Coordinator, the courts
  (README §7).

## 7. The statement of reasons to the author (Art. 17)

Sent **every time** content is restricted — whether on a notice or on our own
initiative — where the author's electronic contact is known.

Mandatory elements (Art. 17(3)):

| Element | How we fill it |
|---|---|
| What was done | removed / hidden / offer taken down / access restricted, and for how long |
| Facts and circumstances | on a notice, or on our own initiative |
| Identity of the notifier | **not disclosed** — disclosure only where strictly necessary |
| Automated means | whether used, and at which step |
| Legal ground | if the content is illegal: which rule, and why |
| Contractual ground | if the Terms were breached: which clause, and why |
| Redress | reply to us, the Coordinator, the courts |

**A note on identity.** `offers/SPEC_EN.md` forbids disclosing the identity of
someone complaining about an offer under any circumstances. Art. 17(3)(b) permits
disclosure "where strictly necessary". There is no conflict: the product's rule
is stricter than the law, and we keep the stricter one — a notifier's identity is
never shown to the author.

**Where the author has no contact** — the identity lives in a browser and there
may be no email — the statement is shown inside the application at the next entry
from that identity. Art. 17(2) requires a statement only where the contact is
known, but silent removal contradicts the "a refusal is explained" principle of
the feed mechanic.

## 8. Entities

    notice
        id
        target_kind             # feed_message | offer | table_line | chat | other
        target_id
        snapshot                # null if the content was already gone
        reason_text
        notifier_name           # null for the §5.1 case
        notifier_email          # null for the §5.1 case
        bona_fide               # boolean, must be true
        status                  # received | in_review | upheld | rejected
        snapshot_state          # received | target_gone | not_accessible
        brand                   # which face it came through
        automated_used          # boolean, for the Art. 16(6) reply
        created_at
        acknowledged_at
        decided_at

    statement_of_reasons
        id
        notice_id               # null where the restriction was on our own initiative
        target_id
        recipient_identity
        restriction             # removed | hidden | offer_taken_down | access_restricted
        facts
        ground_kind             # legal | contractual
        ground_text
        automated_used
        delivered_at            # null until delivered
        created_at

## 9. Retention

| What | Period | Then |
|---|---|---|
| Notice and snapshot | 1 year | deleted, an anonymous counter remains |
| Statement of reasons | 1 year | deleted |
| Notifier's name and email | with the notice | deleted |

The year is not arbitrary: complaints about offers live exactly as long
(`offers/SPEC_EN.md`, §13), and keeping two different periods for records of the
same kind serves nothing. Beyond a year the record is needed neither to establish
a pattern nor to defend the decision.

All of this **must reach the privacy policy** — otherwise processing of personal
data appears that the policy does not mention.

## 10. What is not built

Considered and rejected. Do not add without revisiting the decision:

- **An internal complaint-handling system (Art. 20)** — lifted by Art. 19, and
  building it would promise a procedure one person cannot sustain.
- **Out-of-court dispute settlement (Art. 21)** — lifted by Art. 19; the body is
  chosen by the complainant, and all that is asked of us is not to obstruct.
- **Submission of decisions to the Commission's database (Art. 24(5))** —
  Section 3, lifted.
- **Trusted flaggers (Art. 22)** — lifted; we introduce no priority by source,
  every notice is examined the same way.
- **A separate offence taxonomy in the form** — see §3.
- **Public statistics on notices** — Art. 15 reports are lifted by paragraph 2 of
  that article, and voluntarily publishing figures for one or two cases a year is
  uninformative and easily re-identifies the people involved.

## 11. Open parameters

- The wording of refusal reasons — shared with the feed mechanic, where it is
  not written either.
- Whether authorities need a separate submission route, or the support address
  is enough.
