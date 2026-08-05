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
- [x] The point-of-contact languages named in the Terms: English and Greek (Art. 11(3))

## Done 2026-08-05 (the server side)

- [x] **Tables** `dsa_notices` and `dsa_statements` — migration
      `relay/node/db/005_dsa_notices.sql`. The checks live in the schema: the
      reasoning cannot be empty, `bona_fide` must be true, name and email are
      nullable for the §5.1 exception.
- [x] **Endpoint** `POST /report` — `relay/node/src/routes/report.ts`, public and
      unauthenticated: an authority or a stranger must reach it without an account.
- [x] **Snapshot** — `relay/node/src/lib/dsa_snapshot.ts`, taken on arrival. It
      reports **three** states: captured, `target_gone`, `not_accessible`. The
      third covers chat (never stored) and surfaces the product has not built;
      saying "expired" when we never looked would be a lie.
- [x] **Confirmation of receipt** — `sendNoticeReceipt` in `lib/mailer.ts`,
      Art. 16(4), best-effort: a letter must not lose the notice.
- [x] **Deletion after a year** — `tools/prune_dsa_records.ts` plus the `PRUNE_DSA`
      job in `lib/scheduled.ts`, next to the page-view sweep.
- [x] Types checked in a container: `docker run --rm -v "$PWD:/app" -w /app
      denoland/deno:2.1.4 deno check src/main.ts`.

## Before launch — what is left

- [ ] **The `report.html` form** on both faces: the fields from SPEC §3, plus the
      separate path without name and email for the §5.1 case. Without it the
      endpoint exists but nobody can reach it — which is the Art. 16(1)
      "easy to access" requirement. **Decide when starting:** the form's language.
      The legal pages are EN-only by decision; the form is an interface, so either
      repeat EN-only or translate into 17 and 10 locales.
- [ ] **A link to the form** in the footer and on the legal pages of both faces
- [ ] **An examination screen in the panel**: a queue over
      `status IN ('received','in_review')`, the snapshot, the decision, the
      dispatch of both letters. The `dsa_notices_queue` index is already shaped
      for it.
- [ ] **Templates for the two letters**: the reply to the notifier (Art. 16(5) —
      what was decided, why, whether automation took part, the redress routes) and
      the statement of reasons to the author (Art. 17(3) — seven elements, and the
      notifier's identity **never** disclosed)
- [x] **Access control — 2026-08-05.** The RLS line came from the spec rather than
      from this codebase: there is no row-level security here at all, and access
      is a permission plus a scope. Two permissions now exist — `dsa_notices.read`
      and `dsa_notices.decide` — in both catalogues (relay and panel, which a test
      compares). The notifier and the author read nothing from the database: they
      receive letters, and no endpoint exists for them to read, so "sees only
      their own" has nothing to guard here.
- [x] **The `report.html` form** — 2026-08-05, both storefronts. The Art. 16(2)
      fields, the separate path without name and email for the §5.1 case, a
      honeypot, and an answer carrying the reference. In English, like the legal
      pages: the form is part of the same surface, and Art. 16(1) asks for
      accessibility rather than translation.
- [x] **Links to the form** — the footer of both storefronts (the `footerReport`
      key, translated into every locale), the `legal.html` footer, and a mention
      in `terms §11`.
- [x] **Letter templates** — `sendNoticeDecision` (Art. 16(5)) and
      `sendStatementOfReasons` (Art. 17(3)) in `lib/mailer.ts`. The notifier's
      identity is never disclosed to the author; the redress routes are named,
      including the fact that we run no formal internal appeal.
- [x] **Panel routes** — `routes/dsa.ts`: the queue `GET /admin/dsa/notices` and
      the decision `POST /admin/dsa/notices/:id/decide`. The decision does not
      accept a status — it accepts the reasoning and writes the status from it;
      an upheld notice requires the restriction, the ground and the addressee, or
      the Art. 17 statement would be blank.
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
