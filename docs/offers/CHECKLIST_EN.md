# Launch checklist for neighbourhood offers

Placement is free; the platform takes neither money nor barter.
Rationale: [README_EN.md](README_EN.md).

---

## 1. Rules and documents — before a line of code

- [x] 1.1. **2026-08-10.** The dispute rule is written: `SPEC_EN.md` §10.2. The operator
      decides and there is no second instance; only what is visible in the announcement's text
      is examined, while "I came and they refused me" is settled by a threshold about the
      announcement rather than about people. The deadline is `COMPLAINT_EXAMINATION_HOURS`, and
      suspension follows `SUSPEND_RESOLVED_COUNT` within `SUSPEND_WINDOW_DAYS`
- [x] 1.2. **2026-08-11.** Written: `SPEC_EN.md` §10.3 — and the wording corrected. "Never"
      contradicted the retention already published in the storefront policy, so the rule
      forbids deletion **on request**: not by the venue, not by the moderator, not by us. Only
      retention running out removes a complaint — a year from the last offer. A rejected one
      is not deleted either. There is one exception, and it is about content: a third party's
      personal data is **redacted**, the record stays
- [x] 1.3. **2026-08-11.** The stop-list is written as **one list for the whole product**:
      `../chat_EN.md` §8.3. Two regimes: in the feed only what is illegal is forbidden (a
      neighbour may invite you for a beer), in an offer it is the category being the
      **subject of the discount**. A ban by type of venue was rejected; for medicine the line
      is the promise of a therapeutic effect rather than the signboard; there will be no age
      filtering — age is self-declared
- [x] 1.4. **2026-08-11.** Written: `SPEC_EN.md` §12.1. A condition tells apart **an action,
      not a person**. Age is forbidden outright, pensioner and student discounts included —
      not because they are bad, but because telling them from "under thirty only" takes a
      judgement about motive, and one person examines offers within a day. Language cannot be
      a condition (an announcement in any language can). A product aimed at someone is not a
      condition: the test is **whether anyone may buy it**
- [x] 1.5. **2026-08-11.** The rule is written: `SPEC_EN.md` §3.1. Everything that limits a
      discount lives in `conditions`; empty means unlimited and cannot be refused;
      **availability is a condition too** ("while stocks last" must be written, or it was
      promised to everyone); the field is ≤128 characters; **a published offer is not
      edited** — changes go through "Show again" as a new one. The announcement is read as
      published
- [x] 1.6. **2026-08-05.** Terms of use: an offer is the business's proposal, the contract
      arises between the user and the business, the platform is not a party
- [x] 1.7. **2026-08-05.** Retention policy: complaints and the advertiser's profile — one
      year from the last offer, written into both storefronts' policies
- [x] 1.8. **2026-08-05.** DSA status settled: `../dsa/README_EN.md`. Micro-enterprise,
      Section 3 lifted, Arts 16–17 remain. The record of the status check is there too, §3
- [x] 1.9. **2026-08-05.** "Neither money nor barter" — in the Terms, in both faces' READMEs
      and in the community rules, in every language

## 2. Product

- [ ] 2.1. `advertiser` (email, sign-in) and `venue` (name, address, `verification_status`) —
      **two entities**. Verification belongs to the venue: one owner, several places, each
      with its own envelope
- [ ] 2.2. `offer` — **venues only**: `venue_id`, a mandatory `discount_value`, a separate
      `conditions` field, optional `promo_code` and `external_url`, `post_valid_hours`.
      A private offer has no table of its own: it is a `feed_messages` row with a non-empty
      `discount_value` (`../chat_EN.md` §8.3)
- [ ] 2.3. Links are allowed **only** in offers and **only** to businesses — enforced at the
      model level, not in the UI. The private form does not show these fields, but the node
      rejects a request carrying them past the interface all the same
- [ ] 2.3a. The `PRIVATE_ACTIVE_OFFERS` limit per identity — checked by the node
- [ ] 2.3b. A business offer has **no like and no path into chat**: instead of a like,
      "Save" into a local list on the device. Nothing appears on the server
- [ ] 2.3c. A like on a phrase with a discount creates a match **immediately**, without one
      in return; `match_participants.message_id` and `text_snapshot` become nullable for
      whoever came to the offer. Tested with a like from an identity that has no phrase of
      its own
- [ ] 2.4. **The offer quota in the feed** — no more than 1 per N ordinary posts, systemic,
      counting venue offers and phrases with a discount **together**
- [ ] 2.5. A rate limit on offers per business
- [ ] 2.6. The **"Show again"** button: a form pre-filled from the previous offer, editable.
      No auto-repeat and no schedules
- [ ] 2.7. A "copy promo code" button, and optionally a list of what was copied, held
      locally on the device rather than on the server
- [ ] 2.8. Build none of it: no redemption codes, no discount quotas, no metrics for the
      business

## 3. Verification

- [ ] 3.1. The envelope: an activation code valid for 30 days, addressed to the owner or
      the manager
- [ ] 3.2. In the letter: activation creates an obligation to grant the discount as announced
- [ ] 3.3. In the envelope, a sticker and a card for the staff — a gift, with no obligation
- [ ] 3.4. The fallback path: a call to the public phone number from an open listing
- [ ] 3.5. A "this is not us" button for the business → instant `suspended`
- [ ] 3.6. A change of address repeats the verification

## 4. Moderation and complaints

- [ ] 4.1. Publication is immediate and complete for every author; there is no pre-moderation.
      Control comes from the automatic checks, the interstitial and complaints
- [ ] 4.2. Automatic checks at publication: the domain against reputation lists, **a ban on
      link shorteners**, stop-words, duplicate text
- [ ] 4.2a. The interstitial for an external link: the full domain, "we have not checked it",
      a button to report the link. Shown to everyone, every time
- [ ] 4.2b. A moderator's "hide now" button — without waiting for three complaints
- [ ] 4.3. Complaints are private: visible only to the moderator and the business. There are
      no public reviews and no ratings
- [ ] 4.4. The only subject of a complaint is that the announced discount was refused. A
      deceiving announcement belongs here too: there was no discount, the conditions were
      hidden
- [ ] 4.4a. **A complaint about service quality is rejected with an explanation** — the reply
      template names the reason, gives the venue's contact from the profile and points to
      consumer dispute resolution. We do not accumulate them silently (`SPEC_EN.md` §10,
      `../dsa/README_EN.md` §6)
- [ ] 4.4b. **Reporting illegal content is a separate path** from the offer card, next to the
      discount complaint, leading to the Article 16 form (`../dsa/SPEC_EN.md` §2). Not to be
      confused with a complaint: different subject, different examination, a mandatory reply
- [ ] 4.5. Anyone who saw the offer may complain
- [ ] 4.6. A monthly complaint limit per user; beyond it the weight drops
- [ ] 4.7. The business sees the text and the date, without the identity and without the time
- [ ] 4.8. Automatic hiding of the **offer** (not the profile) on repeated complaints, with
      an examination within a day
- [ ] 4.9. Systematic complaints after examination → `suspended` for the **venue**, not for
      the account: one place collected complaints, the others keep working

## 5. First businesses

- [ ] 5.1. Pick 3–5 places with daily footfall (a coffee shop, a bakery, a barbershop, a
      yoga studio)
- [ ] 5.2. Visit in person and hand the activation code over directly — the post is the
      scalable option, not the starting one
- [ ] 5.3. Agree the first offer: a small discount (5–15%), nothing deep
- [ ] 5.4. For studios and events, ask for their own promo code and link
- [ ] 5.5. Say two things honestly: we give no metrics (count by your own promo code or ask
      at the counter), and repeat placement is manual — that is the price of free

## 6. Launch gate

- [ ] 6.1. The offer quota in the feed is on (2.4)
- [x] 6.2. **2026-08-10.** The dispute rule is written (1.1)
- [ ] 6.3. Verification works: the code from the letter activates a **venue**, and a second
      venue of the same owner cannot publish without its own envelope — tested by trying

## What we are not doing

- Not taking money and not taking barter
- Not building redemption codes or caps on the number of discounts
- Not giving the business metrics
- Not requiring a photo of the sticker — it proves nothing
- Not setting a minimum discount — that is pre-moderation's job
- Not building auto-repeat and schedules
- Not building public reviews, ratings and stars
- Not building a self-service cabinet: the first businesses are handled by hand
- Not showing the venue a save counter — it is the same unverifiable metric
- Not giving a private author a link and a promo code: the envelope would stop meaning
  anything
