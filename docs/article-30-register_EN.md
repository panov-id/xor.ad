# Article 30 GDPR record of processing

What we process, why, on what basis, who receives it and how long we keep it.
Article 30 requires this record to be kept in writing and produced to the
supervisory authority on request. Russian version:
[article-30-register_RU.md](./article-30-register_RU.md).

**Compiled 2026-08-05.** Update it on every change: a new kind of data, a new
recipient, a new period. The facts come from both storefronts' privacy policies,
the product's `00-mechanics`, `dsa/SPEC`, `offers/SPEC_EN` and `vendors-dpa`.

## Controller

| | |
|---|---|
| **Who** | Evgenii Panov, a private individual, brands PSYTICAN & PEJEDED |
| **Where** | Limassol, Cyprus (EU) |
| **Data contact** | `privacy@sosed.place`, `privacy@neighbro.place` |
| **General contact** | `support@sosed.place`, `support@neighbro.place` — English and Greek |
| **Art. 27 representative** | not required: the controller is established in the EU |
| **DPO** | not appointed. Art. 37 requires one for large-scale systematic monitoring or large-scale special-category processing; neither applies — the service has not launched and we do no profiling |

Two faces (`sosed.place`, `neighbro.place`) are served by one backend. The
processing is identical and only the storefront differs, so the record is shared.

## Processing activities

### 1. Running the service without an account

- **Purpose.** Let people use the feed and chat without creating an account.
- **Basis.** Performance of a contract — Art. 6(1)(b).
- **Data subjects.** Visitors to the storefronts.
- **Data.** The identity's identifier and public key, display name, age,
  settings. **There is no browser fingerprint** — neither the basic one nor the
  wider one: the mechanism was removed entirely, along with the consent for it.
- **Session.** An identity has exactly **one live session** (`chat_EN.md` §8.2):
  a public signing key, a label such as "Chrome, Android" as the device sent it,
  and creation and last-seen times. Moving an identity to another device freezes
  the previous session rather than disconnecting it: `frozen_at`. There are no
  separate "connected devices" and no reference to an inviting session.
- **Recipients.** None: it lives in the browser and in our own database beside
  the node.
- **Retention.** For as long as the person uses the service. A frozen session is
  kept while the identity can still return to it; one unseen for a year is
  cleaned up together with its key share (see "Chat").

### 2. Area of visibility

- **Purpose.** Match neighbours by a chosen zone without revealing a point.
- **Basis.** Performance of a contract; **precise coordinates** rest on consent,
  Art. 6(1)(a), and are not requested at all — the "where am I" button was
  retired on 2026-08-28, and no face asks for a precise location.
- **Data.** An approximate area (time zone, IP, browser language) or a point
  placed by hand; the reach you look at and the precision you are seen with.
- **Recipients.** None. Precise coordinates place the point once and are not
  written as a track.
- **Retention.** With the device profile.

### 3. Pre-publication moderation

- **Purpose.** Keep rude, dangerous and explicit content out of the feed.
- **Basis.** Legitimate interests — Art. 6(1)(f): the safety of the place and its
  people.
- **Data.** The text of the message being published.
- **Recipients.** **None.** The classifiers run inside the node and the text never
  leaves it; moderation uses no external processor.
- **Retention.** The result of a check is not stored beside the message.
- **Chats are not checked at all.**

### 4. Chat

- **Purpose.** Carry a conversation from one device to another.
- **Basis.** Performance of a contract.
- **Data.** The **ciphertext** of the conversation: it is encrypted on the
  participants' devices (`chat_EN.md` §8.13); the node holds no keys and never
  sees plaintext. What the node does hold is metadata — who a chat is between,
  when something moved, and how long the messages were.
- **Key wraps.** Each chat's key is stored wrapped under the person's live
  session key — opaque bytes the node cannot unwrap. They are deleted with the
  chat, or with a deleted session.
- **Vault key share.** The local database on a device is encrypted with a key
  assembled from the person's PIN and **a share held by the node** (`chat_EN.md`
  §8.2). The node stores the share itself — 32 random bytes, meaningless to it —
  a hash of half the material derived from the PIN, and a counter of wrong
  attempts. The node does not know the PIN and cannot recover it from the hash,
  and the share alone opens nothing. It is tied to a session; a session unseen
  for a year is cleaned up together with its share.
- **Recovery code.** An identity stores a hash of half the paper code and its
  long-lived key wrapped under the other half. We do not know the code and can
  neither look it up nor reset it.
- **Recipients.** None.
- **Retention.** The conversation is **not stored on the servers** — only carried
  until delivered. On the device it lives in IndexedDB, encrypted with the vault
  key, for the shorter of the two chosen times. The share and the hashes live as
  long as the session or the identity does.

### 5. Waitlist

- **Purpose.** Invite the person when access opens.
- **Basis.** Consent — Art. 6(1)(a).
- **Data.** Email address, the source of the request.
- **Recipients.** **Resend** (delivering the letter).
- **Transfers outside the EEA.** Yes — SCCs plus EU-US DPF certification, see
  [`legal-archive/resend-dpa_EN.md`](./legal-archive/resend-dpa_EN.md).
- **Retention.** Until launch and one year after; sooner on request.

### 6. Support

- **Purpose.** Answer a request, including GDPR rights requests.
- **Basis.** Performance of a contract and legal obligation — Art. 6(1)(c).
- **Data.** Email address and the text of the request.
- **Recipients.** Resend (delivering the reply).
- **Retention.** 1 year.

### 7. Notices of illegal content (Art. 16 DSA)

- **Purpose.** Receive, examine and justify a decision on a report of illegal
  content; discharge Arts. 16–17 DSA.
- **Basis.** **Legal obligation** — Art. 6(1)(c). Not consent.
- **Data subjects.** Notifiers and the authors of the content.
- **Data.** The notifier's name and email (not requested where the report concerns
  the sexual exploitation of children), the reasoning, and a **snapshot of the
  content** — text, zone, time, author identifier.
- **Recipients.** Resend (letters to the notifier and the author); law enforcement
  where life is threatened — Art. 18 DSA.
- **Retention.** 1 year, then deletion; an anonymous counter remains.
- **A notifier's identity is never disclosed to the author.**

### 8. Advertisers and complaints about offers

- **Purpose.** Keep an owner's account and the venues that publish offers, and
  examine complaints that a promised discount was refused.
- **Basis.** Performance of a contract with the business; legitimate interests for
  the complaints.
- **Data.**
  - **Account:** an **email address** — the single place in the product where we
    know a person's email, and the only way into the cabinet is a link sent to
    it; the contact person's name.
  - **Venues:** one owner may hold several, each with its own name, its own
    postal address (confirmed by an envelope sent to that address) and its own
    verification status.
  - **Complaints:** the text and date, the business's reply, and the **complainant's
    email address** — mandatory on a discount complaint and the only way to tell the
    person the decision (`offers/SPEC_EN.md` §10.2). A complaint about a link carries no
    email: it expects no reply.
- **Recipients.** The email goes out through the mail sender — see "Recipients and
  contracts".
- **Retention.** Account, venues and complaints — **one year from the last
  offer**, then deletion.

### 9. Storefront analytics

- **Purpose.** Understand site usage.
- **Basis.** **Consent** in the banner, Art. 6(1)(a). Without it the counter does
  not load at all.
- **Data.** IP (truncated, anonymisation enabled), page addresses, referrer,
  approximate location from the IP, device and browser data.
- **Recipients.** **Google Analytics 4**.
- **Transfers outside the EEA.** Yes.
- **Retention.** Per the GA4 settings.

### 10. Our own page counter

- **Purpose.** Count page views ourselves, without external systems.
- **Basis.** Legitimate interests; it needs no consent because there is nothing in
  it to consent to.
- **Data.** Non-identifying view records.
- **Retention.** Detailed views 14 days, then an aggregate.

### 11. Logs and errors

- **Purpose.** Security and reliability.
- **Basis.** Legitimate interests.
- **Data.** A timestamp, a user agent and a technical error report: the kind of
  error, its message, the stack, **the page address without its query string**,
  the source, and a small flat set of markers from the page (up to 12 pairs of
  name and short string). The relay does not store an IP: it lives only in the
  in-memory rate limiter (`lib/client_ip.ts`). The CDN's edge logs are a separate
  matter and sit with Bunny (see "Recipients").
- **Rule.** **Personal data is not written to logs** — not an email address, not
  the text of a message, not an identifier. The rule is held up by the shape of
  the record rather than by a promise: the address is cut to its path, because a
  query string can carry anything, and the markers field accepts only flat short
  values — nested objects are dropped rather than serialised
  (`routes/client_error.ts`, 2026-08-11).
- **Content-security-policy reports.** A browser that refuses to load something
  the page asked for posts a report, and the node keeps it: the page it happened
  on, the blocked path, the directive, the source file and line, the user agent
  (300 chars) and the time (`routes/csp_report.ts`). It carries no identifier and
  no address, and it exists to show a policy drifting away from the pages it
  guards. **Added to this register 2026-08-30** — it had been collected since the
  endpoint was built and swept by nothing, which a review panel found and no
  check did.
- **Retention.** Server logs, client errors and CSP reports 30 days. Backups 14
  days (`relay/wizard/backup-postgres.sh`, `keep_days`).

### 12. Administering the panel

- **Purpose.** Handle complaints, manage brands and keys, stay accountable for
  actions taken.
- **Basis.** Legitimate interests; partly legal obligation.
- **Data.** Panel staff accounts, an audit log of actions.
- **Retention.** Audit log — 1 year.

## What is not our processing

- **Donations.** The person leaves by an outbound link; **PayPal is an independent
  controller**, we send it nothing and never learn who donated. No DPA is needed.
- **Hosting at Bunny** — processing exists (see below), but feed and chat content
  never goes there: the storefronts are static and the API bypasses the CDN.

## Recipients and contracts

| Processor | What it receives | Contract | Transfers outside EEA | Status |
|---|---|---|---|---|
| **Bunny** — hosting, CDN, storage | storefront statics, page addresses, visitors' IPs | **signed**, v1 of 2022-12-17, entity in Slovenia (EU) | ❌ no SCCs, §4.6 permits worldwide processing | ⚠️ Art. 28 closed, [transfer open](./legal-archive/bunny-dpa_EN.md) |
| **Resend** — email | recipient address and letter text | baked into the ToS, ed. 2025-12-31 | SCCs + EU-US DPF | ✅ checked 2026-08-05 |
| **Google Analytics 4** | truncated IP, page addresses | accepted in the GA console | yes | ⚠️ confirm acceptance |

Details and what is left — [`vendors-dpa_EN.md`](./vendors-dpa_EN.md).

## Security measures (Art. 32)

- The device identifier is **encrypted**; chat history on the device goes through
  Web Crypto before it is written.
- Our own database beside the node; nobody else holds it.
- Role separation in the panel, an audit log, keys with narrow scopes.
- Node hardening: closed ports, hardened SSH, secret rotation —
  [`../relay/HARDENING_EN.md`](../relay/HARDENING_EN.md).
- Backups live 14 days, so anything deleted leaves them within a fortnight.

## Open items in this record

- [x] **The Bunny DPA is concluded** — the signed v1 of 2022-12-17 was received on
      2026-08-05. Art. 28 is closed.
- [x] **Bunny transfers — revisited 2026-08-10.** The decision stands (accepted as
      a residual risk), but the reasoning recorded on 2026-08-05 rested on a false
      premise and has been corrected.

      It said: "neither chat nor the feed goes there, the edge log alone crosses a
      border". That much is true of chat and the feed — chat is not stored on the
      server at all, and the feed lives in its own Postgres. But **waitlist email
      addresses sit in exactly that object storage** (`routes/waitlist.ts`, one
      object per address), and they are the only personal data accumulated so far.
      So the residual risk covers more than the edge log.

      What still holds and carries the decision: the agreement carries no SCCs, the
      zones are region `DE` with no replication, and the volume is small and limited
      to an address plus the styling of the letter. See
      [`legal-archive/bunny-dpa_EN.md`](./legal-archive/bunny-dpa_EN.md). Revisit if
      the waitlist grows or anything beyond it lands in that storage.
- [x] **Push notifications cancelled — 07.08.2026.** The activity and the
      "browser's push service" sub-processor are removed from this record. The
      processing **never ran for a day**: the VAPID public key was empty on both
      storefronts, the subscribe offer was hidden, no subscription endpoint ever
      appeared on the node, and there is no subscription table in the schema —
      not one endpoint was ever received. The decision covers the whole platform
      (`chat_EN.md` §8.12), the code is removed from the storefronts and the
      deploy scripts, and the plan is rewritten in `pwa-push_EN.md`. The launch
      call goes by waitlist email through Resend — the "Waiting list" activity
      already covers it.
- [ ] When creating new Bunny zones, check the region: it must be `DE`, no replicas.
- [ ] Confirm that the current data-processing terms are accepted in Google
      Analytics.
- [ ] Download the executed copy of the Resend DPA from the dashboard.
