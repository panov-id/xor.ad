# Review panel, 03.11.2026: uncommitted tree

Read-only lenses; nothing here was run live by a lens. Pair: `PANEL_2026-11-03_tree_RU.md`.

## Coverage as read

- Consumer (sonnet): 13 of 13 diff files in relay, depth, openapi.
- Security (fable): 18 of about 50 code files. Not read: tests, app screens, css, scripts, docs.
- Correctness (sonnet): 28 of 57 files of the app. Not read: chat-logic.test.ts, composer-logic.test.ts, feed.test.ts, intro-look.test.ts, place-map.test.ts, tables.test.ts, screens.css, crowd-plan.test.mjs, crowd.sh, most of crowd.mjs, nd4/drawing.ts, nd4/texts.ts, texts.test.ts, wizard-*.json, villages-cy.json, ads.ts, ads.test.ts, chat-tablet.test.ts, nav-laptop.test.ts, feed-tile.test.ts.
- Work carried from the copy afterwards (confirm family, tour, lost.ts limit) was read by no lens.

## Findings after the second check (refuter: sonnet, reading only)

| Finding | Level | Second check |
|---|---|---|
| `relay/node/src/routes/lost.ts:359,376` anonymous mark: raw address bucket, no ceiling per notice, each call costs the model | medium | holds in part. Measured later: the raw address part is wrong, `relay/node/src/lib/rate_limit.ts:287` already folds an IPv6 caller to /64 (probe: 30 allowed, the 31st refused with the raw key). Real gap: no ceiling per notice |
| `app/src/shell/App.tsx:126,475` leaving the inbox drops read lines of kept talks | medium | holds, same design as the phone; unread lines are not lost; node resend not read |
| `app/src/screens/feed-logic.ts:146` `ownLive` ignores kind, 409 on like | medium | refuted: `feed_limits.ts:68` counts a live lost on purpose |

## Not sent to a second check

- `docs/api/openapi.yaml:208,815`: no `kind`, no `/l/{id}`, `/l/{id}/seen`, no 409 `until`, `live_lost`. Medium.
- `relay/node/src/lib/vault_share.ts:204`, `pin_attempts.ts:113`: rollback or mixed pool after k1 locks PINs. Low to medium.
- `app/src/screens/Chat.tsx:150`: a talk that ends while hidden leaves silently. Low to medium.
- `relay/node/src/routes/lost.ts:174-209` seen ignores blocks; `:413` sweep on the hot path. Low.
- `app/src/screens/feed-logic.ts:106-110` with `feed-card.tsx:289`: redirect host unverified. Low.
- `depth/ink/rooms.ts:58-61` min expires over lost rows. Low.
- `chat_state.ts` `setHidden` no `#alive` check, `#unseen` uncapped. Low.
- `MyPhrase.tsx:48-53` fade line freezes. `place-map.ts` `citiesOn` unbounded circles, not measured. `Place.tsx:159-161` "near" with distance 0. `Composer.tsx:132` refusal found by translated text. `Intro.tsx:367` Back on step 1 does nothing. All low.

## Round 2 (sonnet correctness, fable security; reading only, no second check)

Coverage: correctness about 20 of 191 code files; security 13 read and about 162 grep-swept of 191, about 23 not read.

- `app/src/shell/Tour.tsx:62` focus lost after Next, Escape dead. Medium. Fixed; regex test.
- `app/src/screens/Unlock.tsx:66` forget failure leaves a dead button. Low to medium. Fixed; no test.
- `scripts/design/measure-app-overlap.mjs:562` unreachable screens do not fail the run. Low to medium. Open.
- `app/src/shell/Tour` state per hidden talk can show the tour again; tour may stack over a menu. Not proved.
- `relay/node/src/routes/lost.ts:391-436` the ceiling is not in the INSERT, a race overshoots slightly. Low. Open.
- `relay/node/test/lost.test.ts:180` the name claims "before the model", nothing asserts it. Low. Open.
- Generated nd4 files, generator, scripts: no security defect found.
