# Processors and their agreements (DPA)

Who processes personal data on our instructions, which agreement covers it, and
what is left to do. Collected 2026-08-03 from the vendors' own legal pages — not
from memory.

The same list is the start of the record of processing required by Article 30,
which we have not written yet.

## Why an agreement is needed

Article 28 GDPR: personal data may be handed to someone else for processing
**only under a contract**. Not "preferably" — it is a condition of the transfer
being lawful at all. Without a DPA, writing a file
to Bunny is already a breach, whether or not anything bad happens.

The contract must state the subject matter, duration, nature and purpose of the
processing, the categories of data and of people; oblige the processor to act
only on our documented instructions; cover staff confidentiality, security
measures, the terms for engaging subprocessors, help with people's requests and
with breach notification, and the fate of the data at the end — deletion or
return.

There will be no negotiation: our volume is not enough for a vendor to edit their
text. In practice a DPA is entered into in one of three forms — baked into the
terms, accepted in the dashboard, or sent on request.

If the processor sits outside the EU, a DPA alone is not enough: a transfer
mechanism is needed — **Standard Contractual Clauses**, sometimes together with
certification under the **EU-US Data Privacy Framework**. With large vendors the
SCCs come as an annex to the same document; what to check is that the annex is
there, not what the cover says.

## What we have

| Processor | What reaches them | Form of agreement | SCC / DPF | Subprocessors | Status |
|---|---|---|---|---|---|
| **Bunny** — hosting, CDN, object storage | everything the Service keeps; page addresses; visitors' IP | **in the dashboard** — the DPA has to be opened and concluded there; it is not automatic | not stated on the GDPR page — check the text from the dashboard | [list](https://bunny.net/gdpr/sub-processors/): Zendesk, Slack, Google Workspace, MailChannels, **OpenAI**, Atlassian | ❌ not concluded |
| **Cloudflare** — Turnstile (captcha) | the visitor's IP and browser signals | **baked in** to the subscription agreement, version 6.4 of 2026-04-03 | yes, EU/UK/CH SCCs, section 6 | [list](https://www.cloudflare.com/gdpr/subprocessors/), 30 days' notice | ⚠️ confirm the current version is accepted |
| **Resend** — email | the recipient's address and the letter | **baked in** — accepted with the Terms of Service, updated 2025-12-31 | yes, EU and UK SCCs + EU-US DPF certification | [list](https://resend.com/legal/subprocessors), 14 days' notice | ⚠️ download a copy for the file |
| **PayPal** — donations | nothing goes to it: a person leaves for PayPal's own site | **not a processor** — see below | — | — | ✅ described as a controller in both policies |

### Bunny: OpenAI among the subprocessors

Bunny names OpenAI as a subprocessor, data in the US. By their own description it
covers three features: the support chatbot, video transcription in Bunny Stream,
and image generation in the CDN. We use none of the three — so our data does not
go there, but the record has to say exactly that rather than leave it implied.

### PayPal is a controller, not a processor

Payment providers process data at their own discretion and under their own
regulatory duties, not on our instructions. An ordinary DPA is not concluded with
them — and we do not need one: the Service takes no payments at all, only
voluntary donations through an outbound link. A person leaves for PayPal's own
site; we send it nothing and never learn who donated. Both storefront policies
say so in a separate paragraph, outside the list of processors.

## What to do

1. Open the Bunny dashboard, conclude the DPA, download a copy. Check its text for
   the SCCs.
2. Confirm that the current Cloudflare DPA (6.4) is accepted; download it.
3. Download the Resend DPA for the file; check the DPF certification is reflected
   in it.
4. Fold all of it into the Article 30 record — this table is already half of it.

I cannot sign anything for you: the accounts and the legal entity are yours.
Everything else — collecting, checking, writing — is mine.

## Sources

- [bunny.net GDPR](https://bunny.net/gdpr/) · [subprocessors](https://bunny.net/gdpr/sub-processors/)
- [Cloudflare Data Processing Addendum](https://www.cloudflare.com/cloudflare-customer-dpa/)
- [Resend DPA](https://resend.com/legal/dpa) · [GDPR](https://resend.com/security/gdpr)
- [Anthropic: how to view and sign the DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa)

Read together with: [`open-work_EN.md`](./open-work_EN.md) section J.
