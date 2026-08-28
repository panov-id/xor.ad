# The wordings of refusals

The storefront mechanics set the rule — "a refusal names its reason and the next
action" — and honestly admit the wordings themselves do not exist: "the exact
wordings are not written; they are written at the UX layer". Without them step 2
of §13 does not close: the moderation queue answers with a refusal and there is
nothing to say to the person, and the Article 17 statement of reasons has nothing
to fill it.

Written on 2026-08-28. The texts here are a **proposal**, not approved copy: words
a person reads are worth saying out loud before they leave for seventeen
languages.

## The decision everything follows from

**A moderation refusal names the class, not the word — decided 2026-08-28.** Four
wordings, one per class (rudeness, danger, explicitness, spam), and none of them
shows what exactly triggered it.

The price is named and accepted: roughly **seven ordinary phrases in a hundred**
are blocked for nothing (§8.14 of the spec), and their authors will not learn what
to change. The argument for it: highlighting the fragment is a literal instruction
for going around the filter, there is no appeal here, and the cost of the error in
the other direction is a feed people have left.

This also closes the open question in §10 of the mechanics, "can a refusal be
appealed": it is already settled in §5 — **there is no appeal**, the text is
edited and sent again.

## Tone

Three rules, which are the whole difference between "the product works" and "the
product is broken":

1. **A refusal is not an error.** "The quota is used up" is a rule working
   normally. A breakage speaks differently: "we could not do it".
2. **No apologies and no lecturing.** Neither "unfortunately" nor "please be
   polite". The first is a lie, the second is an insult.
3. **The next action is in the same line.** A refusal without an action leaves a
   person at a dead end, and a dead end reads as unfairness.

## 1. Feed moderation

Shown on the posting screen; the text **stays in the field**.

| Class | What is said | Action |
|---|---|---|
| rudeness | This looks like an insult. Neighbours will read it. | Edit it and send again |
| danger | This looks like a threat or a call to harm. | Edit it and send again |
| explicitness | Too explicit for a shared feed. | Edit it and send again |
| spam | This looks like an advert. A discount for neighbours is an offer. | Edit it, or add a discount |

- **"Looks like"** is not a softener but precision: the decision was made by a
  classifier with a measured error rate, and a confident tone would be a lie about
  its quality.
- **Spam leads into an offer**, because we do not forbid advertising, we give it a
  form: a phrase with a non-empty discount is a private person's offer
  (`offers/SPEC_EN.md`).

## 2. Waiting for the queue

```
checking…               usually a couple of seconds
```

The median is measured — 2.8 seconds, with a maximum near 12 (§8.3). The client
**must** show this state and has no right to fake instant publication: `POST /feed`
answers `202` and the verdict arrives later.

## 3. The name did not pass

A separate case, because what waits is not the person but the phrase.

```
Your name did not pass the check — the phrase will wait.
Fix the name and it will publish itself.
```

The rule of 2026-08-26: a phrase reaches the feed only when **both** are accepted.
Its lifetime counts from publication, so waiting does not cost it its 4:20.

## 4. The fifth refusal in a row

```
Five refusals in a row. Posting is unavailable for 15 minutes —
the feed, likes and conversations work.
```

What exactly stopped working is named: a silent refusal of everything reads as a
ban.

## 5. The other refusals (§10 of the mechanics)

| Refusal | What is said | Action |
|---|---|---|
| quota | Four phrases are already live. The next slot frees at 14:32. | Wait, or take one down |
| no network | There is no connection. What you wrote is saved. | We will send it when there is |
| the conversation expired | The span ran out; the conversation is gone. | Back to the feed |
| the other person closed it | The conversation has ended. | Back to the feed |
| a table outside your bands | *(nothing)* | — |

The last row is not an omission. A table outside the age bands is not shown **at
all**: a card with an explanation would itself report who is sitting where.

## 6. The Article 17 statement of reasons

A different genre: not a refusal to publish but an explanation of a **restriction
on something already published**. The mandatory elements are listed in
`dsa/SPEC_EN.md` §7; as text it looks like this:

```
Your phrase has been hidden.

What happened   hidden from the feed, 24 August
Why             a decision on a notice of illegal content
How decided     no automated check was used; a person decided
Grounds         <the legal provision or the clause of the terms>
What next       reply to us, contact the Digital Services Coordinator,
                go to court
```

**The notifier's identity is never disclosed** — the product's rule is stricter
than the law, and we keep the strict variant. **If there is no electronic contact**
— and usually there is none, we do not ask for email — the statement is shown in
the application at the next sign-in.

## What comes next

- **Translation.** These texts live in seventeen and ten languages, matching the
  storefronts. The order is the one adopted for the community rules on
  2026-08-27: machine translation under the clause already present, "the English
  version governs", and a native speaker when one appears.
- **Checking.** Wordings are as much a subject for the retirement registry as
  anything else: a refusal class gets renamed and the text stays behind.

## Open

- **These texts are not approved until they have been read out loud.** This is a
  proposal.
- **How long the "checking…" line lives** if the queue stalls: silence, a timeout,
  or a "taking longer than usual" line — undecided.
- **Whether to show the time a slot frees** ("at 14:32") — it is computed from
  other people's spans and so reveals the feed's rhythm; "in a few minutes" is
  safer and less useful.
