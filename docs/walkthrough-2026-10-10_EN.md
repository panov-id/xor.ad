# Product walkthrough by hand, 10.10.2026

Goal: before the owner tests the product locally himself, Claude walks through it and records the experience.
Branch `day59` @ `c2bde225` plus the uncommitted edits of this session.

## How to start

```bash
scripts/up-local.sh sosed      # page http://localhost:4173, Mailpit http://localhost:62125
scripts/up-local.sh neighbro   # page http://localhost:4183, Mailpit http://localhost:62135
scripts/up-local.sh down sosed # stop and wipe data
```

The stand is `docker-compose.web.yml` under a separate project name (`xor-local-<brand>`). It contains the database, migrations, seed data, a node built from the current sources, a model stub, and Mailpit. The model stub rejects only links, messengers, and contacts; everything else is published. The real model is measured in `relay/moderator`; it is not part of the stand.

## What I used

Headless Chromium in a container, scenario `textwalk.mjs`: two phones 393×851, locale ru-RU, without stand headers (both from one address, like two neighbors on one Wi-Fi). At each step the following is written as text: screen id, visible text, controls with their accessible names, node responses 400 and above, page errors, step time. No screenshots (owner, 10.10). The first runs with screenshots were deleted. Chrome is not used.

## What passed

Both brands, the same way: splash → «Кто вы» («Who are you») (name, age, consent) → PIN → paper code (entering groups 2 and 4) → empty feed → phrase published → neighbor's phrase in the feed → card → like → for the second person «Мэтч!» («Match!») → inbox → match (both phrases, «Ждём ответа» («Waiting for reply»)) → second person's consent → chat opened, «на связи» («online») → reply there → answer back.
sosed — 7.7 s, neighbro — 8.4 s. Not a single node response ≥ 400, not a single page error.

Checked by machine in the same session:
- `scripts/check-all.sh`: 17 gates. Red `check-db-suites` (two database tests were silently skipped without a database) fixed; the gates are green.
- `scripts/run-relay-database-tests.sh`: rc=0.
- Table and game, transfer to another device, recovery, complaints, moderation — paths in `scripts/run-e2e-paths.sh` (result below). These paths were NOT CHECKED by hand.

## Where I stumbled

| # | Where | What is visible | Kind |
|---|---|---|---|
| 1 | Feed, bottom (`web/src/screens/Feed.tsx:158`) | The line «ключи: печать хранилища сходится» («keys: storage seal matches») is overlapped by the round «написать» («write») button: it reads «ключи: печать храни… дится». Both brands. | layout defect |
| 2 | Same place | The line itself is a service line about the storage seal. It says nothing to a person. Whether to keep it on the feed is for the owner to decide. | question for owner |
| 3 | «Кто вы» («Who are you»), links to documents | Links are blue, browser default colors, not the theme's | visual defect |
| 4 | Browser tab | Title `xor.ad` on both showcases (`web/index.html:8`), not the brand name | visual defect |
| 5 | Card and match | Under the phrase and in the card header stands «один» («alone») — this is the mode (`web.mode.alone`). Without a hint, it reads as a person's name. | note |

The second pass, as text, with wider coverage (input errors, a phrase with a contact, table and game, «я» («me»), recovery, English) added the list `П1`–`П7` to `docs/plan-goal-2026-10-10_RU.md`: «dots» on the table, «ru» on the card, `lang="ru"` with the English interface, language names mixed, the stub reason in English, «сдаться» («give up») before the game.
The text scenario did not finish the game: Anya's move was not registered within 15 s. Whose failure this is, the scenario's or the product's, is NOT VERIFIED: the e2e `two-people` passes this same game.

Item 2 — for the owner. Item 5 — by design (mode «один / компания» («alone / with company»)), recorded as an impression.

## What was fixed

Measured with headless Chromium in a container, element boxes on the sosed feed (`scratchpad/probe/feedbox.mjs`).

1. The feed's bottom padding under the floating button was meant to be 152px (`web/src/screens/feed.css:58`). But the rule `.tabbed .screen { padding-bottom: 96px }` from `web/src/styles.css`, of the same specificity, is loaded later and won. The feed rule became `.tabbed .screen[data-screen="feed"]`. Before: padding 96px, caption 735–755, button 723–775 — overlap. After: padding 152px, caption 679–699, button 723–775.
3. Links are given the theme color: `a { color: var(--accent-text); }` in `web/src/styles.css`. Measured: `rgb(152, 60, 34)` instead of the browser's blue.
4. The tab title is the showcase name. The `xor-brand` plugin in `web/vite.config.ts` replaces `<title>`. Measured: `sosed.place`.

After the edits, green: `check-web-tokens`, `check-web-types` (0 errors).

Noticed along the way, did not touch: the «написать» («write») button, per the feed style, is a pill 327×52 (kit sheet 03), but on the screen it is 64px wide. Another rule overrides the width. Recorded; it does not block the goal.

## Final walkthrough of wave `К` (`К10`), 10.10.2026

day59 after merging `К1`–`К9`, `К6б` (full e2e on this same tree: sosed 118/118 and neighbro 120/120, two runs each).
`scripts/up-local.sh` with a clean database, `WALK_STABLE=1 scripts/textwalk/run.sh`, both brands:

| | sosed | neighbro |
|---|---|---|
| steps | 51 | 51 |
| failed steps | 0 | 0 |
| controls without a name | 0 | 0 |
| screens without `data-screen` | 0 | 0 |
| node responses ≥ 400 | 3 — all intended: phrase with a contact 422, name with a contact 422, wrong code 404 | the same 3 |
| page errors | 0 | 0 |
| raw elements in screens (`check-web-kit`) | 0 of 30 files | — |

What got better since the first pass: registration on a node refusal says what happened and what to do; age 12 —
the reason is next to the button; languages by self-name, `lang` changes with the interface; dates in words; on the table «точки» («dots»), no
«сдаться» («give up») before the game, the score cells have an owner; the moderation refusal reason is in interface words, without the model's text;
the service line about keys is gone; on neighbro a like is sent after 5 s with an undo.

Still embarrassing (as text, from the walkthrough output) — `П20`–`П28` in `docs/plan-goal-2026-10-10_RU.md`. Result: **NOT READY**
for the owner's testing until they are closed and the next walkthrough confirms it.
