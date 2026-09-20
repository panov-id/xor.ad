# Local stand

Whole node backend on your laptop, self-contained — no Bunny, no Resend.

```bash
cd relay/local
docker compose up --build
```

| What | Where |
|------|-------|
| **API** (node) | http://localhost:62080 — `GET /health`, `POST /waitlist`, `POST /client-error` |
| **Mailpit** | http://localhost:62025 — welcome emails land here (no real send) |
| **Dozzle** | http://localhost:62090 — live logs of every container |
| **Waitlist data** | `./data/waitlist/local/<hash>.json` — one file per signup |
| **Postgres** | localhost:62432 — control state (brands, keys, quotas) |
| **Prometheus** | http://localhost:62091 — scrapes the node, evaluates the alerts |
| **Grafana** | http://localhost:62092 — one dashboard, provisioned from files |
| **Alertmanager** | http://localhost:62093 — a firing alert becomes a letter in Mailpit |

The stand applies its own migrations: a one-shot `migrate` service runs before
the node, so brands, keys and quotas work on a fresh `up` with nothing else to
remember. (On a real box the wizard does the same thing.)

Try it:
```bash
curl -X POST http://localhost:62080/waitlist -H 'content-type: application/json' \
  -d '{"email":"me@example.com","source":"sosed.place-landing","lang":"ru","mode":"dark"}'
```
→ a JSON file appears in `./data/…`, and the welcome email shows up in Mailpit.

Storage is `fs` (a mounted dir) and mail is `smtp` → Mailpit, so nothing leaves
your machine. Tear down with `docker compose down` (add `-v` to drop volumes).

## Tests, and which of them need a database

| Script | Database | Covers |
|--------|----------|--------|
| `scripts/run-relay-tests.sh` | no | type check plus every suite that runs on file storage — fast, and the one to run while editing |
| `scripts/run-relay-database-tests.sh` | its own, throwaway | secret keys compared by hash, quotas that add rather than overwrite, daily aggregates, the queue's lease |

They are two scripts on purpose. The first must stay quick and must keep working
with no database at all, because that is a real configuration — a node without
`DATABASE_URL` serves storage and refuses only the control plane. But that also
means the database branches there are not tested and not failing: they are
skipped, which reads exactly like passing. The second closes that gap.

The second script does **not** use this stand's Postgres. It creates its own,
migrates it, runs the suite and destroys it, publishing no host port — a suite
that deletes rows must never be pointed at a stand someone is looking at.


## Eyes

Everything the stand can see is in `observability/`, and that is the point: a
dashboard clicked together in a browser exists in one person's Grafana and
nowhere else. Grafana here has anonymous read, no login form, and
`allowUiUpdates: false` — the only way to change a panel is to change the file.

| File | What it decides |
|------|-----------------|
| `observability/prometheus.yml` | what is scraped, how often, with which token |
| `observability/alerts.yml` | every alert, and in a comment above each, the failure it exists for |
| `observability/alertmanager.yml` | where a firing alert goes — here, Mailpit; on a real box, one smarthost line changes |
| `observability/grafana/dashboards/relay-identity.json` | the dashboard, panel by panel |

The node's `/metrics` is behind a token and answers 404 without one, so the
stand sets `METRICS_TOKEN` on both sides. It is a throwaway string in plain
sight — on a real box it comes from the wizard's secrets.

**Seeing an alert arrive, rather than believing it would.** The end-to-end path
was exercised on 2026-09-20 by making the failure real: a job row with
`locked_until = 'infinity'` and no successor is a chain that has died, which is
what `JobChainDead` is for.

```bash
docker compose exec -T postgres psql -U relay -d relay -c \
  "INSERT INTO jobs (kind, payload, run_at, locked_until, attempts)
   VALUES ('probe_dead_chain', '{}'::jsonb, now() - interval '2 days', 'infinity', 8);"
```

Within a scrape the series appears, five minutes later the rule fires, and the
letter lands in Mailpit. Tidy up with `DELETE FROM jobs WHERE kind =
'probe_dead_chain';`.

That run found a defect in a rule, which is the argument for doing it:
`IdentitySweeperSilent` was written as "the last pass was long ago" and stayed
silent while the sweeper had never run at all — the metric was simply absent.
It now carries an `absent()` half, guarded by the node's own uptime.
