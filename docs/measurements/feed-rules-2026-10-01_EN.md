# The feed's rules measured — 2026-10-01 (W13-RG)

Stand: the node from sources in Docker with `FEED_VERDICT=rules`, a throwaway Postgres 16, the corpus through
`depth/core` `Client` (signed `POST /feed`). Script: `scripts/measure-feed-rules.sh`; driver and corpus:
`scripts/measure-feed-rules.ts` — the corpus of 2026-09-27 (`feed-rules-2026-09-27`). Two runs: **before** the change —
`ccd60d3f` (day58 when the task was taken), **after** — the same branch with the widened `MESSENGER`
(`relay/node/src/lib/feed_verdict.ts`, commit "Name more messengers in the contact rule"). The numbers below are
written from both runs' JSON by a script, never typed. Registry item: `feed.rules.gaps` (a messenger outside the
list — "discord: anyone" passed).

## 1. What changed

`MESSENGER` knows discord, signal, skype, imo, threema, дискорд, сигнал: the Latin names bounded as `tg` is; the Cyrillic ones with their endings
(`дискорд[а-я]{0,2}`, `сигнал[а-я]{0,2}`), so "сигнализация", "дискордант", "skypeglass", "imogen" are not a messenger.
The test in `feed_verdict_rules.test.ts`, "a messenger named outside the old list is a contact", holds both the catches
and the boundaries; before the change it is red on "discord: anyone?". "example dot com" and bare `at`/`dot` are left
alone on purpose (the boundary of 27.09).

## 2. The corpus before and after

The corpus carries none of the new names (they went into the rule from the registry's "discord: anyone", not from the
corpus), so this measurement answers one question — **whether false catches grew** over 211 phrases, 106 of them clean
and 20 rude without links.

| | before (`ccd60d3f`) | after |
|---|---|---|
| phrases | 211 | 211 |
| published | 137 | 137 |
| queued | 73 | 73 |
| refused by the node (a limit, not a verdict) | 1 | 1 |
| false passes | 11 | 11 |
| false catches | 0 | 0 |
| p50 / p95, ms | 105 / 154 | 87 / 135 |

False catches: **0** — the task's condition holds (otherwise it would have stopped with the phrase).
Run time before 249 s, after 204 s.

### By class, after the change

| class | phrases | published | queued | false passes | false catches |
|---|---|---|---|---|---|
| clean | 106 | 106 | 0 | 0 | 0 |
| rude, no links | 20 | 20 | 0 | 0 | 0 |
| links, plain | 20 | 0 | 20 | 0 | 0 |
| links, masked | 20 | 9 | 10 | 9 | 0 |
| contacts, plain | 10 | 0 | 10 | 0 | 0 |
| contacts, masked | 15 | 2 | 13 | 2 | 0 |
| offers | 10 | 0 | 10 | 0 | 0 |
| repeats | 10 | 0 | 10 | 0 | 0 |

What the rules still let through, verbatim (the same as on 27.09: the boundaries the test keeps):

- **links, masked** (9): «example dot com — там всё»; «example . com, вечером»; «example.c0m»; «www example com»; «сайт пример . рф»; «example，com»; «example｡com»; «site: example／com»; «тут: example dot ru dot com»
- **contacts, masked** (2): «телефон девять девять девять один два три»; «mail: anna @ mail . ru»

Verdict time at `POST /feed` after the change: p50 **87 ms**, p95 **135 ms**, max 221 ms (211 requests);
published p50 101 / p95 145 ms, queued p50 62 / p95 88 ms.
The stand is a laptop under four of the artel's stands, so the absolute milliseconds are above 27.09's (62/83); the ratio
carries, the number does not. The node's one refusal in both runs is the address limit in the `link_masked` class, not
a verdict of the rules.

## 3. Left open

- The corpus has no phrases with the new messengers — add one line per name to `scripts/measure-feed-rules.ts`
  (class `contact_masked`) and clean ones carrying the letters inside a word ("сигнализация орёт"), so the next
  measurement measures the catch and the boundary, not only the absence of false catches.
- The other passes of 27.09 are the rules' boundary by form; without a dictionary they stay (`feed.rules.gaps`, second part).

## How to reproduce

```
scripts/measure-feed-rules.sh > report.json
```
