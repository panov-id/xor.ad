# The ontology of facts and memory

The facts layer answers one question: **where else is this fact written down, and does
it agree with itself?** The group holds 190 documents under `docs/`, the same fact lives in two
language halves and across as many as three repositories, and such copies drift apart
in silence.

## Nodes

The four memory node types are fixed by the format of memory itself — they are the
labels by which a note reaches the context, and they cannot be extended:

| Type | What it holds |
|---|---|
| `user` | who the user is: role, expectations, habits |
| `feedback` | how to work: corrections and confirmed approaches, with the reason |
| `project` | decisions, goals and constraints not derivable from the code or history |
| `reference` | external resources: addresses, dashboards, tickets |

A fifth type — `fact` — lives not in memory but in the registries under `docs/facts`.
It is a leaf of the graph: it has no outgoing edges, things rest on it. A link to it is
written `[[fact:phrase.length]]`, and when the name occurs in more than one registry it
is qualified as `[[fact:limits/phrase.length]]`.

## Edges

An edge is a list line of the form `- <kind>: [[name]]`. A bare `[[name]]` is an edge
too, of the kind "mentions": it binds weakly and does not save a note from orphanhood.

| Kind | What one is to the other | From | To |
|---|---|---|---|
| follows from | a decision arising from another decision or constraint | project, feedback | project, feedback, fact |
| supersedes | a new decision in place of an earlier one | project, feedback | project, feedback, fact |
| verified by | what confirms the fact mechanically | project, feedback | project, reference, fact |
| described in | where the detail lives | project, feedback, user | reference, project, fact |
| contradicts | a known divergence, not yet resolved | project, reference | project, reference, fact |
| constrains | a constraint narrowing a decision or the work | project, user, feedback | project, feedback, fact |
| mentions | a bare link in the text | any | any |

The type pairs are restricted deliberately: a "verified by" edge from `reference` to
`user` would mean the author got confused, not that the edge is rare.

## Registries

| Registry | One row is | Checked by |
|---|---|---|
| `decisions.tsv` | a decision anchored in both language halves | `check-facts-decisions.sh` |
| `limits.tsv` | a limit's number and every file it must appear in | `check-facts-limits.sh` |
| `open.tsv` | an open question: weight, area, deadline | `check-facts-open.sh` |
| `noise-numbers.tsv` | a number that is not a limit, and why | `check-facts-coverage.sh` |
| `noise-open.tsv` | how many of a file's items are kept by its own list | `check-facts-coverage.sh` |
| `schema.tsv` | a table: where it is declared and whether it exists in the database | `check-facts-schema.sh` |
| `noise.tsv` | a date that is not a decision, and why | `check-facts-coverage.sh` |

**A fourth kind of due date — `с запуском`, "on launch" — was added on 2026-09-03.**
Two cells were not enough, and one of them lied: an obligation written into legal
documents has either a date or the word "сейчас" (now), and "-" is forbidden at `legal`
weight. An item there is nothing to implement on — no feed, no offers, no messages in the
node's schema — was kept permanently alight by "now", next to items alight for a reason.
The difference between overdue and cannot-start-yet is not bookkeeping: the first asks
for work today, the second only to be remembered on launch day, and merging them drowns a
real overdue in a list of the impossible.

**An open item's address is checked together with its line number — since 2026-09-03.**
The registry promises `file:line`, and the gate only ever looked at the file, so numbers
drifted in silence: a document is edited, lines move, and the address keeps pointing at
whatever landed there. Three ways of lying with a number are caught — past the end of the
file, on a blank line, not a number at all; whether the number lands in the right
paragraph is not machine-checkable, because the registry carries no anchor for that. That
check found and fixed three addresses, including this item's own — it had drifted along
with the file it described.

The noise registry is the second half of coverage. Without it "coverage" is achieved by
silence: an uncovered date is indistinguishable from an unnoticed one. A row in
`noise.tsv` costs more than a skip — it shows up in the diff, and adding one requires
explaining in writing why that date is not a decision.

## Two different claims

The table registry holds two claims, and they are checked differently:

- `declared_in` — the table is declared by the specification. That is about text, and
  a grep checks it.
- `migration` — the table is created by a migration. That is about the database, and it
  is checked by querying the live database, not by grepping the migration's text.

On 2026-08-31 the difference turned out not to be theoretical: the stand was running an
image built before the fifth migration and saw 4 files out of 11.

## The rule of negative control

A check becomes a check the moment its failure has been seen. Four gates of six have a probe that breaks what they
guard and shows red: `test_ontology.sh`, `test_check-facts-schema.sh`,
`test_check-facts-coverage.sh`, `test_check-facts-open.sh`. `check-facts-limits.sh`
and `check-facts-decisions.sh` have none — an open item, `gates.without.probe`,
rather than an omission. A green report on an empty
place is the worst thing a check can do, which is why `check-facts-schema.sh` exits with
code 2 when there is no database, rather than with zero.
