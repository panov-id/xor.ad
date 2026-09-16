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
A fifth line, **blocks publication**, says whether opening the chat waits for the
answer (yes: the answer changes a published text or a duty towards people at launch;
no: the price is an internal record, a reference, or a change that can follow the
launch). No question blocks the drawing of screens.

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
- **Blocks publication.** yes — six "not implemented" decisions rest on the exemption; without it Art. 20, 21, 24, 26 bind from launch.

**2. Turnover and donations.**
- **Fact.** The status note records annual turnover as zero while a donation
  channel is live.
- **Where.** `docs/dsa/README_EN.md` §3, `landing/legal/terms_EN.md` §11.
- **Question.** How should turnover be counted against the threshold, and do
  donations make the activity economic — which would work in our favour, letting
  us lean on the threshold rather than argue about applicability?
- **Price.** One line in the status note, or a rewrite of §3.
- **Blocks publication.** no — one line in the status record; the product does not change.

**3. Section 4 and Article 29.**
- **Fact.** We write that Section 4 is lifted "the same way Section 3 was".
- **Where.** `docs/dsa/README_EN.md`.
- **Question.** Is it right that Section 4 has an exemption of its own — Article
  29, not Article 19? The conclusion is probably the same; the citation is not.
- **Price.** A corrected reference.
- **Blocks publication.** no — a reference fix.

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
- **Blocks publication.** yes — the refusal screen ships with or without a ground; changing it after launch means a new edition of the reasons.

**5. Automatic hiding at the report threshold.**
- **Fact.** At the threshold a message leaves the feed for everyone, and no
  statement of reasons is produced.
- **Where.** `sosed.place/docs/00-mechanics_EN.md` §5, `docs/dsa/SPEC_EN.md` §7.
- **Question.** Does such hiding require a statement, and is naming the automation
  as the cause enough?
- **Price.** A new source of rows in `statement_of_reasons` — half a day.
- **Blocks publication.** no — a new source row in `statement_of_reasons`, half a day, no public text changes.

**6. Measures against an identity and against a venue.**
- **Fact.** Fifteen minutes of blocked sending after five refusals; `suspended`
  for a venue on systematic complaints. No statement is sent for either.
- **Where.** `docs/chat_EN.md` §8.3, `docs/offers/SPEC_EN.md` §10.
- **Question.** Do these count as suspension of the service under
  Article 17(1)(c),(d)?
- **Price.** A wider list of restrictions and two new texts.
- **Blocks publication.** no — a longer list of restrictions is a new edition of the Terms and can follow the launch.

**7. Proportionality under Article 14(4).**
- **Fact.** Our measured false-block share is 7%; there is no internal appeals
  body; a refusal names the class but never shows what tripped.
- **Where.** `docs/route-to-code_EN.md` (the 7% decision), `docs/refusal-wordings_EN.md`.
- **Question.** Does this pass the proportionality test of Article 14(4), which
  size does not lift?
- **Price.** It may require a human re-examination path — we have one by email,
  but it is nowhere framed as an obligation.
- **Blocks publication.** yes — a human review path changes the finality promise in the Policy and the Art. 30 record.

## C. Advertising and offers

**8. Is an offer advertising?**
- **Fact.** Placement is free; the Regulation ties the definition to remuneration
  for promotion.
- **Where.** `docs/dsa/SPEC_EN.md` §5.2a, where both readings are recorded.
- **Question.** Does an offer fall under Article 3(r)? Does it change the answer
  that a private person's offer is an ordinary phrase with a non-empty discount?
- **Price.** Under the harsher reading: the word "advertising" on the card,
  disclosure of who paid and of targeting parameters — we have no payer by design.
- **Blocks publication.** no — venue offers do not open with the chat; a one-word label is a card edit.

**9. Article 26(2) — declaring a commercial message yourself.**
- **Fact.** The composer with a discount is exactly that, and is nowhere called so.
- **Where.** `sosed.place/docs/04-post-composer_EN.md`.
- **Question.** Does it count as implementing Article 26(2)?
- **Price.** A line in the document, if it does.
- **Blocks publication.** no — a line in a document.

**10. Article 6(3) — liability under consumer law.**
- **Fact.** An offer carries the venue's name, a promo code and an external link.
- **Where.** `docs/offers/SPEC_EN.md`.
- **Question.** Might an average consumer take an offer to come from the platform,
  and does the hosting exemption then fall away?
- **Price.** Possibly stronger visual separation of an offer.
- **Blocks publication.** no — visual separation of the offer is a drawing question, offers come after the chat.

**11. A saved offer.**
- **Fact.** The card outlives the offer on the device, up to 90 days, and we have
  no way to recall the copy.
- **Where.** `sosed.place/docs/17-offer_EN.md`, `docs/roadmap_EN.md` §2.
- **Question.** What binds the venue on an expired card? What is to be done with
  the copy of an offer taken down on a report? Is it an offer in the
  contract-law sense or an invitation to treat?
- **Price.** The answer decides whether a status-check route for saved offers is
  needed.
- **Blocks publication.** no — a saved offer lives on the device; a status-check route is added without text changes.

## D. Notices, redress, authorities

**12. Address limits on the notice route.**
- **Fact.** 10 an hour and 40 a day per IP, answered 429 with the support address.
- **Where.** `relay/node/src/routes/report.ts`, `docs/dsa/SPEC_EN.md` §2.
- **Question.** Is that compatible with "easy access" under Article 16(1), given
  shared housing and CGNAT?
- **Price.** Put the support address on the form itself — an hour.
- **Blocks publication.** no — the support address on the form is an hour, and the notice form is already live.

**13. Article 18 — whom to tell.**
- **Fact.** The duty is mentioned twice, no recipient is named, no trace is kept.
- **Where.** `docs/dsa/SPEC_EN.md` §5.
- **Question.** Whom exactly does one inform from Cyprus, in what form, and what
  must be kept?
- **Price.** A subsection and one column on the notice table.
- **Blocks publication.** yes — the Art. 18 addressee was named on 2026-09-08 but not verified by contact; without it the duty cannot be performed.

**14. The route for child sexual abuse material.**
- **Question.** Is Article 18 the right hook, or does a national procedure and
  hotline apply? What must be retained?
- **Price.** It decides the text of §5.1 of the DSA spec.
- **Blocks publication.** yes — §5.1 of the DSA spec and the procedure for child-abuse material must stand before the first notice.

**15. Cypriot implementation.**
- **Question.** Does Cypriot law require anything beyond the Regulation:
  registration, notifying the regulator, naming a contact point in a set form?
- **Blocks publication.** yes — a registration or another national requirement is a condition of lawful operation, not a follow-up.

## E. Bases, consent, children

**16. The digital age of consent in Cyprus.**
- **Fact.** We declare 13+; inside the app consent is not used as a basis, but the
  waitlist and analytics both stand on it.
- **Where.** `landing/legal/privacy_EN.md` §4, §10.
- **Question.** What is the threshold under Cypriot law, and how does it interact
  with our two consent-based processes?
- **Price.** Either an age question on the landing, or moving the waitlist to a
  pre-contractual step.
- **Blocks publication.** yes — the age threshold sits in the Terms and on the landing; the answer changes published text.

**17. The promise of parental consent.**
- **Fact.** The policy promises a parent's consent for minors; the product has no
  mechanism to obtain or verify it.
- **Question.** Is an actual mechanism required, or is removing the promise enough?
- **Price.** One edit to the policy, or a whole screen.
- **Blocks publication.** no — the promise was removed on 2026-09-15 (S5 panel, LAW-16); no mechanism is needed unless told otherwise.

**18. A contract with a child.**
- **Question.** Is Article 6(1)(b) sound for a user aged 13–16, or is a parental
  route needed?
- **Blocks publication.** yes — the contract ground for a 13–16-year-old user is the ground of all processing at launch.

**19. The waitlist: consent or a pre-contractual step.**
- **Fact.** Consent is declared as the basis, yet no proof of consent is kept —
  no flag, no revision of the text shown.
- **Where.** `relay/node/src/routes/waitlist.ts`.
- **Question.** Can it move to Article 6(1)(b) as "steps at the request of the
  data subject"?
- **Price.** If yes, there is nothing to prove; if not, a consent field per record.
- **Blocks publication.** no — the waitlist is already live; a consent field is added as a record.

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
- **Blocks publication.** yes — the way rights are exercised sits in Policy §12 and must work from day one.

**21. How long a closed identity is kept.**
- **Fact.** On 2026-08-30 we recorded 30 days; the sweeper does not exist yet.
  On 2026-09-15 the owner added: an identity with no live session for a year is
  closed and deleted 30 days later, and the paper code does not restore it; the
  privacy policy §5 now says both.
- **Where.** `docs/chat_EN.md` §8.2.
- **Question.** What period is justified by accountability and the Cypriot
  limitation period, and from when does it run?
- **Blocks publication.** no — the 30-day term is recorded; a different term is a number and a sweeper change.

**22. The acceptance log after an identity closes.**
- **Question.** Does `legal_acceptances` outlive the identity, and if so on what
  basis and for how long?
- **Blocks publication.** no — the fate of `legal_acceptances` is a cascade edit and touches no text.

## G. Transfers

**23. No SCCs with the CDN provider.**
- **Fact.** The contract carries no standard contractual clauses, its terms permit
  worldwide processing, and we recorded that as an accepted residual risk.
- **Where.** `landing/legal/privacy_EN.md` §8, `docs/article-30-register_EN.md`.
- **Question.** Is that position acceptable? Would moving the waitlist emails into
  our own Postgres, leaving only the edge log, be enough?
- **Price.** Moving one object-storage prefix — a day.
- **Blocks publication.** no — the waitlist already lives at the CDN; moving a prefix is a day's work and does not wait for launch.

**24. The phrase "accepted as a residual risk".**
- **Question.** Does it amount to a written admission inside a document a person
  accepts with a checkbox? What replaces it without starting to lie?
- **Blocks publication.** no — DPIA wording, an internal document.

## H. Proof of acceptance

**25. A pair (date, sha256) as proof.**
- **Fact.** Since 2026-08-29 an identity stores the date and the digest of the
  substance of the accepted text. Since 2026-09-15 every row is written by the
  person's own checkbox, the guidelines included — the node no longer records a
  silent re-acceptance.
- **Where.** `docs/migrations-step1_EN.md` (the `legal_acceptances` table).
- **Question.** Is that sufficient proof of accepting a particular revision in
  Cypriot proceedings?
- **Blocks publication.** no — the proof improves by recording more; the acceptance text does not change.

**26. Accepting an English text.**
- **Fact.** The interface speaks the person's language; the terms and the policy
  are English only, with a line above the text saying so.
- **Where.** `sosed.place/docs/15-legal-documents_EN.md`.
- **Question.** Does a consumer's acceptance of an English text hold under the
  clause about the English version governing? Is a short summary in the person's
  language enough instead of a full translation?
- **Price.** A summary in 17 languages — days; a full translation — weeks, plus a
  new revision on every edit.
- **Blocks publication.** yes — acceptance of the English text by a consumer across 17 interface languages conditions the Terms' validity from launch.

## I. Added 2026-09-14, after checking the norms against EUR-Lex

**27. GDPR Art. 22 and automated decisions.**
- **Fact.** A refusal to publish and a 15-minute pause are automatic and final; a link in an offer goes
  dark automatically on reports, and the venue is emailed with a way to contest.
- **Where.** `sosed.place/landing/legal/terms_EN.md` §11, §15; `docs/offers/SPEC_EN.md` §10.1.
- **Question.** Does any of these "similarly significantly affect" a person or a venue under Art. 22(1)?
  If so, what does "reply to the email" lack, and what does a user with no contact need?
- **Cost of the answer.** If it applies to the pause or the refusal — a route to a person and a new edition of the terms.
- **Blocks publication.** yes — if Art. 22 applies to the refusal or the pause, a human path and a new edition of the Terms are needed before launch.

**28. Changing the terms, and acceptance.**
- **Fact.** The terms notify a new edition (DSA Art. 14(2)). On the website, with no identity, continued use
  counts as acceptance; inside the product, with an identity, a checkbox that publishing waits for (decided 2026-09-15).
- **Where.** `terms_EN.md` §19.
- **Question.** Does acceptance by continued use on the website hold against Directive 93/13 and Cypriot
  law on unfair terms, when nobody writes anything on the website and there is no identity to contract with yet?
- **Cost of the answer.** An explicit acceptance screen on the website too.
- **Blocks publication.** yes — acceptance by continued use on the site is a mechanism that runs from day one.

**29. P2B and free venue offers.**
- **Fact.** A venue publishes offers for free, under the platform's terms; reports switch an offer's
  link off, and a venue is suspended for systematic justified complaints.
- **Where.** `docs/offers/SPEC_EN.md` §10, §10.1.
- **Question.** Are we a provider of online intermediation services under P2B Art. 2(2)? If so — the
  content of the statement under Art. 4(1) and 4(5), and the period under 4(2)–(4).
- **Cost of the answer.** A template letter to the venue and the suspension procedure.
- **Blocks publication.** no — venue offers come after the chat; the letter template and the suspension order are due before they open.

**30. Transit or hosting for undelivered messages.**
- **Fact.** An encrypted message waits on the node while the recipient is away, up to 260 minutes.
- **Where.** `docs/chat_EN.md` §8.8; open item `dsa.conduit.or.hosting`.
- **Question.** Is this still storage "no longer than is reasonably necessary for the transmission"
  under DSA Art. 4(2)?
- **Cost of the answer.** If it is hosting — Articles 16 and 17 apply to the queue.
- **Blocks publication.** yes — hosting instead of conduit puts the queue under Art. 16 and 17 and changes the DSA spec and the Policy.

**31. A receipt without email as notification under Art. 16(5).**
- **Fact.** A notifier with no email sees the decision on their device by a receipt: the device asks
  when the storefront opens and shows a dot; no letters.
- **Where.** `docs/dsa/SPEC_EN.md` §6.
- **Question.** Is this "notify … without undue delay" or only "make available"? If a person does not
  open the storefront for a month, is Art. 16(5) breached?
- **Cost of the answer.** If it is not enough — email becomes required for the decision, and the receipt
  stays only an acknowledgement.
- **Blocks publication.** yes — if a receipt is not enough, email becomes mandatory for the decision — the form, the spec and the Policy change.

## What we have already done so there would be fewer questions

- Article 16 notices work end to end: form, intake, acknowledgement, an answer to
  the notifier, a snapshot of the content, retention of one year.
- The notifier's identity is never disclosed to the author.
- The Cypriot Digital Services Coordinator is named in full, with an address.
- Profiling for delivery is absent as a mechanism, not as a setting.
- The date and digest of every revision of the legal texts are checked by machine
  on every build: a document that misdates itself stops the deploy.
