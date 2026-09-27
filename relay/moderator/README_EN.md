# Moderator model

The first tier of §8.14: a local model reads a phrase the rules sent to the
queue and leaves a hint beside it — `publish`, `reject` or `unsure`
(`moderator_hints`, migration 080). The person in the queue still decides; the
model never publishes or refuses anything.

- **Off by default.** The node asks the model only when `MODERATOR_URL` is set
  (`MODERATOR_MODEL`, default `qwen2.5:3b-instruct`; `MODERATOR_TIMEOUT_MS`,
  default 20000). Code: `relay/node/src/lib/moderator.ts`.
- **Nothing leaves the machine.** The model runs in Docker on an `internal`
  network with no gateway; the node joins that network. No key, no account,
  no outside API.
- **After the answer.** The node asks after the 202, outside the phrase's
  transaction: a slow or dead model costs the author nothing, and a failed
  hint is simply absent.

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
| `scripts/run-relay-database-tests.sh --filter E2` | the node's hint path with a stand-in model |

The measurement: `docs/measurements/moderator-2026-09-27_EN.md`.
