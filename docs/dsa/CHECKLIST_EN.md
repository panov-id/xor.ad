# DSA: what to build

Ordered from what discharges the duty right now to what makes it comfortable.
The reasoning is in [README_EN.md](./README_EN.md), the mechanic in
[SPEC_EN.md](./SPEC_EN.md). Russian version: [CHECKLIST_RU.md](./CHECKLIST_RU.md).

## Texts (done)

- [x] Terms: a section on how the feed is put together and where to report
- [x] Terms: offers as their own section, the platform not a party to the deal
- [x] Terms and policy: the notice channel, statements of reasons, retention
- [x] Policy: the snapshot, the notifier's name and email, a one-year period
- [x] The Cypriot Digital Services Coordinator established and named in the Terms
- [x] The micro-enterprise status checked and recorded — README §3, checked 5 Aug 2026

## Before launch — mandatory

- [ ] **The `report.html` form** on both faces: the fields from SPEC §3, plus the
      separate path without name and email for the §5.1 case
- [ ] **Confirmation of receipt** — an email through Resend, immediate, automatic
- [ ] **The `notice` and `statement_of_reasons` tables** with RLS: a notifier sees
      only their own notice, an author only their own statement
- [ ] **The snapshot on notice creation** — before examination, or the content
      expires on the timer first
- [ ] **An examination screen in the panel**: the queue, the snapshot, the
      decision, and the dispatch of both letters
- [ ] **Deletion after a year** — a scheduled job, alongside the existing cleanup
      of offer complaints
- [ ] **Languages of the point of contact (Art. 11(3))** — name in the Terms the
      languages in which we can be addressed. One of them must be an official
      language of the Member State of establishment: for Cyprus, **Greek** or
      Turkish. Today no languages are named at all. Needs a decision: do we
      undertake to accept Greek, and how would we handle it
- [ ] **A link to the form** in the footer and on the legal pages of both faces —
      the mechanism must be "easy to access" (Art. 16(1))
- [ ] **Letter templates**: confirmation of receipt, reply to the notifier,
      statement of reasons to the author, refusal of a service-quality complaint.
      Each carrying the mandatory elements from SPEC §6 and §7
- [ ] **Notification of material changes** to the documents. The Terms and the
      policy promise it themselves ("signposted in the Service"), and Art. 14(6)
      requires it. No mechanism exists: a banner or a screen on first entry after
      an edit is needed

## After launch

- [ ] The "report" item in a message's hidden menu leads to the form with the
      location pre-filled — today it is the vote-complaint, which is a different
      thing
- [ ] The same item on an offer card, next to the complaint about the discount
- [ ] Showing the statement of reasons in the app where the author has no email
      (SPEC §7)
- [ ] The wording of refusal reasons — shared with the feed mechanic

## To re-check regularly

- [ ] The micro-enterprise status — **by 5 Aug 2027**, yearly thereafter. Losing
      it switches Section 3 on after a year; update the record in README §3
- [ ] Whether the faces have acquired revenue: paid advertising or a subscription
      would change both the tax picture and several answers in the README

## What is deliberately not done

The list with its reasoning is in [SPEC_EN.md](./SPEC_EN.md), §10. In short:
internal complaint handling, out-of-court settlement, the Commission's decision
database, trusted flaggers, public statistics.
