# Panel 05.11.2026: tree with screens 110, 111, 45

Lens coverage: 37 of 1232 files. 997 are archive material under `docs/newdesign3` and `docs/newdesign4`, 198 no lens read: 91 in `app/src/nd4` (mostly generated, sampled), 25 in `app/src/screens`, 13 in `app/src/shell`, 4 in `relay/node/test`, the rest scripts and legal files. Consumer lens ran. Nothing was fixed in this pass.

Machine checks: unit, `check-app`, `nd4-extract --check` all rc 0. Crowd, talk block: 63 of 63 with 4 people.

## Held by a second check (verifier)

| # | Level | Where | Finding | Checked by |
|---|---|---|---|---|
| 1 | important | `app/src/shell/App.tsx:250,321` | `beside`, `besideMatch` survive closing the identity: a new seat at 1440 opens the old person's talk | Playwright, stubbed node |
| 2 | important | `app/src/screens/Offer.tsx:53`, `app/tokens/nd4-kit.css:623,627,646` | At 1440 the offer exit is a window overlay from x=264, not in its 480 px pane | Playwright, measured |
| 3 | important | `app/src/screens/tables/Tables.tsx:67,77` | On «Mine» chips are hidden, the game filter still applies: 1 of 2 own tables shown | Playwright, stubbed node |
| 4 | important | `relay/node/src/main.ts:32`, `relay/node/src/lib/vault_share.ts:117` | Rekey to `k1:` has no way back: rollback to the previous tag refuses correct PINs; needs `VAULT_SHARE_KEY` | Code read, not run on a database |
| 5 | minor | `relay/node/src/routes/lost.ts:174` | `GET /feed/:id/seen` has no block check; gives dots only, needs the id | Code read |
| 6 | minor | `depth/web-platform/phrase.ts:37-48` | 409 `lost_wait` shows «Phrase not accepted (409)»; no face sends `kind:"lost"` yet, so unreachable today | Docker deno run |

## Refuted

`ownLive` counting a lost notice: the node counts a lost as a phrase too (`relay/node/src/lib/feed_limits.ts:68`), so client and node agree.

## Not given to a second check (NOT VERIFIED)

- `depth/core/me.ts:29,35`: phrase counts include lost and found rows.
- `routes/lost.ts:313`: `dailySalt` per process, limits reset on restart. `routes/lost.ts:358,405`: four /64 networks can fill a notice's anonymous marks in an hour.
- `routes/identity.ts:560,766,1292`: `recovery_auth_hash` stays a plain hash; recovery code entropy not checked.
- `scripts/flow/crowd.mjs` `matchShots`: takes the first offer, may be the wrong pair with more people; leaves no `summary.txt`.
- `app/src/nd4/screens/gen-clickable.test.ts:33`: a button without `onClick` passes; an empty set passes.
- `Feed.tsx` `openOwn`: list scroll lost. `Inbox.tsx`: `pickFirst` dead. `scripts/heavy-lock.sh:9`: a daemon inherits the lock.

## Seen on the shots (lead, not compared to the archive)

Screen 45: title «Ждём ответа» over «Предложение ушло». 1440: empty band on the right. 820: phone layout stretched.
