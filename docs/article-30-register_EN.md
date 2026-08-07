# Article 30 GDPR record of processing

What we process, why, on what basis, who receives it and how long we keep it.
Article 30 requires this record to be kept in writing and produced to the
supervisory authority on request. Russian version:
[article-30-register_RU.md](./article-30-register_RU.md).

**Compiled 2026-08-05.** Update it on every change: a new kind of data, a new
recipient, a new period. The facts come from both storefronts' privacy policies,
the product's `00-mechanics`, `dsa/SPEC`, `offers/SPEC` and `vendors-dpa`.

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
- **Sessions.** For each connected device: a public signing key, a label such as
  "Chrome, Android", creation and last-seen times, and a reference to the
  session that invited it. They exist so a person can see their own devices and
  disconnect any of them.
- **Recipients.** None: it lives in the browser and in our own database beside
  the node.
- **Retention.** For as long as the person uses the service; a session lives
  until it is revoked or the identity is closed.

### 2. Area of visibility

- **Purpose.** Match neighbours by a chosen zone without revealing a point.
- **Basis.** Performance of a contract; **precise coordinates** rest on consent,
  Art. 6(1)(a), and are requested only when "where am I" is pressed.
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
- **Key wraps.** Each chat's key is stored wrapped under the person's own
  devices' keys — opaque bytes the node cannot unwrap. They are deleted with
  the chat, or with a disconnected device.
- **Recipients.** None.
- **Retention.** **Not stored on the servers** — only carried until delivered. On
  the device it lives in IndexedDB, encrypted with Web Crypto, for the shorter of
  the two chosen times.

### 5. Waitlist

- **Purpose.** Invite the person when access opens.
- **Basis.** Consent — Art. 6(1)(a).
- **Data.** Email address, the source of the request.
- **Recipients.** **Resend** (delivering the letter).
- **Transfers outside the EEA.** Yes — SCCs plus EU-US DPF certification, see
  [`legal-archive/resend-dpa_EN.md`](./legal-archive/resend-dpa_EN.md).
- **Retention.** Until launch and one year after; sooner on request.

### 6. Push notifications

- **Purpose.** Tell someone about a burst nearby, if they asked for it.
- **Basis.** Consent.
- **Data.** Subscription endpoint and keys, language.
- **Recipients.** The push service of the person's browser.
- **Retention.** While the subscription is active.

### 7. Support

- **Purpose.** Answer a request, including GDPR rights requests.
- **Basis.** Performance of a contract and legal obligation — Art. 6(1)(c).
- **Data.** Email address and the text of the request.
- **Recipients.** Resend (delivering the reply).
- **Retention.** 1 year.

### 8. Notices of illegal content (Art. 16 DSA)

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

### 9. Advertisers and complaints about offers

- **Purpose.** Keep the profile of a business publishing offers, and examine
  complaints that a promised discount was refused.
- **Basis.** Performance of a contract with the business; legitimate interests for
  the complaints.
- **Data.** Name, contact, address (confirmed by letter), verification status; the
  text and date of a complaint, the business's reply.
- **Recipients.** None.
- **Retention.** Profile and complaints — **one year from the last offer**, then
  deletion.

### 10. Storefront analytics

- **Purpose.** Understand site usage.
- **Basis.** **Consent** in the banner, Art. 6(1)(a). Without it the counter does
  not load at all.
- **Data.** IP (truncated, anonymisation enabled), page addresses, referrer,
  approximate location from the IP, device and browser data.
- **Recipients.** **Google Analytics 4**.
- **Transfers outside the EEA.** Yes.
- **Retention.** Per the GA4 settings.

### 11. Our own page counter

- **Purpose.** Count page views ourselves, without external systems.
- **Basis.** Legitimate interests; it needs no consent because there is nothing in
  it to consent to.
- **Data.** Non-identifying view records.
- **Retention.** Detailed views 14 days, then an aggregate.

### 12. Logs and errors

- **Purpose.** Security and reliability.
- **Basis.** Legitimate interests.
- **Data.** IP, timestamp, user agent; a technical error report.
- **Rule.** **Personal data is not written to logs** — not an email address, not
  the text of a message, not an identifier.
- **Retention.** Server logs and client errors 30 days. Backups 7 days.

### 13. Administering the panel

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
| **The browser's push service** | subscription endpoint | set by the browser vendor | depends on the service | — |
| **Google Analytics 4** | truncated IP, page addresses | accepted in the GA console | yes | ⚠️ confirm acceptance |

Details and what is left — [`vendors-dpa_EN.md`](./vendors-dpa_EN.md).

## Security measures (Art. 32)

- The device identifier is **encrypted**; chat history on the device goes through
  Web Crypto before it is written.
- Our own database beside the node; nobody else holds it.
- Role separation in the panel, an audit log, keys with narrow scopes.
- Node hardening: closed ports, hardened SSH, secret rotation —
  [`../relay/HARDENING_EN.md`](../relay/HARDENING_EN.md).
- Backups live 7 days, so anything deleted leaves them within a week.

## Open items in this record

- [x] **The Bunny DPA is concluded** — the signed v1 of 2022-12-17 was received on
      2026-08-05. Art. 28 is closed.
- [x] **Bunny transfers — decided 2026-08-05.** The agreement carries no SCCs, but
      every storage zone sits in region `DE` with no replication, and neither chat
      nor the feed goes there. What crosses the border is the edge log alone (IP and
      page address) — accepted as a residual risk, see
      [`legal-archive/bunny-dpa_EN.md`](./legal-archive/bunny-dpa_EN.md).
- [ ] When creating new Bunny zones, check the region: it must be `DE`, no replicas.
- [ ] Confirm that the current data-processing terms are accepted in Google
      Analytics.
- [ ] Download the executed copy of the Resend DPA from the dashboard.
