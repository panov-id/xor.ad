# Work plan for the facts layer

State as of 2026-08-31, 18:00. The numbers come from running the scripts, not from memory.

## What already stands

| Gate | What it holds | State |
|---|---|---|
| `check-facts-coverage.sh` | every date is either a decision or declared noise | 42 dates: 26 decisions, 16 noise |
| `check-facts-decisions.sh` | a decision and its date in both language halves | 80 decisions agree |
| `check-facts-limits.sh` | a limit's number stands in every file it must | 116 comparisons agree |
| `check-facts-schema.sh` | a table in the registry exists in the live database | 27 in the registry, 9 in the database |
| `ontology.py --check` | the memory graph: types, edges, orphans, dangling links | 24 nodes, 47 edges, 144 facts |
| `test_ontology.sh` | 17 cases, each one watched failing | green |
| `test_check-facts-schema.sh` | 5 ways the database can disagree | green |
| `test_check-facts-coverage.sh` | 4 ways coverage can be incomplete | green |

## Order and scope — settled 2026-08-31

Order: **4b → 10 → 3 → 7 → 12 → 13 → 2**. The short steps that may expose a real
divergence in the specification come first, the long ones that accumulate volume after.

Scope: **full coverage confirmed** — each of the 189 "value + unit" pairs and each of the
291 open-item candidates must be either in a registry or in noise with a reason.
Objections 1 and 2 in the review below stand as the accepted price: the noise registry
will grow large, and keeping it readable will take its own effort — kinds of noise and
grouping, not one heap.

## Steps

### 12. Numbers: 16 limits against 189 "value + unit" pairs

1. Extend `check-facts-coverage.sh` with a second half — number pairs.
2. Obtain the list of uncovered pairs (~173).
3. Work through it by unit, not line by line: `characters` and `bytes` first (that is
   where the protocol's limits live), then `seconds/minutes/hours/days`, then
   `metres/km`, and `KB/MB` last.
4. Real limits go into `limits.tsv` with the list of files; the rest into `noise.tsv`
   with a kind. Add a kind `prose.figure` for numbers that live inside an argument.
5. Negative control: put a number into a document, watch it go red, take it out.

Done when: coverage prints "nothing uncovered" and has been seen red.

### 13. Open items: 21 entries against 291 candidates

6. Teach `collect-open-items.sh --tsv` to compare with `open.tsv` both ways.
7. Work through the candidates by source; ticked boxes and other people's checklists
   become declared noise.
8. Negative control: add a `- [ ]`, watch the finding appear.

### 7. The eighteen product tables

9. For each one, find where the specification declares it and decide what settles its
   absence from the database.
10. Require in `check-facts-schema.sh` that a product table without a migration carries
    an entry in `open.tsv`.
11. Negative control: remove the entry, watch it go red.

### 4b. Nine places where the halves hold a different number of decisions

12. Read each one: `chat` 08-10, 08-21, 08-26, 08-27, 08-29; `protocol` 08-27, 08-28;
    `offers/SPEC` 08-28, 08-29.
13. A real divergence means fixing the document; a wrapped paragraph means fixing
    `seed-facts-decisions.py`.

Done when: "needs hands: 0", and each of the nine is explained in one line.

### 10. A number in a memory note must rest on a fact

14. A check in `ontology.py`: a number with a unit in the body requires an edge to `fact:`.
15. Run it against the current memory and work through what it finds.
16. Negative control in `test_ontology.sh`.

### 3. The ontology document as an RU/EN pair

17. `docs/facts/ontology_{RU,EN}.md`, written from the scripts' docstrings rather than
    from memory.
18. Check with `check-docs-pairing.sh`.

### 2. Committing

19. Group the commits by meaning: registries, gates, corrected documents.
20. Commit and push only on an explicit word.

## Where this plan is weak

The review is honest because the plan costs money and part of it may not be worth it.

**1. "Full coverage" of numbers may be work for the sake of a count.** 189 pairs are not
189 limits. Most numbers in the documents live inside prose: "after 30 days", "in five
minutes", "two thousand seven hundred examples". Declaring each of them noise would build
a registry of excuses larger than the registry of facts, and nobody would read it.
Proposal: cover fully only the units the platform's obligations are measured in
(characters, bytes, metres, seconds), and cut prose off with one declared rule rather
than one line per number.

**2. Open items carry the same risk.** 291 candidates are a mix of unticked boxes, ticked
boxes and phrases like "does not exist yet". A noise registry of 250 lines is not
knowledge, it is bookkeeping.

**3. Demanding a deadline for the eighteen product tables may be a false requirement.**
They are unmigrated not through oversight but because the product has not been started.
Eighteen deadlines would be eighteen inventions. It is more honest to have one dated
entry — "the product has not started, there will be no migrations until such a decision"
— that all eighteen registry rows point at.

**4. The order in the plan is not the best one.** Steps 12 and 13 are the longest and the
most doubtful in value, while step 4b is short and may hold a real divergence in the
specification. A better order is 4b → 10 → 3 → 7 → 12 → 13.

**5. The main point. Not one real defect found today came from a registry.** There were
three: the stand was running an image built before the fifth migration; eleven dates in
the English halves were written in the Russian format; code blocks in six posts drifted
right. All three surfaced from an attempt to measure something — the database, the
extractor, a screenshot — not from reading a registry. It follows that the value lies in
the measuring instruments and in their negative controls, and the size of the registries
is secondary. A plan that spends its main time on size deserves to be turned around.

**6. The noise registry has no expiry.** A line saying "this date is an example inside
JSON" will outlive both the example and the document. A check that each `example` in
`noise.tsv` still exists is needed; without it noise accumulates forever.

**7. The schema check needs a running stand.** Running it by hand is acceptable for now;
as soon as the gates run automatically, this step will have to be reworked.

**8. The uncommitted work keeps growing.** Twenty paths across two repositories, and not
a single commit this session. The work exists only in the working tree.
