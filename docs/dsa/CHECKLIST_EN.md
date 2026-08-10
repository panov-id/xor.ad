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

The form, the links, the examination screen and the letters were listed here as
open while being ticked as done further down — the file contradicted itself.
Sorted out on 2026-08-09 by checking the live sites and the code; the duplicates
are gone and what follows is only what is genuinely unbuilt.

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
- [x] **An end-to-end check on staging — walked 2026-08-09.** The notice was
      filed through the API, the Art. 16(4) receipt arrived, the record joined the
      queue, an `upheld` decision was taken from the panel, and both letters — the
      Art. 16(5) reply to the notifier and the Art. 17(3) statement to the author —
      were delivered. The notifier's identity was not disclosed to the author. The
      test record is deleted; `dsa_notices` on staging is empty.

      **The check cost two findings, without which the mechanism did not really
      exist:** the examination screen opened for nobody (the resource was missing
      from the panel's permission map — fixed), and staging had no panel account at
      all, so there was nobody to sign in (J14). Together they made "the screen is
      built" true on paper and false in practice.

      Three remarks on the statement's content are in J16.
- [x] **Notification of material changes** to the documents, Art. 14(6) — done
      2026-08-09. More of it existed than the record showed: the bar's markup, the
      translations (10 locales on neighbro, 17 on sosed), the display logic and the
      storage keys (`nb-legal` / `ss-legal`) were already on both storefronts. A
      first visit stores the current edition silently — using the Service is
      acceptance, per the Terms — and the bar appears only for a genuinely older
      one.

      **What was weak, and what was fixed:** the edition was kept by hand
      (`EDITION = "2026-08-07"`) in two HTML files — a fourth copy of a date, bound
      to drift from the documents on the first edit. It now comes from the
      documents themselves: the deploy reads `Last updated` out of `terms_EN.md`
      and `privacy_EN.md`, takes the later, and puts it in `config.js`. An empty
      value is an early return, so a local copy announces nothing. The deploy
      **fails** if the date cannot be parsed: shipping an empty revision quietly
      would restore the dead bar.

      **The button is now neutral** in every locale on both storefronts: "Got it",
      "Понятно", "Verstanden" instead of "Accept". We inform rather than collect
      consent, and the label must not promise what we do not keep. The
      `legalAccept` key stays — renaming it would cost 27 edits for a name nobody
      sees.

      **The panel gets no such mechanism.** Art. 14(6) addresses recipients of the
      service; the panel is a tool for operators, bound by a different
      relationship. A bar there would be noise, not compliance.

      **Decided 2026-08-09:** a bar on the storefronts and a screen on entering the
      panel; **inform rather than require acceptance** — the article asks for
      information, and there is nobody to collect consent from: a storefront has no
      identity, only a browser. Acceptance moves to the identity once one exists
      (§8.2 of the chat spec), and only then does it become acceptance.

      **The version comes from the documents themselves** rather than being kept by
      hand: the deploy reads `Last updated` from `terms_EN.md` and `privacy_EN.md`,
      takes the later of the two, and puts it in `config.js` beside the other
      flags. A fourth place for a revision number would drift from the documents on
      the first edit.

      **The change has already happened:** on 2026-08-07 the push-notification
      promises were removed from the Policy and its date moved — with nothing to
      announce it.

## After launch

- [ ] The "report" item in a message's hidden menu leads to the form with the
      location pre-filled — today it is the vote-complaint, which is a different
      thing
- [ ] The same item on an offer card, next to the complaint about the discount
- [ ] **Showing the statement of reasons in the app where the author has no
      email (SPEC §7) — must ship WITH the feed, not after it.** We never ask for
      an address: an identity is a key pair, and an author usually has no
      electronic contact at all. Art. 17(2) requires no letter in that case, but
      the spec requires more — show it on their next visit, because a silent
      removal contradicts "a refusal is explained".

      Today, with no address, the statement **is written and goes nowhere**:
      `sendStatementOfReasons` returns `false` when the recipient is not an
      address, and `delivered_at` stays null — the row honestly separates "written"
      from "delivered", and that is all. While there is no feed there is nothing to
      restrict and no harm. The day a feed ships without that screen, the first
      restriction becomes exactly that silent removal.
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
