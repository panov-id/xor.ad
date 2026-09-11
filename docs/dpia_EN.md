# Data Protection Impact Assessment — 2026-09-11

Required **before processing begins** (Art. 35 GDPR), and that is the only reason
this document exists today rather than on launch day: an assessment made
afterwards is itself the breach. There is almost no product in the code yet — so
much the better, because changing things here is still cheap.

**Who assessed:** the operator, Evgenii Panov. There was no outside counsel, and
that is stated plainly: this reflects what we know ourselves, not a lawyer's
opinion.

## 1. Is an assessment needed at all

Art. 35(1) requires one where processing is **likely to result in a high risk** to
people's rights. Art. 35(3) names three cases outright, and by the EDPB criteria
three markers apply to us:

- **Systematic automated evaluation of content.** Every published message passes a
  model before publication (register, processing 3) — a systematic evaluation with
  a consequence for the person.
- **An audience from 13.** Teenagers are a vulnerable group under the EDPB
  criteria, and the product admits them deliberately (§8.2, `CHECK (age >= 13)`).
- **Location data.** The area of visibility (register, processing 2) is where a
  person is, rounded to a cell but still that.

Conclusion: **an assessment is required**, and arguing otherwise would be a cheap
saving.

## 2. What the processing is

The description is not duplicated: twelve kinds of processing with their purposes,
bases, categories, recipients and retention live in
[`article-30-register_EN.md`](./article-30-register_EN.md). Only what matters for
risk is here.

**Nature.** The product is ephemeral by construction: a phrase lives 4 hours 20
minutes, a conversation by a span each side chooses for itself, the correspondence
is not stored on the servers at all and is encrypted on the devices. There is no
profile: no interest graph, no recommender, no advertising targeting.

**Scale.** As of 2026-09-11 — zero users: the product tables are declared by the
specification and not migrated (`docs/facts/open.tsv`,
`product.tables.unmigrated`). This is an assessment of a model rather than of a
fact, and that is its main limitation.

**Context.** People near one another, meeting in order to meet in life. So the
cost of a mistake is not "data leaked" but "a person came to a person", and the
risks below are weighed in that logic.

## 3. Necessity and proportionality

| What is collected | Why it is needed | What would be excessive |
|---|---|---|
| Age as a number | the age bands; without the number there is no feed to build | a date of birth — more precise than needed |
| Area of visibility | without it there is no "nearby" | an exact coordinate kept as a track |
| A name | the other side recognises who they agreed to talk to | a surname, a photo, any profile |
| An email address | only the waitlist and businesses have one | a resident's email is never collected |

**Minimisation is proved by refusals, not by declarations.** The "where am I"
button was withdrawn on 2026-08-28; the browser fingerprint was removed; the exact
centre of a phrase is rounded to a cell, and since 2026-09-10 visibility is
computed from that cell so the feed cannot work as a rangefinder; GA4 was removed
on 2026-09-10 along with the last basis resting on consent.

## 4. Risks and what stands against them

| Risk to a person | What closes it | What remains |
|---|---|---|
| **Working out where an author lives** | the rounding grid; visibility computed from the cell; steps instead of exact counters | in a thinly populated place a neighbour is recognisable anyway — the cost is named in §8.3 |
| **Learning when somebody is at their screen** | no presence indicators; the "ended" mark is placed by your own attempt; the confirmation count is hidden at two; the table list is not recomputed on a block | the "stepped away" line is the one exception, and the person declares it themselves |
| **Reading the correspondence** | encryption on the devices, no keys on the node, no messages in the database | a game board is not encrypted, and the policy and the rules say so |
| **Getting the history off a lost device** | a PIN plus the node's share; since 2026-09-11 any move of an identity burns the previous device's share | while the phone is in hand and unlocked, nothing helps |
| **An automated refusal with no review** | the refusal names a class; the false-block budget is a published number | there is no appeal against a refusal, and since 2026-09-10 the terms say so plainly |
| **An adult pursuing a teenager** | age bands, the sandbox, symmetric blocking, seating refused both ways | age is self-declared, and that is admitted out loud |
| **A leak from the database** | the vault share sits under the node's key; there is no correspondence in the database; backups live 14 days | a dump plus a device allows a PIN search — the condition is named in §8.2 |

## 5. Residual risk

Two are named, and both are accepted knowingly:

1. **Self-declared age.** A thirteen-year-old can claim to be thirty. Any real
   check would mean collecting documents from everybody — a trade we consider a
   loss (`docs/dsa/SPEC_EN.md`).
2. **A small neighbourhood.** Where there are ten neighbours, anonymity holds
   worse: a phrase about one's own dog identifies a person with no coordinates at
   all. The product does not fix this and does not pretend to.

## 6. When it is revisited

- Before the first live user — mandatory, because today this assesses a model
  rather than a working system.
- On any new processing entering the Article 30 register.
- On a change in the operator's legal form (private individual → company).
- Otherwise once a year, together with the micro-enterprise status check.
