# The feed's rules measured — 2026-09-27

Stand: the node from sources `eb21a13` in Docker with `FEED_VERDICT=rules`, a throwaway Postgres 16, the corpus
through `depth/core` `Client` (signed `POST /feed`, as a live face makes them). Script: `scripts/measure-feed-rules.sh`;
driver and corpus: `scripts/measure-feed-rules.ts`. The numbers below are pasted from its JSON, never typed.
Registry items: `moderation.model` (§8.14 — "a measurement, not an argument"), `moderation.queue.throughput`,
`product.tables.unmigrated`.

## 1. What the rules do with the corpus

Phrases: **211**; published by the rules at once: **137** (65 %); queued for a person: **74**
(35 %); refused by the node (a limit, not a verdict): 0. Run time 137 s.

| class | phrases | published | queued | false passes | false catches |
|---|---|---|---|---|---|
| clean | 106 | 106 | 0 | 0 | 0 |
| rude, no links | 20 | 20 | 0 | 0 | 0 |
| links, plain | 20 | 0 | 20 | 0 | 0 |
| links, masked | 20 | 9 | 11 | 9 | 0 |
| contacts, plain | 10 | 0 | 10 | 0 | 0 |
| contacts, masked | 15 | 2 | 13 | 2 | 0 |
| offers | 10 | 0 | 10 | 0 | 0 |
| repeats | 10 | 0 | 10 | 0 | 0 |

False passes in all **11**, false catches **0**.

What the rules let through or caught in error, verbatim:

- **links, masked** (9): «example dot com — там всё»; «example . com, вечером»; «example.c0m»; «www example com»; «сайт пример . рф»; «example，com»; «example｡com»; «site: example／com»; «тут: example dot ru dot com»
- **contacts, masked** (2): «телефон девять девять девять один два три»; «mail: anna @ mail . ru»

Reading the numbers. The rules of §8.3 read shapes, not words: a link, an address, a phone, a messenger, a repeat,
an offer. Rudeness without links they publish — not a defect of the rules but the line §8.14 leaves to the model
or a person; the "rude" class shows exactly that line. The passes on masked links and contacts are the one class
a rule can improve without a word list; each pass is named above, and `feed_verdict.ts` is changed only after a
pass is named here (the task's condition).

Verdict time at `POST /feed` (the whole request, rules and the write): p50 **62 ms**, p95 **83 ms**,
max 119 ms (211 requests); published p50 68 / p95 90 ms,
queued p50 41 / p95 53 ms. The stand is one container on a laptop: the
milliseconds do not carry to a box, the ratio does — the rules' verdict costs no more than the write.

## 1a. Before and after the change to the rules

The first run (the same corpus, the rules of day58 as they were) showed 18 passes; three places in
`relay/node/src/lib/feed_verdict.ts` were changed for them, each named to the coordinator before the change:
`unspelled()` reads `[.]` and `(.)` as a dot; `LINK` takes Cyrillic top-level labels from a closed list
(`рф`, `ру`, `укр`, `бел`, `срб`); `MESSENGER` knows "тг" in Cyrillic with word boundaries. What passed before:

- **links, masked** (14): «сайт пример.рф»; «заходите на example[.]com»; «example dot com — там всё»; «example . com, вечером»; «example.c0m»; «www example com»; «пример точка рф»; «example(.)com»; «сайт пример . рф»; «ссылку скину в личку, пример.ру»; «example，com»; «example｡com»; «site: example／com»; «тут: example dot ru dot com»
- **contacts, masked** (4): «пиши в тг»; «телефон девять девять девять один два три»; «пиши в личку тг»; «mail: anna @ mail . ru»

| | before the rules were changed | after |
|---|---|---|
| published | 144 | 137 |
| queued | 67 | 74 |
| false passes | 18 | 11 |
| false catches | 0 | 0 |
| passed · links, masked | 14 of 20 | 9 of 20 |
| passed · contacts, masked | 4 of 15 | 2 of 15 |
| p50 / p95, ms | 59 / 79 | 62 / 83 |

The boundaries left open and written as a test (`feed_verdict_rules.test.ts`, "the boundaries the
measurement named, kept"): "dot" as a bare word, spaces around a dot and around `@`, digits in words,
`example.c0m`, `www example com`, fullwidth punctuation `，｡`, "тгк" as a word.

A side finding of the same measurement: the earlier `LINK` walked the label chain and backtracked over it —
7.2 s on 100 KB of `a.a.a.…` (the shape of B106); the node cuts a phrase to 128 graphemes, so it never fired
live, but the rule is now linear (one label character before the dot, then a top-level label from the list),
held by the 100 KB < 50 ms timing test ("the widened rules still read 100 KB…").

## 2. Throughput of the person's queue

The queue takes **35 %** of the flow (on this corpus; a live feed has another share of links and
contacts — an upper bound for a feed half of which is advertising, a lower one for a clean feed). A phrase waits
no longer than `moderation.queue.wait` = 10 minutes (`docs/facts/limits.tsv`), then leaves without a refusal.

| flow, phrases/min | queued, phrases/min | depth over 10 min | people at 30 s/verdict | people at 60 s/verdict |
|---|---|---|---|---|
| 1 | 0.4 | 4 | 1 | 1 |
| 10 | 3.5 | 35 | 2 | 4 |
| 60 | 21.0 | 210 | 11 | 22 |
| 600 | 210.4 | 2104 | 106 | 211 |

"People" is how many moderators keep the queue from growing at the given time per verdict; depth is how many
phrases lie in the queue when the oldest leaves at the limit, if nobody looks. One person at 30 s per verdict
holds an inflow of up to 6 phrases a minute.

## 3. The chat spec's unmigrated tables and their §13 step

`docs/facts/schema.tsv` names eight product tables without a migration. None holds steps 1–7:

| table | declared in | §13 step | what it is | state |
|---|---|---|---|---|
| `tables` | chat_RU.md §6.1 | 8 (tables and games) | a table: area, board class, term | deferred until there are users |
| `table_seats` | chat_RU.md §6.1 | 8 | seats at a table, one live per identity | deferred |
| `table_lines` | chat_RU.md §6.1 | 8 | the table's lines after the queue's verdict | deferred |
| `table_games` | chat_RU.md §6 | 8 | a game at a table (board, turn, score) | deferred |
| `table_scores` | chat_RU.md §6 | 8 | the score by seat | deferred |
| `table_likes` | chat_RU.md §6.1 | 8 | a table's like — a bookmark without a match (2026-09-17) | deferred |
| `chat_games` | chat_RU.md §6 | 8 (a game for two in a conversation) | a game inside a conversation, cascading from the chat | deferred |
| `offer_link_reports` | offers/SPEC_RU.md | offers (outside §13) | reports on a link, `/o/:code/report` | waits for the letter to the venue under Art. 17 (the owner's) |

Conclusion: `product.tables.unmigrated` holds only step 8 and the offer's report; steps 1–7 are closed by
migrations `db/022`–`db/063` in full. The item can be narrowed to "the table, the games and the link report".

## How to reproduce

```
scripts/measure-feed-rules.sh > report.json
```

The corpus is in `scripts/measure-feed-rules.ts`; changing a phrase's class changes the expectation — a change
to the measurement, not to the rules.
