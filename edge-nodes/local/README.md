# Local stand

Whole node backend on your laptop, self-contained — no Bunny, no Resend.

```bash
cd edge-nodes/local
docker compose up --build
```

| What | Where |
|------|-------|
| **API** (node) | http://localhost:8081 — `GET /health`, `POST /waitlist`, `POST /client-error` |
| **Mailpit** | http://localhost:8025 — welcome emails land here (no real send) |
| **Dozzle** | http://localhost:8090 — live logs of every container |
| **Waitlist data** | `./data/waitlist/local/<hash>.json` — one file per signup |

Try it:
```bash
curl -X POST http://localhost:8081/waitlist -H 'content-type: application/json' \
  -d '{"email":"me@example.com","source":"sosed.place-landing","lang":"ru","mode":"dark"}'
```
→ a JSON file appears in `./data/…`, and the welcome email shows up in Mailpit.

Storage is `fs` (a mounted dir) and mail is `smtp` → Mailpit, so nothing leaves
your machine. Tear down with `docker compose down` (add `-v` to drop volumes).
