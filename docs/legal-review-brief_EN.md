# A brief for a lawyer — questions reading cannot close

**Compiled 2026-08-30** from a review panel of six independent agents (two
security lenses, two legal, two adversarial). What follows is only what survived
refutation and what **cannot be settled inside the team**: not a task list but a
list of questions, each naming what changes depending on the answer.

Everything that could be closed by an edit has been edited already and is not here.

## How to read it

Every question has four lines: **fact** — what the product does today; **where** —
the file that records it; **question**; **price of the answer** — what has to
change under each reading. The links point at our documents, not at the
regulations.

## Who is asking

The operator is Evgenii Panov, a private individual, Limassol, Cyprus, under the
brands PSYTICAN & PEJEDED. The service is free, there is no paid placement of any
kind, and there is no income beyond voluntary donations. The audience starts at
13. Two storefronts (`sosed.place`, `neighbro.place`) on one node, an interface in
17 and 10 languages, legal documents in English, community guidelines translated.
There are no recommender algorithms, no profiling, and no advertising in the
ordinary sense: the only commercial object is a neighbourhood offer with a
mandatory discount, published for free.

## A. Status and applicability

**1. Micro-enterprise: does it apply to us at all?**
- **Fact.** Six "not implemented" decisions rest on the Article 19 exemption.
- **Where.** `docs/dsa/README_EN.md` §3, `docs/dsa/SPEC_EN.md` §10.
- **Question.** Is a private individual running a free service and receiving
  donations an "enterprise" within Recommendation 2003/361/EC? If not, does the
  exemption work literally, or does Section 3 apply in full?
- **Price.** If the exemption does not hold: an internal complaint system
  (Art. 20), out-of-court settlement (Art. 21), reporting (Art. 24), advertising
  transparency (Art. 26) and Article 28 measures all become mandatory — months.

**2. Turnover and donations.**
- **Fact.** The status note records annual turnover as zero while a donation
  channel is live.
- **Where.** `docs/dsa/README_EN.md` §3, `landing/legal/terms_EN.md` §11.
- **Question.** How should turnover be counted against the threshold, and do
  donations make the activity economic — which would work in our favour, letting
  us lean on the threshold rather than argue about applicability?
- **Price.** One line in the status note, or a rewrite of §3.

**3. Section 4 and Article 29.**
- **Fact.** We write that Section 4 is lifted "the same way Section 3 was".
- **Where.** `docs/dsa/README_EN.md`.
- **Question.** Is it right that Section 4 has an exemption of its own — Article
  29, not Article 19? The conclusion is probably the same; the citation is not.
- **Price.** A corrected reference.

## B. Moderation, refusals and statements of reasons

**4. A statement of reasons for a refusal before publication.**
- **Fact.** The queue refuses a phrase **before** publication; we hold that
  Article 17 does not reach it, because there is nothing to restrict.
- **Where.** `docs/refusal-wordings_EN.md`, `sosed.place/docs/00-mechanics_EN.md` §5.
- **Question.** Does Article 17(1)(a) cover refusing to publish material that was
  never visible to anybody?
- **Price.** If yes, the refusal screen must carry the ground in the guidelines,
  a note that automation was used, and a route of redress — screens and refusal
  texts, about a day.

**5. Automatic hiding at the report threshold.**
- **Fact.** At the threshold a message leaves the feed for everyone, and no
  statement of reasons is produced.
- **Where.** `sosed.place/docs/00-mechanics_EN.md` §5, `docs/dsa/SPEC_EN.md` §7.
- **Question.** Does such hiding require a statement, and is naming the automation
  as the cause enough?
- **Price.** A new source of rows in `statement_of_reasons` — half a day.

**6. Measures against an identity and against a venue.**
- **Fact.** Fifteen minutes of blocked sending after five refusals; `suspended`
  for a venue on systematic complaints. No statement is sent for either.
- **Where.** `docs/chat_EN.md` §8.3, `docs/offers/SPEC_EN.md` §10.
- **Question.** Do these count as suspension of the service under
  Article 17(1)(c),(d)?
- **Price.** A wider list of restrictions and two new texts.

**7. Proportionality under Article 14(4).**
- **Fact.** Our measured false-block share is 7%; there is no internal appeals
  body; a refusal names the class but never shows what tripped.
- **Where.** `docs/route-to-code_EN.md` (the 7% decision), `docs/refusal-wordings_EN.md`.
- **Question.** Does this pass the proportionality test of Article 14(4), which
  size does not lift?
- **Price.** It may require a human re-examination path — we have one by email,
  but it is nowhere framed as an obligation.

## C. Advertising and offers

**8. Is an offer advertising?**
- **Fact.** Placement is free; the Regulation ties the definition to remuneration
  for promotion.
- **Where.** `docs/dsa/SPEC_EN.md` §5.2a, where both readings are recorded.
- **Question.** Does an offer fall under Article 3(r)? Does it change the answer
  that a private person's offer is an ordinary phrase with a non-empty discount?
- **Price.** Under the harsher reading: the word "advertising" on the card,
  disclosure of who paid and of targeting parameters — we have no payer by design.

**9. Article 26(2) — declaring a commercial message yourself.**
- **Fact.** The composer with a discount is exactly that, and is nowhere called so.
- **Where.** `sosed.place/docs/04-post-composer_EN.md`.
- **Question.** Does it count as implementing Article 26(2)?
- **Price.** A line in the document, if it does.

**10. Article 6(3) — liability under consumer law.**
- **Fact.** An offer carries the venue's name, a promo code and an external link.
- **Where.** `docs/offers/SPEC_EN.md`.
- **Question.** Might an average consumer take an offer to come from the platform,
  and does the hosting exemption then fall away?
- **Price.** Possibly stronger visual separation of an offer.

**11. A saved offer.**
- **Fact.** The card outlives the offer on the device, up to 90 days, and we have
  no way to recall the copy.
- **Where.** `sosed.place/docs/17-offer_EN.md`, `docs/roadmap_EN.md` §2.
- **Question.** What binds the venue on an expired card? What is to be done with
  the copy of an offer taken down on a report? Is it an offer in the
  contract-law sense or an invitation to treat?
- **Price.** The answer decides whether a status-check route for saved offers is
  needed.

## D. Notices, redress, authorities

**12. Address limits on the notice route.**
- **Fact.** 10 an hour and 40 a day per IP, answered 429 with the support address.
- **Where.** `relay/node/src/routes/report.ts`, `docs/dsa/SPEC_EN.md` §2.
- **Question.** Is that compatible with "easy access" under Article 16(1), given
  shared housing and CGNAT?
- **Price.** Put the support address on the form itself — an hour.

**13. Article 18 — whom to tell.**
- **Fact.** The duty is mentioned twice, no recipient is named, no trace is kept.
- **Where.** `docs/dsa/SPEC_EN.md` §5.
- **Question.** Whom exactly does one inform from Cyprus, in what form, and what
  must be kept?
- **Price.** A subsection and one column on the notice table.

**14. The route for child sexual abuse material.**
- **Question.** Is Article 18 the right hook, or does a national procedure and
  hotline apply? What must be retained?
- **Price.** It decides the text of §5.1 of the DSA spec.

**15. Cypriot implementation.**
- **Question.** Does Cypriot law require anything beyond the Regulation:
  registration, notifying the regulator, naming a contact point in a set form?

## E. Bases, consent, children

**16. The digital age of consent in Cyprus.**
- **Fact.** We declare 13+; inside the app consent is not used as a basis, but the
  waitlist and analytics both stand on it.
- **Where.** `landing/legal/privacy_EN.md` §4, §10.
- **Question.** What is the threshold under Cypriot law, and how does it interact
  with our two consent-based processes?
- **Price.** Either an age question on the landing, or moving the waitlist to a
  pre-contractual step.

**17. The promise of parental consent.**
- **Fact.** The policy promises a parent's consent for minors; the product has no
  mechanism to obtain or verify it.
- **Question.** Is an actual mechanism required, or is removing the promise enough?
- **Price.** One edit to the policy, or a whole screen.

**18. A contract with a child.**
- **Question.** Is Article 6(1)(b) sound for a user aged 13–16, or is a parental
  route needed?

**19. The waitlist: consent or a pre-contractual step.**
- **Fact.** Consent is declared as the basis, yet no proof of consent is kept —
  no flag, no revision of the text shown.
- **Where.** `relay/node/src/routes/waitlist.ts`.
- **Question.** Can it move to Article 6(1)(b) as "steps at the request of the
  data subject"?
- **Price.** If yes, there is nothing to prove; if not, a consent field per record.

## F. Data-subject rights under ephemerality

**20. Serving Articles 15/17/20 without an account.**
- **Fact.** An identity is a key on a device; there is no email and no password.
  The policy sends people to the support address, where nobody can be identified.
- **Where.** `landing/legal/privacy_EN.md` §9.
- **Question.** Is it lawful to condition these rights on a signed request from
  the app and to invoke Article 11(2) for everything else? What refusal wording
  is safe?
- **Price.** Two routes in the app instead of correspondence — they have to be
  designed.

**21. How long a closed identity is kept.**
- **Fact.** On 2026-08-30 we recorded 30 days; the sweeper does not exist yet.
- **Where.** `docs/chat_EN.md` §8.2.
- **Question.** What period is justified by accountability and the Cypriot
  limitation period, and from when does it run?

**22. The acceptance log after an identity closes.**
- **Question.** Does `legal_acceptances` outlive the identity, and if so on what
  basis and for how long?

## G. Transfers

**23. No SCCs with the CDN provider.**
- **Fact.** The contract carries no standard contractual clauses, its terms permit
  worldwide processing, and we recorded that as an accepted residual risk.
- **Where.** `landing/legal/privacy_EN.md` §8, `docs/article-30-register_EN.md`.
- **Question.** Is that position acceptable? Would moving the waitlist emails into
  our own Postgres, leaving only the edge log, be enough?
- **Price.** Moving one object-storage prefix — a day.

**24. The phrase "accepted as a residual risk".**
- **Question.** Does it amount to a written admission inside a document a person
  accepts with a checkbox? What replaces it without starting to lie?

## H. Proof of acceptance

**25. A pair (date, sha256) as proof.**
- **Fact.** Since 2026-08-29 an identity stores the date and the digest of the
  substance of the accepted text.
- **Where.** `docs/migrations-step1_EN.md` (the `legal_acceptances` table).
- **Question.** Is that sufficient proof of accepting a particular revision in
  Cypriot proceedings?

**26. Accepting an English text.**
- **Fact.** The interface speaks the person's language; the terms and the policy
  are English only, with a line above the text saying so.
- **Where.** `sosed.place/docs/15-legal-documents_EN.md`.
- **Question.** Does a consumer's acceptance of an English text hold under the
  clause about the English version governing? Is a short summary in the person's
  language enough instead of a full translation?
- **Price.** A summary in 17 languages — days; a full translation — weeks, plus a
  new revision on every edit.

## What we have already done so there would be fewer questions

- Article 16 notices work end to end: form, intake, acknowledgement, an answer to
  the notifier, a snapshot of the content, retention of one year.
- The notifier's identity is never disclosed to the author.
- The Cypriot Digital Services Coordinator is named in full, with an address.
- Profiling for delivery is absent as a mechanism, not as a setting.
- The date and digest of every revision of the legal texts are checked by machine
  on every build: a document that misdates itself stops the deploy.
