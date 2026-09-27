# Moderator model measurement — 2026-09-27

Model: `qwen2.5:3b-instruct` (Ollama `0.3.14`), in Docker, on an `internal` network with no gateway.
That nothing can get out is checked by the script, not assumed. A laptop, 8 CPU cores, no GPU. The
corpus is the one from [`feed-rules-2026-09-27_EN.md`](feed-rules-2026-09-27_EN.md): the arrays of
`scripts/measure-feed-rules.ts` taken as they are. The `repeat` class is left out: it is a relation
between two phrases, not a text. The question is asked by `relay/node/src/lib/moderator.ts`
(`askModerator`) — the same prompt and the same call as in the node. Script:
`relay/moderator/measure.sh`. The numbers below are pasted from its JSON, not typed.

## 1. What the model says about the corpus

**201** phrases: reject **84**, publish **116**, unsure **1**, no answer **0**.
Misses (should have been reject, it said publish): **4**. False catches (should have been publish,
it said reject): **3**. Unsure: **1**.

| class | phrases | expected | publish | reject | unsure |
|---|---|---|---|---|---|
| clean | 106 | publish | 102 | 3 | 1 |
| rude | 20 | reject | 3 | 17 | 0 |
| links, plain | 20 | reject | 0 | 20 | 0 |
| links, masked | 20 | reject | 0 | 20 | 0 |
| contacts, plain | 10 | reject | 0 | 10 | 0 |
| contacts, masked | 15 | reject | 1 | 14 | 0 |
| offers | 10 | publish | 10 | 0 | 0 |

The errors, verbatim:

- **false catches** (3): «кто разбирается в пылесосах»; «покажу район новым соседям»;
  «проведу экскурсию по нашему району»; **unsure** (1): «собираем яблоки в саду»
- **misses, rude** (3): «хватит орать ночью, идиоты»; «у кого мозги есть — уберите мусор»;
  «бездарь этот наш дворник»
- **misses, contacts** (1): «телефон девять девять девять один два три»

## 2. The model next to the rules

In the 27.09 measurement the rules let 11 masked phrases through. The model rejects **10** of
them: all nine links and «mail: anna @ mail . ru». One phrase gets past both: «телефон девять девять
девять один два три».

The rules publish every rude phrase (20 of 20, their boundary). The model rejects 17 of 20.

But in the node the model is asked **only about phrases the rules already queued**
(`routes/feed.ts`, after the 202). So today its hint is a second opinion for the person at the queue.
The rules' misses and rude phrases never reach the model. For the model to catch what the rules let
through, it would have to be asked about published phrases too (hint → a person takes it down).
That is a separate decision and E2 does not make it.

## 3. Time per phrase

The first answer, loading the model into memory: **29393 ms**. After that, over 201 phrases: p50
**6434 ms**, p95 **26073 ms**, max 52531 ms. Other sessions and their runs shared the machine at
the time, so p95 and the max are an upper bound, not a property of the model. The rules for
comparison: p50 62 ms for the whole request.

What one model on this CPU keeps up with at p50 6.4 s: about 9 phrases a minute in the queue. The rules
measurement sends 35 % of the stream to the queue, so that is about 26 phrases a minute coming in.
The hint comes after the 202 and does not hold up the author. Above that stream, requests wait
longer in Ollama's queue; past the `MODERATOR_TIMEOUT_MS` timeout (20 s) there is no hint.

## Not checked

- The node end to end with the real model: a node with `MODERATOR_URL` → a row in
  `moderator_hints`. The hint path is checked by a test with a stand-in model
  (`relay/node/test/moderator.test.ts`, 4 of 4, control break red). The model is checked by this
  measurement directly. I did not run the node together with the real model.
- Whether answers repeat: `temperature 0`, but no second run was made.
- The corpus is Russian and small (201 phrases); the model was not measured in the storefronts'
  other languages.

## How to reproduce

```
relay/moderator/measure.sh > report.json
```
