# Neighbourhood offers

The only form of advertising in the product: a post from a local business with a mandatory
discount. Placement is free, and the discount goes to anyone who comes in and asks.

**The exact mechanics for implementation are in [SPEC_EN.md](SPEC_EN.md).** Here are the
reasons behind the decisions; there, what to build.

Related material lives in the ideas repository `panov-id/ideas`:
`20260804_in_product_ads_billing` — money and legal form,
`20260802_neighbro_place_growth` — growth.

The delivery zone (radius, geography, feed) belongs to the product's general mechanics and is
not covered here.

## 1. The point

A business publishes a proposal. The application is not a pass to a discount; it is where a
neighbour finds out what is nearby today. An offer lives hours and disappears, like everything
else in the product.

Three rules:

1. **No discount, no post.** Moderation stays objective: the question is not "is this an ad?"
   but "is there a benefit?"
2. **You wrote a discount, you must honour it.** The business's only obligation and the only
   subject of complaints
3. **Links are allowed in offers only.** Ordinary posts have none and never will, or the feed
   turns into spam within a month

## 2. Data model

    advertiser                  # the owner's account
        id
        email                   # sign-in by magic link
        contact
        created_at

    venue                       # a place with an address
        id
        advertiser_id
        name
        address                 # confirmed by an envelope sent to this address
        verification_status     # unverified | verified | suspended
        created_at

    offer                       # VENUES ONLY
        id
        venue_id
        offer_text              # "Neighbours: filter coffee €2 instead of €3"
        discount_value          # mandatory
        conditions              # "First 10 to sign up, until Friday"
        promo_code              # optional: an external system's code, not ours
        external_url            # ← links are allowed ONLY here and ONLY for businesses
        post_valid_hours        # how long the post lives in the feed
        repeated_from_offer_id  # if created by "show again"
        created_at

    offer_complaint             # PRIVATE: only the moderator and the business see it
        id
        offer_id
        user_id
        complaint_type          # discount_refused | other
        text
        status                  # pending | accepted | disputed | resolved | rejected
        created_at

    business_response
        id
        offer_complaint_id
        text
        created_at

No redemption codes, no quotas, no statistics.

**A private offer is deliberately absent from this schema.** It is not a separate entity but an
ordinary phrase in the feed with a non-empty discount (`../chat_EN.md` §8.3): geography,
lifetime, likes, matching and chat come to it for free. A second table for it would mean
teaching likes, matching and complaints to work with two objects, for the sake of a row half of
whose columns are always empty.

The account and the venue are separated deliberately: one owner has several places, and
verification belongs to the place (section 5).

## 2.5. A business and a neighbour have different rights, deliberately

There used to be no difference here: a venue and a private author could both attach an external
link and a promo code. That decision has changed — here is why.

The only real barrier in this scheme is **the envelope to a physical address**: a week of
waiting and an address that exists. It costs us money and costs the recipient time. As long as
the same rights are handed out without it, there is no barrier at all: anyone who wants a link
in the feed simply will not confirm anything.

So the rights diverged, and diverged symmetrically:

    business   →  a link outwards, a promo code, the venue's name
    neighbour  →  a like, a match, a conversation in chat

Each is given what they are able to stand behind. Behind a venue's address there is an envelope
and a person answering by name — they can be trusted to lead a neighbour to another site.
Behind a neighbour there is an identity you can talk to — the chat belongs to them.

**A like on a neighbour's offer creates a chat request straight away.** Ordinary mutuality
would be mockery here: to collect the stools you would have to wait for the person giving them
away to like some phrase of yours. An offer states its occasion in itself, and there is nothing
to coincide with — so the match is born one-sided, while double consent remains: the author may
decline to open the chat.

**A venue's offer has no human author.** That is not a product decision but a consequence of
the model: no chat identity, no key and no second side of a conversation is tied to an
`advertiser` — and tying them is forbidden, or the promise that the cabinet and a neighbour's
identity never meet would collapse. So there is physically nowhere to open a chat from such an
offer, and a like on it would be a button that leads nowhere. In its place, "Save" — into a
local list on the device, exactly as already done with promo codes.

The venue will not see a save counter: that is precisely the unverifiable number that section 6
refuses to produce for free placement.

## 3. Two kinds of offer

| | Discount on the spot | Promo code |
|---|---|---|
| Who | Cafés, bakeries, barbershops | Yoga, workshops, tickets, online booking |
| How | Come in and ask | Copy the code, use it on the business's site |
| Who issues the code | Nobody | The business itself, in its own system |
| What we build | Nothing | Nothing |

**The promo code is theirs, not ours.** We do not issue codes and do not count redemptions — we
simply show someone else's code as copyable, next to the link. The side effect is pleasant:
measurability comes back for free, because the studio sees its own code used in its own system.
We still promise nothing and count nothing.

**A conflict with ephemerality.** A post lives hours, but a promo code is needed later — for a
workshop next week. The solution without server storage: a "copy the code" button and,
optionally, a list of recently copied ones **locally on the device**. Nothing settles on the
server.

### Conditions are a separate field

> Everything that limits a discount lives in the `conditions` field

"First 10 to sign up", "until Friday", "not at weekends". A separate field rather than part of
the text: the conditions are visible at once, pre-moderation checks exactly one field, and a
dispute is settled by what is written there.

This moves the mechanics of limits out of the code and into the business's responsibility.
Empty means an unconditional discount that cannot be refused.

## 4. Repeat placement — by hand, always

An offer disappears together with the post. To show it again the business presses **"Show
again"**: a form opens **pre-filled from the previous offer** — text, discount, conditions,
promo code, link. Adjust something or leave it as it is, and send. From there the usual rules
apply (rate limit, post-moderation).

There is deliberately no auto-repeat and no scheduling. That is the price of free, and it helps
in three ways:

- a daily automatic offer would become wallpaper in the feed
- whoever is not willing to press the button drops out by themselves, leaving only the
  interested ones in the feed
- the press is a sign of life: a business that has closed stops appearing on its own, with no
  moderation and no checks

## 5. Verification

Only a `verified` venue may publish an offer. Verification is **an envelope with an activation
code sent to the venue's physical address**. The letter arrived and the code was entered — so
the place at that address exists.

A photo of the sticker is **not** used as proof: an image is generated in seconds these days
and proves nothing.

Two free reinforcements:

- **a call to the public phone number** from an open listing — a fallback if the letter never
  arrived
- **a "this is not us" button** for the venue → instant `suspended`. The real owner is the best
  forgery detector there is, and cheaper than any check

Verification here protects not money (there is none) but a venue's name from someone else
publishing under it. The cost of a mistake is low, so no fortress is required.

Parameters:

- the activation code lives 30 days, or letters lie around and codes leak
- the letter is addressed to the owner or the manager, and says outright that activation
  creates an obligation to grant the discount as announced
- an envelope costs €1–2, so about €100 for 50 businesses
- the post takes several days, so the first businesses get their code by hand
- a change of address repeats the verification
- **one owner may have several venues, and each is confirmed by its own envelope**

**The sticker is a gift, not a duty.** It exists not for control but as an offline channel:
whoever wants it puts it up. The envelope contains a sticker and a card for the staff ("we have
an offer for neighbours; the discount goes to anyone who asks"), and nothing is required.

**What this does not solve:** an employee can open the envelope and create a profile without
the owner knowing. Acceptable at the current scale — that is what the "this is not us" button
is for.

**Several places under one person is the ordinary case, not an exception.** A coffee shop on
Makariou and a coffee shop in Larnaca: one email, different addresses, different parts of the
feed. That is why the account and the venue are different entities, and verification belongs to
**the venue**.

The cheap alternative — confirm the first place by envelope and let the rest be added freely —
was rejected: one delivered envelope would then open publication from any address typed in
later, and the barrier would be bypassed by adding a line to a form. Every address is proved by
a letter that arrived at that address. It costs one more envelope per place, and that cost is
the entire point of the mechanism.

It follows that `suspended` belongs to the place: one collected complaints, the others keep
working.

## 6. No metrics for the business

Placement is free, so the platform owes nothing and promises nothing. No impressions, no saves,
no "how many came".

This is deliberate: any number that cannot be verified turns into an argument. A business that
wants to count asks at the counter — "did you see our post?" — or looks at redemptions of its
own promo code. Both are more accurate than any statistics of ours and cost not a line of code.

Internal product metrics (the share of offers in the feed, the rate of complaints) are still
needed — those are for us, not for the business.

## 7. Complaints

**Private.** The moderator and the business see them. There are no public reviews, ratings or
stars. The principle: **there is no reputation, there is admission** — a business either may
publish offers or may not.

What privacy buys: it removes the risk of defamation, devalues trolling (no audience, no
motive), rules out "delete the complaint or we leave", and preserves ephemerality.

**A complaint has one subject:** the announced discount was refused. Service quality is not a
subject; the platform does not answer for it.

**Who may complain:** anyone who saw the offer. There is no proof of a visit and there never
will be. Trolling is held back by a limit: no more than N complaints a month per user, and
beyond it the weight drops.

**The ladder of consequences:**

| Condition | What happens |
|---|---|
| Isolated complaints | A private notice to the business |
| Repeated complaints about one offer | The offer is hidden, examined within a day. The profile is untouched |
| Systematic, after examination | `suspended` — publication is closed |

The offer is hidden, not the profile: neighbours do not walk to a discount that does not exist,
and a handful of planted complaints do not kill a business outright.

**The complainant's anonymity.** The business sees the text and the date, without the identity
and without the time.

**Dispute.** The business replies privately, the moderator decides: `resolved` or `rejected`.

    User → complaint (private) → moderator
                                    ↓
                 business disputes (private) → resolved / rejected

**What is not allowed:** showing complaints publicly, letting a business delete complaints,
disclosing the complainant's identity.

## 8. What we deliberately do not build

All of this was considered and dropped — so that it is not revisited in circles.

| Mechanism | Why not |
|---|---|
| Personal redemption codes | They breed quotas, reserves, statuses and false complaints when a limit runs out |
| A redemption cap | There is nothing to cap at real volumes; it is what spawned the whole construction |
| A QR scanner in the app | The Barcode Detection API is unsupported in Safari, and the camera in a standalone PWA on iOS is restricted |
| Geolocation as proof of a visit | Standalone PWAs on iOS have known problems with the permission prompt |
| A venue PIN, a word of the day, tear-off codes | Friction for the staff for the sake of a number nobody needs when placement is free |
| Metrics for the business | An unverifiable number breeds argument; free placement creates no obligation |
| A photo of the sticker as proof | An image is generated in seconds and confirms nothing |
| A minimum discount | A threshold does not tell a sincere offer from a formal one; that is pre-moderation's job |
| Auto-repeat and scheduled offers | It turns the feed into wallpaper; a manual press also filters out dead venues |
| Public reviews and ratings | Defamation, trolling, pressure on the moderator, accumulation instead of ephemerality |
| Commission on sales, vouchers | Taking other people's money and payment regulation |
| Requiring a deep discount | It kills a local business's economics — that is what Groupon died of |
| Positioning as a "discount service" | It brings deal hunters and destroys the product's tone |

The formula: **we take the idea of a coupon, and neither its mechanics nor the coupon
company's business model.**

A reference point on Groupon: revenue peaked at $3.2bn in 2014, and by 2024 the market
capitalisation had fallen below $400m — 97% down from the IPO. The causes: a deep discount was
required plus a commission of about 50% of the already cut price, while the people who came
were "deal tourists" — fewer than 20% became repeat customers
([Pestel-analysis](https://pestel-analysis.com/blogs/growth-strategy/groupon),
[The Runway](https://www.therunway.ventures/p/groupon)).

## 9. Holes and answers

**The share of offers in the feed.** When there is little organic content, the feed becomes
advertising.
*Answer:* a systemic quota — no more than 1 offer per N ordinary posts (1 in 10 as a
reference), counted over a given user's feed. Systemic, not configurable.

**Moderation cannot keep up with a post's life.** An offer lives hours; manual moderation
within a day means it dies unseen.
*Answer:* the first 2–3 offers of a new business go through pre-moderation, after which a
`verified` venue publishes instantly with post-moderation.

**An offer as a pretext for a link.** A token discount for the sake of a channel.
*Answer:* pre-moderation of the first offers — a person decides by eye, with no threshold.
Checking the domain against phishing lists is mandatory: `verified` does not guarantee a safe
link.

**The promo code stopped working.** The limit on the business's side ran out, the code was
cancelled.
*Answer:* the same rule — you announced it, you owe it. Limits belong in `conditions`, and a
business is advised to cap redemptions in its own system rather than rely on luck.

**A screenshot of the offer travels to a city chat.** People who are not neighbours turn up.
*Answer:* not curable by mechanics, and rather a plus for the business. Whoever wants to limit
it writes "say that you are a neighbour". Not a line of code.

**The same thing every day.** An identical daily offer becomes wallpaper.
*Answer:* a rate limit per business, 2–3 times a week as a reference.

### Legal

**Who is party to the contract.** The discount was refused, and the claim comes to the
platform.
*Answer:* the Terms say plainly that an offer is the business's proposal, the contract arises
between the user and the business, and the platform is not a party. That does not remove the
duty to take down offers that are not being honoured, but it does remove liability for the
discount itself.

**Stop categories.** Alcohol, tobacco, gambling, financial services, medicine and supplements,
weapons.

**Discrimination.** "Discount for women only" breaks EU anti-discrimination law. A discount may
depend on place, never on a person's characteristics.

**GDPR.** Complaints contain text and are tied to a user. Answer: complaints are kept for a
year, after which an anonymised aggregate remains.

**DSA.** A platform with user content in the EU falls under the Digital Services Act; some
duties do not apply to micro and small enterprises — check the status before launch.

## 10. Open questions

- Who arbitrates "complaint against the business's reply", and by what rule
- The monthly complaint limit per user
- How many complaints about one offer trigger automatic hiding
- Whether to keep the list of copied promo codes locally on the device

Closed along the way: private authors **do** get offers, but without a link and without a promo
code, and no more than `PRIVATE_ACTIVE_OFFERS` live at a time (section 2.5).

## Status

A draft specification. The key decisions are taken: placement is free, there are no redemption
codes and no metrics, the discount goes to anyone, verification is a letter with a code to an
address, repeat placement is manual, and an external system's promo code is the second kind of
offer.

## Sources

- [Pestel-analysis — Groupon's strategy and decline](https://pestel-analysis.com/blogs/growth-strategy/groupon)
- [The Runway — the rise and fall of Groupon](https://www.therunway.ventures/p/groupon)
- [MagicBell — PWA limitations on iOS, 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Scanbot — the Barcode Detection API and browser support](https://scanbot.io/techblog/barcode-detection-api-tutorial/)
- [Apple Developer Forums — geolocation in a standalone PWA](https://developer.apple.com/forums/thread/694999)
