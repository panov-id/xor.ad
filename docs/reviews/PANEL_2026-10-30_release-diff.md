# Review panel 2026-10-30: release/1.0.0 uncommitted diff

Subject: `git diff` + untracked files on release/1.0.0 before the /commit of 30.10, except the design archives
(docs/newdesign3/, docs/newdesign4/ zips and kit). 90 tracked files changed, 4635+/1289-, plus 39 new files.

Lenses (4, in parallel, read-only):

| Lens | Model | Files read | Critical | Important | Minor |
|---|---|---|---|---|---|
| Security | fable | 16+ | 0 | 1 | 12 |
| Correctness, relay node | opus | 9 | 0 | 1 | 6 |
| Correctness, app | opus | 8 + grep | 0 | 0 | 4 |
| Tests and tooling | sonnet | 24 | 0 | 2 | 4 |

Not read by any lens in full: most screen .tsx diffs (cabinet/*, Chat.tsx, Composer.tsx, Feed.tsx, boards-poker.tsx,
EntryScene.tsx, splash-logic.ts), docs/MAP*.md, docs/map.edges, app/tokens/kit.css, nd4.css.

## Findings and what was done

1. **Important, defect (security).** `relay/node/src/lib/feed_limits.ts`: a `found` held no slot, so lost → found →
   lost … kept up to ~96 founds a day in the feed beside the four phrases, bound only by PUBLISH_PER_HOUR.
   Fixed: `LOST_SLOT` counts `kind IN ('lost','found')`; the test "a lost marked found … keeps the lost slot" in
   relay/node/test/feed_publish.test.ts asserts 409. Verified: `--filter lost` 9/9 + 1/1 green; with the old
   condition the test went red ("a found freed the lost slot"), restored.
2. **Important (tests).** `scripts/flow/crowd-plan.test.mjs` red 3 of 27, run by nothing. Fixed the four stale
   pins (Table.tsx `</section>`, wide.css `.tabbar[data-rail-only]` twice, tab() elementFromPoint, boards-sea
   `placingStore(randomFleet)` — the fourth hid behind the first). Wired into scripts/run-app-unit-tests.sh with
   nd4-inventory.test.py and nd4-tokens.test.py. Verified: 27/27; wide.css rule broken → 1 fail, restored;
   inventory count broken → script rc=1, restored.
3. **Minor → fixed (security, migration).** `relay/node/db/089_feed_kind.sql`: inline CHECKs scan feed_messages under
   ACCESS EXCLUSIVE; the file runs in one transaction (tools/migrate_db.ts:81). Now `ADD CONSTRAINT … NOT VALID`,
   no VALIDATE: old rows hold the default. Not exercised on a live-sized table.
4. **Minor, defect (comment).** `relay/node/src/lib/feed_verdict.ts:168`: comment said an unnamed kind fails the
   CHECK; the CASE ELSE gives it a phrase's span. Comment fixed.
5. Open, minor: concurrent /extend reports count 2 with the 409 (feed.ts:837-846); quota in routes/identity.ts:325
   counts a lost as a phrase slot; moderation gets `kind: "phrase"` for a lost; extend/found skip legalGate and
   stillHere; app ignores `notice` on cards; Gate.tsx focus after paste; feed-logic `ownLive` unit of expires_at
   not checked; poker backs over hole cards; nd4-fonts.gen.css not regenerated (no fontTools); two PANEL files of
   27.10 and 30.10 lost-spots without RU/EN halves.
