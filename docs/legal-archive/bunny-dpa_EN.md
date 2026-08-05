# Bunny DPA — what was checked, and when

An archival record for the data processing agreement with bunny.net.
Russian version: [bunny-dpa_RU.md](./bunny-dpa_RU.md).

| | |
|---|---|
| **Vendor** | Bunny — storefront hosting, CDN, object storage |
| **Legal entity** | BUNNYWAY, informacijske storitve d.o.o., Medvode, **Slovenia (EU)** |
| **Role** | processor acting on our instructions |
| **Date checked** | 5 August 2026 |
| **Source** | the signed copy, provided by the operator |
| **Edition** | v1 of **17 December 2022**, running indefinitely until the account is deleted |

The PDF itself is **not kept in the repository**: it carries the controller's home
address and the repositories are public. Keep the file outside the repo; what
lives here is the record.

## What was confirmed

- **The agreement exists, and that is the headline.** Art. 28 GDPR requires a
  contract; until today there was none, so the transfer of data to Bunny had no
  basis at all.
- **The processor is established in the EU** — Slovenia. That alone settles part
  of the transfer question: the primary processing happens inside the Union.
- **Subject matter** (§2.3): network connection data, IP addresses, user agent,
  referrer, plus any personal data inside the files and their names.
- **Subprocessors** (§3): written notice in advance, **5 days** to object, silence
  counts as authorisation.
- **Breaches** (§6.2): notice without undue delay and **no later than 48 hours**
  after becoming aware.
- **Audit** (§5.3): an independent auditor, **no more than once a year**.
- **Return and deletion** (§8): on termination the data is destroyed or handed
  back at our choice; backups keep it temporarily.

## What the agreement does not contain — and this is not nitpicking

1. **No Standard Contractual Clauses, and no transfer mechanism of any kind.**
   Meanwhile §4.6 says outright: *"due to a global nature of the service,
   bunny.net may process customer data from anywhere in the world, where
   bunny.net operates."* Permission to transfer is there; a Chapter V mechanism is
   not. The annex with the SCCs is exactly what we agreed to check for rather than
   the cover — and there is no annex.
2. **No list of subprocessors as an annex** — only a notification procedure. The
   list lives on the site (`bunny.net/gdpr/sub-processors/`), not in the contract.
3. **No annex of technical and organisational measures.** Art. 28(3)(c) asks for
   specificity; §§4 and 6 describe measures in general terms.
4. **The copy is signed by bunny.net only** — Dejan Grofelnik Pelzel, Medvode,
   17 Dec 2022. The controller's signature line is empty. Acceptance may have
   happened in the dashboard; if so, the record there is the evidence, not this PDF.

## What to do next

- [ ] Open the Bunny dashboard and check whether **a newer edition** than 2022
      exists, with the SCCs annexed. The public `bunny.net/gdpr` page does not
      disclose the edition; the document is served inside the panel only.
- [ ] If there is nothing newer — decide the transfer question: either restrict
      the storage regions to Europe in the zone settings, or ask Bunny for the
      SCCs as a separate document.
- [ ] Confirm that acceptance is recorded on our side (a signature or a dashboard
      record), or the copy stays one-sided.

## What the region check showed (2026-08-05)

§4.6 reads worse than it works. In fact:

- **every Bunny storage zone is in region `DE` (Germany), with no replication.**
  Data at rest never leaves the EU;
- **the feed and the profiles** live in our own Postgres beside the node
  (Hetzner, Germany);
- **chat never reaches Bunny at all** — the node carries it without storing it.

Exactly one thing leaves the EEA: **edge servers worldwide see the IP and the
page address** when static files are fetched. That is inherent to any delivery
network and the direct price of the service working anywhere, not a
misconfiguration.

**Decision: accept it as a residual risk.** Not because it is convenient, but
because the alternative is dropping the CDN and serving from a single point,
degrading the product for the sake of paperwork. Three conditions hold: storage
stays in `DE` without replicas, regions get checked whenever new zones are
created, and if a DPA edition with SCCs appears we move to it.

## Notice of new sub-processors — 2026-08-05

A letter arrived: bunny.net is adding **two new sub-processors**, effective
**2026-08-19**. The wording is that they "will handle some of your organization's
personal account data".

**The clock, under our own agreement (§3.2):** written notice in advance,
objection **within 5 days** on "reasonable, documented grounds"; no answer counts
as authorisation. The window therefore closes around **2026-08-10**.

**The problem: the vendors are not named.** Neither in the letter nor on the
public page `bunny.net/gdpr/sub-processors/`, which still lists the previous six
(Zendesk, Slack, Google Workspace, MailChannels, OpenAI, Atlassian). One cannot
object on "reasonable, documented grounds" to parties one cannot see: there is
nothing to assess — not the purpose, not the country, not whether our users' data
reaches them at all.

**Position:** ask for the names, and state that a five-day window cannot run from
a notice that makes assessment impossible. This is not pedantry: the right to
object under Art. 28(2) GDPR is empty if the object of the objection is unnamed.

**What softens it.** The wording says "personal account data" — the data of **our
account** (the operator's name, email, billing), not the data of storefront
visitors. If that holds, the data subject here is the operator rather than our
users, and the question is a smaller one. It needs confirming rather than assuming.

- [ ] Write to bunny.net: name the two sub-processors, their purpose and country;
      confirm that only client account data is affected.
- [ ] Once answered — decide whether to object, and update the list in
      [`../vendors-dpa_EN.md`](../vendors-dpa_EN.md) and the Article 30 record.

## How this changes the status

Before: ❌ no contract at all — the processing was unlawful under Art. 28.
Now: ⚠️ the contract exists and the processing is lawful, but the **cross-border
transfer question is open** — and that is Chapter V, not Art. 28.
