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
