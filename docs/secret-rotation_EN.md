# Secret rotation

A rotation nobody has ever rehearsed does not happen when it is needed. This is
what gets rotated, with what, and how often. The document is deliberately
short: a long procedure is not followed.

## What exists

| Secret | Where it lives | What a leak means |
|---|---|---|
| `ORIGIN_TOKEN` | a Bunny edge rule + `caddy.env` on the nodes | the lock is bypassed: the node can be reached around the delivery network |
| Storefront API keys | in the storefront build (public by design) + the `api_keys` table | someone else's site can send signups and reports in our name |
| `GITHUB_TOKEN` | `deploy/.env.deploy` on the developer's machine | triggering deploys, publishing releases, access to all three repositories |
| `BUNNY_API_KEY` | the same file | control of zones, DNS and storage |
| The Resend key | node secrets | sending mail from our domains |
| The `deploy-user` SSH key | the developer's machine | access to the pool's nodes |

## How often

- **Once a year** — a planned rotation of the whole list.
- **Immediately** — when a device leaves one's control, on any suspicion of a
  leak, or when who has access changes.
- `GITHUB_TOKEN` and `BUNNY_API_KEY` sit in plaintext on disk: a deliberate
  trade for simple deploys, and the reason their interval is shorter — **every
  six months**.

## How

Every secret rotates **with an overlap**: the new one starts working first, the
old one is revoked after. Otherwise rotation means downtime.

1. `ORIGIN_TOKEN` — add the new one to `caddy.env` as a second accepted value,
   switch the edge rule, confirm traffic flows, drop the old one.
2. Storefront API keys — issue a new row in `api_keys`, deploy the storefront,
   mark the old one revoked a day later.
3. `GITHUB_TOKEN` — issue a new one with the same scopes, replace it in
   `.env.deploy`, revoke the old one in GitHub's interface.
4. `BUNNY_API_KEY` — replace it in `.env.deploy`, check with any reading script
   from `deploy/`, revoke the old one.
5. Resend and SSH — per the provider's instructions; for SSH the new key goes
   into `authorized_keys` before the old one is removed.

## Open

- Rotation is neither automated nor self-reminding: there is no calendar entry
  and no CI job. For now it is a manual procedure that depends on memory.
- There is no check that a secret is genuinely unused elsewhere — revocation
  trusts the list above, which therefore has to be kept complete.
