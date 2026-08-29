# Offers: a specification for implementation

The exact mechanics of offer posts. This document is meant for development: everything written
here gets built as written; anything not here does not get built.

The reasons behind the decisions are in [README_EN.md](README_EN.md). Here, only the mechanics.

## 1. Terms

| Term | Meaning |
|---|---|
| **Offer** | A post with a mandatory discount. The only form of advertising in the product |
| **Advertiser** | An account with an email: the person who runs venues |
| **Venue** | A place with an address. One account may hold several, each with its own verification |
| **Private author** | An ordinary user. No profile, no verification. Their offer is a phrase in the feed with a non-empty discount (`chat_EN.md` §8.3), not a separate record |
| **Conditions** | A separate field holding the limits on a discount. Empty = no limits |

## 2. Roles and rights

| | Business | Private author |
|---|---|---|
| Sign-in | **An account with an email** | As for everyone: an identity on the device |
| Permanent profile | Yes | No |
| Verification | An envelope with a code to the address of **each venue** | No |
| Publication | Straight into the feed | Straight into the feed |
| Text, discount, conditions | Yes | Yes |
| **External link** | **Yes** | **No** |
| **Promo code** | **Yes** | **No** |
| Venue name | Yes | No |
| **A path into chat from the offer** | **No** | **Yes — a like creates a request at once** |
| The button in the feed | "Save" | A like, as on an ordinary post |
| Live offers at a time | No limit | `PRIVATE_ACTIVE_OFFERS` |
| The "Show again" button | Yes | Yes |
| Consequence of complaints | The offer is hidden; systematically — `suspended` for the **venue** | The offer is hidden |

**The rights differ, and that is a decision.** This used to say "there is no difference in
publication rights between the roles". It did not survive a simple question: why wait a week
for an envelope when a link can be posted anonymously in a minute. Verification by paper letter
to a physical address is the only thing that makes abuse expensive, and it is devalued the
moment the same rights are handed out without it.

The split is symmetrical, and both halves are worth reading together: **the business gets a way
out, the neighbour gets a conversation inside**. A venue may attach a link and a promo code
because behind its address there is an envelope and a person answering by name; a neighbour gets
a like and a chat because behind them there is an identity you can talk to. Each is given what
they are able to stand behind.

**A like on a private offer creates a match immediately**, without waiting for one in return
(`chat_EN.md` §8.5). The ordinary rule of mutuality breaks against its own meaning here: to
collect the stools you would have to wait for the person giving them away to like some phrase of
yours. From there it is an ordinary match with double consent: the author of the offer may
decline.

**A business offer has no human author, so there is nowhere to open a chat from it.** No
identity, no key and no second side of a conversation stands behind an `advertiser` — a match
with it is impossible by construction, not by product decision. So it carries no like: a button
that leads nowhere teaches people not to press buttons. In its place, **"Save"** — the offer
goes into a local list on the device, exactly as already done with copied promo codes (section
9). Nothing appears on the server: neither who saved it nor how many times.

The venue is shown no save counter. It would be an unverifiable number under free placement —
the very thing section 2.1 avoids deliberately.

**An advertiser signs in by email, which is an exception to the general identity model.**
Everywhere else in the product an identity lives on one device, moves off it with a code and is
restored with a paper code the person keeps themselves (`chat_EN.md` §8.2); an advertiser's
profile cannot live that way: it survives a change of phone, has to work for several staff of a
venue at once, and the code from the envelope lives 30 days. Hence the magic-link sign-in by
email, and it is the single place in the product where we know a person's address. Named as an
exception outright, so that it does not look like a retreat from the promise.

**The one-live-session rule does not extend to the cabinet.** It protects a neighbour's
identity, which has neither an email nor support, and its price is a conversation that cannot be
read on two screens. Neither premise holds for an advertiser: there is an email, there is no
conversation, and the bakery and its manager are two people behind one profile. The two models
must not be mixed, and it is said here so that nobody "brings the cabinet into line" with §8.2.

**An offer is a separate object, not a kind of post.** It has its own quota in the feed, its own
complaints (section 10) and its own moderation rules. The mechanics of an ordinary post do not
apply to it by default: where a rule is shared, that is said explicitly.

## 2.1. The advertising cabinet — a folder in the storefront's repository

**The cabinet lives next to the landing page, in its brand's repository, and opens at a path on
the same domain:**

    sosed.place/adv        code in sosed.place/adv/
    neighbro.place/adv     code in neighbro.place/adv/

No new repository appears, and no new zone or certificate either — a path on a domain that
already works. Each storefront's face is its own, the same as its landing page: its own
geometry, its own fonts, its own tone. A Cypriot bakery enters the sosed cabinet and sees
sosed, not a generic administrative interface.

**A shared domain means shared browser storage, and that is fenced off by a rule.** The cabinet
and the neighbour's application live on one origin, so technically the cabinet could read the
neighbour's UID sitting there. Forbidden: the cabinet **neither reads nor writes anything from
the neighbour's storage**, and keeps its own under its own key prefix. A neighbour's identity
and an advertiser's account are never linked, in either direction — including when the baker
and the neighbour are one person on one phone.

**The backend is shared.** The cabinet talks to the same relay as everything else and uses the
same authorisation and the same roles (`relay/node/src/access/roles.ts`). Magic-link sign-in,
rights, separation by brand — all of it is already built and working; no second rights system is
introduced alongside.

**Entry by link only.** The cabinet opens neither from the feed nor from the landing page: there
is no visible door. The link arrives at the confirmed email — at registration and then at every
sign-in.

Why no visible door: a neighbour should not stumble into an advertising interface while walking
around the product, and an advertiser arrives by invitation or by their own application, and is
sent the link. A side benefit is that the cabinet is not indexed and collects no passers-by.

**The naming is honest on both sides:** a neighbour sees "an offer from the bakery", and
whoever places it enters an **advertising cabinet**. We do not hide from the advertiser what
they are doing; the word "advertising" is nevertheless not stamped on the card in the feed
(section 11.1).

### The role

A new `advertiser` role in the same flat list as the others. The rights are narrow and listed in
full — as for every role, so that a role's whole power can be read in one place:

    advertiser: [
      "venues.read",        # own venues, sees nobody else's
      "venues.write",       # create a venue, order an envelope, enter the code
      "offers.read",        # own offers, sees nobody else's
      "offers.write",       # create, repeat
      "offer_complaints.read",   # complaints about own offers
      "offer_complaints.respond",
    ]

No logs, no users, no keys, no waitlist. The role sees **only its own**: the query is always
bounded by the account's own profile, not merely by menu items — hiding sections in the
interface while leaving the data reachable is not enough.

**The email is confirmed at registration** — until it is, neither an envelope can be ordered nor
an offer published. The first and cheapest barrier: it filters out idle applications before we
spend money on a letter.

### Security

Entry by link is the only door, so all of the protection rests on it.

**The link is single-use and short-lived.** Fifteen minutes, extinguished on first use. A link
that can be used twice is a password sitting in a mailbox and in a mail provider's logs.

**The link does not work in someone else's browser.** Half the secret is issued at request time
and stays in the requesting browser; the sign-in completes only there. A letter that fell into
the wrong hands grants no entry by itself.

**Rate limiting on link requests** — by address and by requester address: otherwise a stream of
letters can be aimed at someone else's mailbox, and we would be paying for it too. The refusal
does not reveal whether such an account exists: "if the address is registered, the letter has
been sent" — and nothing more.

**The code from the envelope is not four digits.** It lives 30 days, so guessing has plenty of
time; hence generous length, counted attempts, and after a few wrong ones the code is
extinguished and a new envelope is needed. Better an honest person writes to us than a stranger
guesses it.

**The session is a cookie with `HttpOnly`, `Secure`, `SameSite=Lax` and `Path=/adv`.**
`HttpOnly` because the domain is shared with the neighbour's application: no script on the page
should be able to read an advertiser's session at all, not even our own. `Path` narrows the
scope, but relying on it alone is wrong — it limits sending, not access.

**Every request checks ownership, not only the role.** The role says "may read offers", but the
query is always bounded by the account's own profile. Rights without an ownership check hand
someone else's data to anyone who puts someone else's identifier in the URL.

**Destructive actions need confirmation.** Changing a venue's address means re-verification;
changing the email means confirmation on both, the old one and the new one. Otherwise a hijacked
session quietly walks off with the whole profile.

**Our own captcha instead of somebody else's.** The link request form needs a barrier against
brute force, but dragging Cloudflare Turnstile into the cabinet for it is unnecessary: rate
limiting and a delay on the node are enough. There is not one external service in the cabinet —
no fonts from other people's addresses, no counters, no widgets.

**An action log.** Sign-in, publication, a reply to a complaint, an address change — into the
panel's shared audit log, which already exists and is already pruned (365 days). Without the
text of complaints and without the content of offers: the log answers "who did what", it does
not keep a copy of the product.

### The section's screens

| Screen | What it does |
|---|---|
| Venues | the list of places, add a place, the status of each |
| Verification | request an envelope for the chosen venue, status, enter the code |
| New offer | the form: text, discount, conditions, promo code, link |
| My offers | live and expired ones, the "Show again" button |
| Complaints | the text and date of a complaint, a reply field |

**Complaints are visible here and to the administrator, nowhere else.** They never appear in the
feed or in the neighbour's application — there are no public reviews and no ratings in the
product (section 14).

Of numbers, **only what we know for certain** is shown: the number of link click-throughs
(`redirect_hits`) and the number of complaints. Both exist unavoidably, and neither requires a
new promise or new collection. There are no impressions, no reach and no "how many came": an
unverifiable number under free placement produces nothing but argument.

**Which name it opens under** is a deployment question, not a design one. One build can be
served both on a storefront subdomain and inside the panel; the rights model is unaffected.

## 3. Entities

### advertiser

    id
    email                   string, required — magic-link sign-in
    email_confirmed_at      nullable — until confirmed, no envelope and no offer
    contact                 string, required — who to talk to
    created_at

The account publishes nothing by itself: it only owns venues.

### venue

    id
    advertiser_id
    name                    string, required — "The coffee shop on Makariou"
    address                 string, required — the envelope goes here
    verification_status     enum: unverified | verified | suspended
    verified_at             nullable
    created_at

**One account, several venues, each with its own verification.** One person runs a coffee shop
on Makariou and a coffee shop in Larnaca: one email, different addresses, different parts of the
feed.

**Verification lives on the venue rather than on the account, and that is the point of this
entity.** Otherwise one delivered envelope would open publication under any address typed in
later — the barrier would be bypassed by adding a line to a form. Every address is proved by its
own envelope, delivered to exactly that address.

Only a venue in `verified` status may publish offers. `suspended` belongs to the venue too: one
place collected complaints, the others keep working.

### offer

Only **venue offers** live here. A private offer is not a separate entity: it is a
`feed_messages` row with non-empty `discount_value` and `conditions` (`chat_EN.md` §8.3), and
the whole mechanics of a post — geography, lifetime, likes, matching, chat — comes to it for
free. A second table for it would mean teaching likes, matching and complaints to work with two
different objects for the sake of a row half of whose columns are always empty.

    id
    brand                   whose storefront — every lookup is scoped by it
    venue_id                the venue it is published on behalf of
    offer_text              string, required
    discount_value          string, required — free text: "−20%", "1+1", "second coffee free"
    conditions              string, nullable, ≤128 — "first 10 to sign up", "while stocks last"
    promo_code              string, nullable — an external system's code, not ours
    external_url            url, nullable — never shown to people, see 6.2
    redirect_code           string — what is visible in the feed: <storefront domain>/o/<code>
    redirect_disabled_at    nullable — the link is extinguished, the offer stays
    redirect_hits           integer — a counter, tied to no person
    last_checked_at         when the target was last checked
    repeated_from_offer_id  nullable — if created by "Show again"
    discount_until          timestamptz, required — the moment the discount stops being valid
    status                  enum: active | expired | hidden
    published_at
    expires_at              the card's life in the feed (4:20), not the discount's term

Field rules:

- `discount_value` cannot be empty — without it publication is impossible
- `discount_until` cannot be empty either (decided 2026-08-29): a discount has an
  end date and time, and eternal discounts do not exist. It is a separate value
  from `expires_at`: **the card lives 4:20 in the feed, the discount lives until
  its own term** — two different things that used to be one
- `discount_until` no further than **90 days** from publication. The number is
  chosen rather than measured: a saved card is a promise the business is obliged
  to keep, and three months is the longest such promise worth binding anyone to.
  Longer than that means "show again" with a new date
- an empty `conditions` means the discount has no limits and cannot be refused
- `external_url` is the only place in the product where a link is allowed, and it exists only
  for venues
- `promo_code` is likewise venues only: a private author has no external system where a code
  means anything
- a private author fills in exactly the text, `discount_value` and `conditions` — their phrase
  in the feed simply has no other fields

### 3.1. Conditions: the only place a discount is limited

**The term is the one limit with a field of its own (edit of 2026-08-29).** This
used to say that **everything** lives in `conditions`; with `discount_until` that
is no longer true, and the reason is not tidiness but that a term does not work
as free text: you cannot render it as "expires in two hours", cannot grey out a
saved card with it, and cannot tell "until Friday" from "until Friday next week"
without parsing prose in seventeen languages.

**Everything else that limits a discount lives in `conditions`.** Not in the offer's
text, not in the staff's heads, not in code. This rule replaces any limit
mechanics — redemption counters, quotas, reservations, statuses — and that is
exactly why none of them appear in §14.

**Empty means unlimited, and it cannot be refused.** The absence of conditions is
a statement, not a silence.

**Availability is a condition too.** If you expect to run out, write "while
stocks last". If you did not, you promised everyone who comes **before
`discount_until`** (edit of 2026-08-29; [retired] this used to say "within the
offer's 4:20 of life" — once the discount gained a term of its own that stopped
being true, and in the direction that costs the business more: the card leaves
the feed after 4:20, a saved one lives on). The rule is deliberately strict: a person must learn about a limit **before
setting off**, not at the counter. A venue is burned by this once and writes it
thereafter.

**Conditions are 128 characters**, the same as a phrase in the feed. The limit is
not about space in a database: a wall of fine print is precisely the "deceiving
announcement" section 10 was written against. If the limits do not fit on one
line, this is not a discount for neighbours.

**A published offer is not editable.** Not the text, not the discount, not the
conditions. Otherwise a venue that receives a complaint adds a condition after
the fact — the complaint stops being justified and the examination turns into an
argument about what was there yesterday. To change anything, press "Show again"
(section 8): a **new** offer is created and the old one stays exactly as people
read it.

Hence a rule of examination that extends 10.2: **the announcement is read as
published**, empty conditions included. "What we meant" carries no weight — what
was meant is what was written.

### offer_complaint

    id
    offer_id
    user_id                 who complained
    notifier_email          string, required — the only way to reply (10.2)
    text                    string, nullable
    status                  enum: pending | resolved | rejected
    counts_towards_autohide bool — false if the user is over the monthly limit
    created_at

### business_response

    id
    offer_complaint_id
    text
    created_at

## 4. Constants

| Constant | Value | Comment |
|---|---|---|
| `OFFER_LIFETIME` | Equal to an ordinary post's lifetime | Fixed by the system; the author does not choose |
| `FEED_OFFER_QUOTA` | 1 offer per 10 ordinary posts | Systemic, not configurable by the advertiser |
| `AUTOHIDE_COMPLAINTS` | 3 | Complaints from **different** users |
| `COMPLAINT_MONTHLY_LIMIT` | 5 | Per user |
| `ACTIVATION_CODE_TTL` | 30 days | The lifetime of the code from the letter |
| ~~`COMPLAINT_RETENTION`~~ | — | Removed 2026-08-10: complaints have no period of their own, they share the profile's (§13) |
| `PRIVATE_ACTIVE_OFFERS` | 1 | Live offers per identity at a time |
| `COMPLAINT_EXAMINATION_HOURS` | 24 | The examination period for a hidden offer |
| `SUSPEND_RESOLVED_COUNT` | 3 | Justified complaints on different offers before suspension |
| `SUSPEND_WINDOW_DAYS` | 90 | The window they are counted in |

A business's publication rate is **not limited** — an offer is published like an ordinary post,
and `FEED_OFFER_QUOTA` is what regulates the load on the feed.

A private author does have a limit: `PRIVATE_ACTIVE_OFFERS`. For a venue, abuse is answered for
by a profile that can be suspended; behind an anonymous identity there is nothing, and without a
limit it turns into a free broadcast channel.

## 5. The life of an offer

    created → active ──── OFFER_LIFETIME expired ────► expired

**A private offer also disappears when its author steps away — added 2026-08-28**
(screen 20 of the storefronts, decided 2026-08-27). Leaving "for 20 minutes, an
hour, or until morning" deletes the person's live phrases, and their offer is a
phrase with a non-empty discount. A venue offer is untouched: there is no person
behind it who could step away.
                │
                └──── 3 complaints from different people ───► hidden → examined within a day
                                                                 │
                                       complaints rejected ──────┴──► active (if time is left)

- `active` — visible in the feed, counts towards the quota
- `expired` — gone naturally, cannot be brought back, only "Show again"
- `hidden` — hidden automatically on complaints, awaiting examination

Automatic hiding touches **the offer only**. Neither the account nor the venue changes.

## 6. Publication

1. The author fills in the form: text, discount (required), conditions, promo code, link
2. The automatic checks (section 6.1). Failed — the offer is not published and the author is
   shown why
3. The offer is published **immediately and in full**, link included, with no pre-moderation,
   for both roles
4. `expires_at` = `published_at` + `OFFER_LIFETIME`
5. Moderation happens after the fact: on complaints and by sampling

There is no manual queue for checking links. There are no author trust levels.

### 6.1. Automatic checks at publication

Performed instantly, with no person involved:

| Check | Action when it fires |
|---|---|
| Stop-words for forbidden categories (section 12) | Publication refused |
| `external_url` on reputation lists of phishing and malicious domains | Publication refused |
| `external_url` is a link shortener (bit.ly and any equivalent) | Publication refused |
| The text duplicates an offer the same author published before | Publication refused |
| The identity already has `PRIVATE_ACTIVE_OFFERS` live phrases with a discount | Publication refused |

The checks on publishing a phrase with a discount are performed by the **node**, on the same
path as an ordinary phrase: stop-words, duplicates and the limit. A private author has no link
and no promo code not because of a check but because those fields do not exist in
`feed_messages` — there is nowhere to send them past the form.

**The ban on shorteners is mandatory** and not open to softening: a shortener hides the real
domain and devalues both the list check and the interstitial in section 6.2.

### 6.2. The link goes through our own redirect

**The external address is never shown directly in an offer.** The link looks like
`sosed.place/o/<code>` or `neighbro.place/o/<code>` — **on the domain of the storefront the
person is currently on** — and leads to our node, which sends them onward. The gateway domain
`xor.ad` never appears in the feed: it is internal, and an unfamiliar name in a link looks
suspicious in itself.

The reason for the redirect at all: pre-moderation checks a string, but a redirect is what runs
— an approved `ourcafe.cy` returns a 302 to anywhere tomorrow. A check at the moment of
publication is worth nothing if the target changes after it.

What it buys: **any link can be extinguished instantly**, without deleting the offer and without
waiting for an examination. Two complaints from the interstitial are enough, and the
extinguishing happens by itself (section 10.1).

**Only the number of click-throughs per offer is counted.** Not who went, not when, not from
what address — a counter and nothing else. We keep the ability to extinguish; no knowledge about
a person appears.

**The target is checked at publication and periodically** while the offer lives. Not on every
click: that means a delay before the jump and a request to someone else's site from our address
on every press.

What we deliberately do **not** care about: the site can recognise our address and show the
checker one thing and people another. Countering that needs checks from varied addresses, paid
proxies and an extra handler — work against a threat that does not exist at fifty venues in one
district. The attack requires an envelope to a physical address and a week of waiting for the
sake of a link that lives a couple of hours; posting phishing anywhere else is easier. Come back
to this if a first real case happens.

### 6.3. The interstitial

Shown **always, to everyone, on every jump**. There is no exception for a verified advertiser —
exceptions teach people not to read the screen.

    You are leaving neighbro

        example-shop.com

    This is the offer author's link.
    We have not checked it.

    [ Continue ]   [ Cancel ]
                   [ Report this link ]

Mandatory elements:

- **the full domain, large** — the only thing that actually hinders phishing
- the wording "we have not checked it", **not** "we accept no liability": the second sounds like
  a brush-off and works worse
- a button to report the link right here — a cheap source of phishing signals, separate from
  complaints about a discount

The interstitial is **not** a legal disclaimer of liability. A platform's protection as a host
of other people's content in the EU comes from the law and from a working mechanism for
reacting to notices, not from the text of a disclaimer. The wording is to be agreed with a
lawyer.

## 7. Delivery in the feed

- An offer appears in the feed alongside posts, visually marked as an offer
- The `FEED_OFFER_QUOTA` applies: no more than 1 offer per 10 ordinary posts
- The quota is counted **over a given user's feed**, not globally
- If there is little organic content, fewer offers are shown — down to none
- The delivery zone follows the feed's general mechanics and is not described here
- A business offer's zone is its **venue's** address, not the owner's email: two coffee shops of
  one person land in two different feeds
- A business offer carries a **"Save"** button and no like; a private offer behaves like an
  ordinary post, except that a like on it creates a chat request at once (section 2)
- The quota counts **both** kinds of commercial card together — venue offers and phrases with a
  discount. Otherwise a private author walks around the limit the quota exists for
- **An offer can be liked without a live phrase of your own — edit of 2026-08-28**
  (decided 2026-08-27, `chat_EN.md` §8.4, screen 17 of the storefronts). An
  ordinary like requires the liker to have a live phrase, or no match can ever
  happen: it counts only when both sides have one. An offer's match is one-sided,
  so the argument does not apply — and the rule without the exception would cancel
  the mechanic itself: to claim the free stools you would first have to write
  something of your own
- **The language filter never hides an offer — edit of 2026-08-28** (decided
  2026-08-26, §8 of the storefront mechanics). It is the one exception to the
  filter: the bakery across the street is just as useful whatever language you
  read in, and the language filter is meant against speech you cannot read, not
  against the block you live on
- **Since 2026-08-27 the feed holds three things**, not two: a phrase, an offer and
  a **table** (screen 19 of the storefronts). What that does to the quota is a
  question of the denominator, and the value is open — see §16

## 8. Repeat placement

The **"Show again"** button is available to the author on `expired` and `hidden` offers (once
lifted).

1. The creation form opens, **pre-filled from the original offer**: text, discount, conditions,
   promo code, link
2. The author may change any field
3. On submission a **new** offer is created, with `repeated_from_offer_id` = the original's id
4. The new offer goes through the same rules as any other

There is **no** auto-repeat, no scheduling and no deferred publication. Every placement is a
separate act by the author.

## 9. Promo codes

- `promo_code` is a venue's external system code, available to businesses only. The platform
  does not issue it, does not check it and does not count redemptions
- In the interface it appears as a **"Copy code"** button
- Copied codes may be kept **locally on the device**, so they outlive the post. Nothing is kept
  on the server
- Responsibility for the code working lies with the author: announced it, must honour it

## 10. Complaints

**A complaint has one subject:** the announced discount was refused. Service quality is not a
subject.

A deceiving announcement belongs here too: there was no discount, the conditions were hidden,
"new customers only" in small print. That is a lie in text we published, and it is examined the
same way. The boundary: **we answer for the truth of the announcement, the venue for what stands
behind it.**

**A complaint about quality is rejected with an explanation.** The reply names the reason, gives
the venue's contact from the profile and points to consumer dispute resolution. Silently
accumulating such complaints as a signal against a venue is rejected: it would mean we judge
quality — secretly and with no right of reply. Examining quality would drag the platform into a
contract the Terms deliberately keep it out of (`../dsa/README_EN.md`, §6).

Rules:

- any user who saw the offer may complain; no proof of a visit is required
- complaints are **private**: visible only to the moderator and the advertiser. They are never
  displayed publicly
- the author is shown the text and the date, **without the complainant's identity and without
  the time**
- a complaint beyond `COMPLAINT_MONTHLY_LIMIT` is accepted but gets
  `counts_towards_autohide = false` and takes no part in automatic hiding
- `AUTOHIDE_COMPLAINTS` complaints from different users → the offer moves to `hidden`, examined
  within a day

The dispute:

    complaint (private) → moderator
                              ↓
        advertiser replies (private) → decision: resolved | rejected

- `resolved` — the complaint was found justified
- `rejected` — the complaint was dismissed and does not count in the author's statistics
- systematic justified complaints → `verification_status: suspended`, set by a moderator by
  hand (the threshold and window are in 10.2)

**Forbidden:** publishing complaints, letting the author delete complaints, disclosing the
complainant's identity.

### 10.2. Who settles a dispute, and by what rule

**The operator decides** — the same person who examines Article 16 notices. There is **no**
second instance inside the product, and that is said plainly, in the same words as in the DSA
letters: a venue that disagrees goes to a court or to a consumer regulator, not back to us. A
hidden "appeal" staffed by the same person is worse than an honest "there is one instance".

**Two kinds of complaint are settled differently, and that is the heart of the rule.**

| What the complainant says | What settles it |
|---|---|
| "the conditions were hidden", "there was no such discount", "new customers only in small print" | **reading the announcement** — we published the text, no witnesses needed |
| "I came and they refused me" | **nothing** — neither side has proof and neither will |

The first kind is entirely our responsibility: we answer for the truth of the announcement
(section 10). Here the operator really does establish a fact, because the fact is in the text.

The second kind is not settled by truth, and pretending an arbiter can judge who lied would be
dishonest. So the decision is taken **about the announcement, not about people**: one such
complaint is a signal to the venue and nothing more; `AUTOHIDE_COMPLAINTS` of them from
different people hide the offer. Nobody is declared a liar, and the reasons say so.

**The deadline is `COMPLAINT_EXAMINATION_HOURS`, and it is important to see what it does not
buy.** An offer lives hours while the examination takes a day: by the time a decision is made
the offer is almost always `expired`. So the examination exists for **the record and the
consequences**, not to rescue the offer. Returning to `active` is a rare side case rather than
the point of the mechanism, and no interface should be built around it.

**The complainant's email is mandatory — for a discount complaint.** Without it the complaint
does not send, and the form says why: a neighbour lives without an email, we have no separate
channel for telling a person something inside the application, and without an address there is
physically nothing to reply with. This is no retreat from the promise: an email is not needed to
use the product; it is needed to receive an answer to a request that expects one.

There is no exception here, because there is no law forbidding us to ask for an address: this is
a dispute about a discount, not an Article 16 notice.

**A complaint about a link carries no email at all** (10.1). It is not a request but a signal:
it is not shown to the author, expects no reply and works by a threshold. An input field would
turn the cheapest source of phishing signals we have into a form that few people fill in.

**What each side gets:**

```
venue         the complaint's text and date, without the identity and without the time
              the right to reply privately
              the decision with its reason

complainant   by email to the address given: the decision and its reason,
              with nothing about the venue beyond what the offer already says
```

**Systematic behaviour.** `SUSPEND_RESOLVED_COUNT` `resolved` decisions on **different** offers
within `SUSPEND_WINDOW_DAYS` → `verification_status: suspended` for the venue, set by a
moderator by hand. The window keeps a seasonal venue from accumulating sins for years; the count
keeps one failure from closing a working place. The "this is not us" button (section 11) is a
separate and instant path and has nothing to do with this counter.

### 10.1. A complaint about a link

A separate type, filed from the interstitial (6.2). How it differs from a discount complaint:

- it takes no part in `AUTOHIDE_COMPLAINTS` and does not consume `COMPLAINT_MONTHLY_LIMIT`
- it enters the moderator's queue at high priority
- **two complaints from different people are enough**, and the second extinguishes the link
  immediately and automatically: `redirect_disabled_at` is set with no person involved. The
  offer stays in the feed, but the jump no longer works.

  Why two rather than one: one would let a single irritated neighbour or a competitor take down
  an honest link with a single tap. Two independently is no longer a coincidence. The threshold
  is deliberately low: the cost of a mistake is asymmetric here — a link extinguished for
  nothing is repaired by an examination, a deceived neighbour is repaired by nothing
- it is not shown to the author

### 10.3. Complaints are not deleted on request — only by time

**Nobody can have a complaint removed: not the venue, not the moderator, not us.**
The only thing that removes a complaint is retention running out: a year from the
last offer, together with the account and its venues (section 13).

The rule is written **before the first conflict**, and that is its main property.
The moment it will be tempting to break is known in advance: the district's best
venue — the first one, brought in by hand — says "take this down or we leave".
Deciding then means deciding under pressure and in our own favour rather than by a
rule. So it is decided now, while nobody is pushing.

**What a venue can do instead of deletion:** reply privately, dispute it, and get
a decision (10.2). The reply lives beside the complaint and is seen there — that
is the provided way of not being left with someone else's word as the last one.

**A rejected complaint is not deleted either.** `rejected` means "examined and not
upheld", not "it never happened": the record stays, it simply stops counting in
the venue's statistics. Otherwise examination becomes erasure, and we lose the one
thing complaints are kept for at all — the ability to see a pattern.

**One exception, and it is about content rather than removal.** A complaint is
written by a stranger, and its text may contain a third party's personal data or
something outright illegal. The moderator then **redacts the passage** rather than
deleting the record, and the fact of redaction is stored with its date. That way
the data-protection duty is met and history is not rewritten after the fact.

## 11. Verifying a venue

It is the **venue** that is verified, not the account: one owner has several, and each goes
through this path separately.

    application for a venue (name, address) → unverified
              ↓
    a letter with an activation code to that address (TTL 30 days)
              ↓
    code entered → verified → this venue may publish

Additionally:

- **The fallback path:** a call to the venue's public phone number from an open listing
- **A "this is not us" button** for the venue → immediate `suspended` for that venue; the
  owner's other places keep working
- A change of address repeats the verification
- A photo of the sticker is **not** used as proof — an image is generated and proves nothing

The envelope contains a window sticker and a card for the staff. That is a **gift, not a duty**:
nobody has to put the sticker up, and it does not affect verification.

A private author is not verified in any way.

## 11.1. An offer is recognised by its shape, not by the word "advertising"

An offer is a commercial communication, and **being free does not exempt it**: the DSA requires
a person to understand that what they are looking at is an advertiser's proposal. The
requirement is one — recognisability — and an offer meets it by itself: the card looks different
from a neighbour's post, and it carries the venue's name and the size of the discount.

A separate "advertising" label is **deliberately absent**. It adds nothing to recognisability
and spoils the tone: the word "advertising" next to the bakery across the road sounds colder
than the thing is.

## 12. Prohibitions

An offer is refused, or hidden by a moderator, if it:

- has no `discount_value`
- promotes a stop category: the list is one for the whole product and lives in `chat_EN.md`
  §8.3. In an offer what is forbidden is the category being the **subject of the discount** —
  the venue itself is not cut out: a taverna cannot discount a glass but can discount dinner.
  There is deliberately no copy of the list here: two homes for one rule drift apart
- carries a condition that tells apart a person rather than an action (12.1)
- has an `external_url` leading to a phishing or knowingly malicious domain

There is no minimum discount. Whether an offer is token is judged by a moderator.

### 12.1. A condition may depend on what a person does — never on who they are

The rule in one line, checked with one question: **does the discount tell apart an
action or a person?**

```
allowed     time, day, place, order size, "the first ten",
            "arrived from the app", "new guests", "while stocks last"
forbidden   sex, age, origin, language, religion, health,
            family status and the like
```

**Age is forbidden outright, familiar discounts included.** A bakery may not
discount for pensioners, a coffee shop may not discount for students. That is
worth saying plainly, because such discounts are lawful, ordinary and humanly
understandable, and we still do not allow them.

The reason is what we have to work with. Telling "for pensioners, because they
have less money" from "under thirty only, because we want a younger crowd"
requires a judgement about motive, and offers are examined by one person within a
day (§10.2). A rule that demands reading motives becomes a lottery at that scale —
and the first to be hit is whoever phrased it badly, not whoever was screening
people. A simple checkable line is stricter than the law and cheaper than an
argument; this is a deliberate trade, not strictness for its own sake.

**Language is the same.** "We speak Russian, neighbours get a discount" sounds
friendly and works as a marker of origin. Writing the announcement itself in
Russian is fine and expected — the storefronts speak seventeen and ten languages
(measured on 2026-08-28 from the live sitemaps; this said "six"); **making
language a condition of the discount is not.**

**A product aimed at someone is not a condition.** A children's portion, a student
set, a Sunday breakfast are menu items, and anyone may buy them. There is one
test: **if only someone matching a characteristic can buy it, it is a condition**,
and it is forbidden.

Legal classification is left to a lawyer: the rule is written to be stricter than
any applicable law rather than to interpret it.

## 13. Privacy and retention

**One rule instead of two: the account and its venues live as long as the advertiser publishes.
A year without offers and they go, together with every complaint about them.**

A venue is kept for exactly one reason — so that an envelope need not be sent again. It holds no
ratings, no history and no metrics, and it is not meant to outlive the advertiser. Complaints
have no separate period: they exist only to decide whether complaints are systematic, and they
lose their meaning together with the profile.

A year, because a beach café publishes nothing in winter, and an envelope costs money and days.
Less, and a seasonal advertiser pays for nothing; more is justified by nothing.

- The account, venues and complaints: one year from the last offer, then deletion
- The complainant's identity is never disclosed to the author, under any circumstances
- Copied promo codes are kept only on the user's device
- The Terms must state plainly that an offer is the author's proposal, the contract arises
  between the user and the author, and the platform is not a party

## 14. What does not get built

Considered and rejected. Not to be added without revisiting the decision:

- personal redemption codes, caps on the number of discounts, slot reservations
- proof of a visit: a QR scanner, geolocation, a venue PIN, a word of the day, tear-off codes
- metrics for the author: impressions, saves, "how many came"
- public reviews, ratings, stars
- auto-repeat, schedules, deferred publication
- a minimum discount
- a photo of the sticker as proof
- pre-moderation as a mandatory stage
- author trust levels and a manual link-checking queue
- links in ordinary posts
- link shorteners in `external_url`

## 15. The risk in these decisions

Publication without pre-moderation, plus an author without verification, plus a permitted
external link, add up to **a phishing vector**: anyone can publish an offer with a link and it
reaches the feed immediately. Automatic hiding on three complaints will not fire before people
have already clicked.

The accepted defence is two layers with no person on the publication path:

1. automatic checks at publication: the domain against lists, the ban on shorteners, stop-words
   (6.1)
2. the interstitial with the full domain and a report button (6.2)

Plus a moderator's **"hide now"** tool — without waiting for three complaints, for obvious junk.

The residual risk is honest and does not go away: an inattentive person will follow the link
despite the screen. If a neighbour is defrauded through an offer, a disclaimer will not stop
them deleting the application. That is a reputational risk, and the only cure for it is the
speed of reacting to complaints.

Deliberately rejected:

- **pre-moderating everything** — an offer lives hours and would die unseen in the queue
- **fail-open on timeout** ("not reviewed within 2 hours, publish the link") — that is exactly
  what would be exploited, by publishing at night
- **trust levels and a manual link queue** — replaced by the interstitial
- **crowd moderation** with a "this is not an offer" button — trolling is cheaper than
  examination

## 16. Open parameters

Values to be confirmed in practice:

- `OFFER_LIFETIME` — tie it to an ordinary post's lifetime, a product-level value
- `FEED_OFFER_QUOTA` = 1 in 10 — check against a real feed
- `COMPLAINT_EXAMINATION_HOURS` = 24 — check in practice whether one person keeps up
- **Whether a table counts towards `FEED_OFFER_QUOTA`'s denominator** — open since
  2026-08-28. The quota holds commercial load down relative to organic content; a
  table is organic, so counting it is the natural reading, but it also outlives a
  phrase, and a single table in the feed would then open the way for one more
  card. Settled against a real feed together with the quota itself, not by
  argument
