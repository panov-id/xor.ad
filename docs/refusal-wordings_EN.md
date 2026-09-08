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

## 4. The fifth refusal within an hour

```
Five refusals in an hour. Posting is unavailable for 15 minutes —
the feed, likes and conversations work.
```

What exactly stopped working is named: a silent refusal of everything reads as a
ban.

**"Within an hour" rather than "in a row" — edited 2026-09-07 after a review
panel.** "In a row" means any successful publication resets the run, and the
limit is then undone by alternating: four probes, one clean phrase, four more.
The whole rule is in `sosed.place/docs/00-mechanics_EN.md` §3, and so is the
cost: someone who honestly got it wrong five times in an hour waits fifteen
minutes, even though they published something good in between.

**Stepping away does not lift the pause** (§13 of the mechanics): a twenty-minute
departure is longer than a fifteen-minute pause, and without that rule the "step
away" button would put it out.

## 5. The other refusals (§10 of the mechanics)

| Refusal | What is said | Action |
|---|---|---|
| quota | Four phrases are already live. The next slot frees in a few minutes. | Wait, or take one down |
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

**The "How decided" line is two lines, not one — amended 2026-09-04 after the
review panel.** A single variant stood here, "no automated check was used; a person
decided", while the product restricts content along two different paths. A review
on a notice is indeed carried out by a person. Hiding by the complaint threshold —
a share of the possible audience with a floor of three people — fires **on its
own**, with no human decision at any point. Handing the author of such a
restriction a line saying no automation was involved states something untrue under
Art. 17(3)(c), in the very document that exists for accuracy:

```
How decided     (a review on a notice)
                no automated check was used; a person decided

How decided     (hidden by the complaint threshold)
                hidden automatically, by the number of complaints from different
                people; no person decided — write to us and a person will look
```

The second wording must also name the route of objection: an automated decision
with no human review is exactly what the article is written against.

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
- **After 60 seconds the "checking…" line becomes "taking longer than usual".
  Decided 2026-09-08.** There is no refusal: the phrase stays in the queue and
  goes out when the queue clears. Two of the three paths were rejected. Silence
  is indistinguishable from a frozen app — the person cannot tell whether they
  are waiting on us or on a broken screen. A timeout with a refusal looks more
  honest and lies about the substance: the check has not stopped, and calling the
  phrase rejected asks for it to be sent again, doubling the very queue that
  stalled. Sixty seconds is where waiting stops reading as the interface working.
- **The time a slot frees is not shown. Decided 2026-09-08.** "In a few minutes"
  rather than "at 14:32". The exact time is computed from the spans of other
  people's phrases, and §8.11 of `chat_EN.md` promises outright that the feed does
  not let anyone reconstruct when other phrases expire. Rounding to five minutes
  was considered and rejected: an observer collecting a dozen rounded points
  recovers the rhythm coarsely — but recovers it, and a promise either holds or
  does not. The price is acknowledged: a person cannot tell whether to come back
  in one minute or in ten.
