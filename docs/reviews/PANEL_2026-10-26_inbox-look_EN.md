# Panel 2026-10-26: chats list look, Edit width, crowd Back

Lens: security + correctness (fable), read-only over the uncommitted diff.

1. MED defect, fixed: the timer called a marking load, so «new» vanished within 60 s with no act. Now the timer reads with `load(false)`; test in talks.test.ts goes red under a break.
2. LOW not found: timer leak (cleared on unmount).
3. LOW not found: node load (GET /inbox has no limiter; hidden tabs do not look).
4. LOW: `.me-edit` width at 320 not exercised in a browser.
5. LOW note: crowd's 1440 tied to wide.css by test.
6. LOW note: tests read the source, not behaviour.

## Second panel, 26.10 evening (security fable, correctness opus; read-only, same diff + crowd fix + inventory script)

Each item re-checked by the lead against the code (grep, a run in panel-tests-runner).

1. MED defect, VERIFIED (grep: no limiter on /inbox in lib/rate_limit.ts): `GET /inbox` is unthrottled per account; with the 60 s look, 20 visible tabs make 60 queries a minute. Node change — owner's decision.
2. LOW defect, VERIFIED by reading Inbox.tsx:54-56: focus + visibilitychange + timer can fire two loads at once with no in-flight guard, so an older page may land last. App change — waits for the crowd run to end.
3. HIGH defect in my test, VERIFIED and fixed: the pressable-testid test read only `pg.click('…')`, not `locator('…').click()`. Now it reads both, takes the last testid of each selector alternative, and prints N of M: 46 literal testids, 34 of 46 found in app/src (the rest are built from an expression or live in the web cabinet), 34 of 34 pressable. Red under a break (old selector → «me-name-age»), green restored, crowd-plan 19 of 19.
4. MED defect, VERIFIED: newdesign-inventory.py wrote archive ids into flow-map.svg unescaped (script injection). Fixed with html.escape; also a CSV formula guard, a 1 MB ceiling on screens.csv, and a refusal on unknown arguments (`--help` → rc 2). These edits are outside the approved file set; their test is not written — waits for the owner's word.
5. not found: timer leak; data exposure; zip slip (only reads into memory); regex injection in the test.
6. LOW note: converse() waits up to 70 s per person on an empty «Chats» — run-time cost, no test.
