# DSA: what applies to us, and why

Regulation (EU) 2022/2065 — the Digital Services Act. Both faces are operated by
a private individual in Limassol, Cyprus, so the place of establishment is in the
EU and the Regulation applies in full. This document works out which duties
actually land on the product, which are lifted by size, and what was decided
where the answer is arguable.

**The notice and statement-of-reasons mechanic lives in [SPEC_EN.md](./SPEC_EN.md).**
**What to build is in [CHECKLIST_EN.md](./CHECKLIST_EN.md).**

Russian version: [README_RU.md](./README_RU.md).

## 1. Our role

We are a **hosting service** (Art. 3(g)(iii)): we store other people's messages
at their request and show them to neighbours. We are also an **online platform**,
because we store content and disseminate it publicly.

But not for everything. The role differs across three surfaces:

| Surface | Role | Why |
|---|---|---|
| Feed, offers | hosting + platform | stored and publicly disseminated |
| Chat | **not hosting for that content** | not stored on the server, only carried until delivered |
| On-device profile | not our content | the identity lives in the user's browser |

The chat distinction is not an excuse but a consequence of the architecture: the
privacy policy states plainly that a chat is **not stored on our servers**, only
carried, and is not moderated. A notice about chat content cannot be executed by
deletion — we do not hold it. What we **can** do instead is in the spec: measures
against the account, not against text we cannot reach.

## 2. What applies regardless of size

Sections 1 and 2 know no size exemptions beyond the ones spelled out in them.

- **Art. 6** — the shield against liability for other people's content rests on
  two conditions: no actual knowledge of illegality, and expeditious removal once
  it arrives. A notice under Art. 16 is precisely what creates that knowledge
  (Art. 16(3)), so sloppiness with notices costs not a fine but the shield itself.
- **Art. 11–12** — a single point of contact for authorities and for users, with
  the languages stated. For us that is the face's support address.
- **Art. 13** — a legal representative is required only from providers not
  established in the Union. Cyprus is the EU, so this **does not apply**.
- **Art. 14** — the terms must describe the policies and tools of content
  moderation, including algorithmic decision-making and human review, in plain
  language. Hence the edits to `terms_EN.md`.
- **Art. 15** — transparency reports. Paragraph 2 **exempts** micro and small
  enterprises that are not VLOPs. Does not apply while the status holds.
- **Art. 16** — the notice-and-action mechanism. **Applies.**
- **Art. 17** — a statement of reasons for any restriction. **Applies.**
- **Art. 18** — suspicion of an offence threatening life or safety must be
  reported to law enforcement. **Applies.**

## 3. What the micro-enterprise status lifts

**Art. 19** exempts micro and small enterprises from the whole of Section 3. The
operator is a private individual with no staff and no revenue, comfortably below
the threshold (fewer than 10 employed, turnover under €2m).

Lifted: Art. 20 (internal complaint handling), Art. 21 (out-of-court dispute
settlement), Art. 22 (trusted flaggers), Art. 23 (measures against misuse),
Art. 24 (reporting and the Commission's decision database), Art. 25 (dark
patterns), Art. 26 (advertising transparency), Art. 27 (recommender systems),
Art. 28 (protection of minors).

Three caveats, which is why this cannot be relied on silently:

1. **The exemption lives and dies with the status.** Outgrow the threshold and
   the duties switch on; the relief lasts a further year after the status is
   lost, no longer. Check the status before launch and yearly thereafter.
2. **We meet Art. 28 voluntarily.** The audience starts at 13; we do not intend
   to use an exemption from protecting minors — the age filter, the ban on sexual
   content involving minors, and pre-publication moderation all stay.
3. **We meet Art. 26–27 voluntarily too** — see the next section.

## 4. The arguable part: is an offer an advertisement

Art. 3(r) defines advertising as promotion presented **in return for
remuneration** for that promotion. An offer is free: the platform takes neither
money nor barter. On the letter of the definition an offer is **not an
advertisement**, and Art. 26 does not reach it. Even if it did, Art. 19 lifts it.

`offers/SPEC.md` took a stricter line: "an offer is a commercial communication,
and being free does not exempt it". That is more cautious than the letter and
does not contradict it.

**Decision:** the Terms are written so that they hold under either reading. We
disclose what an advertisement would have to disclose — who publishes it, that
nobody pays for placement, that place alone decides who sees it — but we present
it as voluntary transparency rather than as an admission of a duty. That wording
creates no obligation where none exists, and leaves no question where one could
be asked.

There is deliberately no separate "ad" label on the card (`offers/SPEC.md`,
§11.1): recognisability comes from the shape of the card, the name of the
business and the size of the discount. An inspection will ask about exactly this;
the answer is above.

## 5. The arguable part: ephemerality against the duty to look into it

A message lives four hours and twenty minutes and is then **deleted**, not
hidden. A notice may arrive later — there is nothing left to remove, yet we still
owe the notifier an answer and must be able to show what the decision rested on.

That runs straight into the principle that nothing is kept.

**Decision — a snapshot only on notice.** Until somebody reports it, nothing is
saved and everything expires on the timer as before. The moment a notice arrives,
the system stores a minimal snapshot: the message id, its text, its zone and its
time. The snapshot exists for exactly two purposes — to take the decision and to
defend it — and lives for a year alongside the notice.

Why not otherwise:

- **Keep everything "in case of a complaint"** — destroys ephemerality for the
  sake of a rare event. Rejected.
- **Keep nothing** — the notice cannot be examined, and Art. 6 expects us to show
  that we acted diligently. Rejected.
- **If the message expired before the notice arrived** — there is no snapshot and
  cannot be one. We answer honestly that the content was already deleted by the
  timer, and record the notice. We imposed no restriction, so no statement of
  reasons under Art. 17 is owed: there is no addressee.

The snapshot contains personal data, so it is described in the privacy policy
with a retention period — otherwise Art. 16 would create processing the policy
does not mention, and the DSA would be fixed at the GDPR's expense.

## 6. Three different complaints that must not be conflated

The word "complaint" means three different things in this project, with different
subjects, handling and consequences. Conflating them either drags the platform
into other people's contracts, or drowns notices about illegal content in
arguments about coffee.

| What | Subject | Handling | Consequence |
|---|---|---|---|
| **Complaint about a message** | I do not want to see this | automatic: a vote counter | hidden at a threshold |
| **Complaint about an offer** | the promise was not kept | a moderator, privately | offer hidden; repeated cases suspend the business |
| **Notice under Art. 16** | the content is illegal | a human, with reasons and a reply | removal and a statement of reasons |

**A complaint about an offer hits the advertisement, not the service.** "They
refused the discount" is a checkable fact about the announcement itself: promised
and did not deliver. "The service was poor" is unverifiable in principle, turns
the moderator into an arbitrator of other people's deals, and pulls the platform
into a contract the Terms deliberately keep it out of. Start judging service
quality and the statement "we are not a party" stops being true.

A **misleading announcement**, on the other hand, is entirely our business: a
discount that never existed, hidden conditions, "new customers only" in small
print. That is a lie in a text we published, and it is handled as a complaint
about the offer.

The line: **we answer for the truth of the announcement, the business answers for
what stands behind it.**

**Complaints about service quality will arrive anyway.** We neither hoard nor
ignore them: we tell the neighbour that this is not our subject, give the
business's contact from the advertiser profile, and point at the consumer-dispute
route. Silently accumulating such complaints as "a signal against the business"
was rejected: it would mean we do judge quality after all, only in secret and
without a right of reply.

## 7. The redress routes we can actually name

Art. 17(3)(f) requires naming the routes for redress. We have no internal
complaint-handling system (Art. 20) and no out-of-court settlement (Art. 21), and
Art. 19 does not require them, so we name what genuinely exists:

- **Reply to us** at the support address — a human reviews the decision. This is
  not a formal Art. 20 system and must not be passed off as one.
- **A complaint to the Digital Services Coordinator** of your country of
  residence or of Cyprus (Art. 53). The Cypriot Coordinator is the
  **Radiotelevision and Digital Services Authority** (Αρχή Ραδιοτηλεόρασης &
  Ψηφιακών Υπηρεσιών), designated by the Council of Ministers on 2 February
  2024. It is the renamed Cyprus Radio Television Authority, which is why the
  old `crta.org.cy` domain redirects to the new one. Site `rtdsa.org.cy`, DSA
  section `/dsa-cyprus/`, email `rtdsauthority@rtdsa.org.cy`, Athalassas
  Avenue 42, 2012 Nicosia, phone +357 22512468. Checked on 5 August 2026
  against the Commission's register and the authority's own site. Not to be
  confused with the **Digital Security Authority** (`dsa.cy`) — cybersecurity
  and NIS2, a different body sharing the abbreviation.
- **Court** — the ordinary route, Limassol, Cyprus (the governing-law section of
  the Terms).

The Terms now name the authority outright; the generic wording is gone.

## 8. What remains to be done

The full list is in [CHECKLIST_EN.md](./CHECKLIST_EN.md). In short: the product
has **no** Art. 16 notice mechanism. There is a complaint on the card that counts
votes against showing something — not the same thing: it accepts no reasoning,
confirms no receipt and answers no notifier. Until the mechanism is built, the
Art. 16 duty is covered only by the support address, which has no procedure
attached to it.
