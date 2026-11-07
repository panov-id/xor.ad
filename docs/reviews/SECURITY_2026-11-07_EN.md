# Security after the design, 07.11.2026

A panel of five lenses and two refuters; raw material in `docs/reviews/PANEL_2026-11-07_security.md`.
Lens coverage: 2762 of 3887 files. Not read: relay 253, clients 445, scripts 249, depth 118, deleted 60.

## Closed

| # | Hole | Where closed | Proof |
|---|------|--------------|-------|
| 1 | On the public box (p1) the wizard exposed `logs-` (Dozzle) | `relay/wizard/wizard.py` `is_public_box`, `aux_hosts`; `relay/README.md` | `relay/wizard/test_wizard.py`: green; red under break `['logs-p1.z.example']`; live 07.11: before the rollout `https://logs-p1.relay.panov.id/` answered 200, after the wizard rolled p1 a TLS refusal, code 000 |
| 2 | A storefront could be framed by another page | no edit needed: `sosed.place/landing/security-headers.mjs:123,146` and `neighbro.place` already send `frame-ancestors 'none'` and `X-Frame-Options DENY` | code read; live URL NOT VERIFIED |
| 3 | The PIN proof was stored unkeyed when the flag was off: a DB dump plus a device tries all 10⁶ PINs offline | `relay/node/src/lib/vault_share.ts`: always sealed `k1:` under `VAULT_SHARE_KEY`, no flag; `docs/protocol_*.md` | `pin_limit_rollback.test.ts`: 2 of 2; red under break "the proof was stored without the key" |
| 4 | A replayed signed "not now" after its undo declined again | `relay/node/src/routes/matches.ts` (nonce), `relay/node/db/092_nonce_decline.sql`, `depth/core/client.ts`, `docs/protocol_*.md` §2 | `feed_publish.test.ts`: green; red under break "the replayed decline declined again after its undo" |
| 5 | A replayed undo of "not now" took a new decline back (found by the fable review) | `relay/node/src/routes/matches.ts` (nonce), `relay/node/db/093_nonce_undo.sql`, `depth/core/client.ts` | `feed_publish.test.ts`: green; red under break "the replayed undo took the new decline back" |
| 6 | Without `VAULT_SHARE_KEY` or on a failed rekey the node started and old PIN proofs stayed plain | `relay/node/src/lib/vault_share.ts` `vaultAtStart`, `relay/node/src/main.ts`: a node with a database does not start | `pin_limit_rollback.test.ts`: green; red under break "the start went on without the key" |
| 7 | The vault key could not be changed without losing every local history and PIN of the environment | `vault_share.ts`, `cursor.ts`, `pin_attempts.ts`: two keys (`VAULT_SHARE_KEY`, `VAULT_SHARE_KEY_PREVIOUS`), shares resealed at the start, a PIN proof moves at the right PIN; the wizard passes the old key; `relay/wizard/fill-secrets.sh` fills empty keys printing nothing | `pin_limit_rollback.test.ts`: green; red under break "no share was resealed under the new key"; wizard 70 of 70; filler 6 of 6 |

Full node runs: database 688 passed, 0 failed; lint and unit 329 passed. App: 476 of 476, screen map rebuilt.

## Cost

- A box without `VAULT_SHARE_KEY` now does not come up at all (the price of row 6). Every stand that runs the node sets the key: `docker-compose.web.yml:108`, `relay/local/docker-compose.yml:38`, the depth scripts.
- Rolling the node back to an old tag refuses the right PIN for `k1:` rows.
- An old client without a nonce gets 400 on "not now". The `depth/core` client is updated; `depth` tests NOT RUN.

## Open (not fixed, needs the owner's word)

- The node uses a DB superuser.
- Images on `latest`, versions not pinned.
- No container memory limits.
- Local stand ports open on 0.0.0.0.
- `client_ip.ts:560` compares the token in non-constant time.
- Empty `ALLOWED_ORIGINS` admits any origin.
- Telegram mode is set by a URL fragment.
- The panel takes `?token=` in the URL.
- Message replay after a reload (`seal.ts:290`).
- Step 7: one GET to `logs-p1` on the live server to confirm the host is closed, waits for a separate word.

- A suspended venue's address HMAC is not moved by a rotation: once the old key is gone such an address is not recognised (`lib/advertiser_sweeper.ts`).

## On the way

- `depth/web-platform/chat/chat_state.test.ts`: two tests failed on HEAD too (3 of 3 runs): the stand-in `keys.open` timer outlived the test. The test now waits for the opening; 5 of 5 green, "Leaks detected" under break.

## Encryption

WebCrypto: AES-256-GCM, HKDF-SHA256, ECDSA and ECDH P-256. PIN: argon2id from hash-wasm 4.12.0 (64 MiB, t=3, p=1). No Redis: limits in memory, queue in Postgres.
