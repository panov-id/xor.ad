# The route to code

The product is fully described and none of it is built. This document answers one
question: **what is left before the first line of step 1** (`chat_EN.md` §13) —
and which decisions were taken to get there, so that they are not reopened.

Assembled on 2026-08-27 by walking every open place: 22 flows, 20 screens in both
storefronts, the terminal client, the panel, the mechanics, the legal texts.

## Where we stand

Measured, not remembered:

| What | How many |
|---|---|
| flows described and reconciled | 22 |
| screens per storefront, matching between them word for word | 20 |
| claims in the test map (`test-map_EN.md`) | 208 |
| of those, checkable today | 1 |
| wordings under the retirement registry (`retired-terms.txt`) | 54 across 31 documents |
| open questions on the screens | 36 |
| open questions in the terminal client | 7, two of them closed below |

One checkable claim out of two hundred and eight is not a criticism of the map but
its design: every row carries the build step after which it can be opened. Before
that step it would go red for a missing table rather than for a mistake.

## Decisions taken on 2026-08-27

Eight forks that do not follow from anything already decided. Each with its price,
because the price is what the decision consists of.

### 1. The false-block budget is 7%

The moderation threshold is derived from a **budget of mistakes**, not from peak
F1: at peak F1 the chosen arm wrongly blocks 41% of ordinary messages (§8.14). We
take 7% — the number the storefront mechanics already promise.

At it the chosen arm (translation) catches **0.46** of what people call offensive
on average and **0.26** in the worst language. The price is named plainly: seven
ordinary phrases in a hundred will not reach the feed, and there is no appeal —
the author edits the text and sends it again.

**Consequence:** the threshold is a node parameter, not a constant of the model;
it moves without retraining anything.

### 2. The threshold lives as deploy-time constants; no panel screen yet

Building a screen for a number nothing can validate (there are no live reports) is
work done blind. The values (5% of the audience, a floor of three people, a 7%
budget of mistakes) sit in the node's config and change with a deploy.

**Price:** the threshold cannot be turned on the day the feed goes wrong — that
needs a release. **Condition for revisiting:** the first live reports. Then a
screen, a permission and an audit entry — who moved the threshold and when is a
decision about other people's speech, and it has to be visible.

### 3. The image support window is the current major only

The node accepts clients on the current major version of the protocol. An older
image gets **a legible refusal with the command to update**, not a silent
breakage, and the sunset date is announced in advance.

**Price:** one major version switches off everyone who is not paying attention.
Accepted for the opposite reason: every supported old branch is code nobody
touches and nobody checks.

### 4. The terminal asks for its language at first run

Not the system locale and not a flag: one question in `depth new`, and the answer
goes into the volume next to the accepted revision of the terms.

**Price:** one more step in an already long registration (name, age, PIN, paper
code, area). Taken because a shell's locale is often not the language a person
speaks to their neighbours in, and choosing silently for them is the same thing as
the language shares in the feed, which we have already retired.

### 5. Nine languages of the rules get a machine translation, marked

The paragraph about what a report does is translated by machine and lives under
the clause already present in every document: "the English version governs; the
translation is provided for convenience".

**The price is accepted knowingly:** this departs from the rule "do not translate
legal text into languages you do not know". The argument for it: right now nine
languages have no such paragraph at all, so a reader does not learn from the rules
what their own report does — in a document accepted with a checkbox. A poor
wording under the clause is worse than a good one and better than a hole.
**Condition for revisiting:** a native speaker, when one appears.

### 6. No legal review of the Terms for now

Recorded as an **accepted risk** rather than a forgotten item: if a lawyer insists
on 16+, the age bands, the registration and the texts in every language all have
to be redone. Revisit when there is money or a first outside question.

### 7. The SEO document is reconciled line by line

The 283 diverging lines between the storefronts get walked: what is shared is made
identical, what differs is marked with its reason (different markets, languages,
domains). It is the last document in the group where it is unclear whether it is
supposed to match.

### 8. Loose ends first, drawing second

The order is **loose ends → drawing → the core skeleton → step 1**. Loose ends are
the things that surface in the middle of other work and derail it: the SEO
document, the Argon2id measurement, the nine languages of the rules.

## The order of work

### Stage 0 — loose ends (first)

- Reconcile the SEO document (decision 7).
- Measure Argon2id parameters for the PIN in a container: 64 MB / t=3 were taken
  by analogy with the transfer code, and the threat model is different — six
  digits, entered at every launch, protected from brute force by a counter on the
  node. The result goes into `depth-client`.
- Translate the report paragraph into nine languages (decision 5).
- Write the moderation constants (decisions 1 and 2) into the node config and into
  `open-work`.

### Stage 1 — drawing

**The stage's first decision is where the application's tokens come from (found
2026-08-28).** Not one of the twenty screens points at a source of visual
decisions, and `design-system_EN.md` describes the **panel**, not the storefronts:
different colour roles, a 6px radius instead of sharp corners, admin components.
There are three partial sources — the landings, the July prototype's tokens, and
the panel's system — and drawing before choosing between them is not possible:
twenty mock-ups would land in three systems, and reconciling them costs more than
drawing again.

An SVG mock-up at true geometry for every screen, numbered questions at the end,
agreement, and only then CSS. Twenty screens; this is where most of the 36 open
questions close — nearly all of them are about layout, and layout is not settled
in words.

### Stage 2 — the skeleton

A repository of "core plus two faces" (§13): protocol, crypto and state **with no
DOM and no Ink**, and two thin rendering layers on top. A rig on which the
acceptance criterion "two clients hold a conversation and one of them is the
terminal" can actually be shown.

This is code, but not product code: it settles nothing about the feed or the chat.

### Stage 3 — step 1 of §13

Identity and session: `identities`, `sessions`, `vault_shares`, request signing,
transfer by code with confirmation. **Waits for a separate explicit word** — a
project rule, and this document does not lift it.

## What is on a person, not on me

- **Shield on the four production zones — by 2026-09-01.** It needs the WAF log
  from the cabinet: the API does not expose it, so the decision is made by eye.
- **The word for stage 3.**

## Open, but not blocking

These cannot be closed today, and they honestly wait for their day:

- **The queue's throughput** (§8.3) — measured on live hardware, on the day the
  queue exists.
- **The gap the group-attack threshold sits in** — 0.53 against 0.77 on the probe
  sets; on live data it may narrow, so measure again after launch.
- **Eight languages with no public labelling** (az, be, hy, ka, kk, ky, tg, uz):
  quality there is unmeasured and cannot be measured until reports appear.
- **The German set** is labelled on political tweets rather than neighbourhood
  talk: its numbers measure a mismatch of tasks, not the work of moderation.
- **Terminal accessibility under a screen reader**, behaviour at 60 columns and
  `NO_COLOR` — the three remaining open questions of `depth-client`.
