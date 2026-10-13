# Moderator model

Pre-publication moderation is the model alone (owner's decision, 05.10, 09.10
and 13.10.2026); there is no human queue and no panel verdict. A local model
gives the verdict on everything a person writes for others to read — a phrase,
a new name, a table line, a table's name. The rules of §8.3 (a link, a contact,
an offer, a repeat, a doubtful name) read it first and their flags go to the
model as context; the model's answer is the verdict. Complaints (reports, DSA
Art. 16 notices, appeals) are handled by a person, not by the model.

- **The verdict.** `publish` publishes (200). Anything else refuses with a
  reason the author sees and can write around (422): `reject` with the model's
  words, counted towards the pause of §8.3; `unsure`, no answer within
  `MODERATOR_TIMEOUT_MS`, or more than `MODERATOR_CONCURRENCY` questions in
  flight — refused closed with "try again later", not counted. An offer (a
  phrase with a discount) is ordinary content: its flag never refuses by
  itself. Code: `judge()` in `relay/node/src/lib/moderator.ts`.
- **Off: the rules decide.** With `MODERATOR_URL` unset (the test suites, a
  node with no model) a text the rules find nothing in — or only an offer —
  publishes, any other flag refuses with the rules' reason. Settings:
  `MODERATOR_MODEL` (default `qwen2.5:3b-instruct`), `MODERATOR_TIMEOUT_MS`
  (default 20000), `MODERATOR_CONCURRENCY` (default 2).
- **In the request.** The node asks after the text is written and before it
  answers, outside the writing transaction: the author waits at most the
  timeout and gets the verdict in the answer — never a 202 decided later. A
  phrase's answer is kept in `moderator_hints` (migration 080) for audit, and
  goes with the row when refused; every verdict is counted in
  `relay_moderation_verdicts_total{kind,by,result}`.
- **Nothing leaves the machine.** The model runs in Docker on an `internal`
  network with no gateway; the node joins that network. No key, no account,
  no outside API.

## Weights

Once per machine, into the volume `moderator-models`. On the machine where
this was built, the weights were already in another project's volume and were
copied, not downloaded:

```bash
docker volume create moderator-models
docker run --rm -v <volume with the weights>:/from:ro -v moderator-models:/to alpine cp -a /from/models /to/
```

On a clean machine: `ollama pull qwen2.5:3b-instruct` into that volume from a
container with network access, once; the running model never has one.

## Run and check

| Command | What |
|---|---|
| `docker compose -f relay/moderator/docker-compose.yml up -d` | the model on the `moderator` network |
| `relay/moderator/measure.sh > report.json` | the model against the rules' corpus |
| `relay/moderator/check-migration.sh` | 079 → 080 over rows, 080 twice |
| `scripts/run-relay-database-tests.sh` | the verdict path with a stand-in model (`test/moderator.test.ts`, `test/tables.test.ts`) |
