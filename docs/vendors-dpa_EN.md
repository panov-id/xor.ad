# Processors and their agreements (DPA)

Who processes personal data on our instructions, which agreement covers it, and
what is left to do. Collected 2026-08-03 from the vendors' own legal pages — not
from memory.

The same list is the start of the record of processing required by Article 30,
which we have not written yet.

## Why an agreement is needed

Article 28 GDPR: personal data may be handed to someone else for processing
**only under a contract**. Not "preferably" — it is a condition of the transfer
being lawful at all. Without a DPA, sending text to Perspective or writing a file
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
| **Google / Perspective** — feed moderation | the text of the message being published | Google APIs ToS + Google Privacy Policy; Perspective has no separate self-serve DPA | needs checking | — | 🛑 **the service is closing**, see below |
| **Resend** — email | the recipient's address and the letter | **baked in** — accepted with the Terms of Service, updated 2025-12-31 | yes, EU and UK SCCs + EU-US DPF certification | [list](https://resend.com/legal/subprocessors), 14 days' notice | ⚠️ download a copy for the file |
| **An LLM provider** — second stage of moderation | the text of a message the first stage did not pass | with Anthropic: baked into the Commercial ToS, accepted in the console, no standalone PDF | yes, SCCs inside the DPA | list published, 15 days' notice | ❌ provider not chosen |
| **PayPal** — paying for balance | payment data | **not a processor** — see below | — | — | ⚠️ described wrongly in the policy |

### Perspective closes on 2026-12-31

Google has announced that Perspective API stops working **after 2026**: the site
carries "Perspective API is sunsetting and service is officially ending after
2026", no direct replacement is offered, there will be no migration support, and
quota requests stopped being accepted in February 2026 — which has passed.

For us this is a product question rather than a legal one, and it is more urgent
than the agreements. Section 5 of the mechanics is built on two stages, the first
of which is Perspective. That stage has to change, and there are five months
left. There is no point signing anything with Google for a service that will die
before we launch.

The replacements: moderation at the LLM provider (which leaves one processor
instead of two, and simplifies both the policy and the paperwork), a dedicated
moderation service, or our own model on the node. Undecided.

### Bunny: OpenAI among the subprocessors

Bunny names OpenAI as a subprocessor, data in the US. By their own description it
covers three features: the support chatbot, video transcription in Bunny Stream,
and image generation in the CDN. We use none of the three — so our data does not
go there, but the record has to say exactly that rather than leave it implied.

### PayPal is a controller, not a processor

Payment providers process data at their own discretion and under their own
regulatory duties, not on our instructions. An ordinary DPA is not concluded with
them. Right now the policy lists PayPal alongside Bunny and Resend; that has to be
rewritten — it is an independent controller, and people should be pointed at its
own policy.

## What to do

1. Open the Bunny dashboard, conclude the DPA, download a copy. Check its text for
   the SCCs.
2. Confirm that the current Cloudflare DPA (6.4) is accepted; download it.
3. Download the Resend DPA for the file; check the DPF certification is reflected
   in it.
4. Decide what moderation becomes after Perspective closes — that decides who
   there is to sign anything with for that stage at all.
5. Choose an LLM provider and accept its DPA in the console.
6. Fix both storefront policies: describe PayPal as a controller.
7. Fold all of it into the Article 30 record — this table is already half of it.

I cannot sign anything for you: the accounts and the legal entity are yours.
Everything else — collecting, checking, writing — is mine.

## Sources

- [bunny.net GDPR](https://bunny.net/gdpr/) · [subprocessors](https://bunny.net/gdpr/sub-processors/)
- [Cloudflare Data Processing Addendum](https://www.cloudflare.com/cloudflare-customer-dpa/)
- [Perspective API](https://www.perspectiveapi.com/)
- [Resend DPA](https://resend.com/legal/dpa) · [GDPR](https://resend.com/security/gdpr)
- [Anthropic: how to view and sign the DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa)

Read together with: [`open-work_EN.md`](./open-work_EN.md) section J.
